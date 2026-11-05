// ROUTE tests for /api/integrations/notetaker/ai (NOTETAKER_AI_CHANGES Parts 1–4, 2026-11-05): the Notetaker's summary
// AI, one per workspace, with its API key and an optional model. The AIs carry the Notetaker's own names from its
// booking field llm { provider, api_key, model? }: claude, openai (ChatGPT), gemini, deepseek. Everyone reads which one
// is set; setting and removing it are owner/admin only, as for Cal.com. Three servers are built from the same route file
// (owner, admin, member) over a fake pool. Pinned: the key is sealed before it is bound to the INSERT and never comes
// back (only its last four, and only to owner/admin); a second save replaces the first (one row per workspace), its
// model included; a name the Notetaker would refuse (chatgpt, DeepSeek, …), a key that is not key-shaped or a model
// that is not model-shaped is refused before anything is written; a save asks the AI once first (a fake, never the
// real one) and writes nothing when it refuses the key, lacks the model, does not answer or is busy; a member, a bad
// shape and the switch never make the server call an AI; the Notetaker's switch closes all three routes; initDb()
// creates the table with one row per workspace, then its model column.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb } = require('../helpers/load-db');

const KEY  = 'sk-ant-api03-0123456789abcdefghijABCDEFGHIJ-wxyz';
const KEY2 = 'AIzaSyD-0123456789abcdefghijklmnopqrstu';

const state = { row: null, calls: [] };
const pool = {
  query: async (sql, params) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: text, params });
    if (/FROM workspace_notetaker_ai a LEFT JOIN users u/.test(text)) {
      assert.doesNotMatch(text, /api_key_sealed/, 'the status never reads the sealed key');
      if (!state.row || state.row.workspace_id !== params[0]) return { rows: [] };
      const row = { provider: state.row.provider, key_hint: state.row.key_hint, saved_by: state.row.saved_by, saved_at: '2026-11-05T09:00:00.000Z', saved_by_name: 'Olaf Owner' };
      if (/\ba\.model\b/.test(text)) row.model = state.row.model;   // only what the query asks for
      return { rows: [row] };
    }
    if (text.startsWith('INSERT INTO workspace_notetaker_ai')) {
      state.row = { workspace_id: params[0], provider: params[1], api_key_sealed: params[2], key_hint: params[3], saved_by: params[4], model: params[5] };   // ON CONFLICT: replaced
      return { rowCount: 1, rows: [] };
    }
    if (text.startsWith('DELETE FROM workspace_notetaker_ai')) { if (state.row?.workspace_id === params[0]) state.row = null; return { rowCount: 1, rows: [] }; }
    return { rows: [] };
  },
};
const writes = () => state.calls.filter(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql));

// A fake for the AIs (Part 4: a save asks the AI first): the test client's own calls to 127.0.0.1 pass through, every
// other request is recorded and answered from `ai.reply` (a status and body, or { throw: true }). Nothing leaves the machine.
const realFetch = globalThis.fetch;
const AI_OK = { status: 200, body: { data: [{ id: 'deepseek-v4-pro' }] } };
const ai = { reply: AI_OK, calls: [] };
function fakeAis() {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    ai.calls.push({ url: u, headers: init?.headers });
    if (ai.reply.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(ai.reply.body ?? {}), { status: ai.reply.status, headers: { 'content-type': 'application/json' } });
  };
}

