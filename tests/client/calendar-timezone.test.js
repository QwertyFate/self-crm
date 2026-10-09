// CLIENT (static) tests: the calendar's "today", the Upcoming card's day
// grouping, the week-view block's visible time, and task overdue all run on
// the clock of the timezone the USER PICKED (users.timezone, Settings) — not
// the browser's and not the database's.
//
// WHAT WAS WRONG, in three parts (one report):
//   1. "no time in the preview" — the week-view block showed its time only
//      when hgt >= 40, but every entry is a nominal 30-minute block (there is
//      no duration column) = 22px at CAL_HH=48. The guard was NEVER true, so
//      the time lived only in the tooltip. The month chip always showed it.
//   2. "categorise Upcoming by day" — it already did (Today / Tomorrow /
//      weekday), but anchored on calToday() = new Date(): the BROWSER's clock.
//      With Berlin picked and the browser at UTC+8, 23:00 Berlin is already
//      tomorrow here, so tonight's entries fell off the card and the wrong
//      cell lit up as today. A task with no time also read "Task, due",
//      which looks like a missing time rather than an all-day task.
//   3. "based on the timezone they picked" — stored values are naive
//      wall-clock DATE/TIME, so SAVING needed no change. Everything derived
//      from "now" did: calToday(), the week now-line, the Upcoming window,
//      the default date for "Add event", and taskIsOverdue()'s default clock.
//
// The fix is one helper, nowInTimezone(tz, at) in clock.js: the current
// wall-clock moment in `tz` as a Date whose LOCAL getters return those parts.
// calToday() delegates to it, so every existing consumer is correct unchanged.
//
// All assertions here are machine-TZ independent: nowInTimezone is given an
// explicit instant and read back through local getters on a parts-built Date;
// calToday is STUBBED wherever a renderer is executed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const calendar = read('public/js/calendar.js');
const tasks    = read('public/js/tasks.js');

const CAL_TYPES_STUB = `const CAL_TYPES = [
  { id: 'note', key: 'act_note' }, { id: 'call', key: 'act_call' }, { id: 'task', key: 'new_task' }];`;
// t()/tf() live in core.js; the sandbox maps the keys these renderers use back to English so the assertions stay readable.
const T_STUB = `const t = k => ({ act_note: 'Note', act_call: 'Call', new_task: 'Task', today: 'Today', tk_due_tomorrow: 'Tomorrow', cal_all_day: 'All day', cal_upcoming: 'Upcoming' })[k] || k;
  const tf = (k, v) => t(k).replace(/\\{(\\w+)\\}/g, (m, x) => (x in v ? String(v[x]) : m));
  const currentLang = 'en';`;
const ESC_STUB = `function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }`;

describe('nowInTimezone(tz, at): the picked clock, as a Date with those local parts', () => {
  const load = () => loadFns('public/js/clock.js', ['nowInTimezone'],
    { extra: "function currentTimezone() { return 'Europe/Berlin'; }" });
  // 22:30 UTC on 6 Oct 2026: still the 6th in New York, already the 7th in Berlin and Manila.
  const AT = new Date('2026-10-06T22:30:00Z');
  const parts = d => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];

  test('Europe/Berlin (CEST, +2) → 7 Oct 00:30', () => {
    assert.deepEqual(parts(load().nowInTimezone('Europe/Berlin', AT)), [2026, 10, 7, 0, 30]);
  });
  test('Asia/Manila (+8) → 7 Oct 06:30', () => {
    assert.deepEqual(parts(load().nowInTimezone('Asia/Manila', AT)), [2026, 10, 7, 6, 30]);
  });
  test('America/New_York (EDT, −4) → still 6 Oct, 18:30', () => {
    assert.deepEqual(parts(load().nowInTimezone('America/New_York', AT)), [2026, 10, 6, 18, 30]);
  });
  test('UTC → 6 Oct 22:30', () => {
    assert.deepEqual(parts(load().nowInTimezone('UTC', AT)), [2026, 10, 6, 22, 30]);
  });
  test('the DATE itself differs by zone at the same instant — the whole reason "today" must be the picked zone', () => {
    const f = load().nowInTimezone;
    assert.notEqual(f('Europe/Berlin', AT).getDate(), f('America/New_York', AT).getDate());
  });
  test('an unknown zone name falls back to the instant as given, rather than throwing', () => {
    const f = load().nowInTimezone;
    assert.equal(f('Not/AZone', AT).getTime(), AT.getTime());
  });
  test('with no tz argument it uses currentTimezone() — the user preference', () => {
    const src = sliceFn(read('public/js/clock.js'), 'nowInTimezone', 'clock.js');
    assert.match(src, /tz = currentTimezone\(\)/);
  });
});

