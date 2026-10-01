// CLIENT (static, no jsdom) tests for the Settings design ported by hand from
// branch NewUIAI: a left rail with the sidebar's icons (CSS masks, text-only
// buttons), one column of cards, a title + description per section, SVG icons
// instead of emoji, and every visible string translated in EN and DE.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceConst } = require('../helpers/client-fn');

const html = read('public/index.html');
const css  = read('public/style.css');
const core = read('public/js/core.js');
const settingsJs = read('public/js/settings.js');
const objectsJs  = read('public/js/objects.js');
const dealsJs    = read('public/js/deals.js');
const start = html.indexOf('<section id="page-settings"');
const section = html.slice(start, html.indexOf('</section>', start));
const TABS = ['workspace', 'preferences', 'contacts', 'deals', 'objects', 'tasks', 'team', 'integrations'];
const EMOJI = /[✀-➿\u{1F300}-\u{1FAFF}⠀-⣿]|✕|️/u;

describe('structure', () => {
  test('rail + body live in one .settings-layout; no icon tile in the header', () => {
    assert.match(section, /<div class="settings-layout">\s*<nav class="settings-tabs">/);
    assert.match(section, /<\/nav>\s*<div class="settings-tab-body">/);
    assert.equal(section.includes('settings-page-icon'), false);
    assert.equal(section.includes('settings-rail'), false, 'the previous rail markup is gone');
    assert.match(section, /<div class="settings-page-header">\s*<div class="settings-page-brand">\s*<h1 class="settings-page-title" data-i18n="page_settings">/);
  });
  test('the tab buttons: same order as the reference, data-tab then onclick, no child nodes', () => {
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
    assert.equal(objectsJs.includes('settings-pane-objects-title'), false, 'old id gone');
  });
});

describe('icons, not emoji', () => {
  test('no emoji or symbol glyph is used as an icon in the settings section or its renderers', () => {
    for (const [name, src] of [['index.html settings section', section], ['settings.js', settingsJs]]) {
      const hit = src.match(EMOJI);
      assert.equal(hit, null, `${name}: found "${hit && hit[0]}" at ${hit && hit.index}`);
    }
    for (const [file, src, fns] of [['objects.js', objectsJs, ['renderObjectFieldsList', 'renderObjectColumnSettings']], ['deals.js', dealsJs, ['renderDealColumnSettings']]]) {
      for (const fn of fns) {
        const i = src.indexOf(`function ${fn}`);
        assert.equal(src.slice(i, src.indexOf('\nfunction ', i + 10)).match(EMOJI), null, `${file} ${fn}`);
      }
    }
  });
  test('a shared UI_ICON set exists in core.js and every settings renderer uses it', () => {
    for (const k of ['edit', 'remove', 'drag', 'pin', 'plus']) assert.match(core, new RegExp(`^\\s*${k}:\\s*'<svg`, 'm'), `UI_ICON.${k}`);
    assert.match(settingsJs, /\$\{UI_ICON\.edit\}/);
    assert.match(settingsJs, /\$\{UI_ICON\.remove\}/);
    assert.match(settingsJs, /\$\{UI_ICON\.drag\}/);
    assert.match(settingsJs, /\$\{UI_ICON\.pin\}/);
    assert.match(objectsJs, /\$\{UI_ICON\.edit\}/);
    assert.match(dealsJs, /\$\{UI_ICON\.drag\}/);
    assert.equal(settingsJs.includes('SETTINGS_ICON'), false, 'the settings-local icon set is gone');
    assert.equal(settingsJs.includes('function settingsRowHtml'), false, 'the row helper is gone; rows are the reference templates');
  });
});

