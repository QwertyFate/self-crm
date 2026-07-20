// ── ANALYTICS ─────────────────────────────────────────────
let analyticsData  = null;
let statCardOrder  = []; // [{ id, hidden }]
let sectionOrder   = []; // ['stats','winloss','pipeline','trends']

const STAT_CARD_DEFS = {
  contacts:       { label: 'Total Contacts',  color: '#3b82f6' },
  deals:          { label: 'Total Deals',     color: '#8b5cf6' },
  win_rate:       { label: 'Win Rate',        color: '#22c55e' },
  pipeline_value: { label: 'Pipeline Value',  color: '#f59e0b', requiresValue: true },
  won_value:      { label: 'Won Value',       color: '#10b981', requiresValue: true },
  new_deals:      { label: 'New Deals',       color: '#6366f1' },
};
const DEFAULT_STAT_ORDER    = ['contacts','deals','win_rate','pipeline_value','won_value','new_deals'];
const DEFAULT_SECTION_ORDER = ['stats','winloss','pipeline','trends'];

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtCurrency(n) {
  if (n == null) return '—';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000)    return '$' + (n / 1000).toFixed(1) + 'K';
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

async function loadAnalytics() {
  // Clear UI immediately to prevent showing stale data
  const mainSections = document.getElementById('analytics-main-sections');
  if (mainSections) mainSections.innerHTML = '';

  const data = await api.get('/api/analytics/summary');
  if (!data || data.error) return;
  analyticsData = data;

  const now = new Date();
  document.getElementById('analytics-period').textContent =
    now.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Layout is per-user; config (won/lost/value) is per-workspace
  const layout = data.layout || {};
  statCardOrder = buildStatOrder(layout.stat_card_order || [], layout.hidden_stat_cards || [], data);
  sectionOrder  = buildSectionOrder(layout.section_order || []);

  renderAllSections(data);
  loadTrend(currentTrendPeriod);
}

function buildStatOrder(savedOrder, hiddenIds, d) {
  const hasValue = d.config.value_field != null;
  const base = savedOrder.length ? savedOrder : [...DEFAULT_STAT_ORDER];
  return base
    .filter(id => {
      const def = STAT_CARD_DEFS[id];
      if (!def) return false;
      if (def.requiresValue && !hasValue) return false;
      return true;
    })
    .map(id => ({ id, hidden: hiddenIds.includes(id) }));
}

function buildSectionOrder(saved) {
  const base = saved.length ? saved : [...DEFAULT_SECTION_ORDER];
  return base.filter(id => DEFAULT_SECTION_ORDER.includes(id));
}

// ── Section rendering ──────────────────────────────────────
function renderAllSections(d) {
  const main = document.getElementById('analytics-main-sections');
  if (!main) return;

  // Re-order the existing section elements
  sectionOrder.forEach(id => {
    const el = document.getElementById(`analytics-sec-${id}`);
    if (el) main.appendChild(el);
  });

  renderAnalyticsCards(d);
  renderWinLoss(d);
  renderByPipeline(d);
  initSectionDragDrop();
}

// ── Stat cards ─────────────────────────────────────────────
function getStatCardContent(id, d) {
  switch (id) {
    case 'contacts':       return { value: fmt(d.total_contacts),  sub: `+${d.new_contacts} this month` };
    case 'deals':          return { value: fmt(d.total_deals),     sub: `${d.open_deals} open` };
    case 'win_rate':       return { value: d.win_rate != null ? d.win_rate + '%' : '—', sub: d.win_rate != null ? `${d.won_deals} won · ${d.lost_deals} lost` : 'Configure won/lost stages' };
    case 'pipeline_value': return { value: fmtCurrency(d.pipeline_value), sub: 'Open deals' };
    case 'won_value':      return { value: fmtCurrency(d.won_value), sub: d.avg_value != null ? `Avg ${fmtCurrency(d.avg_value)}` : 'Won deals' };
    case 'new_deals':      return { value: fmt(d.new_deals), sub: 'This month' };
    default: return { value: '—', sub: '' };
  }
}

