// CLIENT (static + sandboxed) tests for the Tasks screen port from
// reference/pro/crm-pro.html (screen: tasks.js): the sidebar Views (All tasks /
// My tasks) and project / list scopes with open counts, the summary KPIs, the
// Assignee / Priority / Status / Due chips, the status-grouped table with
// inline add, selection + bulk bar, sort, the row kebab, the footer, and the
// board. Statuses are per project in this app; All / My tasks group BY PROJECT
// (user decision), each project keeping its own status columns on the board.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const html = read('public/index.html');
const src = read('public/js/tasks.js');
const dv = read('public/js/detail-views.js');
const core = read('public/js/core.js');
const css = read('public/style.css');
const auth = read('public/js/auth.js');
const section = html.slice(html.indexOf('<section id="page-tasks"'), html.indexOf('<!-- ── Board (Miro) ── -->'));

// "now" is pinned to 2026-10-08 10:00 local inside the sandbox (a Date shim), so the seed's due
// dates are stable whatever the wall clock says when the suite runs.
const clockSrc = read('public/js/clock.js');
const STUBS = `
  let __pageActive = true;
  const __els = {}; const __el = id => (__els[id] = __els[id] || { id, innerHTML: '', textContent: '', value: '', focus() { __focused.push(id); }, contains() { return false; }, setAttribute() {}, removeAttribute() {}, scrollIntoView() {}, classList: { contains: () => __pageActive, add() {}, remove() {}, toggle() {} }, style: {}, scrollTop: 0, scrollLeft: 0 });
  const __focused = [];
  const document = { getElementById: id => __el(id), activeElement: null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, createElement: () => ({ style: {}, click() {}, remove() {} }) };
  const __store = {}; const localStorage = { getItem: k => (k in __store ? __store[k] : null), setItem: (k, v) => { __store[k] = String(v); }, removeItem: k => { delete __store[k]; } };
  const t = k => k; const tf = (k, v) => k + ':' + Object.values(v).join('/');
  function esc(s) { return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const icon = (n, c) => '<i ' + n + (c ? ' ' + c : '') + '>'; const avatar = (w, s) => '<av ' + (typeof w === 'string' ? w : w.name) + '>';
  const __NOW = new globalThis.Date(2026, 9, 8, 10, 0, 0).getTime();
  class Date extends globalThis.Date { constructor(...a) { if (a.length) super(...a); else super(__NOW); } static now() { return __NOW; } }
  const DEFAULT_TIMEZONE = 'Europe/Berlin'; function currentTimezone() { return 'Europe/Berlin'; }
  function fmtDate(d) { const x = d instanceof Date ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : String(d).slice(0, 10); return 'FMT:' + x; }
  ${['pad2', 'nowInTimezone', 'tzOffsetMinutes', 'instantOf', 'wallClockInZone', 'toViewerClock'].map(n => sliceFn(clockSrc, n, 'clock.js')).join('\n')}
  let __data = { tasks: [], projects: [] };
  let __fail = null; function __failNext(k) { __fail = k; }
  const __calls = []; const api = { get: async u => { __calls.push(['get', u]); return u === '/api/task-projects' ? __data.projects : u === '/api/tasks' ? __data.tasks : []; }, post: async (u, b) => { __calls.push(['post', u, b]); return { id: 777 }; }, put: async (u, b) => { __calls.push(['put', u, b]); if (__fail === 'put') { __fail = null; return { error: 'boom' }; } return { success: true }; }, patch: async (u, b) => { __calls.push(['patch', u, b]); if (__fail === 'patch') { __fail = null; return { error: 'boom' }; } return { success: true }; }, del: async u => { __calls.push(['del', u]); return { success: true }; } };
  const __toasts = []; let __confirm = true; const __menus = [];
  const ui = { toast: (m, o) => __toasts.push({ m, o }), confirm: async () => __confirm, menu: (a, items, o) => __menus.push(items), select: (a, opts, cur, cb) => __menus.push({ opts, cur, cb }), closePopover() {} };
  const __opened = []; const openTaskDrawer = (id, o) => __opened.push(['drawer', id, o]); const openTaskForm = o => __opened.push(['form', o]); const openDealDetail = id => __opened.push(['deal', id]); const openContactDetail = id => __opened.push(['contact', id]);
  function closeModal() {} async function ensureMembers() {}
  function __html(id) { return __el(id).innerHTML; } function __state() { return { calls: __calls, toasts: __toasts, menus: __menus, opened: __opened, focused: __focused, els: __els, store: __store }; }
  function __setConfirm(v) { __confirm = v; } function __setData(d) { __data = d; } function __setPageActive(v) { __pageActive = v; } function __ui() { return tasksUI; } function __tasks() { return tasks; }
`;
const FNS = ['loadTasks', 'resetTasksUI', 'reloadTasksData', 'taskStatusesFor', 'taskStatusesOf', 'taskDoneKey', 'taskIsDone', 'taskViewerDue', 'tasksPlural',
  'setTaskScope', 'saveTaskScope', 'restoreTaskScope', 'taskInScope', 'scopedTasks', 'taskScopeInfo', 'taskScopeDefaults',
  'visibleTasks', 'tasksFilterActive', 'taskSortVal', 'sortTasks', 'taskDueOffset', 'taskPrioMeta', 'buildSubtaskMap',
  'renderTasks', 'renderTasksCurrent', 'renderTasksBody', 'taskStatusOptions', 'taskStatusesWithExtras', 'taskIsoFromToday', 'renderTasksSidebar', 'renderTasksMain', 'renderTasksSummary', 'renderTasksToolbar', 'tasksChip', 'openTasksChip', 'onTasksSearch', 'clearTasksFilters', 'toggleTasksSummary', 'tasksKpiClick', 'sortTasksBy', 'openTasksSortMenu',
  'taskGroups', 'renderTasksList', 'taskListRow', 'taskSubRow', 'taskSubLine', 'taskDueHtml', 'taskPrioBadge', 'toggleTaskGroup', 'toggleSubtasksRow', 'onTaskRowClick', 'toggleTaskSelected', 'toggleAllTasks', 'bulkTasks', 'quickAddDefaults', 'quickAddTask', 'onQuickAddKey',
  'renderTasksKanban', 'taskBoardHtml', 'taskKanbanCard', 'toggleKanbanSubtasks', 'taskDragStart', 'taskDragEnd', 'taskDragOver', 'taskDragLeave', 'taskDrop', 'onTaskCardKey',
  'patchTasks', 'taskPutPayload', 'toggleTaskDone', 'moveTaskTo', 'deleteTasks', 'deleteTask', 'openTaskKebab', 'openTasksNew',
  'toggleProjectExpand', 'openProjectKebab', 'openListKebab', 'deleteProject', 'deleteList', 'setTaskView',
  'taskDueShown', 'taskDueAt', 'taskIsOverdue', 'taskDueLabel'];
