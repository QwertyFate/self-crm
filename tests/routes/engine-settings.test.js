// ROUTE tests for routes/engine-settings.js: owner-only, show-once secrets,
// hash-only key storage. The webhook engine is swapped for a recording stub.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve, inject } = require('../helpers/load-route');

const hooks = new Map(); const keys = new Map(); const deliveries = new Map();
let nextId = 1; const emits = []; const attempts = [];
let pool, owner, member;

before(async () => {
  pool = createFakePool([
    { match: /AS secret_hint[\s\S]*FROM engine_webhook WHERE workspace_id=\$1/, reply: p => { const w = [...hooks.values()].find(h => h.workspace_id === p[0]); return { rows: w ? [view(w)] : [] }; } },   // the GET view
    { match: /^SELECT id FROM engine_webhook WHERE workspace_id=\$1/, reply: p => { const w = [...hooks.values()].find(h => h.workspace_id === p[0]); return { rows: w ? [{ id: w.id }] : [] }; } },
    { match: /^INSERT INTO engine_webhook \(/, reply: p => { const w = { id: nextId++, workspace_id: p[0], url: p[1], secret: p[2], events: JSON.parse(p[3]), description: p[4], active: p[5] }; hooks.set(w.id, w); return { rows: [view(w)] }; } },
    { match: /^UPDATE engine_webhook SET url=/, reply: p => { const w = hooks.get(p[4]); if (!w || w.workspace_id !== p[5]) return { rows: [] }; Object.assign(w, { url: p[0], events: JSON.parse(p[1]), description: p[2], active: p[3] }); return { rows: [view(w)] }; } },
    { match: /^UPDATE engine_webhook SET secret=/, reply: p => { const w = [...hooks.values()].find(h => h.workspace_id === p[1]); if (!w) return { rows: [] }; w.secret = p[0]; return { rows: [view(w)] }; } },
    { match: /^SELECT id, status, response_status, error FROM engine_webhook_deliveries/, reply: p => ({ rows: p[1].map(id => deliveries.get(id)).filter(Boolean) }) },
    { match: /FROM engine_webhook_deliveries WHERE workspace_id=\$1 ORDER BY created_at DESC LIMIT \$2/, reply: p => ({ rows: [...deliveries.values()].filter(d => d.workspace_id === p[0]).slice(0, p[1]) }) },
    { match: /^UPDATE engine_webhook_deliveries SET status='failed'/, reply: p => { const d = deliveries.get(p[0]); if (!d || d.workspace_id !== p[1] || !['failed', 'dead'].includes(d.status)) return { rowCount: 0 }; d.status = 'failed'; d.attempts = Math.min(d.attempts, 6); return { rowCount: 1 }; } },
    { match: /FROM api_keys WHERE workspace_id=\$1 ORDER BY/, reply: p => ({ rows: [...keys.values()].filter(k => k.workspace_id === p[0]).map(pub) }) },
    { match: /^INSERT INTO api_keys/, reply: p => { const k = { id: nextId++, workspace_id: p[0], name: p[1], key_prefix: p[2], key_hash: p[3], scopes: [], created_at: 'now', last_used_at: null, expires_at: null, revoked_at: null }; keys.set(k.id, k); return { rows: [pub(k)] }; } },
    { match: /^UPDATE api_keys SET revoked_at=NOW\(\)/, reply: p => { const k = keys.get(p[0]); if (!k || k.workspace_id !== p[1] || k.revoked_at) return { rowCount: 0 }; k.revoked_at = 'now'; return { rowCount: 1 }; } },
  ]);
  function view(w) { return { id: w.id, url: w.url, events: w.events, description: w.description, active: w.active, secret_hint: w.secret.slice(-4), created_at: 'c', updated_at: 'u' }; }
  function pub(k) { const { key_hash, ...rest } = k; return rest; }
  inject('utils/engine-webhook.js', {
    emitEngineEvent: async (wid, event, opts, o) => { emits.push([wid, event, opts, o]); const id = nextId++; deliveries.set(id, { id, workspace_id: wid, event, status: 'delivered', response_status: 200, error: null, attempts: 1, created_at: 'now' }); return { eventId: 'evt_t', deliveryIds: [id] }; },
    attemptDeliveries: async ids => { attempts.push(ids); return ids.map(id => ({ id, status: 'delivered', responseStatus: 200 })); },
  });
  owner  = await serve({ '/api/engine-settings': loadRoute('engine-settings.js', { pool }) });
  member = await serve({ '/api/engine-settings': loadRoute('engine-settings.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } }) });
});
after(async () => { await owner.close(); await member.close(); });
beforeEach(() => { pool.reset(); hooks.clear(); keys.clear(); deliveries.clear(); emits.length = 0; attempts.length = 0; nextId = 1; });

test('every route is owner-only: a member gets 403 and nothing is queried', async () => {
  for (const [m, p, b] of [['GET', '/api/engine-settings/webhook'], ['PUT', '/api/engine-settings/webhook', { url: 'https://x' }], ['POST', '/api/engine-settings/webhook/rotate-secret', {}], ['POST', '/api/engine-settings/webhook/test', {}], ['GET', '/api/engine-settings/webhook/deliveries'], ['POST', '/api/engine-settings/webhook/deliveries/1/retry', {}], ['GET', '/api/engine-settings/api-keys'], ['POST', '/api/engine-settings/api-keys', { name: 'x' }], ['DELETE', '/api/engine-settings/api-keys/1']]) {
    const r = await member.request(m, p, b);
    assert.equal(r.status, 403, `${m} ${p}`); assert.deepEqual(r.body, { error: 'Owner only' });
  }
  assert.equal(pool.log.length, 0);
});

describe('webhook', () => {
  test('GET with nothing configured -> null + available events', async () => {
    const r = await owner.request('GET', '/api/engine-settings/webhook');
    assert.deepEqual(r.body, { webhook: null, available_events: ['vertrag.unterschrieben', 'onboarding.status_geaendert', 'test.ereignis'] });
  });
  test('PUT creates the webhook with a 64-hex secret returned once; the next GET shows only a hint', async () => {
    const r = await owner.request('PUT', '/api/engine-settings/webhook', { url: 'https://engine.test/hook', events: ['vertrag.unterschrieben'], description: 'd', active: true });
    assert.equal(r.status, 201);
    assert.match(r.body.secret, /^[0-9a-f]{64}$/);
    assert.equal(r.body.webhook.secret_hint, r.body.secret.slice(-4));
    assert.equal(pool.find(/^INSERT INTO engine_webhook \(/).params[2], r.body.secret);
    const g = await owner.request('GET', '/api/engine-settings/webhook');
    assert.ok(!('secret' in g.body), 'GET never returns the secret');
    assert.ok(!('secret' in g.body.webhook), 'nor inside the webhook view');
    assert.equal(g.body.webhook.secret_hint, r.body.secret.slice(-4));
  });
  test('PUT again updates in place (no new secret); bad url / unknown event -> 400', async () => {
    await owner.request('PUT', '/api/engine-settings/webhook', { url: 'https://a', events: [] });
    const r = await owner.request('PUT', '/api/engine-settings/webhook', { url: 'https://b', events: ['*'], active: false });
    assert.equal(r.status, 200); assert.equal(r.body.secret, undefined); assert.equal(r.body.webhook.url, 'https://b'); assert.equal(hooks.size, 1);
    assert.equal((await owner.request('PUT', '/api/engine-settings/webhook', { url: 'ftp://x', events: [] })).status, 400);
    assert.equal((await owner.request('PUT', '/api/engine-settings/webhook', { url: 'https://x', events: ['nope'] })).status, 400);
  });
  test('rotate returns a different secret once and stores it; 404 when none configured', async () => {
    assert.equal((await owner.request('POST', '/api/engine-settings/webhook/rotate-secret', {})).status, 404);
    const c = await owner.request('PUT', '/api/engine-settings/webhook', { url: 'https://a', events: [] });
    const r = await owner.request('POST', '/api/engine-settings/webhook/rotate-secret', {});
    assert.match(r.body.secret, /^[0-9a-f]{64}$/); assert.notEqual(r.body.secret, c.body.secret);
    assert.equal([...hooks.values()][0].secret, r.body.secret);
  });
  test('test event: emits test.ereignis synchronously and reports the delivery', async () => {
    await owner.request('PUT', '/api/engine-settings/webhook', { url: 'https://a', events: ['*'] });
    const r = await owner.request('POST', '/api/engine-settings/webhook/test', {});
    assert.equal(r.status, 200);
    assert.equal(emits[0][0], 7); assert.equal(emits[0][1], 'test.ereignis'); assert.deepEqual(emits[0][3], { sync: true });
    assert.equal(r.body.event_id, 'evt_t'); assert.equal(r.body.deliveries[0].status, 'delivered');
  });
  test('deliveries are workspace-scoped and limited; retry re-arms a dead row (attempts clamped) and attempts it', async () => {
    deliveries.set(50, { id: 50, workspace_id: 7, event: 'e', status: 'dead', attempts: 7, response_status: 500, error: 'HTTP 500', created_at: 'x' });
    deliveries.set(51, { id: 51, workspace_id: 8, event: 'e', status: 'dead', attempts: 7, created_at: 'x' });
    const l = await owner.request('GET', '/api/engine-settings/webhook/deliveries?limit=10');
    assert.deepEqual(l.body.map(d => d.id), [50]); assert.deepEqual(pool.find(/ORDER BY created_at DESC LIMIT \$2/).params, [7, 10]);
    const r = await owner.request('POST', '/api/engine-settings/webhook/deliveries/50/retry', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'delivered');
    assert.match(pool.find(/^UPDATE engine_webhook_deliveries SET status='failed'/).sql, /attempts=LEAST\(attempts, 6\)/, 'the re-arm clamps attempts in SQL');
    assert.equal(deliveries.get(50).attempts, 6);
    assert.deepEqual(attempts, [[50]], 'attempted exactly once');
    assert.equal((await owner.request('POST', '/api/engine-settings/webhook/deliveries/51/retry', {})).status, 404);
  });
});

describe('API keys', () => {
  test('POST returns upg_live_<32 hex> once and stores only its sha256 with a 12-char prefix', async () => {
    const r = await owner.request('POST', '/api/engine-settings/api-keys', { name: 'Engine prod' });
    assert.equal(r.status, 201);
    assert.match(r.body.key, /^upg_live_[0-9a-f]{32}$/);
    const ins = pool.find(/^INSERT INTO api_keys/).params;
    assert.equal(ins[2], r.body.key.slice(0, 12));
    assert.equal(ins[3], crypto.createHash('sha256').update(r.body.key).digest('hex'));
    assert.equal(pool.log.some(e => e.params.includes(r.body.key)), false);
    const g = await owner.request('GET', '/api/engine-settings/api-keys');
    assert.equal(g.body.length, 1);
    assert.ok(!('key' in g.body[0]), 'the list never carries the key');
    assert.ok(!('key_hash' in g.body[0]), 'nor its hash');
    assert.equal(g.body[0].key_prefix, r.body.key.slice(0, 12));
  });
  test('missing name -> 400; revoke sets revoked_at; second revoke / foreign id -> 404', async () => {
    assert.equal((await owner.request('POST', '/api/engine-settings/api-keys', {})).status, 400);
    const r = await owner.request('POST', '/api/engine-settings/api-keys', { name: 'k' });
    assert.equal((await owner.request('DELETE', `/api/engine-settings/api-keys/${r.body.id}`)).status, 200);
    assert.ok(keys.get(r.body.id).revoked_at);
    assert.equal((await owner.request('DELETE', `/api/engine-settings/api-keys/${r.body.id}`)).status, 404);
    assert.equal((await owner.request('DELETE', '/api/engine-settings/api-keys/999')).status, 404);
  });
});
