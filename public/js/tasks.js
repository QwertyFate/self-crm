/* ═══════════════════════════════════════════════════════════════════════════
   TASKS — the reference Tasks screen (reference/pro/crm-pro.html, screen:
   tasks.js) on the app's data: projects → lists → tasks → subtasks.

   THE HIERARCHY, which the whole file assumes:
     task_project  (a project, e.g. "Onboarding")   ← has its own status columns
       └─ task_list   (a list inside it, e.g. "Q4")
            └─ task         (parent_id = null)
                 └─ subtask (parent_id = the task)

   SCOPES  The sidebar starts with two Views, All tasks and My tasks (assigned
   to me), then the projects with their lists. taskScope says what the main
   area shows — { kind: 'all' | 'mine' | 'project' | 'list', project?, list? } —
   and is remembered in localStorage('taskScope'). The old 'lastTaskListId'
   key migrates into a list scope once. currentProjectId / currentListId /
   currentProject mirror the scope for detail-views' task form defaults.

   STATUSES ARE PER PROJECT, not global: taskStatusesFor(projectId) returns the
   project's statuses or DEFAULT_TASK_STATUSES; the LAST status means "done"
   (taskDoneKey / taskIsDone take the task's OWN project). Because the sets can
   differ between projects, All tasks / My tasks group the table and the board
   BY PROJECT (user decision, 2026-10-08) — each project keeps its own columns.
   A project or list scope groups by status, as the reference does.

   ENTRY POINT  loadTasks(), called by switchPage('tasks'):
     GET /api/task-projects + GET /api/tasks (every task, subtasks included)
     → restoreTaskScope → renderTasks (sidebar + main: header, summary KPIs,
       toolbar with chips, the status- or project-grouped table or the board).
   renderTasksCurrent() is the whole-page re-render the task drawer calls after
   it changed a row; reloadTasksData() is what the task form calls after a
   create (detail-views.js).

   WRITES  status → PATCH /api/tasks/:id/status. Priority, assignee and due
   date → PUT /api/tasks/:id with the full row (taskPutPayload), the only
   endpoint there is. That PUT re-stamps due_tz from the caller's zone, so the
   row is first put on the viewer's clock (taskViewerDue) — same instant, the
   viewer's wall-clock — exactly as the drawer does. patchTasks() applies
   optimistically, rolls back on an error, and offers Undo, which looks the
   rows up again by id (a reload in between replaces the array). Delete has no
   undo — the API cannot restore a row.

   DUE DATES — three shared helpers, used here and by detail-views.js:
     taskDueAt(t)      the task's due moment, built from LOCAL date parts.
     taskIsOverdue()   late only once that moment has passed, never when done.
     taskDueLabel()    the formatted label, with "· HH:MM" when there is a time.
   ⚠ Never write `new Date(t.due_date) < new Date()`. new Date('2026-10-05') is
     UTC midnight, which marked tasks due today as overdue from 08:00 local.

   FUNCTION MAP
     state        resetTasksUI, loadTasks, reloadTasksData
     statuses     taskStatusesFor, taskStatusesOf, taskDoneKey, taskIsDone,
                  taskViewerDue, taskStatusesWithExtras, taskStatusOptions
     scope        setTaskScope, saveTaskScope, restoreTaskScope, taskInScope,
                  scopedTasks, taskScopeInfo, taskScopeDefaults
     filter/sort  visibleTasks, tasksFilterActive, taskSortVal, sortTasks,
                  taskDueOffset, taskIsoFromToday, taskPrioMeta, tasksPlural
     render       renderTasks, renderTasksCurrent, renderTasksSidebar,
                  renderTasksMain, renderTasksSummary, renderTasksToolbar,
                  tasksChip, openTasksChip, onTasksSearch, clearTasksFilters,
                  toggleTasksSummary, tasksKpiClick, sortTasksBy,
                  openTasksSortMenu, renderTasksBody, setTaskView
     table        taskGroups, renderTasksList, taskListRow, taskSubRow,
                  taskSubLine, taskDueHtml, taskPrioBadge, buildSubtaskMap,
                  toggleTaskGroup, toggleSubtasksRow, onTaskRowClick,
                  toggleTaskSelected, toggleAllTasks, bulkTasks,
                  quickAddDefaults, quickAddTask, onQuickAddKey
     board        renderTasksKanban, taskBoardHtml, taskKanbanCard,
                  toggleKanbanSubtasks, onTaskCardKey, taskDragStart,
                  taskDragEnd, taskDragOver, taskDragLeave, taskDrop
     actions      patchTasks, taskPutPayload, toggleTaskDone, moveTaskTo,
                  deleteTasks, deleteTask, openTaskKebab, openTasksNew
     projects     toggleProjectExpand, openProjectKebab, openListKebab,
                  openProjectModal, saveProject, deleteProject, openListModal,
                  saveList, deleteList
     dates        taskDueShown, taskDueAt, taskIsOverdue, taskDueLabel

   The task form and the task drawer are in detail-views.js (openTaskForm,
   openTaskDrawer).
   ═══════════════════════════════════════════════════════════════════════════ */

let tasks            = [];      // every task of the workspace, subtasks included (parent_id)
let taskProjects     = [];
let currentProjectId = null;    // the scope's project / list, mirrored for detail-views' task form
let currentListId    = null;
let currentProject   = null;
let taskViewMode     = localStorage.getItem('taskViewMode') || 'list';   // 'list' | 'kanban'
let dragTaskId       = null;
let collapsedTasks   = new Set();   // board cards whose subtask cards are folded away
let taskScope        = { kind: 'all' };
let tasksUI          = null;        // filters, sort, selection, collapsed groups, expanded rows, summary flag

const DEFAULT_TASK_STATUSES = [
  { key: 'todo',        label: 'Todo',        color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'in_review',   label: 'In Review',   color: '#f59e0b' },
  { key: 'done',        label: 'Done',        color: '#22c55e' },
];
// tone → the badge class; rank → sort order; urg → the card's urgency bar (0 = none)
const TASK_PRIO = [
  { id: 'urgent', tone: 'danger',  rank: 0, urg: 4 },
  { id: 'high',   tone: 'warning', rank: 1, urg: 3 },
  { id: 'medium', tone: 'info',    rank: 2, urg: 0 },
  { id: 'low',    tone: '',        rank: 3, urg: 0 },
];
const TASK_DUE_FILTERS = {
  overdue: x => taskIsOverdue(x, taskIsDone(x)),
  today:   x => taskDueOffset(x) === 0,
  week:    x => { const n = taskDueOffset(x); return n != null && n >= 0 && n <= 7; },
  none:    x => !x.due_date,
};
const TASK_SORT_KEYS = ['due', 'priority', 'title', 'owner'];

function resetTasksUI() {
  taskScope = { kind: 'all' }; currentProjectId = null; currentListId = null; currentProject = null; collapsedTasks = new Set();
  tasksUI = { q: '', assignee: null, priority: null, status: null, due: null, sort: { key: 'due', dir: 1 }, sel: new Set(), collapsed: new Set(), expanded: new Set(), summary: localStorage.getItem('tasksSummary') !== '0', refocus: null };
}
resetTasksUI();

function tasksPlural(n, one, many) { return n === 1 ? t(one) : tf(many, { n }); }
function taskPrioMeta(id) { return TASK_PRIO.find(p => p.id === id) || TASK_PRIO[2]; }

