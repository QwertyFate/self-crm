// ── TASKS ──────────────────────────────────────────────────
let tasks        = [];
let taskViewMode = localStorage.getItem('taskViewMode') || 'list';
let dragTaskId   = null;

const DEFAULT_TASK_STATUSES = [
  { key: 'todo',        label: 'Todo',        color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'in_review',   label: 'In Review',   color: '#f59e0b' },
  { key: 'done',        label: 'Done',        color: '#22c55e' },
];

function getActiveTaskStatuses() {
  const saved = currentWorkspace?.task_statuses;
  return (Array.isArray(saved) && saved.length) ? saved : DEFAULT_TASK_STATUSES;
}

const PRIORITY_LABELS = { urgent:'Urgent', high:'High', medium:'Medium', low:'Low' };

async function loadTasks() {
  await ensureMembers();
  tasks = await api.get('/api/tasks');
  populateTaskAssigneeFilter();
  setTaskView(taskViewMode, false);
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
  document.getElementById('task-view-list')?.classList.toggle('active',   mode === 'list');
  document.getElementById('task-view-kanban')?.classList.toggle('active', mode === 'kanban');
  document.getElementById('tasks-list-view')?.classList.toggle('hidden',  mode === 'kanban');
  document.getElementById('tasks-kanban-view')?.classList.toggle('hidden', mode === 'list');
  renderTasksCurrent();
}

function filterTasks() {
  const q        = document.getElementById('task-search')?.value.toLowerCase() || '';
  const priority = document.getElementById('task-filter-priority')?.value || '';
  const assignee = document.getElementById('task-filter-assignee')?.value || '';

  const filtered = tasks.filter(t => {
    const matchQ = !q || t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q);
    const matchP = !priority || t.priority === priority;
    const matchA = !assignee || String(t.assigned_to) === assignee;
    return matchQ && matchP && matchA;
  });

  if (taskViewMode === 'kanban') renderTasksKanban(filtered);
  else renderTasksList(filtered);
}

function renderTasksCurrent() {
  const q        = document.getElementById('task-search')?.value.toLowerCase() || '';
  const priority = document.getElementById('task-filter-priority')?.value || '';
  const assignee = document.getElementById('task-filter-assignee')?.value || '';
  const filtered = tasks.filter(t => {
    const matchQ = !q || t.title.toLowerCase().includes(q);
    const matchP = !priority || t.priority === priority;
    const matchA = !assignee || String(t.assigned_to) === assignee;
    return matchQ && matchP && matchA;
  });
  if (taskViewMode === 'kanban') renderTasksKanban(filtered);
  else renderTasksList(filtered);
}

