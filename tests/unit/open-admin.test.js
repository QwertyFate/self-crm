// UNIT + ROUTE — OPEN ADMIN (utils/open-admin.js). In the local build there is no .env and so no
// ADMIN_SECRET; without this the admin console at /adminconsole could never be entered (503).
// Open admin, on by default in embedded mode, lets the gate wave everything through and makes
// /api/admin/me report the console open so the login screen is skipped. OPEN_ADMIN=false (or a
// DATABASE_URL) restores the secret-gated behaviour, which tests/unit/admin-auth.test.js pins.
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT, loadRoute, serve } = require('../helpers/load-route');
const { openAdmin } = require(path.join(ROOT, 'utils', 'open-admin.js'));
const requireAdmin = require(path.join(ROOT, 'middleware', 'admin-auth.js'));

const saved = { OPEN_ADMIN: process.env.OPEN_ADMIN, DATABASE_URL: process.env.DATABASE_URL, ADMIN_SECRET: process.env.ADMIN_SECRET };
function env(vars) { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
after(() => env(saved));

describe('openAdmin()', () => {
  const table = [
    [{ OPEN_ADMIN: undefined, DATABASE_URL: undefined }, true,  'embedded, nothing said → open'],
    [{ OPEN_ADMIN: '',        DATABASE_URL: undefined }, true,  'empty counts as unset'],
    [{ OPEN_ADMIN: undefined, DATABASE_URL: 'postgres://x' }, false, 'a Postgres server → the secret'],
    [{ OPEN_ADMIN: 'false',   DATABASE_URL: undefined }, false, 'false wins over embedded'],
    [{ OPEN_ADMIN: 'true',    DATABASE_URL: 'postgres://x' }, true, 'true wins over hosted'],
    [{ OPEN_ADMIN: 'nonsense', DATABASE_URL: 'postgres://x' }, false, 'garbage falls back to the mode'],
  ];
  for (const [vars, expected, why] of table) test(why, () => { env(vars); assert.equal(openAdmin(), expected); });
});

describe('requireAdmin with open admin', () => {
  function run(req) {
    const out = { status: 200, body: null, nexted: false };
    const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
    requireAdmin(req, res, () => { out.nexted = true; });
    return out;
  }
  test('no session, no secret, ADMIN_SECRET unset → passes', () => {
    env({ OPEN_ADMIN: 'true', ADMIN_SECRET: undefined });
    assert.equal(run({ session: {}, body: {}, headers: {} }).nexted, true);
    assert.equal(run({ session: undefined, body: undefined, headers: {} }).nexted, true);
  });
  test('a presented admin_secret is still scrubbed from the body (never reaches a handler), and is not required to match', () => {
    env({ OPEN_ADMIN: 'true', ADMIN_SECRET: 'real' });
    const req = { session: {}, body: { admin_secret: 'wrong', workspace_name: 'Acme' }, headers: {} };
    assert.equal(run(req).nexted, true);
    assert.deepEqual(req.body, { workspace_name: 'Acme' });
  });
  test('OPEN_ADMIN=false → the old gate: 503 with no ADMIN_SECRET, 401 without a secret', () => {
    env({ OPEN_ADMIN: 'false', ADMIN_SECRET: undefined });
    assert.equal(run({ session: {}, body: { admin_secret: 'x' }, headers: {} }).status, 503);
    assert.equal(run({ session: {}, body: {}, headers: {} }).status, 401);
  });
});

describe('routes/admin.js /me and /login', () => {
  const sessionStub = (req, _res, next) => { req.session = {}; next(); };   // express-session stand-in: a fresh session per request
  async function build() {
    const router = loadRoute('admin.js', { pool: { query: async () => ({ rows: [] }) } });
    const s = await serve({ '/': sessionStub, '/api/admin': router });
    return s;
  }
  test('open: /me says isAdmin and open; /login succeeds with no secret and mints the session', async () => {
    env({ OPEN_ADMIN: 'true', ADMIN_SECRET: undefined });
    const s = await build();
    try {
      const me = await fetch(`${s.base}/api/admin/me`);
      assert.deepEqual(await me.json(), { isAdmin: true, open: true });
      const login = await fetch(`${s.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(login.status, 200);
    } finally { await s.close(); }
  });
  test('closed, no ADMIN_SECRET: /me is not admin and not open; /login is 503 (the console is off)', async () => {
    env({ OPEN_ADMIN: 'false', ADMIN_SECRET: undefined });
    const s = await build();
    try {
      assert.deepEqual(await (await fetch(`${s.base}/api/admin/me`)).json(), { isAdmin: false, open: false });
      assert.equal((await fetch(`${s.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: 'x' }) })).status, 503);
    } finally { await s.close(); }
  });
  test('closed, with ADMIN_SECRET: the secret is still what gets you in', async () => {
    env({ OPEN_ADMIN: 'false', ADMIN_SECRET: 's3cret' });
    const s = await build();
    try {
      assert.equal((await fetch(`${s.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: 'nope' }) })).status, 401);
      assert.equal((await fetch(`${s.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: 's3cret' }) })).status, 200);
    } finally { await s.close(); }
  });
});
