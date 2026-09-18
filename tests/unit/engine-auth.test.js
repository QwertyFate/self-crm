// UNIT tests for middleware/engine-auth.js with a fake pool and a fake req/res.
const { test, describe, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { inject, ROOT } = require('../helpers/load-route');

const KEY  = 'upg_live_abcdef0123456789';
const HASH = crypto.createHash('sha256').update(KEY).digest('hex');
const db   = { keys: { [HASH]: { id: 5, workspace_id: 7, scopes: ['kontakte:schreiben'] } }, updateFails: false };

let pool, engineAuth;
before(() => {
  pool = createFakePool([
    { match: /FROM api_keys WHERE key_hash = \$1/, reply: p => ({ rows: db.keys[p[0]] ? [db.keys[p[0]]] : [] }) },
    { match: /^UPDATE api_keys SET last_used_at/,  reply: () => { if (db.updateFails) throw new Error('db down'); return { rows: [], rowCount: 1 }; } },
  ]);
  inject('db.js', { pool });
  const abs = path.join(ROOT, 'middleware', 'engine-auth.js');
  delete require.cache[abs];
  engineAuth = require(abs);
});
beforeEach(() => { pool.reset(); db.updateFails = false; });

function fakeReq(headers = {}) { const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])); return { get: n => h[n.toLowerCase()] }; }
function fakeRes() { return { code: 200, body: undefined, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, set(k, v) { this.headers[k.toLowerCase()] = v; return this; } }; }
async function run(req) { const res = fakeRes(); let nextArg = 'not called'; await engineAuth(req, res, e => { nextArg = e; }); await new Promise(r => setTimeout(r, 5)); return { res, nextArg }; }

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
    const { res } = await run(fakeReq({ Authorization: 'Bearer upg_wrong' }));
    assert.equal(res.code, 401);
    const q = pool.find(/FROM api_keys/);
    assert.deepEqual(q.params, [crypto.createHash('sha256').update('upg_wrong').digest('hex')]);
    assert.equal(pool.log.some(e => e.params.includes('upg_wrong')), false);
  });
  test('the lookup excludes revoked and expired keys in SQL', async () => {
    await run(fakeReq({ Authorization: `Bearer ${KEY}` }));
    const q = pool.find(/FROM api_keys/).sql;
    assert.match(q, /revoked_at IS NULL/);
    assert.match(q, /\(expires_at IS NULL OR expires_at > NOW\(\)\)/);
  });
  test('a malformed Authorization header (not Bearer) -> 401 without a query', async () => {
    const { res } = await run(fakeReq({ Authorization: `Basic ${KEY}` }));
    assert.equal(res.code, 401);
    assert.equal(pool.log.length, 0);
  });
});

describe('success', () => {
  test('Bearer key -> next(), req fields set, usage stamp issued with the one-minute throttle', async () => {
    const req = fakeReq({ Authorization: `Bearer ${KEY}` });
    const { res, nextArg } = await run(req);
    assert.equal(nextArg, undefined);                 // next() called with no error
    assert.equal(res.body, undefined);                // nothing sent by the middleware
    assert.equal(req.workspaceId, 7);
    assert.equal(req.apiKeyId, 5);
    assert.deepEqual(req.apiScopes, ['kontakte:schreiben']);
    assert.equal(req.apiAuth, true);
    const upd = pool.find(/^UPDATE api_keys SET last_used_at/);
    assert.deepEqual(upd.params, [5]);
    assert.match(upd.sql, /last_used_at < NOW\(\) - INTERVAL '1 minute'/);
  });
  test('X-API-Key header is accepted too', async () => {
    const req = fakeReq({ 'X-API-Key': KEY });
    const { nextArg } = await run(req);
    assert.equal(nextArg, undefined);
    assert.equal(req.workspaceId, 7);
  });
  test('scopes default to [] when the row has none', async () => {
    db.keys[HASH].scopes = null;
    const req = fakeReq({ Authorization: `Bearer ${KEY}` });
    await run(req);
    assert.deepEqual(req.apiScopes, []);
    db.keys[HASH].scopes = ['kontakte:schreiben'];
  });
  test('a failing usage-stamp UPDATE does not fail the request', async () => {
    db.updateFails = true;
    const req = fakeReq({ Authorization: `Bearer ${KEY}` });
    const { nextArg } = await run(req);
    assert.equal(nextArg, undefined);
    assert.equal(req.workspaceId, 7);
  });
});

test('a database error on the lookup goes to next(err)', async () => {
  const broken = createFakePool([{ match: /FROM api_keys/, reply: () => { throw new Error('connection refused'); } }]);
  inject('db.js', { pool: broken });
  const abs = path.join(ROOT, 'middleware', 'engine-auth.js'); delete require.cache[abs];
  const mw = require(abs);
  const res = fakeRes(); let nextArg;
  await mw(fakeReq({ Authorization: `Bearer ${KEY}` }), res, e => { nextArg = e; });
  assert.equal(nextArg.message, 'connection refused');
  assert.equal(res.body, undefined);
  inject('db.js', { pool }); delete require.cache[abs]; engineAuth = require(abs);
});
