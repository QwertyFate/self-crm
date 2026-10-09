// CLIENT (static) tests for the Workspaces page's icon polish: sprite icons
// replace the literal "+" and "→" characters and the inline SVGs in the Add
// Workspace modal. The card design itself (gradient banner, avatar, stats)
// is a different but valid visual treatment from the reference's
// stat-grid cards (reference/pro/src/screens/workspaces.js) and was left as
// is — see DESIGN_PRO_CHANGES.md Part 12.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const auth = read('public/js/auth.js');
const section = html.slice(html.indexOf('<!-- ── Workspaces page ── -->'), html.indexOf('<!-- ══════════════════════════════════════ MODALS'));
const addWsModal = html.slice(html.indexOf('<div id="add-workspace-modal"'), html.indexOf('<div id="add-workspace-modal"') + 1800);

describe('markup: header and Add Workspace modal use sprite icons', () => {
  test('files parse', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/auth.js')]));
  test('New Workspace button uses the sprite plus', () => {
    assert.match(section, /onclick="openCreateWorkspaceModal\(\)"[^>]*><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg><span data-i18n="html_new_workspace">New Workspace<\/span>/);
  });
  test('the modal close button is an iconbtn with the sprite x', () => {
    assert.match(addWsModal, /<button class="iconbtn" onclick="document\.getElementById\('add-workspace-modal'\)\.classList\.add\('hidden'\)" aria-label="Close" data-i18n-aria="btn_close"><svg class="ic" aria-hidden="true"><use href="#i-x"\/><\/svg><\/button>/);
  });
  test('the Join and Create choice icons are sprite, not inline SVG paths', () => {
    assert.match(addWsModal, /<use href="#i-enter"\/>/);
    assert.match(addWsModal, /<use href="#i-plus"\/>/);
    assert.doesNotMatch(addWsModal, /<polyline points=|<line x1="12" y1="8"/);
  });
});

describe('auth.js: loadWorkspacesPage renders sprite icons, not literal characters', () => {
  test('the Add-a-workspace card icon and the two "Switch/Get started" arrows use icon()', () => {
    const r = sliceFn(auth, 'loadWorkspacesPage', 'auth.js');
    assert.match(r, /class="ws-page-add-icon">\$\{icon\('plus'\)\}/);
    assert.match(r, /\$\{esc\(t\('ws_switch'\)\)\} \$\{icon\('arrow-up-right', 'ic-sm'\)\}/);
    assert.match(r, /\$\{esc\(t\('ws_get_started'\)\)\} \$\{icon\('arrow-up-right', 'ic-sm'\)\}/);
    assert.doesNotMatch(r, /Switch →|Get started →|ws-page-add-icon">\+</);
  });
});
