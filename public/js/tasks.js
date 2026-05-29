// ── TASKS ──────────────────────────────────────────────────
let tasks            = [];
let taskProjects     = [];
let currentProjectId = null;
let currentListId    = null;
let currentProject   = null;
let taskViewMode     = localStorage.getItem('taskViewMode') || 'list';
let dragTaskId       = null;
let collapsedTasks   = new Set(); // task IDs whose subtasks are collapsed in kanban

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

// ── Load ──────────────────────────────────────────────────
async function loadTasks() {
  await ensureMembers();
  taskProjects = await api.get('/api/task-projects');
  renderProjectNav();
  populateTaskAssigneeFilter();

  // Restore last selected list
  const savedListId = parseInt(localStorage.getItem('lastTaskListId'));
  if (savedListId) {
    for (const p of taskProjects) {
      const list = (p.lists || []).find(l => l.id === savedListId);
      if (list) { selectList(p, list); return; }
    }
  }
  showTasksEmptyState();
}

// Select a list by IDs (used by sidebar onclick — avoids JSON in HTML)
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

  // Update sidebar active state
  document.querySelectorAll('.tasks-list-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`list-item-${list.id}`)?.classList.add('active');

  // Show main content, hide empty state
  document.getElementById('tasks-empty-state').style.display = 'none';
  const content = document.getElementById('tasks-content');
  content.classList.remove('hidden');
  content.style.display = 'flex';

  // Update header
  document.getElementById('tasks-breadcrumb').textContent = project.name;
  document.getElementById('tasks-main-title').textContent = list.name;

  // Load tasks for this list
  tasks = await api.get(`/api/tasks?list_id=${list.id}`);
  setTaskView(taskViewMode, false);
}

// ── Sidebar nav ───────────────────────────────────────────
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
          <span class="tasks-proj-chevron${isOpen ? ' open' : ''}">▶</span>
          <span class="tasks-proj-dot" style="background:${esc(p.color)}"></span>
          <span class="tasks-proj-name">${esc(p.name)}</span>
          <span class="tasks-proj-actions" onclick="event.stopPropagation()">
            <button onclick="openProjectModal(${p.id})" title="Edit">✏️</button>
            <button onclick="deleteProject(${p.id})" title="Delete" style="color:var(--danger)">✕</button>
          </span>
        </div>
        <div class="tasks-proj-lists" id="proj-lists-${p.id}" ${isOpen ? '' : 'style="display:none"'}>
          ${(p.lists || []).map(l => `
            <div class="tasks-list-item${currentListId === l.id ? ' active' : ''}"
              id="list-item-${l.id}"
              data-project-id="${p.id}"
              data-list-id="${l.id}"
              onclick="selectListById(${p.id}, ${l.id})">
              <span>📋</span>
              <span class="tasks-list-item-name">${esc(l.name)}</span>
              <span class="tasks-list-actions" onclick="event.stopPropagation()">
                <button onclick="openListModal(${p.id},${l.id},'${esc(l.name).replace(/'/g,'&apos;')}')" title="Rename">✏️</button>
                <button onclick="deleteList(${l.id})" title="Delete" style="color:var(--danger)">✕</button>
              </span>
            </div>`).join('')}
          <button class="tasks-add-list-btn" onclick="openListModal(${p.id})">+ Add list</button>
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

// ── Project CRUD ──────────────────────────────────────────
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
  if (!name) return;
  if (editingProjectId) {
    await api.put(`/api/task-projects/${editingProjectId}`, { name, color });
  } else {
    await api.post('/api/task-projects', { name, color });
  }
  closeModal('project-modal');
  taskProjects = await api.get('/api/task-projects');
  // Refresh currentProject if it was updated
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

// ── List CRUD ─────────────────────────────────────────────
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
  // If we renamed the current list, update the header
  if (listId && parseInt(listId) === currentListId) {
    document.getElementById('tasks-main-title').textContent = name;
  }
}

async function deleteList(listId) {
  if (!confirm('Delete this list and all its tasks?')) return;
  await api.del(`/api/task-projects/lists/${listId}`);
  if (currentListId === listId) { currentListId = null; currentProject = null; showTasksEmptyState(); }
  taskProjects = await api.get('/api/task-projects');
  renderProjectNav();
}

