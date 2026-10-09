// CLIENT (static) tests for the Auth screen's icon polish: the three "Back"
// links inside #auth-screen (forgot password, reset password, join
// workspace) and the Platform admin link now use sprite icons instead of
// inline SVGs. The reference's Auth screen (reference/pro/src/screens/
// auth.js) pairs the login card with a two-column marketing panel
// (pipeline/relationships/team-work highlights) — a real content addition,
// not attempted; see DESIGN_PRO_CHANGES.md Part 13. The Admin login screen's
// own "Back to app" link (outside #auth-screen) is left for the Admin part.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../helpers/client-fn');

const html = read('public/index.html');
const authScreenStart = html.indexOf('<div id="auth-screen"');
const authScreenEnd = html.indexOf('MAIN APP');
const section = html.slice(authScreenStart, authScreenEnd);

describe('markup: #auth-screen back links and the admin link use the sprite', () => {
  test('exactly three back links, all sprite arrow-left, no inline path SVG', () => {
    const matches = [...section.matchAll(/<svg class="ic" aria-hidden="true"><use href="#i-arrow-left"\/><\/svg>/g)];
    assert.equal(matches.length, 3);
    assert.doesNotMatch(section, /path d="M19 12H5"/);
  });
  test('the Platform admin link uses the sprite settings icon', () => {
    assert.match(section, /<a href="\/\?admin" class="admin-link"><svg class="ic" aria-hidden="true"><use href="#i-settings"\/><\/svg><span data-i18n="role_admin">Admin<\/span><\/a>/);
  });
  test('every sprite reference inside #auth-screen resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
  });
});
