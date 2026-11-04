// CLIENT (static) tests for the self-reloading tab (2026-10-13): core.js watches the server's
// client-files fingerprint and reloads the page by itself when it changes, as soon as nobody is
// typing and no dialog is open, offering a one-click reload meanwhile; the watch starts with the
// app, checks on every socket connect, when the tab comes back into view, and once a minute.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst } = require('../helpers/client-fn');

const core = read('public/js/core.js'), auth = read('public/js/auth.js'), chat = read('public/js/chat.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

describe('the watch', () => {
  test('quiet means nobody is typing, no draft sits in a note or chat field, and no overlay is open', () => {
    const q = sliceFn(core, 'appIsQuiet', 'core.js');
    assert.match(q, /a\.tagName === 'INPUT' \|\| a\.tagName === 'TEXTAREA' \|\| a\.tagName === 'SELECT' \|\| a\.isContentEditable/);
    assert.match(q, /const draft = Array\.from\(document\.querySelectorAll\('textarea, input\.chat-input'\)\)\.some\(el => el\.value && el\.value\.trim\(\)\);/, 'a half-written note or chat message is never thrown away');
    assert.match(q, /return !typing && !draft && !document\.querySelector\('\.overlay'\);/);
  });
  test('the reload comes back to the page that was open: remembered for this tab for five minutes, validated against the page list, used once', () => {
    assert.match(sliceFn(core, 'appRememberPage', 'core.js'), /document\.querySelector\('\.sb-link\[aria-current="page"\]'\)\?\.dataset\.page[\s\S]*sessionStorage\.setItem\('crm_reload_page', JSON\.stringify\(\{ page, at: Date\.now\(\) \}\)\)/);
    const r = sliceFn(core, 'appRestorePage', 'core.js');
    assert.match(r, /sessionStorage\.removeItem\('crm_reload_page'\);/); assert.match(r, /APP_PAGES\.includes\(page\) && Date\.now\(\) - at < 5 \* 60 \* 1000 \? page : null/);
    assert.match(core, /^const APP_PAGES = \['deals', 'contacts', 'suppliers', 'activities', 'calendar', 'settings', 'objects', 'tasks', 'board', 'analytics', 'onboarding', 'integrations', 'workspaces', 'chat'\];/m);
    const pages = [...read('public/index.html').matchAll(/data-page="([a-z-]+)"/g)].map(m => m[1]);
    for (const p of new Set(pages)) assert.ok(['deals', 'contacts', 'suppliers', 'activities', 'calendar', 'settings', 'objects', 'tasks', 'board', 'analytics', 'onboarding', 'integrations', 'workspaces', 'chat'].includes(p), 'every sidebar page can be restored: ' + p);
    assert.match(sliceFn(core, 'appReloadNow', 'core.js'), /appRememberPage\(\); location\.reload\(\);/);
    assert.match(sliceFn(auth, 'showApp', 'auth.js'), /switchPage\(appRestorePage\(\) \|\| 'deals'\);/, 'after a self-reload the same page; every other entry still lands on Deals');
  });
  test('the first fingerprint is remembered; a different one later starts the reload once', () => {
    const n = sliceFn(core, 'noteAppVersion', 'core.js');
    assert.match(n, /if \(appVersion === null\) \{ appVersion = v; return; \}/);
    assert.match(n, /if \(v !== appVersion && !appVersionPending\) \{ appVersionPending = true; appReloadWhenQuiet\(\); \}/);
    assert.match(sliceFn(core, 'checkAppVersion', 'core.js'), /fetch\('\/api\/version', \{ cache: 'no-store' \}\)[\s\S]*noteAppVersion\(\(await r\.json\(\)\)\.version\)/);
  });
  test('the reload happens by itself when the tab is visible and quiet; otherwise a day-long toast offers it and the check repeats every ten seconds', () => {
    const r = sliceFn(core, 'appReloadWhenQuiet', 'core.js');
    assert.match(r, /if \(document\.visibilityState === 'visible' && appIsQuiet\(\)\) \{ appReloadNow\(\); return; \}/);
    assert.match(r, /ui\.toast\(t\('app_update_ready'\), \{ ms: 24 \* 60 \* 60 \* 1000, action: \{ label: t\('app_update_reload'\), onClick: appReloadNow \} \}\)/);
    assert.match(r, /setTimeout\(appReloadWhenQuiet, 10000\);/);
    for (const k of ['app_update_ready', 'app_update_reload']) { assert.ok(dict.en[k], 'en.' + k); assert.ok(dict.de[k], 'de.' + k); }
  });
  test('it starts with the app, checks once a minute and when the tab comes back, and hears the server on every socket connect', () => {
    const s = sliceFn(core, 'startAppVersionWatch', 'core.js');
    assert.match(s, /checkAppVersion\(\);\s*setInterval\(checkAppVersion, 60000\);/);
    assert.match(s, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.visibilityState !== 'visible'\) return; if \(appVersionPending\) appReloadWhenQuiet\(\); else checkAppVersion\(\); \}\);/);
    assert.match(sliceFn(auth, 'init', 'auth.js'), /^async function init\(\) \{\s*startAppVersionWatch\(\);/);
    assert.match(chat, /socket = io\(\);\s*socket\.on\('app:version', v => \{ if \(typeof noteAppVersion === 'function'\) noteAppVersion\(v\); \}\);/);
  });
});
