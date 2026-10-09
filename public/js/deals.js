/* ═══════════════════════════════════════════════════════════════════════════
   DEALS — board + list, ported from reference/pro/src/screens/deals.js.
   Data: GET /api/deals (title, value, contact_name/company, stage_*, assigned_to*,
   urgency, custom_data, created_at, updated_at) and /api/pipelines with ordered
   stages. The deal modal (openDealModal / saveDeal in modals.js) is untouched.
   ═══════════════════════════════════════════════════════════════════════════ */
/* ENTRY POINT  loadDeals(), called by switchPage('deals'). It fetches the
   pipelines, the deal fields and the deals, then setDealView() picks board or
   list (remembered in localStorage.dealViewMode) and renderDeals() paints the
   sub-line, the summary, the toolbar and the chosen view.

   STATE  dealsUI holds the filters, the sort, the selection and the summary
   toggle. visibleDeals() applies all of it and is the function to read if you
   want to know what is on screen. currentPipelineId is null when the pipeline
   picker is on "All pipelines" — only possible in list mode, which is why
   summaryStages() falls back to every pipeline's stages there.

   FUNCTION MAP
     data/format   urgencyMeta, urgencyLabel, urgencyBadge, fmtEUR,
                   fmtEURShort, fmtDateShort, agoDays, sumValue
     pipelines     currentPipeline, stagesOf, summaryStages,
                   populatePipelineSelect, onPipelineChange
     state         visibleDeals, dealsKpis, loadDeals, setDealView, renderDeals
     columns       effectiveDealColumns, renderDealColumnSettings,
                   dealColDragStart, dealColDrop, dealColToggle,
                   saveDealColumns, openDealsColumnsMenu
     summary       renderDealsSummary, toggleDealsSummary, jumpToStage
     toolbar       renderDealsToolbar, dealFilterFields, dealsFilterActive,
                   dealsChip, openDealsChip, onDealsSearch, clearDealsFilters
     board         renderDealsBoard, dealCard, addDealInStage, openDealKebab,
                   applyStage, moveDealToStage, setDealUrgency
     list          renderDealsList, sortDeals, sortDealsBy, toggleDealSelected,
                   toggleAllDeals, bulkDeals
     drag & drop   dealDragStart, dealDragEnd, dealDragOver, dealDragLeave,
                   dealDrop   (drop = PATCH /api/deals/:id/stage)
     autoscroll    dealEdgeScrollDelta, dealAutoScrollMove, dealAutoScrollStart,
                   dealAutoScrollStop   (the board scrolls while a card is dragged near an edge)
     misc          deleteDeals, openDealsMoreMenu, exportDealsCsv

   NOTE  moving a deal into a trigger stage makes the SERVER fire an outbound
   Engine event (routes/deals.js → utils/engine.js). Nothing here does that,
   but it is why a stage change is never "just a UI update".
   The deal form and detail drawer live in detail-views.js. */

// `color` feeds the modal's urgency dot (next step); `tone` is the badge tone (reference data.js).
const DEAL_URGENCY = [
  { value: 0, label: 'No urgency',  color: 'transparent',    tone: 'neutral' },
  { value: 1, label: 'Low',         color: 'var(--success)', tone: 'neutral' },
  { value: 2, label: 'Medium',      color: 'var(--warning)', tone: 'info' },
  { value: 3, label: 'High',        color: '#f59e0b',        tone: 'warning' },
  { value: 4, label: 'Very urgent', color: 'var(--danger)',  tone: 'danger' },
];
function urgencyMeta(v) {
  const n = parseInt(v, 10) || 0;
  return DEAL_URGENCY.find(u => u.value === n) || DEAL_URGENCY[0];
}
function urgencyLabel(m) { const k = 'urg_' + m.value, s = t(k); return s === k ? m.label : s; }
// Badge for urgency 1–4 (nothing for 0): the reference's tone badges.
function urgencyBadge(v) {
  const n = parseInt(v, 10) || 0;
  if (!n) return '';
  const m = urgencyMeta(n);
  return `<span class="badge badge-${m.tone}">${esc(urgencyLabel(m))}</span>`;
}

