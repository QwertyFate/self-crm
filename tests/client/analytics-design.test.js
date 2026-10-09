// CLIENT (static) tests for Analytics: drag-handle icons and the Configure
// Metrics button use the sprite instead of a braille-pattern "⠿" character.
// The reference's Analytics screen (reference/pro/src/screens/analytics.js)
// is a from-scratch SVG charting suite (funnel, line/column charts,
// tooltips, win/loss donut) with its own per-chart token-based colours and
// no fixed per-metric palette; the app's own charting system (configurable
// KPI cards and trend charts with a fixed colour per metric) is a
// comparable but differently-built feature and was not rebuilt — see
// DESIGN_PRO_CHANGES.md Part 11 for what's deferred and why the per-metric
// hex colours were left alone (no reference equivalent to copy).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const analytics = read('public/js/analytics.js');
const section = html.slice(html.indexOf('<section id="page-analytics"'), html.length);

describe('markup: static drag handles and the Configure Metrics button', () => {
  test('file parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/analytics.js')]));
  test('every .section-drag-handle uses the sprite grip icon', () => {
    const matches = [...section.matchAll(/<div class="section-drag-handle" title="Drag to reorder section" data-i18n-title="html_drag_section">(.*?)<\/div>/g)];
    assert.ok(matches.length >= 4, 'at least 4 draggable sections');
    for (const m of matches) assert.match(m[1], /<use href="#i-grip"\/>/);
  });
  test('Configure Metrics has the sprite settings icon', () => {
    assert.match(section, /onclick="openAnalyticsConfig\(\)"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-settings"\/><\/svg><span data-i18n="html_configure_metrics">Configure Metrics<\/span>/);
  });
  test('no braille drag-handle characters remain in the section', () => {
    assert.doesNotMatch(section, /⠿/);
  });
});