// ── View toggle ───────────────────────────────────────────
function populateTaskAssigneeFilter() {
  const sel = document.getElementById('task-filter-assignee');
  if (!sel) return;
  sel.innerHTML = `<option value="">All assignees</option>` +
    members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
}

function setTaskView(mode, save = true) {
  taskViewMode = mode;
  if (save) localStorage.setItem('taskViewMode', mode);
  document.getElementById('task-view-list')?.classList.toggle('active',   mode === 'list');
  document.getElementById('task-view-kanban')?.classList.toggle('active', mode === 'kanban');
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

// ── LIST VIEW ─────────────────────────────────────────────
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

function taskListRow(t, isSubtask = false, subMap = {}) {
  const isDone     = t.status === (getActiveTaskStatuses().at(-1)?.key || 'done');
  const dueStr     = t.due_date ? fmtDate(t.due_date) : '';
  const isOverdue  = t.due_date && !isDone && new Date(t.due_date) < new Date();
  const subtasks   = subMap[t.id] || [];
  const hasSubtasks = t.subtask_count > 0 || subtasks.length > 0;

  const subRows = subtasks.map(s => taskListRow(s, true, subMap)).join('');

  return `
    <div class="task-row${isDone ? ' done-row' : ''}${isSubtask ? ' subtask-row' : ''}" id="task-row-${t.id}">
      ${!isSubtask ? `<button class="task-expand-btn${hasSubtasks ? '' : ''}" id="expand-${t.id}"
        onclick="toggleSubtasksRow(event,${t.id})" ${!hasSubtasks ? 'style="visibility:hidden"' : ''}>▶</button>`
        : '<span style="width:18px;flex-shrink:0"></span>'}
      <div class="task-check${isDone ? ' done' : ''}" onclick="toggleTaskDone(event,${t.id},${isDone})">${isDone ? '✓' : ''}</div>
      <div class="task-title${isDone ? ' done' : ''}" onclick="openTaskModal(${t.id})">${esc(t.title)}</div>
      <div class="task-meta">
        ${hasSubtasks && !isSubtask ? `<span class="task-subtask-count">⊞ ${t.subtask_done||0}/${t.subtask_count}</span>` : ''}
        <span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
        ${t.assigned_to_name ? `<span class="task-assignee-chip">${esc(t.assigned_to_name)}</span>` : ''}
        ${dueStr ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${isOverdue ? '⚠ ' : ''}${dueStr}</span>` : ''}
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteTask(event,${t.id})" title="Delete">✕</button>
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

// ── KANBAN VIEW ───────────────────────────────────────────
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
  const dueStr      = t.due_date ? fmtDate(t.due_date) : '';
  const isOverdue   = t.due_date && !isDone && new Date(t.due_date) < new Date();
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
          title="${isCollapsed ? 'Expand' : 'Collapse'} subtasks">▶</button>` : ''}
        <div class="task-card-title${isDone ? ' done' : ''}" style="flex:1">${esc(t.title)}</div>
      </div>
      <div class="task-card-meta">
        <span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
        ${subtasks.length ? `<span class="task-card-sub">⊞ ${subtasks.filter(s=>s.status===(getActiveTaskStatuses().at(-1)?.key||'done')).length}/${subtasks.length}</span>` : ''}
        ${t.assigned_to_name ? `<span class="task-assignee-chip">${esc(t.assigned_to_name)}</span>` : ''}
        ${dueStr ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${isOverdue ? '⚠ ' : ''}${dueStr}</span>` : ''}
      </div>
    </div>
    ${subtaskCards}`;
}

function toggleKanbanSubtasks(taskId) {
  if (collapsedTasks.has(taskId)) collapsedTasks.delete(taskId);
  else collapsedTasks.add(taskId);
  renderTasksCurrent();
}

// ── Drag & drop ───────────────────────────────────────────
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

// ── Task done toggle ──────────────────────────────────────
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
  if (!confirm('Delete this task and all its subtasks?')) return;
  await api.del(`/api/tasks/${taskId}`);
  tasks = tasks.filter(t => t.id !== taskId && t.parent_id !== taskId);
  renderTasksCurrent();
}

// ── Task modal ────────────────────────────────────────────
let currentTaskId = null;

function renderTaskFieldInput(f, value = '') {
  const id = `tfield-${f.field_key}`;
  if (f.type === 'dropdown') return `<select id="${id}">
    <option value="">— Select —</option>
    ${(f.options||[]).map(o => `<option value="${esc(o)}"${value===o?' selected':''}>${esc(o)}</option>`).join('')}
  </select>`;
  const typeMap = { text:'text', email:'email', phone:'tel', number:'number', date:'date', url:'url' };
  return `<input type="${typeMap[f.type]||'text'}" id="${id}" value="${esc(value)}" />`;
}

async function openTaskModal(id) {
  await ensureMembers();
  // Ensure task fields are loaded
  if (!taskFields.length) taskFields = await api.get('/api/task-fields');

  document.getElementById('task-form').reset();
  document.getElementById('task-id').value        = id || '';
  document.getElementById('task-parent-id').value = '';
  document.getElementById('task-modal-title').textContent = id ? 'Edit Task' : 'Add Task';
  document.getElementById('task-delete-btn').style.display = id ? '' : 'none';

  const statuses = getActiveTaskStatuses();
  document.getElementById('task-status').innerHTML =
    statuses.map(s => `<option value="${s.key}">${esc(s.label)}</option>`).join('');

  document.getElementById('task-assignee').innerHTML =
    `<option value="">— Unassigned —</option>` +
    members.map(m => `<option value="${m.id}"${m.id === currentUser?.id && !id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');

  const subCol = document.getElementById('task-subtasks-col');

  if (id) {
    currentTaskId = id;
    const t = await api.get(`/api/tasks/${id}`);
    document.getElementById('task-title').value       = t.title;
    document.getElementById('task-description').value = t.description || '';
    document.getElementById('task-status').value      = t.status;
    document.getElementById('task-priority').value    = t.priority;
    document.getElementById('task-assignee').value    = t.assigned_to || '';
    document.getElementById('task-due-date').value    = t.due_date ? t.due_date.slice(0,10) : '';

    // Render custom fields with saved values
    document.getElementById('task-custom-fields').innerHTML = taskFields.map(f =>
      `<div class="form-group"><label>${esc(f.name)}</label>${renderTaskFieldInput(f, t.custom_data?.[f.field_key] ?? '')}</div>`
    ).join('');

    subCol.style.display = '';
    renderSubtasksList(t.subtasks || [], id);
    loadTaskAttachments(id);
  } else {
    currentTaskId = null;
    document.getElementById('task-status').value = statuses[0]?.key || 'todo';

    // Render custom fields empty
    document.getElementById('task-custom-fields').innerHTML = taskFields.map(f =>
      `<div class="form-group"><label>${esc(f.name)}</label>${renderTaskFieldInput(f, '')}</div>`
    ).join('');

    subCol.style.display = 'none';
  }

  document.getElementById('task-modal').classList.remove('hidden');
}

