// ROUTE tests for /api/engine: lazy creation seeded from the Analytics won
// stages, owner/admin-only writes, URL validation, stage-id scoping, secret
// rotation, the delivery log and the test event. Two servers are built from
// the same route file, one as owner and one as member.
const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const state = { row: null, calls: [], insertConflict: false };
const STAGES = [
  { id: 4, name: 'Won',             color: '#2a2', pipeline_id: 1, pipeline_name: 'Sales' },
  { id: 5, name: 'Contract Signed', color: '#22a', pipeline_id: 1, pipeline_name: 'Sales' },
];
const pool = {
  query: async (sql, params) => {
    state.calls.push({ sql, params });
    if (/FROM workspace_engine WHERE workspace_id/.test(sql))   return { rows: state.row ? [state.row] : [] };
    if (sql.includes('SELECT analytics_config'))               return { rows: [{ analytics_config: { won_stage_ids: [4, '5'], lost_stage_ids: [6] } }] };
    if (sql.includes('INSERT INTO workspace_engine')) {
      if (state.insertConflict) {
        // Another request created the row first: ON CONFLICT DO NOTHING returns no row.
        state.row = { id: 1, workspace_id: params[0], engine_url: null, active: false, trigger_stage_ids: [4], webhook_secret: 'f'.repeat(64), created_at: 'c', updated_at: 'u' };
        return { rows: [] };
      }
      state.row = { id: 1, workspace_id: params[0], engine_url: null, active: false, trigger_stage_ids: JSON.parse(params[2]), webhook_secret: params[1], created_at: 'c', updated_at: 'u' };
      return { rows: [state.row] };
    }
    if (/FROM pipeline_stages ps JOIN pipelines/.test(sql))    return { rows: STAGES };
    if (/SELECT id FROM pipeline_stages WHERE workspace_id=\$1 AND id = ANY/.test(sql)) {
      return { rows: STAGES.filter(s => params[1].includes(s.id)).map(s => ({ id: s.id })) };
    }
    if (sql.includes('UPDATE workspace_engine')) {
      if (!state.row) return { rowCount: 0, rows: [] };
      if (sql.includes('webhook_secret=')) state.row = { ...state.row, webhook_secret: params[0] };
      else state.row = { ...state.row, engine_url: params[0], active: params[1], trigger_stage_ids: params[2] === null ? state.row.trigger_stage_ids : JSON.parse(params[2]) };
      return { rowCount: 1, rows: [state.row] };
    }
    if (sql.includes('FROM engine_deliveries'))                return { rows: [{ id: 9, event: 'vertrag.unterschrieben', status: 'success' }] };
    if (sql.includes('INSERT INTO engine_deliveries'))         return { rows: [{ id: 10 }] };
    if (sql.includes('UPDATE engine_deliveries'))              return { rowCount: 1, rows: [] };
    return { rows: [] };
  },
};

