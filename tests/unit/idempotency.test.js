// UNIT tests for utils/idempotency.js. The fake pool keeps an in-memory table
// keyed by "workspace:key" so the SELECT / INSERT / UPDATE / DELETE the util
// issues behave like the real idempotency_keys table (including the UNIQUE).
const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { inject, ROOT } = require('../helpers/load-route');

const table = new Map();
const k = (wid, key) => `${wid}:${key}`;
let pool, runIdempotent, requestHash;

before(() => {
  pool = createFakePool([
    { match: /^SELECT request_hash, response_status, response_body, expires_at FROM idempotency_keys/, reply: p => ({ rows: table.has(k(p[0], p[1])) ? [table.get(k(p[0], p[1]))] : [] }) },
    { match: /^INSERT INTO idempotency_keys/, reply: p => {
        if (table.has(k(p[0], p[1]))) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
        table.set(k(p[0], p[1]), { request_hash: p[2], response_status: null, response_body: null, expires_at: new Date(Date.now() + 86_400_000) });
        return { rows: [], rowCount: 1 };
      } },
    { match: /^UPDATE idempotency_keys SET response_status/, reply: p => { const row = table.get(k(p[0], p[1])); if (row) { row.response_status = p[2]; row.response_body = JSON.parse(p[3]); } return { rows: [], rowCount: row ? 1 : 0 }; } },
    { match: /^DELETE FROM idempotency_keys/, reply: p => ({ rows: [], rowCount: table.delete(k(p[0], p[1])) ? 1 : 0 }) },
  ]);
  inject('db.js', { pool });
  const abs = path.join(ROOT, 'utils', 'idempotency.js'); delete require.cache[abs];
  ({ runIdempotent, requestHash } = require(abs));
});
beforeEach(() => { pool.reset(); table.clear(); });

function fakeReq({ headers = {}, method = 'POST', url = '/api/engine/kontakte', body = { name: 'A' }, workspaceId = 7 } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([a, b]) => [a.toLowerCase(), b]));
  return { method, originalUrl: url, url, body, workspaceId, get: n => h[n.toLowerCase()] };
}
function fakeRes() { return { code: 200, body: undefined, headers: {}, sent: false, status(c) { this.code = c; return this; }, json(b) { this.body = b; this.sent = true; return this; }, set(a, b) { this.headers[a.toLowerCase()] = b; return this; } }; }
const handler = () => { let calls = 0; const fn = async (req, res) => { calls++; res.status(201).json({ id: 42, name: req.body.name }); }; fn.calls = () => calls; return fn; };

describe('header validation', () => {
  test('missing Idempotency-Key -> 400 with the German shape; handler not called; no SQL', async () => {
    const fn = handler(); const res = fakeRes();
    await runIdempotent(fakeReq(), res, fn);
    assert.equal(res.code, 400);
    assert.deepEqual(res.body, { fehler: { code: 'idempotency_key_fehlt', nachricht: 'Header Idempotency-Key ist erforderlich.' } });
    assert.equal(fn.calls(), 0);
    assert.equal(pool.log.length, 0);
  });
  test('a key over 255 characters -> 400 idempotency_key_ungueltig', async () => {
    const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'x'.repeat(256) } }), res, handler());
    assert.equal(res.code, 400);
    assert.equal(res.body.fehler.code, 'idempotency_key_ungueltig');
  });
  test('no workspace on the request (engineAuth did not run) -> 401', async () => {
    const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k' }, workspaceId: null }), res, handler());   // null, not undefined: undefined would take the default (7)
    assert.equal(res.code, 401);
    assert.equal(res.body.fehler.code, 'nicht_authentifiziert');
  });
});

describe('first request, then replay', () => {
  test('first request: reserve, run the handler once, store status+body, send it', async () => {
    const fn = handler(); const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k1' } }), res, fn);
    assert.equal(res.code, 201);
    assert.deepEqual(res.body, { id: 42, name: 'A' });
    assert.equal(fn.calls(), 1);
    assert.deepEqual(pool.find(/^INSERT INTO idempotency_keys/).params.slice(0, 2), [7, 'k1']);
    const upd = pool.find(/^UPDATE idempotency_keys/);
    assert.deepEqual(upd.params, [7, 'k1', 201, JSON.stringify({ id: 42, name: 'A' })]);
    assert.equal(table.get('7:k1').response_status, 201);
  });
  test('identical retry: stored response replayed, handler NOT called, Idempotent-Replayed header', async () => {
    const fn = handler();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k1' } }), fakeRes(), fn);
    pool.reset();
    const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k1' } }), res, fn);
    assert.equal(fn.calls(), 1);
    assert.equal(res.code, 201);
    assert.deepEqual(res.body, { id: 42, name: 'A' });
    assert.equal(res.headers['idempotent-replayed'], 'true');
    assert.equal(pool.some(/^INSERT|^UPDATE/), false);
  });
  test('a 4xx outcome is stored and replayed the same way', async () => {
    const fn = async (req, res) => res.status(400).json({ fehler: { code: 'x', nachricht: 'y' } });
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k4' } }), fakeRes(), fn);
    const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k4' } }), res, async () => { throw new Error('must not run'); });
    assert.equal(res.code, 400);
    assert.equal(res.body.fehler.code, 'x');
  });
});