describe('copy and i18n', () => {
  const en = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return ') )();
  test('every data-i18n key in the settings section exists in both languages', () => {
    const keys = [...section.matchAll(/data-i18n="([a-z_]+)"/g)].map(m => m[1]);
    const missing = keys.filter(k => !(k in en.en) || !(k in en.de));
    assert.deepEqual([...new Set(missing)], []);
  });
  test('the renderers only ask for keys that exist', () => {
    const used = new Set([...settingsJs.matchAll(/\bt\('([a-z_]+)'\)/g)].map(m => m[1]));
    const missing = [...used].filter(k => !(k in en.en) || !(k in en.de));
    assert.deepEqual(missing, []);
  });
  test('no hard-coded English heading or button label remains', () => {
    const h2 = [...section.matchAll(/<h2(?![^>]*data-i18n)[^>]*>([^<]*)<\/h2>/g)].filter(m => !/ id="/.test(m[0])).map(m => m[1].trim()).filter(Boolean);
    assert.deepEqual(h2, [], 'headings without data-i18n');
    const btn = [...section.matchAll(/<button class="btn[^"]*"(?![^>]*data-i18n)[^>]*>([^<]*)<\/button>/g)].map(m => m[1].trim()).filter(Boolean);
    assert.deepEqual(btn, [], 'text buttons without data-i18n');
  });
  test('headings are sentence case', () => {
    const bad = Object.entries(en.en).filter(([k, v]) => /^(set_|pane_|notif_|btn_)/.test(k) && /\b[A-Z][a-z]+ [A-Z][a-z]+/.test(v) && !/WhatsApp|Miro|Google|Drive|Upgrads/.test(v));
    assert.deepEqual(bad, []);
  });
});

describe('stylesheet', () => {
  const s19 = css.slice(css.indexOf('19 · SETTINGS'), css.indexOf('20 · ANALYTICS'));
  test('rail, icons, one column, pane title, saved pill, visible row actions', () => {
    assert.match(css, /^\.settings-layout \{[^}]*grid-template-columns: 208px minmax\(0, 1fr\)/m);
    for (const t of TABS) assert.match(css, new RegExp(`\\.settings-tab\\[data-tab="${t}"\\]::before \\{`), `icon for ${t}`);
    assert.match(css, /^\.settings-tab::before \{[^}]*mask-repeat/m);
    assert.match(css, /^\.settings-grid \{[^}]*grid-template-columns: 1fr;[^}]*max-width: var\(--rail-content-max\)/m);
    assert.match(css, /^\.page-rail \{[^}]*--rail-content-max: 1080px/m, 'one named width for both rail pages');
    assert.match(css, /^\.settings-pane-head \{[^}]*max-width: var\(--rail-content-max\)/m);
    assert.match(css, /^\.page-rail \.workspace-name-input \{[^}]*max-width: 520px/m, 'single-line inputs do not stretch across the whole card');
    assert.match(css, /^\.settings-pane-title \{/m);
    assert.match(css, /^\.page-rail \.workspace-name-msg\.success \{[^}]*background: var\(--success-wash\)/m, 'the pill is scoped to the rail pages (Settings, Integrations)');
    assert.match(css, /^\.settings-row \.row-actions \{ opacity: \.6; \}/m);
    assert.match(css, /^\.settings-tab-sep \{/m);
    assert.match(css, /^input\[type="checkbox"\]\.switch,\n#pref-dark-toggle \{[^}]*appearance: none/m, 'the Appearance switch rule is shared with other switches, at a weight that beats the global checkbox rule');
    assert.doesNotMatch(css, /^\.switch(?![-\w])/m, 'no bare .switch selector: the global input[type="checkbox"] rule would outrank it');
    assert.match(html, /<section id="page-settings" class="page page-rail">/);
  });
  test('the reference rules are there verbatim; the previous rail and row system are gone', () => {
    assert.match(css, /\.settings-tab-body \{[^}]*padding-top: 0;/);
    assert.match(css, /\.settings-row\.pipeline-stage-row, \.settings-row\.col-cfg-row \{ padding: var\(--sp-2\) var\(--sp-4\)/);
    assert.match(css, /\.col-cfg-locked \.drag-handle \{ opacity: \.25; \}/);
    assert.match(css, /\.settings-card-header h2, \.settings-card-header h3 \{/);
    for (const gone of ['.page-settings-layout', '.settings-rail', '.settings-content', '.settings-stack', '.row-main', '.row-end', '.settings-card-footer', '.settings-card.is-danger', '.settings-row.is-add']) {
      assert.equal(s19.includes(gone), 0 || false, `${gone} removed`);
    }
    assert.doesNotMatch(s19, /#[0-9a-f]{3,6}\b/i, 'section 19 stays token-only');
  });
  test('the settings page header and message pill do not touch shared selectors', () => {
    assert.match(s19, /^\.settings-page-header \{/m, 'own rule, not appended to .page-header');
    assert.doesNotMatch(css, /^\.page-header, [^{]*\.settings-page-header/m);
    assert.doesNotMatch(s19, /^\.workspace-name-msg\b/m, 'no unscoped pill rule');
  });
  test('tablet: the rail becomes a horizontal strip', () => {
    const tablet = css.slice(css.indexOf('@media (max-width: 820px)'), css.indexOf('@media print'));
    assert.match(tablet, /\.settings-layout \{[^}]*flex-direction: column/);
    assert.match(tablet, /\.settings-tabs \{[^}]*flex-direction: row/);
    assert.match(tablet, /\.settings-tab-sep \{ display: none; \}/);
    assert.equal(tablet.includes('.settings-rail'), false);
  });
});