function renderAnalyticsCards(d) {
  const el = document.getElementById('analytics-cards');
  if (!el) return;
  const visible = statCardOrder.filter(c => !c.hidden);

  el.innerHTML = visible.map(({ id }) => {
    const def     = STAT_CARD_DEFS[id];
    const content = getStatCardContent(id, d);
    return `
    <div class="analytics-card" draggable="true" data-stat-id="${id}">
      <div class="analytics-card-drag">⠿</div>
      <div class="analytics-card-accent" style="background:${def.color}"></div>
      <div class="analytics-card-label">${def.label}</div>
      <div class="analytics-card-value">${content.value}</div>
      <div class="analytics-card-sub">${content.sub}</div>
    </div>`;
  }).join('');

  initStatCardDragDrop();
}

let dragStatId = null;
function initStatCardDragDrop() {
  const grid = document.getElementById('analytics-cards');
  grid.querySelectorAll('.analytics-card[data-stat-id]').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.stopPropagation();
      dragStatId = card.dataset.statId;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.analytics-card').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (card.dataset.statId !== dragStatId) {
        grid.querySelectorAll('.analytics-card').forEach(c => c.classList.remove('drag-over'));
        card.classList.add('drag-over');
      }
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const toId = card.dataset.statId;
      if (!dragStatId || dragStatId === toId) return;
      const allIds  = statCardOrder.map(c => c.id);
      const fromIdx = allIds.indexOf(dragStatId);
      const toIdx   = allIds.indexOf(toId);
      const [moved] = statCardOrder.splice(fromIdx, 1);
      statCardOrder.splice(toIdx, 0, moved);
      renderAnalyticsCards(analyticsData);
      saveLayoutConfig();
    });
  });
}

// ── Section drag-drop ──────────────────────────────────────
let dragSectionId = null;
function initSectionDragDrop() {
  const main = document.getElementById('analytics-main-sections');
  if (!main) return;
  main.querySelectorAll('.analytics-draggable-section').forEach(sec => {
    // Always draggable — handle is just visual
    sec.setAttribute('draggable', 'true');

    sec.addEventListener('dragstart', e => {
      dragSectionId = sec.dataset.sectionId;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => sec.classList.add('dragging'), 0);
    });
    sec.addEventListener('dragend', () => {
      sec.classList.remove('dragging');
      main.querySelectorAll('.analytics-draggable-section').forEach(s => s.classList.remove('drag-over'));
    });
    sec.addEventListener('dragover', e => {
      e.preventDefault();
      if (sec.dataset.sectionId !== dragSectionId) {
        main.querySelectorAll('.analytics-draggable-section').forEach(s => s.classList.remove('drag-over'));
        sec.classList.add('drag-over');
      }
    });
    sec.addEventListener('drop', e => {
      e.preventDefault();
      sec.classList.remove('drag-over');
      const toId = sec.dataset.sectionId;
      if (!dragSectionId || dragSectionId === toId) return;
      const fromIdx = sectionOrder.indexOf(dragSectionId);
      const toIdx   = sectionOrder.indexOf(toId);
      sectionOrder.splice(fromIdx, 1);
      sectionOrder.splice(toIdx, 0, dragSectionId);
      renderAllSections(analyticsData);
      loadTrend(currentTrendPeriod);
      saveLayoutConfig();
    });
  });
}

function saveLayoutConfig() {
  const layout = {
    stat_card_order:   statCardOrder.map(c => c.id),
    hidden_stat_cards: statCardOrder.filter(c => c.hidden).map(c => c.id),
    section_order:     sectionOrder,
    trend_config:      trendCardOrder.map(({ id, view }) => ({ id, view })),
  };
  api.patch('/api/analytics/layout', layout).then(res => {
    if (!res.error && analyticsData) analyticsData.layout = { ...analyticsData.layout, ...layout };
  });
}

