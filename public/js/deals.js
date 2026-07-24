// ── DEALS ─────────────────────────────────────────────────
async function loadDeals() {
  // Clear UI immediately to prevent showing stale data
  const dealsBoard = document.getElementById('deals-board');
  const dealsList = document.getElementById('deals-list-view');
  if (dealsBoard) dealsBoard.innerHTML = '';
  if (dealsList) dealsList.innerHTML = '';

  await ensureMembers();
  [pipelines, dealFields] = await Promise.all([
    api.get('/api/pipelines'),
    api.get('/api/deal-fields'),
  ]);
  dealKanbanFields = currentWorkspace?.deal_kanban_fields || ['contact', 'value'];

  const sel = document.getElementById('deals-pipeline-select');
  if (sel) {
    sel.innerHTML = `<option value="">— All pipelines —</option>` +
      pipelines.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    if (dealViewMode === 'kanban' && !currentPipelineId && pipelines.length)
      currentPipelineId = pipelines[0].id;
    if (currentPipelineId && !pipelines.find(p => p.id === currentPipelineId))
      currentPipelineId = null;
    sel.value = currentPipelineId || '';
  }

  const url = currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals';
  deals = await api.get(url);
  setDealView(dealViewMode);
}

async function onPipelineChange() {
  const sel = document.getElementById('deals-pipeline-select');
  currentPipelineId = sel.value ? parseInt(sel.value) : null;
  const url = currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals';
  deals = await api.get(url);
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

function setDealView(mode) {
  dealViewMode = mode;
  localStorage.setItem('dealViewMode', mode);
  document.getElementById('deals-board')?.classList.toggle('hidden', mode === 'list');
  document.getElementById('deals-list-view')?.classList.toggle('hidden', mode === 'kanban');
  document.getElementById('deal-view-kanban')?.classList.toggle('active', mode === 'kanban');
  document.getElementById('deal-view-list')?.classList.toggle('active', mode === 'list');
  if (mode === 'list') renderDealsList(); else renderDealsBoard();
}

// ── Deal columns (per-user) ───────────────────────────────
function effectiveDealColumns() {
  const BUILTIN = [
    { key: 'stage',       label: () => t('col_stage'),      show: true  },
    { key: 'contact',     label: () => t('lbl_contact'),    show: true  },
    { key: 'value',       label: () => t('lbl_deal_value'), show: true  },
    { key: 'assigned_to', label: () => t('col_assignee'),   show: true  },
    { key: 'created_at',  label: () => t('col_created_at'), show: false },
  ];
  const ALL = [
    ...BUILTIN,
    ...dealFields.map(f => ({ key: `custom:${f.field_key}`, label: () => f.name, show: true })),
  ];
  if (!dealColumns.length) return ALL.map(c => ({ ...c, visible: c.show }));
  const savedMap = Object.fromEntries(dealColumns.map(c => [c.key, c.visible]));
  const ordered  = dealColumns
    .map(({ key }) => { const def = ALL.find(c => c.key === key); return def ? { ...def, visible: savedMap[key] } : null; })
    .filter(Boolean);
  ALL.filter(c => !(c.key in savedMap)).forEach(c => ordered.push({ ...c, visible: c.show }));
  return ordered;
}

function renderDealColumnSettings() {
  const el = document.getElementById('deal-columns-list');
  if (!el) return;
  const cols = effectiveDealColumns();
  el.innerHTML = cols.map((col, i) => `
    <li class="settings-row col-cfg-row" draggable="true"
      ondragstart="dealColDragStart(event,${i})" ondragover="colDragOver(event)" ondrop="dealColDrop(event,${i})" ondragleave="colDragLeave(event)">
      <span class="drag-handle">⠿</span>
      <span class="row-label">${col.label()}</span>
      <label class="col-vis-toggle">
        <input type="checkbox" ${col.visible ? 'checked' : ''} onchange="dealColToggle(${i},this.checked)" />
      </label>
    </li>`).join('');
}

function dealColDragStart(e, i) { dealColDragIdx = i; e.dataTransfer.effectAllowed = 'move'; }
function dealColDrop(e, targetIdx) {
  e.preventDefault(); e.currentTarget.classList.remove('col-drag-over');
  if (dealColDragIdx === null || dealColDragIdx === targetIdx) { dealColDragIdx = null; return; }
  const cols = effectiveDealColumns(); const moved = cols.splice(dealColDragIdx, 1)[0];
  cols.splice(targetIdx, 0, moved); dealColDragIdx = null;
  dealColumns = cols.map(({ key, visible }) => ({ key, visible }));
  renderDealColumnSettings();
}
function dealColToggle(i, visible) {
  const cols = effectiveDealColumns(); cols[i].visible = visible;
  dealColumns = cols.map(({ key, visible }) => ({ key, visible }));
}

async function saveDealColumns() {
  const toSave = effectiveDealColumns().map(({ key, visible }) => ({ key, visible }));
  const btn = document.getElementById('save-deal-cols-btn'), msgEl = document.getElementById('deal-cols-msg');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  msgEl?.classList.add('hidden');
  const res = await api.patch('/api/auth/preferences', { deal_columns: toSave });
  if (btn) { btn.disabled = false; btn.textContent = t('btn_save'); }
  if (res.error) { if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); } return; }
  dealColumns = toSave;
  if (currentUser) currentUser.deal_columns = toSave;
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
  renderDealsList();
}

