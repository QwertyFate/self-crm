// ROUTE tests for routes/admin-engine.js — the admin console's Engine Monitor
// data: the two switches, the summary tiles (+ prune), the workspace list, the
// request log and the deliveries, all behind requireAdmin (X-Admin-Secret here).
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

process.env.ADMIN_SECRET = 'top-secret';
const H = { 'X-Admin-Secret': 'top-secret' };
const state = { controls: null };
let pool, server, controls;

before(async () => {
  pool = createFakePool([
    { match: /^SELECT value FROM platform_settings WHERE key=\$1/, reply: () => ({ rows: state.controls ? [{ value: state.controls }] : [] }) },
    { match: /^INSERT INTO platform_settings/,                    reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /^DELETE FROM engine_api_requests/,                  reply: () => ({ rows: [], rowCount: 4 }) },
    { match: /FROM engine_api_requests WHERE created_at >= NOW\(\) - INTERVAL '24 hours'/, reply: () => ({ rows: [{ requests_24h: 31, requests_24h_4xx: 3, requests_24h_5xx: 1, workspaces_24h: 2, last_request_at: 'r', avg_ms_24h: 48 }] }) },
    { match: /FROM engine_deliveries\s*$/,                         reply: () => ({ rows: [{ pending: 2, failed_24h: 1, delivered_24h: 9, sent_24h: 12, last_event_at: 'e' }] }) },
    { match: /FROM workspace_engine\s*$/,                          reply: () => ({ rows: [{ active_workspaces: 1, live_keys: 2 }] }) },
    { match: /FROM workspaces w\s+LEFT JOIN workspace_engine e/,   reply: () => ({ rows: [{ id: 7, name: 'Acme', engine_active: true, engine_url_set: true, live_keys: 2, last_request_at: 'r', last_event_at: 'e' }] }) },
    { match: /FROM engine_api_requests r/,                        reply: p => ({ rows: [{ id: 1, params: p }] }) },
    { match: /FROM engine_deliveries d/,                          reply: p => ({ rows: [{ id: 300, params: p }] }) },
  ]);
  server = await serve({ '/api/admin': loadRoute('admin-engine.js', { pool }) });
  controls = require(path.join(ROOT, 'utils', 'engine-controls.js'));
});
after(() => server.close());
beforeEach(() => { pool.reset(); state.controls = null; controls.resetCache(); });

const get = (p, headers = H) => server.request('GET', p, undefined, headers);
const patch = (p, body, headers = H) => server.request('PATCH', p, body, headers);

describe('the gate', () => {
  test('every endpoint is 401 without the admin secret (and no query runs)', async () => {
    for (const p of ['/api/admin/engine/controls', '/api/admin/engine/summary', '/api/admin/engine/workspaces', '/api/admin/engine/requests', '/api/admin/engine/deliveries']) {
      assert.equal((await get(p, {})).status, 401, p);
    }
    assert.equal((await patch('/api/admin/engine/controls', { api_enabled: false }, {})).status, 401);
    assert.equal(pool.log.length, 0);
  });
});

describe('controls', () => {
  test('GET reads fresh (never from the cache) and answers both switches', async () => {
    state.controls = { api_enabled: false };
    const r = await get('/api/admin/engine/controls');
    assert.deepEqual(r.body, { api_enabled: false, webhooks_enabled: true });
    assert.equal(pool.filter(/platform_settings/).length, 1);
  });
  test('PATCH validates and writes; the answer carries both switches', async () => {
    for (const body of [{}, { foo: true }, { api_enabled: 'no' }, []]) {
      const r = await patch('/api/admin/engine/controls', body);
      assert.equal(r.status, 400, JSON.stringify(body)); assert.ok(r.body.error);
    }
    assert.equal(pool.some(/INSERT/), false);
    const r = await patch('/api/admin/engine/controls', { webhooks_enabled: false });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, api_enabled: true, webhooks_enabled: false });
    assert.deepEqual(pool.find(/INSERT INTO platform_settings/).params, ['engine_controls', JSON.stringify({ api_enabled: true, webhooks_enabled: false })]);
  });
});

