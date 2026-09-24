// CLIENT (static + pure-function) tests for the Analytics rework: a fixed,
// designed layout (KPI band → outcomes + pipelines → trends), tokens only,
// real-pixel charts with a scale and a baseline, no drag-and-drop, every
// string via t(), and the metric settings modal translated.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');

const html = read('public/index.html');
const css = read('public/style.css');
const src = read('public/js/analytics.js');
const core = read('public/js/core.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const start = html.indexOf('<section id="page-analytics"');
const section = html.slice(start, html.indexOf('</section>', start));
const modalStart = html.indexOf('<div id="analytics-config-modal"');
const modal = html.slice(modalStart, html.indexOf('<!-- ── Settings', modalStart));
const secCss = css.slice(css.indexOf('20 · ANALYTICS'), css.indexOf('21 · INTEGRATIONS'));

describe('markup', () => {
  test('the page: shared header form, one KPI band, outcomes and pipelines side by side, trends with a view toggle', () => {
    assert.match(section, /<div class="page-header">\s*<div>\s*<h1 data-i18n="page_analytics">/);
    assert.match(section, /<p class="page-sub" id="analytics-period">/);
    assert.match(section, /<div class="page-actions">[\s\S]*onclick="openAnalyticsConfig\(\)"[\s\S]*data-i18n="analytics_settings"/);
    assert.match(section, /<div class="analytics-band" id="analytics-cards"/);
    assert.match(section, /<div class="analytics-row">/);
    for (const s of ['id="analytics-winloss-section"', 'id="analytics-winloss-bar"', 'id="analytics-winloss-legend"', 'id="analytics-by-pipeline"', 'id="analytics-trend-grid"',
                     'data-i18n="analytics_outcomes"', 'data-i18n="analytics_pipelines"', 'data-i18n="analytics_trends"']) assert.ok(section.includes(s), s);
    assert.match(section, /<div class="view-toggle" id="analytics-period-switcher"/);
    for (const p of ['week', 'month', 'year']) assert.match(section, new RegExp(`<button type="button" class="view-toggle-btn[^"]*" data-period="${p}" aria-pressed="(true|false)" onclick="switchTrendPeriod\\('${p}'\\)" data-i18n="period_${p}"`), p);
    for (const s of ['analytics-main-sections', 'analytics-draggable-section', 'section-drag-handle', 'period-btn', 'analytics-section-title', 'analytics-header', 'analytics-title', 'analytics-sub', 'style="']) {
      assert.equal(section.includes(s), false, `${s} is gone`);
    }
  });
  test('the metric settings modal is translated and carries no inline colours', () => {
    for (const k of ['cfg_title', 'cfg_cards', 'cfg_cards_hint', 'cfg_value_field', 'cfg_value_field_hint', 'cfg_won_stages', 'cfg_lost_stages', 'btn_cancel', 'btn_save']) {
      assert.ok(modal.includes(`data-i18n="${k}"`), k);
    }
    assert.match(modal, /class="analytics-config-label won"/);
    assert.match(modal, /class="analytics-config-label lost"/);
    assert.equal(modal.includes('style="'), false);
  });
  test('the sidebar entry is translated', () => {
    assert.match(html, /data-page="analytics"[\s\S]{0,400}<span data-i18n="nav_analytics">/);
  });
});

describe('analytics.js', () => {
  test('drag-and-drop, per-card views, the stretched SVG and the body tooltip are gone', () => {
    for (const s of ['draggable', 'initStatCardDragDrop', 'initSectionDragDrop', 'initTrendDragDrop', 'setCardView', 'renderDetailView', 'showSparkTooltip', 'sectionOrder',
                     'preserveAspectRatio="none"', 'fmtCurrency', "'$'", 'trend_config', 'section_order', 'stat_card_order']) {
      assert.equal(src.includes(s), false, `${s} removed`);
    }
    assert.doesNotMatch(src, /#[0-9a-f]{6}\b/i, 'no hex colours');
    assert.doesNotMatch(src, /style="(?!flex-basis:|width:|--stage:)/, 'inline styles only for a data-driven width and the stage colour idiom');
  });
  test('the new surface exists', () => {
    for (const fn of ['fmt', 'fmtMoneyShort', 'niceMax', 'chartLayout', 'linePath', 'areaPath', 'labelIndexes', 'buildStatOrder', 'statCellContent', 'renderAnalyticsCards',
                      'renderWinLoss', 'renderByPipeline', 'renderTrendCards', 'renderTrendChart', 'loadAnalytics', 'loadTrend', 'switchTrendPeriod',
                      'openAnalyticsConfig', 'closeAnalyticsConfig', 'saveAnalyticsConfig', 'saveLayoutConfig']) {
      assert.match(src, new RegExp(`^(async )?function ${fn}\\(`, 'm'), fn);
    }
    assert.match(src, /new ResizeObserver\(/, 'charts redraw on resize');
    assert.match(sliceFn(src, 'fmtMoneyShort', 'analytics.js'), /fmtMoney\(/, 'money goes through the workspace formatter');
    assert.match(sliceFn(src, 'renderTrendChart', 'analytics.js'), /clientWidth/, 'real-pixel charts');
    assert.match(sliceFn(src, 'renderTrendChart', 'analytics.js'), /class="chart-grid"/);
    assert.match(sliceFn(src, 'renderTrendChart', 'analytics.js'), /class="chart-hit"/);
  });
  test('no hard-coded English in the templates', () => {
    for (const s of ['Total Contacts', 'Win Rate', 'Pipeline Value', 'this month', 'Configure won/lost stages', 'Open deals', 'Won —', 'No deal outcomes', 'No pipelines yet',
                     'New Contacts', 'New Deals', 'Deal Value', 'A stage cannot be both', 'None — hide', 'built-in', 'deal${', "'s'"]) {
      assert.equal(src.includes(s), false, s);
    }
  });
  test('the period toggle uses aria-pressed and the language switch re-renders the page', () => {
    assert.match(sliceFn(src, 'switchTrendPeriod', 'analytics.js'), /aria-pressed/);
    assert.match(sliceFn(core, 'setLanguage', 'core.js'), /if \(page === 'analytics'\)\s+loadAnalytics\(\);/);
  });
});

describe('pure helpers', () => {
  const defsSrc = sliceConst('public/js/analytics.js', 'STAT_CARD_DEFS'), orderSrc = sliceConst('public/js/analytics.js', 'DEFAULT_STAT_ORDER');
  const extra = sliceFn(core, 't', 'core.js') + '\n' + sliceConst('public/js/core.js', 'TRANSLATIONS') + '\n' + defsSrc + '\n' + orderSrc + '\n' +
    'function fmtMoney(v){ return new Intl.NumberFormat("en-GB",{style:"currency",currency:"EUR",minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(v)); }';
  const F = loadFns('public/js/analytics.js', ['fmt', 'fmtMoneyShort', 'niceMax', 'chartLayout', 'linePath', 'areaPath', 'labelIndexes', 'buildStatOrder', 'r1'],
    { state: { currentLang: 'en' }, extra });
  F.STAT_CARD_DEFS = new Function(defsSrc.replace(/^[^{]*/, 'return '))();
  F.DEFAULT_STAT_ORDER = new Function(orderSrc.replace(/^[^[]*/, 'return '))();
  test('niceMax rounds up to 1 / 2 / 5 × 10ⁿ and never returns zero', () => {
    assert.equal(F.niceMax(0), 1); assert.equal(F.niceMax(1), 1); assert.equal(F.niceMax(3), 5); assert.equal(F.niceMax(7), 10);
    assert.equal(F.niceMax(37), 50); assert.equal(F.niceMax(50), 50); assert.equal(F.niceMax(1200), 2000); assert.equal(F.niceMax(0.4), 0.5);
  });
  test('chartLayout maps values into pixels with gutters, a baseline and evenly spaced ticks', () => {
    const L = F.chartLayout(400, 140, [0, 5, 10], { ticks: 2 });
    assert.equal(L.max, 10);
    assert.equal(L.x(0), L.padL); assert.equal(L.x(2), 400 - L.padR);
    assert.equal(L.y(0), L.baselineY); assert.equal(L.y(10), L.padT);
    assert.deepEqual(L.ticks.map(t => t.v), [0, 5, 10]);
    assert.ok(L.ticks[1].y > L.padT && L.ticks[1].y < L.baselineY);
    const one = F.chartLayout(400, 140, [3]);
    assert.equal(one.x(0), one.padL, 'a single point sits at the left gutter');
  });
  test('paths and label spacing', () => {
    assert.equal(F.linePath([{ x: 0, y: 10 }, { x: 5.56, y: 2 }]), 'M0,10 L5.6,2');
    assert.equal(F.areaPath([{ x: 0, y: 10 }, { x: 5, y: 2 }], 20), 'M0,10 L5,2 L5,20 L0,20 Z');
    assert.deepEqual(F.labelIndexes(3, 7), [0, 1, 2]);
    assert.deepEqual(F.labelIndexes(30, 7), [0, 5, 10, 15, 20, 25, 29]);
    assert.deepEqual(F.labelIndexes(1, 7), [0]);
  });
  test('compact numbers and money', () => {
    assert.equal(F.fmt(950), '950'); assert.equal(F.fmt(1500), '1.5K'); assert.equal(F.fmt(2500000), '2.5M'); assert.equal(F.fmt(null), '—');
    assert.equal(F.fmtMoneyShort(96000), '€96K'); assert.equal(F.fmtMoneyShort(1250000), '€1.3M'); assert.match(F.fmtMoneyShort(420), /€420/); assert.equal(F.fmtMoneyShort(null), '—');
  });
  test('the KPI order is fixed, value cards need a value field, hidden cards are hidden', () => {
    const d = { config: { value_field: null } };
    assert.deepEqual(F.buildStatOrder(['contacts', 'constructor'], d).map(c => c.id), ['win_rate', 'deals', 'new_deals', 'contacts', 'overdue_tasks']);
    const ids = F.buildStatOrder([], { config: { value_field: 'value' } }).map(c => c.id);
    assert.deepEqual(ids, F.DEFAULT_STAT_ORDER);
    assert.ok(ids.includes('pipeline_value') && ids.includes('won_value'));
    assert.equal(F.buildStatOrder(['win_rate'], d).find(c => c.id === 'win_rate').hidden, true);
    for (const def of Object.values(F.STAT_CARD_DEFS)) { assert.ok(def.label in dict.en && def.label in dict.de, def.label); assert.equal('color' in def, false); }
  });
});

describe('copy and stylesheet', () => {
  test('every analytics key exists in both dictionaries', () => {
    for (const k of ['page_analytics', 'nav_analytics', 'analytics_settings', 'analytics_outcomes', 'analytics_pipelines', 'analytics_trends', 'period_week', 'period_month', 'period_year',
                     'kpi_pipeline_value', 'kpi_won_value', 'kpi_win_rate', 'kpi_deals', 'kpi_new_deals', 'kpi_contacts', 'kpi_overdue_tasks', 'kpi_open_deals_sub', 'kpi_avg_sub',
                     'kpi_won_lost_sub', 'kpi_this_month', 'kpi_new_this_month', 'kpi_setup_stages', 'kpi_of_tasks', 'outcome_won', 'outcome_open', 'outcome_lost', 'no_outcomes_hint', 'no_pipelines',
                     'deal_one', 'deal_other', 'trend_new_deals', 'trend_new_contacts', 'trend_deal_value', 'cfg_title', 'cfg_cards', 'cfg_cards_hint', 'cfg_value_field',
                     'cfg_value_field_hint', 'cfg_value_none', 'cfg_value_builtin', 'cfg_won_stages', 'cfg_lost_stages', 'cfg_overlap_error']) {
      assert.ok(k in dict.en && k in dict.de, k);
    }
    assert.match(core, /^\s*settings:\s*'<svg/m, 'UI_ICON.settings');
  });
  test('the band, the sections and the chart rules exist; the tiles, drag handles and sparklines are gone; tokens only', () => {
    for (const r of ['.analytics-band {', '.analytics-cell {', '.analytics-cell-label {', '.analytics-cell-value {', '.analytics-cell-sub {', '.analytics-row {', '.analytics-section {',
                     '.analytics-section-head {', '.wl-bar {', '.wl-segment.won {', '.wl-segment.open {', '.wl-segment.lost {', '.wl-legend {', '.pipeline-bar-fill {', '.trend-grid {',
                     '.trend-card {', '.trend-chart {', '.chart-grid {', '.chart-axis {', '.chart-line.deals {', '.chart-line.contacts {', '.chart-line.value {', '.chart-area.deals {',
                     '.chart-bar.value {', '.chart-hit {', '.chart-tip {', '.analytics-config-label.won {', '.analytics-config-label.lost {']) {
      assert.ok(css.includes('\n' + r), r);
    }
    for (const s of ['.analytics-card', '.analytics-cards', '.analytics-draggable-section', '.section-drag-handle', '.period-btn', '.trend-view-btn', '.trend-drag-handle', '.trend-detail-',
                     '.spark-', '.sparkline-svg', '.trend-x-labels', '#analytics-main-sections', '.analytics-winloss ', '.analytics-sub', '.analytics-section-title', '.analytics-period-switcher', '.analytics-trend-grid']) {
      assert.equal(css.includes(s), false, `${s} gone`);
    }
    assert.doesNotMatch(secCss, /#[0-9a-f]{3,6}\b/i, 'tokens only in the analytics section');
    assert.doesNotMatch(secCss, /text-transform: uppercase/, 'sentence case, no shouting labels');
    assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?\.analytics-row \{ grid-template-columns: 1fr; \}/);
    assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.analytics-band \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    assert.match(css, /prefers-reduced-motion[\s\S]*?\.wl-segment, \.pipeline-bar-fill \{ transition: none; \}/);
  });
});