describe('conflicts and races', () => {
  test('same key, different payload -> 422 konflikt; handler not called', async () => {
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k2' }, body: { name: 'A' } }), fakeRes(), handler());
    const fn = handler(); const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k2' }, body: { name: 'B' } }), res, fn);
    assert.equal(res.code, 422);
    assert.equal(res.body.fehler.code, 'idempotency_key_konflikt');
    assert.equal(fn.calls(), 0);
  });
  test('a key whose first request is still running -> 409', async () => {
    table.set('7:k3', { request_hash: requestHash(fakeReq()), response_status: null, response_body: null, expires_at: new Date(Date.now() + 1000) });
    const fn = handler(); const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k3' } }), res, fn);
    assert.equal(res.code, 409);
    assert.equal(res.body.fehler.code, 'anfrage_in_bearbeitung');
    assert.equal(fn.calls(), 0);
  });
  test('losing the INSERT race (23505) -> 409', async () => {
    // Simulate a twin inserting between our SELECT (miss) and INSERT: prime the table after the SELECT rule ran once.
    const racy = createFakePool([
      { match: /^SELECT request_hash/, reply: () => ({ rows: [] }) },
      { match: /^INSERT INTO idempotency_keys/, reply: () => { const e = new Error('dup'); e.code = '23505'; throw e; } },
    ]);
    inject('db.js', { pool: racy });
    const abs = path.join(ROOT, 'utils', 'idempotency.js'); delete require.cache[abs];
    const { runIdempotent: ri } = require(abs);
    const res = fakeRes();
    await ri(fakeReq({ headers: { 'Idempotency-Key': 'k5' } }), res, handler());
    assert.equal(res.code, 409);
    inject('db.js', { pool }); delete require.cache[abs]; ({ runIdempotent, requestHash } = require(abs));
  });
  test('handler throws -> reservation released, error propagates, nothing stored', async () => {
    const res = fakeRes();
    await assert.rejects(runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k6' } }), res, async () => { throw new Error('boom'); }), /boom/);
    assert.equal(table.has('7:k6'), false);
    assert.ok(pool.some(/^DELETE FROM idempotency_keys/));
  });
  test('an expired row is discarded and the request runs fresh', async () => {
    table.set('7:k7', { request_hash: 'old', response_status: 200, response_body: { stale: true }, expires_at: new Date(Date.now() - 1000) });
    const fn = handler(); const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k7' } }), res, fn);
    assert.equal(fn.calls(), 1);
    assert.equal(res.code, 201);
    assert.equal(table.get('7:k7').response_status, 201);
  });
  test('a handler that returns { status, body } instead of writing is also captured', async () => {
    const res = fakeRes();
    await runIdempotent(fakeReq({ headers: { 'Idempotency-Key': 'k8' } }), res, async () => ({ status: 202, body: { ok: true } }));
    assert.equal(res.code, 202);
    assert.equal(table.get('7:k8').response_status, 202);
  });
});

describe('requestHash', () => {
  test('is stable under object key order and differs by method, path and body', () => {
    const a = requestHash(fakeReq({ body: { a: 1, b: { c: 2, d: [1, 2] } } }));
    const b = requestHash(fakeReq({ body: { b: { d: [1, 2], c: 2 }, a: 1 } }));
    assert.equal(a, b);
    assert.notEqual(a, requestHash(fakeReq({ body: { a: 1, b: { c: 2, d: [2, 1] } } })));
    assert.notEqual(a, requestHash(fakeReq({ method: 'PUT', body: { a: 1, b: { c: 2, d: [1, 2] } } })));
    assert.notEqual(a, requestHash(fakeReq({ url: '/other', body: { a: 1, b: { c: 2, d: [1, 2] } } })));
  });
});
