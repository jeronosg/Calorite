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

  // ---- Full render ----
  function render() {
    renderSummary();
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
  }

  init();
})();