let owner, admin, member, ownerRoute, routes, calcom;
const savedSecret = process.env.SESSION_SECRET;
before(async () => {
  fakeAis();
  process.env.SESSION_SECRET = 'route-test-secret';
  calcom = require(path.join(ROOT, 'utils', 'calcom.js'));
  ownerRoute = loadRoute('integrations.js', { pool, user: { id: 1, workspaceId: 7, role: 'owner' } });
  owner  = await serve({ '/api/integrations': ownerRoute });
  const adminRoute = loadRoute('integrations.js', { pool, user: { id: 3, workspaceId: 7, role: 'admin' } });
  admin  = await serve({ '/api/integrations': adminRoute });
  const memberRoute = loadRoute('integrations.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } });
  member = await serve({ '/api/integrations': memberRoute });
  routes = [ownerRoute, adminRoute, memberRoute];   // each a copy of its own, with its own switches
});
after(async () => {
  await owner.close(); await admin.close(); await member.close();
  globalThis.fetch = realFetch;
  if (savedSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = savedSecret;
});
// "coming soon" off on all three, so the suite tests the AI whatever its default (NOTETAKER_AI_CHANGES Part 10; its own block below)
beforeEach(() => { state.row = null; state.calls.length = 0; ai.reply = AI_OK; ai.calls.length = 0; ownerRoute.setNotetakerOn(true); for (const r of routes) r.setNotetakerSoon(false); });

const PROVIDERS = ['claude', 'openai', 'gemini', 'deepseek'];   // the Notetaker's llm.provider values, exactly
const put = (who, body) => who.request('PUT', '/api/integrations/notetaker/ai', body);
const noSecrets = (body, key = KEY) => {
  const s = JSON.stringify(body);
  assert.doesNotMatch(s, /sealed|api_key/, 'no key field in the answer');
  assert.ok(!s.includes(key) && !s.includes(key.slice(0, -4)), 'the key itself is never in the answer');
};

describe('GET /api/integrations/notetaker/ai', () => {
  test('nothing set: everyone gets configured:false with the four AIs; can_manage says who may set one', async () => {
    const m = await member.request('GET', '/api/integrations/notetaker/ai');
    assert.equal(m.status, 200);
    assert.deepEqual(m.body, { configured: false, ai: null, providers: PROVIDERS, can_manage: false });
    const o = await owner.request('GET', '/api/integrations/notetaker/ai');
    assert.deepEqual(o.body, { configured: false, ai: null, providers: PROVIDERS, can_manage: true });
    const a = await admin.request('GET', '/api/integrations/notetaker/ai');
    assert.equal(a.body.can_manage, true);
    assert.deepEqual(writes(), [], 'reading writes nothing');
  });
  test('set: a member sees which AI, its model and who set it, never the key or its last four', async () => {
    await put(owner, { provider: 'claude', api_key: KEY, model: 'claude-opus-5-5' });
    const m = await member.request('GET', '/api/integrations/notetaker/ai');
    assert.equal(m.status, 200);
    assert.deepEqual(m.body, { configured: true, ai: { provider: 'claude', model: 'claude-opus-5-5', saved_by: 1, saved_by_name: 'Olaf Owner', saved_at: '2026-11-05T09:00:00.000Z' }, providers: PROVIDERS, can_manage: false });
    assert.ok(!('key_hint' in m.body.ai));
    noSecrets(m.body);
  });
  test('set: owner and admin see the key\'s last four characters', async () => {
    await put(owner, { provider: 'claude', api_key: KEY });
    for (const who of [owner, admin]) {
      const r = await who.request('GET', '/api/integrations/notetaker/ai');
      assert.equal(r.body.ai.key_hint, 'wxyz');
      noSecrets(r.body);
    }
  });
});

describe('PUT /api/integrations/notetaker/ai', () => {
  test('a member may not set it: 403, nothing written', async () => {
    const r = await put(member, { provider: 'claude', api_key: KEY });
    assert.equal(r.status, 403); assert.equal(r.body.error, 'Owner or admin only');
    assert.deepEqual(writes(), []); assert.equal(state.row, null);
    assert.deepEqual(ai.calls, [], 'a member never makes the server call an AI');
  });
  test('only the Notetaker\'s four names; anything else (ChatGPT as "chatgpt", "DeepSeek" capitalised, …) is refused before anything is written', async () => {
    for (const provider of [undefined, null, '', 'chatgpt', 'DeepSeek', 'deep-seek', 'Claude', 'OpenAI', 'anthropic', 'google', 'mistral', 42, ['claude']]) {
      const r = await put(owner, { provider, api_key: KEY });
      assert.equal(r.status, 400, JSON.stringify(provider)); assert.deepEqual(r.body, { error: 'Choose Claude, ChatGPT, Gemini or DeepSeek', reason: 'provider' });
    }
    assert.deepEqual(writes(), []);
  });
  test('a key that is not key-shaped is refused: missing, too short, too long, spaces inside, not a string', async () => {
    for (const api_key of [undefined, '', '   ', 'sk-short', 'sk-ant-has a space inside the key 0123', 'x'.repeat(401), 'sk-ant-äöü0123456789abcdefghij', 42, { key: KEY }]) {
      const r = await put(owner, { provider: 'claude', api_key });
      assert.equal(r.status, 400, JSON.stringify(api_key)); assert.deepEqual(r.body, { error: 'That does not look like an API key', reason: 'key_shape' });
    }
    assert.deepEqual(writes(), []);
    assert.deepEqual(ai.calls, [], 'a key that is not key-shaped is never sent to an AI');
  });
  test('the owner saves: the key is trimmed and sealed before it is bound, its last four kept; no model is NULL; the answer has no key', async () => {
    const r = await put(owner, { provider: 'claude', api_key: `  ${KEY}\n` });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO workspace_notetaker_ai'));
    assert.deepEqual([ins.params[0], ins.params[1], ins.params[3], ins.params[4], ins.params[5]], [7, 'claude', 'wxyz', 1, null]);
    assert.ok(!ins.params.includes(KEY), 'the plain key is never bound');
    assert.match(ins.params[2], /^v1\./); assert.equal(calcom.openKey(ins.params[2]), KEY, 'it opens to the trimmed key');
    assert.deepEqual(r.body, { configured: true, ai: { provider: 'claude', model: null, saved_by: 1, saved_by_name: 'Olaf Owner', saved_at: '2026-11-05T09:00:00.000Z', key_hint: 'wxyz' }, providers: PROVIDERS, can_manage: true });
    noSecrets(r.body);
    assert.equal(ai.calls.length, 1, 'Claude was asked once');
    assert.equal(ai.calls[0].url, 'https://api.anthropic.com/v1/models?limit=1'); assert.equal(ai.calls[0].headers.Authorization, `Bearer ${KEY}`, 'with the trimmed key');
  });
  test('an admin may save too', async () => {
    const r = await put(admin, { provider: 'openai', api_key: 'sk-proj-0123456789abcdef0123456789abcdef' });
    assert.equal(r.status, 200); assert.equal(state.row.provider, 'openai'); assert.equal(state.row.saved_by, 3);
  });
  test('one per workspace: a second save replaces the first, AI, key and model together', async () => {
    await put(owner, { provider: 'claude', api_key: KEY, model: 'claude-opus-5-5' });
    const r = await put(owner, { provider: 'gemini', api_key: KEY2 });
    assert.equal(r.status, 200); assert.equal(r.body.ai.provider, 'gemini'); assert.equal(r.body.ai.key_hint, 'rstu');
    assert.equal(r.body.ai.model, null, 'the earlier AI\'s model does not stay behind');
    noSecrets(r.body, KEY2);
    const ins = state.calls.filter(c => c.sql.startsWith('INSERT INTO workspace_notetaker_ai'));
    assert.equal(ins.length, 2);
    assert.match(ins[1].sql, /ON CONFLICT \(workspace_id\) DO UPDATE SET provider=EXCLUDED\.provider, api_key_sealed=EXCLUDED\.api_key_sealed, key_hint=EXCLUDED\.key_hint, saved_by=EXCLUDED\.saved_by, model=EXCLUDED\.model, saved_at=NOW\(\)/);
    assert.equal(calcom.openKey(state.row.api_key_sealed), KEY2);
  });
  test('DeepSeek with its key and the Notetaker\'s default model name', async () => {
    const r = await put(owner, { provider: 'deepseek', api_key: 'sk-0123456789abcdef0123456789abcdef', model: 'deepseek-v4-pro' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([state.row.provider, state.row.model, state.row.key_hint], ['deepseek', 'deepseek-v4-pro', 'cdef']);
    assert.equal(calcom.openKey(state.row.api_key_sealed), 'sk-0123456789abcdef0123456789abcdef');
  });
  test('each of the four AIs can be saved', async () => {
    for (const provider of PROVIDERS) {
      const r = await put(owner, { provider, api_key: KEY });
      assert.equal(r.status, 200, provider); assert.equal(r.body.ai.provider, provider);
    }
  });
  test('the model: optional and trimmed; empty or only spaces is none; the names the Notetaker documents pass', async () => {
    for (const [model, stored] of [[undefined, null], [null, null], ['', null], ['   ', null], [' gpt-6-astra ', 'gpt-6-astra'], ['claude-opus-5-5', 'claude-opus-5-5'], ['gemini-3.6-flash', 'gemini-3.6-flash'], ['models/gemini-3.6-flash', 'models/gemini-3.6-flash'], ['ft:gpt-6-astra:org:x:1', 'ft:gpt-6-astra:org:x:1'], ['m'.repeat(100), 'm'.repeat(100)]]) {
      const r = await put(owner, { provider: 'openai', api_key: KEY, model });
      assert.equal(r.status, 200, JSON.stringify(model)); assert.equal(state.row.model, stored, JSON.stringify(model)); assert.equal(r.body.ai.model, stored);
    }
  });
  test('a model that is not model-shaped is refused before anything is written: spaces inside, over 100 characters, odd characters, not a string', async () => {
    for (const model of ['gpt 6', 'm'.repeat(101), '-gpt', 'gpt?6', 'gpt-6\nx','gpt-ä', 42, true, ['gpt-6-astra'], { name: 'gpt-6-astra' }]) {
      const r = await put(owner, { provider: 'openai', api_key: KEY, model });
      assert.equal(r.status, 400, JSON.stringify(model)); assert.deepEqual(r.body, { error: 'That does not look like a model name', reason: 'model_shape' });
    }
    assert.deepEqual(writes(), []);
    assert.deepEqual(ai.calls, []);
  });
});

describe('PUT asks the AI first (Part 4)', () => {
  test('with a model, the AI is asked for that model; a yes is saved', async () => {
    const r = await put(owner, { provider: 'openai', api_key: KEY, model: 'gpt-6-astra' });
    assert.equal(r.status, 200);
    assert.deepEqual(ai.calls.map(c => c.url), ['https://api.openai.com/v1/models/gpt-6-astra']);
    assert.equal(state.row.model, 'gpt-6-astra');
  });
  test('a refused key, a missing model, no answer, a busy AI: nothing is written, the answer says which and never holds the key', async () => {
    const cases = [
      [{ status: 401, body: { error: { message: `Incorrect API key provided: ${KEY}` } } }, 'openai', null,          400, 'key',         'OpenAI refused the key (401): Incorrect API key provided: …'],
      [{ status: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } } }, 'gemini', null, 400, 'key', 'Gemini refused the key (400): API key not valid. Please pass a valid API key.'],
      [{ status: 404, body: { error: { message: 'model_not_found' } } },                        'claude', 'claude-nope', 400, 'model',       'Claude has no model "claude-nope" for this key'],
      [{ status: 200, body: { data: [{ id: 'deepseek-v4-pro' }] } },                             'deepseek', 'deepseek-v9', 400, 'model',     'DeepSeek has no model "deepseek-v9" for this key'],
      [{ throw: true },                                                                           'claude', null,          502, 'unreachable', 'Claude could not be reached'],
      [{ status: 429, body: { error: { message: 'Rate limited' } } },                             'deepseek', null,        502, 'refused',     'DeepSeek answered 429: Rate limited'],
    ];
    for (const [reply, provider, model, status, reason, error] of cases) {
      ai.reply = reply; ai.calls.length = 0;
      const r = await put(owner, { provider, api_key: KEY, model });
      assert.equal(r.status, status, `${provider} ${reason}`);
      assert.deepEqual(r.body, { error, reason }, `${provider} ${reason}`);
      assert.equal(ai.calls.length, 1);
      noSecrets(r.body);
    }
    assert.deepEqual(writes(), [], 'nothing was saved');
    assert.equal(state.row, null);
  });
  test('a refused new key leaves the AI saved before untouched', async () => {
    await put(owner, { provider: 'claude', api_key: KEY });
    ai.reply = { status: 401, body: {} };
    const r = await put(owner, { provider: 'gemini', api_key: KEY2 });
    assert.equal(r.status, 400);
    assert.equal(state.row.provider, 'claude'); assert.equal(calcom.openKey(state.row.api_key_sealed), KEY);
  });
});

describe('DELETE /api/integrations/notetaker/ai', () => {
  test('a member may not remove it: 403, the AI stays', async () => {
    await put(owner, { provider: 'claude', api_key: KEY });
    state.calls.length = 0;
    const r = await member.request('DELETE', '/api/integrations/notetaker/ai');
    assert.equal(r.status, 403); assert.deepEqual(writes(), []); assert.equal(state.row.provider, 'claude');
  });
  test('the owner removes it: the workspace\'s row is deleted and nothing is set any more', async () => {
    await put(owner, { provider: 'claude', api_key: KEY });
    const r = await owner.request('DELETE', '/api/integrations/notetaker/ai');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { configured: false, ai: null, providers: PROVIDERS, can_manage: true });
    const del = state.calls.find(c => c.sql.startsWith('DELETE FROM workspace_notetaker_ai'));
    assert.equal(del.sql, 'DELETE FROM workspace_notetaker_ai WHERE workspace_id=$1'); assert.deepEqual(del.params, [7]);
    assert.equal(state.row, null);
  });
});

describe('the Notetaker\'s switch', () => {
  test('off: all three routes answer 404 and nothing is read or written', async () => {
    ownerRoute.setNotetakerOn(false);
    for (const [method, body] of [['GET'], ['PUT', { provider: 'claude', api_key: KEY }], ['DELETE']]) {
      const r = await owner.request(method, '/api/integrations/notetaker/ai', body);
      assert.equal(r.status, 404, method); assert.equal(r.body.error, 'The Notetaker is off');
    }
    assert.deepEqual(state.calls, []);
    assert.deepEqual(ai.calls, []);
  });
});

describe('coming soon (Part 10)', () => {
  test('on: GET answers { soon: true } to everyone; PUT and DELETE are refused with reason soon; nothing is read, written or asked', async () => {
    for (const r of routes) r.setNotetakerSoon(true);
    for (const who of [owner, admin, member]) {
      const g = await who.request('GET', '/api/integrations/notetaker/ai');
      assert.equal(g.status, 200); assert.deepEqual(g.body, { soon: true });
    }
    for (const [who, method, body] of [[owner, 'PUT', { provider: 'claude', api_key: KEY }], [owner, 'DELETE'], [admin, 'PUT', { provider: 'claude', api_key: KEY }], [member, 'DELETE']]) {
      const r = await who.request(method, '/api/integrations/notetaker/ai', body);
      assert.equal(r.status, 403, method); assert.deepEqual(r.body, { error: 'The Notetaker is coming soon', reason: 'soon' });
    }
    assert.deepEqual(state.calls, []);
    assert.deepEqual(ai.calls, []);
  });
});

describe('the table', () => {
  test('initDb() creates workspace_notetaker_ai with one row per workspace, after the Notetaker\'s own table, then adds its model column', async () => {
    const dbPool = createFakePool([{ match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) }]);
    await loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), dbPool).initDb();
    const create = dbPool.filter(/CREATE TABLE IF NOT EXISTS workspace_notetaker_ai \(/);
    assert.equal(create.length, 1);
    assert.match(create[0].sql, /workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(create[0].sql, /api_key_sealed TEXT NOT NULL/);
    assert.match(create[0].sql, /saved_by INTEGER REFERENCES users\(id\) ON DELETE SET NULL/);
    const at = re => dbPool.log.findIndex(e => re.test(e.sql));
    assert.ok(at(/CREATE TABLE IF NOT EXISTS workspace_notetaker_ai/) > at(/CREATE TABLE IF NOT EXISTS notetaker_recordings/));
    assert.ok(at(/^ALTER TABLE workspace_notetaker_ai ADD COLUMN IF NOT EXISTS model TEXT$/) > at(/CREATE TABLE IF NOT EXISTS workspace_notetaker_ai/), 'the model column, after the table (a table made before Part 2 gets it too)');
  });
});
