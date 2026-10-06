// CLIENT (static) tests for the Tasks page icon/chrome polish, following the
// reference's icon language (reference/pro/src/screens/tasks.js) within the
// app's existing sidebar/list/board/modal architecture — mirrors the Part 3
// and Part 4 precedent (icon swaps and seg/aria-pressed, not a rebuild).
// The file-attachment UI (task-drop-zone, task-attachments-list, …) has no
// markup anywhere in index.html — it is dead code, like Contacts' kanban in
// Part 4, and is not exercised by any test here beyond "still parses".
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

describe('markup: sidebar and header use the sprite; the view toggle is a seg', () => {
  test('files parse', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/tasks.js')]));
  test('new project / add task buttons use the sprite plus icon', () => {
    assert.match(section, /onclick="openProjectModal\(\)" title="New project"><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg><\/button>/);
    assert.match(section, /onclick="openTaskModal\(\)"><svg class="ic" aria-hidden="true"><use href="#i-plus"\/><\/svg><span>Add Task<\/span>/);
  });
  test('the List/Board toggle is a .seg with aria-pressed, like the Deals page', () => {
    assert.match(section, /<div class="seg" role="group" aria-label="View">\s*<button class="view-toggle-btn" aria-pressed="true" id="task-view-list"/);
    assert.match(section, /aria-pressed="false" id="task-view-kanban"/);
    assert.doesNotMatch(section, /class="view-toggle-btn active"/);
  });
  test('every sprite reference inside the Tasks section resolves', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of section.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(defined.has(m[1]), m[1]);
    assert.ok(count(section, '<use href="#i-') >= 4);
  });
  test('the task drawer and task form are built at runtime (Part 16), not as static markup', () => {
    assert.equal(count(html, 'id="task-modal"'), 0);
  });
});

describe('tasks.js: sidebar, list and board renderers use sprite icons, not emoji', () => {
  test('renderProjectNav: chevron, pencil, x, list icons', () => {
    const r = sliceFn(tasks, 'renderProjectNav', 'tasks.js');
    assert.match(r, /icon\('chevron-right', 'ic-sm'\)/);
    assert.match(r, /icon\('pencil', 'ic-sm'\)/);
    assert.match(r, /icon\('x', 'ic-sm'\)/);
    assert.match(r, /icon\('list', 'ic-sm'\)/);
    assert.match(r, /icon\('plus', 'ic-sm'\)\}Add list/);
    assert.doesNotMatch(r, /▶|✏️|✕|📋/);
  });
  test('taskListRow: expand chevron, check, subtask count, overdue alert, delete', () => {
    const r = sliceFn(tasks, 'taskListRow', 'tasks.js');
    assert.match(r, /icon\('chevron-right', 'ic-sm'\)/);
    assert.match(r, /icon\('check', 'ic-sm'\)/);
    assert.match(r, /icon\('check-square', 'ic-sm'\)/);
    assert.match(r, /icon\('alert', 'ic-sm'\)/);
    assert.match(r, /icon\('x', 'ic-sm'\)/);
    assert.doesNotMatch(r, /▶|✓|⊞|⚠|✕/);
  });
  test('taskKanbanCard: subtask toggle and overdue alert', () => {
    const r = sliceFn(tasks, 'taskKanbanCard', 'tasks.js');
    assert.match(r, /icon\('chevron-right', 'ic-sm'\)/);
    assert.match(r, /icon\('check-square', 'ic-sm'\)/);
    assert.match(r, /icon\('alert', 'ic-sm'\)/);
    assert.doesNotMatch(r, /▶|⊞|⚠/);
  });
  test('setTaskView toggles aria-pressed, not a class', () => {
    const s = sliceFn(tasks, 'setTaskView', 'tasks.js');
    assert.match(s, /setAttribute\('aria-pressed'/);
    assert.doesNotMatch(s, /classList\.toggle\('active'/);
  });
  test('the dead attachment/subtask-modal UI (fileIcon, renderSubtasksList, renderAttachmentList, …) is gone (Part 16: see tests/client/detail-views.test.js)', () => {
    for (const fn of ['fileIcon', 'renderSubtasksList', 'renderAttachmentList', 'loadTaskAttachments', 'uploadAttachments', 'viewAttachment', 'deleteAttachment'])
      assert.equal(tasks.split(`function ${fn}(`).length - 1, 0, fn);
  });
});

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
      assert.match(src, /taskDueLabel\(t\)/, fn);
      assert.match(src, /taskIsOverdue\(t, isDone\)/, fn);
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
