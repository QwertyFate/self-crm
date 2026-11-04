// CLIENT (static) tests for the login page (2026-10-06, reworked the same day
// after the first cut was rejected): a two-tone split — the navy wall (the
// sidebar's own gradient and the reference's fading grid) beside a white half
// holding a 400px form column, no card, no canvas. Headlines are set in
// Schibsted Grotesk, the landing page's display face, self-hosted under the
// CSP; body text stays on Inter. The door is German first (the team is
// German) with English behind every data-i18n key, and `currentLang` now
// defaults to 'de'. The login/signup tabs became a sentence switch built on
// the same .auth-tabs/.auth-tab hooks auth.js binds at script load.
//
// What the JS depends on is pinned by id (auth.js showAuth() does unguarded
// getElementById); what the earlier suites pinned (three sprite back links,
// the verbatim admin anchor, the slice boundaries, one <main> per page) stays
// byte-exact. Two latent bugs ride along: `animation: modal-in` was named four
// times and defined nowhere, and id="join-ws-code"/"join-ws-error" existed
// twice, so the auth-screen Join view could not submit.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const css  = read('public/style.css');
const auth = read('public/js/auth.js');
const core = read('public/js/core.js');
const section = html.slice(html.indexOf('<div id="auth-screen"'), html.indexOf('MAIN APP'));
const count = (s, needle) => s.split(needle).length - 1;
const rule = (sel) => { const m = css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm')); assert.ok(m, `rule ${sel}`); return m[1]; };

describe('contract: every id auth.js reads exists exactly once', () => {
  const ids = ['login-form', 'signup-form', 'login-error', 'signup-error', 'forgot-error', 'forgot-success',
    'forgot-link-box', 'forgot-btn', 'reset-error', 'reset-token', 'reset-password', 'reset-confirm', 'forgot-email',
    'forgot-link-val', 'login-email', 'login-password', 'su-workspace-field', 'su-platform-code-field', 'su-code-field',
    'su-workspace', 'su-platform-code', 'su-code', 'su-name', 'su-email', 'su-password',
    'auth-view-main', 'auth-view-forgot', 'auth-view-reset', 'auth-view-workspace-picker', 'auth-view-join-workspace',
    'workspace-picker-list', 'workspace-picker-error', 'login-notice', 'join-ws-auth-code', 'join-ws-auth-error'];
  for (const id of ids) test(`#${id}`, () => assert.equal(count(section, ` id="${id}"`), 1));
  test('both forms are <form> elements (showAuth calls .reset()) with their handlers', () => {
    assert.match(section, /<form id="login-form" class="au-form" onsubmit="handleLogin\(event\)">/);
    assert.match(section, /<form id="signup-form" class="au-form hidden" onsubmit="handleSignup\(event\)">/);
  });
  test('the signup mode is the radio group auth.js reads, as selectable rows on the house .check.round recipe', () => {
    assert.match(section, /<label class="check round au-mode"><input type="radio" name="signup-mode" value="create" checked onchange="toggleSignupMode\(\)">/);
    assert.match(section, /<label class="check round au-mode"><input type="radio" name="signup-mode" value="join" onchange="toggleSignupMode\(\)">/);
    assert.match(css, /^\.au-mode:has\(input:checked\) \{ border-color: var\(--brand\); background: var\(--brand-subtle\)/m);
  });
  test('no id is declared twice anywhere in index.html (join-ws-code / join-ws-error were)', () => {
    const all = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    assert.deepEqual([...new Set(dupes)], []);
  });
});
describe('auth.js: translated, busy while logging in, no dialogs, the Join view submits', () => {
  test('showAuth translates the door and clears the reset notice', () => {
    const s = sliceFn(auth, 'showAuth', 'auth.js');
    assert.match(s, /applyTranslations\(\)/); assert.match(s, /login-notice/); assert.match(s, /aria-selected/);
  });
  test('togglePassword flips type, aria-pressed, the eye icon and the label', () => {
    const s = sliceFn(auth, 'togglePassword', 'auth.js');
    assert.match(s, /#i-eye-off/); assert.match(s, /aria-pressed/); assert.match(s, /auth_hide/);
  });
  test('handleLogin marks the button busy around the request', () => {
    const s = sliceFn(auth, 'handleLogin', 'auth.js');
    assert.match(s, /setAuthBusy\(e\.target, true, 'auth_logging_in'\)/);
    assert.ok(s.indexOf('setAuthBusy(e.target, true') < s.indexOf("api.post('/api/auth/login'"));
    assert.match(sliceFn(auth, 'setAuthBusy', 'auth.js'), /aria-busy/);
  });
  test('no alert() dialogs on the door', () => {
    for (const fn of ['copyResetLink', 'handleResetPassword', 'selectWorkspace', 'handleJoinWorkspace', 'showJoinWorkspace', 'showAuth', 'handleLogin']) {
      assert.doesNotMatch(sliceFn(auth, fn, 'auth.js'), /\balert\(/, fn);
    }
    assert.match(sliceFn(auth, 'handleResetPassword', 'auth.js'), /t\('auth_pw_updated'\)/);
    assert.match(sliceFn(auth, 'copyResetLink', 'auth.js'), /t\('copied'\)/);
  });
  test('handleJoinWorkspace reads the form that submitted (modal or auth view) and re-shows the app', () => {
    const s = sliceFn(auth, 'handleJoinWorkspace', 'auth.js');
    assert.match(s, /const form = e\.target/);
    assert.doesNotMatch(s, /#join-workspace-modal input\[id="join-ws-code"\]/);
    assert.match(s, /getElementById\('auth-screen'\)\.classList\.add\('hidden'\)/);
    assert.match(sliceFn(auth, 'showJoinWorkspace', 'auth.js'), /join-ws-auth-code/);
  });
  test('showAuthView is still the sync declaration after showApp (foundation.test.js slices on it)', () => {
    assert.ok(auth.indexOf('function showApp(') < auth.indexOf('function showAuthView('));
    assert.doesNotMatch(auth, /async function showAuthView\(/);
  });
  test('auth.js and core.js parse', () => { for (const f of ['public/js/auth.js', 'public/js/core.js']) execFileSync(process.execPath, ['--check', path.join(ROOT, f)]); });
});
describe('a failed login: a visible countdown, and after five a way out', () => {
  test('the hint under the error: info tone, impersonal, a link straight into the forgot-password flow', () => {
    assert.match(section, /<div id="login-error" class="au-alert hidden" role="alert"><\/div>\s*<div id="login-hint" class="au-advice hidden" role="status"><span data-i18n="auth_fails_hint">[^<]+<\/span><a href="#" onclick="showForgotPassword\(event\)" data-i18n="auth_fails_link">[^<]+<\/a><\/div>/);
    assert.match(rule('.au-advice'), /background: var\(--info-bg\); border: 1px solid var\(--info-bd\); color: var\(--info\)/);
    const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
    for (const k of ['auth_fails_hint', 'auth_fails_link', 'auth_retry_in']) assert.ok(dict.de[k] && dict.en[k], k);
    assert.match(dict.de.auth_retry_in, /%s/); assert.match(dict.en.auth_retry_in, /%s/);
  });
  test('the wiring: a wrong password starts the countdown and counts; the fifth shows the hint; success resets; logout resets', () => {
    const hl = sliceFn(auth, 'handleLogin', 'auth.js');
    assert.match(hl, /loginFails \+= 1/); assert.match(hl, /startLoginCooldown\(e\.target, LOGIN_COOLDOWN_S\)/); assert.match(hl, /loginFails >= LOGIN_FAILS_HINT/);
    assert.match(hl, /loginFails = 0/);
    assert.match(auth, /^const LOGIN_COOLDOWN_S = 8, LOGIN_FAILS_HINT = 5;/m);   // 8 s: the user found 5 too short to read as deliberate
    const sa = sliceFn(auth, 'showAuth', 'auth.js');
    assert.match(sa, /loginFails = 0; clearInterval\(loginCooldown\)/, 'door state resets on every entry to the door (logout included) — not in resetClientState, which is workspace state');
    assert.match(sa, /'login-hint'/);
    assert.match(sliceFn(auth, 'showForgotPassword', 'auth.js'), /login-hint/);
  });
  test('run for real: 401 → button disabled with the 8 s countdown, ticking back to its label; the 5th failure shows the hint; success resets', async () => {
    const extra = `
      const timers = [];
      const els = {};
      const el = id => els[id] || (els[id] = { id, cls: new Set(['hidden']), textContent: id === 'btn' ? 'Anmelden' : '', dataset: {}, attrs: {}, value: '', disabled: false,
        classList: { add: c => els[id].cls.add(c), remove: c => els[id].cls.delete(c), toggle: (c, on) => on ? els[id].cls.add(c) : els[id].cls.delete(c), contains: c => els[id].cls.has(c) },
        setAttribute: (k, v) => { els[id].attrs[k] = v; }, removeAttribute: k => { delete els[id].attrs[k]; } });
      const document = { getElementById: el, querySelector: sel => sel === '.au-submit' ? el('btn') : null, querySelectorAll: () => [] };
      const form = { querySelector: sel => sel === '.au-submit' ? el('btn') : null };
      const api = { post: async () => responses.shift() };
      const t = k => ({ auth_retry_in: 'Erneut versuchen in %s s', auth_err_invalid: 'falsch' })[k] || k;
      function setInterval(fn) { timers.push(fn); return timers.length; } function clearInterval() {}
      function showApp() { log.push('showApp'); } function showWorkspacePicker() {}
      function __probe() { return { btn: el('btn'), hint: el('login-hint'), timers, fails: loginFails }; }
    `;
    const F = loadFns('public/js/auth.js', ['handleLogin', 'setAuthBusy', 'startLoginCooldown'], {
      state: { currentUser: null, currentWorkspace: null, kanbanFields: null, contactColumns: null, dealColumns: null, objectColumns: null, loginFails: 0, loginCooldown: null, responses: null, log: null },
      extra: extra + '\nconst LOGIN_COOLDOWN_S = 8, LOGIN_FAILS_HINT = 5; const AUTH_ERRORS = { "Invalid email or password": "auth_err_invalid" };', expose: ['__probe'] });
    const responses = [], log = [];
    F.__set('responses', responses); F.__set('log', log);
    const fail = { error: 'Invalid email or password' };
    const e = { preventDefault() {}, target: { querySelector: () => F.__probe().btn } };
    responses.push(fail); await F.handleLogin(e);
    let p = F.__probe();
    assert.equal(p.btn.disabled, true); assert.equal(p.btn.textContent, 'Erneut versuchen in 8 s'); assert.equal(p.fails, 1);
    assert.ok(p.hint.cls.has('hidden'), 'no hint yet');
    const tick = p.timers[0];
    tick(); assert.equal(F.__probe().btn.textContent, 'Erneut versuchen in 7 s');
    for (let i = 0; i < 7; i++) tick();
    p = F.__probe(); assert.equal(p.btn.disabled, false); assert.equal(p.btn.textContent, 'Anmelden', 'label back after the countdown');
    for (let i = 0; i < 4; i++) { responses.push(fail); await F.handleLogin(e); }
    p = F.__probe(); assert.equal(p.fails, 5); assert.ok(!p.hint.cls.has('hidden'), 'the hint after five failures');
    responses.push({ user: { id: 1 }, workspace: { id: 7 } }); await F.handleLogin(e);
    assert.deepEqual(log, ['showApp']); assert.equal(F.__probe().fails, 0, 'success resets the count');
  });
});
describe('the browser does not offer to save the password on later saves (2026-10-26)', () => {
  test('showApp empties every password field of the door, which stays in the page hidden', () => {
    const show = auth.slice(auth.indexOf('function showApp('), auth.indexOf('function showAuthView('));
    const ids = (show.match(/for \(const id of \[([^\]]+)\]\) \{ const el = document\.getElementById\(id\); if \(el\) el\.value = ''; \}/) || [])[1];
    assert.ok(ids, 'the loop that empties them');
    const html = read('public/index.html');
    const inDoor = [...html.matchAll(/<input[^>]*type="password"[^>]*id="([^"]+)"/g)].map(m => m[1]).filter(id => id !== 'admin-secret-input');
    assert.deepEqual(ids.split(',').map(s => s.trim().replace(/'/g, '')), inDoor);
    assert.ok(show.indexOf('el.value = \'\'') < show.indexOf("classList.add('hidden')"), 'before the door is hidden');
  });
});
