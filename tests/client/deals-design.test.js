// CLIENT (static + sandboxed) tests for the Deals tab ported from
// reference/pro/src/screens/deals.js: page header with pipeline picker and
// Board/List segment, summary card with KPIs and stage strip, chip toolbar,
// a board of .col-board columns with .dcard cards, a sortable list with
// selection, bulk bar and footer. The deal modal is untouched (next step).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const css   = read('public/style.css');
const html  = read('public/index.html');
const deals = read('public/js/deals.js');
const core  = read('public/js/core.js');
const count = (src, needle) => src.split(needle).length - 1;
const section = html.slice(html.indexOf('<section id="page-deals"'), html.indexOf('<!-- ── Contacts ── -->'));

describe('markup: the Deals section follows the reference screen', () => {
  test('header: title + sub line, pipeline select as a button, Board/List segment, more menu, Add deal', () => {
    assert.match(section, /<h1 class="page-title" data-i18n="nav_deals">/);
    assert.match(section, /<p class="page-sub" id="deals-page-sub">/);
    assert.match(section, /<select id="deals-pipeline-select" class="btn btn-secondary deals-pipeline-select" onchange="onPipelineChange\(\)">/);
    assert.match(section, /<div class="seg" role="group"[^>]*>\s*<button id="deal-view-kanban" aria-pressed="true" onclick="setDealView\('kanban'\)"[^>]*>[\s\S]*?<button id="deal-view-list" aria-pressed="false" onclick="setDealView\('list'\)"/);
    assert.match(section, /<button class="btn btn-secondary btn-icon" onclick="openDealsMoreMenu\(this\)"/);
    assert.match(section, /<button class="btn btn-primary" onclick="openDealModal\(\)">[\s\S]*?<span data-i18n="add_deal">/);
  });
  test('containers: summary card, toolbar, board, list view with bulk bar, table and footer', () => {
    assert.match(section, /<section id="deals-summary" class="card summary hidden"/);
    assert.match(section, /<div id="deals-toolbar" class="toolbar">/);
    assert.match(section, /<div id="deals-board" class="board">/);
    assert.match(section, /<div id="deals-list-view" class="deals-list hidden">[\s\S]*?<div id="deals-bulkbar">[\s\S]*?<div class="table-wrap">\s*<table class="table" id="deals-table">\s*<thead id="deals-thead"><\/thead>\s*<tbody id="deals-tbody"><\/tbody>\s*<\/table>\s*<\/div>\s*<div id="deals-list-foot" class="table-foot">/);
    for (const id of ['deals-page-sub', 'deals-pipeline-select', 'deal-view-kanban', 'deal-view-list', 'deals-summary', 'deals-toolbar', 'deals-board', 'deals-list-view', 'deals-bulkbar', 'deals-table', 'deals-thead', 'deals-tbody', 'deals-list-foot']) {
      assert.equal(count(html, `id="${id}"`), 1, id);
    }
  });
  test('no inline SVG, no old kanban classes; every sprite reference resolves', () => {
    assert.doesNotMatch(section, /<svg viewBox|view-toggle|pipeline-board/);
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
    assert.ok(count(section, '<use href="#i-') >= 4);
  });
});