function renderSubtasksList(subtasks, parentId) {
  const el = document.getElementById('task-subtasks-list');
  if (!el) return;
  el.innerHTML = subtasks.map(s => `
    <div class="subtask-item" id="subtask-item-${s.id}">
      <input type="checkbox" ${s.status === (getActiveTaskStatuses().at(-1)?.key||'done') ? 'checked' : ''}
        onchange="toggleSubtaskDone(${s.id}, this.checked, ${parentId})" />
      <span class="subtask-item-title${s.status === (getActiveTaskStatuses().at(-1)?.key||'done') ? ' done' : ''}">${esc(s.title)}</span>
      <button type="button" class="btn btn-sm btn-danger btn-icon" style="padding:1px 5px"
        onclick="deleteSubtask(${s.id}, ${parentId})">✕</button>
    </div>`).join('') || `<p style="color:var(--muted);font-size:12px">No subtasks yet.</p>`;
}

async function addSubtask() {
  const input = document.getElementById('new-subtask-input');
  const title = input?.value.trim();
  if (!title || !currentTaskId) return;
  const statuses = getActiveTaskStatuses();
  await api.post('/api/tasks', {
    title, parent_id: currentTaskId,
    project_id: currentProjectId, list_id: currentListId,
    status: statuses[0]?.key || 'todo', priority: 'medium',
  });
  input.value = '';
  const fresh = await api.get(`/api/tasks/${currentTaskId}`);
  renderSubtasksList(fresh.subtasks || [], currentTaskId);
  const t = tasks.find(t => t.id === currentTaskId);
  if (t) t.subtask_count = fresh.subtasks.length;
}

