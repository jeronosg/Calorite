/**
 * ai.js – Google Gemini integration for Calorite
 */

const AI = (() => {

  const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  const MODELS = [
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (recommended)' },
    { value: 'gemini-2.0-flash',       label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-flash',       label: 'Gemini 1.5 Flash' },
    { value: 'gemini-1.5-pro',         label: 'Gemini 1.5 Pro' },
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
    'When given a meal description, estimate its nutritional content. ' +
    'Assume typical restaurant serving sizes when portions are not specified. ' +
    'Always provide a best-effort estimate — never refuse.';

  async function estimate(description) {
    if (!description.trim()) throw new Error('Please describe a meal first.');

    const config = Storage.getAIConfig();
    if (!config.apiKey) throw new Error('No Gemini API key set. Open Settings → AI to add one.');

    const model = config.model || 'gemini-3-flash-preview';
    const url   = `${BASE_URL}/${model}:generateContent?key=${config.apiKey}`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents: [{
            role: 'user',
            parts: [{ text: `Estimate the nutritional content of this meal: ${description}` }],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.1,
          },
        }),
      });
    } catch (err) {
      throw new Error(`Network error reaching Gemini API: ${err.message}`);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || `Gemini API error (${response.status})`;
      throw new Error(msg);
    }

    const data = await response.json();

    // Check for content blocking
    const candidate = data.candidates?.[0];
    if (!candidate) {
      const feedback = data.promptFeedback?.blockReason;
      throw new Error(feedback ? `Request blocked: ${feedback}` : 'Gemini returned no candidates.');
    }
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Gemini stopped unexpectedly: ${candidate.finishReason}`);
    }

    const text = candidate.content?.parts?.[0]?.text || '';
    if (!text) throw new Error('Gemini returned an empty response.');

    return parseResponse(text);
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

  return { estimate, getModels };
})();
