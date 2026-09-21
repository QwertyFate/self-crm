// ROUTE test: engineAuth + runIdempotent composed around a write handler, over
// real HTTP — the exact path a real engine call takes.
const { test, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const path    = require('path');
const express = require('express');
const { createFakePool } = require('../helpers/fake-pool');
const { idempotencyTable, apiKeyRules } = require('../helpers/fake-tables');
const { inject, ROOT } = require('../helpers/load-route');

const KEY = 'upg_live_0123456789abcdef';
const idem = idempotencyTable();
const keys = apiKeyRules(KEY);
let pool, restore, server, handlerCalls = 0;

before(async () => {
  pool = createFakePool([...keys.rules, ...idem.rules]);
  restore = inject('db.js', { pool });
  for (const f of ['middleware/engine-auth.js', 'utils/idempotency.js']) delete require.cache[path.join(ROOT, f)];
  const engineAuth = require(path.join(ROOT, 'middleware', 'engine-auth.js'));
  const { runIdempotent } = require(path.join(ROOT, 'utils', 'idempotency.js'));

  // A hand-built app: the router under test is a single composed handler, not a route file.
  const app = express(); app.use(express.json());
  app.post('/api/engine/kontakte', engineAuth, (req, res, next) =>
    runIdempotent(req, res, async (req, res) => { handlerCalls++; res.status(201).json({ id: 42, workspace: req.workspaceId, name: req.body.name }); }).catch(next));
  app.use((err, _q, res, _n) => res.status(500).json({ fehler: { code: 'serverfehler', nachricht: err.message } }));
  const s = await new Promise(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  server = { base: `http://127.0.0.1:${s.address().port}`, close: () => new Promise(r => { s.closeAllConnections?.(); s.close(r); }) };
});
after(async () => { await server.close(); restore(); });
beforeEach(() => { pool.reset(); idem.table.clear(); handlerCalls = 0; });

async function post(headers, body) {
  const r = await fetch(`${server.base}/api/engine/kontakte`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
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

test("first call runs the handler in the key's workspace; the identical retry is replayed", async () => {
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