const P = () => [
  { id: 1, name: 'Acquisition', color: '#3b82f6', lists: [{ id: 10, name: 'Follow-ups' }, { id: 11, name: 'Due diligence' }], statuses: [] },
  { id: 2, name: 'Ops', color: '#f59e0b', lists: [{ id: 20, name: 'Partners' }], statuses: [{ key: 'backlog', label: 'Backlog', color: '#999' }, { key: 'doing', label: 'Doing', color: '#39f' }, { key: 'finished', label: 'Finished', color: '#2c2' }] },
];
const T = () => [
  { id: 1, title: 'Call the bank', project_id: 1, list_id: 10, status: 'todo', priority: 'high', assigned_to: 1, assigned_to_name: 'Max', due_date: '2026-10-07', due_time: null, deal_id: 5, deal_title: 'Haus Köln', contact_id: null, subtask_count: 1, subtask_done: 0, description: 'about financing', custom_data: {} },
  { id: 2, title: 'Archive files', project_id: 1, list_id: 10, status: 'done', priority: 'low', assigned_to: 2, assigned_to_name: 'Lena', due_date: null, due_time: null, subtask_count: 0, subtask_done: 0, custom_data: {} },
  { id: 3, title: 'Prepare <exposé>', project_id: 1, list_id: 11, status: 'in_progress', priority: 'urgent', assigned_to: 1, assigned_to_name: 'Max', due_date: '2026-10-08', due_time: null, contact_id: 7, contact_name: 'Anna Berg', subtask_count: 0, subtask_done: 0, custom_data: {} },
  { id: 4, title: 'Update partner list', project_id: 2, list_id: 20, status: 'doing', priority: 'medium', assigned_to: 2, assigned_to_name: 'Lena', due_date: '2026-10-11', due_time: null, subtask_count: 0, subtask_done: 0, custom_data: {} },
  { id: 5, title: 'Loose end', project_id: null, list_id: null, status: 'todo', priority: 'medium', assigned_to: 1, assigned_to_name: 'Max', due_date: '2026-10-18', due_time: null, subtask_count: 0, subtask_done: 0, custom_data: {} },
  { id: 6, title: 'Ask for conditions', parent_id: 1, project_id: 1, list_id: 10, status: 'todo', priority: 'medium', assigned_to: 1, assigned_to_name: 'Max', due_date: null, due_time: null, subtask_count: 0, subtask_done: 0, custom_data: {} },
];
function sandbox(scope = { kind: 'all' }) {
  const F = loadFns('public/js/tasks.js', FNS, {
    state: { tasks: [], taskProjects: [], currentProjectId: null, currentListId: null, currentProject: null, taskViewMode: 'list', dragTaskId: null, collapsedTasks: null, taskScope: null, tasksUI: null, members: [{ id: 1, name: 'Max' }, { id: 2, name: 'Lena' }, { id: 3, name: 'Nobody' }], currentUser: { id: 1, name: 'Max' }, currentWorkspace: null },
    extra: STUBS + sliceConst('public/js/tasks.js', 'DEFAULT_TASK_STATUSES') + sliceConst('public/js/tasks.js', 'TASK_PRIO') + sliceConst('public/js/tasks.js', 'TASK_DUE_FILTERS') + sliceConst('public/js/tasks.js', 'TASK_SORT_KEYS'),
    expose: ['__html', '__state', '__setConfirm', '__setData', '__setPageActive', '__ui', '__tasks', '__failNext'],
  });
  F.resetTasksUI();
  F.__set('tasks', T()); F.__set('taskProjects', P());
  F.setTaskScope(scope.kind, scope.project, scope.list);
  return F;
}
const ids = a => a.map(t => t.id);

describe('markup: the page is rendered by the script into two hosts', () => {
  test('tasks.js parses', () => execFileSync('node', ['--check', path.join(ROOT, 'public/js/tasks.js')]));
  test('sidebar host + main host, nothing of the old static chrome', () => {
    assert.match(section, /<aside class="tk-side" id="tasks-side" aria-label="Task projects" data-i18n-aria="html_task_projects"><\/aside>/);
    assert.match(section, /<div class="tk-main" id="tasks-main"><\/div>/);
    for (const old of ['tasks-project-nav', 'task-filter-priority', 'task-filter-assignee', 'tasks-empty-state', 'tasks-list-view', 'tasks-kanban-view', 'tasks-breadcrumb', 'view-toggle-btn', 'task-search']) assert.ok(!section.includes(old), old + ' should be gone');
  });
  test('the project and list modals stay (they are the reference forms already)', () => {
    assert.match(html, /id="project-modal"/); assert.match(html, /id="list-modal"/);
    assert.match(html, /id="project-name-input"/); assert.match(html, /id="list-name-input"/);
  });
  test('every sprite the renderers use exists', () => {
    const defined = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
    for (const m of src.matchAll(/icon\('([\w-]+)'/g)) { const alias = { deals: 'kanban', contacts: 'users' }[m[1]] || m[1]; assert.ok(defined.has('i-' + alias), m[1]); }
  });
});

describe('style.css: the reference .tk-* rules, the old flat Tasks rules gone', () => {
  test('sidebar, table, add row, kpi, board and card rules exist; the drawer rules from Part 16 are not duplicated', () => {
    for (const sel of ['.tk-side', '.tk-sec', '.tk-row', '.tk-link', '.tk-link[aria-current="true"]', '.tk-chev', '.tk-lists', '.tk-addlist', '.tk-kpi', '.tk-table', '.tk-group td', '.tk-ghead', '.tk-tcell', '.tk-title', '.tk-fin .tk-title', '.tk-sub', '.tk-due', '.tk-add td', '.tk-addwrap', '.tk-addinput', '.tk-addhint', '.tk-board', '.tk-card', '.tk-colempty', '.tk-boards', '.tk-board-head', '.tk-subrow td', '.tk-expand', '.tk-main'])
      assert.ok(css.includes(sel + ' {') || css.includes(sel + ','), sel);
    assert.equal(css.split('.tk-done {').length - 1, 1, '.tk-done is declared once (Part 16)');
    assert.equal(css.split('.tk-mini {').length - 1, 1);
  });
  test('.page-tasks-layout keeps the page as a row; the main pane scrolls its own table/board', () => {
    assert.match(css, /\.page-tasks-layout \{[^}]*flex-direction: row/);
    assert.match(css, /\.tk-main \{[^}]*flex-direction: column/);
    assert.match(css, /\.tk-main \{[^}]*min-width: 0/);
  });
  test('old rules removed, not left dead', () => {
    for (const sel of ['.tasks-sidebar {', '.tasks-project-nav {', '.tasks-proj-item {', '.tasks-list-item {', '.tasks-main {', '.tasks-empty-state {', '.tasks-list-view {', '.task-row {', '.task-check {', '.task-col {', '.tasks-kanban {', '.task-card {', '.priority-badge {', '.view-toggle-btn {', '.task-assignee-chip {', '.subtask-rows {'])
      assert.ok(!css.includes(sel), sel + ' should be gone');
  });
});

describe('statuses are per project', () => {
  test('a project with no saved statuses uses the defaults; done is the last status of the task\'s own project', () => {
    const F = sandbox();
    assert.deepEqual(F.taskStatusesFor(1).map(s => s.key), ['todo', 'in_progress', 'in_review', 'done']);
    assert.deepEqual(F.taskStatusesFor(2).map(s => s.key), ['backlog', 'doing', 'finished']);
    assert.deepEqual(F.taskStatusesFor(null).map(s => s.key), ['todo', 'in_progress', 'in_review', 'done'], 'no project → defaults');
    const [t1, , , t4] = T();
    assert.equal(F.taskDoneKey(t1), 'done'); assert.equal(F.taskDoneKey(t4), 'finished');
    assert.equal(F.taskIsDone({ ...t4, status: 'finished' }), true); assert.equal(F.taskIsDone(t4), false);
  });
});

describe('scope: All / My tasks / project / list', () => {
  test('taskInScope and scopedTasks (parents only)', () => {
    const F = sandbox();
    assert.deepEqual(ids(F.scopedTasks()), [1, 2, 3, 4, 5]);
    F.setTaskScope('mine'); assert.deepEqual(ids(F.scopedTasks()), [1, 3, 5]);
    F.setTaskScope('project', 1); assert.deepEqual(ids(F.scopedTasks()), [1, 2, 3]);
    F.setTaskScope('list', 1, 11); assert.deepEqual(ids(F.scopedTasks()), [3]);
  });
  test('setTaskScope keeps the legacy currentProject/currentList globals in step (the task form reads them) and persists the scope', () => {
    const F = sandbox();
    F.setTaskScope('list', 1, 11);
    assert.equal(JSON.parse(F.__state().store.taskScope).list, 11);
    assert.match(sliceFn(src, 'setTaskScope', 'tasks.js'), /currentProjectId = /); assert.match(sliceFn(src, 'setTaskScope', 'tasks.js'), /currentListId = /);
    assert.match(sliceFn(src, 'setTaskScope', 'tasks.js'), /sel\.clear\(\)/, 'a scope change clears the selection (reference)');
  });
  test('restoreTaskScope: saved scope wins, a stale project falls back to All, the legacy lastTaskListId migrates to a list scope', () => {
    const F = sandbox();
    F.__state().store.taskScope = JSON.stringify({ kind: 'project', project: 99 }); F.restoreTaskScope();
    assert.equal(F.taskScopeInfo().title, 'tk_all');
    delete F.__state().store.taskScope; F.__state().store.lastTaskListId = '20'; F.restoreTaskScope();
    assert.equal(F.taskScopeInfo().title, 'Partners');
  });
  test('scope info: title, parent and the open / overdue sub line', () => {
    const F = sandbox();
    assert.deepEqual(F.taskScopeInfo(), { title: 'tk_all', parent: null, sub: 'tk_open_n:4, tk_overdue_n:1' });
    F.setTaskScope('mine'); assert.equal(F.taskScopeInfo().title, 'tk_mine');
    F.setTaskScope('project', 2); assert.deepEqual(F.taskScopeInfo(), { title: 'Ops', parent: null, sub: 'tk_one_open' });
    F.setTaskScope('list', 1, 10); assert.deepEqual(F.taskScopeInfo(), { title: 'Follow-ups', parent: 'Acquisition', sub: 'tk_one_open, tk_overdue_n:1' });
  });
  test('defaults for a new task come from the scope, else the first project and its first list', () => {
    const F = sandbox();
    assert.deepEqual(F.taskScopeDefaults(), { project_id: 1, list_id: 10 });
    F.setTaskScope('list', 2, 20); assert.deepEqual(F.taskScopeDefaults(), { project_id: 2, list_id: 20 });
    F.setTaskScope('project', 2); assert.deepEqual(F.taskScopeDefaults(), { project_id: 2, list_id: 20 });
    assert.deepEqual(F.taskScopeDefaults(1), { project_id: 1, list_id: 10 }, 'an explicit project wins');
  });
});

describe('sidebar', () => {
  test('Views with open counts and aria-current, projects with dot / name / count / kebab, lists, add list, new project', () => {
    const F = sandbox({ kind: 'list', project: 1, list: 10 });
    F.renderTasksSidebar();
    const h = F.__html('tasks-side');
    assert.match(h, /<div class="tk-sec"><span>tk_views<\/span><\/div>/);
    assert.match(h, /<button class="tk-link" type="button" data-scope="all" aria-current="false" onclick="setTaskScope\('all'\)"><i check-square><span class="nm">tk_all<\/span><span class="ct" title="tk_open_n:4">4<\/span><\/button>/);
    assert.match(h, /data-scope="mine" aria-current="false" onclick="setTaskScope\('mine'\)"><i target><span class="nm">tk_mine<\/span><span class="ct" title="tk_open_n:3">3<\/span>/);
    assert.match(h, /<div class="tk-sec"><span>tk_projects<\/span><button class="iconbtn tk-mini" type="button" onclick="openProjectModal\(\)" aria-label="tk_new_project" title="tk_new_project"><i plus><\/button><\/div>/);
    assert.match(h, /<button class="tk-chev" type="button" data-ptoggle="1" aria-expanded="true"[^>]*onclick="toggleProjectExpand\(1\)"><i chevron-right><\/button>/);
    assert.match(h, /<button class="tk-link" type="button" data-scope="project" data-p="1" aria-current="false" onclick="setTaskScope\('project',1\)"><span class="dot" style="background:#3b82f6"><\/span><span class="nm">Acquisition<\/span><span class="ct" title="tk_open_n:2">2<\/span><\/button>/);
    assert.match(h, /<button class="iconbtn tk-mini tk-act" type="button" onclick="openProjectKebab\(this,1\)"[^>]*aria-haspopup="menu"><i ellipsis><\/button>/);
    assert.match(h, /<button class="tk-link" type="button" data-scope="list" data-p="1" data-l="10" aria-current="true" onclick="setTaskScope\('list',1,10\)"><i list ic-sm><span class="nm">Follow-ups<\/span><span class="ct" title="tk_one_open">1<\/span><\/button><button class="iconbtn tk-mini tk-act" type="button" onclick="openListKebab\(this,1,10\)"/);
    assert.match(h, /<button class="tk-addlist" type="button" onclick="openListModal\(1\)"><i plus ic-sm>tk_add_list<\/button>/);
  });
  test('a collapsed project hides its lists; the state is remembered per project', () => {
    const F = sandbox();
    F.toggleProjectExpand(2);
    F.renderTasksSidebar();
    const h = F.__html('tasks-side');
    assert.match(h, /data-ptoggle="2" aria-expanded="false"/);
    assert.doesNotMatch(h, /data-l="20"/);
    assert.equal(F.__state().store['proj-collapsed-2'], '1');
  });
  test('project and list kebabs: rename / add list / delete, and rename / delete', () => {
    const F = sandbox();
    F.openProjectKebab({}, 1);
    assert.deepEqual(F.__state().menus.pop().map(i => i.label || (i.sep && 'sep')), ['tk_rename_project', 'tk_add_list', 'sep', 'tk_delete_project']);
    F.openListKebab({}, 1, 10);
    assert.deepEqual(F.__state().menus.pop().map(i => i.label || (i.sep && 'sep')), ['tk_rename_list', 'sep', 'tk_delete_list']);
  });
  test('deleting a project or list asks with ui.confirm (no blocking prompt), then falls back to All tasks when the current scope is gone', async () => {
    const F = sandbox({ kind: 'list', project: 2, list: 20 });
    F.__setConfirm(false); await F.deleteList(20); assert.equal(F.__state().calls.filter(c => c[0] === 'del').length, 0);
    F.__setConfirm(true); await F.deleteList(20);
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'del').pop(), ['del', '/api/task-projects/lists/20']);
    assert.equal(F.taskScopeInfo().title, 'tk_all');
    assert.doesNotMatch(src, /[^.\w]confirm\(/, 'no window.confirm left in tasks.js');
  });
});

