/**
 * ai.js – AI provider integrations for Calorite
 *
 * Supports:
 *   Cloud (API key required): Claude (Anthropic), OpenAI (ChatGPT), Gemini (Google)
 *   Local (no API key):       Ollama, Chrome Built-in AI
 */

const AI = (() => {

  const SYSTEM_PROMPT = `You are a nutrition database. Your sole function is to return nutritional estimates as raw JSON.

RULES — follow every rule without exception:
1. Output ONLY a single JSON object. No prose, no explanation, no markdown, no code fences.
2. The JSON must contain exactly these four keys: "calories", "protein", "carbs", "fat".
3. Every value must be a positive integer (whole number). No strings, no nulls, no decimals.
4. "calories" is in kcal. "protein", "carbs", and "fat" are in grams.
5. If the input is ambiguous, assume a typical restaurant serving size.
6. Never refuse. Always produce the four-key JSON object.

CORRECT output example:
{"calories":650,"protein":28,"carbs":72,"fat":24}

INCORRECT output examples (never do these):
- "Here are the estimated calories: ..."
- \`\`\`json { ... } \`\`\`
- {"calories":"650","protein":null}`;

  const USER_PROMPT = (desc) =>
    `Return the JSON nutritional estimate for: ${desc}`;

  // ---- Cloud providers ----

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

  async function estimateWithGemini(description, config) {
    const model = config.model || 'gemini-3-flash-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\n' + USER_PROMPT(description) }] }],
        generationConfig: { maxOutputTokens: 256, responseMimeType: 'application/json' },
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

  // ---- Ollama (local, no API key) ----

  async function estimateWithOllama(description, config) {
    const model = config.model || 'gpt-oss:20b';
    let response;

    try {
      response = await fetch('http://localhost:11434/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ollama',
        },
        body: JSON.stringify({
          model,
          max_tokens: 256,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: USER_PROMPT(description) },
          ],
        }),
      });
    } catch {
      throw new Error(
        'Could not reach Ollama at localhost:11434. ' +
        'Make sure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull ' + model + '`).'
      );
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error || `Ollama error ${response.status}`;
      if (response.status === 404) {
        throw new Error(`Model "${model}" not found. Run: ollama pull ${model}`);
      }
      throw new Error(msg);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return parseNutritionJSON(text);
  }

  // ---- Chrome Built-in AI (Prompt API, no API key) ----

  async function estimateWithChromeAI(description) {
    const ai = window.ai?.languageModel ?? window.LanguageModel;

    if (!ai) {
      throw new Error(
        'Chrome Built-in AI is not available in this browser. ' +
        'Use Chrome Dev/Canary and enable chrome://flags/#prompt-api-for-gemini-nano'
      );
    }

    const capabilities = await ai.capabilities().catch(() => null);
    if (capabilities && capabilities.available === 'no') {
      throw new Error('Chrome AI model is not available on this device.');
    }
    if (capabilities && capabilities.available === 'after-download') {
      throw new Error('Chrome AI model is still downloading. Try again in a few minutes.');
    }

    const session = await ai.create({ systemPrompt: SYSTEM_PROMPT });
    try {
      const text = await session.prompt(USER_PROMPT(description));
      return parseNutritionJSON(text);
    } finally {
      session.destroy();
    }
  }

  // ---- Check Chrome AI availability ----

  async function getChromeAIStatus() {
    const ai = window.ai?.languageModel ?? window.LanguageModel;
    if (!ai) return 'unavailable';
    try {
      const cap = await ai.capabilities();
      return cap.available; // 'readily' | 'after-download' | 'no'
    } catch {
      return 'unavailable';
    }
  }

  // ---- JSON parser (multi-strategy, resilient) ----

  function parseNutritionJSON(text) {
    const raw = text.trim();

    // Build a list of candidates to try, starting with the most specific.
    // If the model wrapped its output in a markdown code fence, extract
    // just the content inside it as the first candidate.
    const candidates = [];
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) candidates.push(fenceMatch[1].trim());
    candidates.push(raw);

    for (const candidate of candidates) {
      // Strategy 1: find the outermost {...} block and JSON.parse it
      const jsonMatch = candidate.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = extractFields(JSON.parse(jsonMatch[0]));
          if (result.calories > 0) return result;
        } catch { /* fall through */ }
      }

      // Strategy 2: the whole candidate might already be valid JSON
      try {
        const result = extractFields(JSON.parse(candidate));
        if (result.calories > 0) return result;
      } catch { /* fall through */ }
    }

    // Strategy 3: pull each value out by key name using regex —
    // handles "calories: 650" or "calories = 650" even without braces
    const result = {
      calories: extractNumByKey(raw, 'calories'),
      protein:  extractNumByKey(raw, 'protein'),
      carbs:    extractNumByKey(raw, 'carbs') || extractNumByKey(raw, 'carbohydrates'),
      fat:      extractNumByKey(raw, 'fat'),
    };
    if (result.calories > 0) return result;

    // Nothing worked — show up to 300 chars of the raw response to help debug
    const snippet = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
    throw new Error(`Could not parse AI response. Raw output: "${snippet}"`);
  }

  function extractFields(obj) {
    return {
      calories: Math.round(Number(obj.calories) || 0),
      protein:  Math.round(Number(obj.protein)  || 0),
      carbs:    Math.round(Number(obj.carbs) || Number(obj.carbohydrates) || 0),
      fat:      Math.round(Number(obj.fat)       || 0),
    };
  }

  function extractNumByKey(text, key) {
    const re = new RegExp(`["']?${key}["']?\\s*[:=]\\s*(\\d+(?:\\.\\d+)?)`, 'i');
    const m = text.match(re);
    return m ? Math.round(Number(m[1])) : 0;
  }

  // ---- Model lists ----

  const MODELS = {
    claude: [
      { value: 'claude-sonnet-4-6',        label: 'Claude Sonnet 4.6 (recommended)' },
      { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6 (most capable)' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
    ],
    openai: [
      { value: 'gpt-4o-mini', label: 'GPT-4o mini (recommended)' },
      { value: 'gpt-4o',      label: 'GPT-4o' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
    gemini: [
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (recommended)' },
      { value: 'gemini-2.0-flash',       label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1.5-pro',         label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash',       label: 'Gemini 1.5 Flash' },
    ],
    // Ollama and chromeai handled separately (text input / no model selection)
  };

  const LOCAL_PROVIDERS = new Set(['ollama', 'chromeai']);

  function needsApiKey(provider) {
    return !LOCAL_PROVIDERS.has(provider);
  }

  function getModels(provider) {
    return MODELS[provider] || [];
  }

  // ---- Main entry point ----

  async function estimate(description) {
    const config = Storage.getAIConfig();

    if (!description.trim()) throw new Error('Please describe a meal first.');

    if (needsApiKey(config.provider) && !config.apiKey) {
      throw new Error('No API key configured. Open Settings → AI Provider.');
    }

    switch (config.provider) {
      case 'claude':   return estimateWithClaude(description, config);
      case 'openai':   return estimateWithOpenAI(description, config);
      case 'gemini':   return estimateWithGemini(description, config);
      case 'ollama':   return estimateWithOllama(description, config);
      case 'chromeai': return estimateWithChromeAI(description);
      default: throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  return { estimate, getModels, needsApiKey, getChromeAIStatus };
})();