/* ---------- statuses (per project) ---------- */
function taskStatusesFor(projectId) {
  const p = taskProjects.find(q => q.id === projectId);
  return p && Array.isArray(p.statuses) && p.statuses.length ? p.statuses : DEFAULT_TASK_STATUSES;
}
function taskStatusesOf(x) { return taskStatusesFor(x.project_id || null); }
function taskDoneKey(x) { return taskStatusesOf(x).at(-1)?.key || 'done'; }
function taskIsDone(x) { return x.status === taskDoneKey(x); }
// A task's due date and time ON THE VIEWER'S CLOCK, with the viewer's zone — the shape the server
// stores after any PUT from here, because PUT /api/tasks/:id re-stamps due_tz from the caller's
// zone on every write. Sending the stored wall-clock (another member's zone) with that re-stamp
// would move the deadline; the drawer converts first for the same reason.
function taskViewerDue(x) {
  if (!x || !x.due_date) return { due_date: null, due_time: null, due_tz: currentTimezone() };
  const s = taskDueShown(x);
  return { due_date: s.date || null, due_time: s.time || null, due_tz: currentTimezone() };
}
// A task can carry a status its project's set does not know (the drawer and the task form take
// theirs from the workspace-level setting; see Part 40's notes). Such tasks must never vanish from
// a project view: the unknown keys get a trailing group / column, labelled from the workspace
// statuses when they know the key, else by the raw key.
function taskStatusesWithExtras(statuses, items) {
  const known = new Set(statuses.map(s => s.key)), extra = [];
  items.forEach(x => { if (!known.has(x.status) && !extra.includes(x.status)) extra.push(x.status); });
  if (!extra.length) return statuses;
  const ws = Array.isArray(currentWorkspace?.task_statuses) ? currentWorkspace.task_statuses : [];
  return statuses.concat(extra.map(key => { const w = ws.find(s => s.key === key); return { key, label: w ? w.label : key, color: w && w.color ? w.color : 'var(--border-strong)' }; }));
}
// The Status chip's options: a project / list scope lists its own statuses; All / My tasks list
// Done, then the union of every project's statuses (the first project's label wins a shared key).
function taskStatusOptions() {
  const c = taskScope;
  if (c.kind === 'project' || c.kind === 'list') return [{ value: 'active', label: t('tk_not_done') }, ...taskStatusesFor(c.project).map(s => ({ value: s.key, label: s.label }))];
  const seen = new Map();
  const add = sts => sts.forEach(s => { if (s.key !== 'done' && !seen.has(s.key)) seen.set(s.key, s.label); });
  taskProjects.forEach(p => add(taskStatusesFor(p.id)));
  if (!taskProjects.length || tasks.some(x => !x.parent_id && !x.project_id)) add(DEFAULT_TASK_STATUSES);
  return [{ value: 'active', label: t('tk_not_done') }, { value: 'done', label: t('tk_done') }, ...[...seen].map(([value, label]) => ({ value, label }))];
}

/* ---------- loading ---------- */
async function loadTasks() {
  await ensureMembers();
  await reloadTasksData();
  restoreTaskScope();
  renderTasks();
}
async function reloadTasksData() {
  const [projects, rows] = await Promise.all([api.get('/api/task-projects'), api.get('/api/tasks')]);
  if (Array.isArray(projects)) taskProjects = projects;
  if (Array.isArray(rows)) tasks = rows;
}

/* ---------- scope ---------- */
// quiet: set without rendering (restoreTaskScope runs before the first render).
function setTaskScope(kind, project, list, quiet) {
  const p = taskProjects.find(q => q.id === project) || null;
  const l = p ? (p.lists || []).find(q => q.id === list) || null : null;
  taskScope = kind === 'list' && l ? { kind: 'list', project: p.id, list: l.id }
    : kind === 'project' && p ? { kind: 'project', project: p.id }
    : kind === 'mine' ? { kind: 'mine' } : { kind: 'all' };
  currentProjectId = p ? p.id : null;
  currentListId = l ? l.id : null;
  currentProject = p;
  tasksUI.sel.clear();
  saveTaskScope();
  if (!quiet) renderTasks();
}
function saveTaskScope() { try { localStorage.setItem('taskScope', JSON.stringify(taskScope)); } catch (e) { /* storage off */ } }
function restoreTaskScope() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem('taskScope') || 'null'); } catch (e) { s = null; }
  if (!s) {   // the pre-port page remembered one list
    const legacy = parseInt(localStorage.getItem('lastTaskListId'), 10);
    const p = legacy ? taskProjects.find(q => (q.lists || []).some(l => l.id === legacy)) : null;
    if (p) s = { kind: 'list', project: p.id, list: legacy };
  }
  setTaskScope(s ? s.kind : 'all', s ? s.project : undefined, s ? s.list : undefined, true);
}
function taskInScope(x) {
  const c = taskScope;
  if (c.kind === 'mine') return x.assigned_to === (currentUser ? currentUser.id : null);
  if (c.kind === 'project') return x.project_id === c.project;
  if (c.kind === 'list') return x.list_id === c.list;
  return true;
}
function scopedTasks() { return tasks.filter(x => !x.parent_id && taskInScope(x)); }
function taskScopeInfo() {
  const c = taskScope, p = taskProjects.find(q => q.id === c.project) || null, l = p && c.kind === 'list' ? (p.lists || []).find(q => q.id === c.list) : null;
  const a = scopedTasks(), open = a.filter(x => !taskIsDone(x)), late = open.filter(x => taskIsOverdue(x, false));
  const sub = tasksPlural(open.length, 'tk_one_open', 'tk_open_n') + (late.length ? ', ' + tf('tk_overdue_n', { n: late.length }) : '');
  if (c.kind === 'mine') return { title: t('tk_mine'), parent: null, sub };
  if (c.kind === 'project' && p) return { title: p.name, parent: null, sub };
  if (c.kind === 'list' && l) return { title: l.name, parent: p.name, sub };
  return { title: t('tk_all'), parent: null, sub };
}
// Where a new task goes: the scope's project / list, else the first project and its first list.
function taskScopeDefaults(projectId) {
  const c = taskScope;
  const p = taskProjects.find(q => q.id === (projectId != null ? projectId : c.project)) || taskProjects[0] || null;
  const l = p ? ((c.kind === 'list' && c.project === p.id ? (p.lists || []).find(q => q.id === c.list) : null) || (p.lists || [])[0] || null) : null;
  return { project_id: p ? p.id : null, list_id: l ? l.id : null };
}

