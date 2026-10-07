// UNIT: requireAdmin — the platform gate — accepts the admin secret IN THE
// REQUEST as well as the console's session.
//
// WHY. Scripts had to log in first (POST /api/admin/login → cookie) and send
// the cookie with the provisioning call. A tool that fires one JSON request
// (an automation, a CRM onboarding form) can now put `admin_secret` in the
// payload — or `X-Admin-Secret` in a header, for GETs — and be done. The
// secret is compared in constant time and removed from the body before the
// handler runs, so it never reaches a result or a log line.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const requireAdmin = require(path.join(ROOT, 'middleware/admin-auth.js'));

function run(req) {
  const out = { status: 200, body: null, nexted: false };
  const res = { status(c) { out.status = c; return res; }, json(b) { out.body = b; return res; } };
  requireAdmin(req, res, () => { out.nexted = true; });
  return out;
}
const SECRET = 'correct-horse-battery-staple';
let saved;
beforeEach(() => { saved = process.env.ADMIN_SECRET; process.env.ADMIN_SECRET = SECRET; });
afterEach(() => { if (saved === undefined) delete process.env.ADMIN_SECRET; else process.env.ADMIN_SECRET = saved; });

describe('requireAdmin', () => {
  test('the console session still passes, untouched', () => {
    const r = run({ session: { isAdmin: true }, body: {}, headers: {} });
    assert.equal(r.nexted, true);
  });
  test('admin_secret in the JSON body passes — and is scrubbed from the body before the handler', () => {
    const req = { session: {}, body: { admin_secret: SECRET, workspace_name: 'Acme' }, headers: {} };
    const r = run(req);
    assert.equal(r.nexted, true);
    assert.deepEqual(req.body, { workspace_name: 'Acme' }, 'the secret never reaches the handler');
    assert.equal(req.session.isAdmin, undefined, 'a one-shot request does not mint a session');
  });
  test('X-Admin-Secret header passes (for GETs, which have no body)', () => {
    const r = run({ session: {}, body: undefined, headers: { 'x-admin-secret': SECRET } });
    assert.equal(r.nexted, true);
  });
  test('a wrong secret, a wrong-length secret, a non-string, or nothing at all → 401, same message', () => {
    for (const body of [{ admin_secret: 'nope' }, { admin_secret: SECRET + 'x' }, { admin_secret: 42 }, { admin_secret: '' }, {}]) {
      const r = run({ session: {}, body, headers: {} });
      assert.equal(r.nexted, false, JSON.stringify(body)); assert.equal(r.status, 401); assert.deepEqual(r.body, { error: 'Admin access required' });
    }
  });
  test('with ADMIN_SECRET unset the admin API is off: a presented secret gets 503, a session still works', () => {
    delete process.env.ADMIN_SECRET;
    const r = run({ session: {}, body: { admin_secret: 'anything' }, headers: {} });
    assert.equal(r.status, 503); assert.equal(r.nexted, false);
    assert.equal(run({ session: { isAdmin: true }, body: {}, headers: {} }).nexted, true);
  });
  test('the comparison is constant-time (crypto.timingSafeEqual), not ===', () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'middleware/admin-auth.js'), 'utf8');
    assert.match(src, /timingSafeEqual/); assert.doesNotMatch(src, /=== *(process\.env\.ADMIN_SECRET|adminSecret)/);
  });
});