describe('deals.js: renderers follow the reference', () => {
  test('files parse', () => { for (const f of ['public/js/deals.js', 'public/js/core.js']) execFileSync('node', ['--check', path.join(ROOT, f)]); });
  test('the board renders .col-board columns with head, sum, bar and cards; drag and drop targets the column', () => {
    const b = sliceFn(deals, 'renderDealsBoard', 'deals.js');
    assert.match(b, /<section class="col-board[^"]*" data-stage="\$\{stage\.id\}"/);
    for (const c of ['col-head', 'col-sum', 'col-bar', 'col-cards']) assert.ok(b.includes(`class="${c}"`), c);
    assert.match(b, /ondragover="dealDragOver\(event\)" ondragleave="dealDragLeave\(event\)" ondrop="dealDrop\(event,\$\{stage\.id\}\)"/);
    assert.match(b, /data-add="\$\{stage\.id\}"/, 'a + per column');
    assert.match(sliceFn(deals, 'dealDragOver', 'deals.js'), /\.col-board/);
    assert.match(sliceFn(deals, 'dealDrop', 'deals.js'), /moveDealToStage\(/);
    assert.match(sliceFn(deals, 'moveDealToStage', 'deals.js'), /ui\.toast\([\s\S]*?action:/, 'move shows a toast with Undo');
  });
  test('a card is a .dcard with urgency bar, kebab, title, contact meta, value, badge, avatar and dates', () => {
    const c = sliceFn(deals, 'dealCard', 'deals.js');
    assert.match(c, /<div class="dcard" draggable="true" tabindex="0" role="button" data-id="\$\{d\.id\}"/);
    assert.match(c, /class="urg urg-\$\{/); assert.match(c, /class="iconbtn kebab"/); assert.match(c, /openDealKebab\(/);
    for (const cls of ['dcard-title', 'dcard-meta', 'dcard-foot', 'dcard-value', 'dcard-sub']) assert.ok(c.includes(cls), cls);
    assert.match(c, /avatar\(/); assert.match(c, /urgencyBadge\(/); assert.match(c, /fmtEUR\(/); assert.match(c, /agoDays\(/);
    assert.match(c, /openDealModal\(\$\{d\.id\}\)/);
    assert.doesNotMatch(c, /urgency-select|👤|→|contact-card|deal-card/);
  });
  test('the list has selection, sortable heads, stage pills, kebabs, a bulk bar and a footer', () => {
    const l = sliceFn(deals, 'renderDealsList', 'deals.js');
    assert.match(l, /class="check"/); assert.match(l, /data-all/); assert.match(l, /data-row="\$\{d\.id\}"/);
    assert.match(l, /aria-sort=/); assert.match(l, /data-sort="\$\{key\}"/);
    assert.match(l, /class="stage-pill"/); assert.match(l, /num-col tnum strong/);
    assert.match(l, /openDealKebab\(/); assert.match(l, /class="bulkbar"/); assert.match(l, /deals-list-foot/);
    assert.match(l, /effectiveDealColumns\(\)/, 'the saved column order and visibility still apply');
    assert.match(l, /class="empty"/);
    assert.doesNotMatch(l, /deal-list-row|stage-badge|deal-value-chip/);
  });
  test('summary and toolbar', () => {
    const s = sliceFn(deals, 'renderDealsSummary', 'deals.js');
    assert.match(s, /class="kpis"/); assert.match(s, /class="kpi"/); assert.match(s, /class="stack"/); assert.match(s, /class="stack-legend"/); assert.match(s, /data-jump="\$\{/);
    const tb = sliceFn(deals, 'renderDealsToolbar', 'deals.js');
    assert.match(tb, /class="input-group"/); assert.match(tb, /id="deals-q"/); assert.match(tb, /dealsChip\('owner'/); assert.match(tb, /dealsChip\('urgency'/); assert.match(tb, /dealsChip\('stage'/);
    assert.match(tb, /openDealsColumnsMenu\(this\)/); assert.match(tb, /toggleDealsSummary\(\)/);
    assert.match(sliceFn(deals, 'dealsChip', 'deals.js'), /class="chip \$\{on \? 'on' : ''\}"/);
    assert.match(sliceFn(deals, 'openDealsChip', 'deals.js'), /ui\.select\(/);
  });
  test('menus and confirms use the ui primitives, never window.confirm', () => {
    assert.match(sliceFn(deals, 'openDealKebab', 'deals.js'), /ui\.menu\(/);
    assert.match(sliceFn(deals, 'openDealKebab', 'deals.js'), /setDealUrgency\(/);
    assert.match(sliceFn(deals, 'deleteDeals', 'deals.js'), /await ui\.confirm\(/);
    assert.match(sliceFn(deals, 'openDealsMoreMenu', 'deals.js'), /exportDealsCsv\(\)/);
    assert.match(sliceFn(deals, 'openDealsMoreMenu', 'deals.js'), /switchSettingsTab\('deals'\)/);
    assert.match(sliceFn(deals, 'openDealsColumnsMenu', 'deals.js'), /\/api\/auth\/preferences/);
    assert.doesNotMatch(deals, /(^|[^.\w])confirm\(/);
  });
  test('view switch sets aria-pressed; the Settings column list still exists', () => {
    const v = sliceFn(deals, 'setDealView', 'deals.js');
    assert.match(v, /setAttribute\('aria-pressed'/); assert.doesNotMatch(v, /classList\.toggle\('active'/);
    sliceFn(deals, 'renderDealColumnSettings', 'deals.js'); sliceFn(deals, 'effectiveDealColumns', 'deals.js'); sliceFn(deals, 'saveDealColumns', 'deals.js');
    assert.match(sliceFn(deals, 'addDealInStage', 'deals.js'), /openDealForm\(\{ pipelineId: currentPipelineId, stageId \}\)/, 'the column + opens the deal form with the pipeline and stage preset (Part 16)');
  });
});

describe('deals.js: the pipeline select drops "All pipelines" in board mode (it always rendered empty there)', () => {
  test('populatePipelineSelect omits the all-pipelines option when dealViewMode is kanban, keeps it in list mode', () => {
    const fn = sliceFn(deals, 'populatePipelineSelect', 'deals.js');
    assert.match(fn, /dealViewMode === 'kanban' \? '' : `<option value="">/);
  });
  test('setDealView re-populates the select and refetches only if the pipeline selection actually changed', () => {
    const fn = sliceFn(deals, 'setDealView', 'deals.js');
    assert.match(fn, /populatePipelineSelect\(\);/);
    assert.match(fn, /if \(currentPipelineId !== prevPipelineId\)/);
  });
  test('loadDeals delegates to the shared populatePipelineSelect instead of its own inline copy', () => {
    const fn = sliceFn(deals, 'loadDeals', 'deals.js');
    assert.match(fn, /populatePipelineSelect\(\);/);
    assert.doesNotMatch(fn, /opt_all_pipelines/);
  });
  test('behaviorally: board mode never offers "All pipelines" and auto-picks the first real one; list mode offers it', () => {
    const F = loadFns('public/js/deals.js', ['populatePipelineSelect'], {
      state: { pipelines: [{ id: 5, name: 'Sales' }, { id: 6, name: 'Rentals' }], currentPipelineId: null, dealViewMode: 'kanban' },
      extra: `
        const t = k => ({ opt_all_pipelines: 'All pipelines' })[k];
        const esc = s => String(s ?? '');
        const fakeSel = { innerHTML: '', _value: '', set value(v) { this._value = String(v); }, get value() { return this._value; } };
        const document = { getElementById: id => id === 'deals-pipeline-select' ? fakeSel : null };
      `,
      expose: ['fakeSel'],
    });
    F.__set('dealViewMode', 'kanban');
    F.populatePipelineSelect();
    assert.doesNotMatch(F.fakeSel.innerHTML, /All pipelines/, 'board mode must not offer the option that always renders empty');
    assert.equal(F.fakeSel.value, '5', 'auto-picks the first real pipeline when none was selected');

    F.__set('dealViewMode', 'list');
    F.__set('currentPipelineId', null);
    F.populatePipelineSelect();
    assert.match(F.fakeSel.innerHTML, /All pipelines/, 'list mode can mix every pipeline, so the option stays');
    assert.equal(F.fakeSel.value, '', 'list mode does not force a pipeline selection');
  });
});

describe('deals.js: pure helpers in a sandbox', () => {
  const extra = `
    const t = k => ({ or_higher: 'or higher', no_contact: 'No contact' })[k] || k;
    const esc = s => String(s ?? '');
    const localStorage = { getItem: () => null, setItem() {} };
    const currentLang = 'en';
  `;
  const F = loadFns('public/js/deals.js', ['fmtEUR', 'fmtEURShort', 'sumValue', 'visibleDeals', 'dealsKpis', 'urgencyBadge', 'urgencyMeta', 'urgencyLabel', 'agoDays'], {
    state: { deals: [], members: [], dealsUI: { q: '', owner: null, urgency: null, stage: null, sort: { key: 'created_at', dir: -1 }, sel: [], summary: true } },
    extra: extra + `\nconst DEAL_URGENCY = ${deals.slice(deals.indexOf('const DEAL_URGENCY = ') + 'const DEAL_URGENCY = '.length, deals.indexOf('];', deals.indexOf('const DEAL_URGENCY = ')) + 2)}`,
  });
  const seed = [
    { id: 1, title: 'Mehrfamilienhaus Köln', contact_name: 'Anna Berg', contact_company: 'Berg GmbH', value: '485000', urgency: 2, assigned_to: 1, stage_id: 10, created_at: '2026-09-01' },
    { id: 2, title: 'Portfolio Düsseldorf', contact_name: 'Jonas Kahl', contact_company: null, value: '1250000', urgency: 4, assigned_to: 2, stage_id: 11, created_at: '2026-09-10' },
    { id: 3, title: 'Büro Hamburg', contact_name: null, contact_company: null, value: null, urgency: 0, assigned_to: null, stage_id: 10, created_at: '2026-09-20' },
  ];
  test('money formats: full value stays de-DE (no cents); the short form uses k/M, not Tsd./Mio.', () => {
    assert.equal(F.fmtEUR(485000).replace(/ /g, ' '), '485.000 €');
    assert.equal(F.fmtEURShort(1250000), '1.25M €');
    assert.equal(F.fmtEURShort(48000), '48k €');
    assert.equal(F.fmtEURShort(1234), '1.23k €', 'keeps up to 2 decimals for a non-round thousand');
    assert.equal(F.fmtEURShort(950).replace(/ /g, ' '), '950 €');
    assert.equal(F.fmtEUR(null).replace(/ /g, ' '), '0 €');
  });
  test('visibleDeals applies search, owner, urgency (at least) and stage', () => {
    F.__set('deals', seed);
    const ui = (patch) => F.__set('dealsUI', { q: '', owner: null, urgency: null, stage: null, sort: { key: 'created_at', dir: -1 }, sel: [], summary: true, ...patch });
    ui({}); assert.deepEqual(F.visibleDeals().map(d => d.id), [1, 2, 3]);
    ui({ q: 'berg' }); assert.deepEqual(F.visibleDeals().map(d => d.id), [1], 'matches the company');
    ui({ q: 'hamburg' }); assert.deepEqual(F.visibleDeals().map(d => d.id), [3]);
    ui({ owner: 2 }); assert.deepEqual(F.visibleDeals().map(d => d.id), [2]);
    ui({ urgency: 2 }); assert.deepEqual(F.visibleDeals().map(d => d.id), [1, 2]);
    ui({ stage: 10 }); assert.deepEqual(F.visibleDeals().map(d => d.id), [1, 3]);
  });
  test('KPIs: pipeline value, count, average over valued deals, urgent count', () => {
    assert.deepEqual(F.dealsKpis(seed), { value: 1735000, count: 3, avg: 867500, urgent: 1 });
    assert.deepEqual(F.dealsKpis([]), { value: 0, count: 0, avg: 0, urgent: 0 });
  });
  test('urgency badges use the reference tones', () => {
    assert.match(F.urgencyBadge(4), /class="badge badge-danger"/);
    assert.match(F.urgencyBadge(3), /class="badge badge-warning"/);
    assert.match(F.urgencyBadge(2), /class="badge badge-info"/);
    assert.match(F.urgencyBadge(1), /class="badge badge-neutral"/);
    assert.equal(F.urgencyBadge(0), '');
    assert.equal(F.urgencyMeta(3).tone, 'warning');
  });
  test('agoDays reads a timestamp', () => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    assert.equal(F.agoDays(d.toISOString()), '2 days ago');
    assert.equal(F.agoDays(new Date().toISOString()), 'Today');
    assert.equal(F.agoDays(null), '');
  });
});

describe('core.js: shared avatar helper and the new strings', () => {
  test('avatar() with hashed colours and initials', () => {
    assert.match(core, /^const AV_COLORS = \[/m);
    assert.match(core, /^function initialsOf\(/m); assert.match(core, /^function hashColor\(/m); assert.match(core, /^function avatar\(/m);
    const F = loadFns('public/js/core.js', ['initialsOf', 'hashColor', 'avatar'], { extra: `const esc = s => String(s ?? ''); const AV_COLORS = ${core.slice(core.indexOf('const AV_COLORS = ') + 'const AV_COLORS = '.length, core.indexOf('];', core.indexOf('const AV_COLORS = ')) + 2)}` });
    assert.equal(F.initialsOf('Anna Maria Berg'), 'AM');
    assert.match(F.avatar('Anna Berg', 'sm'), /^<span class="avatar avatar-sm" style="background:#[0-9A-Fa-f]{6}" title="Anna Berg">AB<\/span>$/);
    assert.equal(F.hashColor('x'), F.hashColor('x'));
    assert.equal(F.avatar(null), '');
  });
  test('every Deals string exists in both languages', () => {
    const en = core.slice(core.indexOf('  en: {'), core.indexOf('  de: {')), de = core.slice(core.indexOf('  de: {'), core.indexOf('function t(key)'));
    for (const k of ['deals_in_pipeline', 'deals_all_pipelines', 'kpi_pipeline_value', 'kpi_deals', 'kpi_avg_deal', 'kpi_urgent', 'kpi_urgent_foot', 'chip_owner', 'chip_urgency', 'chip_stage', 'filter_all', 'or_higher', 'clear_filters', 'btn_columns', 'show_summary', 'hide_summary', 'view_board', 'view_list', 'no_deals_match', 'try_removing_filter', 'n_selected', 'move_to_stage', 'set_urgency', 'open_deal', 'delete_deal', 'delete_deal_q', 'delete_deals_q', 'delete_deal_msg', 'deal_deleted', 'deals_deleted', 'moved_to', 'undo', 'export_csv', 'manage_pipelines', 'no_contact', 'not_set', 'created_lbl', 'updated_lbl', 'of_deals', 'total_lbl', 'col_urgency', 'col_owner', 'col_title', 'col_pipeline', 'search_deals', 'add_deal']) {
      assert.match(en, new RegExp(`(^|[ ,{])${k}:`, 'm'), `en ${k}`); assert.match(de, new RegExp(`(^|[ ,{])${k}:`, 'm'), `de ${k}`);
    }
    assert.match(en, /add_deal:'Add deal'/); assert.match(de, /add_deal:'Deal hinzufügen'/);
  });
});

describe('stylesheet', () => {
  test('board column body scoped under .col-board; urgency bars; dead deal-card rules gone; contacts kanban kept', () => {
    assert.match(css, /^\.col-board \.col-cards \{ padding: 2px 10px 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; min-height: 64px; \}/m);
    assert.match(css, /^\.urg-3 \{ background: var\(--warning\); \} \.urg-4 \{ background: var\(--danger\); \}/m);
    assert.match(css, /^#deals-board\.board \{/m); assert.match(css, /^#deals-list-view \{ display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;/m);
    for (const gone of ['.deal-card', '.deal-value-chip', '.deal-list-row', '.card-urgency-select', '.urgency-select', '.urgency-label']) assert.ok(!css.includes(gone + ' ') && !css.includes(gone + '.') && !css.includes(gone + ','), `${gone} removed`);
    for (const kept of ['.pipeline-board {', '.pipeline-col {', '.contact-card {', '.col-cards {', '.stage-badge {']) assert.ok(css.includes(kept), kept);
    // .urgency-dot was kept for the old deal modal's urgency select (Part 2 note above); that modal
    // is gone as of Part 16 (tests/client/detail-views.test.js), so the rule is dead and removed too.
    assert.ok(!css.includes('.urgency-dot'));
  });
});