function renderWinLoss(d) {
  const section = document.getElementById('analytics-winloss-section');
  const total   = d.won_deals + d.lost_deals + d.open_deals;
  section.style.display = '';
  if (total === 0) {
    document.getElementById('analytics-winloss-bar').innerHTML    = '';
    document.getElementById('analytics-winloss-legend').innerHTML = '<p style="color:var(--muted);font-size:13px;margin:0">No deal outcomes yet — configure Won and Lost stages in Configure Metrics.</p>';
    return;
  }

  const wonPct  = (d.won_deals  / total * 100).toFixed(1);
  const lostPct = (d.lost_deals / total * 100).toFixed(1);
  const openPct = (d.open_deals / total * 100).toFixed(1);

  document.getElementById('analytics-winloss-bar').innerHTML = `
    <div class="wl-segment" style="width:${wonPct}%;background:#22c55e" title="Won ${wonPct}%"></div>
    <div class="wl-segment" style="width:${openPct}%;background:#3b82f6" title="Open ${openPct}%"></div>
    <div class="wl-segment" style="width:${lostPct}%;background:#ef4444" title="Lost ${lostPct}%"></div>`;

  document.getElementById('analytics-winloss-legend').innerHTML = [
    { label: `Won — ${d.won_deals}`,   color: '#22c55e', pct: wonPct  },
    { label: `Open — ${d.open_deals}`, color: '#3b82f6', pct: openPct },
    { label: `Lost — ${d.lost_deals}`, color: '#ef4444', pct: lostPct },
  ].map(l => `
    <div class="wl-legend-item">
      <span class="wl-dot" style="background:${l.color}"></span>
      ${l.label} <span class="wl-pct">(${l.pct}%)</span>
    </div>`).join('');
}

function renderByPipeline(d) {
  const el       = document.getElementById('analytics-by-pipeline');
  const hasValue = d.config.value_field != null;
  if (!d.by_pipeline.length) { el.innerHTML = '<p style="color:var(--muted)">No pipelines yet.</p>'; return; }
  const maxCount = Math.max(...d.by_pipeline.map(p => parseInt(p.cnt) || 0), 1);
  el.innerHTML = d.by_pipeline.map(p => {
    const count = parseInt(p.cnt) || 0;
    const val   = parseFloat(p.val) || 0;
    const pct   = Math.round((count / maxCount) * 100);
    return `
    <div class="pipeline-bar-row">
      <div class="pipeline-bar-label">${esc(p.pipeline_name)}</div>
      <div class="pipeline-bar-track"><div class="pipeline-bar-fill" style="width:${pct}%"></div></div>
      <div class="pipeline-bar-stats">${count} deal${count !== 1 ? 's' : ''}${hasValue ? ' · ' + fmtCurrency(val) : ''}</div>
    </div>`;
  }).join('');
}

// ── Trend charts ──────────────────────────────────────────
const TREND_DEFS = {
  contacts: { title: 'New Contacts', key: 'cnt', color: '#3b82f6', dataKey: 'contacts' },
  deals:    { title: 'New Deals',    key: 'cnt', color: '#8b5cf6', dataKey: 'deals'    },
  value:    { title: 'Deal Value',   key: 'val', color: '#10b981', dataKey: 'value_trend', currency: true },
};

let currentTrendPeriod = 'week';
let trendCardOrder     = [];  // [{ id, view }]
let trendRawData       = null;
let dragCardId         = null;

async function loadTrend(period) {
  currentTrendPeriod = period;
  const data = await api.get(`/api/analytics/trend?period=${period}`);
  if (!data || data.error) return;
  trendRawData = data;

  const hasValue = analyticsData?.config?.value_field != null;
  const saved    = analyticsData?.layout?.trend_config || [];

  // Build ordered list from saved config, adding/removing value card as needed
  const base = saved.length
    ? saved.filter(c => c.id !== 'value' || hasValue)
    : [{ id: 'contacts', view: 'line' }, { id: 'deals', view: 'line' }];

  if (hasValue && !base.find(c => c.id === 'value')) {
    base.push({ id: 'value', view: 'bar' });
  }
  trendCardOrder = base;

  renderTrendCards();
}

