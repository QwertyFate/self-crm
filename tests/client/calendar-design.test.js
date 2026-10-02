// CLIENT (static) tests for the Calendar page's icon/chrome polish and a
// genuine bug fix (hardcoded hex legend colors instead of design tokens).
// The reference's week view and upcoming-events sidebar
// (reference/pro/src/screens/calendar.js) were not built — this stays a
// month grid with a day-click modal, see DESIGN_PRO_CHANGES.md Part 8. The
// existing .calendar-* classes were kept (already pull from the unified
// tokens, same reasoning as Tasks' .task-col/.task-card in Part 5).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const calendar = read('public/js/calendar.js');
const section = html.slice(html.indexOf('<section id="page-calendar"'), html.indexOf('<!-- ── Objects ── -->'));

describe('markup: header uses sprite icons', () => {
  test('file parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/calendar.js')]));
  test('calendar title icon and prev/next chevrons are sprite', () => {
    assert.match(section, /<h1><svg class="ic" aria-hidden="true"><use href="#i-calendar"\/><\/svg> Calendar<\/h1>/);
    assert.match(section, /onclick="calendarPrevMonth\(\)" aria-label="Previous month"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"\/><\/svg>/);
    assert.match(section, /onclick="calendarNextMonth\(\)" aria-label="Next month"><svg class="ic" aria-hidden="true"><use href="#i-chevron-right"\/><\/svg>/);
  });
  test('every sprite reference inside the section resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
  });
});

describe('calendar.js: the day-events pop window (Part 16: ui.modal, see tests/client/detail-views.test.js)', () => {
  test('opens through ui.modal, closed via the shared [data-close], not a hand-rolled close button', () => {
    const d = sliceFn(calendar, 'openDayModal', 'calendar.js');
    assert.match(d, /ui\.modal\(\{ title: dateLabel/);
    assert.match(d, /data-close/);
    assert.doesNotMatch(d, /document\.getElementById\('day-events-modal'\)/);
  });
  test('the completed/pending legend uses design tokens, not hardcoded hex', () => {
    const d = sliceFn(calendar, 'openDayModal', 'calendar.js');
    assert.match(d, /class="legend/);
    assert.match(d, /background:var\(--success\)/);
    assert.match(d, /background:var\(--danger\)/);
    assert.doesNotMatch(d, /#22c55e|#ef4444/);
  });
  test('Open Deal has a sprite icon', () => {
    const d = sliceFn(calendar, 'openDayModal', 'calendar.js');
    assert.match(d, /icon\('external'\)\}Open Deal/);
  });
});
