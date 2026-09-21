// UNIT tests for utils/idempotency.js. The fake pool models idempotency_keys
// in memory (shared helper), so SELECT / INSERT / UPDATE / DELETE behave like
// the real table, including the UNIQUE (workspace_id, key).
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { idempotencyTable } = require('../helpers/fake-tables');
const { fakeReq, fakeRes } = require('../helpers/fake-http');
const { inject, ROOT } = require('../helpers/load-route');

const ABS = path.join(ROOT, 'utils', 'idempotency.js');
const { table, rules } = idempotencyTable();
let pool, restore, runIdempotent, requestHash;

before(() => {
  pool = createFakePool(rules);
  restore = inject('db.js', { pool });
  delete require.cache[ABS];
  ({ runIdempotent, requestHash } = require(ABS));
});
after(() => restore());
beforeEach(() => { pool.reset(); table.clear(); });

const req = (o = {}) => fakeReq({ url: '/api/engine/kontakte', body: { name: 'A' }, workspaceId: 7, ...o });
const handler = () => { let calls = 0; const fn = async (req, res) => { calls++; res.status(201).json({ id: 42, name: req.body.name }); }; fn.calls = () => calls; return fn; };

describe('header validation', () => {
  test('missing Idempotency-Key -> 400 with the German shape; handler not called; no SQL', async () => {
    const fn = handler(); const res = fakeRes();
    await runIdempotent(req(), res, fn);
    assert.equal(res.code, 400);
    assert.deepEqual(res.body, { fehler: { code: 'idempotency_key_fehlt', nachricht: 'Header Idempotency-Key ist erforderlich.' } });
    assert.equal(fn.calls(), 0);
    assert.equal(pool.log.length, 0);
  });
  test('a key over 255 characters -> 400 idempotency_key_ungueltig', async () => {
    const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'x'.repeat(256) } }), res, handler());
    assert.equal(res.code, 400);
    assert.equal(res.body.fehler.code, 'idempotency_key_ungueltig');
  });
  test('no workspace on the request (engineAuth did not run) -> 401', async () => {
    const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k' }, workspaceId: null }), res, handler());
    assert.equal(res.code, 401);
    assert.equal(res.body.fehler.code, 'nicht_authentifiziert');
  });
});

describe('first request, then replay', () => {
  test('first request: reserve, run the handler once, store status+body, send it', async () => {
    const fn = handler(); const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k1' } }), res, fn);
    assert.equal(res.code, 201);
    assert.deepEqual(res.body, { id: 42, name: 'A' });
    assert.equal(fn.calls(), 1);
    assert.deepEqual(pool.find(/^INSERT INTO idempotency_keys/).params.slice(0, 2), [7, 'k1']);
    assert.deepEqual(pool.find(/^UPDATE idempotency_keys/).params, [7, 'k1', 201, JSON.stringify({ id: 42, name: 'A' })]);
    assert.equal(table.get('7:k1').response_status, 201);
  });
  test('identical retry: stored response replayed, handler NOT called, Idempotent-Replayed header', async () => {
    const fn = handler();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k1' } }), fakeRes(), fn);
    pool.reset();
    const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k1' } }), res, fn);
    assert.equal(fn.calls(), 1, 'handler ran only for the first request');
    assert.equal(res.code, 201);
    assert.deepEqual(res.body, { id: 42, name: 'A' });
    assert.equal(res.headers['idempotent-replayed'], 'true');
    assert.equal(pool.writes().length, 0, 'no write on replay');
  });
  test('a 4xx outcome is stored and replayed the same way', async () => {
    const fn = async (req, res) => res.status(400).json({ fehler: { code: 'x', nachricht: 'y' } });
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k4' } }), fakeRes(), fn);
    const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k4' } }), res, async () => { throw new Error('must not run'); });
    assert.equal(res.code, 400);
    assert.equal(res.body.fehler.code, 'x');
  });
});

describe('conflicts and races', () => {
  test('same key, different payload -> 422 konflikt; handler not called', async () => {
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k2' }, body: { name: 'A' } }), fakeRes(), handler());
    const fn = handler(); const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k2' }, body: { name: 'B' } }), res, fn);
    assert.equal(res.code, 422);
    assert.equal(res.body.fehler.code, 'idempotency_key_konflikt');
    assert.equal(fn.calls(), 0);
  });
  test('a key whose first request is still running -> 409', async () => {
    table.set('7:k3', { request_hash: requestHash(req()), response_status: null, response_body: null, expires_at: new Date(Date.now() + 1000) });
    const fn = handler(); const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k3' } }), res, fn);
    assert.equal(res.code, 409);
    assert.equal(res.body.fehler.code, 'anfrage_in_bearbeitung');
    assert.equal(fn.calls(), 0);
  });
  test('losing the INSERT race (23505) -> 409', async () => {
    // A twin inserted between our SELECT (miss) and our INSERT: the SELECT says "new", the INSERT says "duplicate".
    const racy = createFakePool([
      { match: /^SELECT request_hash/, reply: () => ({ rows: [] }) },
      { match: /^INSERT INTO idempotency_keys/, reply: () => { const e = new Error('dup'); e.code = '23505'; throw e; } },
    ]);
    const undo = inject('db.js', { pool: racy });
    delete require.cache[ABS];
    const { runIdempotent: ri } = require(ABS);
    const res = fakeRes();
    await ri(req({ headers: { 'Idempotency-Key': 'k5' } }), res, handler());
    assert.equal(res.code, 409);
    undo(); inject('db.js', { pool }); delete require.cache[ABS]; ({ runIdempotent, requestHash } = require(ABS));
  });
  test('handler throws -> reservation released, error propagates, nothing stored', async () => {
    const res = fakeRes();
    await assert.rejects(runIdempotent(req({ headers: { 'Idempotency-Key': 'k6' } }), res, async () => { throw new Error('boom'); }), /boom/);
    assert.equal(table.has('7:k6'), false);
    assert.ok(pool.some(/^DELETE FROM idempotency_keys/));
    assert.equal(res.sent, false, 'nothing was sent to the client by the util');
  });
  test('an expired row is discarded and the request runs fresh', async () => {
    table.set('7:k7', { request_hash: 'old', response_status: 200, response_body: { stale: true }, expires_at: new Date(Date.now() - 1000) });
    const fn = handler(); const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k7' } }), res, fn);
    assert.equal(fn.calls(), 1);
    assert.equal(res.code, 201);
    assert.equal(table.get('7:k7').response_status, 201);
  });
  test('a handler that returns { status, body } instead of writing is also captured', async () => {
    const res = fakeRes();
    await runIdempotent(req({ headers: { 'Idempotency-Key': 'k8' } }), res, async () => ({ status: 202, body: { ok: true } }));
    assert.equal(res.code, 202);
    assert.equal(table.get('7:k8').response_status, 202);
  });
});

describe('requestHash', () => {
  test('is stable under object key order and differs by method, path and body', () => {
    const a = requestHash(req({ body: { a: 1, b: { c: 2, d: [1, 2] } } }));
    const b = requestHash(req({ body: { b: { d: [1, 2], c: 2 }, a: 1 } }));
    assert.equal(a, b);
    assert.notEqual(a, requestHash(req({ body: { a: 1, b: { c: 2, d: [2, 1] } } })), 'array order matters');
    assert.notEqual(a, requestHash(req({ method: 'PUT', body: { a: 1, b: { c: 2, d: [1, 2] } } })), 'method matters');
    assert.notEqual(a, requestHash(req({ url: '/other', body: { a: 1, b: { c: 2, d: [1, 2] } } })), 'path matters');
  });
});
