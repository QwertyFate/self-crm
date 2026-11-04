// ROUTE test: engineAuth + runIdempotent composed around a write handler, over
// real HTTP — the exact path a real engine call will take once routes exist.
const { test, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const crypto  = require('crypto');
const path    = require('path');
const express = require('express');
const { createFakePool } = require('../helpers/fake-pool');
const { inject, ROOT } = require('../helpers/load-route');

const KEY  = 'upg_live_0123456789abcdef';
const HASH = crypto.createHash('sha256').update(KEY).digest('hex');
const table = new Map();
const k = (wid, key) => `${wid}:${key}`;
let pool, server, handlerCalls = 0;

before(async () => {
  pool = createFakePool([
    { match: /FROM api_keys WHERE key_hash = \$1/, reply: p => ({ rows: p[0] === HASH ? [{ id: 5, workspace_id: 7, scopes: ['kontakte:schreiben'] }] : [] }) },
    { match: /^UPDATE api_keys SET last_used_at/,  reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /^SELECT request_hash, response_status, response_body, expires_at FROM idempotency_keys/, reply: p => ({ rows: table.has(k(p[0], p[1])) ? [table.get(k(p[0], p[1]))] : [] }) },
    { match: /^INSERT INTO idempotency_keys/, reply: p => { if (table.has(k(p[0], p[1]))) { const e = new Error('dup'); e.code = '23505'; throw e; } table.set(k(p[0], p[1]), { request_hash: p[2], response_status: null, response_body: null, expires_at: new Date(Date.now() + 86_400_000) }); return { rows: [], rowCount: 1 }; } },
    { match: /^UPDATE idempotency_keys SET response_status/, reply: p => { const r = table.get(k(p[0], p[1])); if (r) { r.response_status = p[2]; r.response_body = JSON.parse(p[3]); } return { rows: [], rowCount: 1 }; } },
    { match: /^DELETE FROM idempotency_keys/, reply: p => ({ rows: [], rowCount: table.delete(k(p[0], p[1])) ? 1 : 0 }) },
  ]);
  inject('db.js', { pool });
  for (const f of ['middleware/engine-auth.js', 'utils/idempotency.js']) delete require.cache[path.join(ROOT, f)];
  const engineAuth = require(path.join(ROOT, 'middleware', 'engine-auth.js'));
  const { runIdempotent } = require(path.join(ROOT, 'utils', 'idempotency.js'));

  const app = express(); app.use(express.json());
  app.post('/api/engine/kontakte', engineAuth, (req, res, next) =>
    runIdempotent(req, res, async (req, res) => { handlerCalls++; res.status(201).json({ id: 42, workspace: req.workspaceId, name: req.body.name }); }).catch(next));
  app.use((err, _q, res, _n) => res.status(500).json({ fehler: { code: 'serverfehler', nachricht: err.message } }));
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
});
after(() => new Promise(r => server.close(r)));
beforeEach(() => { pool.reset(); table.clear(); handlerCalls = 0; });

async function post(headers, body) {
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/engine/kontakte`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json(), headers: r.headers };
}

test('no key -> 401 German shape, handler never runs', async () => {
  const r = await post({ 'Idempotency-Key': 'a' }, { name: 'X' });
  assert.equal(r.status, 401);
  assert.equal(r.body.fehler.code, 'nicht_authentifiziert');
  assert.equal(r.headers.get('www-authenticate'), 'Bearer');
  assert.equal(handlerCalls, 0);
});

test('valid key but no Idempotency-Key -> 400', async () => {
  const r = await post({ Authorization: `Bearer ${KEY}` }, { name: 'X' });
  assert.equal(r.status, 400);
  assert.equal(r.body.fehler.code, 'idempotency_key_fehlt');
  assert.equal(handlerCalls, 0);
});

test('first call runs the handler in the key\'s workspace; the identical retry is replayed', async () => {
  const h = { Authorization: `Bearer ${KEY}`, 'Idempotency-Key': 'req-1' };
  const first = await post(h, { name: 'Muster GmbH' });
  assert.equal(first.status, 201);
  assert.deepEqual(first.body, { id: 42, workspace: 7, name: 'Muster GmbH' });
  assert.equal(first.headers.get('idempotent-replayed'), null);

  const retry = await post(h, { name: 'Muster GmbH' });
  assert.equal(retry.status, 201);
  assert.deepEqual(retry.body, first.body);
  assert.equal(retry.headers.get('idempotent-replayed'), 'true');
  assert.equal(handlerCalls, 1);
});

test('same key with a different payload -> 422', async () => {
  const h = { Authorization: `Bearer ${KEY}`, 'Idempotency-Key': 'req-2' };
  await post(h, { name: 'A' });
  const r = await post(h, { name: 'B' });
  assert.equal(r.status, 422);
  assert.equal(r.body.fehler.code, 'idempotency_key_konflikt');
  assert.equal(handlerCalls, 1);
});
