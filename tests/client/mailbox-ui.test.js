// CLIENT (static + sandboxed) tests for the E-Mail card under Settings → My preferences
// (EMAIL_SYNC_CHANGES Part 1, 2026-10-22; public/js/mailbox.js). Pinned: the card sits in the My
// preferences pane, hidden until the script decides; the script loads before init() runs; init() keeps
// the ?mailbox= word before showApp() clears the address and only a known word opens My preferences;
// Settings fetches the mailbox in its one batch; connecting remembers the page and navigates (no fetch);
// the card shows the right state per role, escapes the address and says each return word once; every
// string is in both languages, the German impersonal.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const js   = read('public/js/mailbox.js');
const core = read('public/js/core.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const pane = html.slice(html.indexOf('<div id="settings-pane-preferences"'), html.indexOf('<div id="settings-pane-contacts"'));

describe('the markup', () => {
  test('one card in My preferences, after Notifications, hidden until the script decides, its body empty', () => {
    assert.match(pane, /<div class="settings-card hidden" id="mailbox-card">\s*<div class="settings-card-header"><h2 data-i18n="set_mailbox">Email<\/h2><\/div>\s*<p class="settings-hint" data-i18n="hint_mailbox">[^<]+<\/p>\s*<div class="settings-card-body" id="mailbox-body"><\/div>\s*<\/div>/);
    assert.ok(pane.indexOf('id="mailbox-card"') > pane.indexOf('id="notif-pref-list"'));
  });
  test('the script loads after settings.js and before admin-import.js, whose last line runs init()', () => {
    const at = f => html.indexOf(`<script src="js/${f}"></script>`);
    assert.ok(at('mailbox.js') > at('settings.js') && at('mailbox.js') < at('admin-import.js'));
    assert.match(read('public/js/admin-import.js'), /\ninit\(\);\s*$/);
  });
});

describe('the wiring', () => {
  test('init() keeps the ?mailbox= word before it asks who is logged in (showApp clears the address)', () => {
    const init = sliceFn(read('public/js/auth.js'), 'init', 'auth.js');
    const keep = init.indexOf('mailboxKeepReturn(params);');
    assert.ok(keep > init.indexOf("const params     = new URLSearchParams(window.location.search);"));
    assert.ok(keep < init.indexOf("api.get('/api/auth/me')"));
  });
  test('on hold (2026-10-27): the card is not asked for or shown, and the server does not mount the routes', () => {
    assert.match(js, /^const MAILBOX_SHOWN = false;$/m);
    assert.match(read('server.js'), /^const EMAIL_SYNC_ON = false;\nif \(EMAIL_SYNC_ON\) app\.use\('\/api\/mailbox', require\('\.\/routes\/mailbox'\)\);/m);
  });
  test('loadSettings fetches /api/mailbox in its one batch and hands the answer on', () => {
    const load = sliceFn(read('public/js/settings.js'), 'loadSettings', 'settings.js');
    const batch = load.slice(load.indexOf('Promise.all('), load.indexOf(']);', load.indexOf('Promise.all(')));
    assert.match(batch, /MAILBOX_SHOWN \? api\.get\('\/api\/mailbox'\) : null,\s*$/);
    assert.match(load, /, inviteRows, mailboxRow\] = await Promise\.all/);
    const call = load.indexOf('if (MAILBOX_SHOWN) loadMailboxCard(mailboxRow);');
    assert.ok(call > load.indexOf('loadNotifPrefs();') && call < load.indexOf('switchSettingsTab(currentSettingsTab);'), 'before the tab switch, so a return lands on a filled card');
  });
  test('the script talks to exactly one route through api, and to the start route by navigation', () => {
    assert.deepEqual([...js.matchAll(/api\.(get|post|put|patch|del)\('([^']+)'/g)].map(m => [m[1], m[2]]), [['get', '/api/mailbox'], ['del', '/api/mailbox']]);
    assert.doesNotMatch(js, /\bfetch\(/);
    assert.match(sliceFn(js, 'connectGoogleMailbox', 'mailbox.js'), /appRememberPage\(\);\s*window\.location\.href = '\/api\/mailbox\/google\/start';/);
    assert.doesNotMatch(js, /innerHTML = [^`]*\$\{(?!esc\()/, 'nothing unescaped into innerHTML');
    for (const m of sliceFn(js, 'renderMailboxCard', 'mailbox.js').matchAll(/\$\{([^}]+)\}/g)) assert.match(m[1], /^(esc\(|account\.last_error \?)/, `escaped: ${m[1]}`);
  });
});

describe('the strings', () => {
  test('every key the card and the script use is in both languages; each return word has one; the German impersonal', () => {
    const RETURNS = new Function(sliceConst('public/js/mailbox.js', 'MAILBOX_RETURNS') + ' return MAILBOX_RETURNS;')();
    const keys = new Set([...pane.slice(pane.indexOf('id="mailbox-card"')).matchAll(/data-i18n="(\w+)"/g)].map(m => m[1]).filter(k => /mailbox/.test(k)));
    for (const m of js.matchAll(/\btf?\('(\w+)'(?=[,)])/g)) keys.add(m[1]);
    for (const w of RETURNS) keys.add('mb_ret_' + w);
    assert.ok(keys.size >= 17, `keys: ${keys.size}`);
    for (const k of keys) { assert.ok(dict.en[k], `en.${k}`); assert.ok(dict.de[k], `de.${k}`); }
    for (const k of [...keys]) assert.doesNotMatch(dict.de[k], /\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/, `${k}: ${dict.de[k]}`);
    assert.equal(dict.de.set_mailbox, 'E-Mail'); assert.equal(dict.de.mb_connect_google, 'Mit Google verbinden');
  });
});

// The script's functions in a sandbox: the real esc() from core.js, the English dictionary, a fake page.
function sandbox({ role = 'member', settingsTab = 'workspace', answer = { configured: true, account: null } } = {}) {
  const extra = `
    ${sliceConst('public/js/mailbox.js', 'MAILBOX_RETURNS')}
    ${sliceFn(core, 'esc', 'core.js')}
    const T = ${JSON.stringify(dict.en)};
    function t(k) { return T[k] ?? k; }
    function tf(k, o) { return t(k).replace(/\\{(\\w+)\\}/g, (_, n) => o[n]); }
    function fmtDate() { return '22 Oct 2026'; }
    const toasts = [], calls = []; let remembered = 0;
    const ui = { toast: m => toasts.push(m), confirm: async () => true };
    const card = { hidden: true, classList: { toggle(c, on) { if (c === 'hidden') card.hidden = !!on; } } };
    const body = { innerHTML: '' };
    const document = { getElementById: id => ({ 'mailbox-card': card, 'mailbox-body': body })[id] || null };
    const api = { get: async u => { calls.push(['get', u]); return ${JSON.stringify(answer)}; }, del: async u => { calls.push(['del', u]); return { configured: true, account: null }; } };
    function appRememberPage() { remembered++; }
    const window = { location: { href: '/' } };
    function __probe() { return { toasts, calls, remembered, href: window.location.href, hidden: card.hidden, html: body.innerHTML, mailboxReturn, currentSettingsTab }; }
  `;
  return loadFns('public/js/mailbox.js', ['mailboxKeepReturn', 'loadMailboxCard', 'renderMailboxCard', 'connectGoogleMailbox', 'disconnectMailbox'],
    { state: { mailboxData: null, mailboxReturn: null, currentSettingsTab: settingsTab, currentUser: { role } }, extra, expose: ['__probe'] });
}
const params = q => new URLSearchParams(q);

describe('the card', () => {
  test('a known return word opens My preferences and is said once; an unknown one is ignored', async () => {
    const F = sandbox();
    F.mailboxKeepReturn(params('mailbox=connected'));
    assert.equal(F.__probe().currentSettingsTab, 'preferences');
    await F.loadMailboxCard({ configured: true, account: { provider: 'google', email_address: 'mara@example.de', connected_at: '2026-10-22T09:00:00Z', last_error: null } });
    await F.loadMailboxCard({ configured: true, account: null });
    assert.deepEqual(F.__probe().toasts, ['Mailbox connected.']);
    assert.deepEqual(F.__probe().calls, [], 'the prefetched answer is used');

    const G = sandbox();
    G.mailboxKeepReturn(params('mailbox=%3Cimg%20src%3Dx%3E'));
    G.mailboxKeepReturn(params('reset=abc'));
    assert.equal(G.__probe().mailboxReturn, null); assert.equal(G.__probe().currentSettingsTab, 'workspace');
    await G.loadMailboxCard();
    assert.deepEqual(G.__probe().toasts, []); assert.deepEqual(G.__probe().calls, [['get', '/api/mailbox']]);
  });
  test('not set up: hidden from members, owners and admins read why', async () => {
    const answer = { configured: false, account: null };
    const M = sandbox({ role: 'member', answer }); await M.loadMailboxCard();
    assert.equal(M.__probe().hidden, true);
    for (const role of ['owner', 'admin']) {
      const O = sandbox({ role, answer }); await O.loadMailboxCard();
      assert.equal(O.__probe().hidden, false); assert.match(O.__probe().html, /Google login is not set up on this server yet/); assert.doesNotMatch(O.__probe().html, /<button/);
    }
  });
  test('set up, nothing connected: one button that remembers the page and navigates to the start route', async () => {
    const F = sandbox(); await F.loadMailboxCard();
    assert.equal(F.__probe().hidden, false);
    assert.match(F.__probe().html, /<button class="btn btn-primary btn-sm" type="button" onclick="connectGoogleMailbox\(\)">Connect with Google<\/button>/);
    F.connectGoogleMailbox();
    assert.equal(F.__probe().remembered, 1); assert.equal(F.__probe().href, '/api/mailbox/google/start');
  });
  test('connected: the address escaped, the date, the last problem, the not-yet-reading note and Disconnect', async () => {
    const F = sandbox({ answer: { configured: true, account: { provider: 'google', email_address: '<img src=x onerror=alert(1)>@x.de', connected_at: '2026-10-22T09:00:00Z', last_error: 'invalid_grant <b>' } } });
    await F.loadMailboxCard();
    const h = F.__probe().html;
    assert.match(h, /<strong>&lt;img src=x onerror=alert\(1\)&gt;@x\.de<\/strong>/); assert.doesNotMatch(h, /<img/);
    assert.match(h, /Connected on 22 Oct 2026/);
    assert.match(h, /class="settings-hint text-danger">Last problem: invalid_grant &lt;b&gt;</);
    assert.match(h, /Reading the emails is the next step/);
    assert.match(h, /onclick="disconnectMailbox\(\)">Disconnect<\/button>/);
  });
  test('disconnect: confirmed, one DELETE, the card back to the button, a toast', async () => {
    const F = sandbox({ answer: { configured: true, account: { provider: 'google', email_address: 'mara@example.de', connected_at: null, last_error: null } } });
    await F.loadMailboxCard(); await F.disconnectMailbox();
    assert.deepEqual(F.__probe().calls.at(-1), ['del', '/api/mailbox']);
    assert.match(F.__probe().html, /Connect with Google/);
    assert.deepEqual(F.__probe().toasts, ['Mailbox disconnected.']);
  });
});
