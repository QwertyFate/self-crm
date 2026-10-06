/* ═══════════════════════════════════════════════════════════════════════════
   TASKS — projects → lists → tasks → subtasks, as a list or a kanban board.

   THE HIERARCHY, which the whole file assumes:
     task_project  (a project, e.g. "Onboarding")   ← has its own status columns
       └─ task_list   (a list inside it, e.g. "Q4") ← the unit the page shows
            └─ task         (parent_id = null)
                 └─ subtask (parent_id = the task)
   The page always shows ONE list. currentProjectId / currentListId / currentProject
   say which; selectList() switches, and the choice is remembered in
   localStorage('lastTaskListId').

   ENTRY POINT  loadTasks(), called by switchPage('tasks').
     loadTasks → GET /api/task-projects → renderProjectNav → selectList(...)
               → GET /api/tasks?list_id= → renderTasksCurrent()

   STATUSES ARE PER PROJECT, not global: getActiveTaskStatuses() returns the
   current project's statuses or DEFAULT_TASK_STATUSES. The LAST status in the
   list means "done" — that is why toggleTaskDone() and the card renderers use
   `.at(-1).key` instead of the string 'done'. Do not hardcode 'done'.

   DUE DATES — three shared helpers, used here and by detail-views.js:
     taskDueAt(t)      the task's due moment, built from LOCAL date parts.
                       A timed task is due at its time; a whole-day task at
                       23:59:59.999 of its day.
     taskIsOverdue()   late only once that moment has passed, never when done.
     taskDueLabel()    the formatted label, with "· HH:MM" when there is a time.
   ⚠ Never write `new Date(t.due_date) < new Date()`. new Date('2026-10-05') is
     UTC midnight, which marked tasks due today as overdue from 08:00 local.

   FUNCTION MAP
     load/nav     loadTasks, renderProjectNav, toggleProjectExpand, selectList,
                  selectListById, showTasksEmptyState
     projects     openProjectModal, saveProject, deleteProject
     lists        openListModal, saveList, deleteList
     view/filter  setTaskView, filterTasks, getFilteredTasks,
                  populateTaskAssigneeFilter, renderTasksCurrent
     list view    renderTasksList, taskListRow, buildSubtaskMap, toggleSubtasksRow
     kanban       renderTasksKanban, taskKanbanCard, toggleKanbanSubtasks
     drag & drop  taskDragStart, taskDragEnd, taskDragOver, taskDragLeave,
                  taskDrop  (drop = PATCH /api/tasks/:id/status)
     dates        taskDueShown, taskDueAt, taskIsOverdue, taskDueLabel
     actions      toggleTaskDone, deleteTask, getActiveTaskStatuses

   The task form and the task drawer are in detail-views.js (openTaskForm,
   openTaskDrawer).
   ⚠ deleteProject and deleteList still use the browser's own blocking prompt
     instead of ui.confirm(); the rest of the app uses ui.confirm().
   ═══════════════════════════════════════════════════════════════════════════ */

let tasks            = [];
let taskProjects     = [];
let currentProjectId = null;
let currentListId    = null;
let currentProject   = null;
let taskViewMode     = localStorage.getItem('taskViewMode') || 'list';
let dragTaskId       = null;
let collapsedTasks   = new Set();

const DEFAULT_TASK_STATUSES = [
  { key: 'todo',        label: 'Todo',        color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'in_review',   label: 'In Review',   color: '#f59e0b' },
  { key: 'done',        label: 'Done',        color: '#22c55e' },
];

const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };

function getActiveTaskStatuses() {
  const saved = currentProject?.statuses;
  return (Array.isArray(saved) && saved.length) ? saved : DEFAULT_TASK_STATUSES;
}

async function loadTasks() {
  const taskNav = document.getElementById('tasks-project-nav');
  if (taskNav) taskNav.innerHTML = '';
  const listView = document.getElementById('tasks-list-view');
  if (listView) listView.innerHTML = '';
  const kanbanView = document.getElementById('tasks-kanban-view');
  if (kanbanView) kanbanView.innerHTML = '';

  await ensureMembers();
  taskProjects = await api.get('/api/task-projects');
  renderProjectNav();
  populateTaskAssigneeFilter();

  const savedListId = parseInt(localStorage.getItem('lastTaskListId'));
  if (savedListId) {
    for (const p of taskProjects) {
      const list = (p.lists || []).find(l => l.id === savedListId);
      if (list) { selectList(p, list); return; }
    }
  }
  showTasksEmptyState();
}