describe('analytics.js: JS-rendered drag handles', () => {
  test('the KPI cells are one card, so the per-tile drag handle is gone (Part 23); the section handles stay', () => {
    const r = sliceFn(analytics, 'renderAnalyticsCards', 'analytics.js');
    assert.doesNotMatch(r, /icon\('grip'/);
    assert.equal(analytics.split('function initStatCardDragDrop(').length - 1, 0);
    assert.match(sliceFn(analytics, 'initSectionDragDrop', 'analytics.js'), /dragSectionId/, 'sections are still reorderable');
  });
  test('no braille drag-handle characters remain anywhere in the file', () => {
    assert.doesNotMatch(analytics, /⠿/);
  });
});

describe('analytics.js: section renderers survive a repeat loadAnalytics() call', () => {
  test('loadAnalytics no longer wipes #analytics-main-sections before renderAllSections looks its children up by id', () => {
    const fn = sliceFn(analytics, 'loadAnalytics', 'analytics.js');
    assert.doesNotMatch(fn, /mainSections\.innerHTML/, 'that line deletes analytics-sec-* permanently, so the next getElementById(...) always returns null');
  });
  test('renderWinLoss guards against a missing section instead of crashing on section.style', () => {
    const fn = sliceFn(analytics, 'renderWinLoss', 'analytics.js');
    assert.match(fn, /if \(!section\) return;/);
  });
  test('renderByPipeline guards against a missing container the same way', () => {
    const fn = sliceFn(analytics, 'renderByPipeline', 'analytics.js');
    assert.match(fn, /if \(!el\) return;/);
  });
});

describe('the KPI row follows the reference (Part 23, step 1 of the Analytics port)', () => {
  const an = read('public/js/analytics.js');
  const css = read('public/style.css');
  test('one card holding an .an-kpis grid of .an-kpi cells: label + hint, big value, delta foot', () => {
    const r = sliceFn(an, 'renderAnalyticsCards', 'analytics.js');
    assert.match(r, /<section class="card" aria-label="\$\{t\('an_key_metrics_aria'\)\}">/);
    assert.match(r, /class="an-kpis"/);
    assert.match(r, /class="an-kpi"/);
    assert.match(r, /<div class="kpi-label"><span>\$\{esc\(t\(def\.label\)\)\}<\/span><span class="hint">/, 'def.label is a dictionary key');
    assert.match(r, /class="kpi-value"/); assert.match(r, /class="kpi-foot"/);
    assert.match(r, /class="an-kpi-fill"/, 'the odd cell explains what the deltas compare');
    assert.doesNotMatch(r, /analytics-card-accent|draggable="true"/, 'the reference row is one card, not six draggable tiles');
  });
  test('the reference metric set, in its order, with Avg deal size added; the app-only counts come after', () => {
    assert.match(an, /^const STAT_CARD_DEFS = \{\n\s+open_pipeline:/m, 'Open pipeline leads, like the reference');
    for (const id of ['open_pipeline', 'won_value', 'win_rate', 'new_deals', 'avg_deal_size']) assert.match(an, new RegExp(`\\n\\s+${id}:\\s*\\{`), id);
    assert.match(an, /^const DEFAULT_STAT_ORDER\s+= \['open_pipeline', 'won_value', 'win_rate', 'new_deals', 'avg_deal_size', 'contacts', 'deals'\];/m);
  });
  test('delta(): real comparison or an honest "no prior period", never a faked number', () => {
    const d = sliceFn(an, 'delta', 'analytics.js');
    assert.match(d, /t\('an_no_prior_period'\)/); assert.match(d, /tf\('an_no_change_vs'/);
    assert.match(d, /class="delta \$\{ok \? 'up' : 'down'\}"/);
    assert.match(d, /icon\(up \? 'arrow-up' : 'arrow-down'\)/);
    assert.match(d, /unit === '%' \? ' %' : ' ' \+ unit/, 'pp for a rate, days for a duration');
  });
  test('a snapshot metric carries no delta — only the two the data can actually window do', () => {
    const c = sliceFn(an, 'getStatCardContent', 'analytics.js');
    assert.match(c, /case 'new_deals'/); assert.match(c, /case 'avg_deal_size'/);
    assert.match(c, /d\.prev_new_deals/); assert.match(c, /d\.prev_avg_deal_size/);
    // open pipeline / won value / win rate are current-stage snapshots: the hint says so, no delta is invented
    assert.match(c, /snapshot/i);
  });
  test('the page sub line states the window the deltas compare', () => {
    assert.match(sliceFn(an, 'loadAnalytics', 'analytics.js'), /periodLabel\(/);
    assert.match(sliceFn(an, 'periodLabel', 'analytics.js'), /analyticsPeriodMonths/);
  });
  test('the request carries the window and the stylesheet has the reference KPI rules', () => {
    assert.match(an, /api\.get\(`\/api\/analytics\/summary\?months=\$\{analyticsPeriodMonths\}\$\{scope\}`\)/);
    for (const s of ['.an-kpis {', '.an-kpi {', '.an-kpi .kpi-label {', '.an-kpi-fill {']) assert.ok(css.includes(s), s);
  });
});

describe('Top open deals card (Part 24, step 2 of the Analytics port)', () => {
  const an = read('public/js/analytics.js');
  const html2 = read('public/index.html');
  const css2 = read('public/style.css');
  test('its own reorderable section; the reference puts it after the owner breakdown', () => {
    assert.match(an, /^const DEFAULT_SECTION_ORDER = \['stats','rate','funnel','winloss','owner','top','trends'\];/m);
    assert.match(html2, /<div class="analytics-draggable-section" id="analytics-sec-top" data-section-id="top">/);
    assert.match(html2, /id="analytics-top-deals"/);
    assert.match(sliceFn(an, 'renderAllSections', 'analytics.js'), /renderTopOpenDeals\(d\)/);
  });
  test('a card with the reference header, a table of Deal / Stage / Value / Owner, and a guarded container', () => {
    const r = sliceFn(an, 'renderTopOpenDeals', 'analytics.js');
    assert.match(r, /if \(!el\) return;/, 'the same guard the other section renderers have');
    assert.match(r, /class="card-title"[^>]*>\$\{t\('an_top_title'\)\}</);
    assert.match(r, /class="an-sub"/);
    assert.match(r, /t\('an_view_all_deals'\)/);
    assert.match(r, /<th>\$\{t\('col_title'\)\}<\/th><th>\$\{t\('col_stage'\)\}<\/th><th class="num-col">\$\{t\('lbl_deal_value'\)\}<\/th><th>\$\{t\('col_owner'\)\}<\/th>/);
    // probability and expected close are the reference's other two columns; this app has neither field
    assert.doesNotMatch(r, /Probability|Expected close/);
  });
  test('rows carry the deal, its contact, a stage pill and the owner, and open the deal', () => {
    const r = sliceFn(an, 'renderTopOpenDeals', 'analytics.js');
    assert.match(r, /class="stage-pill"/);
    assert.match(r, /avatar\(d2\.assigned_to_name, 'sm'\)/);
    assert.match(r, /onclick="openDealDetail\(/);
    assert.match(r, /t\('no_contact'\)/);
  });
  test('the footer counts what is not shown and totals the open value; empty state when there is nothing open', () => {
    const r = sliceFn(an, 'renderTopOpenDeals', 'analytics.js');
    assert.match(r, /class="table-foot"/);
    assert.match(r, /tf\('an_showing_top', \{ n: list\.length, total \}\)/);
    assert.match(r, /class="empty"/);
    assert.ok(css2.includes('.an-sub {'));
  });
});

describe('Deals by owner card (Part 25, step 3 of the Analytics port)', () => {
  const an = read('public/js/analytics.js');
  const html3 = read('public/index.html');
  test('its own reorderable section, between win/loss and the top deals', () => {
    assert.match(an, /^const DEFAULT_SECTION_ORDER = \['stats','rate','funnel','winloss','owner','top','trends'\];/m);
    assert.match(html3, /<div class="analytics-draggable-section" id="analytics-sec-owner" data-section-id="owner">/);
    assert.match(html3, /id="analytics-by-owner"/);
    assert.match(sliceFn(an, 'renderAllSections', 'analytics.js'), /renderDealsByOwner\(d\)/);
  });
  test('a row per teammate: avatar, first name, a bar, the count and their total value', () => {
    const r = sliceFn(an, 'renderDealsByOwner', 'analytics.js');
    assert.match(r, /if \(!el\) return;/);
    assert.match(r, /avatar\(o\.name, 'sm'\)/);
    assert.match(r, /class="pipeline-bar-track"[\s\S]*?class="pipeline-bar-fill"/);
    assert.match(r, /o\.name\.split\(' '\)\[0\]/, 'first name, like the reference');
    assert.match(r, /fmtCurrency\(o\.value\)/);
  });
  test('bars are scaled to the busiest owner, sorted by the route, and the breakdown is reachable without a tooltip engine', () => {
    const r = sliceFn(an, 'renderDealsByOwner', 'analytics.js');
    assert.match(r, /Math\.max\(1, \.\.\.list\.map\(o => o\.deals\)\)/);
    assert.match(r, /title="/, 'open / won / lost ride along as a title');
    assert.match(r, /o\.open/); assert.match(r, /o\.won/); assert.match(r, /o\.lost/);
  });
  test('the card header follows the reference, and an all-zero workspace gets an empty state', () => {
    const r = sliceFn(an, 'renderDealsByOwner', 'analytics.js');
    assert.match(r, /t\('an_owner_card_title'\)/);
    assert.match(r, /class="an-sub"/);
    assert.match(r, /tf\('an_owner_card_sub', \{ n: analyticsPeriodMonths \}\)/);
    assert.match(r, /class="empty"/);
  });
});

describe('Pipeline funnel card (Part 26, step 4 of the Analytics port)', () => {
  const an = read('public/js/analytics.js');
  const html4 = read('public/index.html');
  const css4 = read('public/style.css');
  test('its own reorderable section, where the reference puts it', () => {
    assert.match(an, /^const DEFAULT_SECTION_ORDER = \['stats','rate','funnel','winloss','owner','top','trends'\];/m);
    assert.match(html4, /<div class="analytics-draggable-section" id="analytics-sec-funnel" data-section-id="funnel">/);
    assert.match(html4, /id="analytics-funnel"/);
    assert.match(sliceFn(an, 'renderAllSections', 'analytics.js'), /renderFunnel\(d\)/);
  });
  test('a row per stage: colour dot, name, a bar scaled to the widest stage, reached count, value in stage', () => {
    const r = sliceFn(an, 'renderFunnel', 'analytics.js');
    assert.match(r, /if \(!el\) return;/);
    assert.match(r, /class="an-fn-row"/);
    assert.match(r, /Math\.max\(1, \.\.\.rows\.map\(x => x\.reached\)\)/);
    assert.match(r, /class="an-fn-dot"/);
    assert.match(r, /x\.reached/); assert.match(r, /fmtCurrency\(x\.value\)/);
    assert.match(r, /t\('an_value_in_stage'\)/);
  });
  test('between two stages it states the conversion, and the lost bucket sits under a divider', () => {
    const r = sliceFn(an, 'renderFunnel', 'analytics.js');
    assert.match(r, /class="an-fn-conv"/);
    assert.match(r, /tf\('an_fn_conv', \{ pct: conv, next: esc\(next\.name\) \}\)/);
    assert.match(r, /class="an-fn-lost"/);
    assert.match(r, /tf\('an_fn_lost_text', \{ n: f\.lost\.deals, pct:/);
  });
  test('the header names the pipeline it is showing, and an empty pipeline gets an empty state', () => {
    const r = sliceFn(an, 'renderFunnel', 'analytics.js');
    assert.match(r, /t\('an_funnel_title'\)/);
    assert.match(r, /esc\(f\.pipeline_name\)/);
    assert.match(r, /class="empty"/);
    for (const s of ['.an-fn-row {', '.an-fn-conv {', '.an-fn-dot {', '.an-fn-lost {']) assert.ok(css4.includes(s), s);
  });
});

describe('Win rate per month (Part 27, step 5 of the Analytics port)', () => {
  const an = read('public/js/analytics.js');
  const html5 = read('public/index.html');
  const css5 = read('public/style.css');
  test('its own reorderable section, before the funnel as in the reference BLOCKS order', () => {
    assert.match(an, /^const DEFAULT_SECTION_ORDER = \['stats','rate','funnel','winloss','owner','top','trends'\];/m);
    assert.match(html5, /<div class="analytics-draggable-section" id="analytics-sec-rate" data-section-id="rate">/);
    assert.match(html5, /id="analytics-win-rate"/);
    assert.match(sliceFn(an, 'renderAllSections', 'analytics.js'), /renderWinRateTrend\(d\)/);
  });
  test('a real line chart: 0/25/50/75/100 grid, area + line, month labels, last-value label', () => {
    const c = sliceFn(an, 'anRateChart', 'analytics.js');
    assert.match(c, /\[0, 25, 50, 75, 100\]/);
    assert.match(c, /class="an-grid"/); assert.match(c, /class="an-axis"/);
    assert.match(c, /class="an-area"/); assert.match(c, /class="an-line"/);
    assert.match(c, /class="an-t1"/);
    assert.doesNotMatch(c, /preserveAspectRatio="none"/, 'text inside the chart must not be stretched');
  });
  test('the card states what the rate is measured over, and says so when there is too little to plot', () => {
    const r = sliceFn(an, 'renderWinRateTrend', 'analytics.js');
    assert.match(r, /if \(!el\) return;/);
    assert.match(r, /class="card-title"[^>]*>\$\{t\('an_rate_title'\)\}</);
    assert.match(r, /class="an-sub"/);
    assert.match(r, /tf\('an_rate_sub', \{ n: analyticsPeriodMonths \}\)/, 'the sub line explains the cohort framing honestly');
    assert.match(r, /class="empty"/);
    for (const s of ['.an-chart {', '.an-svg {', '.an-grid {', '.an-line {', '.an-area {', '.an-t1 {']) assert.ok(css5.includes(s), s);
  });
  test('the geometry maps a rate onto the plot: 100 % at the top, 0 % on the baseline, a dot only where there is a rate', () => {
    const { anRateChart } = loadFns('public/js/analytics.js', ['anRateChart'], { extra: 'function esc(s) { return String(s); } function t(k) { return k; } function tf(k) { return k; }' });
    const pts = [
      { label: 'Jan', longLabel: 'January', rate: 100, created: 2, decided: 2, won: 2 },
      { label: 'Feb', longLabel: 'February', rate: null, created: 0, decided: 0, won: 0 },
      { label: 'Mar', longLabel: 'March', rate: 0, created: 3, decided: 3, won: 0 },
    ];
    const svg = anRateChart(pts);
    const ys = [...svg.matchAll(/class="an-dot[^"]*"[^>]*cy="([\d.]+)"/g)].map(m => parseFloat(m[1]));
    assert.equal(ys.length, 2, 'the month with no decided deals gets no dot');
    assert.ok(ys[0] < ys[1], '100 % sits above 0 %');
    const grid = [...svg.matchAll(/class="an-grid"[^>]*y1="([\d.]+)"/g)].map(m => parseFloat(m[1]));
    assert.equal(grid.length, 5);
    assert.ok(Math.abs(Math.min(...grid) - ys[0]) < 0.01, '100 % lands on the top gridline');
    assert.ok(Math.abs(Math.max(...grid) - ys[1]) < 0.01, '0 % lands on the baseline');
    for (const m of ['Jan', 'Feb', 'Mar']) assert.ok(svg.includes(`>${m}<`), `${m} is labelled on the axis`);
    assert.match(svg, /0 %<\/text>/, 'the last known rate is printed');
  });
});

describe('Win and loss, with By pipeline folded in (Part 28, step 6 of the Analytics port)', () => {
  const an = read('public/js/analytics.js');
  const html6 = read('public/index.html');
  const css6 = read('public/style.css');
  test('the two old sections become one card, as in the reference', () => {
    assert.match(an, /^const DEFAULT_SECTION_ORDER = \['stats','rate','funnel','winloss','owner','top','trends'\];/m);
    assert.doesNotMatch(html6, /analytics-sec-pipeline/, 'By pipeline is no longer a section of its own');
    assert.match(html6, /<div class="analytics-draggable-section" id="analytics-sec-winloss" data-section-id="winloss">/);
    assert.match(html6, /id="analytics-winloss"/);
  });
  test('the card holds the outcome stack, its legend rows, a divider, then the pipeline rows', () => {
    const r = sliceFn(an, 'renderWinLoss', 'analytics.js');
    assert.match(r, /if \(!section\) return;/, 'the guard that fixed the section.style crash stays');
    assert.match(r, /class="card-title"[^>]*>\$\{t\('an_wl_title'\)\}</);
    assert.match(r, /class="an-wl"/); assert.match(r, /class="stack"/);
    assert.match(r, /class="an-wl-row"/);
    assert.match(r, /class="an-divider"/);
    assert.match(r, />\$\{t\('an_by_pipeline'\)\}</);
    assert.match(r, /id="analytics-by-pipeline"/, 'renderByPipeline still has its own container to fill');
  });
  test('outcome colours come from tokens, not the old hardcoded hexes', () => {
    const r = sliceFn(an, 'renderWinLoss', 'analytics.js') + sliceFn(an, 'wlSegments', 'analytics.js');
    assert.doesNotMatch(r, /#22c55e|#3b82f6|#ef4444/);
    assert.match(r, /var\(--success\)/); assert.match(r, /var\(--danger\)/);
    assert.doesNotMatch(html6, /Deal Outcomes/, 'the old pre-reference heading is gone');
    assert.doesNotMatch(html6, /analytics-winloss-bar|analytics-winloss-legend/);
    assert.doesNotMatch(css6, /\.wl-segment/, 'and its dead styles with it');
  });
  test('the pipeline rows follow the reference: name, deals and value, then a progress bar', () => {
    const r = sliceFn(an, 'renderByPipeline', 'analytics.js');
    assert.match(r, /if \(!el\) return;/);
    assert.match(r, /class="an-pl-row"/);
    assert.match(r, /class="progress"/);
    assert.match(r, /Math\.max\(/, 'scaled to the busiest pipeline');
    for (const s of ['.an-wl .stack {', '.an-wl-rows {', '.an-wl-row {', '.an-pl {', '.an-pl-row .t {', '.an-divider {']) assert.ok(css6.includes(s), s);
  });
  test('wlSegments(): shares of every deal, and no division by zero on an empty workspace', () => {
    const { wlSegments } = loadFns('public/js/analytics.js', ['wlSegments'], {});
    const segs = wlSegments({ won_deals: 5, open_deals: 3, lost_deals: 2 });
    assert.deepEqual(segs.map(s => s.key), ['an_won', 'an_open', 'an_lost'], 'the reference order; each is the dictionary key of the outcome label');
    assert.deepEqual(segs.map(s => s.count), [5, 3, 2]);
    assert.deepEqual(segs.map(s => s.pct), [50, 30, 20]);
    assert.deepEqual(wlSegments({ won_deals: 0, open_deals: 0, lost_deals: 0 }).map(s => s.pct), [0, 0, 0]);
  });
});

describe('Page chrome (Part 29, step 7 of the Analytics port)', () => {
  const an = read('public/js/analytics.js');
  const html7 = read('public/index.html');
  const css7 = read('public/style.css');
  const sec7 = html7.slice(html7.indexOf('<section id="page-analytics"'));
  test('the reference page header: title, window sub line, and a 3M/6M/12M range switch', () => {
    assert.match(sec7, /<div class="page-header">/);
    assert.match(sec7, /<h1 class="page-title" data-i18n="nav_analytics">Analytics<\/h1>/);
    assert.match(sec7, /<p class="page-sub" id="analytics-period">/);
    assert.match(sec7, /<div class="seg" role="group" aria-label="Time range" data-i18n-aria="html_time_range">/);
    for (const v of [3, 6, 12]) assert.match(sec7, new RegExp(`data-period="${v}"[^>]*aria-pressed=`), `${v}M`);
    assert.doesNotMatch(sec7, /analytics-header|analytics-title/, 'the old pre-reference header is gone');
  });
  test('the range is validated, remembered, and reflected on the switch', () => {
    const f = sliceFn(an, 'setAnalyticsPeriod', 'analytics.js');
    assert.match(f, /\[3, 6, 12\]/, 'only the ranges the route accepts');
    assert.match(f, /localStorage/, 'remembered between visits');
    assert.match(f, /loadAnalytics\(\)/);
    assert.match(sliceFn(an, 'syncAnalyticsPeriodSwitch', 'analytics.js'), /aria-pressed/);
    assert.match(an, /^let analyticsPeriodMonths = periodFromStorage\(\);/m);
  });
  test('every chart card can show its numbers as a table instead', () => {
    const btn = sliceFn(an, 'anTableBtn', 'analytics.js');
    assert.match(btn, /data-table=/); assert.match(btn, /aria-pressed=/);
    assert.match(btn, /toggleAnalyticsTable\(/);
    assert.match(btn, /'bar-chart'/); assert.match(btn, /'table'/);
    const t = sliceFn(an, 'toggleAnalyticsTable', 'analytics.js');
    assert.match(t, /analyticsTables/); assert.match(t, /localStorage/);
    assert.match(t, /renderAllSections\(analyticsData\)/);
    for (const fn of ['renderWinRateTrend', 'renderFunnel', 'renderWinLoss', 'renderDealsByOwner'])
      assert.match(sliceFn(an, fn, 'analytics.js'), /analyticsTables\.has\(/, `${fn} has a table view`);
    assert.ok(css7.includes('.an-table-wrap {'), '.an-table-wrap');
  });
  test('anDataTable(): the reference table, with the numeric columns right-aligned', () => {
    const { anDataTable } = loadFns('public/js/analytics.js', ['anDataTable'], {});
    const out = anDataTable(['Month', 'Win rate', 'Created'], [['May', '40 %', 3]]);
    assert.match(out, /<div class="an-table-wrap"><table class="table compact">/);
    assert.match(out, /<th>Month<\/th>/);
    assert.match(out, /<th class="num-col">Win rate<\/th>/);
    assert.match(out, /<td>May<\/td>/);
    assert.match(out, /<td class="num-col tnum">40 %<\/td>/);
  });
  test('the funnel names its pipeline and can be pointed at another one', () => {
    const r = sliceFn(an, 'renderFunnel', 'analytics.js');
    assert.match(r, /openFunnelPipelineMenu/);
    const m = sliceFn(an, 'openFunnelPipelineMenu', 'analytics.js');
    assert.match(m, /all_stages/, 'the pipeline list is derived from data already in the payload');
    assert.match(m, /ui\.menu\(/);
    assert.match(m, /analyticsFunnelPipelineId/);
    assert.match(sliceFn(an, 'loadAnalytics', 'analytics.js'), /pipeline_id=/, 'the choice reaches the route');
  });
});
