// CLIENT (static) tests: a stored time is shown to every member on THEIR clock.
//
// A row carries the wall-clock the entering member typed plus the zone they
// were in (due_tz / event_tz, stamped by the server). The client converts that
// pair to the viewer's own zone before anything renders or compares — so a
// Berlin member's "6 Oct 19:30" is "7 Oct 01:30" for a Manila member, filed
// under Manila's Tuesday, and NOT overdue at 01:00 Manila. All-day entries are
// dates, not instants, and are never converted. A row with no zone (written
// before the column existed) is read as the default zone.
//
// THE CASE THE USER ASKED ABOUT is the first describe's third test: it is
// Berlin 19:00 / Manila 01:00 and the task is 30 minutes away. Run against the
// real functions. Every assertion is machine-TZ independent: explicit instants
// in, parts-built Dates out, and the viewer's zone is always stubbed.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');

const clock = read('public/js/clock.js');
const calendar = read('public/js/calendar.js');
const tasks = read('public/js/tasks.js');
const dv = read('public/js/detail-views.js');

// The real conversion helpers, with the viewer's zone pinned.
const HELPERS = (viewerTz) => `const DEFAULT_TIMEZONE = 'Europe/Berlin';
  function currentTimezone() { return '${viewerTz}'; }
  function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  ${['pad2', 'nowInTimezone', 'tzOffsetMinutes', 'instantOf', 'wallClockInZone', 'toViewerClock'].map(n => sliceFn(clock, n, 'clock.js')).join('\n')}`;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('wallClockInZone / instantOf: one wall-clock, read in another zone', () => {
  const H = () => loadFns('public/js/clock.js', [], { extra: HELPERS('Asia/Manila'), expose: ['wallClockInZone', 'instantOf', 'toViewerClock'] });

  test('Berlin 6 Oct 19:30 is Manila 7 Oct 01:30 — across the date line', () => {
    assert.deepEqual(H().wallClockInZone('2026-10-06', '19:30', 'Europe/Berlin', 'Asia/Manila'), { date: '2026-10-07', time: '01:30' });
  });
  test('…and back: Manila 7 Oct 02:00 is Berlin 6 Oct 20:00', () => {
    assert.deepEqual(H().wallClockInZone('2026-10-07', '02:00', 'Asia/Manila', 'Europe/Berlin'), { date: '2026-10-06', time: '20:00' });
  });
  test('the same instant underneath: instantOf agrees from both sides', () => {
    const a = H().instantOf('2026-10-06', '19:30', 'Europe/Berlin'), b = H().instantOf('2026-10-07', '01:30', 'Asia/Manila');
    assert.equal(a.toISOString(), '2026-10-06T17:30:00.000Z');
    assert.equal(a.getTime(), b.getTime());
  });
  test('westward too: Berlin 6 Oct 02:00 is New York 5 Oct 20:00', () => {
    assert.deepEqual(H().wallClockInZone('2026-10-06', '02:00', 'Europe/Berlin', 'America/New_York'), { date: '2026-10-05', time: '20:00' });
  });
  test('DST ends (Berlin 25 Oct 2026, the ambiguous 02:30) resolves and round-trips', () => {
    const inst = H().instantOf('2026-10-25', '02:30', 'Europe/Berlin');
    assert.deepEqual(H().wallClockInZone('2026-10-25', '02:30', 'Europe/Berlin', 'Europe/Berlin'), { date: '2026-10-25', time: '02:30' });
    assert.ok(inst instanceof Date && !isNaN(inst));
  });
  test('DST starts (Berlin 29 Mar 2026, the nonexistent 02:30) lands on a real instant, not NaN', () => {
    const inst = H().instantOf('2026-03-29', '02:30', 'Europe/Berlin');
    assert.ok(!isNaN(inst));
    const back = H().wallClockInZone('2026-03-29', '02:30', 'Europe/Berlin', 'Europe/Berlin');
    assert.equal(back.date, '2026-03-29');
    assert.match(back.time, /^0[23]:30$/, 'the skipped half-hour is pushed forward, never lost');
  });
  test('an all-day entry is a date, not an instant: no time in, no conversion', () => {
    assert.deepEqual(H().wallClockInZone('2026-10-07', null, 'Europe/Berlin', 'Asia/Manila'), { date: '2026-10-07', time: null });
    assert.deepEqual(H().wallClockInZone('2026-10-07', '', 'Europe/Berlin', 'Pacific/Kiritimati'), { date: '2026-10-07', time: null });
  });
  test('toViewerClock: a row with NO zone is read as the default zone, then shown on the viewer\'s clock', () => {
    // legacy row: 19:30 with no due_tz → means 19:30 Europe/Berlin → 01:30 next day in Manila
    assert.deepEqual(H().toViewerClock('2026-10-06', '19:30', null), { date: '2026-10-07', time: '01:30' });
    assert.deepEqual(H().toViewerClock('2026-10-06', '19:30', undefined), { date: '2026-10-07', time: '01:30' });
  });
  test('toViewerClock is the identity when the row was entered in the viewer\'s own zone', () => {
    assert.deepEqual(H().toViewerClock('2026-10-07', '01:30', 'Asia/Manila'), { date: '2026-10-07', time: '01:30' });
  });
  test('an unknown zone name degrades to no conversion rather than throwing', () => {
    assert.deepEqual(H().wallClockInZone('2026-10-06', '19:30', 'Not/AZone', 'Asia/Manila').date.length, 10);
  });
});

