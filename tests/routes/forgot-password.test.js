// ROUTE tests — password reset without e-mail. POST /api/auth/forgot-password answers the reset
// token for a known email (the login screen moves straight on to the new-password form) and 404
// for an unknown one; the token then drives the unchanged POST /api/auth/reset-password, which
// re-hashes every users row of that email and burns the token. No mailer exists any more.
//
// Accepted by design for a small team that knows each other (2026-10-12): anyone who can open the
// login screen and knows an email can set that account's password. The README says so.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const state = { resets: [], hashUpdates: [], log: [] };
const norm = s => String(s).replace(/\s+/g, ' ').trim();
async function query(sql, params = []) {
  const t = norm(sql); state.log.push({ sql: t, params });
  if (/^SELECT id, email FROM users WHERE email = \$1$/.test(t)) return { rows: params[0] === 'ada@example.test' ? [{ id: 5, email: 'ada@example.test' }] : [] };
  if (/^DELETE FROM password_resets WHERE user_id = \$1$/.test(t)) { state.resets = state.resets.filter(r => r.user_id !== params[0]); return { rows: [], rowCount: 0 }; }
  if (/^INSERT INTO password_resets \(user_id, token, expires_at\) VALUES \(\$1,\$2,\$3\)$/.test(t)) { state.resets.push({ id: state.resets.length + 1, user_id: params[0], token: params[1], expires_at: params[2], used: 0 }); return { rows: [] }; }
  if (/^SELECT \* FROM password_resets WHERE token = \$1 AND used = 0$/.test(t)) return { rows: state.resets.filter(r => r.token === params[0] && !r.used) };
  if (/^UPDATE password_resets SET used=1 WHERE id=\$1$/.test(t)) { const r = state.resets.find(x => x.id === params[0]); if (r) r.used = 1; return { rows: [] }; }
  if (/^UPDATE users SET password_hash=\$1 WHERE email=\(SELECT email FROM users WHERE id=\$2\)$/.test(t)) { state.hashUpdates.push(params); return { rows: [], rowCount: 2 }; }
  return { rows: [] };
}
const pool = { query, connect: async () => ({ query, release() {} }) };

let s;
before(async () => { s = await serve({ '/': (req, _res, next) => { req.session = {}; next(); }, '/api/auth': loadRoute('auth.js', { pool }) }); });
after(() => s.close());
beforeEach(() => { state.resets = []; state.hashUpdates = []; state.log = []; });

describe('POST /api/auth/forgot-password', () => {
  test('a known email → 200 with a fresh 64-hex token and the account email; older tokens for that account are gone', async () => {
    state.resets.push({ id: 99, user_id: 5, token: 'OLD', expires_at: new Date(Date.now() + 3600e3), used: 0 });
    const r = await s.request('POST', '/api/auth/forgot-password', { email: '  Ada@Example.test ' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.success, true); assert.match(r.body.token, /^[0-9a-f]{64}$/); assert.equal(r.body.email, 'ada@example.test');
    assert.equal('resetUrl' in r.body, false, 'no link: the token itself is the next step');
    assert.deepEqual(state.resets.map(x => x.token), [r.body.token], 'the old token was deleted first');
    const ins = state.log.find(e => /^INSERT INTO password_resets/.test(e.sql));
    const minutes = (new Date(ins.params[2]).getTime() - Date.now()) / 60000;
    assert.ok(minutes > 59 && minutes <= 60, `expires in ${minutes.toFixed(1)} min`);
  });
  test('an unknown email → 404 and nothing is written; a missing email → 400', async () => {
    const r = await s.request('POST', '/api/auth/forgot-password', { email: 'nobody@example.test' });
    assert.equal(r.status, 404); assert.equal(r.body.error, 'No account with this email address');
    assert.equal(state.log.some(e => /^INSERT/.test(e.sql)), false);
    assert.equal((await s.request('POST', '/api/auth/forgot-password', {})).status, 400);
  });
  test('the token then sets the password for every row of the email, once', async () => {
    const { body: { token } } = await s.request('POST', '/api/auth/forgot-password', { email: 'ada@example.test' });
    const ok = await s.request('POST', '/api/auth/reset-password', { token, password: 'new-secret' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(state.hashUpdates.length, 1); assert.equal(state.hashUpdates[0][1], 5);
    assert.match(state.hashUpdates[0][0], /^\$2[aby]\$10\$/, 'a bcrypt hash, not the password');
    const again = await s.request('POST', '/api/auth/reset-password', { token, password: 'another' });
    assert.equal(again.status, 400, 'single use');
    assert.equal(state.hashUpdates.length, 1);
  });
});

describe('no e-mail anywhere', () => {
  test('the mailer is gone, nodemailer is gone, and routes/auth.js builds no reset link', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'utils', 'mailer.js')), false);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal('nodemailer' in (pkg.dependencies || {}), false);
    const auth = fs.readFileSync(path.join(ROOT, 'routes', 'auth.js'), 'utf8');
    assert.doesNotMatch(auth, /mailer|sendPasswordReset|resetUrl|SMTP/);
    for (const rel of ['server.js', 'embedded.js', 'db.js', 'storage.js']) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, rel), 'utf8'), /SMTP_|nodemailer/, rel);
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8'), /SMTP_/);
  });
});
