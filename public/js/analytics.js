/* ── Analytics ──────────────────────────────────────────────────────────────
   One fixed page: a band with the workspace's numbers, deal outcomes beside
   deals by pipeline, then the trends over a week, a month or a year. The
   settings that matter live in the metric settings modal: which numbers
   show, the deal value field, and which stages count as won and lost.
   Charts are drawn in real pixels with a scale and a baseline; money goes
   through the workspace formatter.                                          */
let analyticsData      = null;
let statCardOrder      = [];
let currentTrendPeriod = 'week';
let trendRawData       = null;
let trendResizeObserver = null;
let trendRaf           = 0;

const STAT_CARD_DEFS = {
  pipeline_value: { label: 'kpi_pipeline_value', requiresValue: true },
  won_value:      { label: 'kpi_won_value',      requiresValue: true },
  win_rate:       { label: 'kpi_win_rate' },
  deals:          { label: 'kpi_deals' },
  new_deals:      { label: 'kpi_new_deals' },
  contacts:       { label: 'kpi_contacts' },
  overdue_tasks:  { label: 'kpi_overdue_tasks' },
};
const DEFAULT_STAT_ORDER = ['pipeline_value', 'won_value', 'win_rate', 'deals', 'new_deals', 'contacts', 'overdue_tasks'];
const TREND_DEFS = {
  deals:    { title: 'trend_new_deals',    key: 'cnt', dataKey: 'deals',       kind: 'line' },
  contacts: { title: 'trend_new_contacts', key: 'cnt', dataKey: 'contacts',    kind: 'line' },
  value:    { title: 'trend_deal_value',   key: 'val', dataKey: 'value_trend', kind: 'bar', money: true },
};

/* ── Formatting ──────────────────────────────────────────────────────────── */

function analyticsLocale() {
  return (typeof currentLang !== 'undefined' && currentLang === 'de') ? 'de-DE' : 'en-GB';
}
function fmt(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return (v / 1000).toFixed(1) + 'K';
  return String(Math.round(v));
}
// €96K / €1.3M / €420, with the currency where the workspace formatter puts it.
function fmtMoneyShort(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n), abs = Math.abs(v);
  if (abs < 1000) return fmtMoney(v);
  const sample = fmtMoney(0);
  const sym = sample.replace(/[\d\s .,]/g, '');
  const after = /\d[\s ]*[^\d\s]+$/.test(sample);
  const num = abs >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`;
  return after ? `${num} ${sym}` : `${sym}${num}`;
}
function dealCount(n) { return t(n === 1 ? 'deal_one' : 'deal_other').replace('{n}', n); }

/* ── Chart geometry (pure) ───────────────────────────────────────────────── */

// The smallest 1 / 2 / 5 × 10ⁿ at or above max, so the scale reads cleanly. Never zero.
function niceMax(max) {
  if (!(max > 0)) return 1;
  const exp = Math.floor(Math.log10(max)), base = Math.pow(10, exp), f = max / base;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return m * base;
}
// Maps series values into pixel space: gutters for the tick labels and the x labels, a baseline at zero, evenly spaced ticks.
function chartLayout(width, height, values, { ticks = 3 } = {}) {
  const padL = 36, padR = 8, padT = 8, padB = 20;
  const n = values.length;
  const max = niceMax(Math.max(0, ...values));
  const innerW = Math.max(width - padL - padR, 1), innerH = Math.max(height - padT - padB, 1);
  const baselineY = padT + innerH;
  const x = i => n <= 1 ? padL : padL + (i / (n - 1)) * innerW;
  const y = v => baselineY - (Math.max(0, v) / max) * innerH;
  const tickList = Array.from({ length: ticks + 1 }, (_, k) => { const v = max * k / ticks; return { v, y: y(v) }; });
  return { padL, padR, padT, padB, innerW, innerH, max, baselineY, x, y, ticks: tickList };
}
function r1(n) { return String(Math.round(n * 10) / 10); }
function linePath(points) { return points.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)},${r1(p.y)}`).join(' '); }
function areaPath(points, baselineY) {
  if (!points.length) return '';
  return `${linePath(points)} L${r1(points[points.length - 1].x)},${r1(baselineY)} L${r1(points[0].x)},${r1(baselineY)} Z`;
}
// Which x labels to draw: the first, the last, and evenly spaced ones between, at most `max`.
function labelIndexes(n, max = 7) {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil((n - 1) / (max - 1));
  const out = [];
  for (let i = 0; i < n - 1; i += step) out.push(i);
  out.push(n - 1);
  return out;
}
function formatTrendLabel(dateStr, period) {
  const d = new Date(dateStr);
  if (period === 'year')  return d.toLocaleDateString(analyticsLocale(), { month: 'short' });
  if (period === 'month') return String(d.getDate());
  return d.toLocaleDateString(analyticsLocale(), { weekday: 'short' });
}