describe('calNormalize: every calendar row arrives on the viewer\'s clock', () => {
  const N = () => loadFns('public/js/calendar.js', ['calNormalize'], { extra: HELPERS('Asia/Manila') });
  const rows = () => N().calNormalize([
    { kind: 'task', id: 1, title: 'Call Anna', event_date: '2026-10-06', event_time: '19:30', event_tz: 'Europe/Berlin', completed: false },
    { kind: 'activity', id: 2, title: 'All-day thing', event_date: '2026-10-06', event_time: null, event_tz: 'Europe/Berlin', completed: false },
    { kind: 'activity', id: 3, title: 'Legacy, no zone', event_date: '2026-10-06', event_time: '23:30', event_tz: null, completed: true },
  ]);

  test('a timed row moves to the viewer\'s date and time', () => {
    const [t] = rows();
    assert.equal(t.event_date, '2026-10-07'); assert.equal(t.event_time, '01:30');
  });
  test('…and remembers what was stored, and in which zone', () => {
    const [t] = rows();
    assert.equal(t.stored_date, '2026-10-06'); assert.equal(t.stored_time, '19:30'); assert.equal(t.event_tz, 'Europe/Berlin');
  });
  test('an all-day row is untouched', () => {
    const [, a] = rows();
    assert.equal(a.event_date, '2026-10-06'); assert.equal(a.event_time, null);
  });
  test('a legacy row with no zone is read as Berlin: 23:30 Berlin is 05:30 next day in Manila', () => {
    const [, , l] = rows();
    assert.equal(l.event_date, '2026-10-07'); assert.equal(l.event_time, '05:30');
  });
  test('uid, kind and completed are unchanged by the conversion', () => {
    const [t, , l] = rows();
    assert.equal(t.uid, 'task-1'); assert.equal(t.kind, 'task'); assert.equal(l.completed, true);
  });
  test('the fetch windows are padded: a conversion can shift a date by up to two days', () => {
    const src = sliceFn(calendar, 'renderCalendar', 'calendar.js');
    assert.match(src, /calAddDays\(from, -2\)/); assert.match(src, /calAddDays\(to, 2\)/);
    assert.match(src, /calAddDays\(upFrom, -2\)/); assert.match(src, /calAddDays\(upTo, 2\)/);
  });
});