async function toggleSubtaskDone(subtaskId, done, parentId) {
  const statuses = getActiveTaskStatuses();
  const doneKey  = statuses.at(-1)?.key || 'done';
  const firstKey = statuses[0]?.key     || 'todo';
  await api.patch(`/api/tasks/${subtaskId}/status`, { status: done ? doneKey : firstKey });
  const el = document.querySelector(`#subtask-item-${subtaskId} .subtask-item-title`);
  if (el) el.classList.toggle('done', done);
  const fresh = await api.get(`/api/tasks/${parentId}`);
  const parent = tasks.find(t => t.id === parentId);
  if (parent) parent.subtask_done = fresh.subtasks.filter(s => s.status === doneKey).length;
  renderTasksCurrent();
}

async function deleteSubtask(subtaskId, parentId) {
  if (!confirm('Delete this subtask?')) return;
  await api.del(`/api/tasks/${subtaskId}`);
  const fresh = await api.get(`/api/tasks/${parentId}`);
  renderSubtasksList(fresh.subtasks || [], parentId);
  const parent = tasks.find(t => t.id === parentId);
  if (parent) {
    const doneKey = getActiveTaskStatuses().at(-1)?.key || 'done';
    parent.subtask_count = fresh.subtasks.length;
    parent.subtask_done  = fresh.subtasks.filter(s => s.status === doneKey).length;
  }
  renderTasksCurrent();
}

async function saveTask(e) {
  e.preventDefault();
  const id = document.getElementById('task-id').value;
  const custom_data = Object.fromEntries(
    taskFields.map(f => [f.field_key, document.getElementById(`tfield-${f.field_key}`)?.value || ''])
  );
  const payload = {
    title:       document.getElementById('task-title').value,
    description: document.getElementById('task-description').value,
    status:      document.getElementById('task-status').value,
    priority:    document.getElementById('task-priority').value,
    assigned_to: document.getElementById('task-assignee').value || null,
    due_date:    document.getElementById('task-due-date').value || null,
    project_id:  currentProjectId,
    list_id:     currentListId,
    custom_data,
  };
  if (id) await api.put(`/api/tasks/${id}`, payload);
  else    await api.post('/api/tasks', payload);
  closeModal('task-modal');
  if (currentListId) {
    tasks = await api.get(`/api/tasks?list_id=${currentListId}`);
    renderTasksCurrent();
  }
}

async function deleteTaskFromModal() {
  const id = document.getElementById('task-id').value;
  if (!id || !confirm('Delete this task and all its subtasks?')) return;
  await api.del(`/api/tasks/${id}`);
  closeModal('task-modal');
  tasks = tasks.filter(t => t.id !== Number(id) && t.parent_id !== Number(id));
  renderTasksCurrent();
}

// ── TASK ATTACHMENTS ──────────────────────────────────────
const VIEWABLE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'text/plain', 'text/csv',
];
const IMAGE_TYPES = ['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'];

function fileIcon(type) {
  if (IMAGE_TYPES.includes(type))      return '🖼';
  if (type === 'application/pdf')      return '📄';
  if (type.includes('word'))           return '📝';
  if (type.includes('sheet') || type.includes('excel')) return '📊';
  if (type.includes('presentation') || type.includes('powerpoint')) return '📑';
  if (type.includes('text'))           return '📃';
  return '📎';
}

function fmtSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function loadTaskAttachments(taskId) {
  const listEl  = document.getElementById('task-attachments-list');
  const viewEl  = document.getElementById('task-file-viewer');
  const errEl   = document.getElementById('task-attach-error');
  if (!listEl) return;
  errEl?.classList.add('hidden');
  viewEl?.classList.add('hidden');

  try {
    const attachments = await api.get(`/api/tasks/${taskId}/attachments`);
    renderAttachmentList(attachments, taskId);
  } catch {
    if (listEl) listEl.innerHTML = '';
  }
}