function renderDealsList() {
  const thead = document.getElementById('deals-thead'), tbody = document.getElementById('deals-tbody');
  if (!thead || !tbody) return;
  const visibleCols = effectiveDealColumns().filter(c => c.visible);
  const showPipeline = !currentPipelineId;
  const span = 1 + (showPipeline ? 1 : 0) + visibleCols.length;

  thead.innerHTML = `<tr>
    <th>Title</th>
    ${showPipeline ? '<th>Pipeline</th>' : ''}
    ${visibleCols.map(c => `<th>${c.label()}</th>`).join('')}
  </tr>`;

  if (!deals.length) {
    tbody.innerHTML = `<tr><td colspan="${span}" style="text-align:center;color:var(--muted);padding:28px">No deals found.</td></tr>`;
    return;
  }

  tbody.innerHTML = deals.map(d => {
    const dash = '<span class="muted-dash">—</span>';
    const cells = visibleCols.map(col => {
      if (col.key === 'stage') {
        const badge = d.stage_name
          ? `<span class="stage-badge"><span class="stage-badge-dot" style="background:${d.stage_color}"></span>${esc(d.stage_name)}</span>`
          : dash;
        return `<td>${badge}</td>`;
      }
      if (col.key === 'contact')     return `<td>${d.contact_name ? esc(d.contact_name) : dash}</td>`;
      if (col.key === 'value')       return `<td>${d.value != null ? `<span class="deal-value-chip">€ ${Number(d.value).toLocaleString()}</span>` : dash}</td>`;
      if (col.key === 'assigned_to') return `<td>${d.assigned_to_name ? esc(d.assigned_to_name) : dash}</td>`;
      if (col.key === 'created_at')  return `<td>${fmtDate(d.created_at)}</td>`;
      if (col.key.startsWith('custom:')) {
        const fk = col.key.slice(7);
        return `<td>${esc(d.custom_data?.[fk] ?? '') || dash}</td>`;
      }
      return `<td>${dash}</td>`;
    }).join('');

    return `<tr class="deal-list-row" onclick="openDealModal(${d.id})">
      <td><strong>${esc(d.title)}</strong></td>
      ${showPipeline ? `<td>${esc(pipelines.find(p => p.id === d.pipeline_id)?.name || '—')}</td>` : ''}
      ${cells}
    </tr>`;
  }).join('');
}

function renderDealsBoard() {
  const board = document.getElementById('deals-board');
  if (!board) return;
  if (!pipelines.length) {
    board.innerHTML = `<div style="padding:40px;color:var(--muted);font-size:14px">${t('no_pipelines')}</div>`;
    return;
  }
  if (!currentPipelineId) {
    board.innerHTML = `<div style="padding:40px;color:var(--muted);font-size:14px">Select a pipeline above to view the board, or switch to List view to see all deals.</div>`;
    return;
  }
  const pipeline = pipelines.find(p => p.id === currentPipelineId);
  if (!pipeline) return;

  board.innerHTML = (pipeline.stages || []).map(stage => {
    const stageDeals = deals.filter(d => d.stage_id === stage.id);
    return `
    <div class="pipeline-col">
      <div class="col-header">
        <span class="col-dot" style="background:${stage.color}"></span>
        <span class="col-name">${esc(stage.name)}</span>
        <span class="col-count">${stageDeals.length}</span>
      </div>
      <div class="col-cards" ondragover="dealDragOver(event)" ondragleave="dealDragLeave(event)" ondrop="dealDrop(event,${stage.id})">
        ${stageDeals.length ? stageDeals.map(dealCard).join('') : `<div class="col-empty">${t('no_deals')}</div>`}
      </div>
    </div>`;
  }).join('');
}

function dealCard(d) {
  const fmtVal = d.value != null ? Number(d.value).toLocaleString() : null;
  return `
    <div class="contact-card deal-card" draggable="true" data-id="${d.id}"
      ondragstart="dealDragStart(event,${d.id})" ondragend="dealDragEnd(event)"
      onclick="openDealModal(${d.id})">
      <div class="card-name">${esc(d.title)}</div>
      ${d.contact_name ? `<div class="card-field">👤 ${esc(d.contact_name)}</div>` : ''}
      ${fmtVal != null ? `<div class="card-field deal-value-chip">€ ${fmtVal}</div>` : ''}
      ${d.assigned_to_name ? `<div class="card-field">→ ${esc(d.assigned_to_name)}</div>` : ''}
      <div class="card-actions">
        <button class="btn btn-sm btn-danger btn-icon" title="Delete" onclick="event.stopPropagation();deleteDeal(${d.id})">✕</button>
      </div>
    </div>`;
}

// ── Drag & Drop ───────────────────────────────────────────
function dealDragStart(e, id) { dragDealId = id; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => e.target.classList.add('dragging'), 0); }
function dealDragEnd(e)   { e.target.classList.remove('dragging'); }
function dealDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dealDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function dealDrop(e, stageId) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if (!dragDealId) return;
  const deal = deals.find(d => d.id === dragDealId);
  if (!deal || deal.stage_id === stageId) return;
  deal.stage_id = stageId;
  const stage = (pipelines.find(p => p.id === currentPipelineId)?.stages || []).find(s => s.id === stageId);
  deal.stage_name  = stage?.name  || null;
  deal.stage_color = stage?.color || null;
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
  await api.patch(`/api/deals/${dragDealId}/stage`, { stage_id: stageId });
  dragDealId = null;
}
