// ROUTE tests for /api/engine: lazy creation seeded from the Analytics won
// stages, owner/admin-only writes, URL validation, stage-id scoping, secret
// rotation, the delivery log and the test event. Two servers are built from
// the same route file, one as owner and one as member.
const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const state = { row: null, calls: [], insertConflict: false, keys: new Map(), keyHashes: new Map(), nextKeyId: 1 };
const KEY_COLS = ['id', 'name', 'key_prefix', 'created_at', 'last_used_at', 'expires_at', 'revoked_at'];   // what RETURNING / SELECT hand back — never key_hash
const keyView = k => Object.fromEntries(KEY_COLS.map(c => [c, k[c] ?? null]));
const STAGES = [
  { id: 4, name: 'Won',             color: '#2a2', pipeline_id: 1, pipeline_name: 'Sales' },
  { id: 5, name: 'Contract Signed', color: '#22a', pipeline_id: 1, pipeline_name: 'Sales' },
];
const pool = {
  query: async (sql, params) => {
    state.calls.push({ sql, params });
    if (/FROM workspace_engine WHERE workspace_id/.test(sql))   return { rows: state.row ? [state.row] : [] };
    if (/^SELECT id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at FROM api_keys WHERE workspace_id=\$1/.test(sql)) {
      return { rows: [...state.keys.values()].filter(k => k.workspace_id === params[0]).map(keyView) };
    }
    if (sql.startsWith('INSERT INTO api_keys')) {
      const id = state.nextKeyId++;
      const k = { id, workspace_id: params[0], name: params[1], key_prefix: params[2], created_by: params[4], created_at: '2026-10-09T10:00:00.000Z', last_used_at: null, expires_at: null, revoked_at: null };
      state.keys.set(id, k); state.keyHashes.set(id, params[3]);
      return { rows: [keyView(k)] };
    }
    if (sql.startsWith('UPDATE api_keys SET revoked_at=NOW()')) {
      const k = state.keys.get(params[0]);
      if (!k || k.workspace_id !== params[1] || k.revoked_at) return { rowCount: 0, rows: [] };
      k.revoked_at = '2026-10-09T11:00:00.000Z';
      return { rowCount: 1, rows: [] };
    }
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
    if (/^SELECT id, event, status, attempts, raw_body, payload FROM engine_deliveries WHERE id=\$1 AND workspace_id=\$2/.test(sql)) {
      return { rows: state.delivery && state.delivery.id === params[0] && params[1] === 7 ? [state.delivery] : [] };
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
    assert.equal(r.body.delivery.next_attempt_at, null, 'a test ping is never handed to the retry worker');
  });
});