/* ── The band ────────────────────────────────────────────────────────────── */

// Fixed order; value cards need a value field; hidden ones come from the user's layout.
function buildStatOrder(hiddenIds, d) {
  const hasValue = d?.config?.value_field != null;
  const hidden = Array.isArray(hiddenIds) ? hiddenIds : [];
  return DEFAULT_STAT_ORDER
    .filter(id => !STAT_CARD_DEFS[id].requiresValue || hasValue)
    .map(id => ({ id, hidden: hidden.includes(id) }));
}
function statCellContent(id, d) {
  switch (id) {
    case 'pipeline_value': return { value: fmtMoneyShort(d.pipeline_value), sub: t('kpi_open_deals_sub').replace('{n}', d.open_deals) };
    case 'won_value':      return { value: fmtMoneyShort(d.won_value), sub: d.avg_value != null ? t('kpi_avg_sub').replace('{v}', fmtMoneyShort(d.avg_value)) : '' };
    case 'win_rate':       return d.win_rate != null
      ? { value: `${d.win_rate}%`, sub: t('kpi_won_lost_sub').replace('{w}', d.won_deals).replace('{l}', d.lost_deals) }
      : { value: '—', sub: `<button type="button" class="btn-link" onclick="openAnalyticsConfig()">${t('kpi_setup_stages')}</button>` };
    case 'deals':          return { value: fmt(d.total_deals), sub: t('kpi_open_deals_sub').replace('{n}', d.open_deals) };
    case 'new_deals':      return { value: fmt(d.new_deals), sub: t('kpi_this_month') };
    case 'contacts':       return { value: fmt(d.total_contacts), sub: t('kpi_new_this_month').replace('{n}', d.new_contacts) };
    case 'overdue_tasks':  return { value: fmt(d.overdue_tasks), sub: t('kpi_of_tasks').replace('{n}', d.total_tasks) };
    default:               return { value: '—', sub: '' };
  }
}
function renderAnalyticsCards(d) {
  const el = document.getElementById('analytics-cards'); if (!el) return;
  el.innerHTML = statCardOrder.filter(c => !c.hidden).map(({ id }) => {
    const c = statCellContent(id, d);
    return `<div class="analytics-cell" role="listitem">
      <div class="analytics-cell-label">${t(STAT_CARD_DEFS[id].label)}</div>
      <div class="analytics-cell-value">${c.value}</div>
      <div class="analytics-cell-sub">${c.sub}</div>
    </div>`;
  }).join('');
}

/* ── Outcomes and pipelines ──────────────────────────────────────────────── */