function renderTrendCards() {
  const grid = document.getElementById('analytics-trend-grid');
  grid.innerHTML = trendCardOrder.map(({ id, view }) => {
    const def  = TREND_DEFS[id];
    const rows = trendRawData?.[def.dataKey] || [];
    const total = rows.reduce((s, r) => s + parseFloat(r[def.key] || 0), 0);
    return `
    <div class="trend-card" draggable="true" data-card-id="${id}">
      <div class="trend-card-header">
        <div class="trend-drag-handle" title="Drag to reorder">⠿</div>
        <div class="trend-card-title">${def.title}</div>
        <div class="trend-view-btns">
          <button class="trend-view-btn${view==='line'   ? ' active':''}" onclick="setCardView('${id}','line')"   title="Line">╱</button>
          <button class="trend-view-btn${view==='bar'    ? ' active':''}" onclick="setCardView('${id}','bar')"    title="Bar">▮</button>
          <button class="trend-view-btn${view==='detail' ? ' active':''}" onclick="setCardView('${id}','detail')" title="Detail">≡</button>
        </div>
      </div>
      <div class="trend-card-total">${def.currency ? fmtCurrency(total) : fmt(total)}</div>
      <div class="trend-chart-wrap" id="tc-${id}"></div>
      ${view !== 'detail' ? `<div class="trend-x-labels" id="tc-${id}-labels"></div>` : ''}
    </div>`;
  }).join('');

  // Draw charts
  trendCardOrder.forEach(({ id, view }) => {
    const def    = TREND_DEFS[id];
    const rows   = trendRawData?.[def.dataKey] || [];
    const values = rows.map(r => parseFloat(r[def.key] || 0));
    const labels = rows.map(r => formatTrendLabel(r.period, currentTrendPeriod));
    if (view === 'line')   renderSparkline(`tc-${id}`, values, labels, def.color, def.currency);
    if (view === 'bar')    renderBarChart(`tc-${id}`,  values, labels, def.color, def.currency);
    if (view === 'detail') renderDetailView(`tc-${id}`, values, labels, def.color, def.currency);
  });

  initTrendDragDrop();
}

function setCardView(id, view) {
  const card = trendCardOrder.find(c => c.id === id);
  if (card) card.view = view;
  renderTrendCards();
  saveTrendConfig();
}

function saveTrendConfig() {
  const tc = trendCardOrder.map(({ id, view }) => ({ id, view }));
  api.patch('/api/analytics/layout', { trend_config: tc }).then(res => {
    if (!res.error && analyticsData) {
      analyticsData.layout = analyticsData.layout || {};
      analyticsData.layout.trend_config = tc;
    }
  });
}

// Drag-and-drop reordering
function initTrendDragDrop() {
  const grid = document.getElementById('analytics-trend-grid');
  grid.querySelectorAll('.trend-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.stopPropagation();
      dragCardId = card.dataset.cardId;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.trend-card').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (card.dataset.cardId !== dragCardId) {
        grid.querySelectorAll('.trend-card').forEach(c => c.classList.remove('drag-over'));
        card.classList.add('drag-over');
      }
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const toId = card.dataset.cardId;
      if (!dragCardId || dragCardId === toId) return;
      const fromIdx = trendCardOrder.findIndex(c => c.id === dragCardId);
      const toIdx   = trendCardOrder.findIndex(c => c.id === toId);
      const [moved] = trendCardOrder.splice(fromIdx, 1);
      trendCardOrder.splice(toIdx, 0, moved);
      renderTrendCards();
      saveTrendConfig();
    });
  });
}

function formatTrendLabel(dateStr, period) {
  const d = new Date(dateStr);
  if (period === 'year')  return d.toLocaleString('default', { month: 'short' });
  if (period === 'month') return d.getDate().toString();
  return d.toLocaleString('default', { weekday: 'short' });
}

