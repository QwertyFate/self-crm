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
const { read, sliceFn, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const calendar = read('public/js/calendar.js');
const section = html.slice(html.indexOf('<section id="page-calendar"'), html.indexOf('<!-- ── Objects ── -->'));

describe('the reference Calendar screen (Part 30)', () => {
  const cal = read('public/js/calendar.js');
  const html3 = read('public/index.html');
  const css3 = read('public/style.css');
  const sec3 = html3.slice(html3.indexOf('<section id="page-calendar"'), html3.indexOf('<!-- ── Objects ── -->'));

  test('the page is a shell the renderer fills, with the reference header and toolbar', () => {
    assert.match(sec3, /<h1 class="page-title"[^>]*>Calendar<\/h1>/);
    assert.match(sec3, /id="calendar-page-sub"/);
    assert.match(sec3, /<div class="seg" role="group" aria-label="View" data-i18n-aria="tk_view">/);
    for (const v of ['month', 'week']) assert.match(sec3, new RegExp(`data-view="${v}"[^>]*aria-pressed=`), v);
    assert.match(sec3, /onclick="openActivityModal\(\)"/, 'Add event');
    assert.match(sec3, /id="calendar-toolbar"/);
    assert.match(sliceFn(cal, 'renderCalendarToolbar', 'calendar.js'), /id="calendar-label"[^>]*aria-live="polite"/);
    assert.match(sec3, /id="calendar-upcoming"/);
    assert.doesNotMatch(sec3, /calendar-month-label/, 'the old header is gone');
  });
  test('month and week views, remembered, switched through setCalendarView', () => {
    const f = sliceFn(cal, 'setCalendarView', 'calendar.js');
    assert.match(f, /aria-pressed/);
    assert.match(f, /localStorage/);
    assert.match(cal, /function calendarMonthView\(/);
    assert.match(cal, /function calendarWeekView\(/);
  });
  test('the month cell follows the reference: a day button, up to two events, then "+N more"', () => {
    const m = sliceFn(cal, 'calendarMonthView', 'calendar.js');
    assert.match(m, /class="cal-cell/);
    assert.match(m, /class="cal-top"/);
    assert.match(m, /class="cal-day"/);
    assert.match(m, /data-addday=/, 'the day number adds an event on that day');
    assert.match(m, /cal-more/);
    assert.match(m, /\bout\b/, 'the days either side of the month are shown, not blanked out');
    assert.doesNotMatch(m, /calendar-empty/);
  });
  test('the week view places timed events on an hour grid, with lanes and a now line', () => {
    const w = sliceFn(cal, 'calendarWeekView', 'calendar.js');
    assert.match(w, /cw-head/); assert.match(w, /cw-grid/); assert.match(w, /cw-col/);
    // the block moved into its own renderer (calWeekEvButton, the week twin of calEvButton)
    assert.match(w, /calWeekEvButton\(x, h0\)/, 'each timed block is rendered by calWeekEvButton');
    assert.match(sliceFn(cal, 'calWeekEvButton', 'calendar.js'), /cal-wev/);
    assert.match(w, /cw-now/);
    assert.match(w, /calLanes\(/, 'overlapping events share the column');
    assert.match(w, /allDay/i, 'an activity with no time still has somewhere to go');
  });
  test('calLanes(): two overlapping events split the column, a later one reuses lane 0', () => {
    const { calLanes } = loadFns('public/js/calendar.js', ['calLanes', 'calMins'], { extra: 'const CAL_SLOT_MIN = 30;' });
    const out = calLanes([
      { id: 1, event_time: '09:00' },
      { id: 2, event_time: '09:15' },
      { id: 3, event_time: '13:00' },
    ]);
    const by = id => out.find(x => x.ev.id === id);
    assert.equal(by(1).lane, 0);
    assert.equal(by(2).lane, 1, 'it starts inside the 09:00 block');
    assert.equal(by(1).lanes, 2, 'so both are half width');
    assert.equal(by(3).lane, 0); assert.equal(by(3).lanes, 1, 'the afternoon one has the column to itself');
  });
  test('an Upcoming panel for today and the next 7 days', () => {
    const u = sliceFn(cal, 'calendarUpcoming', 'calendar.js');
    assert.match(u, /class="card cal-up"/);
    assert.match(u, /cal-up-day/); assert.match(u, /cal-up-item/);
    assert.match(u, /class="badge"/, 'the count');
    assert.match(u, /class="empty"/);
    assert.match(sliceFn(cal, 'renderCalendar', 'calendar.js'), /calUpcoming/, 'fetched over its own 8-day window');
  });
  test('Type and Person filter chips, a legend, and a clear', () => {
    const t = sliceFn(cal, 'renderCalendarToolbar', 'calendar.js');
    assert.match(t, /calChip\('type'/); assert.match(t, /calChip\('person'/);
    assert.match(sliceFn(cal, 'calChip', 'calendar.js'), /data-chip="\$\{key\}"/);
    assert.match(t, /cal-legend/);
    assert.match(t, /clearCalendarFilters/);
    const v = sliceFn(cal, 'visibleCalEvents', 'calendar.js');
    assert.match(v, /calFilters\.type/); assert.match(v, /calFilters\.person/);
  });
  test('one event opens its own detail, with links through to the deal and the contact', () => {
    const e = sliceFn(cal, 'openCalendarEventDetail', 'calendar.js');
    assert.match(e, /ui\.modal\(/);
    assert.match(e, /class="kv"/);
    assert.match(e, /openDealDetail\(/); assert.match(e, /openContactDetail\(/);
    assert.match(e, /toggleCalendarDone\(/);
  });
  test('the reference calendar styles are ported', () => {
    for (const s of ['.cal-layout {', '.cal-month {', '.cal-cell {', '.cal-ev {', '.cal-more {',
                     '.cal-week {', '.cw-head {', '.cw-col {', '.cal-wev {', '.cw-now {',
                     '.cal-up {', '.cal-up-item {', '.cal-legend {', '.cal-bar {']) assert.ok(css3.includes(s), s);
  });
});
describe('entries show their own name, not a generic one (Part 32)', () => {
  const cal = read('public/js/calendar.js');
  test("calTitleOf reads the row's title — a task was falling through to the word 'Task'", () => {
    // CAL_TYPES holds dictionary keys now; the sandbox's t() maps them back to the English words
    const { calTitleOf } = loadFns('public/js/calendar.js', ['calTitleOf', 'calTypeOf', 'calTypeLabel'], {
      extra: "const CAL_TYPES = [{ id: 'note', key: 'act_note' }, { id: 'task', key: 'new_task' }]; const t = k => ({ act_note: 'Note', new_task: 'Task' })[k] || k;" });
    assert.equal(calTitleOf({ type: 'task', title: 'Send the quote to Bo' }), 'Send the quote to Bo');
    assert.equal(calTitleOf({ type: 'note', title: 'Rang<br>no answer' }), 'Rang no answer', 'activity notes hold HTML');
    assert.equal(calTitleOf({ type: 'note', title: '  ' }), 'Note', 'only a genuinely empty entry falls back to its kind');
    assert.equal(calTitleOf({ type: 'task', title: '' }), 'Task');
  });
  test('it no longer needs the DOM to strip that HTML, so it is testable and cheap', () => {
    assert.doesNotMatch(sliceFn(cal, 'calTitleOf', 'calendar.js'), /stripHtml/);
  });
  test('the activity detail shows the full note again, from content', () => {
    const d = sliceFn(cal, 'openCalendarEventDetail', 'calendar.js');
    assert.match(d, /e\.content/, 'aliasing content as title had emptied this');
  });
  test('a task with a time lands on the hour grid, one without stays all day', () => {
    const w = sliceFn(cal, 'calendarWeekView', 'calendar.js');
    assert.match(w, /timed: evs\.filter\(e => e\.event_time\)/);
    assert.match(w, /allDay: evs\.filter\(e => !e\.event_time\)/);
  });
});
