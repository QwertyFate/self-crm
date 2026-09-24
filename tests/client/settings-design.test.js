// CLIENT (static, no jsdom) tests for the Settings redesign: a left rail with
// the sidebar's icons, one column of cards, a title + description per section,
// SVG icons instead of emoji, and every visible string translated in EN and DE.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst } = require('../helpers/client-fn');

const html = read('public/index.html');
const css  = read('public/style.css');
const core = read('public/js/core.js');
const settingsJs = read('public/js/settings.js');
const objectsJs  = read('public/js/objects.js');
const start = html.indexOf('<section id="page-settings"');
const section = html.slice(start, html.indexOf('</section>', start));
const TABS = ['workspace', 'preferences', 'contacts', 'deals', 'objects', 'tasks', 'team', 'integrations'];
const EMOJI = /[✀-➿\u{1F300}-\u{1FAFF}⠀-⣿]|✕|️/u;

describe('structure', () => {
  test('rail + body live in one .settings-layout; no icon tile in the header', () => {
    assert.match(section, /<div class="settings-layout">\s*<nav class="settings-tabs">/);
    assert.match(section, /<\/nav>\s*(<div class="settings-tab-sep"[^>]*><\/div>\s*)?<div class="settings-tab-body">/);
    assert.equal(section.includes('settings-page-icon'), false);
  });
  test('the tab buttons are untouched: same order, data-tab then onclick, no children', () => {
    const tabs = [...section.matchAll(/<button class="settings-tab[^"]*"\s+data-tab="([a-z]+)"\s+onclick="switchSettingsTab\('\1'\)"[^>]*>[^<]*<\/button>/g)].map(m => m[1]);
    assert.deepEqual(tabs, TABS);
    assert.equal((section.match(/class="settings-tab-sep"/g) || []).length, 3, 'three hairline separators in the rail');
  });
  test('every pane opens with a head: title + one-line description', () => {
    for (const t of TABS) {
      const s = section.indexOf(`id="settings-pane-${t}"`);
      const head = section.slice(s, s + 600);
      assert.match(head, /<div class="settings-pane-head">\s*<h2 class="settings-pane-title"/, `pane ${t} head`);
      assert.match(head, /<p class="settings-tab-hint" data-i18n="[a-z_]+">/, `pane ${t} hint`);
    }
    assert.match(section, /id="settings-objects-pane-title"/, 'the listings title is set by updateObjectsNav');
    assert.match(objectsJs, /settings-objects-pane-title/);
  });
});

describe('icons, not emoji', () => {
  test('no emoji or symbol glyph is used as an icon in the settings section or its renderers', () => {
    for (const [name, src] of [['index.html settings section', section], ['settings.js', settingsJs]]) {
      const hit = src.match(EMOJI);
      assert.equal(hit, null, `${name}: found "${hit && hit[0]}" at ${hit && hit.index}`);
    }
    // objects.js: only the settings renderers are in scope for this pass
    for (const fn of ['renderObjectFieldsList', 'renderObjectColumnSettings']) {
      const i = objectsJs.indexOf(`function ${fn}`);
      assert.equal(objectsJs.slice(i, objectsJs.indexOf('\nfunction ', i + 10)).match(EMOJI), null, fn);
    }
  });
  test('a shared UI_ICON set exists in core.js and the renderers use it', () => {
    for (const k of ['edit', 'remove', 'drag', 'pin']) assert.match(core, new RegExp(`^\\s*${k}:\\s*'<svg`, 'm'), `UI_ICON.${k}`);
    assert.match(settingsJs, /\$\{UI_ICON\.edit\}/);
    assert.match(settingsJs, /\$\{UI_ICON\.remove\}/);
    assert.match(settingsJs, /\$\{UI_ICON\.drag\}/);
    assert.match(objectsJs, /\$\{UI_ICON\.edit\}/);
  });
});

describe('copy and i18n', () => {
  const en = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return ') )();
  test('every data-i18n key in the settings section exists in both languages', () => {
    const keys = [...section.matchAll(/data-i18n="([a-z_]+)"/g)].map(m => m[1]);
    const missing = keys.filter(k => !(k in en.en) || !(k in en.de));
    assert.deepEqual([...new Set(missing)], []);
  });
  test('no hard-coded English heading or button label remains', () => {
    // the Listings pane title carries an id and is written by updateObjectsNav()
    const h2 = [...section.matchAll(/<h2(?![^>]*data-i18n)[^>]*>([^<]*)<\/h2>/g)].filter(m => !/ id="/.test(m[0])).map(m => m[1].trim()).filter(Boolean);
    assert.deepEqual(h2, [], 'headings without data-i18n');
    const btn = [...section.matchAll(/<button class="btn[^"]*"(?![^>]*data-i18n)[^>]*>([^<]*)<\/button>/g)].map(m => m[1].trim()).filter(Boolean);
    assert.deepEqual(btn, [], 'text buttons without data-i18n');
  });
  test('headings are sentence case', () => {
    const bad = Object.entries(en.en).filter(([k, v]) => /^(set_|pane_|notif_|btn_)/.test(k) && /\b[A-Z][a-z]+ [A-Z][a-z]+/.test(v) && !/WhatsApp|Miro|Google|Drive/.test(v));
    assert.deepEqual(bad, []);
  });
});

describe('stylesheet', () => {
  test('rail, icons, one column, pane title, saved pill, visible row actions', () => {
    assert.match(css, /^\.settings-layout \{[^}]*grid-template-columns: 208px minmax\(0, 1fr\)/m);
    for (const t of TABS) assert.match(css, new RegExp(`\\.settings-tab\\[data-tab="${t}"\\]::before \\{`), `icon for ${t}`);
    assert.match(css, /^\.settings-tab::before \{[^}]*mask-repeat/m);
    assert.match(css, /^\.settings-grid \{[^}]*grid-template-columns: 1fr;[^}]*max-width: 760px/m);
    assert.match(css, /^\.settings-pane-title \{/m);
    assert.match(css, /^\.workspace-name-msg\.success \{[^}]*background: var\(--success-wash\)/m);
    assert.match(css, /^\.settings-row \.row-actions \{ opacity: \.6; \}/m);
    assert.match(css, /^\.settings-tab-sep \{/m);
    assert.match(css, /^#pref-dark-toggle \{[^}]*appearance: none/m);
  });
  test('the pinned rules the older tests rely on are still there, verbatim', () => {
    assert.match(css, /\.settings-tab-body \{[^}]*padding-top: 0;/);
    assert.match(css, /\.settings-row\.pipeline-stage-row, \.settings-row\.col-cfg-row \{ padding: var\(--sp-2\) var\(--sp-4\)/);
    assert.match(css, /\.col-cfg-locked \.drag-handle \{ opacity: \.25; \}/);
    assert.match(css, /\.settings-card-header h2, \.settings-card-header h3 \{/);
  });
  test('tablet: the rail becomes a horizontal strip', () => {
    const tablet = css.slice(css.indexOf('@media (max-width: 820px)'), css.indexOf('@media (max-width: 600px)'));
    assert.match(tablet, /\.settings-layout \{[^}]*flex-direction: column/);
    assert.match(tablet, /\.settings-tabs \{[^}]*flex-direction: row/);
    assert.match(tablet, /\.settings-tab-sep \{ display: none; \}/);
  });
});
