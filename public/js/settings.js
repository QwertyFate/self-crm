// ── SETTINGS ──────────────────────────────────────────────
let currentSettingsTab = 'general';

function switchSettingsTab(tab) {
  currentSettingsTab = tab;
  document.querySelectorAll('.settings-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.settings-pane').forEach(pane => pane.classList.toggle('active', pane.id === `settings-pane-${tab}`));
}

async function loadSettings() {
  [stages, fields] = await Promise.all([api.get('/api/stages'), api.get('/api/fields')]);
  renderFieldsList(); renderContactColumnSettings();
  const waEl = document.getElementById('wa-template-input');
  if (waEl) waEl.value = currentWorkspace?.whatsapp_template ?? 'Hi {{name}}, ';
  const miroEl = document.getElementById('miro-url-input');
  if (miroEl) miroEl.value = currentWorkspace?.miro_url || '';
  objectFields  = await api.get('/api/object-fields');
  objectColumns = currentWorkspace?.object_columns || [];
  renderObjectFieldsList(); renderObjectColumnSettings();
  if (currentUser?.role === 'owner') {
    const nameCard = document.getElementById('object-name-card');
    if (nameCard) { nameCard.classList.remove('hidden'); document.getElementById('object-name-input').value = currentWorkspace?.object_name || 'Listings'; }
    const supCard = document.getElementById('supplier-name-card');
    if (supCard) { supCard.classList.remove('hidden'); document.getElementById('supplier-name-input').value = currentWorkspace?.supplier_name || 'Suppliers'; }
  }
  pipelines  = await api.get('/api/pipelines');
  dealFields = await api.get('/api/deal-fields');
  renderPipelinesSettings(); renderDealFieldsList(); renderDealColumnSettings();
  switchSettingsTab(currentSettingsTab);
  if (currentUser?.role === 'owner') {
    document.getElementById('invites-card').classList.remove('hidden');
    loadInvites();
    const wsCard = document.getElementById('workspace-name-card');
    wsCard.classList.remove('hidden');
    document.getElementById('workspace-name-input').value = currentWorkspace?.name || '';
    document.getElementById('workspace-name-msg').classList.add('hidden');
  } else {
    document.getElementById('invites-card').classList.add('hidden');
    document.getElementById('workspace-name-card').classList.add('hidden');
  }
  loadMembers();
}

async function saveWorkspaceName() {
  const input = document.getElementById('workspace-name-input'), msgEl = document.getElementById('workspace-name-msg');
  const name = input.value.trim(); if (!name) return;
  const res = await api.patch('/api/workspace/name', { name });
  if (res.error) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); return; }
  currentWorkspace.name = res.name; document.getElementById('sidebar-workspace').textContent = res.name;
  msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden');
  setTimeout(() => msgEl.classList.add('hidden'), 2500);
}