// ── LIST VIEW ─────────────────────────────────────────────
function renderTasksList(list) {
  const el = document.getElementById('tasks-list-view');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div style="color:var(--muted);padding:30px;text-align:center;font-size:14px">No tasks yet. Click + Add Task to get started.</div>`;
    return;
  }
  el.innerHTML = list.map(t => taskListRow(t)).join('');
}

function taskListRow(t, isSubtask = false) {
  const isDone    = t.status === 'done';
  const dueStr    = t.due_date ? fmtDate(t.due_date) : '';
  const isOverdue = t.due_date && !isDone && new Date(t.due_date) < new Date();
  const hasSubtasks = t.subtask_count > 0;

  return `
    <div class="task-row${isDone ? ' done-row' : ''}${isSubtask ? ' subtask-row' : ''}" id="task-row-${t.id}">
      ${!isSubtask ? `<button class="task-expand-btn" id="expand-${t.id}" onclick="toggleSubtasks(event,${t.id})" title="Show subtasks"
        ${!hasSubtasks ? 'style="visibility:hidden"' : ''}>▶</button>` : '<span style="width:18px;flex-shrink:0"></span>'}
      <div class="task-check${isDone ? ' done' : ''}" onclick="toggleTaskDone(event,${t.id},${isDone})">${isDone ? '✓' : ''}</div>
      <div class="task-title${isDone ? ' done' : ''}" onclick="openTaskModal(${t.id})">${esc(t.title)}</div>
      <div class="task-meta">
        ${hasSubtasks && !isSubtask ? `<span class="task-subtask-count" title="Subtasks">⊞ ${t.subtask_done||0}/${t.subtask_count}</span>` : ''}
        <span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
        ${t.assigned_to_name ? `<span class="task-assignee-chip">${esc(t.assigned_to_name)}</span>` : ''}
        ${dueStr ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${isOverdue ? '⚠ ' : ''}${dueStr}</span>` : ''}
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteTask(event,${t.id})" title="Delete">✕</button>
      </div>
    </div>
    <div class="subtask-rows hidden" id="subtasks-of-${t.id}"></div>`;
}

async function toggleSubtasks(e, taskId) {
  e.stopPropagation();
  const btn      = document.getElementById(`expand-${taskId}`);
  const container = document.getElementById(`subtasks-of-${taskId}`);
  if (!btn || !container) return;

  const isOpen = btn.classList.contains('open');
  if (isOpen) {
    btn.classList.remove('open');
    container.classList.add('hidden');
    return;
  }

  btn.classList.add('open');
  container.classList.remove('hidden');

  if (container.dataset.loaded) return; // already fetched
  container.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:6px 14px">Loading…</div>`;
  const full = await api.get(`/api/tasks/${taskId}`);
  container.innerHTML = (full.subtasks || []).map(s => taskListRow(s, true)).join('') ||
    `<div style="color:var(--muted);font-size:12px;padding:6px 14px">No subtasks yet.</div>`;
  container.dataset.loaded = '1';
}

async function toggleTaskDone(e, taskId, isDone) {
  e.stopPropagation();
  const statuses   = getActiveTaskStatuses();
  const doneKey    = statuses[statuses.length - 1].key;
  const firstKey   = statuses[0].key;
  const newStatus  = isDone ? firstKey : doneKey;
  await api.patch(`/api/tasks/${taskId}/status`, { status: newStatus });
  const t = tasks.find(t => t.id === taskId);
  if (t) t.status = newStatus;
  renderTasksCurrent();
}

async function deleteTask(e, taskId) {
  e.stopPropagation();
  if (!confirm('Delete this task and all its subtasks?')) return;
  await api.del(`/api/tasks/${taskId}`);
  tasks = tasks.filter(t => t.id !== taskId);
  renderTasksCurrent();
}

// ── KANBAN VIEW ───────────────────────────────────────────
function renderTasksKanban(list) {
  const el = document.getElementById('tasks-kanban-view');
  if (!el) return;

  el.innerHTML = getActiveTaskStatuses().map(st => {
    const colTasks = list.filter(t => t.status === st.key);
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
          ${colTasks.map(taskKanbanCard).join('') ||
            `<div style="color:var(--muted);font-size:12px;padding:8px 4px">No tasks</div>`}
        </div>
      </div>`;
  }).join('');
}

function taskKanbanCard(t) {
  const isDone    = t.status === 'done';
  const dueStr    = t.due_date ? fmtDate(t.due_date) : '';
  const isOverdue = t.due_date && !isDone && new Date(t.due_date) < new Date();
  return `
    <div class="task-card${isDone ? ' done-row' : ''}" draggable="true" data-id="${t.id}"
      ondragstart="taskDragStart(event,${t.id})" ondragend="taskDragEnd(event)"
      onclick="openTaskModal(${t.id})">
      <div class="task-card-title${isDone ? ' done' : ''}">${esc(t.title)}</div>
      <div class="task-card-meta">
        <span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
        ${t.subtask_count ? `<span class="task-card-sub">⊞ ${t.subtask_done||0}/${t.subtask_count}</span>` : ''}
        ${t.assigned_to_name ? `<span class="task-assignee-chip">${esc(t.assigned_to_name)}</span>` : ''}
        ${dueStr ? `<span class="task-due${isOverdue ? ' overdue' : ''}">${isOverdue ? '⚠ ' : ''}${dueStr}</span>` : ''}
      </div>
    </div>`;
}

function taskDragStart(e, id) {
  dragTaskId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('dragging'), 0);
}
function taskDragEnd(e)   { e.target.classList.remove('dragging'); }
function taskDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function taskDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function taskDrop(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragTaskId) return;
  const t = tasks.find(t => t.id === dragTaskId);
  if (!t || t.status === status) { dragTaskId = null; return; }
  t.status = status;
  renderTasksCurrent();
  await api.patch(`/api/tasks/${dragTaskId}/status`, { status });
  dragTaskId = null;
}

// ── TASK MODAL ────────────────────────────────────────────
let currentTaskId = null;

async function openTaskModal(id) {
  await ensureMembers();
  document.getElementById('task-form').reset();
  document.getElementById('task-id').value        = id || '';
  document.getElementById('task-parent-id').value = '';
  document.getElementById('task-modal-title').textContent = id ? 'Edit Task' : 'Add Task';
  document.getElementById('task-delete-btn').style.display = id ? '' : 'none';

  // Populate status dropdown dynamically from workspace settings
  document.getElementById('task-status').innerHTML =
    getActiveTaskStatuses().map(s => `<option value="${s.key}">${esc(s.label)}</option>`).join('');

  // Populate assignee dropdown
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
    subCol.style.display = '';
    renderSubtasksList(t.subtasks || [], id);
  } else {
    currentTaskId = null;
    subCol.style.display = 'none';
  }

  document.getElementById('task-modal').classList.remove('hidden');
}

function renderSubtasksList(subtasks, parentId) {
  const el = document.getElementById('task-subtasks-list');
  if (!el) return;
  el.innerHTML = subtasks.map(s => `
    <div class="subtask-item" id="subtask-item-${s.id}">
      <input type="checkbox" ${s.status === 'done' ? 'checked' : ''}
        onchange="toggleSubtaskDone(${s.id}, this.checked, ${parentId})" />
      <span class="subtask-item-title${s.status === 'done' ? ' done' : ''}">${esc(s.title)}</span>
      <button type="button" class="btn btn-sm btn-danger btn-icon" style="padding:1px 5px"
        onclick="deleteSubtask(${s.id}, ${parentId})">✕</button>
    </div>`).join('') || `<p style="color:var(--muted);font-size:12px">No subtasks yet.</p>`;
}

async function addSubtask() {
  const input = document.getElementById('new-subtask-input');
  const title = input?.value.trim();
  if (!title || !currentTaskId) return;
  await api.post('/api/tasks', { title, parent_id: currentTaskId, status: 'todo', priority: 'medium' });
  input.value = '';
  const fresh = await api.get(`/api/tasks/${currentTaskId}`);
  renderSubtasksList(fresh.subtasks || [], currentTaskId);
  // Update the subtask count in the main task list
  const t = tasks.find(t => t.id === currentTaskId);
  if (t) { t.subtask_count = fresh.subtasks.length; }
}

async function toggleSubtaskDone(subtaskId, done, parentId) {
  await api.patch(`/api/tasks/${subtaskId}/status`, { status: done ? 'done' : 'todo' });
  const el = document.querySelector(`#subtask-item-${subtaskId} .subtask-item-title`);
  if (el) el.classList.toggle('done', done);
  // Update done count in main list
  const fresh = await api.get(`/api/tasks/${parentId}`);
  const parent = tasks.find(t => t.id === parentId);
  if (parent) { parent.subtask_done = fresh.subtasks.filter(s => s.status === 'done').length; }
  renderTasksCurrent();
}

async function deleteSubtask(subtaskId, parentId) {
  if (!confirm('Delete this subtask?')) return;
  await api.del(`/api/tasks/${subtaskId}`);
  const fresh = await api.get(`/api/tasks/${parentId}`);
  renderSubtasksList(fresh.subtasks || [], parentId);
  const parent = tasks.find(t => t.id === parentId);
  if (parent) { parent.subtask_count = fresh.subtasks.length; parent.subtask_done = fresh.subtasks.filter(s => s.status === 'done').length; }
  renderTasksCurrent();
}

async function saveTask(e) {
  e.preventDefault();
  const id = document.getElementById('task-id').value;
  const payload = {
    title:       document.getElementById('task-title').value,
    description: document.getElementById('task-description').value,
    status:      document.getElementById('task-status').value,
    priority:    document.getElementById('task-priority').value,
    assigned_to: document.getElementById('task-assignee').value || null,
    due_date:    document.getElementById('task-due-date').value || null,
  };
  if (id) await api.put(`/api/tasks/${id}`, payload);
  else    await api.post('/api/tasks', payload);
  closeModal('task-modal');
  tasks = await api.get('/api/tasks');
  renderTasksCurrent();
}

async function deleteTaskFromModal() {
  const id = document.getElementById('task-id').value;
  if (!id || !confirm('Delete this task and all its subtasks?')) return;
  await api.del(`/api/tasks/${id}`);
  closeModal('task-modal');
  tasks = tasks.filter(t => t.id !== Number(id));
  renderTasksCurrent();
}