describe('filters, sort, due buckets', () => {
  test('search, assignee, priority, status (active / done / key), due (overdue / today / week / none)', () => {
    const F = sandbox();
    const set = patch => { F.clearTasksFilters(); Object.assign(F.__ui(), patch); };
    set({ q: 'bank' }); assert.deepEqual(ids(F.visibleTasks()), [1]);
    set({ q: 'financing' }); assert.deepEqual(ids(F.visibleTasks()), [1], 'description');
    set({ q: 'köln' }); assert.deepEqual(ids(F.visibleTasks()), [1], 'deal title');
    set({ q: 'anna' }); assert.deepEqual(ids(F.visibleTasks()), [3], 'contact name');
    set({ assignee: 2 }); assert.deepEqual(ids(F.visibleTasks()), [2, 4]);
    set({ priority: 'medium' }); assert.deepEqual(ids(F.visibleTasks()), [4, 5]);
    set({ status: 'active' }); assert.deepEqual(ids(F.visibleTasks()), [1, 3, 4, 5]);
    set({ status: 'done' }); assert.deepEqual(ids(F.visibleTasks()), [2]);
    set({ status: 'doing' }); assert.deepEqual(ids(F.visibleTasks()), [4]);
    set({ due: 'overdue' }); assert.deepEqual(ids(F.visibleTasks()), [1]);
    set({ due: 'today' }); assert.deepEqual(ids(F.visibleTasks()), [3]);
    set({ due: 'week' }); assert.deepEqual(ids(F.visibleTasks()), [3, 4]);
    set({ due: 'none' }); assert.deepEqual(ids(F.visibleTasks()), [2]);
    assert.equal(F.tasksFilterActive(), true); F.clearTasksFilters(); assert.equal(F.tasksFilterActive(), false);
  });
  test('taskDueOffset counts local calendar days from the pinned now', () => {
    const F = sandbox();
    assert.equal(F.taskDueOffset(T()[0]), -1); assert.equal(F.taskDueOffset(T()[2]), 0); assert.equal(F.taskDueOffset(T()[3]), 3); assert.equal(F.taskDueOffset(T()[1]), null);
  });
  test('sort: due ascending with no-date last, priority by rank, title, owner; the header toggles direction', () => {
    const F = sandbox();
    assert.deepEqual(ids(F.sortTasks(T().slice(0, 5))), [1, 3, 4, 5, 2]);
    F.sortTasksBy('priority'); assert.deepEqual(ids(F.sortTasks(T().slice(0, 5))), [3, 1, 4, 5, 2]);
    F.sortTasksBy('priority'); assert.deepEqual(ids(F.sortTasks(T().slice(0, 5))), [2, 4, 5, 1, 3]);
    F.sortTasksBy('title'); assert.deepEqual(ids(F.sortTasks(T().slice(0, 5))), [2, 1, 5, 3, 4]);
    F.sortTasksBy('owner'); assert.deepEqual(ids(F.sortTasks(T().slice(0, 5))), [4, 2, 1, 3, 5], 'same owner → earlier due first');
  });
  test('the chips: assignee lists members, priority the four levels, status Not done + the scope\'s statuses, due the four buckets', () => {
    const F = sandbox({ kind: 'project', project: 2 });
    F.openTasksChip({}, 'status');
    assert.deepEqual(F.__state().menus.pop().opts.map(o => o.value), [null, 'active', 'backlog', 'doing', 'finished']);
    F.setTaskScope('all'); F.openTasksChip({}, 'status');
    assert.deepEqual(F.__state().menus.pop().opts.map(o => o.value), [null, 'active', 'done', 'todo', 'in_progress', 'in_review', 'backlog', 'doing', 'finished'], 'All: Not done, Done, then the union of every project\'s statuses');
    F.openTasksChip({}, 'due'); assert.deepEqual(F.__state().menus.pop().opts.map(o => o.value), [null, 'overdue', 'today', 'week', 'none']);
    F.openTasksChip({}, 'priority'); assert.deepEqual(F.__state().menus.pop().opts.map(o => o.value), [null, 'urgent', 'high', 'medium', 'low']);
    F.openTasksChip({}, 'assignee'); const m = F.__state().menus.pop(); assert.deepEqual(m.opts.map(o => o.value), [null, 1, 2, 3]);
    m.cb(2); assert.equal(F.tasksFilterActive(), true);
    F.renderTasksToolbar(); const h = F.__html('tasks-toolbar');
    assert.match(h, /class="chip on" type="button" id="tasks-chip-assignee" onclick="openTasksChip\(this,'assignee'\)" aria-haspopup="menu">chip_assignee: Lena<i chevron-down ic-sm>/);
    assert.match(h, /onclick="clearTasksFilters\(\)"/);
    assert.match(h, /id="tasks-q" type="search"/); assert.match(h, /onclick="toggleTasksSummary\(\)" aria-pressed="true"/);
    assert.doesNotMatch(h, /openTasksSortMenu/, 'the sort menu is a board-only control');
    F.setTaskView('kanban'); F.renderTasksToolbar(); assert.match(F.__html('tasks-toolbar'), /onclick="openTasksSortMenu\(this\)" aria-haspopup="menu"><i sort>tk_sort: tk_sort_due/);
  });
});

