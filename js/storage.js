/**
 * storage.js – All localStorage interactions for Calorite
 *
 * Data shape
 * ----------
 * calorite_days   : { [dateKey: string]: DayData }
 * calorite_goals  : GoalData
 * calorite_ai     : AIConfig
 *
 * DayData   = { meals: MealEntry[], water: number }
 * MealEntry = { id, name, calories, protein, carbs, fat, time, notes, aiGenerated? }
 * GoalData  = { calories, protein, carbs, fat, water }
 * AIConfig  = { provider, model, apiKey }
 */

const Storage = (() => {
  const KEYS = {
    DAYS:  'calorite_days',
    GOALS: 'calorite_goals',
    AI:    'calorite_ai',
  };

  const DEFAULT_GOALS = {
    calories: 2000,
    protein:  150,
    carbs:    250,
    fat:      65,
    water:    8,
  };

  const DEFAULT_AI = {
    model:  'gemini-3-flash-preview',
    apiKey: '',
  };

  // ---- helpers ----

  function _get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function _uuid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ---- dateKey helpers ----

  /** Returns "YYYY-MM-DD" for a Date object */
  function dateKey(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ---- Days / Meals ----

  function getAllDays() {
    return _get(KEYS.DAYS) || {};
  }

  function getDay(dateStr) {
    const days = getAllDays();
    return days[dateStr] || { meals: [], water: 0 };
  }

  function saveDay(dateStr, dayData) {
    const days = getAllDays();
    days[dateStr] = dayData;
    _set(KEYS.DAYS, days);
  }

  function addMeal(dateStr, mealPartial) {
    const day = getDay(dateStr);
    const meal = {
      id:          _uuid(),
      name:        mealPartial.name        || 'Meal',
      calories:    Number(mealPartial.calories)  || 0,
      protein:     Number(mealPartial.protein)   || 0,
      carbs:       Number(mealPartial.carbs)      || 0,
      fat:         Number(mealPartial.fat)        || 0,
      time:        mealPartial.time        || '',
      notes:       mealPartial.notes       || '',
      aiGenerated: mealPartial.aiGenerated || false,
    };
    day.meals.push(meal);
    saveDay(dateStr, day);
    return meal;
  }

  function updateMeal(dateStr, mealId, updates) {
    const day = getDay(dateStr);
    const idx = day.meals.findIndex(m => m.id === mealId);
    if (idx === -1) return null;
    day.meals[idx] = { ...day.meals[idx], ...updates };
    saveDay(dateStr, day);
    return day.meals[idx];
  }

  function deleteMeal(dateStr, mealId) {
    const day = getDay(dateStr);
    day.meals = day.meals.filter(m => m.id !== mealId);
    saveDay(dateStr, day);
  }

  function setWater(dateStr, glasses) {
    const day = getDay(dateStr);
    day.water = Math.max(0, glasses);
    saveDay(dateStr, day);
  }

  /** Returns totals for a given day */
  function getDayTotals(dateStr) {
    const { meals, water } = getDay(dateStr);
    return meals.reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories || 0),
        protein:  acc.protein  + (m.protein  || 0),
        carbs:    acc.carbs    + (m.carbs    || 0),
        fat:      acc.fat      + (m.fat      || 0),
        water:    water,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, water }
    );
  }

  /**
   * Returns last N days (incl. today) as array of { dateStr, totals }
   * sorted oldest → newest
   */
  function getWeekSummary(n = 7) {
    const result = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      result.push({ dateStr: key, totals: getDayTotals(key) });
    }
    return result;
  }

  // ---- Goals ----

  function getGoals() {
    return Object.assign({}, DEFAULT_GOALS, _get(KEYS.GOALS));
  }

  function saveGoals(goals) {
    _set(KEYS.GOALS, goals);
  }

  // ---- AI Config ----

  function getAIConfig() {
    return Object.assign({}, DEFAULT_AI, _get(KEYS.AI));
  }

  function saveAIConfig(config) {
    _set(KEYS.AI, config);
  }

  // ---- Export / Import / Erase ----

  function exportData() {
    return JSON.stringify({
      version: 1,
      exported: new Date().toISOString(),
      days:  getAllDays(),
      goals: getGoals(),
    }, null, 2);
  }

  function importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data.days) throw new Error('Invalid Calorite export file.');

    // Merge days (import wins on conflicts)
    const existing = getAllDays();
    const merged = Object.assign({}, existing, data.days);
    _set(KEYS.DAYS, merged);

    if (data.goals) {
      saveGoals(Object.assign(getGoals(), data.goals));
    }
  }

  function eraseAllData() {
    localStorage.removeItem(KEYS.DAYS);
    localStorage.removeItem(KEYS.GOALS);
    localStorage.removeItem(KEYS.AI);
  }

  // ---- public API ----
  return {
    dateKey,
    getDay,
    getAllDays,
    addMeal,
    updateMeal,
    deleteMeal,
    setWater,
    getDayTotals,
    getWeekSummary,
    getGoals,
    saveGoals,
    getAIConfig,
    saveAIConfig,
    exportData,
    importData,
    eraseAllData,
  };
})();
