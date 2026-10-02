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
const { read, sliceFn } = require('../helpers/client-fn');
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
    assert.match(section, /<button class="btn btn-secondary btn-icon" onclick="openContactsMoreMenu\(this\)" type="button" aria-label="More actions" aria-haspopup="menu"><svg class="ic" aria-hidden="true"><use href="#i-ellipsis"\/><\/svg><\/button>/);
    assert.match(section, /id="list-add-btn" onclick="openContactModal\(\)"><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg><span data-i18n="add_contact">/);
    assert.doesNotMatch(section, /onclick="openImportModal\(\)"|onclick="exportContactsCSV\(\)"/, 'the two buttons are gone from the toolbar; the menu calls them instead');
  });
  test('the filter toggle is a chip, and the old bulk-delete toolbar section is gone (the bulk bar renders under the toolbar instead)', () => {
    assert.match(section, /<button class="chip" id="filter-toggle-btn" onclick="toggleFilterPanel\(\)" type="button"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-filter"\/><\/svg><span data-i18n="filter_btn">Filter<\/span> <span id="filter-badge" class="badge badge-info hidden">0<\/span><\/button>/);
    assert.doesNotMatch(section, /id="bulk-delete-section"/);
    assert.match(section, /<div id="contacts-bulkbar"><\/div>/);
  });
  test('every sprite reference inside the Contacts section resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
    assert.ok(count(section, '<use href="#i-') >= 5);
  });
});

describe('contacts.js: table renderer follows the reference', () => {
  test('the name cell is a person with an avatar and a stacked company line', () => {
    const r = sliceFn(contacts, 'renderContactsTable', 'contacts.js');
    assert.match(r, /class="person"/); assert.match(r, /avatar\(c\.name\)/);
    assert.match(r, /class="contact-name-link truncate" title="\$\{esc\(c\.name\)\}"/);
  });
  test('the stage column uses the shared .stage-pill, not the old .stage-badge', () => {
    const r = sliceFn(contacts, 'renderContactsTable', 'contacts.js');
    assert.match(r, /class="stage-pill"/);
    assert.doesNotMatch(r, /stage-badge/);
  });
  test('a sortable head shows an arrow icon only on the active column, like the reference', () => {
    const r = sliceFn(contacts, 'renderContactsTable', 'contacts.js');
    assert.match(r, /icon\(sortDir === 'asc' \? 'arrow-up' : 'arrow-down', 'ic-sm'\) : ''/);
    assert.doesNotMatch(r, /sort-icon|⇅|↑|↓/);
  });
});

describe('contacts.js: filter chips, bulk bar, pagination, select mode', () => {
  test('active filter chips use the shared .chip.on / .x pattern', () => {
    const r = sliceFn(contacts, 'renderFilterChips', 'contacts.js');
    assert.match(r, /class="chip on"/); assert.match(r, /class="x"/);
    assert.doesNotMatch(r, /filter-chip\b|filter-chip-remove/);
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
    assert.match(panel, /<button class="iconbtn" onclick="closeSidePanel\(\)" aria-label="Close"><svg class="ic" aria-hidden="true"><use href="#i-x"\/><\/svg><\/button>/);
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
