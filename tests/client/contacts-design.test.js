// CLIENT (static) tests for the Contacts list view, ported from
// reference/pro/src/screens/contacts.js. Contacts has no kanban in the
// reference (it's a list-only screen with a side detail), and the app's own
// kanban code (renderContactsKanban, contactCard, etc.) has no button or
// markup wiring it to the page any more — it is left alone, not styled.
// Suppliers reuses this exact markup/section with currentContactType toggled.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const contacts = read('public/js/contacts.js');
const modals = read('public/js/modals.js');
const css = read('public/style.css');
const section = html.slice(html.indexOf('<section id="page-contacts"'), html.indexOf('<!-- ── Team Chat ── -->'));
const count = (src, needle) => src.split(needle).length - 1;

describe('markup: header, toolbar and table shell', () => {
  test('files parse', () => { for (const f of ['public/js/contacts.js', 'public/js/modals.js']) execFileSync('node', ['--check', path.join(ROOT, f)]); });
  test('the import/export buttons are a single more menu; Add keeps the sprite plus', () => {
    assert.match(section, /<button class="btn btn-secondary btn-icon" onclick="openContactsMoreMenu\(this\)" type="button" aria-label="More actions" data-i18n-aria="html_more_actions" aria-haspopup="menu"><svg class="ic" aria-hidden="true"><use href="#i-ellipsis"\/><\/svg><\/button>/);
    assert.match(section, /id="list-add-btn" onclick="openContactModal\(\)"><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg><span data-i18n="add_contact">/);
    assert.doesNotMatch(section, /onclick="openImportModal\(\)"|onclick="exportContactsCSV\(\)"/, 'the two buttons are gone from the toolbar; the menu calls them instead');
  });
  test('the toolbar is rendered by contacts.js (Part 18); the old filter panel, chip list, badge and toggle are gone; the bulk bar container stays', () => {
    assert.match(section, /<div class="toolbar" id="contacts-toolbar"><\/div>/);
    for (const id of ['filter-panel', 'filter-chips', 'filter-toggle-btn', 'filter-badge', 'contact-search', 'select-mode-btn']) assert.equal(count(section, `id="${id}"`), 0, id + ' is built at runtime now');
    assert.doesNotMatch(section, /toggleFilterPanel|toolbar-actions|id="bulk-delete-section"/);
    assert.match(section, /<div id="contacts-bulkbar"><\/div>/);
    assert.match(section, /<div class="page-header">\s*<div><h1 data-i18n="page_contacts">Contacts<\/h1><p class="page-sub" id="contacts-page-sub"><\/p><\/div>/);
  });
  test('every sprite reference inside the Contacts section resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
    assert.ok(count(section, '<use href="#i-') >= 3, 'the toolbar\'s icons moved into renderContactsToolbar (Part 18); the static section keeps the header and side-panel ones');
  });
});