describe('summary KPIs', () => {
  test('open / overdue / due in 7 days / completed for the scope; clicking sets the matching filter', () => {
    const F = sandbox();
    F.renderTasksSummary();
    const h = F.__html('tasks-summary');
    const k = [...h.matchAll(/<button class="kpi tk-kpi" type="button" data-kpi="(\w+)" onclick="tasksKpiClick\('\w+'\)"><div class="kpi-label">([^<]*)<\/div><div class="kpi-value ?(bad)?">(\d+)<\/div><div class="kpi-foot">([^<]*)<\/div><\/button>/g)].map(m => [m[1], m[2], m[3] || '', m[4], m[5]]);
    assert.deepEqual(k, [['active', 'tk_kpi_open', '', '4', 'tk_kpi_inprog:1'], ['overdue', 'tk_kpi_overdue', 'bad', '1', 'tk_kpi_needs'], ['week', 'tk_kpi_week', '', '2', 'tk_kpi_incl_today'], ['done', 'tk_kpi_done', '', '1', 'tk_kpi_done_foot:20/n_tasks:5']]);
    F.tasksKpiClick('overdue'); assert.equal(F.__ui().due, 'overdue'); assert.equal(F.__ui().status, null);
    F.tasksKpiClick('done'); assert.equal(F.__ui().status, 'done'); assert.equal(F.__ui().due, null);
    F.tasksKpiClick('active'); assert.equal(F.__ui().status, 'active');
    F.tasksKpiClick('week'); assert.equal(F.__ui().due, 'week');
    F.toggleTasksSummary(); F.renderTasksSummary(); assert.equal(F.__html('tasks-summary'), ''); assert.equal(F.__state().store.tasksSummary, '0');
  });
});

