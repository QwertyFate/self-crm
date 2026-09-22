// CLIENT (static) tests for the Settings page layout: the regrouped tabs,
// which card lands in which pane, the one card anatomy (no ad-hoc inline
// spacing), the CSS primitives, and the role-based default tab.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn } = require('../helpers/client-fn');

const html = read('public/index.html');
const section = html.slice(html.indexOf('<section id="page-settings"'), html.indexOf('</section>', html.indexOf('<section id="page-settings"')));
const TABS = ['workspace', 'preferences', 'contacts', 'deals', 'objects', 'tasks', 'team', 'integrations'];
const pane = tab => { const s = section.indexOf(`id="settings-pane-${tab}"`); assert.ok(s > 0, `pane ${tab}`); const e = section.indexOf('id="settings-pane-', s + 10); return section.slice(s, e === -1 ? undefined : e); };

describe('tabs', () => {
  test('eight tabs in the agreed order, each switching its own pane', () => {
    const tabs = [...section.matchAll(/data-tab="([a-z]+)"\s+onclick="switchSettingsTab\('([a-z]+)'\)"/g)].map(m => { assert.equal(m[1], m[2]); return m[1]; });
    assert.deepEqual(tabs, TABS);
    for (const t of TABS) assert.equal((section.match(new RegExp(`id="settings-pane-${t}"`, 'g')) || []).length, 1, `pane ${t} once`);
    assert.equal(section.includes('settings-pane-general'), false, 'General is gone');
  });
  test('the Workspace tab is hidden until loadSettings() shows it to owners; Tasks is translated', () => {
    assert.match(section, /<button class="settings-tab hidden" data-tab="workspace"[^>]*id="settings-tab-workspace"/);
    assert.match(section, /data-tab="tasks"[^>]*data-i18n="tab_tasks"/);
    assert.match(section, /id="settings-tab-objects"/, 'Listings label is set by updateObjectsNav');
  });
});

describe('what lives where', () => {
  const expect = {
    workspace:    ['workspace-name-card', 'supplier-name-card', 'object-name-card', 'delete-workspace-card'],
    preferences:  ['lang-options', 'pref-dark-toggle', 'timezone-select', 'notif-pref-list'],
    contacts:     ['contact-stages-list', 'fields-list', 'contact-columns-list', 'wa-template-input'],
    deals:        ['pipelines-list', 'onboarding-trigger-card', 'deal-fields-list', 'deal-columns-list'],
    objects:      ['object-fields-list', 'object-columns-list'],
    tasks:        ['task-statuses-list', 'task-fields-list'],
    team:         ['members-list', 'invites-card'],
    integrations: ['miro-url-input', 'set_int_pointer'],
  };
  for (const [tab, ids] of Object.entries(expect)) {
    test(`${tab}: ${ids.join(', ')}`, () => {
      const p = pane(tab);
      let last = -1;
      for (const id of ids) { const i = p.indexOf(id); assert.ok(i > last, `${id} in pane ${tab}, in order`); last = i; }
    });
  }
  test('personal settings carry the "only you" hint; the delete card is the last, wide, red one', () => {
    assert.match(pane('preferences'), /<p class="settings-tab-hint" data-i18n="hint_preferences">/);
    assert.match(pane('workspace'), /<div class="settings-card danger wide hidden" id="delete-workspace-card">[\s\S]*<p class="settings-hint text-danger">/);
    assert.match(pane('team'), /id="members-list"[\s\S]*id="invites-card"/, 'members before the owner-only invites');
    assert.match(pane('team'), /data-i18n="hint_members"/);
  });
});

describe('one card anatomy', () => {
  test('no inline margin/padding/gap/grid-column/opacity anywhere in the section', () => {
    const inline = [...section.matchAll(/style="([^"]*)"/g)].map(m => m[1]).filter(s => /margin|padding|gap|grid-column|opacity/.test(s));
    assert.deepEqual(inline, []);
  });
  test('every control block sits in a settings-card-body; every message span is beside its button', () => {
    assert.ok((section.match(/class="settings-card-body"/g) || []).length >= 14);
    for (const m of section.matchAll(/<span id="([a-z-]+)" class="workspace-name-msg hidden"><\/span>/g)) {
      const before = section.slice(0, m.index);
      const row = Math.max(before.lastIndexOf('class="workspace-name-row"'), before.lastIndexOf('class="settings-card-actions"'));
      const card = Math.max(before.lastIndexOf('class="settings-card"'), before.lastIndexOf('class="settings-card '));   // the card itself, not -body/-actions/-header
      assert.ok(row > card, `${m[1]} is inside a workspace-name-row or settings-card-actions`);
    }
    assert.equal(section.includes('<div id="workspace-name-msg"'), false, 'message elements are spans, not divs');
  });
  test('full-width cards use the wide class; the trigger card keeps its pinned opening tag', () => {
    assert.match(section, /<div class="settings-card wide">\s*<div class="settings-card-header">\s*<h2 data-i18n="set_pipelines">/);
    assert.match(section, /<div class="settings-card hidden wide" id="onboarding-trigger-card">/);
  });
});

describe('scripts and styles', () => {
  const css = read('public/style.css'), settings = read('public/js/settings.js');
  test('the CSS primitives exist and the settings rhythm is fixed', () => {
    for (const rule of ['.settings-card-body', '.settings-card-actions', '.settings-empty', '.settings-card.wide', '.settings-card.danger', '.settings-tab-hint', '.text-danger', '.row-label-strong', '.settings-tab.hidden', '.onb-trigger-pipeline']) assert.ok(css.includes(rule + ' '), rule);
    assert.match(css, /\.settings-tab-body \{[^}]*padding-top: 0;/);
    assert.match(css, /\.pipeline-settings-row \{[^}]*flex-direction: column;/);
    assert.match(css, /\.settings-row\.pipeline-stage-row, \.settings-row\.col-cfg-row \{ padding: var\(--sp-2\) var\(--sp-4\)/);
    assert.match(css, /\.col-cfg-locked \.drag-handle \{ opacity: \.25; \}/);
    assert.match(css, /\.settings-card-header h2, \.settings-card-header h3 \{/);
  });
  test('settings.js renders empty states and pipelines without inline spacing and picks the tab by role', () => {
    assert.equal(/padding:6px 10px|margin-top:6px|padding:8px 0|margin:6px 0 2px|display:flex;gap:4px/.test(settings), false);
    assert.ok((settings.match(/class="settings-empty"/g) || []).length >= 7);
    assert.match(sliceFn(settings, 'renderPipelinesSettings', 'settings.js'), /class="hstack-tight"/);
    assert.match(sliceFn(settings, 'renderPipelinesSettings', 'settings.js'), /<div class="settings-card-body"><div class="settings-card-actions">\s*<button class="btn btn-sm btn-ghost" onclick="addPipelineStage/);
    const load = sliceFn(settings, 'loadSettings', 'settings.js');
    assert.match(load, /getElementById\('settings-tab-workspace'\)\?\.classList\.toggle\('hidden', !isOwner\)/);
    assert.match(load, /if \(!isOwner && currentSettingsTab === 'workspace'\) currentSettingsTab = 'preferences';/);
    assert.match(settings, /^let currentSettingsTab = 'workspace';/m);
    assert.match(read('public/js/core.js'), /getElementById\('pref-dark-toggle'\)/, 'the Appearance toggle follows the theme');
  });
  test('the guided tour still points at existing tabs', () => {
    for (const m of read('public/js/guide.js').matchAll(/data-tab="([a-z]+)"/g)) assert.ok(TABS.includes(m[1]), m[1]);
  });
});