describe("calToday() is the user's clock, and the calendar anchors on it", () => {
  test('calToday delegates to nowInTimezone and no longer reads the browser clock', () => {
    const src = sliceFn(calendar, 'calToday', 'calendar.js');
    assert.match(src, /nowInTimezone\(/);
    assert.doesNotMatch(src, /new Date\(\)/, 'the browser clock is the bug');
  });
  test('the view anchor is resolved from calToday() on first render, not from new Date() at script load', () => {
    assert.doesNotMatch(calendar, /let calViewDate\s*=\s*new Date\(\)/,
      'a load-time new Date() is the browser date, wrong at a month boundary in the picked zone');
    assert.match(sliceFn(calendar, 'renderCalendar', 'calendar.js'), /calViewDate = calToday\(\)/);
  });
  test('the Upcoming window and the week now-line both come from calToday()', () => {
    assert.match(sliceFn(calendar, 'renderCalendar', 'calendar.js'), /upFrom = calToday\(\)/);
    assert.match(sliceFn(calendar, 'calendarWeekView', 'calendar.js'), /now = calToday\(\)/);
  });
  test('calendarUpcoming never consults new Date() directly', () => {
    assert.doesNotMatch(sliceFn(calendar, 'calendarUpcoming', 'calendar.js'), /new Date\(\)/);
  });
});

describe('the Upcoming card: grouped by day on the picked clock, every entry with its time', () => {
  // It is 23:30 on 6 Oct in the user's zone. Whatever the machine running this
  // test thinks the date is, "Today" must be the 6th.
  const env = () => loadFns('public/js/calendar.js',
    ['calendarUpcoming', 'calOnDay', 'visibleCalEvents', 'calIso', 'calPad', 'calAddDays',
     'calMins', 'calFmtDay', 'calDateFromIso', 'calLocale', 'calTitleOf', 'calTypeOf', 'calTypeLabel'],
    {
      state: {
        calEvents: [],
        calFilters: { type: null, person: null },
        calUpcoming: [
          { uid: 'task-1',     kind: 'task',     type: 'task', title: 'Send the quote', event_date: '2026-10-06', event_time: '09:00', completed: false },
          { uid: 'task-2',     kind: 'task',     type: 'task', title: 'Chase invoice',  event_date: '2026-10-06', event_time: null,    completed: false },
          { uid: 'activity-3', kind: 'activity', type: 'call', title: 'Ring Anna',      event_date: '2026-10-07', event_time: '14:00', completed: false, contact_name: 'Anna' },
          { uid: 'activity-4', kind: 'activity', type: 'note', title: 'Yesterday thing', event_date: '2026-10-05', event_time: null,   completed: false },
        ],
      },
      extra: `${CAL_TYPES_STUB}\n${T_STUB}\n${ESC_STUB}
        function avatar() { return ''; } function icon() { return ''; }
        function calToday() { return new Date(2026, 9, 6, 23, 30); }`,
    });

  test('entries are grouped under Today and Tomorrow, anchored on calToday()', () => {
    const html = env().calendarUpcoming();
    assert.match(html, /cal-up-day">Today</);
    assert.match(html, /cal-up-day">Tomorrow</);
    assert.ok(html.indexOf('Today') < html.indexOf('Send the quote') && html.indexOf('Send the quote') < html.indexOf('Tomorrow'),
      'the 6th sits under Today, before the Tomorrow head');
  });
  test('a timed task shows its time AND that it is a task', () => {
    assert.match(env().calendarUpcoming(), /09:00 · Task/);
  });
  test('an all-day task says "All day · Task", not the old "Task, due" which read like a missing time', () => {
    const html = env().calendarUpcoming();
    assert.match(html, /All day · Task/);
    assert.doesNotMatch(html, /Task, due/);
  });
  test('an activity shows its time and contact', () => {
    assert.match(env().calendarUpcoming(), /14:00, Anna/);
  });
  test('yesterday (in the picked zone) is not in the next-7-days card, and the count is right', () => {
    const html = env().calendarUpcoming();
    assert.doesNotMatch(html, /Yesterday thing/);
    assert.match(html, /class="badge">3</);
  });
});

describe('the week-view block shows its time as visible text (the hgt >= 40 guard was dead)', () => {
  const env = () => loadFns('public/js/calendar.js', ['calWeekEvButton', 'calTitleOf', 'calTypeOf', 'calTypeLabel'],
    { extra: `const CAL_HH = 48;\n${CAL_TYPES_STUB}\n${T_STUB}\n${ESC_STUB}` });
  const block = () => env().calWeekEvButton(
    { s: 9 * 60, en: 9 * 60 + 30, lane: 0, lanes: 1,
      ev: { uid: 'activity-1', type: 'call', title: 'Ring Anna', event_time: '09:00', contact_name: 'Anna', completed: false } },
    8);

  test('a 30-minute block is 22px — the case the old guard could never show', () => {
    assert.match(block(), /height:22px/);
    assert.match(block(), /class="cal-ev cal-wev[^"]* tight"/);
  });
  test('…and its time is in the button BODY, not only in title/aria', () => {
    const body = block().replace(/^<button[^>]*>/, '');
    assert.match(body, /<b>09:00<\/b>/);
    assert.match(body, /Ring Anna/);
  });
  test('calendarWeekView renders each timed block through calWeekEvButton', () => {
    assert.match(sliceFn(calendar, 'calendarWeekView', 'calendar.js'), /calWeekEvButton\(x, h0\)/);
  });
});

describe('the month chip and task overdue follow the same clock', () => {
  test('the month chip no longer says "due today" for a task on any day', () => {
    assert.doesNotMatch(sliceFn(calendar, 'calEvButton', 'calendar.js'), /due today/);
  });
  test("taskIsOverdue's default clock is the picked timezone, so a task under Today on the calendar is not 'overdue' on the Tasks page", () => {
    const src = sliceFn(tasks, 'taskIsOverdue', 'tasks.js');
    assert.match(src, /now = nowInTimezone\(currentTimezone\(\)\)/);
    assert.doesNotMatch(src, /now = new Date\(\)/);
  });
});
