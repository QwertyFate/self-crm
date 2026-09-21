// CLIENT test — the real public/index.html and public/js/analytics.js loaded
// into a fake browser (jsdom). Skips itself if jsdom is not installed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { JSDOM, skipOpts } = require('../helpers/dom');
const { ROOT } = require('../helpers/load-route');

const html   = () => fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const source = () => fs.readFileSync(path.join(ROOT, 'public', 'js', 'analytics.js'), 'utf8');

const SUMMARY = (layout = {}) => ({
  total_contacts: 3, new_contacts: 1, total_deals: 4, open_deals: 1, won_deals: 2, lost_deals: 1, win_rate: 67,
  pipeline_value: 100, won_value: 200, avg_value: 100, new_deals: 1, total_tasks: 0, done_tasks: 0, overdue_tasks: 0,
  by_pipeline: [{ pipeline_name: 'Sales', cnt: '4', val: '300' }], all_stages: [], deal_fields: [],
  config: { value_field: 'value', won_stage_ids: [], lost_stage_ids: [] }, layout,
});
const pts   = k => Array.from({ length: 7 }, (_, i) => ({ period: `2026-09-1${i}`, [k]: String(i + 1) }));
const TREND = { contacts: pts('cnt'), deals: pts('cnt'), value_trend: pts('val'), period: 'week' };

function load(layout = {}) {
  const dom = new JSDOM(html(), { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.api = { get: async url => (url.startsWith('/api/analytics/summary') ? SUMMARY(layout) : TREND), patch: async () => ({ success: true }) };
  w.esc = s => String(s ?? '');
  w.eval(source());
  return w;
}
const settle   = () => new Promise(r => setTimeout(r, 30));
const sections = w => [...w.document.getElementById('analytics-main-sections').children].map(s => s.dataset.sectionId);
const rendered = w => ({
  pipelineRows: w.document.querySelectorAll('#analytics-by-pipeline .pipeline-bar-row').length,
  wlSegments:   w.document.querySelectorAll('#analytics-winloss-bar .wl-segment').length,
  cards:        w.document.querySelectorAll('#analytics-cards .analytics-card').length,
});

describe('analytics page', skipOpts, () => {
  test('loadAnalytics() resolves and renders all four sections', async () => {
    const w = load();
    await w.eval('loadAnalytics()'); await settle();
    assert.deepEqual(sections(w), ['stats', 'winloss', 'pipeline', 'trends']);
    assert.deepEqual(rendered(w), { pipelineRows: 1, wlSegments: 3, cards: 6 });
  });

  test('a second load (revisiting the page) keeps exactly four sections', async () => {
    const w = load();
    await w.eval('loadAnalytics()'); await settle();
    await w.eval('loadAnalytics()'); await settle();
    assert.equal(sections(w).length, 4);
    assert.equal(rendered(w).pipelineRows, 1);
  });

  test('a stored section_order drives the DOM order', async () => {
    const w = load({ section_order: ['trends', 'pipeline', 'stats', 'winloss'] });
    await w.eval('loadAnalytics()'); await settle();
    assert.deepEqual(sections(w), ['trends', 'pipeline', 'stats', 'winloss']);
  });

  test('after two loads, one drop moves a section exactly once (listeners bound once)', async () => {
    const w = load();
    await w.eval('loadAnalytics()'); await settle();
    await w.eval('loadAnalytics()'); await settle();
    const fire = (el, type, dt) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); el.dispatchEvent(e); };
    fire(w.document.getElementById('analytics-sec-stats'), 'dragstart', { effectAllowed: '' });
    fire(w.document.getElementById('analytics-sec-winloss'), 'drop', {});
    await settle();
    assert.deepEqual(sections(w), ['winloss', 'stats', 'pipeline', 'trends']);
  });
});
