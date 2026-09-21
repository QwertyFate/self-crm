// UNIT tests for middleware/engine-auth.js with a fake pool and a fake req/res.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { apiKeyRules } = require('../helpers/fake-tables');
const { fakeReq, fakeRes } = require('../helpers/fake-http');
const { inject, ROOT } = require('../helpers/load-route');

const ABS  = path.join(ROOT, 'middleware', 'engine-auth.js');
const KEY  = 'upg_live_abcdef0123456789';
const keys = apiKeyRules(KEY, { id: 5, workspace_id: 7, scopes: ['kontakte:schreiben'] });
let stampFails = false;
let pool, restore, engineAuth;

before(() => {
  pool = createFakePool([
    // Overrides the shared usage-stamp rule so one test can make it throw (first match wins).
    { match: /^UPDATE api_keys SET last_used_at/, reply: () => { if (stampFails) throw new Error('db down'); return { rows: [], rowCount: 1 }; } },
    ...keys.rules,
  ]);
  restore = inject('db.js', { pool });
  delete require.cache[ABS];
  engineAuth = require(ABS);
});
after(() => restore());
beforeEach(() => { pool.reset(); stampFails = false; keys.row.scopes = ['kontakte:schreiben']; });

// Runs the middleware and waits for the fire-and-forget usage stamp to be issued.
async function run(req) {
  const res = fakeRes();
  let nextArg = 'not called';
  await engineAuth(req, res, e => { nextArg = e; });
  for (let i = 0; i < 20 && nextArg === undefined && !pool.some(/^UPDATE api_keys/); i++) await new Promise(r => setImmediate(r));
  return { res, nextArg };
}
const UNAUTH = { fehler: { code: 'nicht_authentifiziert', nachricht: 'API-Schlüssel fehlt oder ist ungültig.' } };

describe('rejections (all the same body, nothing enumerable)', () => {
  test('no credentials -> 401 with the German shape and WWW-Authenticate; no query', async () => {
    const { res, nextArg } = await run(fakeReq());
    assert.equal(res.code, 401);
    assert.deepEqual(res.body, UNAUTH);
    assert.equal(res.headers['www-authenticate'], 'Bearer');
    assert.equal(nextArg, 'not called');
    assert.equal(pool.log.length, 0);
  });
  test('unknown key -> 401, and only the SHA-256 of the presented key reaches the database', async () => {
    const { res } = await run(fakeReq({ headers: { Authorization: 'Bearer upg_wrong' } }));
    assert.equal(res.code, 401);
    assert.deepEqual(pool.find(/FROM api_keys/).params, [crypto.createHash('sha256').update('upg_wrong').digest('hex')]);
    assert.equal(pool.someParam(p => p === 'upg_wrong'), false, 'the plain key is never bound');
  });
  test('the lookup excludes revoked and expired keys in SQL', async () => {
    await run(fakeReq({ headers: { Authorization: `Bearer ${KEY}` } }));
    const q = pool.find(/FROM api_keys/).sql;
    assert.match(q, /revoked_at IS NULL/);
    assert.match(q, /\(expires_at IS NULL OR expires_at > NOW\(\)\)/);
  });
  test('a malformed Authorization header (not Bearer) -> 401 without a query', async () => {
    const { res } = await run(fakeReq({ headers: { Authorization: `Basic ${KEY}` } }));
    assert.equal(res.code, 401);
    assert.equal(pool.log.length, 0);
  });
});

describe('success', () => {
  test('Bearer key -> next(), req fields set, usage stamp issued with the one-minute throttle', async () => {
    const req = fakeReq({ headers: { Authorization: `Bearer ${KEY}` } });
    const { res, nextArg } = await run(req);
    assert.equal(nextArg, undefined, 'next() called with no error');
    assert.equal(res.sent, false, 'nothing sent by the middleware');
    assert.equal(req.workspaceId, 7);
    assert.equal(req.apiKeyId, 5);
    assert.deepEqual(req.apiScopes, ['kontakte:schreiben']);
    assert.equal(req.apiAuth, true);
    const upd = pool.find(/^UPDATE api_keys SET last_used_at/);
    assert.ok(upd, 'usage stamp issued');
    assert.deepEqual(upd.params, [5]);
    assert.match(upd.sql, /last_used_at < NOW\(\) - INTERVAL '1 minute'/);
  });
  test('X-API-Key header is accepted too', async () => {
    const req = fakeReq({ headers: { 'X-API-Key': KEY } });
    const { nextArg } = await run(req);
    assert.equal(nextArg, undefined);
    assert.equal(req.workspaceId, 7);
  });
  test('scopes default to [] when the row has none', async () => {
    keys.row.scopes = null;
    const req = fakeReq({ headers: { Authorization: `Bearer ${KEY}` } });
    await run(req);
    assert.deepEqual(req.apiScopes, []);
  });
  test('a failing usage-stamp UPDATE does not fail the request', async () => {
    stampFails = true;
    const req = fakeReq({ headers: { Authorization: `Bearer ${KEY}` } });
    const { nextArg } = await run(req);
    assert.equal(nextArg, undefined);
    assert.equal(req.workspaceId, 7);
  });
});

test('a database error on the lookup goes to next(err)', async () => {
  const broken = createFakePool([{ match: /FROM api_keys/, reply: () => { throw new Error('connection refused'); } }]);
  const undo = inject('db.js', { pool: broken });
  delete require.cache[ABS];
  const mw = require(ABS);
  const res = fakeRes(); let nextArg;
  await mw(fakeReq({ headers: { Authorization: `Bearer ${KEY}` } }), res, e => { nextArg = e; });
  assert.equal(nextArg.message, 'connection refused');
  assert.equal(res.sent, false);
  undo(); inject('db.js', { pool }); delete require.cache[ABS]; engineAuth = require(ABS);
});