/* ---------- formatting (reference data.js) ---------- */
function fmtEUR(n) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0);
}
function fmtEURShort(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M €';
  if (v >= 1e3) return (v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'k €';
  return fmtEUR(v);
}
function fmtDateShort(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(currentLang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short' });
}
function agoDays(ts) {
  if (!ts) return '';
  const L = currentLang === 'de'
    ? { today: 'Heute', yesterday: 'Gestern', days: n => `vor ${n} Tagen`, week: 'vor 1 Woche', weeks: n => `vor ${n} Wochen`, months: n => `vor ${n} Monaten` }
    : { today: 'Today', yesterday: 'Yesterday', days: n => `${n} days ago`, week: '1 week ago', weeks: n => `${n} weeks ago`, months: n => `${n} months ago` };
  const day = x => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const d = Math.max(0, Math.round((day(Date.now()) - day(ts)) / 86400000));
  return d === 0 ? L.today : d === 1 ? L.yesterday : d < 7 ? L.days(d) : d < 14 ? L.week : d < 60 ? L.weeks(Math.round(d / 7)) : L.months(Math.round(d / 30));
}
function sumValue(list) { return list.reduce((s, d) => s + (Number(d.value) || 0), 0); }

/* ---------- state ---------- */
// Filters, sort, selection and the summary toggle of the Deals page (per tab; the summary toggle is remembered).
let dealsUI = { q: '', owner: null, urgency: null, stage: null, cf: {}, sort: { key: 'created_at', dir: -1 }, sel: new Set(), summary: localStorage.getItem('dealsSummary') !== '0' };
let dealsSearchTimer = null;

function currentPipeline() { return pipelines.find(p => p.id === currentPipelineId) || null; }
function stagesOf(d) { return pipelines.find(p => p.id === d.pipeline_id)?.stages || []; }
// The stages the summary strip charts and the stage chip offers. With one pipeline selected those
// are its stages; on "All pipelines" (list mode only) every pipeline's, name-prefixed so two
// pipelines' "Won" stay apart. An entry is always a single stage, so filtering by `id` still works.
function summaryStages() {
  const p = currentPipeline();
  if (p) return (p.stages || []).map(s => ({ ...s, label: s.name }));
  return pipelines.flatMap(pl => (pl.stages || []).map(s => ({ ...s, label: `${pl.name} · ${s.name}` })));
}

// The deals the filters let through (search over title, contact and company; owner; urgency at least; stage).
function visibleDeals() {
  const q = String(dealsUI.q || '').trim().toLowerCase();
  return deals.filter(d => {
    if (q && !`${d.title || ''} ${d.contact_name || ''} ${d.contact_company || ''}`.toLowerCase().includes(q)) return false;
    if (dealsUI.owner != null && (d.assigned_to ?? '') !== dealsUI.owner) return false;
    if (dealsUI.urgency != null && (parseInt(d.urgency, 10) || 0) < dealsUI.urgency) return false;
    if (dealsUI.stage != null && (d.stage_id ?? '') !== dealsUI.stage) return false;
    for (const [k, v] of Object.entries(dealsUI.cf || {})) { if (v != null && v !== '' && String(d.custom_data?.[k] ?? '') !== v) return false; }
    return true;
  });
}
// Summary numbers: total value, count, average over the deals that have a value, deals at High or above.
function dealsKpis(list) {
  const valued = list.filter(d => d.value != null && d.value !== '');
  const value = sumValue(list);
  return { value, count: list.length, avg: valued.length ? Math.round(value / valued.length) : 0, urgent: list.filter(d => (parseInt(d.urgency, 10) || 0) >= 3).length };
}

/* ---------- loading ---------- */
async function loadDeals() {
  const dealsBoard = document.getElementById('deals-board');
  if (dealsBoard) dealsBoard.innerHTML = '';
  const tbody = document.getElementById('deals-tbody'), thead = document.getElementById('deals-thead');
  if (tbody) tbody.innerHTML = '';
  if (thead) thead.innerHTML = '';

  await ensureMembers();
  [pipelines, dealFields] = await Promise.all([
    api.get('/api/pipelines'),
    api.get('/api/deal-fields'),
  ]);
  dealKanbanFields = currentWorkspace?.deal_kanban_fields || ['contact', 'value'];

  populatePipelineSelect();

  const url = currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals';
  deals = await api.get(url);
  dealsUI.sel.clear();
  if (dealsUI.stage !== null && dealsUI.stage !== '' && !summaryStages().some(s => s.id === dealsUI.stage)) dealsUI.stage = null;
  setDealView(dealViewMode);
}

// Board mode always shows one pipeline's stages, so "All pipelines" would always render
// empty there — it's only offered in list mode, which can mix deals from every pipeline.
function populatePipelineSelect() {
  const sel = document.getElementById('deals-pipeline-select');
  if (!sel) return;
  sel.innerHTML = (dealViewMode === 'kanban' ? '' : `<option value="">${esc(t('opt_all_pipelines'))}</option>`) +
    pipelines.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (dealViewMode === 'kanban' && !currentPipelineId && pipelines.length)
    currentPipelineId = pipelines[0].id;
  if (currentPipelineId && !pipelines.find(p => p.id === currentPipelineId))
    currentPipelineId = null;
  sel.value = currentPipelineId || '';
}

async function onPipelineChange() {
  const sel = document.getElementById('deals-pipeline-select');
  currentPipelineId = sel.value ? parseInt(sel.value) : null;
  const url = currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals';
  deals = await api.get(url);
  dealsUI.sel.clear(); dealsUI.stage = null;
  renderDeals();
}

async function setDealView(mode) {
  dealViewMode = mode;
  localStorage.setItem('dealViewMode', mode);
  document.getElementById('deals-board')?.classList.toggle('hidden', mode === 'list');
  document.getElementById('deals-list-view')?.classList.toggle('hidden', mode === 'kanban');
  document.getElementById('deal-view-kanban')?.setAttribute('aria-pressed', String(mode === 'kanban'));
  document.getElementById('deal-view-list')?.setAttribute('aria-pressed', String(mode === 'list'));
  const prevPipelineId = currentPipelineId;
  populatePipelineSelect();
  if (currentPipelineId !== prevPipelineId) {
    const url = currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals';
    deals = await api.get(url);
    dealsUI.sel.clear(); dealsUI.stage = null;
  }
  renderDeals();
}

// Everything on the page below the header: sub line, summary, toolbar, and the board or the list.
function renderDeals() {
  const sub = document.getElementById('deals-page-sub');
  if (sub) sub.textContent = currentPipeline() ? tf('deals_in_pipeline', { n: deals.length, p: currentPipeline().name }) : tf('deals_all_pipelines', { n: deals.length });
  renderDealsSummary();
  renderDealsToolbar();
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

/* ---------- list columns (shared with Settings → Deals) ---------- */
function effectiveDealColumns() {
  const BUILTIN = [
    { key: 'stage',       label: () => t('col_stage'),      show: true  },
    { key: 'contact',     label: () => t('lbl_contact'),    show: true  },
    { key: 'value',       label: () => t('lbl_deal_value'), show: true  },
    { key: 'urgency',     label: () => t('col_urgency'),    show: true  },
    { key: 'assigned_to', label: () => t('col_owner'),      show: true  },
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

// The toolbar's Columns menu: the same preference the Settings page edits, toggled in place.
function openDealsColumnsMenu(anchor) {
  const cols = effectiveDealColumns();
  ui.menu(anchor, cols.map((c, i) => ({ label: c.label(), checked: c.visible, onSelect: async () => {
    cols[i].visible = !cols[i].visible;
    dealColumns = cols.map(({ key, visible }) => ({ key, visible }));
    renderDealsList();
    const res = await api.patch('/api/auth/preferences', { deal_columns: dealColumns });
    if (!res?.error && currentUser) currentUser.deal_columns = dealColumns;
  } })), { align: 'right' });
}

/* ---------- summary ---------- */
function renderDealsSummary() {
  const el = document.getElementById('deals-summary');
  if (!el) return;
  el.classList.toggle('hidden', !dealsUI.summary);
  if (!dealsUI.summary) { el.innerHTML = ''; return; }
  const all = deals, k = dealsKpis(all), total = k.value || 1, stages = summaryStages();
  const kpi = (label, value, foot) => `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div><div class="kpi-foot">${esc(foot)}</div></div>`;
  el.innerHTML = `<div class="kpis">
      ${kpi(t('kpi_pipeline_value'), fmtEURShort(k.value), currentPipeline() ? currentPipeline().name : t('opt_all_pipelines'))}
      ${kpi(t('kpi_deals'), String(k.count), t('kpi_deals_foot'))}
      ${kpi(t('kpi_avg_deal'), fmtEURShort(k.avg), t('kpi_avg_foot'))}
      ${kpi(t('kpi_urgent'), String(k.urgent), t('kpi_urgent_foot'))}
    </div>` + (stages.length ? `<div class="strip">
      <div class="stack" role="img" aria-label="${esc(t('strip_label'))}">${stages.map(s => { const v = sumValue(all.filter(d => d.stage_id === s.id)); return `<button type="button" style="flex:${Math.max(v, total * .015)};background:${esc(s.color)}" data-jump="${s.id}" onclick="jumpToStage(${s.id})" title="${esc(s.label)}: ${fmtEURShort(v)}" aria-label="${esc(s.label)}"></button>`; }).join('')}</div>
      <div class="stack-legend">${stages.map(s => { const a = all.filter(d => d.stage_id === s.id); return `<button type="button" data-jump="${s.id}" onclick="jumpToStage(${s.id})"><div class="nm"><i style="background:${esc(s.color)}"></i>${esc(s.label)}</div><div class="v">${fmtEURShort(sumValue(a))}</div><div class="c">${esc(tf('n_deals', { n: a.length }))}</div></button>`; }).join('')}</div>
    </div>` : '');
}
function toggleDealsSummary() {
  dealsUI.summary = !dealsUI.summary;
  localStorage.setItem('dealsSummary', dealsUI.summary ? '1' : '0');
  renderDealsSummary(); renderDealsToolbar();
}
// A click on the stage strip or legend scrolls that column into view. The list has no column to
// scroll to, so there the stage toggles the stage filter instead of yanking the user to the board.
function jumpToStage(stageId) {
  if (dealViewMode === 'list') {
    dealsUI.stage = dealsUI.stage === stageId ? null : stageId;
    renderDeals();
    return;
  }
  document.querySelector(`#deals-board .col-board[data-stage="${stageId}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

/* ---------- toolbar ---------- */
function renderDealsToolbar() {
  const el = document.getElementById('deals-toolbar');
  if (!el) return;
  const active = document.activeElement && document.activeElement.id === 'deals-q';
  const any = dealsFilterActive();
  el.innerHTML = `<div class="input-group" style="width:260px">${icon('search')}<input class="input" id="deals-q" type="search" placeholder="${esc(t('search_deals'))}" value="${esc(dealsUI.q)}" aria-label="${esc(t('search_deals'))}" oninput="onDealsSearch(this.value)"></div>
    ${dealsChip('owner')}${dealsChip('urgency')}${dealsChip('stage')}${dealFilterFields().map(f => dealsChip('cf:' + f.field_key, f.name)).join('')}
    ${any ? `<button class="btn btn-ghost btn-sm" type="button" onclick="clearDealsFilters()">${esc(t('clear_filters'))}</button>` : ''}<span class="grow"></span>
    ${dealViewMode === 'list' ? `<button class="btn btn-secondary btn-sm" type="button" onclick="openDealsColumnsMenu(this)" aria-haspopup="menu">${icon('columns')}${esc(t('btn_columns'))}</button>` : ''}
    <button class="btn btn-secondary btn-sm" type="button" onclick="toggleDealsSummary()" aria-pressed="${dealsUI.summary}">${icon('bar-chart')}${esc(t(dealsUI.summary ? 'hide_summary' : 'show_summary'))}</button>`;
  if (active) { const q = document.getElementById('deals-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
// Custom deal dropdown fields get a chip each — the generic form of the reference's fixed "Source" chip.
function dealFilterFields() { return dealFields.filter(f => f.type === 'dropdown' && f.options?.length); }
function dealsFilterActive() {
  return !!(dealsUI.q || dealsUI.owner != null || dealsUI.urgency != null || dealsUI.stage != null
    || Object.values(dealsUI.cf || {}).some(v => v != null && v !== ''));
}
function dealsChip(key, label) {
  const cf = key.startsWith('cf:'), v = cf ? dealsUI.cf?.[key.slice(3)] : dealsUI[key];
  const on = v != null && v !== '' || (!cf && v === '');
  let txt = '';
  if (on) txt = cf ? String(v)
    : v === '' ? t('detail_unassigned')
    : key === 'owner' ? (members.find(m => m.id === v)?.name || '')
    : key === 'urgency' ? `${urgencyLabel(urgencyMeta(v))} ${t('or_higher')}`
    : (summaryStages().find(s => s.id === v)?.label || '');
  return `<button class="chip ${on ? 'on' : ''}" type="button" data-chip="${esc(key)}" onclick="openDealsChip(this,'${esc(key)}')" aria-haspopup="menu">${esc(label || t('chip_' + key))}${on ? ': ' + esc(txt) : ''}${icon('chevron-down', 'ic-sm')}</button>`;
}
function openDealsChip(anchor, key) {
  const unassigned = { value: '', label: t('detail_unassigned') };
  let opts, cur, set;
  if (key.startsWith('cf:')) {
    const f = dealFields.find(x => x.field_key === key.slice(3)); if (!f) return;
    opts = (f.options || []).map(o => ({ value: o, label: o }));
    cur = dealsUI.cf?.[f.field_key] ?? null;
    set = v => { dealsUI.cf = { ...(dealsUI.cf || {}), [f.field_key]: v }; };
  } else if (key === 'owner') {
    opts = [unassigned, ...members.map(m => ({ value: m.id, label: m.name + (m.id === currentUser?.id ? ' (you)' : '') }))];
    cur = dealsUI.owner ?? null; set = v => { dealsUI.owner = v; };
  } else if (key === 'urgency') {
    opts = [1, 2, 3, 4].map(i => ({ value: i, label: `${urgencyLabel(urgencyMeta(i))} ${t('or_higher')}` }));
    cur = dealsUI.urgency ?? null; set = v => { dealsUI.urgency = v; };
  } else {
    opts = [unassigned, ...summaryStages().map(st => ({ value: st.id, label: st.label }))];
    cur = dealsUI.stage ?? null; set = v => { dealsUI.stage = v; };
  }
  ui.select(anchor, [{ value: null, label: t('filter_all') }, ...opts], cur, v => { set(v); renderDeals(); });
}
function onDealsSearch(value) {
  dealsUI.q = value;
  clearTimeout(dealsSearchTimer);
  dealsSearchTimer = setTimeout(renderDeals, 120);
}
function clearDealsFilters() {
  dealsUI.q = ''; dealsUI.owner = dealsUI.urgency = dealsUI.stage = null; dealsUI.cf = {};
  renderDeals();
}

/* ---------- board ---------- */
function renderDealsBoard() {
  const board = document.getElementById('deals-board');
  if (!board) return;
  if (!pipelines.length) {
    board.innerHTML = `<div class="empty" style="flex:1">${icon('deals')}<b>${esc(t('no_pipelines'))}</b></div>`;
    return;
  }
  const pipeline = currentPipeline();
  if (!pipeline) {
    board.innerHTML = `<div class="empty" style="flex:1">${icon('kanban')}<b>${esc(t('no_pipeline_selected'))}</b></div>`;
    return;
  }
  const list = visibleDeals(), total = sumValue(deals) || 1;
  board.innerHTML = (pipeline.stages || []).map(stage => {
    const items = list.filter(d => d.stage_id === stage.id), v = sumValue(items);
    return `<section class="col-board" data-stage="${stage.id}" aria-label="${esc(stage.name)}" ondragover="dealDragOver(event)" ondragleave="dealDragLeave(event)" ondrop="dealDrop(event,${stage.id})">
      <div class="col-head"><i style="width:9px;height:9px;border-radius:50%;background:${esc(stage.color)}"></i><span class="nm">${esc(stage.name)}</span><span class="cnt">${items.length}</span>
        <button class="iconbtn" type="button" style="margin-left:auto;width:28px;height:28px" data-add="${stage.id}" onclick="addDealInStage(${stage.id})" aria-label="${esc(t('add_deal'))}: ${esc(stage.name)}">${icon('plus')}</button></div>
      <div class="col-sum">${fmtEURShort(v)}</div><div class="col-bar"><i style="width:${Math.round(v / total * 100)}%;background:${esc(stage.color)}"></i></div>
      <div class="col-cards">${items.length ? items.map(dealCard).join('') : `<div class="muted" style="text-align:center;padding:24px 8px;font-size:var(--fs-sm)">${esc(t('no_deals'))}</div>`}</div>
    </section>`;
  }).join('');
}

// Every SET urgency (1–4) is marked on the card — stripe + badge — so the board
// shows what to take care of first; only 0 "No urgency" is unmarked. This used
// to gate on u >= 3, which hid Low and Medium and made them look like "none".
// The badge is urgencyBadge(u), the same call the list view makes (it returns
// '' for 0 itself). Pinned by tests/client/deals-urgency-visibility.test.js.
function dealCard(d) {
  const u = parseInt(d.urgency, 10) || 0, m = urgencyMeta(u);
  const who = d.contact_name ? esc(d.contact_name) + (d.contact_company ? ', ' + esc(d.contact_company) : '') : esc(t('no_contact'));
  return `<div class="dcard" draggable="true" tabindex="0" role="button" data-id="${d.id}" aria-label="${esc(d.title)}, ${fmtEUR(d.value)}"
      ondragstart="dealDragStart(event,${d.id})" ondragend="dealDragEnd(event)" onclick="openDealModal(${d.id})"
      onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openDealModal(${d.id});}">
    ${u > 0 ? `<span class="urg urg-${u}" title="${esc(urgencyLabel(m))}"></span>` : ''}
    <button class="iconbtn kebab" type="button" onclick="event.stopPropagation();openDealKebab(this,${d.id})" aria-label="${esc(t('open_deal'))}: ${esc(d.title)}">${icon('ellipsis')}</button>
    <div class="dcard-title" style="padding-right:22px">${esc(d.title)}</div>
    <div class="dcard-meta truncate">${who}</div>
    <div class="dcard-foot"><span class="dcard-value">${d.value != null ? fmtEUR(d.value) : '<span class="muted">—</span>'}</span>${urgencyBadge(u)}<span style="margin-left:auto">${avatar(d.assigned_to_name, 'sm')}</span></div>
    <div class="dcard-sub"><span class="row" style="gap:5px" title="${esc(t('created_lbl'))}">${icon('calendar')}${fmtDateShort(d.created_at)}</span><span class="row" style="gap:5px" title="${esc(t('updated_lbl'))}">${icon('clock')}${agoDays(d.updated_at || d.created_at)}</span></div>
  </div>`;
}

// The + in a column header: the existing deal modal, with pipeline and stage preselected.
async function addDealInStage(stageId) {
  await openDealForm({ pipelineId: currentPipelineId, stageId });
}

/* ---------- card / row menu ---------- */
function openDealKebab(anchor, id) {
  const d = deals.find(x => x.id === id);
  if (!d) return;
  const stages = stagesOf(d);
  ui.menu(anchor, [
    { label: t('open_deal'), icon: 'external', onSelect: () => openDealModal(id) },
    ...(stages.length ? [{ heading: t('move_to_stage') }, ...stages.map(s => ({ label: s.name, checked: s.id === d.stage_id, onSelect: () => moveDealToStage(id, s.id) }))] : []),
    { sep: true },
    { label: t('set_urgency'), icon: 'flag', onSelect: () => ui.select(anchor, DEAL_URGENCY.map(u => ({ value: u.value, label: urgencyLabel(u) })), parseInt(d.urgency, 10) || 0, v => setDealUrgency(id, v)) },
    { sep: true },
    { label: t('delete_deal'), icon: 'trash', danger: true, onSelect: () => deleteDeals([id]) },
  ], { align: 'right' });
}

function applyStage(deal, stageId) {
  const stage = stagesOf(deal).find(s => s.id === stageId);
  deal.stage_id = stageId; deal.stage_name = stage?.name || null; deal.stage_color = stage?.color || null;
}
// The board blurs and ignores input while a stage PATCH is in flight (CSS on
// #deals-board[aria-busy="true"]). Counted, so overlapping moves (a drop while
// an Undo is still saving) keep it busy until the last one lands.
let boardBusyCount = 0;
function setBoardBusy(on) {
  boardBusyCount = Math.max(0, boardBusyCount + (on ? 1 : -1));
  const board = document.getElementById('deals-board');
  if (!board) return;
  if (boardBusyCount > 0) board.setAttribute('aria-busy', 'true'); else board.removeAttribute('aria-busy');
}
async function patchStage(id, stageId) {
  setBoardBusy(true);
  try { return await api.patch(`/api/deals/${id}/stage`, { stage_id: stageId }); }
  finally { setBoardBusy(false); }
}
// Optimistic move with a toast and Undo; a failed PATCH puts the deal back.
async function moveDealToStage(id, stageId) {
  const deal = deals.find(d => d.id === id);
  if (!deal || deal.stage_id === stageId) return;
  const prev = { stage_id: deal.stage_id, stage_name: deal.stage_name, stage_color: deal.stage_color };
  applyStage(deal, stageId); renderDeals();
  const res = await patchStage(id, stageId);
  if (res && res.error) { Object.assign(deal, prev); renderDeals(); return; }
  ui.toast(tf('moved_to', { s: deal.stage_name || '' }), { action: { label: t('undo'), onClick: async () => {
    Object.assign(deal, prev); renderDeals();
    await patchStage(id, prev.stage_id);
  } } });
}

async function setDealUrgency(dealId, value) {
  const urgency = parseInt(value, 10) || 0;
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  deal.urgency = urgency;
  renderDeals();
  const res = await api.patch(`/api/deals/${dealId}/urgency`, { urgency });
  if (res && res.error) {
    const fresh = await api.get(`/api/deals?pipeline_id=${currentPipelineId || ''}`);
    if (fresh) deals = fresh;
    renderDeals();
  }
}

async function deleteDeals(ids) {
  const ok = await ui.confirm({ title: ids.length > 1 ? tf('delete_deals_q', { n: ids.length }) : t('delete_deal_q'), message: t('delete_deal_msg'), confirmLabel: t('btn_delete'), danger: true });
  if (!ok) return;
  await Promise.all(ids.map(id => api.del(`/api/deals/${id}`)));
  deals = deals.filter(d => !ids.includes(d.id));
  ids.forEach(id => dealsUI.sel.delete(id));
  renderDeals();
  ui.toast(ids.length > 1 ? tf('deals_deleted', { n: ids.length }) : t('deal_deleted'));
}

/* ---------- list ---------- */
function sortDeals(rows) {
  const { key, dir } = dealsUI.sort;
  const val = d => {
    if (key === 'title')       return (d.title || '').toLowerCase();
    if (key === 'stage')       return stagesOf(d).findIndex(s => s.id === d.stage_id);
    if (key === 'value')       return Number(d.value) || 0;
    if (key === 'urgency')     return parseInt(d.urgency, 10) || 0;
    if (key === 'assigned_to') return (d.assigned_to_name || '').toLowerCase();
    if (key === 'contact')     return (d.contact_name || '').toLowerCase();
    if (key === 'created_at')  return d.created_at || '';
    if (key === 'pipeline')    return (pipelines.find(p => p.id === d.pipeline_id)?.name || '').toLowerCase();
    if (key.startsWith('custom:')) return String(d.custom_data?.[key.slice(7)] ?? '').toLowerCase();
    return '';
  };
  return [...rows].sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
}
function sortDealsBy(key) {
  dealsUI.sort = { key, dir: dealsUI.sort.key === key ? -dealsUI.sort.dir : 1 };
  renderDealsList();
}
function toggleDealSelected(id, on) { if (on) dealsUI.sel.add(id); else dealsUI.sel.delete(id); renderDealsList(); }
function toggleAllDeals(on) { visibleDeals().forEach(d => on ? dealsUI.sel.add(d.id) : dealsUI.sel.delete(d.id)); renderDealsList(); }

function renderDealsList() {
  const thead = document.getElementById('deals-thead'), tbody = document.getElementById('deals-tbody');
  const foot = document.getElementById('deals-list-foot'), bulk = document.getElementById('deals-bulkbar');
  if (!thead || !tbody) return;
  const visibleCols = effectiveDealColumns().filter(c => c.visible);
  const showPipeline = !currentPipelineId;
  const rows = sortDeals(visibleDeals());
  const sel = dealsUI.sel;
  for (const id of [...sel]) if (!deals.some(d => d.id === id)) sel.delete(id);
  const dash = '<span class="muted">—</span>';

  const th = (key, label, cls = '') => {
    const on = dealsUI.sort.key === key;
    return `<th class="${cls}" aria-sort="${on ? (dealsUI.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${key}" onclick="sortDealsBy('${esc(key)}')">${esc(label)}${on ? icon(dealsUI.sort.dir > 0 ? 'arrow-up' : 'arrow-down', 'ic-sm') : ''}</button></th>`;
  };
  const allSel = rows.length > 0 && rows.every(d => sel.has(d.id));
  thead.innerHTML = `<tr>
    <th class="col-check"><label class="check"><input type="checkbox" data-all aria-label="${esc(t('filter_all'))}" onchange="toggleAllDeals(this.checked)" ${allSel ? 'checked' : ''}></label></th>
    ${th('title', t('col_title'))}${showPipeline ? th('pipeline', t('col_pipeline')) : ''}
    ${visibleCols.map(c => th(c.key, c.label(), c.key === 'value' ? 'num-col' : '')).join('')}<th style="width:44px"></th></tr>`;

  const cell = (d, col) => {
    if (col.key === 'stage')       return `<td>${d.stage_name ? `<span class="stage-pill"><i style="background:${esc(d.stage_color || 'var(--border-strong)')}"></i>${esc(d.stage_name)}</span>` : dash}</td>`;
    if (col.key === 'contact')     return `<td style="max-width:260px">${d.contact_name ? `<div class="truncate">${esc(d.contact_name)}</div>${d.contact_company ? `<div class="muted truncate" style="font-size:var(--fs-sm)">${esc(d.contact_company)}</div>` : ''}` : dash}</td>`;
    if (col.key === 'value')       return `<td class="num-col tnum strong">${d.value != null ? fmtEUR(d.value) : dash}</td>`;
    if (col.key === 'urgency')     return `<td>${urgencyBadge(d.urgency) || `<span class="muted">${esc(t('not_set'))}</span>`}</td>`;
    if (col.key === 'assigned_to') return `<td>${d.assigned_to_name ? `<div class="row" style="gap:8px">${avatar(d.assigned_to_name, 'sm')}<span>${esc(d.assigned_to_name.split(' ')[0])}</span></div>` : dash}</td>`;
    if (col.key === 'created_at')  return `<td class="muted">${fmtDateShort(d.created_at)}</td>`;
    if (col.key.startsWith('custom:')) return `<td>${esc(d.custom_data?.[col.key.slice(7)] ?? '') || dash}</td>`;
    return `<td>${dash}</td>`;
  };
  const span = 3 + (showPipeline ? 1 : 0) + visibleCols.length;
  const filtered = dealsFilterActive();
  tbody.innerHTML = rows.length ? rows.map(d => `<tr class="clickable" aria-selected="${sel.has(d.id)}" onclick="if(!event.target.closest('.check,[data-kebab]'))openDealModal(${d.id})">
      <td class="col-check"><label class="check"><input type="checkbox" data-row="${d.id}" aria-label="${esc(d.title)}" onchange="toggleDealSelected(${d.id},this.checked)" ${sel.has(d.id) ? 'checked' : ''}></label></td>
      <td style="max-width:360px"><div class="truncate" style="font-weight:620">${esc(d.title)}</div></td>
      ${showPipeline ? `<td>${esc(pipelines.find(p => p.id === d.pipeline_id)?.name || '') || dash}</td>` : ''}
      ${visibleCols.map(c => cell(d, c)).join('')}
      <td><button class="iconbtn" type="button" style="width:28px;height:28px" data-kebab="${d.id}" onclick="event.stopPropagation();openDealKebab(this,${d.id})" aria-label="${esc(t('open_deal'))}: ${esc(d.title)}">${icon('ellipsis')}</button></td>
    </tr>`).join('')
    : `<tr><td colspan="${span}"><div class="empty">${icon('search')}<b>${esc(t(filtered ? 'no_deals_match' : 'no_deals_yet'))}</b>${filtered ? `<div>${esc(t('try_removing_filter'))}</div>` : ''}</div></td></tr>`;

  if (bulk) bulk.innerHTML = sel.size ? `<div class="bulkbar" role="toolbar"><b>${esc(tf('n_selected', { n: sel.size }))}</b>
      <button class="btn btn-sm" type="button" onclick="bulkDeals('stage',this)">${esc(t('move_to_stage'))}</button>
      <button class="btn btn-sm" type="button" onclick="bulkDeals('delete',this)">${esc(t('btn_delete'))}</button>
      <button class="btn btn-sm" type="button" style="margin-left:auto" onclick="bulkDeals('clear',this)">${esc(t('clear_selection'))}</button></div>` : '';
  if (foot) foot.innerHTML = `<span>${esc(tf('of_deals', { a: rows.length, b: deals.length }))}</span><span class="tnum">${esc(t('total_lbl'))} <b style="color:var(--text)">${fmtEUR(sumValue(rows))}</b></span>`;
}

function bulkDeals(action, anchor) {
  const ids = [...dealsUI.sel];
  if (action === 'clear') { dealsUI.sel.clear(); renderDealsList(); return; }
  if (action === 'delete') { deleteDeals(ids); return; }
  if (action === 'stage') {
    const selected = deals.filter(d => ids.includes(d.id));
    const pids = [...new Set(selected.map(d => d.pipeline_id))];
    const items = pids.flatMap(pid => {
      const p = pipelines.find(x => x.id === pid); if (!p) return [];
      const mine = selected.filter(d => d.pipeline_id === pid);
      return [...(pids.length > 1 ? [{ heading: p.name }] : []), ...(p.stages || []).map(s => ({ label: s.name, onSelect: async () => {
        for (const d of mine) { if (d.stage_id !== s.id) { applyStage(d, s.id); await patchStage(d.id, s.id); } }
        dealsUI.sel.clear(); renderDeals(); ui.toast(tf('deals_moved_to', { n: mine.length, s: s.name }));
      } }))];
    });
    ui.menu(anchor, items);
  }
}

/* ---------- more menu / export ---------- */
function openDealsMoreMenu(anchor) {
  ui.menu(anchor, [
    { label: t('export_csv'), icon: 'download', onSelect: () => exportDealsCsv() },
    { sep: true },
    { label: t('manage_pipelines'), icon: 'settings', onSelect: () => { switchSettingsTab('deals'); switchPage('settings'); } },
  ], { align: 'right' });
}
function exportDealsCsv() {
  const rows = sortDeals(visibleDeals());
  const head = [t('col_title'), t('col_pipeline'), t('col_stage'), t('lbl_contact'), t('col_company'), t('lbl_deal_value'), t('col_urgency'), t('col_owner'), t('col_created_at'), ...dealFields.map(f => f.name)];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map(d => [d.title, pipelines.find(p => p.id === d.pipeline_id)?.name || '', d.stage_name || '', d.contact_name || '', d.contact_company || '', d.value ?? '', urgencyLabel(urgencyMeta(d.urgency)), d.assigned_to_name || '', d.created_at ? new Date(d.created_at).toISOString().slice(0, 10) : '', ...dealFields.map(f => d.custom_data?.[f.field_key] ?? '')].map(q).join(','));
  const csv = [head.map(q).join(','), ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `deals-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  ui.toast(tf('exported_n', { n: rows.length }));
}

/* ---------- drag and drop between columns ---------- */
function dealDragStart(e, id) { dragDealId = id; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => e.target.classList.add('dragging'), 0); dealAutoScrollStart(); }
function dealDragEnd(e)   { dealAutoScrollStop(); e.target.classList.remove('dragging'); document.querySelectorAll('#deals-board .col-board.drop').forEach(c => c.classList.remove('drop')); }
function dealDragOver(e)  { if (!dragDealId) return; e.preventDefault(); const col = e.currentTarget.closest('.col-board'); if (col) col.classList.add('drop'); }
function dealDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drop'); }
async function dealDrop(e, stageId) {
  e.preventDefault(); e.currentTarget.classList.remove('drop'); dealAutoScrollStop();
  if (!dragDealId) return;
  const id = dragDealId; dragDealId = null;
  await moveDealToStage(id, stageId);
}

/* ---------- edge autoscroll while a card is dragged ---------- */
// The browser's own autoscroll during a native drag is unreliable for an overflow
// container: Safari never scrolls one, Chrome only near the window's edge. So a stage
// column off the right of the screen could not be reached by dragging. While a card is
// dragged, a capturing dragover on the document records the pointer, and a frame loop
// scrolls the board sideways (and the card list under the pointer up or down) as long
// as the pointer sits within DEAL_AUTOSCROLL.edge px of an edge — faster the closer it
// is, DEAL_AUTOSCROLL.max px per frame at the edge or beyond it. The loop ends with the
// drag (dragend / drop), when dragDealId is cleared, or when no dragover has arrived for
// a second (the pointer left the window, or the card was re-rendered before dragend).
const DEAL_AUTOSCROLL = { edge: 72, max: 24 };
let dealAutoScroll = null;   // { x, y, at, raf } while a drag is in progress
// Signed px to scroll per frame for a pointer at `pos` against the span [start, end]:
// 0 away from the edges, rising linearly to ±max at the edge and beyond. Pure.
function dealEdgeScrollDelta(pos, start, end, { edge, max } = DEAL_AUTOSCROLL) {
  if (!(end - start > edge * 2)) return 0;   // a span too narrow for two edge zones never scrolls
  if (pos < start + edge) return -Math.ceil(Math.min(1, (start + edge - pos) / edge) * max);
  if (pos > end - edge)   return  Math.ceil(Math.min(1, (pos - (end - edge)) / edge) * max);
  return 0;
}
function dealAutoScrollMove(e) { if (dealAutoScroll) { dealAutoScroll.x = e.clientX; dealAutoScroll.y = e.clientY; dealAutoScroll.at = Date.now(); } }
function dealAutoScrollStart() {
  if (dealAutoScroll) return;
  dealAutoScroll = { x: -1, y: -1, at: Date.now(), raf: 0 };
  document.addEventListener('dragover', dealAutoScrollMove, true);
  const step = () => {
    const s = dealAutoScroll; if (!s) return;
    if (!dragDealId || Date.now() - s.at > 1000) return dealAutoScrollStop();
    const board = document.getElementById('deals-board');
    if (board && s.x >= 0) {
      const r = board.getBoundingClientRect();
      const dx = dealEdgeScrollDelta(s.x, r.left, r.right);
      if (dx) board.scrollLeft += dx;
      const cards = document.elementFromPoint(s.x, s.y)?.closest('.col-board .col-cards');
      if (cards) { const c = cards.getBoundingClientRect(); const dy = dealEdgeScrollDelta(s.y, c.top, c.bottom); if (dy) cards.scrollTop += dy; }
    }
    s.raf = requestAnimationFrame(step);
  };
  dealAutoScroll.raf = requestAnimationFrame(step);
}
function dealAutoScrollStop() {
  if (!dealAutoScroll) return;
  cancelAnimationFrame(dealAutoScroll.raf);
  document.removeEventListener('dragover', dealAutoScrollMove, true);
  dealAutoScroll = null;
}