// ── Pipelines ─────────────────────────────────────────────
function renderPipelinesSettings() {
  const el = document.getElementById('pipelines-list'); if (!el) return;
  if (!pipelines.length) { el.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:8px 0">No pipelines yet.</p>`; return; }
  el.innerHTML = pipelines.map(p => `
    <div class="pipeline-settings-row">
      <div class="pipeline-settings-header">
        <span class="row-label" style="font-weight:600">📌 ${esc(p.name)}</span>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-ghost btn-icon" onclick="editPipeline(${p.id},'${esc(p.name).replace(/'/g,'&apos;')}')">✏️</button>
          <button class="btn btn-sm btn-danger btn-icon" onclick="deletePipeline(${p.id})">✕</button>
        </div>
      </div>
      <div class="pipeline-stages-list">
        ${(p.stages||[]).map((s,i) => `
          <div class="settings-row pipeline-stage-row" draggable="true"
            ondragstart="pipelineStageDragStart(event,${p.id},${i})"
            ondragover="pipelineStageDragOver(event)" ondrop="pipelineStageDrop(event,${p.id},${i})">
            <span class="drag-handle">⠿</span>
            <span class="row-dot" style="background:${s.color}"></span>
            <span class="row-label">${esc(s.name)}</span>
            <div class="row-actions">
              <button class="btn btn-sm btn-ghost btn-icon" onclick="editPipelineStage(${p.id},${s.id},'${esc(s.name).replace(/'/g,'&apos;')}','${s.color}')">✏️</button>
              <button class="btn btn-sm btn-danger btn-icon" onclick="deletePipelineStage(${p.id},${s.id})">✕</button>
            </div>
          </div>`).join('')}
        <button class="btn btn-sm btn-ghost" style="margin-top:6px" onclick="addPipelineStage(${p.id})">+ Add stage</button>
      </div>
    </div>`).join('');
}

let pipelineStageDragIdx = null, pipelineStageDragPid = null;
function pipelineStageDragStart(e, pid, i) { pipelineStageDragPid = pid; pipelineStageDragIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function pipelineStageDragOver(e) { e.preventDefault(); }
async function pipelineStageDrop(e, pid, targetIdx) {
  e.preventDefault();
  if (pipelineStageDragPid !== pid || pipelineStageDragIdx === null || pipelineStageDragIdx === targetIdx) return;
  const p = pipelines.find(p => p.id === pid);
  const moved = p.stages.splice(pipelineStageDragIdx, 1)[0];
  p.stages.splice(targetIdx, 0, moved); pipelineStageDragIdx = null;
  renderPipelinesSettings(); await api.patch(`/api/pipelines/${pid}/stages/reorder`, { ids: p.stages.map(s => s.id) });
}

function openNewPipelineModal(id, name) {
  document.getElementById('new-pipeline-form').reset();
  document.getElementById('pipeline-edit-id').value = id || '';
  document.getElementById('pipeline-name-input').value = name || '';
  document.getElementById('pipeline-modal-title').textContent = id ? 'Rename Pipeline' : 'New Pipeline';
  document.getElementById('new-pipeline-modal').classList.remove('hidden');
}
function editPipeline(id, name) { openNewPipelineModal(id, name); }

async function saveNewPipeline(e) {
  e.preventDefault();
  const id = document.getElementById('pipeline-edit-id').value, name = document.getElementById('pipeline-name-input').value.trim();
  if (!name) return;
  if (id) await api.put(`/api/pipelines/${id}`, { name }); else await api.post('/api/pipelines', { name });
  closeModal('new-pipeline-modal'); pipelines = await api.get('/api/pipelines'); renderPipelinesSettings();
  const sel = document.getElementById('deals-pipeline-select');
  if (sel) { sel.innerHTML = pipelines.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join(''); if (currentPipelineId) sel.value = currentPipelineId; }
}

async function deletePipeline(id) {
  if (!confirm('Delete this pipeline and all its deals?')) return;
  await api.del(`/api/pipelines/${id}`);
  pipelines = pipelines.filter(p => p.id !== id);
  if (currentPipelineId === id) { currentPipelineId = pipelines[0]?.id || null; deals = []; }
  renderPipelinesSettings();
}

async function addPipelineStage(pipelineId) {
  const name = prompt('Stage name:'); if (!name?.trim()) return;
  const color = '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
  const res = await api.post(`/api/pipelines/${pipelineId}/stages`, { name: name.trim(), color });
  if (res.error) { alert(res.error); return; }
  pipelines = await api.get('/api/pipelines'); renderPipelinesSettings();
}

async function editPipelineStage(pipelineId, stageId, currentName, currentColor) {
  const name = prompt('Stage name:', currentName); if (!name?.trim()) return;
  await api.put(`/api/pipelines/${pipelineId}/stages/${stageId}`, { name: name.trim(), color: currentColor });
  pipelines = await api.get('/api/pipelines'); renderPipelinesSettings();
}

async function deletePipelineStage(pipelineId, stageId) {
  if (!confirm('Delete this stage? Deals in it will become unsorted.')) return;
  await api.del(`/api/pipelines/${pipelineId}/stages/${stageId}`);
  pipelines = await api.get('/api/pipelines'); renderPipelinesSettings();
}

// ── Deal Fields ───────────────────────────────────────────
function renderDealFieldsList() {
  const el = document.getElementById('deal-fields-list'); if (!el) return;
  if (!dealFields.length) { el.innerHTML = `<li style="color:var(--muted);font-size:13px;padding:6px 10px">No deal fields yet.</li>`; return; }
  el.innerHTML = dealFields.map(f => `
    <li class="settings-row">
      <span class="row-label">${esc(f.name)}</span><span class="row-sub">${f.type}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openDealFieldModal(${f.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteDealField(${f.id})">✕</button>
      </div>
    </li>`).join('');
}

function openDealFieldModal(id) {
  document.getElementById('deal-field-form').reset();
  document.getElementById('deal-field-id').value = id || '';
  document.getElementById('dff-options-group').classList.add('hidden');
  document.getElementById('deal-field-modal-title').textContent = id ? 'Edit Deal Field' : 'Add Deal Field';
  if (id) {
    const f = dealFields.find(f => f.id === id);
    document.getElementById('dff-name').value = f.name; document.getElementById('dff-key').value = f.field_key;
    document.getElementById('dff-type').value = f.type; document.getElementById('dff-options').value = (f.options||[]).join('\n');
    if (f.type === 'dropdown') document.getElementById('dff-options-group').classList.remove('hidden');
  }
  document.getElementById('deal-field-modal').classList.remove('hidden');
}
function autoDealFieldKey() {
  if (document.getElementById('deal-field-id').value) return;
  document.getElementById('dff-key').value = document.getElementById('dff-name').value.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function toggleDealFieldOptions() {
  document.getElementById('dff-options-group').classList.toggle('hidden', document.getElementById('dff-type').value !== 'dropdown');
}
async function saveDealField(e) {
  e.preventDefault();
  const id = document.getElementById('deal-field-id').value, type = document.getElementById('dff-type').value;
  const payload = { name: document.getElementById('dff-name').value, field_key: document.getElementById('dff-key').value, type,
    options: type === 'dropdown' ? document.getElementById('dff-options').value.split('\n').map(s=>s.trim()).filter(Boolean) : [] };
  const res = id ? await api.put(`/api/deal-fields/${id}`, payload) : await api.post('/api/deal-fields', payload);
  if (res.error) { alert(res.error); return; }
  closeModal('deal-field-modal'); dealFields = await api.get('/api/deal-fields'); renderDealFieldsList();
}
async function deleteDealField(id) {
  if (!confirm('Delete this field?')) return;
  await api.del(`/api/deal-fields/${id}`); dealFields = dealFields.filter(f => f.id !== id); renderDealFieldsList();
}

// ── WhatsApp template ─────────────────────────────────────
function insertWaVar(variable) {
  const el = document.getElementById('wa-template-input'); if (!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  el.value = el.value.slice(0, start) + variable + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + variable.length; el.focus();
}
async function saveWaTemplate() {
  const textarea = document.getElementById('wa-template-input'), msgEl = document.getElementById('wa-template-msg');
  const template = textarea.value, btn = document.getElementById('save-wa-template-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; } msgEl?.classList.add('hidden');
  const res = await api.patch('/api/workspace/whatsapp-template', { template });
  if (btn) { btn.disabled = false; btn.textContent = t('btn_save'); }
  if (res.error) { if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); } return; }
  currentWorkspace.whatsapp_template = template;
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}

// ── Contact stages ────────────────────────────────────────
function renderStagesList() {
  document.getElementById('stages-list').innerHTML = stages.map((s, i) => `
    <li class="settings-row" draggable="true" data-id="${s.id}"
      ondragstart="stageDragStart(event,${i})" ondragover="stageDragOver(event)" ondrop="stageDrop(event,${i})">
      <span class="drag-handle">⠿</span>
      <span class="row-dot" style="background:${s.color}"></span>
      <span class="row-label">${esc(s.name)}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openStageModal(${s.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteStage(${s.id})">✕</button>
      </div>
    </li>`).join('');
}
function stageDragStart(e, i) { dragStageIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function stageDragOver(e) { e.preventDefault(); }
async function stageDrop(e, targetIdx) {
  e.preventDefault(); if (dragStageIdx === null || dragStageIdx === targetIdx) return;
  const moved = stages.splice(dragStageIdx, 1)[0]; stages.splice(targetIdx, 0, moved); dragStageIdx = null;
  renderStagesList(); await api.patch('/api/stages/reorder', { ids: stages.map(s => s.id) });
}
function openStageModal(id) {
  document.getElementById('stage-form').reset(); document.getElementById('stage-id').value = id || '';
  document.getElementById('stage-color').value = '#4f6ef7';
  document.getElementById('stage-modal-title').textContent = id ? t('edit_stage_title') : t('add_stage_title');
  if (id) { const s = stages.find(s => s.id === id); document.getElementById('stage-name').value = s.name; document.getElementById('stage-color').value = s.color; }
  document.getElementById('stage-modal').classList.remove('hidden');
}
async function saveStage(e) {
  e.preventDefault();
  const id = document.getElementById('stage-id').value;
  const payload = { name: document.getElementById('stage-name').value, color: document.getElementById('stage-color').value };
  const res = id ? await api.put(`/api/stages/${id}`, payload) : await api.post('/api/stages', payload);
  if (res.error) { alert(res.error); return; }
  closeModal('stage-modal'); invalidate(); await loadSettings();
}
async function deleteStage(id) {
  if (!confirm('Delete this stage? Contacts will become unassigned.')) return;
  await api.del(`/api/stages/${id}`); invalidate(); await loadSettings();
}

// ── Contact custom fields ─────────────────────────────────
function renderFieldsList() {
  const el = document.getElementById('fields-list');
  if (!fields.length) { el.innerHTML = `<li style="color:var(--muted);font-size:13px;padding:6px 10px">${t('no_fields')}</li>`; return; }
  el.innerHTML = fields.map(f => `
    <li class="settings-row">
      <span class="row-label">${esc(f.name)}</span>
      <span class="row-sub">${f.type}${f.type==='dropdown'?` (${f.options.length} opts)`:''}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openFieldModal(${f.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteField(${f.id})">✕</button>
      </div>
    </li>`).join('');
}
function openFieldModal(id) {
  document.getElementById('field-form').reset(); document.getElementById('field-id').value = id || '';
  document.getElementById('field-options-group').classList.add('hidden');
  document.getElementById('field-modal-title').textContent = id ? t('edit_field_title') : t('add_field_title');
  if (id) {
    const f = fields.find(f => f.id === id);
    document.getElementById('field-name').value = f.name; document.getElementById('field-key').value = f.field_key;
    document.getElementById('field-type').value = f.type; document.getElementById('field-options').value = (f.options||[]).join('\n');
    if (f.type === 'dropdown') document.getElementById('field-options-group').classList.remove('hidden');
  }
  document.getElementById('field-modal').classList.remove('hidden');
}
function autoKey() {
  if (document.getElementById('field-id').value) return;
  document.getElementById('field-key').value = document.getElementById('field-name').value.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function toggleDropdownOptions() {
  document.getElementById('field-options-group').classList.toggle('hidden', document.getElementById('field-type').value !== 'dropdown');
}
async function saveField(e) {
  e.preventDefault();
  const id = document.getElementById('field-id').value, type = document.getElementById('field-type').value;
  const payload = { name: document.getElementById('field-name').value, field_key: document.getElementById('field-key').value, type,
    options: type === 'dropdown' ? document.getElementById('field-options').value.split('\n').map(s=>s.trim()).filter(Boolean) : [] };
  const res = id ? await api.put(`/api/fields/${id}`, payload) : await api.post('/api/fields', payload);
  if (res.error) { alert(res.error); return; }
  closeModal('field-modal'); invalidate(); await loadSettings();
}
async function deleteField(id) {
  if (!confirm('Delete this field? Saved values will be lost.')) return;
  await api.del(`/api/fields/${id}`); invalidate(); await loadSettings();
}

// ── Contact column settings ───────────────────────────────
function renderContactColumnSettings() {
  const el = document.getElementById('contact-columns-list'); if (!el) return;
  const cols = effectiveContactColumns();
  el.innerHTML = cols.map((col, i) => `
    <li class="settings-row col-cfg-row" draggable="true"
      ondragstart="colDragStart(event,${i})" ondragover="colDragOver(event)" ondrop="colDrop(event,${i})" ondragleave="colDragLeave(event)">
      <span class="drag-handle">⠿</span>
      <span class="row-label">${col.label()}</span>
      <label class="col-vis-toggle"><input type="checkbox" ${col.visible ? 'checked' : ''} onchange="colToggleVisible(${i},this.checked)" /></label>
    </li>`).join('');
}
function colDragStart(e, i) { colDragIdx = i; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); }
function colDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('col-drag-over'); }
function colDragLeave(e) { e.currentTarget.classList.remove('col-drag-over'); }
function colDrop(e, targetIdx) {
  e.preventDefault(); e.currentTarget.classList.remove('col-drag-over');
  if (colDragIdx === null || colDragIdx === targetIdx) { colDragIdx = null; return; }
  const cols = effectiveContactColumns(); const moved = cols.splice(colDragIdx, 1)[0];
  cols.splice(targetIdx, 0, moved); colDragIdx = null;
  contactColumns = cols.map(({ key, visible }) => ({ key, visible })); renderContactColumnSettings();
}
function colToggleVisible(i, visible) {
  const cols = effectiveContactColumns(); cols[i].visible = visible;
  contactColumns = cols.map(({ key, visible }) => ({ key, visible }));
}
async function saveContactColumns() {
  const toSave = effectiveContactColumns().map(({ key, visible }) => ({ key, visible }));
  const btn = document.getElementById('save-contact-cols-btn'), msgEl = document.getElementById('contact-cols-msg');
  if (btn) { btn.disabled = true; btn.textContent = '…'; } msgEl?.classList.add('hidden');
  const res = await api.patch('/api/workspace/contact-columns', { columns: toSave });
  if (btn) { btn.disabled = false; btn.textContent = t('btn_save'); }
  if (res.error) { if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); } return; }
  contactColumns = toSave; currentWorkspace.contact_columns = toSave;
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500); filterContacts();
}