function selectListById(projectId, listId) {
  const project = taskProjects.find(p => p.id === projectId);
  const list    = (project?.lists || []).find(l => l.id === listId);
  if (project && list) selectList(project, list);
}

function showTasksEmptyState() {
  document.getElementById('tasks-empty-state').classList.remove('hidden');
  document.getElementById('tasks-empty-state').style.display = '';
  const content = document.getElementById('tasks-content');
  content.classList.add('hidden');
  content.style.display = 'none';
}

async function selectList(project, list) {
  currentProjectId = project.id;
  currentListId    = list.id;
  currentProject   = project;
  localStorage.setItem('lastTaskListId', list.id);

  document.querySelectorAll('.tasks-list-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`list-item-${list.id}`)?.classList.add('active');

  document.getElementById('tasks-empty-state').style.display = 'none';
  const content = document.getElementById('tasks-content');
  content.classList.remove('hidden');
  content.style.display = 'flex';

  const bcEl = document.getElementById('tasks-breadcrumb');
  if (bcEl) bcEl.textContent = project.name;
  const titleEl = document.getElementById('tasks-main-title');
  if (titleEl) titleEl.textContent = list.name;

  tasks = await api.get(`/api/tasks?list_id=${list.id}`);
  setTaskView(taskViewMode, false);
}

function renderProjectNav() {
  const nav = document.getElementById('tasks-project-nav');
  if (!nav) return;
  if (!taskProjects.length) {
    nav.innerHTML = `<div style="padding:8px 8px;color:var(--muted);font-size:12px">No projects yet.</div>`;
    return;
  }

  nav.innerHTML = taskProjects.map(p => {
    const isOpen = !localStorage.getItem(`proj-collapsed-${p.id}`);
    return `
      <div class="tasks-proj-item" id="proj-item-${p.id}">
        <div class="tasks-proj-header" onclick="toggleProjectExpand(${p.id})">
          <span class="tasks-proj-chevron${isOpen ? ' open' : ''}">${icon('chevron-right', 'ic-sm')}</span>
          <span class="tasks-proj-dot" style="background:${esc(p.color)}"></span>
          <span class="tasks-proj-name">${esc(p.name)}</span>
          <span class="tasks-proj-actions" onclick="event.stopPropagation()">
            <button onclick="openProjectModal(${p.id})" title="Edit">${icon('pencil', 'ic-sm')}</button>
            <button onclick="deleteProject(${p.id})" title="Delete" style="color:var(--danger)">${icon('x', 'ic-sm')}</button>
          </span>
        </div>
        <div class="tasks-proj-lists" id="proj-lists-${p.id}" ${isOpen ? '' : 'style="display:none"'}>
          ${(p.lists || []).map(l => `
            <div class="tasks-list-item${currentListId === l.id ? ' active' : ''}"
              id="list-item-${l.id}"
              data-project-id="${p.id}"
              data-list-id="${l.id}"
              onclick="selectListById(${p.id}, ${l.id})">
              <span>${icon('list', 'ic-sm')}</span>
              <span class="tasks-list-item-name">${esc(l.name)}</span>
              <span class="tasks-list-actions" onclick="event.stopPropagation()">
                <button onclick="openListModal(${p.id},${l.id},'${esc(l.name).replace(/'/g,'&apos;')}')" title="Rename">${icon('pencil', 'ic-sm')}</button>
                <button onclick="deleteList(${l.id})" title="Delete" style="color:var(--danger)">${icon('x', 'ic-sm')}</button>
              </span>
            </div>`).join('')}
          <button class="tasks-add-list-btn" onclick="openListModal(${p.id})">${icon('plus', 'ic-sm')}Add list</button>
        </div>
      </div>`;
  }).join('');
}

function toggleProjectExpand(projectId) {
  const listsEl = document.getElementById(`proj-lists-${projectId}`);
  const chevron = document.querySelector(`#proj-item-${projectId} .tasks-proj-chevron`);
  if (!listsEl) return;
  const isHidden = listsEl.style.display === 'none';
  listsEl.style.display = isHidden ? '' : 'none';
  chevron?.classList.toggle('open', isHidden);
  if (isHidden) localStorage.removeItem(`proj-collapsed-${projectId}`);
  else localStorage.setItem(`proj-collapsed-${projectId}`, '1');
}

let editingProjectId = null;
function openProjectModal(id) {
  editingProjectId = id || null;
  document.getElementById('project-modal-title').textContent = id ? 'Edit Project' : 'New Project';
  const nameInput = document.getElementById('project-name-input');
  const colorInput = document.getElementById('project-color-input');
  if (id) {
    const p = taskProjects.find(p => p.id === id);
    nameInput.value  = p?.name  || '';
    colorInput.value = p?.color || '#3b82f6';
  } else {
    nameInput.value  = '';
    colorInput.value = '#3b82f6';
  }
  document.getElementById('project-modal').classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 50);
}