describe('POST /api/engine/deliveries/:id/retry', () => {
  const FAILED = { id: 9, event: 'vertrag.unterschrieben', status: 'failed', attempts: 7, raw_body: '{"event":"vertrag.unterschrieben","kunde_id":42}', payload: { event: 'vertrag.unterschrieben', kunde_id: 42 } };
  let calls;
  beforeEach(async () => {
    await owner.request('GET', '/api/engine/settings');
    state.row = { ...state.row, engine_url: 'https://engine.example/hook' };
    state.delivery = { ...FAILED };
    state.calls.length = 0;
    calls = [];
    engine.configure({ fetch: async (url, init) => { calls.push({ url, init }); return { status: 200, text: async () => '' }; } });
  });
  test('member: 403, nothing read or sent', async () => {
    const r = await member.request('POST', '/api/engine/deliveries/9/retry', {});
    assert.equal(r.status, 403);
    assert.equal(calls.length, 0);
    assert.equal(state.calls.some(c => c.sql.includes('engine_deliveries')), false);
  });
  test('bad id: 400; unknown or other-workspace id: 404 (the lookup is scoped)', async () => {
    assert.equal((await owner.request('POST', '/api/engine/deliveries/abc/retry', {})).status, 400);
    const r = await owner.request('POST', '/api/engine/deliveries/12/retry', {});
    assert.equal(r.status, 404);
    const q = state.calls.find(c => /FROM engine_deliveries WHERE id=\$1 AND workspace_id=\$2/.test(c.sql));
    assert.deepEqual(q.params, [12, 7]);
    assert.equal(calls.length, 0);
  });
  test('already delivered: 409', async () => {
    state.delivery.status = 'success';
    const r = await owner.request('POST', '/api/engine/deliveries/9/retry', {});
    assert.equal(r.status, 409);
    assert.equal(calls.length, 0);
  });
  test('a contract event without kunde_id: 409 with the reason, nothing sent', async () => {
    state.delivery.payload = { event: 'vertrag.unterschrieben', kunde_id: null };
    const r = await owner.request('POST', '/api/engine/deliveries/9/retry', {});
    assert.equal(r.status, 409);
    assert.match(r.body.error, /kunde_id/);
    assert.equal(calls.length, 0);
  });
  test('no Engine URL: 400', async () => {
    state.row = { ...state.row, engine_url: null };
    const r = await owner.request('POST', '/api/engine/deliveries/9/retry', {});
    assert.equal(r.status, 400);
    assert.equal(calls.length, 0);
  });
  test('success: the lease is taken, the stored bytes are sent once with a valid signature, the outcome is returned', async () => {
    const r = await owner.request('POST', '/api/engine/deliveries/9/retry', {});
    assert.equal(r.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://engine.example/hook');
    assert.equal(calls[0].init.body, FAILED.raw_body);
    assert.deepEqual(engine.verify(state.row.webhook_secret, calls[0].init.body, calls[0].init.headers['X-Upgrads-Signature']), { ok: true });
    assert.ok(state.calls.some(c => /SET status='pending', next_attempt_at = NOW\(\) \+ make_interval/.test(c.sql)), 'lease taken first');
    assert.deepEqual(r.body.delivery, { id: 9, status: 'success', attempts: 8, last_status_code: 200, last_error: null, next_attempt_at: null });
  });
  test('a 503 past the schedule: failed and final; with attempts left: pending with the next attempt scheduled', async () => {
    engine.configure({ fetch: async () => ({ status: 503, text: async () => 'down' }) });
    let r = await owner.request('POST', '/api/engine/deliveries/9/retry', {});
    assert.equal(r.status, 200);
    assert.equal(r.body.delivery.status, 'failed');
    assert.equal(r.body.delivery.next_attempt_at, null);
    assert.match(r.body.delivery.last_error, /HTTP 503/);
    state.delivery = { ...FAILED, attempts: 2 };
    r = await owner.request('POST', '/api/engine/deliveries/9/retry', {});
    assert.equal(r.body.delivery.status, 'pending');
    assert.equal(r.body.delivery.attempts, 3);
    assert.ok(new Date(r.body.delivery.next_attempt_at).getTime() - Date.now() > 1_700_000, '≈ +30 min');
  });
});

describe('GET /api/engine/openapi.json (download for the Engine team)', () => {
  test('any member gets the document as an attachment', async () => {
    const r = await fetch(member.base + '/api/engine/openapi.json');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="upgrads-crm-engine-api.openapi.json"');
    const body = await r.json();
    assert.match(body.openapi, /^3\.1\./);
  });
});

describe('API keys (/api/engine/api-keys) — the Engine\'s credentials for /api/kunden', () => {
  const crypto = require('crypto');
  const { hashKey } = require(path.join(ROOT, 'middleware', 'engine-auth.js'));
  beforeEach(() => { state.keys.clear(); state.keyHashes.clear(); state.nextKeyId = 1; });

  test('member: 403 on list, create and revoke; no api_keys statement runs', async () => {
    for (const [m, p, b] of [['GET', '/api/engine/api-keys'], ['POST', '/api/engine/api-keys', { name: 'x' }], ['DELETE', '/api/engine/api-keys/1']]) {
      assert.equal((await member.request(m, p, b)).status, 403, `${m} ${p}`);
    }
    assert.equal(state.calls.some(c => c.sql.includes('api_keys')), false);
  });
  test('POST: upg_live_<32 hex>, returned exactly once; only its SHA-256 and a 12-char prefix are stored; the Engine API lookup would accept it', async () => {
    const r = await owner.request('POST', '/api/engine/api-keys', { name: '  Engine production  ' });
    assert.equal(r.status, 201);
    assert.match(r.body.key, /^upg_live_[0-9a-f]{32}$/);
    assert.equal(r.body.name, 'Engine production', 'trimmed');
    assert.equal(r.body.key_prefix, r.body.key.slice(0, 12));
    assert.equal('key_hash' in r.body, false);
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO api_keys'));
    assert.deepEqual(ins.params, [7, 'Engine production', r.body.key.slice(0, 12), hashKey(r.body.key), 1]);
    assert.equal(ins.params[3], crypto.createHash('sha256').update(r.body.key, 'utf8').digest('hex'));
    assert.equal(state.calls.some(c => (c.params || []).includes(r.body.key)), false, 'the plain key never reaches the database');
    assert.match(ins.sql, /RETURNING id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at$/, 'RETURNING never includes key_hash');

    const g = await owner.request('GET', '/api/engine/api-keys');
    assert.equal(g.status, 200);
    assert.equal(g.body.api_keys.length, 1);
    const k = g.body.api_keys[0];
    assert.equal(k.key, undefined); assert.equal(k.key_hash, undefined);
    assert.equal(k.key_prefix, r.body.key.slice(0, 12));
    assert.equal(k.revoked_at, null);
    const list = state.calls.find(c => /FROM api_keys WHERE workspace_id=\$1/.test(c.sql));
    assert.deepEqual(list.params, [7]);
    assert.doesNotMatch(list.sql, /key_hash/);
  });
  test('two keys never share a hash or a prefix-visible value; the name is capped at 100 characters', async () => {
    const a = await owner.request('POST', '/api/engine/api-keys', { name: 'a'.repeat(150) });
    const b = await owner.request('POST', '/api/engine/api-keys', { name: 'b' });
    assert.notEqual(a.body.key, b.body.key);
    assert.notEqual(state.keyHashes.get(1), state.keyHashes.get(2));
    assert.equal(a.body.name.length, 100);
  });
  test('missing or blank name → 400, nothing inserted', async () => {
    for (const body of [{}, { name: '' }, { name: '   ' }, { name: 42 }]) {
      assert.equal((await owner.request('POST', '/api/engine/api-keys', body)).status, 400, JSON.stringify(body));
    }
    assert.equal(state.calls.some(c => c.sql.startsWith('INSERT INTO api_keys')), false);
  });
  test('DELETE revokes once (scoped to the workspace): 200, then 404; unknown id 404; bad id 400', async () => {
    const r = await owner.request('POST', '/api/engine/api-keys', { name: 'k' });
    const del = await owner.request('DELETE', `/api/engine/api-keys/${r.body.id}`);
    assert.equal(del.status, 200);
    const q = state.calls.find(c => c.sql.startsWith('UPDATE api_keys SET revoked_at=NOW()'));
    assert.match(q.sql, /WHERE id=\$1 AND workspace_id=\$2 AND revoked_at IS NULL/);
    assert.deepEqual(q.params, [r.body.id, 7]);
    assert.ok(state.keys.get(r.body.id).revoked_at);
    assert.equal((await owner.request('DELETE', `/api/engine/api-keys/${r.body.id}`)).status, 404, 'already revoked');
    assert.equal((await owner.request('DELETE', '/api/engine/api-keys/999')).status, 404);
    assert.equal((await owner.request('DELETE', '/api/engine/api-keys/abc')).status, 400);
    const g = await owner.request('GET', '/api/engine/api-keys');
    assert.ok(g.body.api_keys[0].revoked_at, 'revoked keys stay in the list, marked');
  });
});