/* ---------- filters, sort ---------- */
function visibleTasks() {
  const q = tasksUI.q.trim().toLowerCase();
  return scopedTasks().filter(x => {
    if (q && !`${x.title} ${x.description || ''} ${x.deal_title || ''} ${x.contact_name || ''}`.toLowerCase().includes(q)) return false;
    if (tasksUI.assignee != null && x.assigned_to !== tasksUI.assignee) return false;
    if (tasksUI.priority && x.priority !== tasksUI.priority) return false;
    if (tasksUI.status === 'active' ? taskIsDone(x) : tasksUI.status === 'done' ? !taskIsDone(x) : tasksUI.status && x.status !== tasksUI.status) return false;
    if (tasksUI.due && !TASK_DUE_FILTERS[tasksUI.due](x)) return false;
    return true;
  });
}
function tasksFilterActive() { return !!(tasksUI.q.trim() || tasksUI.assignee != null || tasksUI.priority || tasksUI.status || tasksUI.due); }
// Days from today to the due date on the viewer's clock; null without a date.
function taskDueOffset(x) {
  if (!x || !x.due_date) return null;
  const s = taskDueShown(x), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.date);
  if (!m) return null;
  const now = nowInTimezone(currentTimezone());
  return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
}
function taskIsoFromToday(off) {
  const now = nowInTimezone(currentTimezone()), d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function taskSortVal(x, k) {
  return k === 'title' ? x.title.toLowerCase() : k === 'priority' ? taskPrioMeta(x.priority).rank : k === 'due' ? taskDueOffset(x) : (x.assigned_to_name || '').toLowerCase();
}
function sortTasks(arr) {
  const { key, dir } = tasksUI.sort;
  return [...arr].sort((a, b) => {
    const x = taskSortVal(a, key), y = taskSortVal(b, key);
    if (x == null && y == null) return a.id - b.id;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * dir || ((taskDueOffset(a) ?? 9999) - (taskDueOffset(b) ?? 9999)) || a.id - b.id;
  });
}

/* ---------- rendering ---------- */
function renderTasks() {
  const sc = document.querySelector('#tasks-body .tk-scroll'), bd = document.querySelector('#tasks-body .tk-boards'), side = document.getElementById('tasks-side');
  const keep = { y: sc ? sc.scrollTop : 0, x: bd ? bd.scrollLeft : 0, side: side ? side.scrollTop : 0, ae: document.activeElement };
  renderTasksSidebar();
  renderTasksMain();
  const sc2 = document.querySelector('#tasks-body .tk-scroll'); if (sc2) sc2.scrollTop = keep.y;
  const bd2 = document.querySelector('#tasks-body .tk-boards'); if (bd2) bd2.scrollLeft = keep.x;
  if (side) side.scrollTop = keep.side;
  if (keep.ae && keep.ae.id === 'tasks-q') { const q = document.getElementById('tasks-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  else if (tasksUI.refocus) { const i = document.querySelector(`[data-quickadd="${tasksUI.refocus}"]`); if (i) i.focus(); }
  tasksUI.refocus = null;
}
function renderTasksCurrent() { renderTasks(); }   // what the task drawer calls after it changed a row

function renderTasksSidebar() {
  const el = document.getElementById('tasks-side');
  if (!el) return;
  const parents = tasks.filter(x => !x.parent_id), openCount = a => a.filter(x => !taskIsDone(x)).length, c = taskScope;
  const cnt = n => `<span class="ct" title="${esc(tasksPlural(n, 'tk_one_open', 'tk_open_n'))}">${n}</span>`;
  const view = (k, label, ic, n) => `<div class="tk-row"><button class="tk-link" type="button" data-scope="${k}" aria-current="${c.kind === k}" onclick="setTaskScope('${k}')">${icon(ic)}<span class="nm">${esc(label)}</span>${cnt(n)}</button></div>`;
  const proj = p => {
    const open = !localStorage.getItem('proj-collapsed-' + p.id), pt = parents.filter(x => x.project_id === p.id);
    return `<div class="tk-proj"><div class="tk-row"><button class="tk-chev" type="button" data-ptoggle="${p.id}" aria-expanded="${open}" aria-label="${esc(t(open ? 'tk_collapse' : 'tk_expand'))} ${esc(p.name)}" onclick="toggleProjectExpand(${p.id})">${icon('chevron-right')}</button><button class="tk-link" type="button" data-scope="project" data-p="${p.id}" aria-current="${c.kind === 'project' && c.project === p.id}" onclick="setTaskScope('project',${p.id})"><span class="dot" style="background:${esc(p.color)}"></span><span class="nm">${esc(p.name)}</span>${cnt(openCount(pt))}</button><button class="iconbtn tk-mini tk-act" type="button" onclick="openProjectKebab(this,${p.id})" aria-label="${esc(tf('tk_actions_for', { name: p.name }))}" aria-haspopup="menu">${icon('ellipsis')}</button></div>
      ${open ? `<div class="tk-lists">${(p.lists || []).map(l => `<div class="tk-row"><button class="tk-link" type="button" data-scope="list" data-p="${p.id}" data-l="${l.id}" aria-current="${c.kind === 'list' && c.list === l.id}" onclick="setTaskScope('list',${p.id},${l.id})">${icon('list', 'ic-sm')}<span class="nm">${esc(l.name)}</span>${cnt(openCount(pt.filter(x => x.list_id === l.id)))}</button><button class="iconbtn tk-mini tk-act" type="button" onclick="openListKebab(this,${p.id},${l.id})" aria-label="${esc(tf('tk_actions_for', { name: l.name }))}" aria-haspopup="menu">${icon('ellipsis')}</button></div>`).join('')}<button class="tk-addlist" type="button" onclick="openListModal(${p.id})">${icon('plus', 'ic-sm')}${esc(t('tk_add_list'))}</button></div>` : ''}</div>`;
  };
  el.innerHTML = `<div class="tk-sec"><span>${esc(t('tk_views'))}</span></div>${view('all', t('tk_all'), 'check-square', openCount(parents))}${view('mine', t('tk_mine'), 'target', openCount(parents.filter(x => x.assigned_to === (currentUser ? currentUser.id : null))))}
    <div class="tk-sec"><span>${esc(t('tk_projects'))}</span><button class="iconbtn tk-mini" type="button" onclick="openProjectModal()" aria-label="${esc(t('tk_new_project'))}" title="${esc(t('tk_new_project'))}">${icon('plus')}</button></div>
    ${taskProjects.map(proj).join('') || `<div class="muted" style="padding:6px 8px;font-size:var(--fs-sm)">${esc(t('tk_no_projects'))}</div>`}`;
}

function renderTasksMain() {
  const el = document.getElementById('tasks-main');
  if (!el) return;
  const info = taskScopeInfo();
  el.innerHTML = `<div class="page-header"><div><h1 class="page-title">${esc(info.title)}</h1><p class="page-sub">${info.parent ? esc(info.parent) + ', ' : ''}${esc(info.sub)}</p></div>
    <div class="page-actions"><div class="seg" role="group" aria-label="${esc(t('tk_view'))}"><button type="button" id="task-view-list" aria-pressed="${taskViewMode === 'list'}" onclick="setTaskView('list')">${icon('list', 'ic-sm')}${esc(t('tk_list'))}</button><button type="button" id="task-view-kanban" aria-pressed="${taskViewMode === 'kanban'}" onclick="setTaskView('kanban')">${icon('kanban', 'ic-sm')}${esc(t('tk_board'))}</button></div>
    <button class="btn btn-primary" type="button" onclick="openTasksNew()">${icon('plus')}${esc(t('tk_add_task'))}</button></div></div>
    <div id="tasks-summary"></div><div id="tasks-toolbar" class="toolbar"></div><div id="tasks-body" class="tk-body"></div>`;
  renderTasksSummary();
  renderTasksToolbar();
  renderTasksBody();
}
function renderTasksBody() { if (taskViewMode === 'kanban') renderTasksKanban(); else renderTasksList(); }
function setTaskView(mode, save = true) {
  taskViewMode = mode === 'kanban' ? 'kanban' : 'list';
  if (save) localStorage.setItem('taskViewMode', taskViewMode);
  renderTasksMain();
}

function renderTasksSummary() {
  const el = document.getElementById('tasks-summary');
  if (!el) return;
  if (!tasksUI.summary) { el.innerHTML = ''; return; }
  const a = scopedTasks(), open = a.filter(x => !taskIsDone(x)), late = open.filter(x => taskIsOverdue(x, false)), week = open.filter(TASK_DUE_FILTERS.week), done = a.length - open.length;
  const k = (key, label, value, foot, cls = '') => `<button class="kpi tk-kpi" type="button" data-kpi="${key}" onclick="tasksKpiClick('${key}')"><div class="kpi-label">${esc(label)}</div><div class="kpi-value${cls ? ' ' + cls : ''}">${value}</div><div class="kpi-foot">${esc(foot)}</div></button>`;
  el.innerHTML = `<section class="card summary" aria-label="${esc(t('tk_summary'))}"><div class="kpis">
    ${k('active', t('tk_kpi_open'), open.length, tf('tk_kpi_inprog', { n: open.filter(x => x.status === 'in_progress').length }))}
    ${k('overdue', t('tk_kpi_overdue'), late.length, t(late.length ? 'tk_kpi_needs' : 'tk_kpi_none_overdue'), late.length ? 'bad' : '')}
    ${k('week', t('tk_kpi_week'), week.length, t('tk_kpi_incl_today'))}
    ${k('done', t('tk_kpi_done'), done, tf('tk_kpi_done_foot', { p: a.length ? Math.round(done / a.length * 100) : 0, n: tasksPlural(a.length, 'one_task', 'n_tasks') }))}</div></section>`;
}
function tasksKpiClick(k) {
  tasksUI.status = null; tasksUI.due = null;
  if (k === 'overdue' || k === 'week') tasksUI.due = k; else tasksUI.status = k;
  renderTasksToolbar(); renderTasksBody();
}
function toggleTasksSummary() {
  tasksUI.summary = !tasksUI.summary;
  localStorage.setItem('tasksSummary', tasksUI.summary ? '1' : '0');
  renderTasksSummary(); renderTasksToolbar();
}

function renderTasksToolbar() {
  const el = document.getElementById('tasks-toolbar');
  if (!el) return;
  const active = document.activeElement && document.activeElement.id === 'tasks-q';
  el.innerHTML = `<div class="input-group" style="width:220px">${icon('search')}<input class="input" id="tasks-q" type="search" placeholder="${esc(t('tk_search'))}" value="${esc(tasksUI.q)}" aria-label="${esc(t('tk_search'))}" oninput="onTasksSearch(this.value)"></div>
    ${tasksChip('assignee')}${tasksChip('priority')}${tasksChip('status')}${tasksChip('due')}
    ${tasksFilterActive() ? `<button class="btn btn-ghost btn-sm" type="button" onclick="clearTasksFilters()">${esc(t('clear_filters'))}</button>` : ''}<span class="grow"></span>
    ${taskViewMode === 'kanban' ? `<button class="btn btn-secondary btn-sm" type="button" onclick="openTasksSortMenu(this)" aria-haspopup="menu">${icon('sort')}${esc(t('tk_sort'))}: ${esc(t('tk_sort_' + tasksUI.sort.key))}</button>` : ''}
    <button class="btn btn-secondary btn-sm" type="button" onclick="toggleTasksSummary()" aria-pressed="${tasksUI.summary}">${icon('bar-chart')}${esc(t(tasksUI.summary ? 'hide_summary' : 'show_summary'))}</button>`;
  if (active) { const q = document.getElementById('tasks-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
function tasksChip(key) {
  const v = tasksUI[key], on = v != null && v !== '';
  const txt = !on ? '' : key === 'assignee' ? (members.find(m => m.id === v)?.name || '')
    : key === 'priority' ? t('prio_' + v)
    : key === 'status' ? (taskStatusOptions().find(o => o.value === v)?.label || v)
    : t('tk_due_' + v);
  return `<button class="chip${on ? ' on' : ''}" type="button" id="tasks-chip-${key}" onclick="openTasksChip(this,'${key}')" aria-haspopup="menu">${esc(t('chip_' + key))}${on ? ': ' + esc(txt) : ''}${icon('chevron-down', 'ic-sm')}</button>`;
}
function openTasksChip(anchor, key) {
  const opts = key === 'assignee' ? members.map(m => ({ value: m.id, label: m.name }))
    : key === 'priority' ? TASK_PRIO.map(p => ({ value: p.id, label: t('prio_' + p.id) }))
    : key === 'status' ? taskStatusOptions()
    : ['overdue', 'today', 'week', 'none'].map(v => ({ value: v, label: t('tk_due_' + v) }));
  ui.select(anchor, [{ value: null, label: t('filter_all') }, ...opts], tasksUI[key], v => {
    tasksUI[key] = v; renderTasksToolbar(); renderTasksBody();
    document.getElementById('tasks-chip-' + key)?.focus();
  });
}
let tasksSearchTimer = null;
function onTasksSearch(value) {
  tasksUI.q = value;
  clearTimeout(tasksSearchTimer);
  tasksSearchTimer = setTimeout(() => { renderTasksToolbar(); renderTasksBody(); }, 120);
}
function clearTasksFilters() { tasksUI.q = ''; tasksUI.assignee = tasksUI.priority = tasksUI.status = tasksUI.due = null; renderTasksToolbar(); renderTasksBody(); }
function sortTasksBy(key) {
  tasksUI.sort = { key, dir: tasksUI.sort.key === key ? -tasksUI.sort.dir : 1 };
  renderTasksBody();
}
function openTasksSortMenu(anchor) {
  ui.select(anchor, TASK_SORT_KEYS.map(k => ({ value: k, label: t('tk_sort_' + k) })), tasksUI.sort.key, v => { tasksUI.sort = { key: v, dir: 1 }; renderTasksToolbar(); renderTasksBody(); });
}

/* ---------- the table ---------- */
// A project or list scope groups by the project's statuses (every status, so each has an add row;
// only the non-empty ones while filtering). All / My tasks group by project — "No project" last —
// with every project listed in All (so a task can be added to any of them) and only the ones with
// a matching task in My tasks or while filtering.
function taskGroups() {
  const rows = visibleTasks(), flt = tasksFilterActive(), c = taskScope;
  let groups;
  if (c.kind === 'project' || c.kind === 'list') {
    groups = taskStatusesWithExtras(taskStatusesFor(c.project), scopedTasks()).map(st => ({ key: 's:' + st.key, label: st.label, color: st.color, status: st.key, project: c.project, items: sortTasks(rows.filter(x => x.status === st.key)) }));
  } else {
    groups = taskProjects.map(p => ({ key: 'p:' + p.id, label: p.name, color: p.color, project: p.id, items: sortTasks(rows.filter(x => x.project_id === p.id)) }));
    const loose = rows.filter(x => !x.project_id || !taskProjects.some(p => p.id === x.project_id));
    if (loose.length || !taskProjects.length) groups.push({ key: 'p:0', label: t('tk_no_project'), color: 'var(--border-strong)', project: null, items: sortTasks(loose) });
    if (c.kind === 'mine') groups = groups.filter(g => g.items.length);
  }
  return flt ? groups.filter(g => g.items.length) : groups;
}
function buildSubtaskMap(list) {
  const map = {};
  list.filter(x => x.parent_id).forEach(s => { (map[s.parent_id] = map[s.parent_id] || []).push(s); });
  return map;
}
function taskPrioBadge(id) { const p = taskPrioMeta(id); return `<span class="badge${p.tone ? ' badge-' + p.tone : ''}">${esc(t('prio_' + p.id))}</span>`; }
function taskDueHtml(x) {
  if (!x.due_date) return `<span class="muted">${esc(t('tk_not_set'))}</span>`;
  const fin = taskIsDone(x), late = taskIsOverdue(x, fin), today = taskDueOffset(x) === 0, label = taskDueLabel(x);
  return `<span class="tk-due${fin ? ' fin' : late ? ' late' : today ? ' today' : ''}" title="${esc(label)}">${late ? icon('alert', 'ic-sm') : ''}${esc(label)}</span>`;
}
// Deal or contact link, then where the task lives: nothing in a list scope, the list elsewhere
// (the project is the group in All / My tasks).
function taskSubLine(x) {
  const c = taskScope, p = taskProjects.find(q => q.id === x.project_id), l = p ? (p.lists || []).find(q => q.id === x.list_id) : null;
  const where = c.kind === 'list' ? '' : (l ? l.name : '');
  const link = x.deal_id ? `<a href="#" title="${esc(t('tk_open_deal'))}: ${esc(x.deal_title || '')}" onclick="event.preventDefault();event.stopPropagation();openDealDetail(${x.deal_id})">${icon('deals', 'ic-sm')}<span>${esc(x.deal_title || 'Deal')}</span></a>`
    : x.contact_id ? `<a href="#" title="${esc(t('tk_open_contact'))}" onclick="event.preventDefault();event.stopPropagation();openContactDetail(${x.contact_id})">${icon('contacts', 'ic-sm')}<span>${esc(x.contact_name || 'Contact')}</span></a>` : '';
  const parts = [link, where ? `<span class="tail">${esc(where)}</span>` : ''].filter(Boolean);
  return parts.length ? parts.join('<i class="sep"></i>') : `<span>${esc(t('tk_no_deal'))}</span>`;
}
function taskListRow(x, subMap = {}) {
  const fin = taskIsDone(x), sel = tasksUI.sel.has(x.id), subs = subMap[x.id] || [], open = tasksUI.expanded.has(x.id);
  const sn = subs.length || x.subtask_count || 0, sd = subs.length ? subs.filter(s => taskIsDone(s)).length : (x.subtask_done || 0);
  const expand = sn ? `<button class="tk-expand${open ? ' open' : ''}" type="button" aria-expanded="${open}" aria-label="${esc(t(open ? 'tk_collapse' : 'tk_expand'))}" onclick="toggleSubtasksRow(event,${x.id})">${icon('chevron-right', 'ic-sm')}</button>` : '<span class="tk-expand-gap"></span>';
  return `<tr class="clickable tk-tr${fin ? ' tk-fin' : ''}" data-open="${x.id}" aria-selected="${sel}" onclick="onTaskRowClick(event,${x.id})">
    <td class="col-check"><label class="check"><input type="checkbox" data-row="${x.id}" aria-label="${esc(tf('tk_select', { name: x.title }))}" onchange="toggleTaskSelected(${x.id},this.checked)" ${sel ? 'checked' : ''}></label></td>
    <td><div class="tk-tcell">${expand}<button class="tk-done${fin ? ' on' : ''}" type="button" data-toggle="${x.id}" aria-pressed="${fin}" aria-label="${esc(t(fin ? 'tk_reopen' : 'tk_complete'))}: ${esc(x.title)}" onclick="toggleTaskDone(event,${x.id})">${icon('check')}</button><div class="grow" style="min-width:0"><a class="tk-title" href="#" onclick="event.preventDefault();openTaskDrawer(${x.id})">${esc(x.title)}</a><div class="tk-sub">${taskSubLine(x)}</div></div></div></td>
    <td>${sn ? `<div class="row" style="gap:8px" title="${esc(tf('tk_subs_done', { d: sd, n: sn }))}"><div class="progress" style="width:36px"><i style="width:${Math.round(sd / sn * 100)}%"></i></div><span class="tnum muted">${sd}/${sn}</span></div>` : ''}</td><td>${taskPrioBadge(x.priority)}</td><td>${taskDueHtml(x)}</td><td>${x.assigned_to_name ? avatar(x.assigned_to_name, 'sm') : '<span class="muted">—</span>'}</td>
    <td class="kebab-cell"><button class="iconbtn" type="button" data-kebab="${x.id}" onclick="event.stopPropagation();openTaskKebab(this,${x.id})" aria-label="${esc(tf('tk_actions_for', { name: x.title }))}" aria-haspopup="menu">${icon('ellipsis')}</button></td></tr>${open ? subs.map(taskSubRow).join('') : ''}`;
}
function taskSubRow(s) {
  const fin = taskIsDone(s);
  return `<tr class="tk-subrow${fin ? ' tk-fin' : ''}" data-parent="${s.parent_id}"><td></td><td><div class="tk-tcell tk-tcell-sub"><button class="tk-done${fin ? ' on' : ''}" type="button" data-toggle="${s.id}" aria-pressed="${fin}" aria-label="${esc(t(fin ? 'tk_reopen' : 'tk_complete'))}: ${esc(s.title)}" onclick="toggleTaskDone(event,${s.id})">${icon('check')}</button><a class="tk-title" href="#" onclick="event.preventDefault();openTaskDrawer(${s.id})">${esc(s.title)}</a></div></td><td></td><td>${taskPrioBadge(s.priority)}</td><td>${taskDueHtml(s)}</td><td>${s.assigned_to_name ? avatar(s.assigned_to_name, 'sm') : ''}</td><td></td></tr>`;
}
function renderTasksList() {
  const el = document.getElementById('tasks-body');
  if (!el) return;
  const rows = visibleTasks(), groups = taskGroups(), subMap = buildSubtaskMap(tasks), sel = tasksUI.sel;
  const th = (key, label) => { const on = tasksUI.sort.key === key; return `<th aria-sort="${on ? (tasksUI.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${key}" onclick="sortTasksBy('${key}')">${esc(label)}${on ? icon(tasksUI.sort.dir > 0 ? 'arrow-up' : 'arrow-down', 'ic-sm') : ''}</button></th>`; };
  const allSel = rows.length > 0 && rows.every(x => sel.has(x.id));
  const bulk = sel.size ? `<div class="bulkbar" role="toolbar" aria-label="${esc(t('tk_bulk_aria'))}"><b>${esc(tf('n_selected', { n: sel.size }))}</b><button class="btn btn-sm" type="button" onclick="bulkTasks('status',this)" aria-haspopup="menu">${esc(t('tk_bulk_status'))}</button><button class="btn btn-sm" type="button" onclick="bulkTasks('priority',this)" aria-haspopup="menu">${esc(t('tk_bulk_priority'))}</button><button class="btn btn-sm" type="button" onclick="bulkTasks('owner',this)" aria-haspopup="menu">${esc(t('tk_bulk_assign'))}</button><button class="btn btn-sm" type="button" onclick="bulkTasks('due',this)" aria-haspopup="menu">${esc(t('tk_bulk_due'))}</button><button class="btn btn-sm" type="button" onclick="bulkTasks('delete')">${esc(t('btn_delete'))}</button><button class="btn btn-sm" style="margin-left:auto" type="button" onclick="bulkTasks('clear')">${esc(t('tk_clear_sel'))}</button></div>` : '';
  const body = groups.map(g => {
    const closed = tasksUI.collapsed.has(g.key);
    return `<tr class="tk-group"><td colspan="7"><button class="tk-ghead" type="button" data-group="${g.key}" aria-expanded="${!closed}" onclick="toggleTaskGroup('${g.key}')">${icon('chevron-right')}<i style="background:${esc(g.color)}"></i>${esc(g.label)}<span class="cnt">${g.items.length}</span></button></td></tr>
      ${closed ? '' : g.items.map(x => taskListRow(x, subMap)).join('')}
      ${closed ? '' : `<tr class="tk-add"><td></td><td colspan="6"><label class="tk-addwrap">${icon('plus')}<input class="tk-addinput" data-quickadd="${g.key}" placeholder="${esc(t('tk_add_placeholder'))}" aria-label="${esc(tf('tk_add_to', { name: g.label }))}" autocomplete="off" onkeydown="onQuickAddKey(event,this)"><span class="tk-addhint">${esc(t('tk_press_enter'))}</span></label></td></tr>`}`;
  }).join('');
  const total = scopedTasks().length;
  el.innerHTML = `${bulk}<div class="table-wrap tk-scroll"><table class="table tk-table"><colgroup><col style="width:40px"><col><col style="width:96px"><col style="width:96px"><col style="width:150px"><col style="width:80px"><col style="width:44px"></colgroup>
    <thead><tr><th class="col-check"><label class="check"><input type="checkbox" data-all aria-label="${esc(t('tk_select_all'))}" onchange="toggleAllTasks(this.checked)" ${allSel ? 'checked' : ''}></label></th>${th('title', t('tk_col_task'))}<th>${esc(t('tk_col_subtasks'))}</th>${th('priority', t('tk_col_priority'))}${th('due', t('tk_col_due'))}${th('owner', t('tk_col_assignee'))}<th></th></tr></thead>
    <tbody>${body || `<tr><td colspan="7"><div class="empty">${icon('search')}<b>${esc(t('tk_no_match'))}</b><div>${esc(t('tk_no_match_sub'))}</div><div style="margin-top:14px"><button class="btn btn-secondary btn-sm" type="button" onclick="clearTasksFilters()">${esc(t('clear_filters'))}</button></div></div></td></tr>`}</tbody></table></div>
    <div class="table-foot" style="margin-top:-1px;border:1px solid var(--border);border-top:0"><span>${esc(tf('tk_n_of_total', { n: rows.length, total: tasksPlural(total, 'one_task', 'n_tasks') }))}</span><span class="tnum">${esc(tf('tk_foot_open', { open: rows.filter(x => !taskIsDone(x)).length, late: rows.filter(x => taskIsOverdue(x, taskIsDone(x))).length }))}</span></div>`;
  const all = document.querySelector('#tasks-body [data-all]'); if (all) all.indeterminate = sel.size > 0 && !allSel;
}
function toggleTaskGroup(key) {
  if (tasksUI.collapsed.has(key)) tasksUI.collapsed.delete(key); else tasksUI.collapsed.add(key);
  renderTasksBody();
  document.querySelector(`#tasks-body [data-group="${key}"]`)?.focus();
}
function toggleSubtasksRow(e, id) {
  if (e && e.stopPropagation) e.stopPropagation();
  if (tasksUI.expanded.has(id)) tasksUI.expanded.delete(id); else tasksUI.expanded.add(id);
  renderTasksBody();
}
function onTaskRowClick(e, id) {
  if (e.target.closest && e.target.closest('.check,[data-kebab],[data-toggle],a,button,input')) return;
  openTaskDrawer(id);
}
function toggleTaskSelected(id, on) { if (on) tasksUI.sel.add(id); else tasksUI.sel.delete(id); renderTasksBody(); }
function toggleAllTasks(on) { visibleTasks().forEach(x => { if (on) tasksUI.sel.add(x.id); else tasksUI.sel.delete(x.id); }); renderTasksBody(); }
async function bulkTasks(action, anchor) {
  const sel = [...tasksUI.sel], n = tasksPlural(sel.length, 'one_task', 'n_tasks');
  if (action === 'clear') { tasksUI.sel.clear(); renderTasksBody(); return; }
  if (action === 'delete') { await deleteTasks(sel); return; }
  const done = fn => async () => { await fn(); tasksUI.sel.clear(); renderTasksBody(); };
  const rows = sel.map(id => tasks.find(x => x.id === id)).filter(Boolean);
  if (action === 'status') {
    // each selected task moves within its OWN project's statuses; a mixed selection gets one heading per project
    const pids = [...new Set(rows.map(x => x.project_id || 0))];
    const items = pids.flatMap(pid => {
      const p = taskProjects.find(q => q.id === pid), mine = rows.filter(x => (x.project_id || 0) === pid).map(x => x.id);
      return [...(pids.length > 1 ? [{ heading: p ? p.name : t('tk_no_project') }] : []),
        ...taskStatusesFor(pid || null).map(s => ({ label: s.label, onSelect: done(() => patchTasks(mine, { status: s.key }, tf('tk_moved_to', { n: tasksPlural(mine.length, 'one_task', 'n_tasks'), s: s.label }))) }))];
    });
    ui.menu(anchor, items);
  }
  if (action === 'priority') ui.menu(anchor, TASK_PRIO.map(p => ({ label: t('prio_' + p.id), onSelect: done(() => patchTasks(sel, { priority: p.id }, tf('tk_prio_set', { n, p: t('prio_' + p.id) }))) })));
  if (action === 'owner') ui.menu(anchor, members.map(m => ({ label: m.name, onSelect: done(() => patchTasks(sel, { assigned_to: m.id }, tf('tk_assigned_to', { n, m: m.name }))) })));
  if (action === 'due') ui.menu(anchor, [{ label: t('today'), off: 0 }, { label: t('tk_due_tomorrow'), off: 1 }, { label: t('tk_due_in7'), off: 7 }, { label: t('tk_due_clear'), off: null }]
    .map(o => ({ label: o.label, onSelect: done(() => patchTasks(sel, o.off == null ? { due_date: null, due_time: null } : { due_date: taskIsoFromToday(o.off) }, o.off == null ? tf('tk_due_cleared', { n }) : tf('tk_due_set', { n, d: o.label.toLowerCase() }))) })));
}
// The group an inline add row belongs to decides the new task's home: a status group → the
// scope's project / list with that status; a project group → that project, its first list, its
// first status; "No project" → none.
function quickAddDefaults(groupKey) {
  const [kind, val] = String(groupKey).split(':');
  if (kind === 'p') {
    const pid = +val || null;
    if (!pid) return { project_id: null, list_id: null, status: DEFAULT_TASK_STATUSES[0].key };
    const d = taskScopeDefaults(pid);
    return { project_id: d.project_id, list_id: d.list_id, status: taskStatusesFor(pid)[0].key };
  }
  const d = taskScopeDefaults();
  return { project_id: d.project_id, list_id: d.list_id, status: val };
}
async function quickAddTask(input, groupKey) {
  const title = String(input.value || '').trim();
  if (!title) return;
  const d = quickAddDefaults(groupKey), g = taskGroups().find(q => q.key === groupKey);
  const res = await api.post('/api/tasks', { title, status: d.status, priority: 'medium', assigned_to: currentUser ? currentUser.id : null, project_id: d.project_id, list_id: d.list_id });
  if (!res || res.error) { ui.toast((res && res.error) || t('tk_err_add')); return; }
  input.value = '';
  tasksUI.refocus = groupKey;
  await reloadTasksData();
  renderTasks();
  ui.toast(tf('tk_added_to', { g: g ? g.label : '' }), { action: { label: t('tk_open'), onClick: () => openTaskDrawer(res.id) } });
}
function onQuickAddKey(e, el) {
  if (e.key === 'Enter') { e.preventDefault(); quickAddTask(el, el.dataset.quickadd); }
  else if (e.key === 'Escape') { el.value = ''; el.blur(); }
}

/* ---------- the board ---------- */
// A project or list scope is one board with the project's columns. All / My tasks stack one board
// per project (each with its own columns), "No project" last with the default columns.
function renderTasksKanban() {
  const el = document.getElementById('tasks-body');
  if (!el) return;
  const rows = visibleTasks(), subMap = buildSubtaskMap(tasks), c = taskScope;
  let boards;
  if (c.kind === 'project' || c.kind === 'list') boards = [{ project: c.project, heading: null, statuses: taskStatusesWithExtras(taskStatusesFor(c.project), rows), items: rows }];
  else {
    boards = taskProjects.map(p => { const items = rows.filter(x => x.project_id === p.id); return { project: p.id, heading: p, statuses: taskStatusesWithExtras(taskStatusesFor(p.id), items), items }; });
    const loose = rows.filter(x => !x.project_id || !taskProjects.some(p => p.id === x.project_id));
    if (loose.length || !taskProjects.length) boards.push({ project: 0, heading: { name: t('tk_no_project'), color: 'var(--border-strong)' }, statuses: taskStatusesWithExtras(DEFAULT_TASK_STATUSES, loose), items: loose });
    if (c.kind === 'mine' || tasksFilterActive()) boards = boards.filter(b => b.items.length);
  }
  el.innerHTML = `<div class="tk-boards">${boards.map(b => `${b.heading ? `<div class="tk-board-head"><i class="dot" style="background:${esc(b.heading.color)}"></i><b>${esc(b.heading.name)}</b><span class="muted">${esc(tasksPlural(b.items.length, 'one_task', 'n_tasks'))}</span></div>` : ''}${taskBoardHtml(b.statuses, b.items, b.project, subMap)}`).join('')}</div>`;
}
function taskBoardHtml(statuses, items, projectId, subMap = {}) {
  const total = items.length || 1;
  return `<div class="board tk-board" data-project="${projectId}">${statuses.map(st => {
    const col = sortTasks(items.filter(x => x.status === st.key)), late = col.filter(x => taskIsOverdue(x, taskIsDone(x))).length;
    return `<section class="col-board" data-status="${esc(st.key)}" data-project="${projectId}" aria-label="${esc(st.label)}" ondragover="taskDragOver(event)" ondragleave="taskDragLeave(event)" ondrop="taskDrop(event,'${esc(st.key)}',${projectId})"><div class="col-head"><i class="dot" style="background:${esc(st.color)}"></i><span class="nm">${esc(st.label)}</span><span class="cnt">${col.length}</span><button class="iconbtn" type="button" style="margin-left:auto;width:28px;height:28px" onclick="openTasksNew('${esc(st.key)}',${projectId})" aria-label="${esc(tf('tk_add_to', { name: st.label }))}">${icon('plus')}</button></div><div class="col-sum">${col.length ? (late ? esc(tf('tk_col_overdue', { n: late })) : esc(t('tk_col_nothing_overdue'))) : esc(t('tk_col_none'))}</div><div class="col-bar"><i style="width:${Math.round(col.length / total * 100)}%;background:${esc(st.color)}"></i></div><div class="col-cards">${col.map(x => taskKanbanCard(x, subMap)).join('') || `<div class="tk-colempty">${esc(t('tk_drop_here'))}</div>`}</div></section>`;
  }).join('')}</div>`;
}
function taskKanbanCard(x, subMap = {}) {
  const fin = taskIsDone(x), p = taskPrioMeta(x.priority), subs = subMap[x.id] || [], open = !collapsedTasks.has(x.id), due = x.due_date ? taskDueLabel(x) : '';
  const sn = subs.length || x.subtask_count || 0, sd = subs.length ? subs.filter(s => taskIsDone(s)).length : (x.subtask_done || 0);
  const dueCls = !x.due_date || fin ? '' : taskIsOverdue(x, fin) ? ' late' : taskDueOffset(x) === 0 ? ' today' : '';
  const sub = s => `<div class="dcard tk-card tk-subcard${taskIsDone(s) ? ' fin' : ''}" tabindex="0" role="button" data-id="${s.id}" onclick="openTaskDrawer(${s.id})" onkeydown="onTaskCardKey(event,${s.id})" aria-label="${esc(s.title)}"><div class="dcard-title">${esc(s.title)}</div><div class="dcard-foot">${taskPrioBadge(s.priority)}<span style="margin-left:auto">${s.assigned_to_name ? avatar(s.assigned_to_name, 'sm') : ''}</span></div></div>`;
  return `<div class="dcard tk-card${fin ? ' fin' : ''}" draggable="true" tabindex="0" role="button" data-id="${x.id}" ondragstart="taskDragStart(event,${x.id})" ondragend="taskDragEnd(event)" onclick="openTaskDrawer(${x.id})" onkeydown="onTaskCardKey(event,${x.id})" aria-label="${esc(x.title)}, ${esc(t('prio_' + p.id))}">${p.urg && !fin ? `<span class="urg urg-${p.urg}" title="${esc(t('prio_' + p.id))}"></span>` : ''}<button class="iconbtn kebab" type="button" onclick="event.stopPropagation();openTaskKebab(this,${x.id})" aria-label="${esc(tf('tk_actions_for', { name: x.title }))}" aria-haspopup="menu">${icon('ellipsis')}</button><div class="dcard-title" style="padding-right:22px">${esc(x.title)}</div><div class="dcard-meta">${icon('deals')}<span class="truncate">${x.deal_title ? esc(x.deal_title) : esc(t('tk_no_deal'))}</span></div><div class="dcard-foot">${taskPrioBadge(x.priority)}${sn ? `<button class="cmeta tk-subtoggle" type="button" aria-expanded="${open}" title="${esc(tf('tk_subs_done', { d: sd, n: sn }))}" onclick="event.stopPropagation();toggleKanbanSubtasks(${x.id})">${icon('check-square')}${sd}/${sn}</button>` : ''}${due ? `<span class="cmeta${dueCls}" title="${esc(t('tk_col_due'))}">${icon('calendar')}${esc(due)}</span>` : ''}<span style="margin-left:auto">${x.assigned_to_name ? avatar(x.assigned_to_name, 'sm') : ''}</span></div></div>${open && subs.length ? subs.map(sub).join('') : ''}`;
}
function toggleKanbanSubtasks(id) {
  if (collapsedTasks.has(id)) collapsedTasks.delete(id); else collapsedTasks.add(id);
  renderTasksBody();
}
function onTaskCardKey(e, id) { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTaskDrawer(id); } }
function taskDragStart(e, id) {
  dragTaskId = id; e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('dragging'), 0);
}
function taskDragEnd(e)   { e.target.classList.remove('dragging'); }
function taskDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function taskDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
// A card only drops within its own project's board: the columns are that project's statuses.
async function taskDrop(e, status, projectId) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  const id = dragTaskId; dragTaskId = null;
  if (!id) return;
  const x = tasks.find(q => q.id === id);
  if (!x || (x.project_id || 0) !== (projectId || 0)) return;
  await moveTaskTo(id, status);
}

/* ---------- actions ---------- */
function taskPutPayload(x) {
  const due = taskViewerDue(x);
  return { title: x.title, description: x.description || null, status: x.status, priority: x.priority, assigned_to: x.assigned_to || null, due_date: due.due_date, due_time: due.due_time, custom_data: x.custom_data || {}, project_id: x.project_id || null, list_id: x.list_id || null, deal_id: x.deal_id || null, contact_id: x.contact_id || null };
}
// Optimistic: apply, render, send; roll back on an error; Undo sends the old values the same way.
// A status-only patch uses PATCH /status; anything else is the full PUT (the only other endpoint).
async function patchTasks(ids, patch, label) {
  const rows = ids.map(id => tasks.find(x => x.id === id)).filter(Boolean);
  if (!rows.length) return false;
  const keys = Object.keys(patch), statusOnly = keys.length === 1 && keys[0] === 'status';
  // Anything that goes through PUT lands on the viewer's clock (see taskViewerDue); put the rows
  // there first, so the old values captured below describe the same instant the server will hold.
  if (!statusOnly) rows.forEach(x => Object.assign(x, taskViewerDue(x)));
  const prev = rows.map(x => ({ id: x.id, old: Object.fromEntries(keys.map(k => [k, x[k]])) }));
  const apply = (x, p) => { Object.assign(x, p); if ('assigned_to' in p) x.assigned_to_name = members.find(m => m.id === p.assigned_to)?.name || null; };
  const send = x => statusOnly ? api.patch(`/api/tasks/${x.id}/status`, { status: x.status }) : api.put(`/api/tasks/${x.id}`, taskPutPayload(x));
  const live = id => tasks.find(x => x.id === id);   // a reload may have replaced the array since
  rows.forEach(x => apply(x, patch)); renderTasks();
  const results = await Promise.all(rows.map(send));
  const bad = results.find(r => r && r.error);
  if (bad) { prev.forEach(p => { const x = live(p.id); if (x) apply(x, p.old); }); renderTasks(); ui.toast(bad.error); return false; }
  ui.toast(label, { action: { label: t('undo'), onClick: async () => {
    const back = prev.map(p => ({ x: live(p.id), old: p.old })).filter(p => p.x);
    back.forEach(p => apply(p.x, p.old)); renderTasks();
    const res = await Promise.all(back.map(p => send(p.x)));
    const err = res.find(r => r && r.error); if (err) { ui.toast(err.error); await reloadTasksData(); renderTasks(); }
  } } });
  return true;
}
async function toggleTaskDone(e, id) {
  if (e && e.stopPropagation) e.stopPropagation();
  const x = tasks.find(q => q.id === id);
  if (!x) return;
  const sts = taskStatusesOf(x), fin = taskIsDone(x);
  await patchTasks([id], { status: fin ? sts[0].key : sts.at(-1).key }, t(fin ? 'tk_reopened' : 'tk_completed'));
}
async function moveTaskTo(id, status) {
  const x = tasks.find(q => q.id === id);
  if (!x || x.status === status) return;
  const st = taskStatusesOf(x).find(s => s.key === status);
  await patchTasks([id], { status }, tf('tk_moved', { s: st ? st.label : status }));
}
async function deleteTasks(ids) {
  const rows = ids.map(id => tasks.find(x => x.id === id)).filter(Boolean);
  if (!rows.length) return false;
  const ok = await ui.confirm({ title: rows.length > 1 ? tf('tk_delete_tasks_q', { n: rows.length }) : t('tk_delete_task_q'), message: t('tk_delete_msg'), confirmLabel: t('btn_delete'), danger: true });
  if (!ok) return false;
  const results = await Promise.all(rows.map(x => api.del(`/api/tasks/${x.id}`)));
  const bad = results.find(r => r && r.error);
  if (bad) { ui.toast(bad.error); await reloadTasksData(); renderTasks(); return false; }
  const gone = new Set(rows.map(x => x.id));
  tasks = tasks.filter(x => !gone.has(x.id) && !gone.has(x.parent_id));
  rows.forEach(x => tasksUI.sel.delete(x.id));
  renderTasks();
  ui.toast(rows.length > 1 ? tf('tk_deleted_n', { n: rows.length }) : t('tk_deleted'));
  return true;
}
async function deleteTask(e, id) { if (e && e.stopPropagation) e.stopPropagation(); return deleteTasks([id]); }
function openTaskKebab(anchor, id) {
  const x = tasks.find(q => q.id === id);
  if (!x) return;
  const fin = taskIsDone(x);
  ui.menu(anchor, [
    { label: t('tk_open_task'), icon: 'external', onSelect: () => openTaskDrawer(id) },
    { label: t(fin ? 'tk_reopen_task' : 'tk_mark_complete'), icon: 'circle-check', onSelect: () => toggleTaskDone(null, id) },
    { heading: t('tk_move_to') }, ...taskStatusesOf(x).map(s => ({ label: s.label, checked: s.key === x.status, onSelect: () => moveTaskTo(id, s.key) })),
    { heading: t('tk_priority') }, ...TASK_PRIO.map(p => ({ label: t('prio_' + p.id), checked: p.id === x.priority, onSelect: () => patchTasks([id], { priority: p.id }, tf('tk_prio_single', { p: t('prio_' + p.id) })) })),
    { sep: true }, { label: t('tk_delete_task'), icon: 'trash', danger: true, onSelect: () => deleteTasks([id]) },
  ], { align: 'right' });
}
function openTasksNew(status, projectId) {
  const d = taskScopeDefaults(projectId);
  openTaskForm({ projectId: d.project_id, listId: d.list_id, status: status || undefined });
}

/* ---------- projects and lists ---------- */
function toggleProjectExpand(projectId) {
  const k = 'proj-collapsed-' + projectId;
  if (localStorage.getItem(k)) localStorage.removeItem(k); else localStorage.setItem(k, '1');
  renderTasksSidebar();
  document.querySelector(`#tasks-side [data-ptoggle="${projectId}"]`)?.focus();
}
function openProjectKebab(anchor, id) {
  ui.menu(anchor, [{ label: t('tk_rename_project'), icon: 'pencil', onSelect: () => openProjectModal(id) }, { label: t('tk_add_list'), icon: 'plus', onSelect: () => openListModal(id) },
    { sep: true }, { label: t('tk_delete_project'), icon: 'trash', danger: true, onSelect: () => deleteProject(id) }]);
}
function openListKebab(anchor, projectId, listId) {
  const l = (taskProjects.find(p => p.id === projectId)?.lists || []).find(q => q.id === listId);
  ui.menu(anchor, [{ label: t('tk_rename_list'), icon: 'pencil', onSelect: () => openListModal(projectId, listId, l ? l.name : '') },
    { sep: true }, { label: t('tk_delete_list'), icon: 'trash', danger: true, onSelect: () => deleteList(listId) }]);
}
let editingProjectId = null;
function openProjectModal(id) {
  editingProjectId = id || null;
  document.getElementById('project-modal-title').textContent = id ? t('tk_edit_project') : t('tk_new_project');
  const nameInput = document.getElementById('project-name-input');
  const colorInput = document.getElementById('project-color-input');
  const p = id ? taskProjects.find(q => q.id === id) : null;
  nameInput.value = p ? p.name : '';
  colorInput.value = p ? (p.color || '#3b82f6') : '#3b82f6';
  const errorEl = document.getElementById('project-error'); if (errorEl) errorEl.style.display = 'none';
  document.getElementById('project-modal').classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 50);
}
async function saveProject() {
  const name = document.getElementById('project-name-input').value.trim();
  const color = document.getElementById('project-color-input').value;
  const errorEl = document.getElementById('project-error');
  if (!name) return;
  const res = editingProjectId ? await api.put(`/api/task-projects/${editingProjectId}`, { name, color }) : await api.post('/api/task-projects', { name, color });
  if (res && res.error) { errorEl.textContent = res.error; errorEl.style.display = 'block'; return; }
  errorEl.style.display = 'none';
  closeModal('project-modal');
  const created = !editingProjectId && res && res.id ? res.id : null;
  await reloadTasksData();
  if (created) { localStorage.removeItem('proj-collapsed-' + created); setTaskScope('project', created); }
  else setTaskScope(taskScope.kind, taskScope.project, taskScope.list);
  ui.toast(created ? tf('tk_project_created', { name }) : t('tk_project_updated'));
}
async function deleteProject(id) {
  const p = taskProjects.find(q => q.id === id);
  if (!p) return;
  const n = tasks.filter(x => x.project_id === id && !x.parent_id).length;
  const ok = await ui.confirm({ title: t('tk_delete_project_q'), message: tf('tk_delete_project_msg', { name: p.name, lists: tasksPlural((p.lists || []).length, 'one_list', 'n_lists'), tasks: tasksPlural(n, 'one_task', 'n_tasks') }), confirmLabel: t('tk_delete_project'), danger: true });
  if (!ok) return;
  const res = await api.del(`/api/task-projects/${id}`);
  if (res && res.error) return ui.toast(res.error);
  await reloadTasksData();
  setTaskScope(taskScope.kind, taskScope.project, taskScope.list);   // falls back to All when the scope was inside the project
  ui.toast(tf('tk_project_deleted', { name: p.name }));
}
function openListModal(projectId, listId, currentName) {
  document.getElementById('list-project-id').value = projectId;
  document.getElementById('list-edit-id').value = listId || '';
  document.getElementById('list-modal-title').textContent = listId ? t('tk_rename_list') : t('tk_new_list');
  const input = document.getElementById('list-name-input');
  input.value = currentName || '';
  document.getElementById('list-modal').classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}
async function saveList() {
  const name = document.getElementById('list-name-input').value.trim();
  const projectId = parseInt(document.getElementById('list-project-id').value, 10);
  const listId = parseInt(document.getElementById('list-edit-id').value, 10) || null;
  if (!name) return;
  const res = listId ? await api.put(`/api/task-projects/lists/${listId}`, { name }) : await api.post(`/api/task-projects/${projectId}/lists`, { name });
  if (res && res.error) return ui.toast(res.error);
  closeModal('list-modal');
  await reloadTasksData();
  if (listId) { setTaskScope(taskScope.kind, taskScope.project, taskScope.list); ui.toast(t('tk_list_renamed')); }
  else { localStorage.removeItem('proj-collapsed-' + projectId); const created = res && res.id ? res.id : null; if (created) setTaskScope('list', projectId, created); else setTaskScope(taskScope.kind, taskScope.project, taskScope.list); ui.toast(tf('tk_list_created', { name })); }
}
async function deleteList(listId) {
  const p = taskProjects.find(q => (q.lists || []).some(l => l.id === listId)), l = p ? p.lists.find(q => q.id === listId) : null;
  if (!l) return;
  const n = tasks.filter(x => x.list_id === listId && !x.parent_id).length;
  const ok = await ui.confirm({ title: t('tk_delete_list_q'), message: tf('tk_delete_list_msg', { name: l.name, tasks: tasksPlural(n, 'one_task', 'n_tasks') }), confirmLabel: t('tk_delete_list'), danger: true });
  if (!ok) return;
  const res = await api.del(`/api/task-projects/lists/${listId}`);
  if (res && res.error) return ui.toast(res.error);
  await reloadTasksData();
  setTaskScope(taskScope.kind, taskScope.project, taskScope.list);
  ui.toast(tf('tk_list_deleted', { name: l.name }));
}

// A task's due date and time on the VIEWER's clock. The stored values are the
// wall-clock the entering member typed plus their zone (due_tz; a row without
// one is read as the default zone) — so another member in another zone sees it
// at the moment that was meant, not the same digits. All-day: date only.
function taskDueShown(t) {
  return toViewerClock(String(t?.due_date || '').slice(0, 10), String(t?.due_time || '').slice(0, 5) || null, t?.due_tz);
}
// A task's due moment, in the viewer's zone. A timed task is due at that time; a whole-day
// task at the end of its day, which is why one due today is not late until midnight. Built
// from date parts on purpose: new Date('2026-10-05') is UTC midnight, which called a task
// due today overdue from 08:00 local in this timezone.
function taskDueAt(t) {
  const s = taskDueShown(t);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.date);
  if (!m) return null;
  const hm = /^(\d{2}):(\d{2})$/.exec(s.time || '');
  return hm ? new Date(+m[1], +m[2] - 1, +m[3], +hm[1], +hm[2])
            : new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);
}
// `now` defaults to the user's picked clock (clock.js), the same one the calendar
// files a task under "Today" with — so the two can never disagree about lateness.
function taskIsOverdue(t, isDone, now = nowInTimezone(currentTimezone())) {
  const at = taskDueAt(t);
  return !!at && !isDone && at < now;
}
function taskDueLabel(t) {
  if (!t?.due_date) return '';
  const s = taskDueShown(t);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.date);
  // fmtDate gets a parts-built Date, never the 'YYYY-MM-DD' string: new Date('2026-10-07')
  // is UTC midnight and reads as the 6th anywhere west of UTC.
  return fmtDate(m ? new Date(+m[1], +m[2] - 1, +m[3]) : s.date) + (s.time ? ' · ' + s.time : '');
}
