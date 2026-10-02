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
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const analytics = read('public/js/analytics.js');
const section = html.slice(html.indexOf('<section id="page-analytics"'), html.length);

describe('markup: static drag handles and the Configure Metrics button', () => {
  test('file parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/analytics.js')]));
  test('every .section-drag-handle uses the sprite grip icon', () => {
    const matches = [...section.matchAll(/<div class="section-drag-handle" title="Drag to reorder section">(.*?)<\/div>/g)];
    assert.ok(matches.length >= 4, 'at least 4 draggable sections');
    for (const m of matches) assert.match(m[1], /<use href="#i-grip"\/>/);
  });
  test('Configure Metrics has the sprite settings icon', () => {
    assert.match(section, /onclick="openAnalyticsConfig\(\)"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-settings"\/><\/svg><span>Configure Metrics<\/span>/);
  });
  test('no braille drag-handle characters remain in the section', () => {
    assert.doesNotMatch(section, /⠿/);
  });
});

describe('analytics.js: JS-rendered drag handles', () => {
  test('the card drag handle uses icon(\'grip\')', () => {
    assert.match(sliceFn(analytics, 'renderAnalyticsCards', 'analytics.js'), /icon\('grip', 'ic-sm'\)/);
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
