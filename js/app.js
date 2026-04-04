/**
 * app.js – Main Calorite application logic
 */

(() => {
  // ---- State ----
  let currentDate = new Date();
  let editingMealId = null;

  // ---- Helpers ----
  const $ = id => document.getElementById(id);
  const dateStr = () => Storage.dateKey(currentDate);

  function fmt(n, unit = '') {
    return Math.round(n) + unit;
  }

  function clamp(val, max) {
    return Math.min(100, max > 0 ? Math.round(val / max * 100) : 0);
  }

  // ---- Toast ----
  let toastTimer;
  function showToast(msg, type = '') {
    const el = $('toast');
    el.textContent = msg;
    el.className = `toast${type ? ' ' + type : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  // ---- Modal helpers ----
  function openModal(id)  { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // ---- Add Meal dropdown ----
  const _addDropdown = $('add-meal-dropdown');
  if ($('btn-add-toggle') && _addDropdown) {
    $('btn-add-toggle').addEventListener('click', e => {
      e.stopPropagation();
      _addDropdown.style.display = _addDropdown.style.display === 'none' ? '' : 'none';
    });
    _addDropdown.addEventListener('click', () => {
      _addDropdown.style.display = 'none';
    });
    document.addEventListener('click', () => {
      _addDropdown.style.display = 'none';
    });
  }

  // ---- Date navigation ----
  function formatDateLabel(date) {
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    const tomorrow  = new Date(); tomorrow.setDate(today.getDate() + 1);

    const same = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth()    === b.getMonth()    &&
      a.getDate()     === b.getDate();

    if (same(date, today))     return 'Today';
    if (same(date, yesterday)) return 'Yesterday';
    if (same(date, tomorrow))  return 'Tomorrow';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function updateDateDisplay() {
    $('btn-today').textContent = formatDateLabel(currentDate);
  }

  $('btn-prev-day').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 1);
    updateDateDisplay();
    render();
  });

  $('btn-next-day').addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 1);
    updateDateDisplay();
    render();
  });

  $('btn-today').addEventListener('click', () => {
    currentDate = new Date();
    updateDateDisplay();
    render();
  });

  // ---- Summary cards ----
  function renderSummary() {
    const totals = Storage.getDayTotals(dateStr());
    const goals  = Storage.getGoals();

    $('cal-consumed').textContent  = fmt(totals.calories);
    $('prot-consumed').textContent = fmt(totals.protein, 'g');
    $('carb-consumed').textContent = fmt(totals.carbs, 'g');
    $('fat-consumed').textContent  = fmt(totals.fat, 'g');

    $('cal-goal-label').textContent  = `/ ${goals.calories} kcal`;
    $('prot-goal-label').textContent = `/ ${goals.protein}g`;
    $('carb-goal-label').textContent = `/ ${goals.carbs}g`;
    $('fat-goal-label').textContent  = `/ ${goals.fat}g`;
    $('water-goal-label').textContent = `/ ${goals.water} glasses`;

    $('cal-bar').style.width  = clamp(totals.calories, goals.calories)  + '%';
    $('prot-bar').style.width = clamp(totals.protein,  goals.protein)   + '%';
    $('carb-bar').style.width = clamp(totals.carbs,    goals.carbs)     + '%';
    $('fat-bar').style.width  = clamp(totals.fat,      goals.fat)       + '%';

    // Over-goal: change bar colour
    if (totals.calories > goals.calories) {
      $('cal-bar').style.background = '#f43f5e';
    } else {
      $('cal-bar').style.background = '';
    }

    renderWaterGlasses(totals.water, goals.water);
  }

  // ---- Water glasses ----
  function renderWaterGlasses(filled, total) {
    const container = $('water-glasses');
    container.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const g = document.createElement('div');
      g.className = 'glass' + (i < filled ? ' filled' : '');
      g.title = `${i + 1} glass${i ? 'es' : ''}`;
      g.addEventListener('click', () => {
        const newVal = i < filled ? i : i + 1; // click filled → remove last
        const newFilled = (i + 1 === filled) ? i : i + 1;
        Storage.setWater(dateStr(), newFilled);
        renderSummary();
      });
      container.appendChild(g);
    }
  }

  // ---- Meal list ----
  function renderMealList() {
    const { meals } = Storage.getDay(dateStr());
    const container = $('meal-list');

    if (meals.length === 0) {
      container.innerHTML = '<p class="empty-state">No meals logged yet. Add one above!</p>';
      return;
    }

    // Sort by time
    const sorted = [...meals].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

    container.innerHTML = sorted.map(m => `
      <div class="meal-item" data-id="${m.id}">
        <span class="meal-time">${m.time || '–'}</span>
        <div class="meal-info">
          <div class="meal-name" title="${escHtml(m.name)}">${escHtml(m.name)}${m.aiGenerated ? ' <span title="AI estimated" style="font-size:0.75em">✨</span>' : ''}</div>
          <div class="meal-macros">
            ${m.protein ? `<span class="mp">P ${fmt(m.protein)}g</span>` : ''}
            ${m.carbs   ? `<span class="mc">C ${fmt(m.carbs)}g</span>`   : ''}
            ${m.fat     ? `<span class="mf">F ${fmt(m.fat)}g</span>`     : ''}
            ${m.notes   ? `<span>${escHtml(m.notes)}</span>` : ''}
          </div>
        </div>
        <span class="meal-cal">${fmt(m.calories)} kcal</span>
        <div class="meal-actions">
          <button class="meal-edit-btn" data-id="${m.id}" title="Edit">&#9998;</button>
          <button class="meal-del-btn"  data-id="${m.id}" title="Delete">&#128465;</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.meal-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditMeal(btn.dataset.id));
    });
    container.querySelectorAll('.meal-del-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmDeleteMeal(btn.dataset.id));
    });
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // ---- Insights ----
  function renderInsights() {
    try {
      const weekly  = Storage.getWeekSummary(7);
      const goals   = Storage.getGoals();
      const streak  = Storage.getStreak();

      $('streak-value').textContent = streak;
      $('insight-streak-card').classList.toggle('streak-active', streak > 0);

      const activeDays = weekly.filter(function(d) { return d.totals.calories > 0; });
      if (activeDays.length === 0) {
        $('insight-avg-cal').textContent   = '–';
        $('insight-on-target').textContent = '–';
        $('insight-avg-prot').textContent  = '–';
        return;
      }

      var avgCal   = Math.round(activeDays.reduce(function(s, d) { return s + d.totals.calories; }, 0) / activeDays.length);
      var onTarget = weekly.filter(function(d) { return d.totals.calories > 0 && d.totals.calories <= goals.calories; }).length;
      var avgProt  = Math.round(activeDays.reduce(function(s, d) { return s + d.totals.protein; }, 0) / activeDays.length);

      $('insight-avg-cal').textContent   = avgCal;
      $('insight-on-target').textContent = onTarget + '/7';
      $('insight-avg-prot').textContent  = avgProt + 'g';
    } catch (e) {
      // Silently skip insights if anything goes wrong — never block meal list
    }
  }

  // ---- Full render ----
  function render() {
    renderSummary();
    renderInsights();
    renderMealList();
    renderCharts();
  }

  function renderCharts() {
    const goals   = Storage.getGoals();
    const totals  = Storage.getDayTotals(dateStr());
    const weekly  = Storage.getWeekSummary(7);
    Charts.renderWeekly('chart-weekly', weekly, goals.calories);
    Charts.renderMacros('chart-macros', totals);
  }

  // ---- Add / Edit Meal modal ----
  $('btn-add-manual').addEventListener('click', () => openAddMeal());

  function openAddMeal() {
    editingMealId = null;
    $('modal-meal-title').textContent = 'Add Meal';
    $('btn-save-meal').textContent = 'Save';
    $('form-meal').reset();
    // Default time to now
    const now = new Date();
    $('meal-time').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    openModal('modal-meal');
    setTimeout(() => $('meal-name').focus(), 50);
  }

  function openEditMeal(mealId) {
    const { meals } = Storage.getDay(dateStr());
    const meal = meals.find(m => m.id === mealId);
    if (!meal) return;

    editingMealId = mealId;
    $('modal-meal-title').textContent = 'Edit Meal';
    $('btn-save-meal').textContent = 'Update';
    $('meal-name').value  = meal.name;
    $('meal-cal').value   = meal.calories;
    $('meal-time').value  = meal.time || '';
    $('meal-prot').value  = meal.protein || '';
    $('meal-carb').value  = meal.carbs   || '';
    $('meal-fat').value   = meal.fat     || '';
    $('meal-notes').value = meal.notes   || '';
    openModal('modal-meal');
  }

  $('form-meal').addEventListener('submit', e => {
    e.preventDefault();
    const entry = {
      name:     $('meal-name').value.trim(),
      calories: parseFloat($('meal-cal').value)  || 0,
      time:     $('meal-time').value,
      protein:  parseFloat($('meal-prot').value) || 0,
      carbs:    parseFloat($('meal-carb').value) || 0,
      fat:      parseFloat($('meal-fat').value)  || 0,
      notes:    $('meal-notes').value.trim(),
    };

    if (editingMealId) {
      Storage.updateMeal(dateStr(), editingMealId, entry);
      showToast('Meal updated', 'success');
    } else {
      Storage.addMeal(dateStr(), entry);
      showToast('Meal added', 'success');
    }

    closeModal('modal-meal');
    render();
  });

  // ---- Delete meal ----
  function confirmDeleteMeal(mealId) {
    const { meals } = Storage.getDay(dateStr());
    const meal = meals.find(m => m.id === mealId);
    $('confirm-title').textContent = 'Delete meal?';
    $('confirm-message').textContent = `Remove "${meal?.name || 'this meal'}" from your log?`;
    openModal('modal-confirm');
    $('btn-confirm-yes').onclick = () => {
      Storage.deleteMeal(dateStr(), mealId);
      closeModal('modal-confirm');
      render();
      showToast('Meal deleted');
    };
  }

  // ---- AI Estimator modal ----
  $('btn-add-ai').addEventListener('click', openAIModal);

  function openAIModal() {
    const cfg    = Storage.getAIConfig();
    const hasKey = cfg.apiKey && cfg.apiKey.trim().length > 0;

    $('ai-setup-notice').classList.toggle('hidden', hasKey);
    $('ai-form-wrap').style.display = hasKey ? '' : 'none';
    $('ai-result').classList.add('hidden');
    $('ai-error').classList.add('hidden');
    $('btn-ai-add').classList.add('hidden');
    $('ai-meal-desc').value = '';
    openModal('modal-ai');
    if (hasKey) setTimeout(() => $('ai-meal-desc').focus(), 50);
  }

  $('link-open-settings').addEventListener('click', e => {
    e.preventDefault();
    closeModal('modal-ai');
    openModal('modal-settings');
    switchTab('tab-ai-config');
  });

  let lastAIResult = null;

  $('btn-ai-estimate').addEventListener('click', async () => {
    const desc = $('ai-meal-desc').value.trim();
    const btn  = $('btn-ai-estimate');

    $('ai-error').classList.add('hidden');
    $('ai-result').classList.add('hidden');
    $('btn-ai-add').classList.add('hidden');
    lastAIResult = null;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Estimating…';

    try {
      const result = await AI.estimate(desc);
      lastAIResult = result;

      $('ai-res-cal').textContent  = fmt(result.calories) + ' kcal';
      $('ai-res-prot').textContent = fmt(result.protein)  + 'g';
      $('ai-res-carb').textContent = fmt(result.carbs)    + 'g';
      $('ai-res-fat').textContent  = fmt(result.fat)      + 'g';

      $('ai-result').classList.remove('hidden');
      $('btn-ai-add').classList.remove('hidden');
    } catch (err) {
      $('ai-error').textContent = err.message;
      $('ai-error').classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '✨ Estimate';
    }
  });

  $('btn-ai-add').addEventListener('click', () => {
    if (!lastAIResult) return;
    const desc = $('ai-meal-desc').value.trim() || 'AI-estimated meal';
    const now  = new Date();

    Storage.addMeal(dateStr(), {
      name:        desc,
      calories:    lastAIResult.calories,
      protein:     lastAIResult.protein,
      carbs:       lastAIResult.carbs,
      fat:         lastAIResult.fat,
      time:        `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      aiGenerated: true,
    });

    closeModal('modal-ai');
    render();
    showToast('AI meal added ✨', 'success');
  });

  // ---- Settings modal ----
  $('btn-settings').addEventListener('click', () => {
    loadSettingsForm();
    openModal('modal-settings');
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-panel').forEach(p => {
      if (p.id === tabId) {
        p.classList.add('active');
        p.style.display = '';
      } else {
        p.classList.remove('active');
        p.style.display = 'none';
      }
    });
  }

  function loadSettingsForm() {
    const goals = Storage.getGoals();
    $('goal-cal').value   = goals.calories;
    $('goal-prot').value  = goals.protein;
    $('goal-carb').value  = goals.carbs;
    $('goal-fat').value   = goals.fat;
    $('goal-water').value = goals.water;

    const ai = Storage.getAIConfig();
    $('ai-model').value   = ai.model || 'gemini-3-flash-preview';
    $('ai-api-key').value = ai.apiKey || '';
  }

  // Goals form
  $('form-goals').addEventListener('submit', e => {
    e.preventDefault();
    Storage.saveGoals({
      calories: parseInt($('goal-cal').value)   || 2000,
      protein:  parseInt($('goal-prot').value)  || 150,
      carbs:    parseInt($('goal-carb').value)  || 250,
      fat:      parseInt($('goal-fat').value)   || 65,
      water:    parseInt($('goal-water').value) || 8,
    });
    closeModal('modal-settings');
    render();
    showToast('Goals saved', 'success');
  });

  // Toggle API key visibility
  $('btn-toggle-key').addEventListener('click', () => {
    const inp = $('ai-api-key');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  $('btn-clear-key').addEventListener('click', () => {
    $('ai-api-key').value = '';
  });

  // AI config form
  $('form-ai-config').addEventListener('submit', e => {
    e.preventDefault();
    Storage.saveAIConfig({
      model:  $('ai-model').value,
      apiKey: $('ai-api-key').value.trim(),
    });
    closeModal('modal-settings');
    showToast('AI settings saved', 'success');
  });

  // ---- Data management ----
  $('btn-export').addEventListener('click', () => {
    const json = Storage.exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `calorite-export-${Storage.dateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported', 'success');
  });

  $('input-import').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        Storage.importData(ev.target.result);
        render();
        showToast('Data imported successfully', 'success');
        closeModal('modal-settings');
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be re-imported
  });

  $('btn-erase').addEventListener('click', () => {
    $('confirm-title').textContent   = 'Erase all data?';
    $('confirm-message').textContent = 'This will permanently delete all meals, goals, and settings. This cannot be undone.';
    openModal('modal-confirm');
    $('btn-confirm-yes').onclick = () => {
      Storage.eraseAllData();
      closeModal('modal-confirm');
      closeModal('modal-settings');
      render();
      showToast('All data erased', 'error');
    };
  });

  // ---- Barcode scanner ----

  let _barcodeBaseNutrition = null; // nutrition for 1 serving from lookup

  function _showBarcodeResult(product) {
    _barcodeBaseNutrition = {
      name:    product.name,
      calories: product.calories,
      protein:  product.protein,
      carbs:    product.carbs,
      fat:      product.fat,
    };

    $('barcode-product-name').textContent = product.name;
    $('barcode-serving-size').textContent = product.servingSize
      ? `Per serving: ${product.servingSize}`
      : 'Values per serving';

    $('barcode-servings').value = '1';
    _updateBarcodeMacros(1);

    $('barcode-result').classList.remove('hidden');
    $('btn-barcode-add').classList.remove('hidden');
    $('barcode-error').classList.add('hidden');
  }

  function _updateBarcodeMacros(servings) {
    if (!_barcodeBaseNutrition) return;
    const s = Math.max(0.25, parseFloat(servings) || 1);
    $('bc-cal').textContent  = Math.round(_barcodeBaseNutrition.calories * s) + ' kcal';
    $('bc-prot').textContent = Math.round(_barcodeBaseNutrition.protein  * s) + 'g';
    $('bc-carb').textContent = Math.round(_barcodeBaseNutrition.carbs    * s) + 'g';
    $('bc-fat').textContent  = Math.round(_barcodeBaseNutrition.fat      * s) + 'g';
  }

  async function _runBarcodeLookup(barcode) {
    const errEl = $('barcode-error');
    errEl.classList.add('hidden');
    $('barcode-result').classList.add('hidden');
    $('btn-barcode-add').classList.add('hidden');
    _barcodeBaseNutrition = null;

    try {
      const product = await BarcodeScanner.lookupBarcode(barcode);
      _showBarcodeResult(product);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }

  if ($('btn-scan-barcode')) {
    $('btn-scan-barcode').addEventListener('click', () => {
      // Reset state
      $('barcode-result').classList.add('hidden');
      $('btn-barcode-add').classList.add('hidden');
      $('barcode-error').classList.add('hidden');
      $('barcode-input').value   = '';
      _barcodeBaseNutrition      = null;

      if (BarcodeScanner.isSupported()) {
        $('barcode-camera-wrap').style.display  = '';
        $('barcode-no-support').classList.add('hidden');

        openModal('modal-barcode');

        BarcodeScanner.startCamera($('barcode-video'))
          .then(() => BarcodeScanner.startScanning(
            $('barcode-video'),
            $('barcode-canvas'),
            barcode => {
              $('barcode-input').value = barcode;
              _runBarcodeLookup(barcode);
            }
          ))
          .catch(err => {
            $('barcode-camera-wrap').style.display = 'none';
            $('barcode-no-support').classList.remove('hidden');
            $('barcode-no-support').textContent =
              'Camera access denied or unavailable. Enter the barcode manually.';
          });
      } else {
        $('barcode-camera-wrap').style.display = 'none';
        $('barcode-no-support').classList.remove('hidden');
        openModal('modal-barcode');
      }
    });
  }

  // Stop camera whenever the barcode modal closes
  document.querySelectorAll('[data-close="modal-barcode"]').forEach(btn => {
    btn.addEventListener('click', () => BarcodeScanner.stopCamera());
  });
  if ($('modal-barcode')) {
    $('modal-barcode').addEventListener('click', e => {
      if (e.target === $('modal-barcode')) BarcodeScanner.stopCamera();
    });
  }

  if ($('btn-barcode-lookup')) {
    $('btn-barcode-lookup').addEventListener('click', () => {
      const code = $('barcode-input').value.trim();
      if (!code) return;
      _runBarcodeLookup(code);
    });
  }

  if ($('barcode-input')) {
    $('barcode-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const code = $('barcode-input').value.trim();
        if (code) _runBarcodeLookup(code);
      }
    });
  }

  if ($('barcode-servings')) {
    $('barcode-servings').addEventListener('input', e => {
      _updateBarcodeMacros(e.target.value);
    });
  }

  if ($('btn-barcode-add')) {
    $('btn-barcode-add').addEventListener('click', () => {
      if (!_barcodeBaseNutrition) return;
      const servings = Math.max(0.25, parseFloat($('barcode-servings').value) || 1);
      const now = new Date();
      Storage.addMeal(dateStr(), {
        name:     _barcodeBaseNutrition.name,
        calories: Math.round(_barcodeBaseNutrition.calories * servings),
        protein:  Math.round(_barcodeBaseNutrition.protein  * servings),
        carbs:    Math.round(_barcodeBaseNutrition.carbs    * servings),
        fat:      Math.round(_barcodeBaseNutrition.fat      * servings),
        time:     `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      });
      BarcodeScanner.stopCamera();
      closeModal('modal-barcode');
      render();
      showToast('Meal added from barcode', 'success');
    });
  }

  // ---- Photo estimation ----

  let _photoResult = null;
  let _photoFile   = null;

  function _resetPhotoModal() {
    _photoResult = null;
    _photoFile   = null;
    $('photo-file-input').value              = '';
    $('photo-desc').value                    = '';
    $('photo-drop-zone').style.display       = '';
    $('photo-preview-wrap').style.display    = 'none';
    $('photo-result').classList.add('hidden');
    $('photo-error').classList.add('hidden');
    $('btn-photo-add').style.display         = 'none';
    $('btn-photo-estimate').disabled         = true;
  }

  if ($('btn-add-photo')) {
    $('btn-add-photo').addEventListener('click', () => {
      _resetPhotoModal();
      openModal('modal-photo');
    });
  }

  if ($('photo-file-input')) {
    $('photo-file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      _photoFile = file;
      $('photo-preview').src                 = URL.createObjectURL(file);
      $('photo-drop-zone').style.display     = 'none';
      $('photo-preview-wrap').style.display  = '';
      $('photo-result').classList.add('hidden');
      $('photo-error').classList.add('hidden');
      $('btn-photo-add').style.display       = 'none';
      $('btn-photo-estimate').disabled       = false;
    });
  }

  if ($('btn-photo-retake')) {
    $('btn-photo-retake').addEventListener('click', () => {
      _photoFile = null;
      $('photo-file-input').value            = '';
      $('photo-preview-wrap').style.display  = 'none';
      $('photo-drop-zone').style.display     = '';
      $('btn-photo-estimate').disabled       = true;
      $('photo-result').classList.add('hidden');
      $('photo-error').classList.add('hidden');
      $('btn-photo-add').style.display       = 'none';
    });
  }

  if ($('btn-photo-estimate')) {
    $('btn-photo-estimate').addEventListener('click', async () => {
      if (!_photoFile) return;
      const btn = $('btn-photo-estimate');
      btn.disabled  = true;
      btn.innerHTML = '<span class="spinner"></span> Analysing\u2026';
      $('photo-error').classList.add('hidden');
      $('photo-result').classList.add('hidden');
      $('btn-photo-add').style.display = 'none';
      _photoResult = null;

      try {
        const base64 = await AI.resizeImageToBase64(_photoFile);
        const ctx    = $('photo-desc').value.trim();
        const result = await AI.estimateFromPhoto(base64, 'image/jpeg', ctx);
        _photoResult = result;

        $('photo-res-cal').textContent  = result.calories + ' kcal';
        $('photo-res-prot').textContent = result.protein  + 'g';
        $('photo-res-carb').textContent = result.carbs    + 'g';
        $('photo-res-fat').textContent  = result.fat      + 'g';
        $('photo-result').classList.remove('hidden');
        $('btn-photo-add').style.display = '';
      } catch (err) {
        $('photo-error').textContent = err.message;
        $('photo-error').classList.remove('hidden');
      } finally {
        btn.disabled  = false;
        btn.innerHTML = '&#10024; Estimate';
      }
    });
  }

  if ($('btn-photo-add')) {
    $('btn-photo-add').addEventListener('click', () => {
      if (!_photoResult) return;
      const now = new Date();
      Storage.addMeal(dateStr(), {
        name:        $('photo-desc').value.trim() || 'Photo meal',
        calories:    _photoResult.calories,
        protein:     _photoResult.protein,
        carbs:       _photoResult.carbs,
        fat:         _photoResult.fat,
        time:        `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
        aiGenerated: true,
      });
      closeModal('modal-photo');
      render();
      showToast('Photo meal added \u2728', 'success');
    });
  }

  // ---- Share via link ----

  let _pendingShare = null;

  function _showBanner(visible) {
    $('share-banner').style.display = visible ? 'flex' : 'none';
  }
  function _showUrlRow(visible) {
    $('share-url-row').style.display = visible ? 'flex' : 'none';
  }

  if ($('btn-share')) {
    $('btn-share').addEventListener('click', async () => {
      const btn = $('btn-share');
      btn.disabled = true;
      btn.textContent = 'Generating…';
      try {
        const url   = await Storage.generateShareURL();
        const input = $('share-url-input');
        input.value = url;
        _showUrlRow(true);
        input.select();
      } catch (err) {
        showToast('Could not generate link: ' + err.message, 'error');
      } finally {
        btn.disabled    = false;
        btn.textContent = 'Get Link';
      }
    });
  }

  if ($('btn-copy-share')) {
    $('btn-copy-share').addEventListener('click', () => {
      const input = $('share-url-input');
      input.select();
      navigator.clipboard.writeText(input.value)
        .then(() => showToast('Link copied!', 'success'))
        .catch(() => { document.execCommand('copy'); showToast('Link copied!', 'success'); });
    });
  }

  if ($('btn-import-share')) {
    $('btn-import-share').addEventListener('click', () => {
      if (!_pendingShare) return;
      try {
        Storage.importData(JSON.stringify(_pendingShare));
        render();
        showToast('Data imported successfully', 'success');
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
      }
      _pendingShare = null;
      _showBanner(false);
      Storage.clearShareHash();
    });
  }

  if ($('btn-dismiss-share')) {
    $('btn-dismiss-share').addEventListener('click', () => {
      _pendingShare = null;
      _showBanner(false);
      Storage.clearShareHash();
    });
  }

  async function checkShareURL() {
    try {
      const data = await Storage.parseShareURL();
      if (!data) return;
      _pendingShare = data;
      _showBanner(true);
    } catch {
      Storage.clearShareHash();
    }
  }

  // ---- Keyboard shortcuts ----
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // Close topmost open modal
      const modals = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
      if (modals.length) closeModal(modals[modals.length - 1].id);
    }
  });

  // ---- Init ----
  function init() {
    updateDateDisplay();
    loadSettingsForm();
    // Initialize tab display
    document.querySelectorAll('.tab-panel').forEach((p, i) => {
      if (i === 0) { p.style.display = ''; p.classList.add('active'); }
      else         { p.style.display = 'none'; }
    });
    render();
    checkShareURL();
  }

  init();
})();
