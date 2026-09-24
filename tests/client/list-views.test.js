// CLIENT (static + pure-function) tests for the lists rework: one table
// language for Contacts and the Deals list — sentence-case sortable headers,
// row click opens / double-click edits, a checkbox column with a selection
// bar, hover row actions, pagination that is always shown, real empty states,
// and a searchable, sortable, paginated deals list.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const css  = read('public/style.css');
const core = read('public/js/core.js');
const contacts = read('public/js/contacts.js');
const deals = read('public/js/deals.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const GLYPH = /📁|↑|↓|⇅|✕|‹|›/;

describe('core.js list primitives', () => {
  test('shared helpers and icons exist; keys are in both dictionaries', () => {
    for (const fn of ['tableHeadCell', 'paginationHtml', 'rowIsInteractive', 'sortIconFor']) assert.match(core, new RegExp(`^function ${fn}\\(`, 'm'), fn);
    for (const k of ['chevronUp', 'chevronDown', 'chevronLeft', 'chevronRight', 'sort', 'folder']) assert.match(core, new RegExp(`^\\s*${k}:\\s*'<svg`, 'm'), `UI_ICON.${k}`);
    for (const k of ['search_contacts_ph', 'search_deals_ph', 'btn_filter', 'n_selected', 'select_all_n', 'pagination_range', 'empty_contacts_title', 'empty_contacts_hint',
                     'empty_filtered_title', 'empty_filtered_hint', 'btn_clear_filters', 'empty_deals_title', 'empty_deals_hint', 'filter_title', 'filter_keywords',
                     'filter_keyword_ph', 'filter_none', 'dblclick_edit', 'btn_open', 'row_menu', 'confirm_delete_contact', 'col_actions']) {
      assert.ok(k in dict.en && k in dict.de, k);
    }
  });
  test('fmtDate follows the UI language (English stays pinned elsewhere)', () => {
    const F = loadFns('public/js/core.js', ['fmtDate'], { state: { currentLang: 'de' } });
    const out = F.fmtDate('2026-03-05T12:00:00');
    assert.ok(out.includes('2026') && !out.includes('Mar'), out);
  });
  test('paginationHtml always renders the range, and chevrons are SVG', () => {
    const F = loadFns('public/js/core.js', ['paginationHtml', 'buildPageNumbers', 'esc', 't'], {
      state: { currentLang: 'en' },
      extra: sliceConst('public/js/core.js', 'TRANSLATIONS') + '\n' + sliceConst('public/js/core.js', 'UI_ICON'),
    });
    const one = F.paginationHtml({ total: 12, page: 1, pageSize: 25, goto: 'goToPage' });
    assert.match(one, /1–12 of 12/);
    assert.doesNotMatch(one, GLYPH);
    const many = F.paginationHtml({ total: 240, page: 3, pageSize: 25, goto: 'goToPage' });
    assert.match(many, /51–75 of 240/);
    assert.match(many, /page-btn active"[^>]*>3</);
    assert.match(many, /onclick="goToPage\(4\)"/);
  });
});

describe('contacts.js', () => {
  const table = sliceFn(contacts, 'renderContactsTable', 'contacts.js');
  test('the table: shared headers, checkbox column, row click, double-click edit, hover actions, no glyphs', () => {
    for (const s of ['tableHeadCell(', 'th-check', 'td-check', 'onclick="onContactRowClick(event', 'tabindex="0"', 'ondblclick="startInlineEdit(', 'cell-edit-hint',
                     'row-actions', 'openContactRowMenu(event', 'table-empty', 'paginationHtml(']) {
      assert.ok(table.includes(s), s);
    }
    assert.equal(table.includes('onclick="startInlineEdit('), false, 'single-click no longer edits');
    assert.equal(table.includes('btn-wa-inline'), false, 'WhatsApp left the name cell');
    assert.doesNotMatch(table, GLYPH);
    assert.doesNotMatch(table, /style="width:40px/);
  });
  test('selection: page-level select-all, select-all-filtered, a selection bar; no select mode', () => {
    assert.match(sliceFn(contacts, 'toggleSelectAll', 'contacts.js'), /currentPageContacts\(\)/);
    assert.match(contacts, /^function selectAllFiltered\(/m);
    assert.match(contacts, /^function renderSelectionBar\(/m);
    assert.equal(/function toggleSelectMode\(/.test(contacts), false);
    assert.equal(contacts.includes('contacts-kanban-board'), false, 'dead kanban branch removed');
  });
  test('search covers phone; the filter panel has no inline styles and speaks t(); chips use icons', () => {
    assert.match(sliceFn(contacts, 'filterContacts', 'contacts.js'), /\(c\.phone\s*\|\|\s*''\)\.toLowerCase\(\)\.includes\(q\)/);
    const panel = sliceFn(contacts, 'renderFilterPanel', 'contacts.js');
    assert.equal(panel.includes('style="'), false);
    assert.equal(panel.includes("label: 'Name'"), false);
    assert.match(sliceFn(contacts, 'renderFilterChips', 'contacts.js'), /UI_ICON\.remove/);
  });
  test('the pinned helpers are untouched', () => {
    assert.match(contacts, /key: 'created_at',\s+label: \(\) => t\('col_created_at'\)/);
    assert.match(contacts, /^function effectiveContactColumns\(/m);
    assert.match(contacts, /^function getSortValue\(/m);
    assert.match(contacts, /^function sortContacts\(/m);
    assert.equal(/onboarding|drive_file_count/.test(contacts), false, 'no onboarding / Drive columns on this branch');
  });
  test('the page header keeps the Add button icon', () => {
    const h = sliceFn(contacts, 'updateContactsPageHeader', 'contacts.js');
    assert.equal(/btn\.textContent\s*=/.test(h), false);
    assert.match(h, /querySelector\('span'\)|\.lastElementChild|span/);
  });
});

describe('deals.js list', () => {
  const list = sliceFn(deals, 'renderDealsList', 'deals.js');
  test('sortable headers, search, pagination, row menu, right-aligned numbers, empty state', () => {
    for (const s of ['tableHeadCell(', 'sortDeals(', 'applyDealSearch(', 'paginationHtml(', 'onclick="onDealRowClick(event', 'openDealCardMenu(event', 'td-num', 'row-actions', 'table-empty']) {
      assert.ok(list.includes(s), s);
    }
    assert.match(deals, /^function toggleDealSort\(/m);
    assert.match(sliceFn(deals, 'renderDealsBoard', 'deals.js'), /applyDealSearch\(/);
  });
  test('sortDeals orders by the chosen column', () => {
    const F = loadFns('public/js/deals.js', ['sortDeals', 'getDealSortValue'], { state: { dealSortKey: 'value', dealSortDir: 'desc', dealFields: [] } });
    const rows = [{ id: 1, value: '5' }, { id: 2, value: 50 }, { id: 3, value: null }];
    assert.deepEqual(F.sortDeals(rows).map(r => r.id), [2, 1, 3]);
    F.__set('dealSortKey', null);
    assert.equal(F.sortDeals(rows), rows, 'no sort key: same array back');
  });
});

describe('markup and stylesheet', () => {
  test('contacts toolbar: search, filter/import/export translated, a selection bar, no Select button', () => {
    const sec = html.slice(html.indexOf('<section id="page-contacts"'), html.indexOf('</section>', html.indexOf('<section id="page-contacts"')));
    assert.match(sec, /<div class="toolbar" id="contacts-toolbar">/);
    assert.match(sec, /<div class="selection-bar hidden" id="selection-bar">/);
    assert.equal(sec.includes('select-mode-btn'), false);
    assert.equal(sec.includes('bulk-delete-section'), false);
    assert.match(sec, /data-i18n="btn_filter"/);
    assert.match(sec, /id="contact-search" data-i18n-ph="search_contacts_ph"/);
  });
  test('deals page: a search box and a pagination bar', () => {
    const sec = html.slice(html.indexOf('<section id="page-deals"'), html.indexOf('</section>', html.indexOf('<section id="page-deals"')));
    assert.match(sec, /id="deal-search" data-i18n-ph="search_deals_ph"/);
    assert.match(sec, /id="deals-pagination" class="pagination-bar/);
  });
  test('table CSS: sentence-case headers, sortable/check/actions cells, selection bar, edit hint, empty cell', () => {
    for (const r of ['.th-sortable {', '.th-check, .td-check {', '.th-actions, .td-actions {', '.td-num {', '.selection-bar {', '.cell-edit-hint {', '.table-empty {', '.sort-ic {', '.filter-keyword-row {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    assert.match(css, /\n\.table th \{[^}]*text-transform: none/);
    assert.match(css, /\n\.table tbody tr\.is-selected td \{/);
    assert.doesNotMatch(css, /\.editable-cell \{[^}]*margin: -3px/);
    assert.doesNotMatch(css, /^#select-mode-btn\.active/m);
  });
});
