// CLIENT (static) tests for the platform Admin screen's icon polish and a
// real bug fix: adminCopyCode used to capture/restore a button's
// textContent, which is empty once the button holds an SVG icon instead of
// a character — the "copied" checkmark would have permanently blanked the
// button. Fixed to swap innerHTML instead. The reference's own admin.js
// (user management, audit log, workspace list) is a different, larger
// feature than this app's single-purpose invite-code panel — not rebuilt,
// see DESIGN_PRO_CHANGES.md Part 14.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const admin = read('public/js/admin-import.js');
const section = html.slice(html.indexOf('<div id="admin-screen"'), html.indexOf('<!-- ══════════════════════════════════════\n       AUTH SCREEN'));

describe('markup: admin screen uses sprite icons', () => {
  test('files parse', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/admin-import.js')]));
  test('Back to app, Generate, and Log out of admin all have sprite icons', () => {
    assert.match(section, /onclick="location\.href='\/'"><svg class="ic" aria-hidden="true"><use href="#i-arrow-left"\/><\/svg><span>Back to app<\/span>/);
    assert.match(section, /onclick="adminGenerateCode\(\)"><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg><span>Generate<\/span>/);
    assert.match(section, /onclick="adminLogout\(event\)"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-log-out"\/><\/svg><span>Log out of admin<\/span>/);
  });
  test('every sprite reference inside the admin screen resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
  });
});

describe('admin-import.js: invite row icons and the copy-feedback fix', () => {
  test('the Copy and Delete buttons use sprite icons, not emoji', () => {
    const r = sliceFn(admin, 'loadAdminInvites', 'admin-import.js');
    assert.match(r, /icon\('copy', 'ic-sm'\)/);
    assert.match(r, /icon\('x', 'ic-sm'\)/);
    assert.doesNotMatch(r, /📋|>✕</);
  });
  test('adminCopyCode swaps innerHTML, not textContent (the icon would be lost otherwise)', () => {
    const f = sliceFn(admin, 'adminCopyCode', 'admin-import.js');
    assert.match(f, /btn\.innerHTML/);
    assert.match(f, /icon\('check', 'ic-sm'\)/);
    assert.doesNotMatch(f, /textContent/);
  });
});
