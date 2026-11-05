// UNIT tests for utils/llm-check.js (NOTETAKER_AI_CHANGES Part 4, 2026-11-05): one free request to the chosen AI when
// the Notetaker's summary AI is saved. A fake globalThis.fetch records the request and gives the answer, so no AI is
// ever reached. Pinned: each AI's URL and headers, the key never in the URL; with a model, the request that names it
// (DeepSeek: the listing, searched); what each answer means (Gemini's wrong key is a 400); the key cut out of every
// message; a failed connection and a timeout are 'unreachable'; checkKey never throws.
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const llm = require(path.join(ROOT, 'utils', 'llm-check.js'));

const KEY = 'sk-test-0123456789abcdefghij-KEY';
const realFetch = globalThis.fetch;
let calls = [];
function answer(status, body, { raw } = {}) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers });
    return new Response(raw ?? (body === undefined ? '' : JSON.stringify(body)), { status, headers: { 'content-type': 'application/json' } });
  };
}
afterEach(() => { globalThis.fetch = realFetch; });

describe('the request: one GET, the key in a header and never in the URL', () => {
  const cases = [
    ['claude',   null,                      'https://api.anthropic.com/v1/models?limit=1',                          { Authorization: `Bearer ${KEY}`, 'anthropic-version': llm.ANTHROPIC_VERSION }],
    ['claude',   'claude-opus-5-5',         'https://api.anthropic.com/v1/models/claude-opus-5-5',                  { Authorization: `Bearer ${KEY}`, 'anthropic-version': llm.ANTHROPIC_VERSION }],
    ['openai',   null,                      'https://api.openai.com/v1/models',                                     { Authorization: `Bearer ${KEY}` }],
    ['openai',   'gpt-6-astra',             'https://api.openai.com/v1/models/gpt-6-astra',                         { Authorization: `Bearer ${KEY}` }],
    ['openai',   'ft:gpt-6-astra:org:x:1',  'https://api.openai.com/v1/models/ft%3Agpt-6-astra%3Aorg%3Ax%3A1',      { Authorization: `Bearer ${KEY}` }],
    ['gemini',   null,                      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',  { 'x-goog-api-key': KEY }],
    ['gemini',   'gemini-3.6-flash',        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash', { 'x-goog-api-key': KEY }],
    ['gemini',   'models/gemini-3.6-flash', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash', { 'x-goog-api-key': KEY }],
    ['deepseek', null,                      'https://api.deepseek.com/models',                                      { Authorization: `Bearer ${KEY}` }],
    ['deepseek', 'deepseek-v4-pro',         'https://api.deepseek.com/models',                                      { Authorization: `Bearer ${KEY}` }],
  ];
  for (const [provider, model, url, headers] of cases) {
    test(`${provider}${model ? ' + ' + model : ''}`, async () => {
      answer(200, { data: [{ id: 'deepseek-v4-pro' }] });
      await llm.checkKey(provider, KEY, model);
      assert.equal(calls.length, 1, 'exactly one request');
      assert.equal(calls[0].method, 'GET');
      assert.equal(calls[0].url, url);
      assert.ok(!calls[0].url.includes(KEY), 'the key is not in the URL');
      for (const [h, v] of Object.entries(headers)) assert.equal(calls[0].headers[h], v, h);
      assert.equal(calls[0].headers.Accept, 'application/json');
    });
  }
  test('a model with a slash stays one path segment: no climbing out of /models', async () => {
    answer(404, {});
    await llm.checkKey('openai', KEY, 'a/../../files');
    assert.equal(calls[0].url, 'https://api.openai.com/v1/models/a%2F..%2F..%2Ffiles');
  });
});

describe('what an answer means', () => {
  test('2xx: the key works (and the model is there)', async () => {
    for (const [p, m] of [['claude', null], ['claude', 'claude-opus-5-5'], ['openai', 'gpt-6-astra'], ['gemini', null], ['deepseek', null]]) {
      answer(200, { id: m || 'x', data: [] });
      assert.deepEqual(await llm.checkKey(p, KEY, m), { ok: true }, p);
    }
  });
  test('401 and 403 at every AI: the key is refused, with the AI\'s own words', async () => {
    for (const p of ['claude', 'openai', 'gemini', 'deepseek']) {
      for (const http of [401, 403]) {
        answer(http, { error: { message: 'Invalid API key' } });
        assert.deepEqual(await llm.checkKey(p, KEY, null), { ok: false, reason: 'key', http, error: `${llm.NAMES[p]} refused the key (${http}): Invalid API key` }, `${p} ${http}`);
      }
    }
  });
  test('Gemini: a wrong key is a 400 with reason API_KEY_INVALID (or its message); another 400 is not about the key', async () => {
    answer(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } });
    assert.deepEqual(await llm.checkKey('gemini', KEY, null), { ok: false, reason: 'key', http: 400, error: 'Gemini refused the key (400): API key not valid. Please pass a valid API key.' });
    answer(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
    assert.equal((await llm.checkKey('gemini', KEY, null)).reason, 'key', 'the message alone is enough');
    answer(400, { error: { message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } });
    assert.deepEqual(await llm.checkKey('gemini', KEY, null), { ok: false, reason: 'refused', http: 400, error: 'Gemini answered 400: User location is not supported for the API use.' });
    answer(400, { error: { message: 'API key not valid' } });
    assert.equal((await llm.checkKey('openai', KEY, null)).reason, 'refused', 'only Gemini says "wrong key" with a 400');
  });
  test('404 with a model: the AI has no such model for this key; 404 without one is just an answer', async () => {
    for (const [p, m] of [['claude', 'claude-nope'], ['openai', 'gpt-nope'], ['gemini', 'gemini-nope']]) {
      answer(404, { error: { message: 'not found' } });
      assert.deepEqual(await llm.checkKey(p, KEY, m), { ok: false, reason: 'model', http: 404, error: `${llm.NAMES[p]} has no model "${m}" for this key` }, p);
    }
    answer(404, { error: { message: 'not found' } });
    assert.deepEqual(await llm.checkKey('openai', KEY, null), { ok: false, reason: 'refused', http: 404, error: 'OpenAI answered 404: not found' });
  });
  test('DeepSeek: the model must be one of the listing\'s ids; no listing at all is an odd answer', async () => {
    answer(200, { object: 'list', data: [{ id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' }, { id: 'deepseek-v4-flash' }] });
    assert.deepEqual(await llm.checkKey('deepseek', KEY, 'deepseek-v4-flash'), { ok: true });
    assert.deepEqual(await llm.checkKey('deepseek', KEY, 'deepseek-v9'), { ok: false, reason: 'model', http: 200, error: 'DeepSeek has no model "deepseek-v9" for this key' });
    answer(200, null, { raw: '<html>proxy</html>' });
    assert.deepEqual(await llm.checkKey('deepseek', KEY, 'deepseek-v4-pro'), { ok: false, reason: 'refused', http: 200, error: 'DeepSeek answered with no list of models' });
    assert.deepEqual(await llm.checkKey('deepseek', KEY, null), { ok: true }, 'without a model, the 200 is enough');
  });
  test('anything else (429, 402, 500, 529) is "refused": the key may be fine, the AI would not answer now', async () => {
    for (const http of [429, 402, 500, 529]) {
      answer(http, { error: { message: 'Try later' } });
      assert.deepEqual(await llm.checkKey('claude', KEY, null), { ok: false, reason: 'refused', http, error: `Claude answered ${http}: Try later` }, String(http));
    }
    answer(503, null, { raw: 'Service Unavailable' });
    assert.deepEqual(await llm.checkKey('openai', KEY, null), { ok: false, reason: 'refused', http: 503, error: 'OpenAI answered 503' }, 'no JSON: no words');
  });
  test('the key is cut out of the AI\'s words, which are kept to one short line', async () => {
    answer(401, { error: { message: `Incorrect API key provided: ${KEY}.\n You can find your key at …` } });
    const r = await llm.checkKey('openai', KEY, null);
    assert.ok(!r.error.includes(KEY)); assert.equal(r.error, 'OpenAI refused the key (401): Incorrect API key provided: …. You can find your key at …');
    answer(500, { error: { message: 'x'.repeat(500) } });
    assert.equal((await llm.checkKey('claude', KEY, null)).error, 'Claude answered 500: ' + 'x'.repeat(200));
    answer(500, { error: 'plain words' });
    assert.equal((await llm.checkKey('claude', KEY, null)).error, 'Claude answered 500: plain words');
    answer(500, { error: { message: { nested: true } } });
    assert.equal((await llm.checkKey('claude', KEY, null)).error, 'Claude answered 500');
  });
});

describe('no answer', () => {
  test('a failed connection is "unreachable"', async () => {
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    assert.deepEqual(await llm.checkKey('gemini', KEY, null), { ok: false, reason: 'unreachable', http: 0, error: 'Gemini could not be reached' });
  });
  test('no answer in time is "unreachable" and says how long it waited', async () => {
    globalThis.fetch = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    assert.deepEqual(await llm.checkKey('deepseek', KEY, null, { timeoutMs: 30 }), { ok: false, reason: 'unreachable', http: 0, error: 'DeepSeek did not answer within 0 seconds' });
    assert.equal(llm.TIMEOUT_MS, 10000, 'ten seconds by default');
  });
  test('an AI it does not know: no request at all', async () => {
    answer(200, {});
    assert.deepEqual(await llm.checkKey('mistral', KEY, null), { ok: false, reason: 'refused', http: 0, error: 'Unknown AI' });
    assert.equal(calls.length, 0);
  });
});