describe('contacts.js: table renderer follows the reference', () => {
  test('the name cell is a person with an avatar and a stacked company line', () => {
    const r = sliceFn(contacts, 'renderContactsTable', 'contacts.js');
    assert.match(r, /class="person"/); assert.match(r, /avatar\(c\.name\)/);
    assert.match(r, /class="contact-name-link truncate" title="\$\{esc\(c\.name\)\}"/);
  });
  test('there is no stage column any more (Part 19) — the table is built from the user\'s own columns', () => {
    const r = sliceFn(contacts, 'renderContactsTable', 'contacts.js');
    assert.doesNotMatch(r, /stage-pill|stage-badge|stage_id/);
    assert.match(sliceFn(contacts, 'effectiveContactColumns', 'contacts.js'), /\.\.\.fields\.map\(f => \(\{ key: f\.field_key/, 'custom fields are columns');
  });
  test('a sortable head shows an arrow icon only on the active column, like the reference', () => {
    const r = sliceFn(contacts, 'renderContactsTable', 'contacts.js');
    assert.match(r, /icon\(sortDir === 'asc' \? 'arrow-up' : 'arrow-down', 'ic-sm'\) : ''/);
    assert.doesNotMatch(r, /sort-icon|⇅|↑|↓/);
  });
});

describe('contacts.js: filter chips, bulk bar, pagination, select mode', () => {
  test('the toolbar is search + only the filters you added + a "+ Filter" picker, then Select and Columns (Part 19)', () => {
    const r = sliceFn(contacts, 'renderContactsToolbar', 'contacts.js');
    assert.match(r, /<div class="input-group ct-search">\$\{icon\('search'\)\}<input class="input" id="contact-search" type="search"/);
    assert.match(r, /activeFilterKeys\(\)\.map\(k => contactsChip\(k\)\)\.join\(''\)/, 'a chip per added filter, nothing fixed');
    assert.match(r, /onclick="openAddFilterMenu\(this\)" aria-haspopup="menu">\$\{icon\('filter'\)\}\$\{esc\(t\('add_filter'\)\)\}/);
    assert.match(r, /contactsFilterActive\(\) \? `<button class="btn btn-ghost btn-sm" type="button" onclick="clearContactFilters\(\)">/);
    assert.match(r, /id="select-mode-btn" onclick="toggleSelectMode\(\)" aria-pressed="\$\{selectionModeOn\}"/);
    assert.match(r, /onclick="openContactsColumnsMenu\(this\)" aria-haspopup="menu">\$\{icon\('columns'\)\}/);
    assert.doesNotMatch(r, /chip_stage|chip_last|contactsChip\('owner'|contactsChip\('stage'/, 'no fixed Owner/Stage/Last-contact chips any more');
  });
  test('the filter columns come from the same user-customisable column set as the table, minus the name column', () => {
    const f = sliceFn(contacts, 'filterableColumns', 'contacts.js');
    assert.match(f, /effectiveContactColumns\(\)/, 'derived from the user\'s own columns, not a hardcoded list');
    assert.match(f, /c\.key !== '_name'/);
    const m = sliceFn(contacts, 'openAddFilterMenu', 'contacts.js');
    assert.match(m, /ui\.menu\(/);
    assert.match(m, /const added = activeFilterKeys\(\);/);
    assert.match(m, /checked: added\.includes\(c\.key\)/, 'already-added columns are ticked');
  });
  test('a column with a fixed, listable set keeps a menu: dropdown options, members for the assignee, the date ranges', () => {
    const o = sliceFn(contacts, 'openContactsChip', 'contacts.js');
    assert.match(o, /filterKind\(key\) === 'text'/, 'the kind of column decides menu vs typing field');
    assert.match(o, /filterOptionsFor\(key\)/);
    assert.match(o, /label: t\('remove_filter'\)/, 'a chip can also drop its own filter');
    const fo = sliceFn(contacts, 'filterOptionsFor', 'contacts.js');
    assert.match(fo, /const unassigned = \{ value: '', label: t\('detail_unassigned'\) \}/);
    assert.match(fo, /type === 'assignee'/); assert.match(fo, /type === 'dropdown'/); assert.match(fo, /type === 'date'/);
  });
  test('a free-text column (email, phone, company, a text custom field) filters from a typed field, not a list of every value (Part 22)', () => {
    assert.match(contacts, /const FILTER_MENU_TYPES = \['dropdown', 'assignee', 'date'\];/, 'only the listable types get a menu');
    const k = sliceFn(contacts, 'filterKind', 'contacts.js');
    assert.match(k, /FILTER_MENU_TYPES\.includes\(type\) \? 'menu' : 'text'/);
    const o = sliceFn(contacts, 'openContactsChip', 'contacts.js');
    assert.match(o, /openContactTextFilter\(anchor, key\)/);
    const tf = sliceFn(contacts, 'openContactTextFilter', 'contacts.js');
    assert.match(tf, /ui\.popover\(/, 'a small popover with an input, not a value list');
    assert.match(tf, /type="search"/);
    assert.match(tf, /oninput|addEventListener\('input'/);
    assert.match(tf, /setTimeout\(/, 'debounced so the table filters while you type');
    assert.match(tf, /skipToolbar: true/, 'the toolbar is left alone so the field keeps focus and caret');
    assert.match(tf, /t\('remove_filter'\)/);
    assert.doesNotMatch(contacts, /function distinctValues/, 'listing every value is what this replaces');
  });
  test('a typed filter matches anywhere in the value, case-insensitively; listable columns still match exactly', () => {
    const v = sliceFn(contacts, 'visibleContacts', 'contacts.js');
    assert.match(v, /filterKind\(key\) === 'text'/);
    assert.match(v, /\.toLowerCase\(\)\.includes\(/);
    assert.match(sliceFn(contacts, 'filterValueText', 'contacts.js'), /`"\$\{v\}"`/, 'the chip shows the typed text quoted');
  });
  test('contact stages are gone from the client: no stages global, no ensureStages, no stage column, filter, kanban or inline-edit type', () => {
    for (const pat of ['stage_id', 'stage_name', 'stage_color', 'ensureStages', '/api/stages', "'stage'", 'openStageModal', 'stage-pill', 'renderContactsKanban', 'kanbanAllContacts']) assert.equal(count(contacts, pat), 0, 'contacts.js still mentions ' + pat);
    const core = read('public/js/core.js');
    assert.equal(count(core, 'let stages'), 0, 'the contact stages global is gone from core.js');
    for (const f of ['public/js/auth.js', 'public/js/modals.js', 'public/js/detail-views.js', 'public/js/admin-import.js', 'public/js/settings.js']) {
      const src = read(f);
      assert.equal(count(src, 'ensureStages'), 0, f + ' ensureStages');
      assert.equal(count(src, "api.get('/api/stages')"), 0, f + ' /api/stages');
    }
    assert.equal(count(read('public/js/modals.js'), 'cf-stage'), 0, 'the contact form has no stage select');
    assert.equal(count(read('public/js/detail-views.js'), "data-edit=\"stage\""), 0, 'the contact detail has no stage row');
  });
  test('contact stages are gone from the server and the markup: no routes/stages.js, no stages mount, no stage_id in the contact reads/writes or the admin defaults', () => {
    const fs = require('fs');
    assert.equal(fs.existsSync(path.join(ROOT, 'routes/stages.js')), false, 'routes/stages.js deleted');
    const server = read('server.js');
    assert.equal(count(server, "require('./routes/stages')"), 0);
    assert.equal(count(server, "'/api/stages'"), 0);
    const rc = read('routes/contacts.js');
    for (const pat of ['stage_name', 'stage_color', 'LEFT JOIN stages', "patch('/:id/stage'"]) assert.equal(count(rc, pat), 0, 'routes/contacts.js still mentions ' + pat);
    assert.equal(count(rc, 'stage_id'), 1, 'the only stage_id left is the pipeline stage of a deal created during import');
    assert.match(rc, /INSERT INTO deals \(workspace_id, contact_id, pipeline_id, stage_id, title\)/);
    assert.equal(count(read('routes/admin.js'), "key: 'stage_id'"), 0, 'the platform default contact columns drop Stage');
    assert.equal(count(html, 'id="stage-modal"'), 0, 'the stage modal markup is gone');
    assert.equal(count(html, 'id="contact-stages-list"'), 0, 'the Settings contact-stages card is gone');
    assert.equal(count(html, 'contacts-kanban-board'), 0, 'the stage-based contacts kanban markup is gone');
  });
  test('new workspaces are not seeded with contact stages any more, and the table/column stay in the database untouched (code-only removal)', () => {
    const db = read('db.js');
    assert.equal(count(db, 'seedDefaultStages'), 0);
    assert.equal(count(db, 'getAdminDefaultStages'), 0);
    assert.match(db, /CREATE TABLE IF NOT EXISTS stages \(/, 'the table itself is left in place, unused — no data is destroyed');
    assert.match(db, /stage_id\s+INTEGER REFERENCES stages\(id\)/, 'contacts.stage_id is left in place too');
  });
  test('visibleContacts (sandbox): search, then any column — assignee incl. Unassigned, a custom dropdown, a free-text column, and a date range', () => {
    const F = loadFns('public/js/contacts.js',
      ['visibleContacts', 'daysSince', 'contactsFilterActive', 'activeFilterKeys', 'filterableColumns', 'columnValue', 'inDateRange', 'effectiveContactColumns', 'filterKind'],
      { state: { contacts: [], activeFilters: {}, fields: [], contactColumns: [] },
        extra: `const t = k => k;\n${sliceConst('public/js/contacts.js', 'FILTER_MENU_TYPES')}` });
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); };
    F.__set('fields', [{ field_key: 'industry', name: 'Industry', type: 'dropdown', options: ['Finance', 'Real estate'] }]);
    F.__set('contacts', [
      { id: 1, name: 'Anna Berg', company: 'Berg GmbH', email: 'anna@berg.de', phone: '+49 151 234 5678', assigned_to: 1, custom_data: { industry: 'Real estate' }, created_at: day(0), last_activity_at: day(0) },
      { id: 2, name: 'Jonas Kahl', company: null, email: null, phone: null, assigned_to: null, custom_data: {}, created_at: day(-5), last_activity_at: day(-5) },
      { id: 3, name: 'Mira Voss', company: 'Voss AG', email: 'm@voss.ch', phone: '0041 44 999', assigned_to: null, custom_data: { industry: 'Finance' }, created_at: day(-45), last_activity_at: day(-45) },
    ]);
    const ids = () => F.visibleContacts().map(c => c.id);
    const set = f => F.__set('activeFilters', f);
    set({}); assert.deepEqual(ids(), [1, 2, 3]); assert.equal(F.contactsFilterActive(), false);
    set({ q: 'berg' }); assert.deepEqual(ids(), [1]);
    set({ q: '1512345' }); assert.deepEqual(ids(), [1], 'digits match the phone ignoring punctuation');
    set({ cols: { assigned_to: 1 } }); assert.deepEqual(ids(), [1]);
    set({ cols: { assigned_to: '' } }); assert.deepEqual(ids(), [2, 3], 'empty string = Unassigned');
    set({ cols: { industry: 'Finance' } }); assert.deepEqual(ids(), [3]);
    set({ cols: { company: 'Voss AG' } }); assert.deepEqual(ids(), [3]);
    set({ cols: { company: 'voss' } }); assert.deepEqual(ids(), [3], 'a typed filter matches part of the value, any case');
    set({ cols: { email: 'berg.de' } }); assert.deepEqual(ids(), [1], 'which is the point: you type part of an email instead of scanning a list');
    set({ cols: { company: 'g' } }); assert.deepEqual(ids(), [1, 3], 'and can match several');
    set({ cols: { created_at: 'week' } }); assert.deepEqual(ids(), [1, 2], 'a date column filters by range');
    set({ cols: { created_at: 'older' } }); assert.deepEqual(ids(), [3]);
    set({ q: 'voss', cols: { industry: 'Finance' } }); assert.deepEqual(ids(), [3], 'search and column filters combine');
    assert.deepEqual(F.activeFilterKeys(), ['industry']);
    set({ cols: { company: null } }); assert.deepEqual(F.activeFilterKeys(), ['company'], 'an added-but-unset filter still shows its chip');
    assert.deepEqual(ids(), [1, 2, 3], 'and filters nothing until a value is picked');
  });
  test('stylesheet and strings: the filter-panel rules are gone, the toolbar search rule no longer paints a second magnifier over an .input-group, select mode is aria-pressed, the new keys exist in en and de', () => {
    for (const s of ['.filter-panel', '.filter-opt', '.filter-chip', '.filter-sections', '#select-mode-btn.active']) assert.equal(count(css, s), 0, s);
    assert.match(css, /^\.toolbar > input \{/m); assert.doesNotMatch(css, /^\.toolbar input \{/m);
    assert.match(css, /^\.ct-search \{/m);
    const core = read('public/js/core.js');
    const en = core.slice(core.indexOf('  en: {'), core.indexOf('  de: {')), de = core.slice(core.indexOf('  de: {'), core.indexOf('function t(key)'));
    for (const k of ['chip_last', 'last_today', 'last_week', 'last_month', 'last_older', 'last_never', 'btn_select', 'no_contacts_match', 'no_contacts_yet', 'n_items', 'n_of_items']) { assert.match(en, new RegExp(`\\b${k}:`), 'en ' + k); assert.match(de, new RegExp(`\\b${k}:`), 'de ' + k); }
    assert.equal(count(core, 'filter_btn:'), 0, 'the Filter button label is dead');
  });
  test('toggling select mode shows/hides a reference .bulkbar instead of the old inline section', () => {
    assert.match(sliceFn(contacts, 'updateBulkDeleteButton', 'contacts.js'), /class="bulkbar"/);
    assert.match(sliceFn(contacts, 'updateBulkDeleteButton', 'contacts.js'), /clearContactSelection\(\)/);
    sliceFn(contacts, 'clearContactSelection', 'contacts.js');
  });
  test('pagination uses the table-foot / ct-pg pattern with sprite chevrons', () => {
    const r = sliceFn(contacts, 'renderPagination', 'contacts.js');
    assert.match(r, /class="table-foot"/); assert.match(r, /class="ct-pg"/);
    assert.match(r, /class="ct-flip">\$\{icon\('chevron-right'\)\}/);
    assert.doesNotMatch(r, /pagination-bar|pagination-controls|page-btn|‹|›/);
  });
  test('the more menu wires to the existing import/export functions', () => {
    const m = sliceFn(contacts, 'openContactsMoreMenu', 'contacts.js');
    assert.match(m, /openImportModal\(\)/); assert.match(m, /exportContactsCSV\(\)/); assert.match(m, /ui\.menu\(/);
  });
});

describe('modals.js: the contact side panel is now the reference detail view (Part 16, see tests/client/detail-views.test.js)', () => {
  test('its own close button is an iconbtn with the sprite x icon', () => {
    const panel = html.slice(html.indexOf('id="contact-side-panel"'), html.indexOf('<!-- ── Team Chat ── -->'));
    assert.match(panel, /<button class="iconbtn" onclick="closeSidePanel\(\)" aria-label="Close" data-i18n-aria="btn_close"><svg class="ic" aria-hidden="true"><use href="#i-x"\/><\/svg><\/button>/);
  });
  test('buildDetailHTML and the old per-field panel/note helpers are gone; openDetail now renders the reference contact detail', () => {
    for (const fn of ['buildDetailHTML', 'openDetail', 'renderContactDeals', 'updateContactStage', 'toggleContactNoteForm', 'editContactPanel'])
      assert.equal(modals.split(`function ${fn}(`).length - 1, 0, fn);
  });
});

describe('stylesheet: the new pagination classes exist', () => {
  test('.ct-pg / .ct-flip / .gap are defined', () => {
    assert.match(css, /^\.ct-pg \{/m); assert.match(css, /^\.ct-flip \{/m); assert.match(css, /^\.ct-pg \.gap \{/m);
  });
});
