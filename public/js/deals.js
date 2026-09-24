
// Urgency levels. Labels are looked up at render time so they follow the UI
// language; colours are design tokens (the card shows them as a 3px inset bar).
const DEAL_URGENCY = [
  { value: 0, label: () => t('urg_0'), color: 'transparent' },
  { value: 1, label: () => t('urg_1'), color: 'var(--success)' },
  { value: 2, label: () => t('urg_2'), color: 'var(--warning)' },
  { value: 3, label: () => t('urg_3'), color: 'var(--amber-500)' },
  { value: 4, label: () => t('urg_4'), color: 'var(--danger)' },
];
function urgencyMeta(v) {
  const n = parseInt(v, 10) || 0;
  return DEAL_URGENCY.find(u => u.value === n) || DEAL_URGENCY[0];
}
function urgencyDotHtml(v) {
  const m = urgencyMeta(v);
  return `<span class="urgency-dot urgency-dot-${m.value}" title="${esc(m.label())}"></span>`;
}

/* ── Pure helpers (unit-tested in tests/client/deal-board.test.js) ─────────── */
// Euro amount without decimals, in the UI language ("12.400 €" / "€12,400").
function fmtMoney(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat(currentLang === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}
// Up to two initials for the assignee avatar.
function initials(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
// Cards inside a stage: most urgent first, then newest. Order is automatic, so
// a drop never has to remember a position.
function sortStageDeals(list) {
  return [...list].sort((a, b) =>
    ((parseInt(b.urgency, 10) || 0) - (parseInt(a.urgency, 10) || 0)) ||
    String(b.created_at || '').localeCompare(String(a.created_at || '')));
}
function stageTotal(list) {
  return list.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
}
function currentStages() {
  return pipelines.find(p => p.id === currentPipelineId)?.stages || [];
}
function renderDealsCurrent() {
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

async function loadDeals() {
  const dealsBoard = document.getElementById('deals-board');
  const dealsList = document.getElementById('deals-list-view');
  if (dealsBoard) dealsBoard.innerHTML = '';
  if (dealsList) {
    const tbody = dealsList.querySelector('#deals-tbody');
    if (tbody) tbody.innerHTML = '';
    const thead = dealsList.querySelector('#deals-thead');
    if (thead) thead.innerHTML = '';
  }

  await ensureMembers();
  [pipelines, dealFields] = await Promise.all([
    api.get('/api/pipelines'),
    api.get('/api/deal-fields'),
  ]);
  dealKanbanFields = currentWorkspace?.deal_kanban_fields || ['contact', 'value'];

  const sel = document.getElementById('deals-pipeline-select');
  if (sel) {
    sel.innerHTML = `<option value="">${t('all_pipelines')}</option>` +
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
  renderDealsCurrent();
}

function setDealView(mode) {
  dealViewMode = mode;
  localStorage.setItem('dealViewMode', mode);
  closeDealCardMenu();
  document.getElementById('deals-board')?.classList.toggle('hidden', mode === 'list');
  document.getElementById('deals-list-view')?.classList.toggle('hidden', mode === 'kanban');
  document.getElementById('deals-pagination')?.classList.toggle('hidden', mode === 'kanban');
  for (const [id, on] of [['deal-view-kanban', mode === 'kanban'], ['deal-view-list', mode === 'list']]) {
    const btn = document.getElementById(id);
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on)); }
  }
  renderDealsCurrent();
}

// "12 deals · 152.400 €" under the page title, for whatever the pipeline filter shows.
function renderDealsSummary() {
  const el = document.getElementById('deals-summary');
  if (!el) return;
  const shown = applyDealSearch(deals);
  const n = shown.length;
  const count = n === 1 ? t('deals_count_one') : t('deals_count').replace('{n}', n);
  const total = stageTotal(shown);
  el.textContent = total ? `${count} · ${fmtMoney(total)}` : count;
}

function effectiveDealColumns() {
  const BUILTIN = [
    { key: 'stage',       label: () => t('col_stage'),      show: true  },
    { key: 'contact',     label: () => t('lbl_contact'),    show: true  },
    { key: 'value',       label: () => t('lbl_deal_value'), show: true  },
    { key: 'urgency',     label: () => t('urgency'),        show: true  },
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
      <span class="drag-handle">${UI_ICON.drag}</span>
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
  if (msgEl) { msgEl.textContent = 'Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
  renderDealsList();
}

/* ── List view: search, sort, pages ─────────────────────────────────────────
   The same shell as the contacts table: sentence-case sortable headers, a
   row that opens on click or Enter, an action cluster on hover, pagination.
   Search applies to the board too, so both views show the same deals.       */
let dealSortKey = null, dealSortDir = 'asc', dealPage = 1, dealSearch = '';

function onDealSearch() {
  dealSearch = (document.getElementById('deal-search')?.value || '').trim().toLowerCase();
  dealPage = 1;
  renderDealsCurrent();
}
function applyDealSearch(list) {
  if (!dealSearch) return list;
  return list.filter(d => (d.title || '').toLowerCase().includes(dealSearch) || (d.contact_name || '').toLowerCase().includes(dealSearch));
}
function getDealSortValue(d, key) {
  if (key === 'title')       return (d.title || '').toLowerCase();
  if (key === 'pipeline')    return (typeof pipelines !== 'undefined' ? pipelines.find(p => p.id === d.pipeline_id)?.name || '' : '').toLowerCase();
  if (key === 'stage')       return (d.stage_name || '').toLowerCase();
  if (key === 'contact')     return (d.contact_name || '').toLowerCase();
  if (key === 'value')       return d.value == null || d.value === '' ? null : Number(d.value);
  if (key === 'urgency')     return parseInt(d.urgency, 10) || 0;
  if (key === 'assigned_to') return (d.assigned_to_name || '').toLowerCase();
  if (key === 'created_at')  return d.created_at ? new Date(d.created_at).getTime() : 0;
  if (key.startsWith('custom:')) return String(d.custom_data?.[key.slice(7)] ?? '').toLowerCase();
  return '';
}
function sortDeals(list) {
  if (!dealSortKey) return list;
  return [...list].sort((a, b) => {
    const va = getDealSortValue(a, dealSortKey), vb = getDealSortValue(b, dealSortKey);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; if (vb == null) return -1;                 // empties sink in both directions
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dealSortDir === 'asc' ? cmp : -cmp;
  });
}
function toggleDealSort(key) {
  if (dealSortKey === key) { if (dealSortDir === 'asc') dealSortDir = 'desc'; else { dealSortKey = null; dealSortDir = 'asc'; } }
  else { dealSortKey = key; dealSortDir = 'asc'; }
  dealPage = 1;
  renderDealsList();
}
function goToDealPage(page) { dealPage = page; renderDealsList(); }
function onDealRowClick(e, id) { if (rowIsInteractive(e.target)) return; openDealModal(id); }
function onDealRowKey(e, id)   { if (e.key === 'Enter' && !rowIsInteractive(e.target)) { e.preventDefault(); openDealModal(id); } }

function renderDealsList() {
  const thead = document.getElementById('deals-thead'), tbody = document.getElementById('deals-tbody');
  if (!thead || !tbody) return;
  const visibleCols = effectiveDealColumns().filter(c => c.visible);
  const showPipeline = !currentPipelineId;
  const numeric = k => k === 'value';
  const head = [
    { key: 'title', label: t('col_title') },
    ...(showPipeline ? [{ key: 'pipeline', label: t('col_pipeline') }] : []),
    ...visibleCols.map(c => ({ key: c.key, label: esc(c.label()) })),
  ];
  thead.innerHTML = `<tr>
    ${head.map(h => tableHeadCell({ key: h.key, label: h.label, sortKey: dealSortKey, sortDir: dealSortDir, onSort: 'toggleDealSort', align: numeric(h.key) ? 'right' : 'left' })).join('')}
    <th class="th-actions"><span class="sr-only">${esc(t('col_actions'))}</span></th>
  </tr>`;
  renderDealsSummary();

  const list = sortDeals(applyDealSearch(deals));
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (dealPage > totalPages) dealPage = totalPages;
  const pageList = list.slice((dealPage - 1) * PAGE_SIZE, dealPage * PAGE_SIZE);
  const pag = document.getElementById('deals-pagination');
  if (pag) pag.innerHTML = paginationHtml({ total: list.length, page: dealPage, pageSize: PAGE_SIZE, goto: 'goToDealPage' });

  if (!pageList.length) {
    const filtered = !!dealSearch;
    tbody.innerHTML = `<tr class="table-empty-row"><td class="table-empty" colspan="${head.length + 1}">
      <div class="empty-state compact">
        <strong>${t(filtered ? 'empty_filtered_title' : 'empty_deals_title')}</strong>
        <span>${t(filtered ? 'empty_filtered_hint' : 'empty_deals_hint')}</span>
        ${filtered
          ? `<button type="button" class="btn btn-sm" onclick="document.getElementById('deal-search').value='';onDealSearch()">${t('btn_clear_filters')}</button>`
          : `<button type="button" class="btn btn-sm btn-primary" onclick="openDealModal()">${UI_ICON.plus}<span>${t('add_deal')}</span></button>`}
      </div></td></tr>`;
    return;
  }

  const dash = '<span class="muted-dash">—</span>';
  tbody.innerHTML = pageList.map(d => {
    const cells = visibleCols.map(col => {
      if (col.key === 'stage') {
        const badge = d.stage_name
          ? `<span class="stage-badge"><span class="stage-badge-dot" style="background:${d.stage_color}"></span>${esc(d.stage_name)}</span>`
          : dash;
        return `<td>${badge}</td>`;
      }
      if (col.key === 'urgency') {
        const m = urgencyMeta(d.urgency);
        return `<td>${m.value ? `${urgencyDotHtml(d.urgency)} <span class="urgency-label">${esc(m.label())}</span>` : dash}</td>`;
      }
      if (col.key === 'contact')     return `<td>${d.contact_name ? esc(d.contact_name) : dash}</td>`;
      if (col.key === 'value')       return `<td class="td-num">${d.value != null ? `<span class="td-money">${fmtMoney(d.value)}</span>` : dash}</td>`;
      if (col.key === 'assigned_to') return `<td>${d.assigned_to_name ? esc(d.assigned_to_name) : dash}</td>`;
      if (col.key === 'created_at')  return `<td class="td-muted">${fmtDate(d.created_at) || dash}</td>`;
      if (col.key.startsWith('custom:')) {
        const fk = col.key.slice(7);
        return `<td>${esc(d.custom_data?.[fk] ?? '') || dash}</td>`;
      }
      return `<td>${dash}</td>`;
    }).join('');

    return `<tr class="row" tabindex="0" data-id="${d.id}" onclick="onDealRowClick(event,${d.id})" onkeydown="onDealRowKey(event,${d.id})">
      <td class="name-cell" title="${esc(d.title)}">${esc(d.title)}</td>
      ${showPipeline ? `<td class="td-muted">${esc(pipelines.find(p => p.id === d.pipeline_id)?.name || '') || dash}</td>` : ''}
      ${cells}
      <td class="td-actions"><div class="row-actions">
        <button type="button" class="btn btn-sm btn-ghost btn-icon" title="${esc(t('card_menu'))}" aria-label="${esc(t('card_menu'))}" aria-haspopup="menu" aria-expanded="false" onclick="openDealCardMenu(event,${d.id})">${UI_ICON.more}</button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ── Board ───────────────────────────────────────────────────────────────────
   One column per stage: header (dot, name, count · total), the sorted cards,
   a "Move here" slot that only shows while a card is being dragged, and a
   ghost "Add deal" row that opens the modal on that stage.                  */
function renderDealsBoard() {
  const board = document.getElementById('deals-board');
  if (!board) return;
  closeDealCardMenu();
  renderDealsSummary();
  if (!pipelines.length) {
    board.innerHTML = `<div class="empty-state compact">${t('no_pipelines')}</div>`;
    return;
  }
  if (!currentPipelineId) {
    board.innerHTML = `<div class="empty-state compact">${t('select_pipeline_hint')}</div>`;
    return;
  }
  const pipeline = pipelines.find(p => p.id === currentPipelineId);
  if (!pipeline) return;

  const shown = applyDealSearch(deals);
  board.innerHTML = (pipeline.stages || []).map(stage => {
    const stageDeals = sortStageDeals(shown.filter(d => d.stage_id === stage.id));
    const total = stageTotal(stageDeals);
    return `
    <div class="pipeline-col" data-stage-id="${stage.id}"
      ondragenter="dealDragEnter(event)" ondragover="dealDragOver(event)" ondragleave="dealDragLeave(event)" ondrop="dealDrop(event,${stage.id})">
      <div class="col-header">
        <span class="col-dot" style="--stage:${esc(stage.color || '')}"></span>
        <span class="col-name" title="${esc(stage.name)}">${esc(stage.name)}</span>
        <span class="col-meta">
          <span class="col-count">${stageDeals.length}</span>
          ${total ? `<span class="col-total">${fmtMoney(total)}</span>` : ''}
        </span>
      </div>
      <div class="col-cards" role="list">
        ${stageDeals.length ? stageDeals.map(dealCard).join('') : `<div class="col-empty">${t('no_deals')}</div>`}
      </div>
      <div class="col-drop-slot" aria-hidden="true">${t('move_here')}</div>
      <button type="button" class="col-add-btn" onclick="openDealModal(null, { stageId: ${stage.id} })">${UI_ICON.plus}<span>${t('add_deal')}</span></button>
    </div>`;
  }).join('');
}

// A card carries identity, money and owner. Urgency is the inset bar on the
// left (class urgency-N); everything you can *do* to the deal lives in the
// ⋯ menu or in the modal the card opens.
function dealCard(d) {
  const urgency = parseInt(d.urgency, 10) || 0;
  const value = fmtMoney(d.value);
  const who = d.assigned_to_name || '';
  const label = esc(d.title) + (urgency ? `, ${esc(urgencyMeta(urgency).label())}` : '');
  return `
    <div class="deal-card urgency-${urgency}" draggable="true" tabindex="0" role="listitem" data-id="${d.id}" aria-label="${label}"
      ondragstart="dealDragStart(event,${d.id})" ondragend="dealDragEnd(event)"
      onclick="openDealModal(${d.id})" onkeydown="if(event.key==='Enter'){openDealModal(${d.id})}">
      <div class="deal-card-title">${esc(d.title)}</div>
      ${d.contact_name ? `<div class="deal-card-sub">${esc(d.contact_name)}</div>` : ''}
      ${(value || who) ? `<div class="deal-card-foot">
        <span class="deal-card-value">${value}</span>
        ${who ? `<span class="deal-card-avatar" title="${esc(who)}" aria-label="${esc(who)}">${esc(initials(who))}</span>` : ''}
      </div>` : ''}
      <button type="button" class="deal-card-menu-btn" draggable="false" aria-haspopup="menu" aria-expanded="false"
        aria-label="${t('card_menu')}" title="${t('card_menu')}"
        onmousedown="event.stopPropagation()" onkeydown="event.stopPropagation()"
        onclick="openDealCardMenu(event,${d.id})">${UI_ICON.more}</button>
    </div>`;
}

/* ── Card menu: Move to · Urgency · Delete ──────────────────────────────────
   One popover at a time, anchored under the ⋯ button, closed by Escape, an
   outside click, scrolling the board, or choosing an item. "Move to" is how
   touch and keyboard users move a deal, since HTML drag-and-drop is mouse-only. */
let dealMenuEl = null;
function closeDealCardMenu() {
  if (dealMenuEl) { dealMenuEl.remove(); dealMenuEl = null; }
  document.querySelectorAll('.deal-card-menu-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function openDealCardMenu(e, id) {
  e.stopPropagation();
  const btn = e.currentTarget;
  if (dealMenuEl && dealMenuEl.dataset.dealId === String(id)) { closeDealCardMenu(); return; }
  closeDealCardMenu();
  const deal = deals.find(d => d.id === id);
  if (!deal) return;
  const stages = currentStages();
  const urgency = parseInt(deal.urgency, 10) || 0;
  const menu = document.createElement('div');
  menu.className = 'card-menu';
  menu.setAttribute('role', 'menu');
  menu.dataset.dealId = String(id);
  menu.innerHTML = `
    ${stages.length > 1 ? `<div class="card-menu-label">${t('move_to')}</div>` + stages.map(s => `
      <button type="button" class="card-menu-item" role="menuitemradio" aria-checked="${s.id === deal.stage_id}" ${s.id === deal.stage_id ? 'disabled' : ''}
        onclick="closeDealCardMenu();moveDealToStage(${id},${s.id})">
        <span class="col-dot" style="--stage:${esc(s.color || '')}"></span><span>${esc(s.name)}</span>${s.id === deal.stage_id ? UI_ICON.check : ''}
      </button>`).join('') + '<div class="card-menu-sep"></div>' : ''}
    <div class="card-menu-label">${t('urgency')}</div>
    ${DEAL_URGENCY.map(u => `
      <button type="button" class="card-menu-item" role="menuitemradio" aria-checked="${u.value === urgency}"
        onclick="closeDealCardMenu();setDealUrgency(${id},${u.value})">
        <span class="urgency-dot urgency-dot-${u.value}"></span><span>${esc(u.label())}</span>${u.value === urgency ? UI_ICON.check : ''}
      </button>`).join('')}
    <div class="card-menu-sep"></div>
    <button type="button" class="card-menu-item danger" role="menuitem" onclick="closeDealCardMenu();deleteDeal(${id})">${UI_ICON.remove}<span>${t('delete_deal')}</span></button>`;
  document.body.appendChild(menu);
  // Anchor under the button, right-aligned; flip above it when there is no room below.
  const r = btn.getBoundingClientRect(), m = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
  const below = r.bottom + 4 + m.height <= window.innerHeight - 8;
  menu.style.left = `${left}px`;
  menu.style.top  = `${below ? r.bottom + 4 : Math.max(8, r.top - 4 - m.height)}px`;
  btn.setAttribute('aria-expanded', 'true');
  dealMenuEl = menu;
  menu.querySelector('.card-menu-item:not([disabled])')?.focus();
}
document.addEventListener('click',   e => { if (dealMenuEl && !dealMenuEl.contains(e.target)) closeDealCardMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && dealMenuEl) closeDealCardMenu(); });
document.getElementById('deals-board')?.addEventListener('scroll', closeDealCardMenu, true);

function showBoardNotice(msg) {
  const el = document.getElementById('deals-board-notice');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showBoardNotice._t);
  showBoardNotice._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

async function setDealUrgency(dealId, value) {
  const urgency = parseInt(value, 10) || 0;
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  deal.urgency = urgency;
  // Update the one card in place (the column re-sorts on the next render); the list re-renders.
  const card = document.querySelector(`.deal-card[data-id="${dealId}"]`);
  if (card) {
    card.className = card.className.replace(/\burgency-\d\b/, `urgency-${urgency}`);
    card.setAttribute('aria-label', esc(deal.title) + (urgency ? `, ${esc(urgencyMeta(urgency).label())}` : ''));
  }
  if (dealViewMode === 'list') renderDealsList();
  const res = await api.patch(`/api/deals/${dealId}/urgency`, { urgency });
  if (res && res.error) {
    const fresh = await api.get(currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals');
    if (Array.isArray(fresh)) deals = fresh;
    renderDealsCurrent();
  }
}

/* ── Drag and drop ──────────────────────────────────────────────────────────
   While a card is dragged the board carries .is-dragging (which reveals the
   "Move here" slots), the origin card stays as a dashed ghost, and the column
   under the pointer carries .drag-over. Enter/leave are counted per column so
   crossing child cards does not flicker. State is cleared on every path.     */
function finishDealDrag() {
  dragDealId = null;
  const board = document.getElementById('deals-board');
  board?.classList.remove('is-dragging');
  board?.querySelectorAll('.pipeline-col.drag-over, .pipeline-col.is-origin').forEach(col => {
    col.classList.remove('drag-over', 'is-origin'); col.dataset.over = '0';
  });
  board?.querySelectorAll('.deal-card.dragging').forEach(c => c.classList.remove('dragging'));
}
function dealDragStart(e, id) {
  const card = e.target.closest('.deal-card');
  dragDealId = id;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(id)); } catch { /* older engines */ }
  // Deferred so the browser snapshots the un-dimmed card as the drag image.
  setTimeout(() => {
    card?.classList.add('dragging');
    card?.closest('.pipeline-col')?.classList.add('is-origin');
    document.getElementById('deals-board')?.classList.add('is-dragging');
  }, 0);
}
function dealDragEnd(e) { e.target.closest('.deal-card')?.classList.remove('dragging'); finishDealDrag(); }
function dealDragEnter(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.dataset.over = String((parseInt(col.dataset.over, 10) || 0) + 1);
  col.classList.add('drag-over');
}
function dealDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function dealDragLeave(e) {
  const col = e.currentTarget;
  const n = Math.max(0, (parseInt(col.dataset.over, 10) || 0) - 1);
  col.dataset.over = String(n);
  if (!n) col.classList.remove('drag-over');
}

// The menu's "Move to" goes through the same code path as a drop.
function moveDealToStage(id, stageId) {
  dragDealId = id;
  return dealDrop({ preventDefault() {}, currentTarget: null }, stageId);
}

async function dealDrop(e, stageId) {
  e.preventDefault();
  const id = dragDealId;
  if (!id) { finishDealDrag(); return; }
  const deal = deals.find(d => d.id === id);
  if (!deal || deal.stage_id === stageId) { finishDealDrag(); return; }
  const prevStageId = deal.stage_id;                        // remembered before the optimistic update (put back on error)
  const prev = { name: deal.stage_name, color: deal.stage_color };
  deal.stage_id = stageId;
  const stage = currentStages().find(s => s.id === stageId);
  deal.stage_name  = stage?.name  || null;
  deal.stage_color = stage?.color || null;
  finishDealDrag();
  renderDealsCurrent();
  const res = await api.patch(`/api/deals/${id}/stage`, { stage_id: stageId });
  if (res?.error) {
    // The server refused: put the card back and say so.
    deal.stage_id = prevStageId; deal.stage_name = prev.name; deal.stage_color = prev.color;
    renderDealsCurrent();
    showBoardNotice(t('deal_move_failed'));
  }
}
