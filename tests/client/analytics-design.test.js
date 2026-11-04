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
