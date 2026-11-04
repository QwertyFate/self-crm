// CLIENT (static + sandboxed) tests for the Tasks page. Part 5 (2026-10-01) was
// an icon/chrome pass on the app's own sidebar/list/board; Part 40 (2026-10-08)
// replaced that page with the reference screen (tests/client/tasks-port.test.js).
// What stays here: the sprite language of the renderers, the dead-code guard from
// Part 16, and the due-time helpers from Part 33.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const tasks = read('public/js/tasks.js');
const section = html.slice(html.indexOf('<section id="page-tasks"'), html.indexOf('</section>', html.indexOf('<section id="page-tasks"')));
const count = (src, needle) => src.split(needle).length - 1;

describe("a task's due time on the task list (Part 33)", () => {
  const t = read('public/js/tasks.js');
  const dv = read('public/js/detail-views.js');
  // The real zone helpers from clock.js, with the viewer pinned to the default zone: the
  // fixture tasks carry no due_tz, so they convert as the identity and the assertions below
  // are unchanged. fmtDate now receives a parts-built Date for a due date (the UTC-midnight
  // fix), so the stub formats one.
  const clockSrc = read('public/js/clock.js');
  const sandbox = () => loadFns('public/js/tasks.js', ['taskDueShown', 'taskDueAt', 'taskIsOverdue', 'taskDueLabel'], {
    extra: "const DEFAULT_TIMEZONE = 'Europe/Berlin'; function currentTimezone() { return 'Europe/Berlin'; }\n"
      + ['pad2', 'nowInTimezone', 'tzOffsetMinutes', 'instantOf', 'wallClockInZone', 'toViewerClock'].map(n => sliceFn(clockSrc, n, 'clock.js')).join('\n')
      + '\nfunction fmtDate(d) { const x = d instanceof Date ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : String(d).slice(0, 10); return "FMT:" + x; }' });

  test('taskDueAt: a timed task is due at that local time, a whole-day one at the end of its day', () => {
    const { taskDueAt } = sandbox();
    const timed = taskDueAt({ due_date: '2026-10-07', due_time: '09:30' });
    assert.equal(timed.getFullYear(), 2026); assert.equal(timed.getMonth(), 9); assert.equal(timed.getDate(), 7);
    assert.equal(timed.getHours(), 9); assert.equal(timed.getMinutes(), 30);
    const allDay = taskDueAt({ due_date: '2026-10-07' });
    assert.equal(allDay.getHours(), 23); assert.equal(allDay.getMinutes(), 59);
    assert.equal(taskDueAt({}), null);
  });
  test('taskIsOverdue: a task due today is NOT late yet — the old check called it late from 08:00', () => {
    const { taskIsOverdue } = sandbox();
    const now = new Date(2026, 9, 7, 10, 0);
    assert.equal(taskIsOverdue({ due_date: '2026-10-07' }, false, now), false, 'a whole-day task has until midnight');
    assert.equal(taskIsOverdue({ due_date: '2026-10-07', due_time: '09:30' }, false, now), true, 'a timed one is late once its time passes');
    assert.equal(taskIsOverdue({ due_date: '2026-10-07', due_time: '14:00' }, false, now), false, 'and not before');
    assert.equal(taskIsOverdue({ due_date: '2026-10-06' }, false, now), true, 'yesterday is late');
    assert.equal(taskIsOverdue({ due_date: '2026-10-06' }, true, now), false, 'unless it is done');
    assert.equal(taskIsOverdue({}, false, now), false);
  });
  test('taskDueLabel: the time shows beside the date when there is one', () => {
    const { taskDueLabel } = sandbox();
    assert.equal(taskDueLabel({ due_date: '2026-10-07', due_time: '09:30' }), 'FMT:2026-10-07 · 09:30');
    assert.equal(taskDueLabel({ due_date: '2026-10-07' }), 'FMT:2026-10-07');
    assert.equal(taskDueLabel({}), '');
  });
  test('the list row and the board card both use them, instead of comparing against UTC midnight', () => {
    for (const fn of ['taskListRow', 'taskKanbanCard']) {
      const src = sliceFn(t, fn, 'tasks.js');
      assert.match(fn === 'taskListRow' ? sliceFn(t, 'taskDueHtml', 'tasks.js') : src, /taskDueLabel\(x\)/, fn);
      assert.match(fn === 'taskListRow' ? sliceFn(t, 'taskDueHtml', 'tasks.js') : src, /taskIsOverdue\(x, fin\)/, fn);
      assert.doesNotMatch(src, /new Date\(t\.due_date\) < new Date\(\)/, `${fn} still has the old comparison`);
    }
  });
  test('the deal and contact task rows stop calling a task due today late, too', () => {
    assert.doesNotMatch(dv, /new Date\(x\.due_date\) < new Date\(\)/, 'same bug, three more call sites');
    assert.match(dv, /taskIsOverdue\(x,/);
  });
  test("dvDue names the time as well, so the drawer and the deal rows agree with the list", () => {
    const d = sliceFn(dv, 'dvDue', 'detail-views.js');
    assert.match(d, /due_time|t\.time/, 'it takes the whole task now, not just a date string');
  });
});
