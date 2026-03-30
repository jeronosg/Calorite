/**
 * ai.js – AI provider integrations for Calorite
 *
 * Supports: Claude (Anthropic), OpenAI (ChatGPT), Gemini (Google)
 *
 * Each provider receives a meal description and returns:
 *   { calories: number, protein: number, carbs: number, fat: number }
 */

const AI = (() => {

  const SYSTEM_PROMPT = `You are a nutrition expert. When given a meal description, estimate its nutritional content.
Respond ONLY with a valid JSON object in this exact format, no other text:
{"calories": <number>, "protein": <number>, "carbs": <number>, "fat": <number>}
All values should be whole numbers representing kcal and grams respectively.
Be realistic with your estimates based on typical portion sizes.`;

  const USER_PROMPT = (desc) =>
    `Estimate the nutritional content of this meal: ${desc}`;

  // ---- Claude (Anthropic) ----
  async function estimateWithClaude(description, config) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-calls': 'true',
      },
      body: JSON.stringify({
        model: config.model || 'claude-sonnet-4-6',
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: USER_PROMPT(description) }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return parseNutritionJSON(text);
  }

  // ---- OpenAI (ChatGPT) ----
  async function estimateWithOpenAI(description, config) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        max_tokens: 256,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: USER_PROMPT(description) },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return parseNutritionJSON(text);
  }

  // ---- Google Gemini ----
  async function estimateWithGemini(description, config) {
    const model = config.model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: SYSTEM_PROMPT + '\n\n' + USER_PROMPT(description),
          }],
        }],
        generationConfig: {
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseNutritionJSON(text);
  }

  // ---- JSON parser ----
  function parseNutritionJSON(text) {
    // Extract JSON from the response (model might add markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('AI returned an unexpected response format.');

    const parsed = JSON.parse(jsonMatch[0]);

    const result = {
      calories: Math.round(Number(parsed.calories) || 0),
      protein:  Math.round(Number(parsed.protein)  || 0),
      carbs:    Math.round(Number(parsed.carbs)     || 0),
      fat:      Math.round(Number(parsed.fat)       || 0),
    };

    if (result.calories <= 0) throw new Error('AI returned zero or invalid calorie estimate.');

    return result;
  }

  // ---- Model lists per provider ----
  const MODELS = {
    claude: [
      { value: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6 (recommended)' },
      { value: 'claude-opus-4-6',             label: 'Claude Opus 4.6 (most capable)' },
      { value: 'claude-haiku-4-5-20251001',   label: 'Claude Haiku 4.5 (fastest)' },
    ],
    openai: [
      { value: 'gpt-4o-mini', label: 'GPT-4o mini (recommended)' },
      { value: 'gpt-4o',      label: 'GPT-4o' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
    gemini: [
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (recommended)' },
      { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  };

  // ---- main entry point ----
  async function estimate(description) {
    const config = Storage.getAIConfig();

    if (!config.apiKey) throw new Error('No API key configured. Open Settings → AI Provider.');
    if (!description.trim()) throw new Error('Please describe a meal first.');

    switch (config.provider) {
      case 'claude': return estimateWithClaude(description, config);
      case 'openai': return estimateWithOpenAI(description, config);
      case 'gemini': return estimateWithGemini(description, config);
      default: throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  function getModels(provider) {
    return MODELS[provider] || [];
  }

  return { estimate, getModels };
})();