describe('the table', () => {
  test('list scope groups by the project\'s statuses (all groups when unfiltered, empty ones hidden when filtering)', () => {
    const F = sandbox({ kind: 'list', project: 1, list: 10 });
    let g = F.taskGroups();
    assert.deepEqual(g.map(x => [x.key, x.label, ids(x.items)]), [['s:todo', 'Todo', [1]], ['s:in_progress', 'In Progress', []], ['s:in_review', 'In Review', []], ['s:done', 'Done', [2]]]);
    F.__ui().q = 'bank'; g = F.taskGroups();
    assert.deepEqual(g.map(x => x.key), ['s:todo']);
  });
  test('a task whose status is not in its project\'s set is never hidden: it gets a trailing group (and board column), labelled from the workspace statuses when they know the key', () => {
    const F = sandbox({ kind: 'project', project: 1 });
    F.__set('tasks', T().concat([{ id: 9, title: 'Stuck one', project_id: 1, list_id: 10, status: 'blocked', priority: 'low', assigned_to: 1, assigned_to_name: 'Max', subtask_count: 0, subtask_done: 0, custom_data: {} }]));
    let g = F.taskGroups();
    assert.deepEqual(g.map(x => [x.key, x.label, ids(x.items)]).slice(4), [['s:blocked', 'blocked', [9]]]);
    F.__set('currentWorkspace', { task_statuses: [{ key: 'blocked', label: 'Blocked', color: '#c00' }] });
    g = F.taskGroups(); assert.deepEqual(g[4].label, 'Blocked'); assert.equal(g[4].color, '#c00');
    F.setTaskView('kanban'); F.renderTasksKanban();
    assert.match(F.__html('tasks-body'), /<section class="col-board" data-status="blocked" data-project="1" aria-label="Blocked"/);
    F.setTaskScope('all'); assert.deepEqual(F.taskGroups()[0].items.map(x => x.id), [1, 3, 2, 9], 'in All the task simply sits in its project group (no due date → by id)');
  });
  test('All / My tasks group by project (plus "No project" last), each project in sidebar order', () => {
    const F = sandbox();
    assert.deepEqual(F.taskGroups().map(x => [x.key, x.label, ids(x.items)]), [['p:1', 'Acquisition', [1, 3, 2]], ['p:2', 'Ops', [4]], ['p:0', 'tk_no_project', [5]]]);
    F.setTaskScope('mine');
    assert.deepEqual(F.taskGroups().map(x => [x.key, ids(x.items)]), [['p:1', [1, 3]], ['p:0', [5]]], 'a project with none of my tasks is not shown');
  });
  test('group head, rows, inline add row, bulk bar, header sort, footer', () => {
    const F = sandbox({ kind: 'list', project: 1, list: 10 });
    F.renderTasksList();
    const h = F.__html('tasks-body');
    assert.match(h, /<tr class="tk-group"><td colspan="7"><button class="tk-ghead" type="button" data-group="s:todo" aria-expanded="true" onclick="toggleTaskGroup\('s:todo'\)"><i chevron-right><i style="background:#94a3b8"><\/i>Todo<span class="cnt">1<\/span><\/button><\/td><\/tr>/);
    assert.match(h, /<tr class="clickable tk-tr" data-open="1" aria-selected="false" onclick="onTaskRowClick\(event,1\)">/);
    assert.match(h, /<td class="col-check"><label class="check"><input type="checkbox" data-row="1" aria-label="tk_select:Call the bank" onchange="toggleTaskSelected\(1,this.checked\)" ><\/label><\/td>/);
    assert.match(h, /<button class="tk-expand" type="button" aria-expanded="false" aria-label="tk_expand" onclick="toggleSubtasksRow\(event,1\)"><i chevron-right ic-sm><\/button><button class="tk-done" type="button" data-toggle="1" aria-pressed="false" aria-label="tk_complete: Call the bank" onclick="toggleTaskDone\(event,1\)"><i check><\/button>/);
    assert.match(h, /<a class="tk-title" href="#" onclick="event\.preventDefault\(\);openTaskDrawer\(1\)">Call the bank<\/a><div class="tk-sub"><a href="#" title="tk_open_deal: Haus Köln" onclick="event\.preventDefault\(\);event\.stopPropagation\(\);openDealDetail\(5\)"><i deals ic-sm><span>Haus Köln<\/span><\/a><\/div>/);
    assert.match(h, /<td><div class="row" style="gap:8px" title="tk_subs_done:0\/1"><div class="progress" style="width:36px"><i style="width:0%"><\/i><\/div><span class="tnum muted">0\/1<\/span><\/div><\/td><td><span class="badge badge-warning">prio_high<\/span><\/td><td><span class="tk-due late" title="FMT:2026-10-07"><i alert ic-sm>FMT:2026-10-07<\/span><\/td><td><av Max><\/td>/);
    assert.match(h, /<td class="kebab-cell"><button class="iconbtn" type="button" data-kebab="1" onclick="event\.stopPropagation\(\);openTaskKebab\(this,1\)" aria-label="tk_actions_for:Call the bank" aria-haspopup="menu"><i ellipsis><\/button><\/td><\/tr>/);
    assert.match(h, /<tr class="clickable tk-tr tk-fin" data-open="2"/); assert.match(h, /<button class="tk-done on" type="button" data-toggle="2" aria-pressed="true" aria-label="tk_reopen: Archive files"/);
    assert.match(h, /<tr class="tk-add"><td><\/td><td colspan="6"><label class="tk-addwrap"><i plus><input class="tk-addinput" data-quickadd="s:todo" placeholder="tk_add_placeholder" aria-label="tk_add_to:Todo" autocomplete="off" onkeydown="onQuickAddKey\(event,this\)"><span class="tk-addhint">tk_press_enter<\/span><\/label><\/td><\/tr>/);
    assert.match(h, /<th aria-sort="ascending"><button type="button" data-sort="due" onclick="sortTasksBy\('due'\)">tk_col_due<i arrow-up ic-sm><\/button><\/th>/);
    assert.match(h, /<th class="col-check"><label class="check"><input type="checkbox" data-all aria-label="tk_select_all" onchange="toggleAllTasks\(this.checked\)" ><\/label><\/th>/);
    assert.match(h, /<div class="table-foot"[^>]*><span>tk_n_of_total:2\/n_tasks:2<\/span><span class="tnum">tk_foot_open:1\/1<\/span><\/div>/);
    assert.doesNotMatch(h, /bulkbar/);
  });
  test('subline: contact link when there is no deal; the list name in project scope; project / list are implied by the group in All', () => {
    const F = sandbox({ kind: 'project', project: 1 });
    assert.equal(F.taskSubLine(T()[2]), '<a href="#" title="tk_open_contact" onclick="event.preventDefault();event.stopPropagation();openContactDetail(7)"><i contacts ic-sm><span>Anna Berg</span></a><i class="sep"></i><span class="tail">Due diligence</span>');
    F.setTaskScope('list', 1, 11); assert.equal(F.taskSubLine(T()[2]), '<a href="#" title="tk_open_contact" onclick="event.preventDefault();event.stopPropagation();openContactDetail(7)"><i contacts ic-sm><span>Anna Berg</span></a>');
    F.setTaskScope('all'); assert.equal(F.taskSubLine(T()[3]), '<span class="tail">Partners</span>');
    assert.equal(F.taskSubLine(T()[4]), '<span>tk_no_deal</span>');
  });
  test('subtask rows appear under an expanded parent, with their own done toggle and title link', () => {
    const F = sandbox({ kind: 'list', project: 1, list: 10 });
    F.toggleSubtasksRow({ stopPropagation() {} }, 1);
    F.renderTasksList();
    const h = F.__html('tasks-body');
    assert.match(h, /<button class="tk-expand open" type="button" aria-expanded="true"/);
    assert.match(h, /<tr class="tk-subrow" data-parent="1"><td><\/td><td><div class="tk-tcell tk-tcell-sub"><button class="tk-done" type="button" data-toggle="6" aria-pressed="false"[^>]*onclick="toggleTaskDone\(event,6\)"><i check><\/button><a class="tk-title" href="#" onclick="event\.preventDefault\(\);openTaskDrawer\(6\)">Ask for conditions<\/a><\/div><\/td>/);
  });
  test('a collapsed group hides its rows and its add row', () => {
    const F = sandbox({ kind: 'list', project: 1, list: 10 });
    F.toggleTaskGroup('s:todo'); F.renderTasksList();
    const h = F.__html('tasks-body');
    assert.match(h, /data-group="s:todo" aria-expanded="false"/);
    assert.doesNotMatch(h, /data-open="1"/); assert.doesNotMatch(h, /data-quickadd="s:todo"/); assert.match(h, /data-quickadd="s:done"/);
  });
  test('nothing matching → the reference empty state inside the table, with Clear filters', () => {
    const F = sandbox();
    F.__ui().q = 'zzz'; F.renderTasksList();
    assert.match(F.__html('tasks-body'), /<tbody><tr><td colspan="7"><div class="empty"><i search><b>tk_no_match<\/b><div>tk_no_match_sub<\/div><div style="margin-top:14px"><button class="btn btn-secondary btn-sm" type="button" onclick="clearTasksFilters\(\)">clear_filters<\/button><\/div><\/div><\/td><\/tr><\/tbody>/);
  });
  test('a row click opens the drawer unless it landed on a control', () => {
    const F = sandbox();
    F.onTaskRowClick({ target: { closest: () => null } }, 3); assert.deepEqual(F.__state().opened.pop().slice(0, 2), ['drawer', 3]);
    F.onTaskRowClick({ target: { closest: () => ({}) } }, 3); assert.equal(F.__state().opened.length, 0);
  });
});

describe('quick add', () => {
  test('Enter posts the title with the group\'s project / list / status, assigned to me, then reloads and refocuses; Escape clears', async () => {
    const F = sandbox({ kind: 'list', project: 1, list: 10 });
    F.__setData({ tasks: T(), projects: P() });
    await F.quickAddTask({ value: '  New one ' }, 's:in_review');
    const post = F.__state().calls.find(c => c[0] === 'post');
    assert.deepEqual(post, ['post', '/api/tasks', { title: 'New one', status: 'in_review', priority: 'medium', assigned_to: 1, project_id: 1, list_id: 10 }]);
    assert.ok(F.__state().calls.some(c => c[0] === 'get' && c[1] === '/api/tasks'), 'reloaded');
    assert.equal(F.__state().toasts.pop().m, 'tk_added_to:In Review');
    assert.match(sliceFn(src, 'quickAddTask', 'tasks.js'), /tasksUI\.refocus = groupKey/, 'the add row of that group gets focus back after the re-render');
    F.setTaskScope('all');
    assert.deepEqual(F.quickAddDefaults('p:2'), { project_id: 2, list_id: 20, status: 'backlog' });
    assert.deepEqual(F.quickAddDefaults('p:0'), { project_id: null, list_id: null, status: 'todo' });
    F.setTaskScope('project', 2); assert.deepEqual(F.quickAddDefaults('s:doing'), { project_id: 2, list_id: 20, status: 'doing' });
    const esc = { key: 'Escape', preventDefault() {} }, inp = { value: 'x', blur() { this.blurred = true; } };
    F.onQuickAddKey(esc, inp); assert.equal(inp.value, ''); assert.equal(inp.blurred, true);
    await F.quickAddTask({ value: '   ' }, 's:todo'); assert.equal(F.__state().calls.filter(c => c[0] === 'post').length, 1, 'blank is ignored');
  });
});