// ── Kanban fields ─────────────────────────────────────────
function renderKanbanFields() {
  const el = document.getElementById('kanban-fields-list'); if (!el) return;
  const allOptions = [...BUILTIN_FIELDS, ...fields.map(f => ({ key: f.field_key, label: f.name, type: f.type }))];
  el.innerHTML = allOptions.map(f => `
    <label class="kanban-check-row">
      <input type="checkbox" value="${esc(f.key)}" ${kanbanFields.includes(f.key) ? 'checked' : ''} />
      <span class="kanban-check-label">${esc(f.label)}</span>
      <span class="kanban-check-type">${f.type}</span>
    </label>`).join('');
}
async function saveKanbanFields() {
  const checked = [...document.querySelectorAll('#kanban-fields-list input[type="checkbox"]:checked')].map(cb => cb.value);
  await api.patch('/api/workspace/kanban-fields', { fields: checked });
  kanbanFields = checked; currentWorkspace.kanban_fields = checked; alert('Kanban fields saved.');
}

// ── Invites & Members ─────────────────────────────────────
async function loadInvites() {
  const codes = await api.get('/api/invites');
  document.getElementById('invites-list').innerHTML = codes.length
    ? codes.map(c => `
      <li class="settings-row">
        <span class="invite-code-val ${c.used ? 'invite-used' : ''}">${c.code}</span>
        ${c.used
          ? `<span class="row-sub">Used by ${esc(c.used_by_name||'someone')}</span>`
          : `<button class="btn btn-sm" onclick="copyCode('${c.code}')">Copy</button>
             <button class="btn btn-sm btn-danger btn-icon" onclick="deleteInviteCode(${c.id})">✕</button>`}
      </li>`).join('')
    : '<li style="color:var(--muted);font-size:13px;padding:6px 10px">No invite codes yet.</li>';
}
async function generateInviteCode() { await api.post('/api/invites', {}); await loadInvites(); }
async function deleteInviteCode(id) { await api.del(`/api/invites/${id}`); await loadInvites(); }
function copyCode(code) { navigator.clipboard.writeText(code).then(() => alert(`Copied: ${code}`)); }

async function loadMembers() {
  const list = await api.get('/api/workspace/members');
  document.getElementById('members-list').innerHTML = list.map(m => `
    <li class="settings-row">
      <div class="member-avatar">${esc(m.name[0].toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div class="row-label">${esc(m.name)}${m.id === currentUser?.id ? ' <span style="color:var(--muted);font-weight:400">(you)</span>' : ''}</div>
        <div class="row-sub">${esc(m.email)}</div>
      </div>
      <span class="member-role">${m.role}</span>
      ${currentUser?.role === 'owner' && m.id !== currentUser?.id && m.role !== 'owner'
        ? `<button class="btn btn-sm btn-danger btn-icon" onclick="removeMember(${m.id}, '${esc(m.name)}')">Remove</button>`
        : ''}
    </li>`).join('');
}
async function removeMember(id, name) {
  if (!confirm(`Remove ${name} from this workspace? Their assigned contacts will become unassigned.`)) return;
  const res = await api.del(`/api/workspace/members/${id}`);
  if (res.error) { alert(res.error); return; }
  invalidate(); await loadSettings();
}