function renderWinLoss(d) {
  const bar = document.getElementById('analytics-winloss-bar'), legend = document.getElementById('analytics-winloss-legend');
  if (!bar || !legend) return;
  const parts = [['won', d.won_deals || 0], ['open', d.open_deals || 0], ['lost', d.lost_deals || 0]];
  const total = parts.reduce((s, [, n]) => s + n, 0);
  const configured = (d.config?.won_stage_ids?.length || 0) + (d.config?.lost_stage_ids?.length || 0) > 0;
  if (!total || !configured) {
    bar.innerHTML = '';
    legend.innerHTML = total
      ? `<p class="empty-inline">${t('no_outcomes_setup')} <button type="button" class="btn-link" onclick="openAnalyticsConfig()">${t('kpi_setup_stages')}</button></p>`
      : `<p class="empty-inline">${t('no_outcomes_hint')}</p>`;
    return;
  }
  bar.innerHTML = parts.filter(([, n]) => n > 0).map(([k, n]) => {
    const pct = n / total * 100;
    return `<div class="wl-segment ${k}" style="flex-basis:${pct.toFixed(1)}%" title="${esc(t('outcome_' + k))}: ${n}">${pct >= 12 ? n : ''}</div>`;
  }).join('');
  legend.innerHTML = parts.map(([k, n]) =>
    `<div class="wl-legend-item"><span class="wl-dot ${k}"></span><span>${t('outcome_' + k)}</span><strong>${n}</strong><span class="wl-pct">${Math.round(n / total * 100)}%</span></div>`
  ).join('');
}
function renderByPipeline(d) {
  const el = document.getElementById('analytics-by-pipeline'); if (!el) return;
  const hasValue = d.config?.value_field != null;
  const rows = (d.by_pipeline || []).map(p => ({ name: p.pipeline_name, count: parseInt(p.cnt) || 0, val: parseFloat(p.val) || 0 }));
  if (!rows.length) { el.innerHTML = `<p class="empty-inline">${t('no_pipelines')}</p>`; return; }
  const total = Math.max(rows.reduce((s, r) => s + r.count, 0), 1);          // widths compare across pipelines
  el.innerHTML = rows.map(r => `
    <div class="pipeline-bar-row">
      <div class="pipeline-bar-label" title="${esc(r.name)}">${esc(r.name)}</div>
      <div class="pipeline-bar-track"><div class="pipeline-bar-fill" style="width:${Math.round(r.count / total * 100)}%"></div></div>
      <div class="pipeline-bar-stats">${dealCount(r.count)}${hasValue ? ` · ${fmtMoneyShort(r.val)}` : ''}</div>
    </div>`).join('');
}

/* ── Trends ──────────────────────────────────────────────────────────────── */

