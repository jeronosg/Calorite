/**
 * barcode.js – Barcode scanning and Open Food Facts lookup for Calorite
 *
 * Uses the native BarcodeDetector API where available.
 * Falls back to manual barcode entry on unsupported browsers.
 */

const BarcodeScanner = (() => {

  let _stream   = null;
  let _rafId    = null;
  let _detector = null;
  let _scanning = false;

  // Product barcodes are in these formats
  const BARCODE_FORMATS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e',
    'code_128', 'code_39', 'itf',
  ];

  function isSupported() {
    return typeof BarcodeDetector !== 'undefined';
  }

  // Start the camera stream and attach it to a <video> element
  async function startCamera(videoEl) {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    });
    videoEl.srcObject = _stream;
    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = resolve;
      videoEl.onerror = reject;
    });
    videoEl.play();
  }

  // Stop camera and cancel any pending scan loop
  function stopCamera() {
    _scanning = false;
    if (_rafId)  { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
  }

  // Repeatedly grab frames from the video and pass them to BarcodeDetector.
  // Calls onDetect(barcodeString) once when a barcode is found.
  async function startScanning(videoEl, canvasEl, onDetect) {
    if (!isSupported()) return;
    _scanning = true;
    _detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
    const ctx = canvasEl.getContext('2d', { willReadFrequently: true });

    const tick = async () => {
      if (!_scanning) return;
      if (videoEl.readyState >= videoEl.HAVE_ENOUGH_DATA && videoEl.videoWidth > 0) {
        canvasEl.width  = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0);
        try {
          const results = await _detector.detect(canvasEl);
          if (results.length > 0) {
            _scanning = false;
            onDetect(results[0].rawValue);
            return;
          }
        } catch { /* keep trying */ }
      }
      _rafId = requestAnimationFrame(tick);
    };

    _rafId = requestAnimationFrame(tick);
  }

  // Look up a barcode on Open Food Facts (no API key required)
  async function lookupBarcode(barcode) {
    const fields = 'product_name,generic_name,serving_size,serving_quantity,nutriments';
    const url    = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=${fields}`;

    let res;
    try {
      res = await fetch(url);
    } catch {
      throw new Error('Could not reach Open Food Facts. Check your connection.');
    }

    if (!res.ok) throw new Error(`Open Food Facts error (${res.status}).`);

    const data = await res.json();
    if (data.status === 0 || !data.product) {
      throw new Error('Product not found. Try entering the barcode manually.');
    }

    const p = data.product;
    const n = p.nutriments || {};

    // Prefer per-serving values; fall back to per-100g
    const cal  = n['energy-kcal_serving']      ?? n['energy-kcal_100g']      ?? 0;
    const prot = n['proteins_serving']          ?? n['proteins_100g']         ?? 0;
    const carb = n['carbohydrates_serving']     ?? n['carbohydrates_100g']    ?? 0;
    const fat  = n['fat_serving']               ?? n['fat_100g']              ?? 0;

    const name = (p.product_name || p.generic_name || '').trim() || 'Unknown Product';

    return {
      name,
      servingSize: p.serving_size || null,
      calories:   Math.round(cal),
      protein:    Math.round(prot),
      carbs:      Math.round(carb),
      fat:        Math.round(fat),
    };
  }

  return { isSupported, startCamera, stopCamera, startScanning, lookupBarcode };
})();
