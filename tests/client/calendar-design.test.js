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

describe('markup: header uses sprite icons', () => {
  test('file parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/calendar.js')]));
  test('the header is the reference page-header, and the nav icons come from the sprite', () => {
    assert.match(section, /<h1 class="page-title" data-i18n="nav_calendar">Calendar<\/h1>/);
    const t = sliceFn(calendar, 'renderCalendarToolbar', 'calendar.js');
    assert.match(t, /icon\('chevron-left'\)/);
    assert.match(t, /icon\('chevron-right'\)/);
    assert.match(t, /aria-label="\$\{esc\(t\(calView === 'month' \? 'cal_prev_month' : 'cal_prev_week'\)\)\}"/, 'the nav label is a dictionary key per view (German adjectives inflect, so no "Previous {view}" template)');
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
  test('each row opens that one entry, with a sprite icon', () => {
    const d = sliceFn(calendar, 'openDayModal', 'calendar.js');
    assert.match(d, /icon\('external'\)\}\$\{esc\(t\('tk_open'\)\)\}/);
    assert.match(d, /openCalendarEntry\(/);
  });
});

describe('scheduling an activity: date and time in the form (Part 30)', () => {
  const html2 = read('public/index.html');
  const modals = read('public/js/modals.js');
  test('the Log Activity form has a date and an optional time', () => {
    const m = html2.slice(html2.indexOf('id="activity-modal"'), html2.indexOf('id="field-modal"'));
    assert.match(m, /<input type="date" id="act-date"/);
    assert.match(m, /<input type="time" id="act-time"/);
    assert.match(m, /Leave the time empty for an all-day entry/, 'the form says what an empty time means');
  });
  test('both are sent, and an empty one is sent as null rather than an empty string', () => {
    const s = sliceFn(modals, 'saveActivity', 'modals.js');
    assert.match(s, /event_date:\s*document\.getElementById\('act-date'\)\.value \|\| null/);
    assert.match(s, /event_time:\s*document\.getElementById\('act-time'\)\.value \|\| null/);
  });
  test('openActivityModal can be opened on a given day, which is how the calendar adds one', () => {
    const o = sliceFn(modals, 'openActivityModal', 'modals.js');
    assert.match(o, /function openActivityModal\(\{ date = '', time = '' \} = \{\}\)/);
    assert.match(o, /act-date'\)\.value\s*=\s*date/);
    assert.match(o, /act-time'\)\.value\s*=\s*time/);
  });
});

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

describe('tasks on the calendar (Part 31)', () => {
  const cal = read('public/js/calendar.js');
  const css4 = read('public/style.css');
  test('a task is one of the calendar types, with its own colour', () => {
    assert.match(cal, /id: 'task'/);
    assert.match(css4, /\.cal-ev\.task\s+\{/, '.cal-ev.task');
    assert.match(css4, /\.cal-bar\.task,/, '.cal-bar.task');
  });
  test('rows are keyed by kind and id, so an activity 5 and a task 5 are different entries', () => {
    const n = sliceFn(cal, 'calNormalize', 'calendar.js');
    assert.match(n, /uid: `\$\{e\.kind \|\| 'activity'\}-\$\{e\.id\}`/);
    const f = sliceFn(cal, 'calFindEvent', 'calendar.js');
    assert.match(f, /uid === uid|e\.uid/);
    assert.doesNotMatch(f, /e\.id === id/, 'an id alone is ambiguous now');
  });
  test('opening a task opens the task drawer, not the activity detail', () => {
    const o = sliceFn(cal, 'openCalendarEntry', 'calendar.js');
    assert.match(o, /kind === 'task'/);
    assert.match(o, /openTaskDrawer\(/);
    assert.match(o, /openCalendarEventDetail\(/);
  });
  test('marking a task done goes to the tasks route, an activity to the activities route', () => {
    const t = sliceFn(cal, 'toggleCalendarDone', 'calendar.js');
    assert.match(t, /\/api\/tasks\/\$\{[^}]+\}\/status/);
    assert.match(t, /status: done \? 'done' :/);
    assert.match(t, /\/api\/activities\/\$\{[^}]+\}/);
    assert.match(t, /completed: done/);
  });
  test('the task drawer tells the calendar to refresh when something changed there', () => {
    const o = sliceFn(cal, 'openCalendarEntry', 'calendar.js');
    assert.match(o, /onChange/);
    assert.match(o, /renderCalendar\(\)/);
  });
  test('a task shows its due date as all-day, and says it is a task', () => {
    const b = sliceFn(cal, 'calEvButton', 'calendar.js');
    assert.match(b, /e\.uid/, 'the click carries the composite key');
    const u = sliceFn(cal, 'calendarUpcoming', 'calendar.js');
    assert.match(u, /e\.uid/);
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

describe('a task can be given a time (Part 32)', () => {
  const dv = read('public/js/detail-views.js');
  test('the task create form has a time beside the due date, and sends it', () => {
    const f = sliceFn(dv, 'openTaskForm', 'detail-views.js');
    assert.match(f, /type="time"[^>]*name="due_time"/);
    // sent only when the "Set a due date" box is on (an empty date input looks filled in Safari —
    // tests/client/task-form-due.test.js); the time still goes out as null when blank
    assert.match(f, /due_time: d\.due_on \? \(d\.due_time \|\| null\) : null/);
  });
  test('the task drawer can set and clear it', () => {
    const d = sliceFn(dv, 'openTaskDrawer', 'detail-views.js');
    assert.match(d, /type="time"[^>]*data-f="due_time"/);
    assert.match(d, /due_time: x\.due_time \|\| null/);
  });
  test('and the quick-add on a deal offers it too', () => {
    assert.match(dv, /name="due_time"[^>]*id="dd-task-time"|id="dd-task-time"[^>]*name="due_time"/);
    // the quick-add's own submit, gated on its tick box (a whole-file match would also hit the drawer)
    assert.match(sliceFn(dv, 'submitTask', 'detail-views.js'), /due_time: x\.due_on \? \(x\.due_time \|\| null\) : null/);
  });
});