async function saveProject() {
  const name  = document.getElementById('project-name-input').value.trim();
  const color = document.getElementById('project-color-input').value;
  const errorEl = document.getElementById('project-error');

  if (!name) return;

  const res = editingProjectId
    ? await api.put(`/api/task-projects/${editingProjectId}`, { name, color })
    : await api.post('/api/task-projects', { name, color });

  if (res.error) {
    errorEl.textContent = res.error;
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';
  closeModal('project-modal');
  taskProjects = await api.get('/api/task-projects');
  if (editingProjectId && currentProjectId === editingProjectId) {
    currentProject = taskProjects.find(p => p.id === currentProjectId);
  }
  renderProjectNav();
}

async function deleteProject(id) {
  if (!confirm('Delete this project and all its lists and tasks?')) return;
  await api.del(`/api/task-projects/${id}`);
  if (currentProjectId === id) { currentProjectId = null; currentListId = null; currentProject = null; showTasksEmptyState(); }
  taskProjects = await api.get('/api/task-projects');
  renderProjectNav();
}

function openListModal(projectId, listId, currentName) {
  document.getElementById('list-project-id').value = projectId;
  document.getElementById('list-edit-id').value    = listId || '';
  document.getElementById('list-modal-title').textContent = listId ? 'Rename List' : 'New List';
  const input = document.getElementById('list-name-input');
  input.value = currentName || '';
  document.getElementById('list-modal').classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

async function saveList() {
  const name      = document.getElementById('list-name-input').value.trim();
  const projectId = document.getElementById('list-project-id').value;
  const listId    = document.getElementById('list-edit-id').value;
  if (!name) return;
  if (listId) {
    await api.put(`/api/task-projects/lists/${listId}`, { name });
  } else {
    await api.post(`/api/task-projects/${projectId}/lists`, { name });
  }
  closeModal('list-modal');
  taskProjects = await api.get('/api/task-projects');
  renderProjectNav();
  if (listId && parseInt(listId) === currentListId) {
    const titleEl = document.getElementById('tasks-main-title');
    if (titleEl) titleEl.textContent = name;
  }
}

async function deleteList(listId) {
  if (!confirm('Delete this list and all its tasks?')) return;
  await api.del(`/api/task-projects/lists/${listId}`);
  if (currentListId === listId) { currentListId = null; currentProject = null; showTasksEmptyState(); }
  taskProjects = await api.get('/api/task-projects');
  renderProjectNav();
}

function populateTaskAssigneeFilter() {
  const sel = document.getElementById('task-filter-assignee');
  if (!sel) return;
  sel.innerHTML = `<option value="">All assignees</option>` +
    members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
}

function setTaskView(mode, save = true) {
  taskViewMode = mode;
  if (save) localStorage.setItem('taskViewMode', mode);
  document.getElementById('task-view-list')?.setAttribute('aria-pressed', String(mode === 'list'));
  document.getElementById('task-view-kanban')?.setAttribute('aria-pressed', String(mode === 'kanban'));
  document.getElementById('tasks-list-view')?.classList.toggle('hidden',  mode === 'kanban');
  document.getElementById('tasks-kanban-view')?.classList.toggle('hidden', mode === 'list');
  renderTasksCurrent();
}

function filterTasks() {
  renderTasksCurrent();
}

function getFilteredTasks() {
  const q        = document.getElementById('task-search')?.value.toLowerCase() || '';
  const priority = document.getElementById('task-filter-priority')?.value || '';
  const assignee = document.getElementById('task-filter-assignee')?.value || '';
  return tasks.filter(t => {
    const matchQ = !q || t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q);
    const matchP = !priority || t.priority === priority;
    const matchA = !assignee || String(t.assigned_to) === assignee;
    return matchQ && matchP && matchA;
  });
}

function renderTasksCurrent() {
  if (taskViewMode === 'kanban') renderTasksKanban(getFilteredTasks());
  else renderTasksList(getFilteredTasks());
}

function renderTasksList(list) {
  const el = document.getElementById('tasks-list-view');
  if (!el) return;
  const parents  = list.filter(t => !t.parent_id);
  const subMap   = buildSubtaskMap(list);
  if (!parents.length) {
    el.innerHTML = `<div style="color:var(--muted);padding:30px;text-align:center;font-size:14px">No tasks yet. Click + Add Task to get started.</div>`;
    return;
  }
  el.innerHTML = parents.map(t => taskListRow(t, false, subMap)).join('');
}

function buildSubtaskMap(list) {
  const map = {};
  list.filter(t => t.parent_id).forEach(s => {
    if (!map[s.parent_id]) map[s.parent_id] = [];
    map[s.parent_id].push(s);
  });
  return map;
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

function taskListRow(t, isSubtask = false, subMap = {}) {
  const isDone     = t.status === (getActiveTaskStatuses().at(-1)?.key || 'done');
  const dueStr     = taskDueLabel(t);
  const isOverdue  = taskIsOverdue(t, isDone);
  const subtasks   = subMap[t.id] || [];
  const hasSubtasks = t.subtask_count > 0 || subtasks.length > 0;

  const subRows = subtasks.map(s => taskListRow(s, true, subMap)).join('');

  return `
    <div class="task-row${isDone ? ' done-row' : ''}${isSubtask ? ' subtask-row' : ''}" id="task-row-${t.id}">
      ${!isSubtask ? `<button class="task-expand-btn${hasSubtasks ? '' : ''}" id="expand-${t.id}"
        onclick="toggleSubtasksRow(event,${t.id})" ${!hasSubtasks ? 'style="visibility:hidden"' : ''}>${icon('chevron-right', 'ic-sm')}</button>`
        : '<span style="width:18px;flex-shrink:0"></span>'}
      <div class="task-check${isDone ? ' done' : ''}" onclick="toggleTaskDone(event,${t.id},${isDone})">${isDone ? icon('check', 'ic-sm') : ''}</div>
      <div class="task-title${isDone ? ' done' : ''}" onclick="openTaskModal(${t.id})">${esc(t.title)}</div>
      <div class="task-meta">
        ${hasSubtasks && !isSubtask ? `<span class="task-subtask-count">${icon('check-square', 'ic-sm')} ${t.subtask_done||0}/${t.subtask_count}</span>` : ''}
        <span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
        ${t.assigned_to_name ? `<span class="task-assignee-chip">${esc(t.assigned_to_name)}</span>` : ''}
        ${dueStr ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${isOverdue ? icon('alert', 'ic-sm') + ' ' : ''}${dueStr}</span>` : ''}
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteTask(event,${t.id})" title="Delete">${icon('x', 'ic-sm')}</button>
      </div>
    </div>
    <div class="subtask-rows hidden" id="subtasks-of-${t.id}">${subRows}</div>`;
}

function toggleSubtasksRow(e, taskId) {
  e.stopPropagation();
  const btn       = document.getElementById(`expand-${taskId}`);
  const container = document.getElementById(`subtasks-of-${taskId}`);
  if (!btn || !container) return;
  const isOpen = btn.classList.contains('open');
  btn.classList.toggle('open', !isOpen);
  container.classList.toggle('hidden', isOpen);
}

function renderTasksKanban(list) {
  const el = document.getElementById('tasks-kanban-view');
  if (!el) return;
  const statuses = getActiveTaskStatuses();
  const parents  = list.filter(t => !t.parent_id);
  const subMap   = buildSubtaskMap(list);

  el.innerHTML = statuses.map(st => {
    const colTasks = parents.filter(t => t.status === st.key);
    const cards = colTasks.map(t => taskKanbanCard(t, subMap, st.key)).join('');
    return `
      <div class="task-col">
        <div class="task-col-header">
          <span class="task-col-dot" style="background:${st.color}"></span>
          ${esc(st.label)}
          <span class="task-col-count">${colTasks.length}</span>
        </div>
        <div class="task-col-cards"
          ondragover="taskDragOver(event)" ondragleave="taskDragLeave(event)"
          ondrop="taskDrop(event,'${st.key}')">
          ${cards || `<div style="color:var(--muted);font-size:12px;padding:8px 4px">No tasks</div>`}
        </div>
      </div>`;
  }).join('');
}

function taskKanbanCard(t, subMap = {}, colStatus) {
  const isDone      = t.status === (getActiveTaskStatuses().at(-1)?.key || 'done');
  const dueStr      = taskDueLabel(t);
  const isOverdue   = taskIsOverdue(t, isDone);
  const subtasks    = subMap[t.id] || [];
  const hasSubtasks = subtasks.length > 0 || t.subtask_count > 0;
  const isCollapsed = collapsedTasks.has(t.id);

  const subtaskCards = !isCollapsed && subtasks.length
    ? subtasks.map(s => `
        <div class="task-card subtask-card${s.status === (getActiveTaskStatuses().at(-1)?.key||'done') ? ' done-row' : ''}"
          onclick="openTaskModal(${s.id})">
          <div class="task-card-title${s.status === (getActiveTaskStatuses().at(-1)?.key||'done') ? ' done' : ''}">${esc(s.title)}</div>
          <div class="task-card-meta">
            <span class="priority-badge priority-${s.priority}">${PRIORITY_LABELS[s.priority]}</span>
            ${s.assigned_to_name ? `<span class="task-assignee-chip">${esc(s.assigned_to_name)}</span>` : ''}
          </div>
        </div>`).join('')
    : '';

  return `
    <div class="task-card${isDone ? ' done-row' : ''}" draggable="true" data-id="${t.id}"
      ondragstart="taskDragStart(event,${t.id})" ondragend="taskDragEnd(event)"
      onclick="openTaskModal(${t.id})">
      <div style="display:flex;align-items:flex-start;gap:4px">
        ${hasSubtasks ? `<button class="task-subtask-toggle${isCollapsed ? '' : ' open'}"
          onclick="event.stopPropagation();toggleKanbanSubtasks(${t.id})"
          title="${isCollapsed ? 'Expand' : 'Collapse'} subtasks">${icon('chevron-right', 'ic-sm')}</button>` : ''}
        <div class="task-card-title${isDone ? ' done' : ''}" style="flex:1">${esc(t.title)}</div>
      </div>
      <div class="task-card-meta">
        <span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
        ${subtasks.length ? `<span class="task-card-sub">${icon('check-square', 'ic-sm')} ${subtasks.filter(s=>s.status===(getActiveTaskStatuses().at(-1)?.key||'done')).length}/${subtasks.length}</span>` : ''}
        ${t.assigned_to_name ? `<span class="task-assignee-chip">${esc(t.assigned_to_name)}</span>` : ''}
        ${dueStr ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${isOverdue ? icon('alert', 'ic-sm') + ' ' : ''}${dueStr}</span>` : ''}
      </div>
    </div>
    ${subtaskCards}`;
}

function toggleKanbanSubtasks(taskId) {
  if (collapsedTasks.has(taskId)) collapsedTasks.delete(taskId);
  else collapsedTasks.add(taskId);
  renderTasksCurrent();
}

function taskDragStart(e, id) {
  dragTaskId = id; e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('dragging'), 0);
}
function taskDragEnd(e)   { e.target.classList.remove('dragging'); }
function taskDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function taskDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function taskDrop(e, status) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if (!dragTaskId) return;
  const t = tasks.find(t => t.id === dragTaskId);
  if (!t || t.status === status) { dragTaskId = null; return; }
  t.status = status;
  renderTasksCurrent();
  await api.patch(`/api/tasks/${dragTaskId}/status`, { status });
  dragTaskId = null;
}

async function toggleTaskDone(e, taskId, isDone) {
  e.stopPropagation();
  const statuses  = getActiveTaskStatuses();
  const doneKey   = statuses.at(-1)?.key || 'done';
  const firstKey  = statuses[0]?.key || 'todo';
  const newStatus = isDone ? firstKey : doneKey;
  await api.patch(`/api/tasks/${taskId}/status`, { status: newStatus });
  const t = tasks.find(t => t.id === taskId);
  if (t) t.status = newStatus;
  renderTasksCurrent();
}

async function deleteTask(e, taskId) {
  e.stopPropagation();
  const ok = await ui.confirm({ title: 'Delete this task?', message: 'Its subtasks are deleted with it. This cannot be undone.', confirmLabel: 'Delete task', danger: true });
  if (!ok) return;
  await api.del(`/api/tasks/${taskId}`);
  tasks = tasks.filter(t => t.id !== taskId && t.parent_id !== taskId);
  renderTasksCurrent();
}
