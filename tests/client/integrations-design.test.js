// CLIENT (static) tests for the Integrations page restyle: the page uses the
// Settings shell (rail + panes), every card follows the settings-card anatomy
// (header + switch, hint, body of sections, save bar), no inline styles, every
// string translated, and the JS markup builders emit classes instead of inline
// styles. Behaviour (ids, handlers, functions) is unchanged.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst } = require('../helpers/client-fn');

const html = read('public/index.html');
const css  = read('public/style.css');
const intg = read('public/js/integrations.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();

const start   = html.indexOf('<section id="page-integrations"');
const section = html.slice(start, html.indexOf('</section>', start));
const s21     = css.slice(css.indexOf('21 · INTEGRATIONS'), css.indexOf('22 · AUTH & ADMIN'));
const count   = (src, needle) => src.split(needle).length - 1;
const lastBefore = (needle, idx) => section.lastIndexOf(needle, idx);
const INTG_TABS = ['webhook', 'platforms', 'activity', 'engine', 'deliveries'];

describe('page shell', () => {
  test('header: icon, translated title, one-line page-sub', () => {
    assert.match(section, /<h1><svg class="ic"[^>]*>[\s\S]*?<\/svg><span data-i18n="page_integrations">/);
    assert.match(section, /<p class="page-sub" data-i18n="hint_page_integrations">/);
  });
  test('the Settings rail: five tabs in two groups, text-only buttons, the tab body owns the scroll', () => {
    assert.match(section, /^<section id="page-integrations" class="page page-rail">/);
    assert.match(section, /<div class="settings-layout">\s*<nav class="settings-tabs">/);
    const tabs = [...section.matchAll(/<button class="settings-tab"\s+data-tab="([a-z]+)"\s+onclick="switchIntgTab\('\1'\)"\s+data-i18n="intg_tab_\1">[^<]*<\/button>/g)].map(m => m[1]);
    assert.deepEqual(tabs, INTG_TABS, 'tab buttons: class, data-tab, scoped onclick, data-i18n on the button, no child nodes');
    assert.equal(count(section, 'class="settings-tab-sep"'), 1, 'one separator between the two groups');
    const sep = section.indexOf('class="settings-tab-sep"');
    assert.ok(sep > section.indexOf('data-tab="activity"') && sep < section.indexOf('data-tab="engine"'));
    assert.match(section, /<\/nav>\s*<div class="settings-tab-body">/);
    assert.equal(section.includes('settings-grid'), false, 'the old flat grid is gone');
  });
  test('one pane per tab, each opening with the Settings pane heading and its own card column', () => {
    assert.equal(count(section, 'class="settings-pane"'), 5);
    assert.equal(count(section, 'class="settings-pane-head"'), 5);
    let last = -1;
    for (const t of INTG_TABS) {
      const i = section.indexOf(`<div id="intg-pane-${t}" class="settings-pane">`);
      assert.ok(i > last, `pane ${t} present, in tab order`);
      last = i;
      const head = section.slice(i, i + 700);
      assert.match(head, /<div class="settings-pane-head">\s*<h2 class="settings-pane-title" data-i18n="intg_pane_[a-z]+">/, t);
      assert.match(head, /<p class="settings-tab-hint" data-i18n="intg_pane_[a-z]+_hint">/, t);
      assert.match(head, /<div class="intg-stack">/, t);
    }
  });
  test('cards in pane order: webhook, setup guides, received leads, the Engine, sent events', () => {
    const order = ['intg_webhook_title', 'intg_platforms_title', 'intg_activity_title', 'id="engine-card"', 'engine_deliveries_title'].map(k => section.indexOf(k));
    assert.ok(order.every(i => i > 0), 'all five present');
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(section.indexOf('id="intg-pane-engine"') < section.indexOf('id="engine-card"'), 'the Engine card is in the Engine pane');
    assert.ok(section.indexOf('id="intg-pane-deliveries"') < section.indexOf('id="engine-deliveries"'), 'the deliveries list is in its own pane');
    assert.ok(section.indexOf('id="engine-deliveries"') > section.indexOf('engine_deliveries_title'), 'inside the Sent events card');
  });
  test('no inline style attribute anywhere on the page', () => {
    assert.deepEqual([...section.matchAll(/ style="[^"]*"/g)].map(m => m[0]), []);
  });
});

describe('card anatomy', () => {
  test('every control block sits inside a settings-card-body', () => {
    for (const needle of ['id="intg-field-map"', 'id="intg-logs"', 'class="intg-two-panel"', 'id="engine-stages"', 'id="engine-deliveries"', 'id="intg-url"', 'id="engine-secret"']) {
      const i = section.indexOf(needle);
      assert.ok(i > 0, needle);
      assert.ok(lastBefore('class="settings-card-body"', i) > lastBefore('class="settings-card-header"', i), `${needle} is inside a settings-card-body`);
    }
  });
  test('every message pill is beside its buttons in a settings-card-actions row', () => {
    const msgs = [...section.matchAll(/class="workspace-name-msg hidden"/g)];
    assert.equal(msgs.length, 2);
    for (const m of msgs) {
      assert.ok(lastBefore('class="settings-card-actions"', m.index) > lastBefore('class="settings-card-header"', m.index));
    }
  });
  test('each connection is switched on and off with a real switch in the card header', () => {
    for (const id of ['intg-active', 'engine-active']) {
      const tag = (section.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)) || [''])[0];
      assert.match(tag, /type="checkbox"/, id);
      assert.match(tag, /class="switch[ "]/, `${id} is a switch`);
      const i = section.indexOf(tag);
      assert.ok(lastBefore('<label class="switch-row">', i) > lastBefore('class="settings-card-header"', i), `${id} sits in a switch-row inside the header`);
    }
    assert.match(section, /id="intg-create-deal"[^>]*class="switch"/);
    assert.match(css, /^input\[type="checkbox"\]\.switch,\n#pref-dark-toggle \{[^}]*appearance: none/m, '.switch shares the Appearance switch rule, at a weight that beats the global checkbox rule');
    for (const state of ['::after', ':checked', ':checked::after', ':focus-visible']) assert.ok(css.includes(`input[type="checkbox"].switch${state},\n`), `switch state ${state}`);
    assert.match(s21, /input\[type="checkbox"\]\.switch:disabled \{/);
    assert.doesNotMatch(css, /^\.switch(?![-\w])/m, 'no bare .switch selector anywhere');
  });
  test('sub-sections are sentence-case headings with a one-line hint, not uppercase eyebrows', () => {
    assert.ok(count(section, 'class="intg-section-head') >= 7);
    for (const m of section.matchAll(/<div class="intg-section-head[^"]*">([\s\S]*?)<\/div>/g)) {
      assert.match(m[1], /<h3 data-i18n="/, 'a heading');
    }
    assert.ok(!section.includes('intg-section-title'));
    assert.ok(!s21.includes('.intg-section-title'));
    assert.match(s21, /\.intg-section-head h3 \{[^}]*font-weight: 620/);
    assert.doesNotMatch(s21.slice(s21.indexOf('.intg-section-head h3')).split('}')[0], /uppercase/);
  });
  test('pipeline, stage and assignee are labelled fields, and the assignee placeholder is translated', () => {
    assert.match(section, /<div class="intg-field"><label for="intg-pipeline" data-i18n="lbl_pipeline">/);
    assert.match(section, /<div class="intg-field"><label for="intg-stage" data-i18n="lbl_stage">/);
    assert.match(section, /<option value="" data-i18n="opt_assignee_self">/);
  });
});

describe('copy', () => {
  test('every data-i18n key on the page exists in both dictionaries', () => {
    const keys = [...new Set([...section.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]))];
    assert.ok(keys.length >= 30, `found ${keys.length}`);
    const missing = keys.filter(k => !(k in dict.en) || !(k in dict.de));
    assert.deepEqual(missing, []);
  });
  test('no untranslated heading, hint, or button', () => {
    assert.deepEqual([...section.matchAll(/<h[123]>[A-Za-z][^<]*<\/h[123]>/g)].map(m => m[0]), []);
    for (const m of section.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)) assert.match(m[0], /data-i18n=/, m[0].slice(0, 80));
    for (const m of section.matchAll(/<p class="(settings-hint|settings-tab-hint|intg-section-hint|empty-inline)[^"]*"[^>]*>/g)) assert.match(m[0], /data-i18n=/, m[0]);
  });
  test('buttons that carry an icon wrap their label in a span so translation keeps the icon', () => {
    for (const m of section.matchAll(/<button[^>]*>\s*<svg[\s\S]*?<\/button>/g)) assert.match(m[0], /<\/svg><span data-i18n=/, m[0].slice(0, 60));
  });
  test('runtime strings the builders use exist in both dictionaries', () => {
    for (const k of ['intg_no_activity', 'intg_setup_guide', 'intg_guide_url', 'intg_autosaved', 'intg_confirm_regen_url', 'opt_assignee_self', 'opt_no_deal_stage', 'intg_no_stages_in_pipeline', 'msg_saved',
                     'intg_builtin_fields', 'intg_custom_fields', 'intg_add_field_ph', 'intg_edit_key', 'intg_fields_missing', 'intg_fields_missing_hint', 'intg_view_raw', 'intg_log_success', 'intg_log_error', 'intg_custom_tag', 'btn_save_changes', 'copied',
                     'lbl_name', 'lbl_email', 'lbl_phone', 'lbl_company',
                     ...INTG_TABS.map(t => `intg_tab_${t}`), ...INTG_TABS.map(t => `intg_pane_${t}`), ...INTG_TABS.map(t => `intg_pane_${t}_hint`), 'engine_deliveries_hint']) {
      assert.ok(k in dict.en && k in dict.de, k);
    }
  });
});

describe('stylesheet', () => {
  test('each pane is one column at the settings width; the pill and page-sub are shared or scoped', () => {
    assert.match(s21, /\.intg-stack \{[^}]*max-width: var\(--rail-content-max\)/);
    assert.ok(!s21.includes('760px'), 'no hard-coded column width left in section 21');
    const tablet = css.slice(css.indexOf('@media (max-width: 820px)'), css.indexOf('@media print'));
    assert.match(tablet, /\.settings-grid, \.settings-pane-head, \.intg-stack \{ max-width: none; \}/);
    assert.match(css, /^\.page-rail \.workspace-name-msg\.success \{[^}]*background: var\(--success-wash\)/m, 'the saved pill serves both rail pages');
    assert.match(s21, /^#page-integrations \.page-sub \{/m);
    assert.match(s21, /^\.intg-stack \.empty-inline \{/m);
  });
  test('every tab on the page has a mask icon in the Settings recipe, in section 21', () => {
    for (const t of INTG_TABS) {
      const m = s21.match(new RegExp(`^\\.settings-tab\\[data-tab="${t}"\\]::before \\{ --ico: url\\("data:image/svg\\+xml;charset=utf-8,%3Csvg[^"]*stroke='black'[^"]*"\\); \\}$`, 'm'));
      assert.ok(m, `icon for ${t}`);
    }
  });
  test('the new rules live in section 21 and use tokens only', () => {
    for (const sel of ['.intg-stack {', '.intg-section {', '.intg-section-head {', '.intg-section-hint {', '.intg-field {', '.intg-guide-url {', '.intg-logs, .engine-deliveries {', '.intg-stack code {']) {
      assert.ok(s21.includes(sel), sel);
    }
    const withoutCodeBlock = s21.replace(/\.intg-code \{[^}]*\}/g, '');   // the dark sample-payload block predates the restyle and keeps its two hex values
    assert.doesNotMatch(withoutCodeBlock, /#[0-9a-f]{3,6}\b/i, 'no hex colours');
  });
  test('legacy layout classes and dead rules are gone; the JS hooks remain', () => {
    for (const cls of ['intg-toggle-label', 'intg-url-row', 'intg-section-title', 'intg-row', 'intg-label']) {
      assert.ok(!section.includes(`"${cls}`) && !section.includes(` ${cls} `) && !section.includes(` ${cls}"`), `${cls} not in markup`);
      assert.ok(!s21.includes(`.${cls} `) && !s21.includes(`.${cls},`), `${cls} not in css`);
    }
    assert.ok(!css.includes('.intg-log-table'), 'dead table rules removed');
    assert.ok(!s21.includes('#intg-assignee'), 'the stray select override is gone');
    assert.ok(!s21.includes('.intg-copy-btn {') && !s21.includes('.intg-key-edit-btn {'), 'hand-rolled button geometry removed');
    assert.ok(s21.includes('.intg-key-edit-btn.active'), 'edit-mode hook kept');
    assert.match(s21, /\.intg-url-box \{[^}]*display: flex/);
  });
});

describe('integrations.js markup builders', () => {
  test('the guide panel uses classes, escapes the URL, and copies without an alert', () => {
    const s = sliceFn(intg, 'showIntgGuide', 'integrations.js');
    assert.doesNotMatch(s, /style=/);
    assert.doesNotMatch(s, /--bg-secondary|--primary\b|--muted\b/);
    assert.doesNotMatch(s, /alert\(/);
    assert.match(s, /class="intg-guide-url"/);
    assert.match(s, /<code>\$\{esc\(webhookUrl\)\}<\/code>/);
    assert.match(s, /copyIntgText\(/);
    assert.match(s, /class="btn btn-sm intg-copy-btn" onclick="copyIntgJson\(this\)"/);
    assert.match(s, /t\('intg_setup_guide'\)/);
    assert.match(sliceFn(intg, 'copyIntgText', 'integrations.js'), /fallbackCopy/);
  });
  test('field rows use the shared icon set and button classes', () => {
    const row = sliceFn(intg, 'renderFieldRow', 'integrations.js');
    assert.match(row, /class="btn btn-sm btn-icon intg-key-edit-btn" onclick="intgToggleKeyEdit\(this\)"/);
    assert.match(row, /UI_ICON\.edit/);
    assert.match(row, /UI_ICON\.remove/);
    assert.doesNotMatch(row, /<svg/);
    assert.match(row, /<span class="intg-map-custom-tag">\$\{esc\(t\('intg_custom_tag'\)\)\}<\/span>/, 'custom rows are tagged');
    assert.ok(row.indexOf('intg-map-custom-tag') < row.indexOf('intg-map-remove'), 'tag before the remove button');
    const map = sliceFn(intg, 'renderIntgFieldMap', 'integrations.js');
    assert.doesNotMatch(map, /style=/);
    assert.match(map, /t\('intg_builtin_fields'\)/);
    assert.match(map, /t\('add_btn'\)/);
    assert.match(sliceConst('public/js/integrations.js', 'INTG_BUILTIN_FIELDS'), /labelKey: 'lbl_name'/);
  });
  test('empty states, placeholders and confirmations go through t()', () => {
    assert.match(sliceFn(intg, 'loadIntgLogs', 'integrations.js'), /class="empty-inline">\$\{esc\(t\('intg_no_activity'\)\)\}/);
    assert.match(sliceFn(intg, 'loadIntgLogs', 'integrations.js'), /t\('intg_view_raw'\)/);
    assert.match(sliceFn(intg, 'loadIntgLogs', 'integrations.js'), /class="intg-log-badge \$\{l\.status\}">\$\{esc\(t\('intg_log_' \+ l\.status\)\)\}/, 'status badge is translated, class unchanged');
    assert.match(sliceFn(intg, 'loadEngineDeliveries', 'integrations.js'), /class="empty-inline"/);
    assert.match(sliceFn(intg, 'loadIntegrations', 'integrations.js'), /t\('opt_assignee_self'\)/);
    const stages = sliceFn(intg, 'renderIntgStageOptions', 'integrations.js');
    assert.match(stages, /t\('opt_no_deal_stage'\)/);
    assert.match(stages, /t\('intg_no_stages_in_pipeline'\)/);
    assert.match(sliceFn(intg, 'regenerateWebhookKey', 'integrations.js'), /confirm\(t\('intg_confirm_regen_url'\)\)/);
    assert.match(sliceFn(intg, 'copyWebhookUrl', 'integrations.js'), /t\('copied'\)/);
    const save = sliceFn(intg, 'saveIntegration', 'integrations.js');
    assert.doesNotMatch(save, /style\.cssText/);
    assert.match(save, /className = 'intg-autosaved'/);
    assert.match(save, /t\('msg_saved'\)/);
  });
  test('the rail switcher is scoped to this page, remembered, and applied on every visit', () => {
    const sw = sliceFn(intg, 'switchIntgTab', 'integrations.js');
    assert.match(sw, /currentIntgTab = tab/);
    assert.match(sw, /getElementById\('page-integrations'\)/);
    assert.match(sw, /root\.querySelectorAll\('\.settings-tab'\)/);
    assert.match(sw, /root\.querySelectorAll\('\.settings-pane'\)/);
    assert.match(sw, /`intg-pane-\$\{tab\}`/);
    assert.doesNotMatch(sw, /document\.querySelectorAll/);
    assert.match(intg, /^let currentIntgTab = 'webhook';/m);
    assert.match(sliceFn(intg, 'loadIntegrations', 'integrations.js'), /^async function loadIntegrations\(\) \{\s*loadEngineSettings\(\);\s*switchIntgTab\(currentIntgTab\);/);
  });
  test('a language switch on this page re-renders everything built at runtime, including an open guide', () => {
    const core = read('public/js/core.js');
    assert.match(sliceFn(core, 'setLanguage', 'core.js'), /if \(page === 'integrations'\)\s+loadIntegrations\(\);/);
    assert.match(sliceFn(intg, 'loadIntegrations', 'integrations.js'), /showIntgGuide\(activeGuideId \|\| 'make'\);/);
    assert.doesNotMatch(sliceFn(intg, 'loadIntegrations', 'integrations.js'), /if \(!activeGuideId\)/);
  });
  test('behaviour hooks are untouched: every handler and id the page relied on is still there', () => {
    for (const h of ['onchange="saveIntegration()"', 'onclick="copyWebhookUrl()"', 'onclick="regenerateWebhookKey()"', 'onchange="toggleIntgDeal(); saveIntegration(true)"',
                     'onchange="loadIntgStages(); saveIntegration(true)"', 'onclick="saveIntegration()"', 'onclick="loadIntgLogs()"',
                     'onchange="saveEngineSettings(true)"', 'onclick="saveEngineSettings()"', 'onclick="copyEngineSecret(this)"', 'onclick="regenerateEngineSecret()"',
                     'onclick="sendEngineTestEvent(this)"', 'onclick="loadEngineDeliveries()"']) {
      assert.ok(section.includes(h), h);
    }
    for (const id of ['intg-url', 'intg-active', 'intg-field-map', 'intg-create-deal', 'intg-deal-options', 'intg-pipeline', 'intg-stage', 'intg-assignee', 'intg-msg',
                      'intg-platform-list', 'intg-guide-panel', 'intg-logs', 'engine-card', 'engine-active', 'engine-readonly-hint', 'engine-url', 'engine-stages', 'engine-secret', 'engine-msg', 'engine-deliveries']) {
      assert.equal(count(section, `id="${id}"`), 1, id);
    }
  });
});
