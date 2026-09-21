// ROUTE tests for routes/admin.js login/logout and the admin gate. Ports the
// Part 1/3/4 scratchpad harnesses into the suite: type-strict constant-time
// compare, session regenerated after a successful login, session destroyed on
// logout, and requireAdmin in front of the invite endpoints.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const SECRET = 'correct-horse-battery-staple-0123456789';
let pool, server, sess;

function newSession(fields = {}) {
  const s = { ...fields, regenerated: 0, destroyed: false,
    regenerate(cb) { this.regenerated++; for (const k of Object.keys(this)) if (typeof this[k] !== 'function' && !['regenerated', 'destroyed'].includes(k)) delete this[k]; cb(); },
    destroy(cb) { this.destroyed = true; cb(); } };
  return s;
}

before(async () => {
  process.env.ADMIN_SECRET = SECRET;
  pool = createFakePool([
    { match: /FROM platform_invites pi/, reply: () => ({ rows: [{ id: 1, code: 'abc', used: 0 }] }) },
    { match: /^INSERT INTO platform_invites/, reply: () => ({ rows: [{ id: 2, created_at: 't' }] }) },
  ]);
  const withSession = (req, _res, next) => { req.session = sess; next(); };
  server = await serve({ '/admin/api': [withSession, loadRoute('admin.js', { pool })] });
});
after(() => server.close());
beforeEach(() => { pool.reset(); sess = newSession({ planted: 'by-attacker' }); });

describe('POST login', () => {
  test('an array wrapping the secret does not authenticate (no string coercion)', async () => {
    const r = await server.request('POST', '/admin/api/login', { secret: [SECRET] });
    assert.equal(r.status, 401);
    assert.equal(sess.isAdmin, undefined);
  });
  test('wrong secret -> 401; empty -> 401', async () => {
    assert.equal((await server.request('POST', '/admin/api/login', { secret: 'wrong' })).status, 401);
    assert.equal((await server.request('POST', '/admin/api/login', { secret: '' })).status, 401);
    assert.equal(sess.regenerated, 0, 'no regeneration on failure');
  });
  test('correct secret -> 200, the session is REGENERATED before isAdmin is set (planted state gone)', async () => {
    const r = await server.request('POST', '/admin/api/login', { secret: SECRET });
    assert.equal(r.status, 200);
    assert.equal(sess.regenerated, 1);
    assert.equal(sess.isAdmin, true);
    assert.equal(sess.planted, undefined, 'a session id/state planted before login cannot become the admin session');
  });
  test('ADMIN_SECRET unset -> 503', async () => {
    const saved = process.env.ADMIN_SECRET; delete process.env.ADMIN_SECRET;
    assert.equal((await server.request('POST', '/admin/api/login', { secret: 'x' })).status, 503);
    process.env.ADMIN_SECRET = saved;
  });
});

describe('gate and logout', () => {
  test('GET /me reports isAdmin from the session', async () => {
    assert.deepEqual((await server.request('GET', '/admin/api/me')).body, { isAdmin: false });
    sess.isAdmin = true;
    assert.deepEqual((await server.request('GET', '/admin/api/me')).body, { isAdmin: true });
  });
  test('invite endpoints -> 401 without isAdmin, no query; work with it', async () => {
    assert.equal((await server.request('GET', '/admin/api/invites')).status, 401);
    assert.equal((await server.request('POST', '/admin/api/invites', {})).status, 401);
    assert.equal(pool.log.length, 0);
    sess.isAdmin = true;
    assert.equal((await server.request('GET', '/admin/api/invites')).status, 200);
    const c = await server.request('POST', '/admin/api/invites', {});
    assert.equal(c.status, 201);
    assert.match(c.body.code, /^[0-9a-f]{32}$/);
  });
  test('POST logout destroys the whole session', async () => {
    sess.isAdmin = true;
    const r = await server.request('POST', '/admin/api/logout', {});
    assert.equal(r.status, 200);
    assert.equal(sess.destroyed, true);
  });
});
