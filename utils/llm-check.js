/* ═══════════════════════════════════════════════════════════════════════════
   LLM CHECK — does an AI take this key (and has it this model)? (NOTETAKER_AI_CHANGES Part 4, 2026-11-05)

   Asked once when an owner or admin saves the Notetaker's summary AI (routes/integrations.js, PUT /notetaker/ai), so
   a wrong key is found then and not after a recorded meeting. ONE request, and one that costs nothing: each AI's
   model listing, never a text generation.

     claude    GET https://api.anthropic.com/v1/models/<model>     Authorization: Bearer <key>, anthropic-version
               (no model: /v1/models?limit=1). 401 key, 403 no permission, 404 no such model.
     openai    GET https://api.openai.com/v1/models/<model>        Authorization: Bearer <key>
               (no model: /v1/models). 401 key, 404 no such model or none for this key.
     gemini    GET https://generativelanguage.googleapis.com/v1beta/models/<model>   x-goog-api-key: <key>
               (no model: /v1beta/models?pageSize=1; "models/" in front of a model is dropped). A wrong key is a
               400 (reason API_KEY_INVALID), not a 401; 403 the key may not use the API; 404 no such model.
     deepseek  GET https://api.deepseek.com/models                 Authorization: Bearer <key>
               (no single-model route: a model must be one of data[].id). 401 key.

   The key always goes in a header, never in the URL. checkKey() never throws:
     { ok: true }
     { ok: false, reason: 'key' | 'model' | 'unreachable' | 'refused', http, error }
   'refused' is any other answer (429, 402, 5xx, …): the key may be fine, but the AI would not answer now. Every
   error text has the key cut out and is kept short: an AI's own message can quote what it was sent.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const TIMEOUT_MS = 10000;
const ANTHROPIC_VERSION = '2026-10-21';
const NAMES = { claude: 'Claude', openai: 'OpenAI', gemini: 'Gemini', deepseek: 'DeepSeek' };

// The one request for a provider: { url, headers }; with a model, the request that names it (DeepSeek: the listing).
function requestFor(provider, apiKey, model) {
  const m = model ? encodeURIComponent(provider === 'gemini' ? model.replace(/^models\//, '') : model) : null;
  switch (provider) {
    case 'claude':   return { url: `https://api.anthropic.com/v1/models${m ? '/' + m : '?limit=1'}`, headers: { Authorization: `Bearer ${apiKey}`, 'anthropic-version': ANTHROPIC_VERSION } };
    case 'openai':   return { url: `https://api.openai.com/v1/models${m ? '/' + m : ''}`, headers: { Authorization: `Bearer ${apiKey}` } };
    case 'gemini':   return { url: `https://generativelanguage.googleapis.com/v1beta/models${m ? '/' + m : '?pageSize=1'}`, headers: { 'x-goog-api-key': apiKey } };
    case 'deepseek': return { url: 'https://api.deepseek.com/models', headers: { Authorization: `Bearer ${apiKey}` } };
    default:         return null;
  }
}

// An AI's own words from an error body ({ error: { message } } at all four), the key cut out, kept short.
function messageOf(body, apiKey) {
  const e = body && typeof body === 'object' ? body.error : null;
  const m = e && typeof e === 'object' ? e.message : typeof e === 'string' ? e : '';
  if (typeof m !== 'string') return '';
  return (apiKey ? m.split(apiKey).join('…') : m).replace(/\s+/g, ' ').trim().slice(0, 200);
}

// Gemini says "wrong key" with a 400: its details carry reason API_KEY_INVALID (or the message says so).
function geminiKeyInvalid(body) {
  const e = body && typeof body === 'object' && body.error && typeof body.error === 'object' ? body.error : {};
  const reasons = Array.isArray(e.details) ? e.details.map(d => d && d.reason) : [];
  return reasons.includes('API_KEY_INVALID') || /api key not valid/i.test(String(e.message || ''));
}

// What an answer means for this provider and model.
function interpret(provider, http, body, apiKey, model) {
  const name = NAMES[provider];
  const msg = messageOf(body, apiKey);
  const tail = msg ? `: ${msg}` : '';
  if (http >= 200 && http < 300) {
    if (provider !== 'deepseek' || !model) return { ok: true };
    const ids = body && Array.isArray(body.data) ? body.data.map(d => d && d.id) : null;
    if (!ids) return { ok: false, reason: 'refused', http, error: `${name} answered with no list of models` };
    return ids.includes(model) ? { ok: true } : { ok: false, reason: 'model', http, error: `${name} has no model "${model}" for this key` };
  }
  if (http === 401 || http === 403 || (provider === 'gemini' && http === 400 && geminiKeyInvalid(body))) {
    return { ok: false, reason: 'key', http, error: `${name} refused the key (${http})${tail}` };
  }
  if (http === 404 && model && provider !== 'deepseek') {
    return { ok: false, reason: 'model', http, error: `${name} has no model "${model}" for this key` };
  }
  return { ok: false, reason: 'refused', http, error: `${name} answered ${http}${tail}` };
}

// One request; never throws.
async function checkKey(provider, apiKey, model = null, { timeoutMs = TIMEOUT_MS } = {}) {
  const req = requestFor(provider, apiKey, model);
  if (!req) return { ok: false, reason: 'refused', http: 0, error: 'Unknown AI' };
  const name = NAMES[provider];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(req.url, { method: 'GET', headers: { Accept: 'application/json', ...req.headers }, signal: ctrl.signal });
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    return interpret(provider, res.status, body, apiKey, model);
  } catch (err) {
    const late = err && err.name === 'AbortError';
    return { ok: false, reason: 'unreachable', http: 0, error: late ? `${name} did not answer within ${Math.round(timeoutMs / 1000)} seconds` : `${name} could not be reached` };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkKey, requestFor, interpret, NAMES, ANTHROPIC_VERSION, TIMEOUT_MS };