// ── Line chart ─────────────────────────────────────────────
function renderSparkline(containerId, values, labels, color, isCurrency) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.style.height = '90px';
  const W = 500, H = 90, padX = 4, padY = 8;
  const max  = Math.max(...values, 1);
  const n    = values.length;
  const step = (W - padX * 2) / Math.max(n - 1, 1);
  const pts  = values.map((v, i) => ({ x: padX + i * step, y: padY + (1 - v / max) * (H - padY * 2) }));
  const linePath = pts.map((p, i) => `${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[n-1].x},${H} L${pts[0].x},${H} Z`;
  const gradId   = `grad-${containerId}`;
  const maxLabels = 7;
  const labelStep = Math.ceil(n / maxLabels);
  const labelIdx  = values.map((_, i) => i).filter(i => i % labelStep === 0 || i === n - 1);

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sparkline-svg">
      <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
      </linearGradient></defs>
      <path d="${areaPath}" fill="url(#${gradId})"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => `<circle class="spark-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"
        fill="${color}" stroke="var(--card-bg)" stroke-width="2"
        data-val="${isCurrency ? fmtCurrency(values[i]) : values[i]}" data-label="${labels[i]}"/>`).join('')}
    </svg>`;

  const labelsEl = document.getElementById(`${containerId}-labels`);
  if (labelsEl) labelsEl.innerHTML = `<div class="spark-label-row">${
    labelIdx.map(i => `<span class="spark-label" style="left:${n<=1?0:(i/(n-1)*100)}%">${labels[i]}</span>`).join('')
  }</div>`;

  el.querySelectorAll('.spark-dot').forEach(dot => {
    dot.addEventListener('mouseenter', e => showSparkTooltip(e, dot.dataset.label, dot.dataset.val));
    dot.addEventListener('mouseleave', hideSparkTooltip);
  });
}

// ── Bar chart ──────────────────────────────────────────────
function renderBarChart(containerId, values, labels, color, isCurrency) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.style.height = '90px';
  const W = 500, H = 90, padX = 4, padY = 4;
  const max  = Math.max(...values, 1);
  const n    = values.length;
  const slot = (W - padX * 2) / n;
  const barW = Math.max(slot * 0.65, 2);
  const maxLabels = 7;
  const labelStep = Math.ceil(n / maxLabels);
  const labelIdx  = values.map((_, i) => i).filter(i => i % labelStep === 0 || i === n - 1);

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sparkline-svg">
      ${values.map((v, i) => {
        const bh = v > 0 ? Math.max((v / max) * (H - padY * 2), 2) : 0;
        const x  = padX + i * slot + (slot - barW) / 2;
        const y  = H - padY - bh;
        return `<rect class="spark-dot" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
          width="${barW.toFixed(1)}" height="${bh.toFixed(1)}"
          fill="${color}" rx="2" opacity="0.85"
          data-val="${isCurrency ? fmtCurrency(v) : v}" data-label="${labels[i]}"/>`;
      }).join('')}
    </svg>`;

  const labelsEl = document.getElementById(`${containerId}-labels`);
  if (labelsEl) labelsEl.innerHTML = `<div class="spark-label-row">${
    labelIdx.map(i => {
      const pct = n <= 1 ? 0 : (i / (n - 1)) * 100;
      return `<span class="spark-label" style="left:${pct}%">${labels[i]}</span>`;
    }).join('')
  }</div>`;

  el.querySelectorAll('.spark-dot').forEach(dot => {
    dot.addEventListener('mouseenter', e => showSparkTooltip(e, dot.dataset.label, dot.dataset.val));
    dot.addEventListener('mouseleave', hideSparkTooltip);
  });
}

// ── Detail view ────────────────────────────────────────────
function renderDetailView(containerId, values, labels, color, isCurrency) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.style.height = 'auto';
  const max = Math.max(...values, 1);
  el.innerHTML = `<div class="trend-detail-list">${
    values.map((v, i) => {
      const pct = Math.round((v / max) * 100);
      const val = isCurrency ? fmtCurrency(v) : v;
      return `<div class="trend-detail-row">
        <span class="trend-detail-label">${labels[i]}</span>
        <div class="trend-detail-track"><div class="trend-detail-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="trend-detail-val">${val}</span>
      </div>`;
    }).join('')
  }</div>`;
}

function showSparkTooltip(e, label, val) {
  let tip = document.getElementById('spark-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'spark-tooltip';
    tip.className = 'spark-tooltip';
    document.body.appendChild(tip);
  }
  tip.textContent = `${label}: ${val}`;
  tip.style.display = 'block';
  tip.style.left = (e.clientX + 10) + 'px';
  tip.style.top  = (e.clientY - 28) + 'px';
}
function hideSparkTooltip() {
  const tip = document.getElementById('spark-tooltip');
  if (tip) tip.style.display = 'none';
}

function switchTrendPeriod(period) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  loadTrend(period);
}