describe('summary / workspaces', () => {
  test('summary: prunes the log, then the three aggregate queries and the controls', async () => {
    const r = await get('/api/admin/engine/summary');
    assert.equal(r.status, 200);
    assert.equal(r.body.pruned, 4);
    assert.deepEqual(r.body.controls, { api_enabled: true, webhooks_enabled: true });
    assert.equal(r.body.requests.requests_24h, 31); assert.equal(r.body.requests.requests_24h_5xx, 1);
    assert.equal(r.body.deliveries.pending, 2); assert.equal(r.body.deliveries.delivered_24h, 9);
    assert.equal(r.body.setup.live_keys, 2);
    assert.ok(pool.some(/DELETE FROM engine_api_requests WHERE created_at < NOW\(\) - make_interval\(days => \$1\)/));
    assert.match(pool.find(/FROM engine_api_requests WHERE created_at >= NOW\(\) - INTERVAL '24 hours'/).sql, /COUNT\(\*\) FILTER \(WHERE status >= 500\)::int AS requests_24h_5xx/);
  });
  test('workspaces: every workspace with its Engine setup', async () => {
    const r = await get('/api/admin/engine/workspaces');
    assert.equal(r.body.workspaces[0].name, 'Acme'); assert.equal(r.body.workspaces[0].live_keys, 2);
    assert.match(pool.find(/FROM workspaces w/).sql, /revoked_at IS NULL/);
  });
});

describe('requests', () => {
  test('defaults: all answers, newest first, LIMIT 200; joins workspace name and key name/prefix, never the key', async () => {
    const r = await get('/api/admin/engine/requests');
    assert.equal(r.status, 200); assert.equal(r.body.requests.length, 1);
    const q = pool.find(/FROM engine_api_requests r/);
    assert.deepEqual(q.params, [200]);
    assert.doesNotMatch(q.sql, /WHERE/);
    assert.match(q.sql, /LEFT JOIN api_keys\s+k ON k\.id = r\.api_key_id/); assert.doesNotMatch(q.sql, /key_hash/);
    assert.match(q.sql, /ORDER BY r\.created_at DESC, r\.id DESC/);
  });
  test('filters: workspace_id and status=errors|ok become WHERE clauses; limit is honoured', async () => {
    await get('/api/admin/engine/requests?workspace_id=7&status=errors&limit=50');
    let q = pool.find(/FROM engine_api_requests r/);
    assert.match(q.sql, /WHERE r\.workspace_id = \$1 AND r\.status >= 400/); assert.deepEqual(q.params, [7, 50]);
    pool.reset(); await get('/api/admin/engine/requests?status=ok');
    q = pool.find(/FROM engine_api_requests r/); assert.match(q.sql, /WHERE r\.status < 400/);
  });
  test('400 for a bad limit, workspace or status', async () => {
    for (const qs of ['limit=0', 'limit=501', 'limit=x', 'workspace_id=abc', 'workspace_id=-1', 'status=weird']) {
      assert.equal((await get(`/api/admin/engine/requests?${qs}`)).status, 400, qs);
    }
    assert.equal(pool.some(/FROM engine_api_requests r/), false);
  });
});

describe('deliveries', () => {
  test('defaults and joins (deal and contact scoped to the delivery\'s workspace); payload included, raw_body not', async () => {
    const r = await get('/api/admin/engine/deliveries');
    assert.equal(r.status, 200); assert.equal(r.body.deliveries.length, 1);
    const q = pool.find(/FROM engine_deliveries d/);
    assert.deepEqual(q.params, [200]);
    assert.match(q.sql, /LEFT JOIN deals\s+dl ON dl\.id = d\.deal_id\s+AND dl\.workspace_id = d\.workspace_id/);
    assert.match(q.sql, /LEFT JOIN contacts\s+c\s+ON c\.id\s+= d\.contact_id AND c\.workspace_id\s+= d\.workspace_id/);
    assert.match(q.sql, /d\.payload/); assert.doesNotMatch(q.sql, /raw_body/);
  });
  test('filters: workspace and a delivery status; invalid status → 400', async () => {
    await get('/api/admin/engine/deliveries?workspace_id=7&status=failed&limit=10');
    const q = pool.find(/FROM engine_deliveries d/);
    assert.match(q.sql, /WHERE d\.workspace_id = \$1 AND d\.status = \$2/); assert.deepEqual(q.params, [7, 'failed', 10]);
    assert.equal((await get('/api/admin/engine/deliveries?status=dead')).status, 400);
  });
});