describe('selection and bulk actions', () => {
  test('row and all checkboxes drive the bulk bar; status via PATCH, priority / assign / due via a full PUT, each with Undo', async () => {
    const F = sandbox({ kind: 'project', project: 1 });
    F.toggleTaskSelected(1, true); F.toggleTaskSelected(3, true);
    F.renderTasksList();
    let h = F.__html('tasks-body');
    assert.match(h, /<div class="bulkbar" role="toolbar"[^>]*><b>n_selected:2<\/b><button class="btn btn-sm" type="button" onclick="bulkTasks\('status',this\)" aria-haspopup="menu">tk_bulk_status<\/button><button class="btn btn-sm" type="button" onclick="bulkTasks\('priority',this\)" aria-haspopup="menu">tk_bulk_priority<\/button><button class="btn btn-sm" type="button" onclick="bulkTasks\('owner',this\)" aria-haspopup="menu">tk_bulk_assign<\/button><button class="btn btn-sm" type="button" onclick="bulkTasks\('due',this\)" aria-haspopup="menu">tk_bulk_due<\/button><button class="btn btn-sm" type="button" onclick="bulkTasks\('delete'\)">btn_delete<\/button><button class="btn btn-sm" style="margin-left:auto" type="button" onclick="bulkTasks\('clear'\)">tk_clear_sel<\/button><\/div>/);
    assert.match(h, /data-row="1" aria-label="tk_select:Call the bank" onchange="toggleTaskSelected\(1,this.checked\)" checked>/);
    F.bulkTasks('priority', {}); const pm = F.__state().menus.pop();
    assert.deepEqual(pm.map(i => i.label), ['prio_urgent', 'prio_high', 'prio_medium', 'prio_low']);
    await pm[3].onSelect();
    const puts = F.__state().calls.filter(c => c[0] === 'put');
    assert.equal(puts.length, 2);
    assert.deepEqual(puts[0], ['put', '/api/tasks/1', { title: 'Call the bank', description: 'about financing', status: 'todo', priority: 'low', assigned_to: 1, due_date: '2026-10-07', due_time: null, custom_data: {}, project_id: 1, list_id: 10, deal_id: 5, contact_id: null }]);
    const toast = F.__state().toasts.pop(); assert.equal(toast.m, 'tk_prio_set:n_tasks:2/prio_low'); assert.equal(toast.o.action.label, 'undo');
    await toast.o.action.onClick();
    const after = F.__state().calls.filter(c => c[0] === 'put'); assert.equal(after.length, 4); assert.equal(after[2][2].priority, 'high', 'undo restores the old value with another PUT');
    assert.equal(F.__ui().sel.size, 0, 'a bulk change clears the selection (app convention, as on Deals)');
    F.toggleTaskSelected(1, true); F.toggleTaskSelected(3, true);
    F.bulkTasks('status', {}); const sm = F.__state().menus.pop();
    assert.deepEqual(sm.map(i => i.label), ['Todo', 'In Progress', 'In Review', 'Done']);
    await sm[3].onSelect();
    const patches = F.__state().calls.filter(c => c[0] === 'patch');
    assert.deepEqual(patches.map(c => c[1]), ['/api/tasks/1/status', '/api/tasks/3/status']); assert.deepEqual(patches[0][2], { status: 'done' });
    assert.equal(F.__ui().sel.size, 0, 'the selection clears after a bulk change (reference)');
    F.toggleTaskSelected(1, true); F.bulkTasks('due', {}); const dm = F.__state().menus.pop();
    assert.deepEqual(dm.map(i => i.label), ['today', 'tk_due_tomorrow', 'tk_due_in7', 'tk_due_clear']);
    await dm[1].onSelect(); assert.equal(F.__state().calls.filter(c => c[0] === 'put').pop()[2].due_date, '2026-10-09');
    F.toggleTaskSelected(1, true); F.bulkTasks('owner', {}); const om = F.__state().menus.pop();
    assert.deepEqual(om.map(i => i.label), ['Max', 'Lena', 'Nobody']);
    await om[1].onSelect(); const last = F.__state().calls.filter(c => c[0] === 'put').pop(); assert.equal(last[2].assigned_to, 2);
    F.toggleTaskSelected(1, true); F.bulkTasks('clear'); assert.equal(F.__ui().sel.size, 0);
  });
  test('All scope: Set status offers each selected task\'s own project statuses under a heading, and only patches that project\'s tasks', async () => {
    const F = sandbox();
    F.toggleTaskSelected(1, true); F.toggleTaskSelected(4, true);
    F.bulkTasks('status', {}); const m = F.__state().menus.pop();
    assert.deepEqual(m.map(i => i.heading || i.label), ['Acquisition', 'Todo', 'In Progress', 'In Review', 'Done', 'Ops', 'Backlog', 'Doing', 'Finished']);
    await m[8].onSelect();
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'patch').map(c => c[1]), ['/api/tasks/4/status']);
  });
  test('toggleAllTasks selects every visible task; bulk delete confirms and removes the rows (no undo: the API cannot restore them)', async () => {
    const F = sandbox({ kind: 'project', project: 1 });
    F.toggleAllTasks(true); assert.deepEqual([...F.__ui().sel].sort(), [1, 2, 3]);
    F.__setConfirm(false); await F.bulkTasks('delete'); assert.equal(F.__state().calls.filter(c => c[0] === 'del').length, 0);
    F.__setConfirm(true); await F.bulkTasks('delete');
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'del').map(c => c[1]), ['/api/tasks/1', '/api/tasks/2', '/api/tasks/3']);
    assert.deepEqual(ids(F.scopedTasks()), []); assert.equal(F.__state().toasts.pop().m, 'tk_deleted_n:3');
    assert.doesNotMatch(sliceFn(src, 'deleteTasks', 'tasks.js'), /action:/);
  });
});

describe('row actions', () => {
  test('kebab: open, complete / reopen, move to the task\'s own project statuses, priority, delete', () => {
    const F = sandbox();
    F.openTaskKebab({}, 4); const m = F.__state().menus.pop();
    assert.deepEqual(m.map(i => i.label || i.heading || (i.sep && 'sep')), ['tk_open_task', 'tk_mark_complete', 'tk_move_to', 'Backlog', 'Doing', 'Finished', 'tk_priority', 'prio_urgent', 'prio_high', 'prio_medium', 'prio_low', 'sep', 'tk_delete_task']);
    assert.equal(m[4].checked, true); assert.equal(m[9].checked, true); assert.equal(m[12].danger, true);
    m[0].onSelect(); assert.deepEqual(F.__state().opened.pop().slice(0, 2), ['drawer', 4]);
    F.openTaskKebab({}, 2); assert.equal(F.__state().menus.pop()[1].label, 'tk_reopen_task');
  });
  test('toggleTaskDone uses the task\'s own project: Ops goes to "finished" and back to "backlog"', async () => {
    const F = sandbox();
    await F.toggleTaskDone({ stopPropagation() {} }, 4);
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'patch').pop(), ['patch', '/api/tasks/4/status', { status: 'finished' }]);
    assert.equal(F.__state().toasts.pop().m, 'tk_completed');
    await F.toggleTaskDone({ stopPropagation() {} }, 4);
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'patch').pop(), ['patch', '/api/tasks/4/status', { status: 'backlog' }]);
    assert.equal(F.__state().toasts.pop().m, 'tk_reopened');
  });
  test('moveTaskTo patches and toasts; a no-op move does nothing; a failed API call rolls back', async () => {
    const F = sandbox();
    await F.moveTaskTo(1, 'in_review');
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'patch').pop(), ['patch', '/api/tasks/1/status', { status: 'in_review' }]);
    assert.equal(F.__state().toasts.pop().m, 'tk_moved:In Review');
    const n = F.__state().calls.length; await F.moveTaskTo(1, 'in_review'); assert.equal(F.__state().calls.length, n);
    assert.match(sliceFn(src, 'patchTasks', 'tasks.js'), /bad\.error/);
  });
  test('deleteTask (single, from the drawer era) confirms and goes through deleteTasks', async () => {
    const F = sandbox();
    await F.deleteTask({ stopPropagation() {} }, 5);
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'del').pop(), ['del', '/api/tasks/5']);
    assert.equal(F.__state().toasts.pop().m, 'tk_deleted');
  });
});