async function loadTrend(period) {
  currentTrendPeriod = period;
  const data = await api.get(`/api/analytics/trend?period=${period}`);
  if (!data || data.error) return;
  trendRawData = data;
  renderTrendCards();
}
function trendSeriesIds() {
  const hasValue = analyticsData?.config?.value_field != null;
  return Object.keys(TREND_DEFS).filter(id => id !== 'value' || hasValue);
}
function renderTrendCards() {
  const grid = document.getElementById('analytics-trend-grid'); if (!grid || !trendRawData) return;
  grid.innerHTML = trendSeriesIds().map(id => {
    const def = TREND_DEFS[id];
    const rows = trendRawData[def.dataKey] || [];
    const total = rows.reduce((s, r) => s + (parseFloat(r[def.key]) || 0), 0);
    return `<div class="trend-card" data-series="${id}">
      <div class="trend-card-head"><span class="trend-card-title">${t(def.title)}</span><span class="trend-card-total">${def.money ? fmtMoneyShort(total) : fmt(total)}</span></div>
      <div class="trend-chart" id="tc-${id}"></div>
    </div>`;
  }).join('');
  drawTrendCharts();
  if (!trendResizeObserver && typeof ResizeObserver !== 'undefined') {
    trendResizeObserver = new ResizeObserver(() => { cancelAnimationFrame(trendRaf); trendRaf = requestAnimationFrame(drawTrendCharts); });
    trendResizeObserver.observe(grid);
  }
}
function drawTrendCharts() {
  if (!trendRawData) return;
  for (const id of trendSeriesIds()) {
    const def = TREND_DEFS[id];
    const rows = trendRawData[def.dataKey] || [];
    renderTrendChart(document.getElementById(`tc-${id}`), {
      values: rows.map(r => parseFloat(r[def.key]) || 0),
      labels: rows.map(r => formatTrendLabel(r.period, currentTrendPeriod)),
      series: id, kind: def.kind, money: !!def.money,
    });
  }
}
// One chart in real pixels: gridlines with tick labels, the baseline, the series (line + area, or bars), x labels, and a hover column with its value.
function renderTrendChart(el, { values, labels, series, kind = 'line', money = false }) {
  if (!el) return;
  const width = Math.max(el.clientWidth || 0, 240), height = 140;
  const L = chartLayout(width, height, values);
  const n = values.length;
  const fmtVal = v => money ? fmtMoneyShort(v) : fmt(v);
  const slot = L.innerW / Math.max(n, 1);
  const cx = i => kind === 'bar' ? L.padL + (i + 0.5) * slot : L.x(i);
  const grid = L.ticks.map(tk =>
    `<line class="chart-grid" x1="${L.padL}" x2="${width - L.padR}" y1="${r1(tk.y)}" y2="${r1(tk.y)}"/>` +
    `<text class="chart-axis" x="${L.padL - 6}" y="${r1(tk.y)}" text-anchor="end" dominant-baseline="middle">${esc(fmtVal(tk.v))}</text>`
  ).join('');
  const xLabels = labelIndexes(n).map(i =>
    `<text class="chart-axis" x="${r1(cx(i))}" y="${height - 5}" text-anchor="${n > 1 && i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(labels[i] ?? '')}</text>`
  ).join('');
  let shape = '';
  if (kind === 'bar') {
    const barW = Math.max(slot * 0.6, 2);
    shape = values.map((v, i) => {
      const h = v > 0 ? Math.max(L.baselineY - L.y(v), 2) : 0;
      return `<rect class="chart-bar ${series}" x="${r1(cx(i) - barW / 2)}" y="${r1(L.baselineY - h)}" width="${r1(barW)}" height="${r1(h)}" rx="2"/>`;
    }).join('');
  } else if (n) {
    const pts = values.map((v, i) => ({ x: L.x(i), y: L.y(v) }));
    shape = `<path class="chart-area ${series}" d="${areaPath(pts, L.baselineY)}"/><path class="chart-line ${series}" d="${linePath(pts)}"/>`;
  }
  const cols = values.map((v, i) => {
    const hw = Math.max(slot / 2, 6);
    return `<g class="chart-col" data-i="${i}"><rect class="chart-hit" x="${r1(cx(i) - hw)}" y="${L.padT}" width="${r1(hw * 2)}" height="${r1(L.innerH)}"><title>${esc(labels[i] ?? '')}: ${esc(fmtVal(v))}</title></rect>` +
      (kind === 'bar' ? '' : `<circle class="chart-dot ${series}" cx="${r1(cx(i))}" cy="${r1(L.y(v))}" r="3.5"/>`) + `</g>`;
  }).join('');
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(t(TREND_DEFS[series]?.title || ''))}">
    ${grid}<line class="chart-baseline" x1="${L.padL}" x2="${width - L.padR}" y1="${r1(L.baselineY)}" y2="${r1(L.baselineY)}"/>${shape}${cols}${xLabels}
  </svg><div class="chart-tip hidden"></div>`;
  const tip = el.querySelector('.chart-tip');
  el.querySelectorAll('.chart-col').forEach(col => {
    const i = Number(col.dataset.i);
    col.addEventListener('mouseenter', () => {
      tip.textContent = `${labels[i] ?? ''}: ${fmtVal(values[i])}`;
      tip.style.left = `${cx(i)}px`;
      tip.classList.remove('hidden');
    });
    col.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  });
}
function switchTrendPeriod(period) {
  document.querySelectorAll('#analytics-period-switcher .view-toggle-btn').forEach(b => {
    const on = b.dataset.period === period;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
  });
  loadTrend(period);
}

/* ── Page ────────────────────────────────────────────────────────────────── */

async function loadAnalytics() {
  const data = await api.get('/api/analytics/summary');
  if (!data || data.error) return;
  analyticsData = data;
  const period = document.getElementById('analytics-period');
  if (period) period.textContent = new Date().toLocaleDateString(analyticsLocale(), { month: 'long', year: 'numeric' });
  statCardOrder = buildStatOrder(data.layout?.hidden_stat_cards || [], data);
  renderAnalyticsCards(data);
  renderWinLoss(data);
  renderByPipeline(data);
  loadTrend(currentTrendPeriod);
}
function saveLayoutConfig() {
  const layout = { hidden_stat_cards: statCardOrder.filter(c => c.hidden).map(c => c.id) };
  return api.patch('/api/analytics/layout', layout).then(res => {
    if (!res.error && analyticsData) analyticsData.layout = { ...analyticsData.layout, ...layout };
  });
}

/* ── Metric settings ─────────────────────────────────────────────────────── */

function openAnalyticsConfig() {
  if (!analyticsData) return;
  const { all_stages, deal_fields, config } = analyticsData;
  const wonIds  = (config.won_stage_ids  || []).map(Number);
  const lostIds = (config.lost_stage_ids || []).map(Number);
  const valueField = config.value_field || '';

  const pipelines = [], byId = {};
  for (const s of all_stages || []) {
    if (!byId[s.pipeline_id]) { byId[s.pipeline_id] = { name: s.pipeline_name, stages: [] }; pipelines.push(byId[s.pipeline_id]); }
    byId[s.pipeline_id].stages.push(s);
  }
  const stageGroup = (containerId, selected) => {
    const el = document.getElementById(containerId); if (!el) return;
    el.innerHTML = pipelines.map(pl => `
      <div class="analytics-pipeline-group">
        <div class="analytics-pipeline-sep">${esc(pl.name)}</div>
        <div class="analytics-stage-chips">
          ${pl.stages.map(s => `<label class="analytics-stage-option"><input type="checkbox" data-id="${s.id}" ${selected.includes(s.id) ? 'checked' : ''}><span class="col-dot" style="--stage:${esc(s.color || '')}"></span>${esc(s.name)}</label>`).join('')}
        </div>
      </div>`).join('');
  };
  stageGroup('analytics-won-stages',  wonIds);
  stageGroup('analytics-lost-stages', lostIds);

  const numericFields = (deal_fields || []).filter(f => f.type === 'number' || f.type === 'currency');
  const valueOptions = [
    { key: '',      label: t('cfg_value_none') },
    { key: 'value', label: t('cfg_value_builtin') },
    ...numericFields.map(f => ({ key: f.field_key, label: f.name })),
  ];
  const sel = document.getElementById('analytics-value-field');
  if (sel) sel.innerHTML = valueOptions.map(o => `<option value="${esc(o.key)}" ${valueField === o.key ? 'selected' : ''}>${esc(o.label)}</option>`).join('');

  const hasValue = config.value_field != null;
  const vis = document.getElementById('analytics-card-visibility');
  if (vis) vis.innerHTML = DEFAULT_STAT_ORDER
    .filter(id => !STAT_CARD_DEFS[id].requiresValue || hasValue)
    .map(id => {
      const card = statCardOrder.find(c => c.id === id);
      return `<label class="analytics-stage-option"><input type="checkbox" data-card-vis="${id}" ${card?.hidden ? '' : 'checked'}>${t(STAT_CARD_DEFS[id].label)}</label>`;
    }).join('');

  document.getElementById('analytics-config-msg')?.classList.add('hidden');
  document.getElementById('analytics-config-modal')?.classList.remove('hidden');
}
function closeAnalyticsConfig() {
  document.getElementById('analytics-config-modal')?.classList.add('hidden');
}
async function saveAnalyticsConfig() {
  const wonIds  = [...document.querySelectorAll('#analytics-won-stages  input[data-id]:checked')].map(el => parseInt(el.dataset.id));
  const lostIds = [...document.querySelectorAll('#analytics-lost-stages input[data-id]:checked')].map(el => parseInt(el.dataset.id));
  const valueField = document.getElementById('analytics-value-field')?.value || null;
  const msgEl = document.getElementById('analytics-config-msg');
  const showError = text => { if (!msgEl) return; msgEl.textContent = text; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); };

  if (wonIds.some(id => lostIds.includes(id))) { showError(t('cfg_overlap_error')); return; }

  document.querySelectorAll('#analytics-card-visibility input[data-card-vis]').forEach(cb => {
    const card = statCardOrder.find(c => c.id === cb.dataset.cardVis);
    if (card) card.hidden = !cb.checked;
    else statCardOrder.push({ id: cb.dataset.cardVis, hidden: !cb.checked });
  });

  const res = await api.patch('/api/analytics/config', { won_stage_ids: wonIds, lost_stage_ids: lostIds, value_field: valueField });
  await saveLayoutConfig();
  if (res.error) { showError(res.error); return; }
  closeAnalyticsConfig();
  loadAnalytics();
}