// ── Config modal ───────────────────────────────────────────
function openAnalyticsConfig() {
  if (!analyticsData) return;
  const { all_stages, deal_fields, config } = analyticsData;
  const wonIds     = (config.won_stage_ids  || []).map(Number);
  const lostIds    = (config.lost_stage_ids || []).map(Number);
  const valueField = config.value_field || '';

  // Group stages by pipeline
  const pipelines = [];
  const pipelineMap = {};
  for (const s of all_stages) {
    if (!pipelineMap[s.pipeline_id]) {
      pipelineMap[s.pipeline_id] = { name: s.pipeline_name, stages: [] };
      pipelines.push(pipelineMap[s.pipeline_id]);
    }
    pipelineMap[s.pipeline_id].stages.push(s);
  }

  function renderStageGroup(containerId, selectedIds) {
    document.getElementById(containerId).innerHTML = pipelines.map(pl => `
      <div class="analytics-pipeline-group">
        <div class="analytics-pipeline-sep">${esc(pl.name)}</div>
        <div class="analytics-stage-chips">
          ${pl.stages.map(s => `
            <label class="analytics-stage-option">
              <input type="checkbox" data-id="${s.id}" ${selectedIds.includes(s.id) ? 'checked' : ''}>
              <span class="analytics-stage-dot" style="background:${s.color}"></span>
              ${esc(s.name)}
            </label>`).join('')}
        </div>
      </div>`).join('');
  }

  renderStageGroup('analytics-won-stages',  wonIds);
  renderStageGroup('analytics-lost-stages', lostIds);

  // Value field selector
  const numericFields = deal_fields.filter(f => f.type === 'number' || f.type === 'currency');
  const valueOptions  = [
    { key: '',      label: 'None — hide value metrics' },
    { key: 'value', label: 'Deal Value (built-in)' },
    ...numericFields.map(f => ({ key: f.field_key, label: f.name })),
  ];
  document.getElementById('analytics-value-field').innerHTML =
    valueOptions.map(o => `<option value="${o.key}" ${valueField === o.key ? 'selected' : ''}>${o.label}</option>`).join('');

  // Card visibility toggles
  const hasValue = analyticsData?.config?.value_field != null;
  document.getElementById('analytics-card-visibility').innerHTML =
    Object.entries(STAT_CARD_DEFS)
      .filter(([, def]) => !def.requiresValue || hasValue)
      .map(([id, def]) => {
        const card    = statCardOrder.find(c => c.id === id);
        const hidden  = card ? card.hidden : false;
        return `<label class="analytics-stage-option">
          <input type="checkbox" data-card-vis="${id}" ${!hidden ? 'checked' : ''}>
          <span class="analytics-stage-dot" style="background:${def.color}"></span>
          ${def.label}
        </label>`;
      }).join('');

  document.getElementById('analytics-config-msg').classList.add('hidden');
  document.getElementById('analytics-config-modal').classList.remove('hidden');
}

function closeAnalyticsConfig() {
  document.getElementById('analytics-config-modal').classList.add('hidden');
}

async function saveAnalyticsConfig() {
  const wonIds     = [...document.querySelectorAll('#analytics-won-stages  input[data-id]:checked')].map(el => parseInt(el.dataset.id));
  const lostIds    = [...document.querySelectorAll('#analytics-lost-stages input[data-id]:checked')].map(el => parseInt(el.dataset.id));
  const valueField = document.getElementById('analytics-value-field').value || null;

  const msgEl  = document.getElementById('analytics-config-msg');
  const overlap = wonIds.filter(id => lostIds.includes(id));
  if (overlap.length) {
    msgEl.textContent = 'A stage cannot be both Won and Lost.';
    msgEl.className   = 'workspace-name-msg error';
    msgEl.classList.remove('hidden');
    return;
  }

  // Apply card visibility from checkboxes
  document.querySelectorAll('#analytics-card-visibility input[data-card-vis]').forEach(cb => {
    const card = statCardOrder.find(c => c.id === cb.dataset.cardVis);
    if (card) card.hidden = !cb.checked;
    else statCardOrder.push({ id: cb.dataset.cardVis, hidden: !cb.checked });
  });

  // Workspace-level config (shared across users)
  const res = await api.patch('/api/analytics/config', { won_stage_ids: wonIds, lost_stage_ids: lostIds, value_field: valueField });
  // Per-user layout
  await api.patch('/api/analytics/layout', {
    stat_card_order:   statCardOrder.map(c => c.id),
    hidden_stat_cards: statCardOrder.filter(c => c.hidden).map(c => c.id),
    section_order:     sectionOrder,
  });
  if (res.error) {
    msgEl.textContent = res.error;
    msgEl.className   = 'workspace-name-msg error';
    msgEl.classList.remove('hidden');
    return;
  }
  closeAnalyticsConfig();
  loadAnalytics();
}