describe('tasks: due date, label and overdue on the viewer\'s clock', () => {
  const T = () => loadFns('public/js/tasks.js', ['taskDueShown', 'taskDueAt', 'taskIsOverdue', 'taskDueLabel'], {
    extra: HELPERS('Asia/Manila') + '\nfunction fmtDate(d) { return d instanceof Date ? "D:" + isoOf(d) : "S:" + String(d).slice(0, 10); }' });
  const berlinTask = { due_date: '2026-10-06', due_time: '19:30', due_tz: 'Europe/Berlin' };

  test('THE CASE: Berlin 19:00 / Manila 01:00, task at 19:30 Berlin — Manila sees 7 Oct 01:30 and it is NOT overdue', () => {
    const manilaNow = new Date(2026, 9, 7, 1, 0);          // 01:00 on the 7th, Manila wall-clock
    const at = T().taskDueAt(berlinTask);
    assert.equal(iso(at), '2026-10-07'); assert.equal(hm(at), '01:30');
    assert.equal(T().taskIsOverdue(berlinTask, false, manilaNow), false, 'thirty minutes away — not late');
    assert.equal(T().taskIsOverdue(berlinTask, false, new Date(2026, 9, 7, 1, 31)), true, 'and late one minute after');
  });
  test('taskDueShown is what the drawer and labels read', () => {
    assert.deepEqual(T().taskDueShown(berlinTask), { date: '2026-10-07', time: '01:30' });
  });
  test('the label shows the converted date and time, built from local parts (no UTC-midnight trap)', () => {
    const l = T().taskDueLabel(berlinTask);
    assert.match(l, /^D:2026-10-07/, 'formatted from a parts-built Date, not from new Date("YYYY-MM-DD")');
    assert.match(l, /01:30$/);
  });
  test('an all-day task keeps its date and is due at the end of THAT day', () => {
    const at = T().taskDueAt({ due_date: '2026-10-06', due_tz: 'Europe/Berlin' });
    assert.equal(iso(at), '2026-10-06'); assert.equal(at.getHours(), 23);
  });
  test('a task entered in the viewer\'s own zone is unchanged', () => {
    assert.deepEqual(T().taskDueShown({ due_date: '2026-10-07', due_time: '09:00', due_tz: 'Asia/Manila' }), { date: '2026-10-07', time: '09:00' });
  });
});

describe('detail-views: dvDue and the task drawer', () => {
  test('dvDue converts first, then phrases relative to the viewer\'s today — "Due today at 01:30" for the Berlin task seen from Manila', () => {
    // `now` is a parameter (like taskIsOverdue) so the viewer's clock can be pinned
    // without disturbing the conversion helpers underneath.
    // t / tf stubbed to the key (plus `:values`): the phrasing itself lives in the dictionary now
    const F = loadFns('public/js/detail-views.js', ['dvDue'], { extra: HELPERS('Asia/Manila') + "\nconst t = k => k; const tf = (k, v) => k + ':' + Object.values(v).join('/');" });
    const manilaNow = new Date(2026, 9, 7, 1, 0);
    assert.equal(F.dvDue('2026-10-06', '19:30', 'Europe/Berlin', manilaNow), 'dv_due_today_at:01:30');
    assert.equal(F.dvDue('2026-10-07', '12:00', 'Asia/Manila', manilaNow), 'dv_due_today_at:12:00');
    assert.equal(F.dvDue('2026-10-08', null, 'Asia/Manila', manilaNow), 'dv_due_tomorrow');
    assert.equal(F.dvDue('2026-10-06', null, 'Asia/Manila', manilaNow), 'dv_overdue_one');
    assert.equal(F.dvDue(null, null, null, manilaNow), 'tk_due_none');
  });
  test('dvDue builds its day from parts, never from new Date("YYYY-MM-DD")', () => {
    assert.doesNotMatch(sliceFn(dv, 'dvDue', 'detail-views.js'), /new Date\(x\)|new Date\(d\)/);
  });
  test('every dvDue call site passes the row\'s zone', () => {
    assert.doesNotMatch(dv, /dvDue\(x\.due_date, x\.due_time\)/, 'a call without the zone would show the stored clock');
    assert.ok((dv.match(/dvDue\(x\.due_date, x\.due_time, x\.due_tz\)/g) || []).length >= 4);
  });
  test('the drawer converts the loaded task to the viewer\'s clock once, and stamps the viewer\'s zone', () => {
    const src = sliceFn(dv, 'openTaskDrawer', 'detail-views.js');
    assert.match(src, /taskDueShown\(x\)/, 'loaded values are converted before the inputs are filled');
    assert.match(src, /x\.due_tz = currentTimezone\(\)/, 'what the drawer now holds is in the viewer\'s zone');
  });
  test('saving back to the list row carries the zone too — or the list would convert the values a second time', () => {
    const src = sliceFn(dv, 'openTaskDrawer', 'detail-views.js');
    assert.match(src, /due_time: x\.due_time, due_tz: x\.due_tz/);
  });
});
