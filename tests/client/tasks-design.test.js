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
const { read, sliceFn } = require('../helpers/client-fn');
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