let owner, member, engine;
before(async () => {
  delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
  owner  = await serve({ '/api/engine': loadRoute('engine.js', { pool, user: { id: 1, workspaceId: 7, role: 'owner' } }) });
  member = await serve({ '/api/engine': loadRoute('engine.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } }) });
  engine = require(path.join(ROOT, 'utils', 'engine.js'));
});
after(async () => { await owner.close(); await member.close(); });
beforeEach(() => { state.row = null; state.calls.length = 0; state.insertConflict = false; });
afterEach(() => engine.resetConfig());

const HEX64 = /^[0-9a-f]{64}$/;

describe('GET /api/engine/settings', () => {
  test('first call creates the row: 64-hex secret, trigger stages seeded from the won stages', async () => {
    const r = await owner.request('GET', '/api/engine/settings');
    assert.equal(r.status, 200);
    const ins = state.calls.find(c => c.sql.includes('INSERT INTO workspace_engine'));
    assert.ok(ins, 'row inserted');
    assert.equal(ins.params[0], 7);
    assert.match(ins.params[1], HEX64);
    assert.deepEqual(JSON.parse(ins.params[2]), [4, 5]);
    assert.deepEqual(r.body.engine.trigger_stage_ids, [4, 5]);
    assert.equal(r.body.engine.active, false);
    assert.equal(r.body.engine.engine_url, null);
    assert.match(r.body.engine.webhook_secret, HEX64);
    assert.equal(r.body.can_manage, true);
    assert.equal(r.body.stages.length, 2);
    assert.equal(r.body.stages[0].pipeline_id, 1);
  });
  test('second call reuses the row', async () => {
    await owner.request('GET', '/api/engine/settings');
    state.calls.length = 0;
    const r = await owner.request('GET', '/api/engine/settings');
    assert.equal(r.status, 200);
    assert.equal(state.calls.filter(c => c.sql.includes('INSERT INTO workspace_engine')).length, 0);
  });
  test('two first visits at once: the insert uses ON CONFLICT and the loser re-reads the winner\'s row', async () => {
    state.insertConflict = true;
    const r = await owner.request('GET', '/api/engine/settings');
    assert.equal(r.status, 200);
    const ins = state.calls.find(c => c.sql.includes('INSERT INTO workspace_engine'));
    assert.match(ins.sql, /ON CONFLICT \(workspace_id\) DO NOTHING/);
    assert.equal(r.body.engine.webhook_secret, 'f'.repeat(64), 'the row that won is returned');
    assert.deepEqual(r.body.engine.trigger_stage_ids, [4]);
  });
  test('a member sees the settings but never the secret', async () => {
    const r = await member.request('GET', '/api/engine/settings');
    assert.equal(r.status, 200);
    assert.equal(r.body.can_manage, false);
    assert.equal(r.body.engine.webhook_secret, null);
    assert.deepEqual(r.body.engine.trigger_stage_ids, [4, 5]);
  });
});

describe('PATCH /api/engine/settings', () => {
  beforeEach(async () => { await owner.request('GET', '/api/engine/settings'); state.calls.length = 0; });

  test('member: 403 and no UPDATE', async () => {
    const r = await member.request('PATCH', '/api/engine/settings', { engine_url: 'https://x.example', active: false, trigger_stage_ids: [5] });
    assert.equal(r.status, 403);
    assert.equal(state.calls.filter(c => c.sql.includes('UPDATE workspace_engine')).length, 0);
  });
  for (const bad of ['ftp://engine.example/hook', 'javascript:alert(1)', 'not a url', 'engine.example/hook']) {
    test(`rejects URL "${bad}"`, async () => {
      const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: bad, active: false, trigger_stage_ids: [] });
      assert.equal(r.status, 400);
      assert.match(r.body.error, /http/i);
      assert.equal(state.calls.filter(c => c.sql.includes('UPDATE workspace_engine')).length, 0);
    });
  }
  for (const priv of ['http://127.0.0.1/hook', 'http://localhost:3000/hook', 'https://169.254.169.254/latest/meta-data', 'http://10.0.0.5/hook', 'http://192.168.1.10/hook', 'http://172.16.0.1/hook', 'http://[::1]/hook', 'http://[fe80::1]/hook', 'http://0.0.0.0/hook']) {
    test(`rejects private or loopback host "${priv}" (no server-side requests into the network)`, async () => {
      const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: priv, active: false, trigger_stage_ids: [] });
      assert.equal(r.status, 400);
      assert.match(r.body.error, /private|internal|loopback/i);
      assert.equal(state.calls.filter(c => c.sql.includes('UPDATE workspace_engine')).length, 0);
    });
  }
  test('a public host is accepted', async () => {
    const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: 'https://engine.upgrads.de/webhooks/crm', active: false, trigger_stage_ids: [] });
    assert.equal(r.status, 200);
  });
  test('activating without a URL is refused', async () => {
    const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: '', active: true, trigger_stage_ids: [5] });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /URL/);
  });
  test('trigger_stage_ids must be an array', async () => {
    const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: 'https://x.example', active: false, trigger_stage_ids: 'x' });
    assert.equal(r.status, 400);
  });
  test('valid save: trims the URL, keeps only stages that belong to the workspace, returns the row', async () => {
    const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: '  https://engine.example/hook  ', active: true, trigger_stage_ids: ['5', 999, 'abc', -1] });
    assert.equal(r.status, 200);
    const scope = state.calls.find(c => /id = ANY\(\$2::int\[\]\)/.test(c.sql));
    assert.ok(scope, 'stage ids are checked against the workspace');
    assert.deepEqual(scope.params, [7, [5, 999]]);
    const upd = state.calls.find(c => c.sql.includes('UPDATE workspace_engine'));
    assert.equal(upd.params[0], 'https://engine.example/hook');
    assert.equal(upd.params[1], true);
    assert.deepEqual(JSON.parse(upd.params[2]), [5]);
    assert.equal(upd.params.at(-1), 7, 'scoped by workspace');
    assert.deepEqual(r.body.engine.trigger_stage_ids, [5]);
    assert.equal(r.body.engine.active, true);
  });
  test('an empty URL clears it and deactivates', async () => {
    const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: '', active: false, trigger_stage_ids: [] });
    assert.equal(r.status, 200);
    const upd = state.calls.find(c => c.sql.includes('UPDATE workspace_engine'));
    assert.equal(upd.params[0], null);
    assert.equal(upd.params[1], false);
  });
  test('omitting trigger_stage_ids keeps the stored list', async () => {
    const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: 'https://x.example', active: false });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.engine.trigger_stage_ids, [4, 5]);
  });
  test('no row yet: 404', async () => {
    state.row = null;
    const r = await owner.request('PATCH', '/api/engine/settings', { engine_url: 'https://x.example', active: false, trigger_stage_ids: [] });
    assert.equal(r.status, 404);
  });
});