function renderAttachmentList(attachments, taskId) {
  const el = document.getElementById('task-attachments-list');
  if (!el) return;
  if (!attachments.length) { el.innerHTML = ''; return; }
  el.innerHTML = attachments.map(a => `
    <div class="task-attach-item" id="attach-${a.id}">
      <span class="task-attach-icon">${fileIcon(a.file_type)}</span>
      <span class="task-attach-name" title="${esc(a.file_name)}">${esc(a.file_name)}</span>
      <span class="task-attach-size">${fmtSize(a.file_size)}</span>
      <div class="task-attach-actions">
        ${(VIEWABLE_TYPES.includes(a.file_type) || IMAGE_TYPES.includes(a.file_type))
          ? `<button type="button" class="btn btn-sm btn-ghost" onclick="viewAttachment('${esc(a.file_url)}','${esc(a.file_type)}','${esc(a.file_name)}')">View</button>`
          : ''}
        <a href="${esc(a.file_url)}" download="${esc(a.file_name)}" class="btn btn-sm btn-ghost" target="_blank">↓</a>
        <button type="button" class="btn btn-sm btn-danger btn-icon" onclick="deleteAttachment(${taskId},${a.id})">✕</button>
      </div>
    </div>`).join('');
}

function viewAttachment(url, type, name) {
  const viewEl = document.getElementById('task-file-viewer');
  if (!viewEl) return;

  let content;
  if (IMAGE_TYPES.includes(type)) {
    content = `<img src="${esc(url)}" alt="${esc(name)}" />`;
  } else {
    const encoded = encodeURIComponent(url);
    content = `<iframe src="https://docs.google.com/viewer?url=${encoded}&embedded=true" loading="lazy"></iframe>`;
  }

  viewEl.innerHTML = `
    <div class="task-viewer-bar">
      <span>${esc(name)}</span>
      <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('task-file-viewer').classList.add('hidden')">✕ Close</button>
    </div>
    ${content}`;
  viewEl.classList.remove('hidden');
  viewEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function deleteAttachment(taskId, attachmentId) {
  if (!confirm('Delete this attachment?')) return;
  const res = await api.del(`/api/tasks/${taskId}/attachments/${attachmentId}`);
  if (res.error) { alert(res.error); return; }
  document.getElementById(`attach-${attachmentId}`)?.remove();
}

// Drag-and-drop
function taskAttachDragOver(e) { e.preventDefault(); document.getElementById('task-drop-zone')?.classList.add('drag-over'); }
function taskAttachDragLeave(e) { document.getElementById('task-drop-zone')?.classList.remove('drag-over'); }
function taskAttachDrop(e) {
  e.preventDefault();
  document.getElementById('task-drop-zone')?.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) uploadAttachments(files);
}
function taskAttachFileChange(e) {
  const files = Array.from(e.target.files);
  if (files.length) uploadAttachments(files);
  e.target.value = ''; // reset so same file can be re-selected
}

async function uploadAttachments(files) {
  const taskId = document.getElementById('task-id').value;
  if (!taskId) { alert('Save the task first before adding attachments.'); return; }

  const errEl  = document.getElementById('task-attach-error');
  const dropEl = document.getElementById('task-drop-zone');
  errEl?.classList.add('hidden');

  const MAX = 10 * 1024 * 1024;
  const oversized = files.filter(f => f.size > MAX);
  if (oversized.length) {
    if (errEl) { errEl.textContent = `File too large: ${oversized.map(f=>f.name).join(', ')} (max 10 MB)`; errEl.classList.remove('hidden'); }
    return;
  }

  if (dropEl) { dropEl.style.opacity = '.5'; dropEl.style.pointerEvents = 'none'; }

  const uploaded = [];
  for (const file of files) {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: form });
      const json = await res.json();
      if (json.error) { if (errEl) { errEl.textContent = json.error; errEl.classList.remove('hidden'); } }
      else uploaded.push(json);
    } catch {
      if (errEl) { errEl.textContent = 'Upload failed. Check your Supabase Storage configuration.'; errEl.classList.remove('hidden'); }
    }
  }

  if (dropEl) { dropEl.style.opacity = ''; dropEl.style.pointerEvents = ''; }
  if (uploaded.length) await loadTaskAttachments(taskId);
}
