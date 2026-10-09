// UNIT tests for middleware/engine-request-log.js over real HTTP: one row per
// Engine API call with who / what / how it went, the fehler code peeked from the
// JSON answer, never the body — and a logging failure that cannot touch the response.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const express = require('express');
const path    = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { inject, ROOT } = require('../helpers/load-route');

const state = { insertFails: false };
let pool, server, log;
before(async () => {
  pool = createFakePool([{ match: /^INSERT INTO engine_api_requests/, reply: () => { if (state.insertFails) throw new Error('db gone'); return { rows: [], rowCount: 1 }; } }]);
  inject('db.js', { pool });
  delete require.cache[path.join(ROOT, 'middleware', 'engine-request-log.js')];
  log = require(path.join(ROOT, 'middleware', 'engine-request-log.js'));

  const app = express();
  app.use(express.json());
  app.use('/api/kunden', log);
  // a stand-in for engineAuth: Bearer ok → workspace 7, key 5; otherwise the Engine's 401
  app.use('/api/kunden', (req, res, next) => {
    if (req.get('authorization') === 'Bearer ok') { req.workspaceId = 7; req.apiKeyId = 5; return next(); }
    res.status(401).json({ fehler: { code: 'nicht_authentifiziert', nachricht: 'x' } });
  });
  app.get('/api/kunden/:id', (req, res) => res.json({ kunde_id: Number(req.params.id) }));
  app.patch('/api/kunden/:id/status', (req, res) => res.status(422).json({ fehler: { code: 'ungueltiger_status', nachricht: 'x' } }));
  app.use('/api/kunden', (req, res) => res.status(404).json({ fehler: { code: 'nicht_gefunden', nachricht: 'x' } }));
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
});
after(() => new Promise(r => server.close(r)));
beforeEach(() => { pool.reset(); state.insertFails = false; });

const base = () => `http://127.0.0.1:${server.address().port}`;
const settle = () => new Promise(r => setTimeout(r, 15));   // the INSERT runs on 'finish', after the response
const inserted = () => pool.find(/^INSERT INTO engine_api_requests/);

describe('what is logged', () => {
  test('a successful call: workspace, key, method, path (no query string), 200, duration, no code, ip', async () => {
    const r = await fetch(`${base()}/api/kunden/42?x=1`, { headers: { Authorization: 'Bearer ok' } });
    assert.equal(r.status, 200); await settle();
    const p = inserted().params;
    assert.deepEqual(p.slice(0, 5), [7, 5, 'GET', '/api/kunden/42', 200]);
    assert.ok(Number.isInteger(p[5]) && p[5] >= 0, 'duration ms');
    assert.equal(p[6], null, 'no fehler code');
    assert.match(String(p[7]), /127\.0\.0\.1/);
    assert.match(inserted().sql, /INSERT INTO engine_api_requests \(workspace_id, api_key_id, method, path, status, duration_ms, fehler_code, ip\)/);
  });
  test('a 401 without a key: workspace and key NULL, the fehler code captured from the JSON answer', async () => {
    await fetch(`${base()}/api/kunden/42`); await settle();
    const p = inserted().params;
    assert.equal(p[0], null); assert.equal(p[1], null); assert.equal(p[4], 401); assert.equal(p[6], 'nicht_authentifiziert');
  });
  test('a 422 from a handler and a 404 from the fallback carry their codes', async () => {
    await fetch(`${base()}/api/kunden/42/status`, { method: 'PATCH', headers: { Authorization: 'Bearer ok', 'Content-Type': 'application/json' }, body: '{}' }); await settle();
    assert.equal(inserted().params[6], 'ungueltiger_status'); assert.equal(inserted().params[2], 'PATCH');
    pool.reset();
    await fetch(`${base()}/api/kunden/42/unbekannt`, { headers: { Authorization: 'Bearer ok' } }); await settle();
    assert.equal(inserted().params[4], 404); assert.equal(inserted().params[6], 'nicht_gefunden');
  });
  test('the path is capped at MAX_PATH characters', async () => {
    await fetch(`${base()}/api/kunden/${'9'.repeat(400)}`, { headers: { Authorization: 'Bearer ok' } }); await settle();
    assert.equal(inserted().params[3].length, log.MAX_PATH);
  });
  test('a failing INSERT never changes the answer; it is a console line', async () => {
    state.insertFails = true;
    const errors = []; const orig = console.error; console.error = (...a) => errors.push(a.join(' '));
    try {
      const r = await fetch(`${base()}/api/kunden/42`, { headers: { Authorization: 'Bearer ok' } });
      assert.equal(r.status, 200); assert.deepEqual(await r.json(), { kunde_id: 42 });
      await settle();
    } finally { console.error = orig; }
    assert.ok(errors.some(e => /engine request log: db gone/.test(e)));
  });
});

describe('pruneEngineRequestLog', () => {
  test('deletes rows older than N days (default 30; nonsense → 30) and returns the count', async () => {
    const p2 = createFakePool([{ match: /^DELETE FROM engine_api_requests/, reply: () => ({ rowCount: 12, rows: [] }) }]);
    inject('db.js', { pool: p2 }); delete require.cache[path.join(ROOT, 'middleware', 'engine-request-log.js')];
    const fresh = require(path.join(ROOT, 'middleware', 'engine-request-log.js'));
    assert.equal(await fresh.pruneEngineRequestLog(), 12);
    assert.deepEqual(p2.find(/DELETE/).params, [30]);
    assert.match(p2.find(/DELETE/).sql, /WHERE created_at < NOW\(\) - make_interval\(days => \$1\)/);
    await fresh.pruneEngineRequestLog(7);  assert.deepEqual(p2.log.at(-1).params, [7]);
    await fresh.pruneEngineRequestLog(-3); assert.deepEqual(p2.log.at(-1).params, [30]);
    inject('db.js', { pool }); delete require.cache[path.join(ROOT, 'middleware', 'engine-request-log.js')];
  });
});
