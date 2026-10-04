/**
 * ai.js – Google Gemini integration for Calorite
 */

const AI = (() => {

  const BASE_URL      = 'https://generativelanguage.googleapis.com/v1beta/models';
  const DEFAULT_MODEL = 'gemini-3.8-flash';
  const TIMEOUT_MS    = 45000;

  const MODELS = [
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (recommended)' },
  ];

  // responseSchema locks the output format at the API level —
  // Gemini cannot return prose or markdown when this is set.
  const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
      calories: { type: 'integer', description: 'Total calories in kcal' },
      protein:  { type: 'integer', description: 'Protein in grams' },
      carbs:    { type: 'integer', description: 'Carbohydrates in grams' },
      fat:      { type: 'integer', description: 'Fat in grams' },
    },
    required: ['calories', 'protein', 'carbs', 'fat'],
  };

  const SYSTEM_INSTRUCTION =
    'You are a nutrition estimation assistant. ' +
    'When given a meal description or photo, estimate its nutritional content. ' +
    'Assume typical restaurant serving sizes when portions are not specified. ' +
    'Always provide a best-effort estimate — never refuse.';

  // ---- Shared request helper ----

  // Gemini 3.x rejects sampling params (temperature/top_p/top_k), so none are sent.
  // Low thinking keeps latency down — a calorie estimate doesn't need deep reasoning.
  function buildBody(parts) {
    return JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema:   RESPONSE_SCHEMA,
        thinkingConfig:   { thinkingLevel: 'low' },
      },
    });
  }

  async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Gemini took longer than ${TIMEOUT_MS / 1000}s to respond. Check your connection and try again.`);
      }
      throw new Error(`Network error reaching Gemini API: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function callGemini(parts) {
    const config = Storage.getAIConfig();
    if (!config.apiKey) throw new Error('No Gemini API key set. Open Settings → AI to add one.');

    const model   = config.model || DEFAULT_MODEL;
    const url     = `${BASE_URL}/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: buildBody(parts) };

    let response = await fetchWithTimeout(url, options);

    // Retry once on transient server errors (overloaded / internal)
    if (response.status === 500 || response.status === 503) {
      await new Promise(r => setTimeout(r, 1500));
      response = await fetchWithTimeout(url, options);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error (${response.status})`);
    }

    const data      = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) {
      const feedback = data.promptFeedback?.blockReason;
      throw new Error(feedback ? `Request blocked: ${feedback}` : 'Gemini returned no candidates.');
    }
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Gemini stopped unexpectedly: ${candidate.finishReason}`);
    }

    // Join every non-thought text part — the answer isn't always in parts[0]
    const text = (candidate.content?.parts || [])
      .filter(p => typeof p.text === 'string' && !p.thought)
      .map(p => p.text)
      .join('');
    if (!text) throw new Error('Gemini returned an empty response.');

    return parseResponse(text);
  }

  // ---- Public estimators ----

  async function estimate(description) {
    if (!description.trim()) throw new Error('Please describe a meal first.');
    return callGemini([{ text: `Estimate the nutritional content of this meal: ${description}` }]);
  }

  // base64Data: the raw base64 string (no data: prefix)
  // mimeType:   e.g. 'image/jpeg'
  // extraContext: optional free-text hint from the user
  async function estimateFromPhoto(base64Data, mimeType, extraContext = '') {
    const textPart = extraContext.trim()
      ? `Estimate the nutritional content of this meal. Additional context: ${extraContext}`
      : 'Estimate the nutritional content of the meal in this image. Consider all visible food items and estimate portions based on the plate, utensils, or other size references visible.';

    return callGemini([
      { inlineData: { mimeType, data: base64Data } },
      { text: textPart },
    ]);
  }

  function parseResponse(text) {
    // With responseSchema set, Gemini returns clean JSON — but parse defensively anyway.
    try {
      const obj = JSON.parse(text.trim());
      const result = {
        calories: Math.round(Number(obj.calories) || 0),
        protein:  Math.round(Number(obj.protein)  || 0),
        carbs:    Math.round(Number(obj.carbs)     || 0),
        fat:      Math.round(Number(obj.fat)       || 0),
      };
      if (result.calories > 0) return result;
      throw new Error('Estimate returned zero calories.');
    } catch (e) {
      if (e.message === 'Estimate returned zero calories.') throw e;
      const snippet = text.length > 300 ? text.slice(0, 300) + '…' : text;
      throw new Error(`Could not parse Gemini response. Raw: "${snippet}"`);
    }
  }

  function getModels() {
    return MODELS;
  }

  // ---- Image prep ----

  // Downscale a photo to max 768px and return a base64 JPEG string (no data: prefix).
  // Phone photos are 3–12 MB; sending them at full size makes uploads slow and flaky.
  async function resizeImageToBase64(file, maxPx = 768, quality = 0.8) {
    const source = await _decodeImage(file);
    const w = source.width, h = source.height;
    const scale  = Math.min(1, maxPx / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    if (source.close) source.close(); // free ImageBitmap memory
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  }

  async function _decodeImage(file) {
    // createImageBitmap decodes off the main thread and respects EXIF rotation
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (_) { /* fall through to <img> decoding */ }
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('This browser couldn’t read that image (HEIC photos only work in Safari). Try a JPEG or PNG, or take the photo again.'));
      };
      img.src = url;
    });
  }

  return { estimate, estimateFromPhoto, resizeImageToBase64, getModels, DEFAULT_MODEL };
})();