describe('the board', () => {
  test('list / project scope: one board with the project\'s statuses; counts, overdue summary, bar, add button, drop targets carry the project', () => {
    const F = sandbox({ kind: 'project', project: 1 });
    F.setTaskView('kanban'); F.renderTasksKanban();
    const h = F.__html('tasks-body');
    assert.equal((h.match(/<div class="board tk-board" data-project="1">/g) || []).length, 1);
    assert.doesNotMatch(h, /tk-board-head/);
    assert.match(h, /<section class="col-board" data-status="todo" data-project="1" aria-label="Todo" ondragover="taskDragOver\(event\)" ondragleave="taskDragLeave\(event\)" ondrop="taskDrop\(event,'todo',1\)"><div class="col-head"><i class="dot" style="background:#94a3b8"><\/i><span class="nm">Todo<\/span><span class="cnt">1<\/span><button class="iconbtn" type="button" style="margin-left:auto;width:28px;height:28px" onclick="openTasksNew\('todo',1\)" aria-label="tk_add_to:Todo"><i plus><\/button><\/div><div class="col-sum">tk_col_overdue:1<\/div><div class="col-bar"><i style="width:33%;background:#94a3b8"><\/i><\/div>/);
    assert.match(h, /data-status="in_review"[\s\S]*?<div class="col-sum">tk_col_none<\/div>[\s\S]*?<div class="tk-colempty">tk_drop_here<\/div>/);
    assert.match(h, /data-status="done"[\s\S]*?<div class="col-sum">tk_col_nothing_overdue<\/div>/);
  });
  test('All / My tasks: one board per project with a heading, No project last with the default columns', () => {
    const F = sandbox();
    F.setTaskView('kanban'); F.renderTasksKanban();
    const h = F.__html('tasks-body');
    const heads = [...h.matchAll(/<div class="tk-board-head"><i class="dot" style="background:([^"]*)"><\/i><b>([^<]*)<\/b><span class="muted">([^<]*)<\/span><\/div><div class="board tk-board" data-project="(\d+)">/g)].map(m => [m[2], m[3], m[4]]);
    assert.deepEqual(heads, [['Acquisition', 'n_tasks:3', '1'], ['Ops', 'one_task', '2'], ['tk_no_project', 'one_task', '0']]);
    assert.match(h, /data-project="2">[\s\S]*?data-status="backlog" data-project="2"/);
    assert.match(h, /data-project="0">[\s\S]*?data-status="todo" data-project="0"/);
  });
  test('card: urgency bar for urgent / high, kebab, title, deal meta, badge, subtask toggle, due, avatar; subtask cards under an expanded parent', () => {
    const F = sandbox();
    const c = F.taskKanbanCard(T()[0], F.buildSubtaskMap(T()));
    assert.match(c, /^<div class="dcard tk-card" draggable="true" tabindex="0" role="button" data-id="1" ondragstart="taskDragStart\(event,1\)" ondragend="taskDragEnd\(event\)" onclick="openTaskDrawer\(1\)" onkeydown="onTaskCardKey\(event,1\)" aria-label="Call the bank, prio_high">/);
    assert.match(c, /<span class="urg urg-3" title="prio_high"><\/span><button class="iconbtn kebab" type="button" onclick="event\.stopPropagation\(\);openTaskKebab\(this,1\)"[^>]*><i ellipsis><\/button><div class="dcard-title" style="padding-right:22px">Call the bank<\/div><div class="dcard-meta"><i deals><span class="truncate">Haus Köln<\/span><\/div>/);
    assert.match(c, /<div class="dcard-foot"><span class="badge badge-warning">prio_high<\/span><button class="cmeta tk-subtoggle" type="button" aria-expanded="true" title="tk_subs_done:0\/1" onclick="event\.stopPropagation\(\);toggleKanbanSubtasks\(1\)"><i check-square>0\/1<\/button><span class="cmeta late" title="tk_col_due"><i calendar>FMT:2026-10-07<\/span><span style="margin-left:auto"><av Max><\/span><\/div><\/div>/);
    assert.match(c, /<div class="dcard tk-card tk-subcard" tabindex="0" role="button" data-id="6" onclick="openTaskDrawer\(6\)"[^>]*><div class="dcard-title">Ask for conditions<\/div>/);
    assert.match(F.taskKanbanCard(T()[2], {}), /<span class="urg urg-4" title="prio_urgent">/);
    assert.doesNotMatch(F.taskKanbanCard(T()[3], {}), /class="urg/);
    assert.match(F.taskKanbanCard(T()[1], {}), /class="dcard tk-card fin"/);
    F.toggleKanbanSubtasks(1); assert.doesNotMatch(F.taskKanbanCard(T()[0], F.buildSubtaskMap(T())), /tk-subcard/);
  });
  test('drop moves a card to the column\'s status within its own project; a card from another project is ignored', async () => {
    const F = sandbox();
    const ev = () => ({ preventDefault() {}, currentTarget: { classList: { remove() {}, add() {} } } });
    F.taskDragStart({ dataTransfer: {}, target: { classList: { add() {} } } }, 1);
    await F.taskDrop(ev(), 'in_review', 1);
    assert.deepEqual(F.__state().calls.filter(c => c[0] === 'patch').pop(), ['patch', '/api/tasks/1/status', { status: 'in_review' }]);
    F.taskDragStart({ dataTransfer: {}, target: { classList: { add() {} } } }, 1);
    const n = F.__state().calls.length; await F.taskDrop(ev(), 'doing', 2); assert.equal(F.__state().calls.length, n);
  });
  test('the add button in a column opens the task form with that project, its list and the status; Add task in the header uses the scope', () => {
    const F = sandbox({ kind: 'list', project: 2, list: 20 });
    F.openTasksNew('doing', 2); assert.deepEqual(F.__state().opened.pop()[1], { projectId: 2, listId: 20, status: 'doing' });
    F.openTasksNew(); assert.deepEqual(F.__state().opened.pop()[1], { projectId: 2, listId: 20, status: undefined });
    F.setTaskScope('mine'); F.openTasksNew(); assert.deepEqual(F.__state().opened.pop()[1], { projectId: 1, listId: 10, status: undefined });
  });
});

describe('page shell and load', () => {
  test('renderTasksMain: title / sub, List–Board seg, Add task, and the three slots', () => {
    const F = sandbox({ kind: 'list', project: 1, list: 10 });
    F.renderTasksMain();
    const h = F.__html('tasks-main');
    assert.match(h, /<div class="page-header"><div><h1 class="page-title">Follow-ups<\/h1><p class="page-sub">Acquisition, tk_one_open, tk_overdue_n:1<\/p><\/div>/);
    assert.match(h, /<div class="seg" role="group" aria-label="tk_view"><button type="button" id="task-view-list" aria-pressed="true" onclick="setTaskView\('list'\)"><i list ic-sm>tk_list<\/button><button type="button" id="task-view-kanban" aria-pressed="false" onclick="setTaskView\('kanban'\)"><i kanban ic-sm>tk_board<\/button><\/div>/);
    assert.match(h, /<button class="btn btn-primary" type="button" onclick="openTasksNew\(\)"><i plus>tk_add_task<\/button>/);
    assert.match(h, /<div id="tasks-summary"><\/div><div id="tasks-toolbar" class="toolbar"><\/div><div id="tasks-body" class="tk-body"><\/div>/);
  });
  test('loadTasks fetches projects and ALL tasks in parallel, restores the scope and renders; renderTasksCurrent is the whole-page re-render the drawer calls', async () => {
    const F = sandbox();
    F.__setData({ tasks: T(), projects: P() });
    F.__state().store.taskScope = JSON.stringify({ kind: 'mine' });
    await F.loadTasks();
    assert.ok(F.__state().calls.some(c => c[1] === '/api/task-projects') && F.__state().calls.some(c => c[1] === '/api/tasks'));
    assert.doesNotMatch(sliceFn(src, 'loadTasks', 'tasks.js'), /list_id=/);
    assert.equal(F.taskScopeInfo().title, 'tk_mine');
    assert.ok(F.__html('tasks-side').includes('data-scope="mine" aria-current="true"'));
    assert.match(sliceFn(src, 'renderTasksCurrent', 'tasks.js'), /renderTasks\(\)/);
  });
  test('setTaskView re-renders and remembers the mode', () => {
    const F = sandbox();
    F.setTaskView('kanban'); assert.equal(F.__state().store.taskViewMode, 'kanban');
    assert.match(F.__html('tasks-body'), /tk-boards/);
    F.setTaskView('list'); assert.match(F.__html('tasks-body'), /tk-table/);
  });
  test('auth.js resets the Tasks page state on logout, inside resetClientState, and drops the remembered scope', () => {
    const r = sliceFn(auth, 'resetClientState', 'auth.js');
    assert.match(r, /resetTasksUI\(\)/); assert.match(r, /localStorage\.removeItem\('taskScope'\)/);
  });
  test('getActiveTaskStatuses (the one-list page\'s helper) is gone — nothing called it', () => {
    assert.doesNotMatch(src, /function getActiveTaskStatuses/);
  });
});

describe('Part 44: due dates on the viewer\'s clock, failures roll back, Undo survives a reload', () => {
  // The route re-stamps due_tz from the caller's zone on every PUT. The drawer therefore converts
  // the stored wall-clock to the viewer's clock before it saves; the list's bulk / kebab updates
  // must do the same, or a Manila 19:30 becomes a Berlin 19:30 the moment someone changes a priority.
  const manila = { id: 9, title: 'Manila deadline', project_id: 1, list_id: 10, status: 'todo', priority: 'high', assigned_to: 1, assigned_to_name: 'Max', due_date: '2026-10-09', due_time: '19:30', due_tz: 'Asia/Manila', subtask_count: 0, subtask_done: 0, custom_data: {} };
  test('taskPutPayload converts a timed due to the viewer\'s clock; an all-day due is untouched', () => {
    const F = sandbox();
    assert.deepEqual([F.taskPutPayload(manila).due_date, F.taskPutPayload(manila).due_time], ['2026-10-09', '13:30']);
    const allDay = { ...manila, due_time: null };
    assert.deepEqual([F.taskPutPayload(allDay).due_date, F.taskPutPayload(allDay).due_time], ['2026-10-09', null]);
    assert.deepEqual(F.taskViewerDue(manila), { due_date: '2026-10-09', due_time: '13:30', due_tz: 'Europe/Berlin' });
  });
  test('a priority change sends the converted time and leaves the row on the viewer\'s clock (what the server now holds)', async () => {
    const F = sandbox({ kind: 'project', project: 1 });
    F.__set('tasks', T().concat([manila]));
    assert.equal(await F.patchTasks([9], { priority: 'low' }, 'lbl'), true);
    const put = F.__state().calls.filter(c => c[0] === 'put').pop();
    assert.equal(put[2].due_time, '13:30'); assert.equal(put[2].due_date, '2026-10-09'); assert.equal(put[2].priority, 'low');
    const row = F.__tasks().find(x => x.id === 9);
    assert.deepEqual([row.due_date, row.due_time, row.due_tz, row.priority], ['2026-10-09', '13:30', 'Europe/Berlin', 'low']);
  });
  test('bulk "Set due date" keeps the viewer-clock time of day on the new date', async () => {
    const F = sandbox({ kind: 'project', project: 1 });
    F.__set('tasks', T().concat([manila]));
    F.toggleTaskSelected(9, true); F.bulkTasks('due', {}); const dm = F.__state().menus.pop();
    await dm[2].onSelect();   // In 7 days from the pinned 2026-10-08
    const put = F.__state().calls.filter(c => c[0] === 'put').pop();
    assert.deepEqual([put[2].due_date, put[2].due_time], ['2026-10-15', '13:30']);
    assert.equal(F.__tasks().find(x => x.id === 9).due_tz, 'Europe/Berlin');
  });
  test('a failed PUT rolls the row back, toasts the error and offers no Undo', async () => {
    const F = sandbox({ kind: 'project', project: 1 });
    F.__failNext('put');
    assert.equal(await F.patchTasks([1], { priority: 'low' }, 'lbl'), false);
    assert.equal(F.__tasks().find(x => x.id === 1).priority, 'high');
    const toast = F.__state().toasts.pop(); assert.equal(toast.m, 'boom'); assert.equal(toast.o, undefined);
  });
  test('Undo finds the rows again after a reload replaced the array, and reports a failed undo', async () => {
    const F = sandbox({ kind: 'project', project: 1 });
    await F.patchTasks([1], { priority: 'low' }, 'lbl');
    const toast = F.__state().toasts.pop(); assert.equal(toast.o.action.label, 'undo');
    const fresh = T(); fresh[0].priority = 'low';   // what the server holds now
    F.__setData({ tasks: fresh, projects: P() }); await F.reloadTasksData();
    await toast.o.action.onClick();
    assert.equal(F.__tasks().find(x => x.id === 1).priority, 'high', 'the LIVE row is restored, not an orphan');
    assert.equal(F.__state().calls.filter(c => c[0] === 'put').pop()[2].priority, 'high');
    await F.patchTasks([1], { priority: 'low' }, 'lbl'); const t2 = F.__state().toasts.pop();
    F.__failNext('put'); await t2.o.action.onClick();
    assert.equal(F.__state().toasts.pop().m, 'boom');
  });
});

describe('detail-views.js hooks', () => {
  test('the drawer syncs a moved task\'s project / list (and links) into the page row, and replaces the row\'s subtasks after a subtask change', () => {
    // The page groups by project / list and shows subtask rows from the shared `tasks` global, so a
    // drawer edit must land there too — not only title / status / priority / assignee / due.
    assert.match(dv, /const syncRow = \(\) => \{[^\n]*project_id: x\.project_id, list_id: x\.list_id, deal_id: x\.deal_id \|\| null, deal_title: x\.deal_title \|\| null, contact_id: x\.contact_id \|\| null, contact_name: x\.contact_name \|\| null/);
    assert.match(dv, /const reloadSubs = async \(\) => \{[^\n]*tasks = tasks\.filter\(y => y\.parent_id !== id\)\.concat\(\(x\.subtasks \|\| \[\]\)\.map\(s => \(\{ \.\.\.s, parent_id: id \}\)\)\)/);
  });
  test('openTaskForm honours opts.status; after a create the page reloads ALL tasks, not one list', () => {
    const f = sliceFn(dv, 'openTaskForm', 'detail-views.js');
    assert.match(f, /status: opts\.status \|\| dvFirstKey\(\)/);
    assert.doesNotMatch(f, /\/api\/tasks\?list_id=/);
    assert.match(f, /typeof reloadTasksData === 'function'/);
  });
});

describe('core.js: every new string exists in both languages', () => {
  test('keys', () => {
    const en = core.slice(core.indexOf('  en: {'), core.indexOf('  de: {')), de = core.slice(core.indexOf('  de: {'), core.indexOf('function t(key)'));
    const keys = [...new Set([...src.matchAll(/\btf?\('([a-z0-9_]+)'(?=[,)])/g)].map(m => m[1]))];   // literal keys only; t('prio_' + id) is covered by the prio_* entries below
    assert.ok(keys.length > 60, 'the page is translated: ' + keys.length + ' keys');
    for (const k of keys) { assert.match(en, new RegExp(`(^|[ ,{])${k}:`, 'm'), `en ${k}`); assert.match(de, new RegExp(`(^|[ ,{])${k}:`, 'm'), `de ${k}`); }
    // keys built at runtime (t('prio_' + id), t('chip_' + key), t('tk_due_' + v), t('tk_sort_' + k)) are pinned by name
    for (const k of ['prio_urgent', 'prio_high', 'prio_medium', 'prio_low', 'chip_assignee', 'chip_priority', 'chip_status', 'chip_due', 'tk_due_overdue', 'tk_due_today', 'tk_due_week', 'tk_due_none', 'tk_sort_due', 'tk_sort_priority', 'tk_sort_title', 'tk_sort_owner', 'tk_all', 'tk_mine', 'tk_kpi_open', 'tk_bulk_status', 'tk_move_to']) {
      assert.match(en, new RegExp(`(^|[ ,{])${k}:`, 'm'), `en ${k}`); assert.match(de, new RegExp(`(^|[ ,{])${k}:`, 'm'), `de ${k}`);
    }
  });
});