describe('POST /api/engine/settings/regenerate-secret', () => {
  beforeEach(async () => { await owner.request('GET', '/api/engine/settings'); state.calls.length = 0; });
  test('owner gets a fresh 64-hex secret, different from the old one', async () => {
    const old = state.row.webhook_secret;
    const r = await owner.request('POST', '/api/engine/settings/regenerate-secret', {});
    assert.equal(r.status, 200);
    assert.match(r.body.webhook_secret, HEX64);
    assert.notEqual(r.body.webhook_secret, old);
    const upd = state.calls.find(c => c.sql.includes('UPDATE workspace_engine'));
    assert.equal(upd.params.at(-1), 7);
  });
  test('member: 403', async () => {
    const r = await member.request('POST', '/api/engine/settings/regenerate-secret', {});
    assert.equal(r.status, 403);
  });
});

describe('GET /api/engine/deliveries', () => {
  test('last 50 for the workspace, newest first', async () => {
    const r = await owner.request('GET', '/api/engine/deliveries');
    assert.equal(r.status, 200);
    assert.equal(r.body.deliveries.length, 1);
    const q = state.calls.find(c => c.sql.includes('FROM engine_deliveries'));
    assert.match(q.sql, /d\.workspace_id\s*=\s*\$1/);
    assert.match(q.sql, /dl\.workspace_id\s*=\s*d\.workspace_id/, 'deal join scoped to the same workspace');
    assert.match(q.sql, /c\.workspace_id\s*=\s*d\.workspace_id/, 'contact join scoped to the same workspace');
    assert.match(q.sql, /ORDER BY d\.created_at DESC/);
    assert.match(q.sql, /LIMIT 50/);
    assert.deepEqual(q.params, [7]);
  });
  test('members may read the log', async () => {
    const r = await member.request('GET', '/api/engine/deliveries');
    assert.equal(r.status, 200);
  });
});

describe('POST /api/engine/test-event', () => {
  beforeEach(async () => { await owner.request('GET', '/api/engine/settings'); state.calls.length = 0; });
  test('member: 403', async () => {
    const r = await member.request('POST', '/api/engine/test-event', {});
    assert.equal(r.status, 403);
  });
  test('without a URL: 400 and nothing sent', async () => {
    let called = 0; engine.configure({ fetch: async () => { called++; return { status: 200, text: async () => '' }; } });
    const r = await owner.request('POST', '/api/engine/test-event', {});
    assert.equal(r.status, 400);
    assert.equal(called, 0);
  });
  test('with a URL: one test.ping, outcome in the body', async () => {
    state.row = { ...state.row, engine_url: 'https://engine.example/hook' };
    const calls = [];
    engine.configure({ fetch: async (url, init) => { calls.push({ url, init }); return { status: 503, text: async () => 'down' }; } });
    const r = await owner.request('POST', '/api/engine/test-event', {});
    assert.equal(r.status, 200);
    assert.equal(calls.length, 1, 'a test event is never retried');
    assert.equal(calls[0].init.headers['X-Upgrads-Event'], 'test.ping');
    assert.equal(r.body.delivery.status, 'failed');
    assert.equal(r.body.delivery.last_status_code, 503);
    assert.match(r.body.delivery.last_error, /HTTP 503/);
    assert.equal(r.body.delivery.attempts, 1);
  });
});
