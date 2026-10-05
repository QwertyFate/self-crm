/* ═══════════════════════════════════════════════════════════════════════════
   ANALYTICS — the dashboard: KPI cards, funnel, win/loss, trends, tables.

   TWO REQUESTS FEED THE WHOLE PAGE
     GET /api/analytics/summary?months=3|6|12[&pipeline_id=]  → everything
         except the time series. One response: counts, win rate, values,
         period deltas, top open deals, by-owner, funnel, win-rate trend,
         by-pipeline, the stage list, the deal fields, the workspace config
         and this user's saved layout.
     GET /api/analytics/trend?period=week|month|year          → the sparkline
         series, fetched separately because the period switch changes only it.

   WHAT THE NUMBERS MEAN depends on the workspace's analytics_config:
     won_stage_ids / lost_stage_ids  which stages count as won and lost
     value_field                     which field the money metrics add up —
                                     'value' or a numeric custom deal field
   Nothing is computed until an owner sets these in openAnalyticsConfig();
   with no value_field the money cards render as "—" rather than zero. The
   server validates value_field against the workspace's own deal fields.

   LAYOUT IS PER USER (users.analytics_layout): card order, hidden cards,
   section order and the trend card config. Drag-and-drop writes the globals
   statCardOrder / sectionOrder / trendCardOrder and then PATCHes the layout.

   CHARTS ARE HAND-DRAWN SVG — no chart library. renderSparkline,
   renderBarChart, anRateChart and renderDetailView build SVG strings; the
   tooltip is a positioned div (showSparkTooltip).

   FUNCTION MAP
     load         loadAnalytics, loadTrend, setAnalyticsPeriod,
                  switchTrendPeriod, periodFromStorage, periodLabel
     layout       buildStatOrder, buildSectionOrder, renderAllSections,
                  initSectionDragDrop, initTrendDragDrop, saveLayoutConfig,
                  saveTrendConfig, setCardView
     sections     renderAnalyticsCards, getStatCardContent, renderWinRateTrend,
                  renderFunnel, renderDealsByOwner, renderTopOpenDeals,
                  renderWinLoss, wlSegments, renderByPipeline, renderTrendCards
     charts       anRateChart, renderSparkline, renderBarChart,
                  renderDetailView, showSparkTooltip, hideSparkTooltip
     tables       anDataTable, anTableBtn, toggleAnalyticsTable,
                  tablesFromStorage
     config       openAnalyticsConfig, closeAnalyticsConfig,
                  saveAnalyticsConfig, openFunnelPipelineMenu
     format       fmt, fmtCurrency, delta, formatTrendLabel,
                  syncAnalyticsPeriodSwitch
   ═══════════════════════════════════════════════════════════════════════════ */

let analyticsData  = null;
let analyticsPeriodMonths = periodFromStorage();   // the 3M/6M/12M switch in the page header
let analyticsTables = new Set(tablesFromStorage());   // the reference's per-card chart/table toggle (its S.tables)
let analyticsFunnelPipelineId = null;                 // which pipeline the funnel charts; null = the first

// The page chrome keeps its choices on the device: the route validates the range anyway, and a
// remembered range is what someone expects when they come back to the page.
function periodFromStorage() {
  try { const n = parseInt(localStorage.getItem('analyticsMonths'), 10); return [3, 6, 12].includes(n) ? n : 6; }
  catch { return 6; }
}
function tablesFromStorage() {
  try { const v = JSON.parse(localStorage.getItem('analyticsTables') || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
async function setAnalyticsPeriod(n) {
  if (![3, 6, 12].includes(n) || n === analyticsPeriodMonths) return;
  analyticsPeriodMonths = n;
  try { localStorage.setItem('analyticsMonths', String(n)); } catch {}
  syncAnalyticsPeriodSwitch();
  await loadAnalytics();
}
function syncAnalyticsPeriodSwitch() {
  document.querySelectorAll('#page-analytics [data-period]').forEach(b =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.period) === analyticsPeriodMonths)));
}

// The reference's tableBtn / dataTable (reference/pro/src/screens/analytics.js:289-291): every
// chart card can show the same numbers as a table instead, which is also how the data stays
// reachable for anyone who cannot read the chart.
function anTableBtn(id) {
  const on = analyticsTables.has(id);
  const label = on ? 'Show chart' : 'Show data table';
  return `<button class="btn btn-ghost btn-icon btn-sm" data-table="${id}" aria-pressed="${on}" aria-label="${label}" title="${label}" onclick="toggleAnalyticsTable('${id}')">${icon(on ? 'bar-chart' : 'table')}</button>`;
}
function toggleAnalyticsTable(id) {
  if (analyticsTables.has(id)) analyticsTables.delete(id); else analyticsTables.add(id);
  try { localStorage.setItem('analyticsTables', JSON.stringify([...analyticsTables])); } catch {}
  if (analyticsData) renderAllSections(analyticsData);
  document.querySelector(`[data-table="${id}"]`)?.focus();
}
function anDataTable(cols, rows, numFrom = 1) {
  return `<div class="an-table-wrap"><table class="table compact"><thead><tr>${
    cols.map((c, i) => i >= numFrom ? `<th class="num-col">${c}</th>` : `<th>${c}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${r.map((c, i) => i >= numFrom ? `<td class="num-col tnum">${c}</td>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// The reference scopes its whole page to one pipeline. Here only the funnel is pipeline-shaped
// (the KPIs, outcomes, owners and top deals are workspace-wide, and contacts and tasks are not
// per-pipeline at all), so the picker sits in the funnel's own header where it says what it does.
function openFunnelPipelineMenu(el) {
  const seen = new Map();
  (analyticsData?.all_stages || []).forEach(st => { if (!seen.has(st.pipeline_id)) seen.set(st.pipeline_id, st.pipeline_name); });
  const current = analyticsData?.funnel?.pipeline_id;
  const items = [...seen].map(([id, name]) => ({
    label: name, checked: id === current,
    onSelect: () => { analyticsFunnelPipelineId = id; loadAnalytics(); },
  }));
  if (items.length) ui.menu(el, items);
}
let statCardOrder  = [];
let sectionOrder   = [];

// The reference's key-metric cells (reference/pro/src/screens/analytics.js KPIS), in its order
// and with its wording, followed by the two counts this app has and the reference does not.
// Weighted forecast and Sales cycle are still missing on purpose: one needs a probability per
// stage, the other needs a deal to record when it was won. See DESIGN_PRO_CHANGES.md Part 23.
const STAT_CARD_DEFS = {
  open_pipeline:  { label: 'Open pipeline',  color: '#f59e0b', requiresValue: true },
  won_value:      { label: 'Won value',      color: '#10b981', requiresValue: true },
  win_rate:       { label: 'Win rate',       color: '#22c55e' },
  new_deals:      { label: 'New deals',      color: '#6366f1' },
  avg_deal_size:  { label: 'Avg deal size',  color: '#8b5cf6', requiresValue: true },
  contacts:       { label: 'Total contacts', color: '#3b82f6' },
  deals:          { label: 'Total deals',    color: '#0ea5e9' },
};
const DEFAULT_STAT_ORDER    = ['open_pipeline', 'won_value', 'win_rate', 'new_deals', 'avg_deal_size', 'contacts', 'deals'];
// A saved layout from before the rename still works: the old ids map onto the new ones.
const LEGACY_STAT_IDS = { pipeline_value: 'open_pipeline' };
const DEFAULT_SECTION_ORDER = ['stats','rate','funnel','winloss','owner','top','trends'];

// "last 6 months (May to Oct)" — the window the KPI deltas compare, stated where the
// reference states it, so a delta is never an unexplained number.
function periodLabel() {
  const n = analyticsPeriodMonths, to = new Date(), from = new Date();
  from.setMonth(from.getMonth() - n);
  const m = d => d.toLocaleString('default', { month: 'short' });
  return `Last ${n} months (${m(from)} to ${m(to)})`;
}
// The reference's delta: a real comparison, or plain words when there is nothing to compare.
// `good: -1` for metrics where a fall is the good news; `abs` for points and durations.
function delta(cur, prev, { good = 1, unit = '%', abs = false, vs = 'previous period' } = {}) {
  if (cur == null || prev == null || (!abs && !prev)) return `<span class="muted">No prior period</span>`;
  const raw = abs ? cur - prev : (cur - prev) / prev * 100, r = Math.round(raw);
  if (r === 0) return `<span class="muted">No change vs ${esc(vs)}</span>`;
  const up = r > 0, ok = (up ? 1 : -1) * good > 0;
  return `<span class="delta ${ok ? 'up' : 'down'}">${icon(up ? 'arrow-up' : 'arrow-down')}${up ? '+' : ''}${r}${unit === '%' ? ' %' : ' ' + unit}</span><span>vs ${esc(vs)}</span>`;
}

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
  const scope = analyticsFunnelPipelineId ? `&pipeline_id=${analyticsFunnelPipelineId}` : '';
  const data = await api.get(`/api/analytics/summary?months=${analyticsPeriodMonths}${scope}`);
  if (!data || data.error) return;
  analyticsData = data;

  syncAnalyticsPeriodSwitch();
  const sub = document.getElementById('analytics-period');
  if (sub) sub.textContent = periodLabel();

  const layout = data.layout || {};
  statCardOrder = buildStatOrder(layout.stat_card_order || [], layout.hidden_stat_cards || [], data);
  sectionOrder  = buildSectionOrder(layout.section_order || []);

  renderAllSections(data);
  loadTrend(currentTrendPeriod);
}

function buildStatOrder(savedOrder, hiddenIds, d) {
  const hasValue = d.config.value_field != null;
  const migrate = ids => ids.map(id => LEGACY_STAT_IDS[id] || id);
  savedOrder = migrate(savedOrder); hiddenIds = migrate(hiddenIds);
  const base = savedOrder.length ? [...savedOrder, ...DEFAULT_STAT_ORDER.filter(id => !savedOrder.includes(id))] : [...DEFAULT_STAT_ORDER];
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

function renderAllSections(d) {
  const main = document.getElementById('analytics-main-sections');
  if (!main) return;

  sectionOrder.forEach(id => {
    const el = document.getElementById(`analytics-sec-${id}`);
    if (el) main.appendChild(el);
  });

  renderAnalyticsCards(d);
  renderWinLoss(d);   // renders the By-pipeline rows inside its own card
  renderWinRateTrend(d);
  renderFunnel(d);
  renderDealsByOwner(d);
  renderTopOpenDeals(d);
  initSectionDragDrop();
}

// hint sits beside the label; foot carries the delta. Open pipeline, Won value and Win rate are
// snapshots of where deals sit right now — nothing records when a deal was won, so comparing them
// to an earlier window would be a guess. Those say what they count instead of showing a delta.
function getStatCardContent(id, d) {
  const snapshot = '<span class="muted">Current snapshot</span>';
  switch (id) {
    case 'open_pipeline': return { value: fmtCurrency(d.pipeline_value), hint: `${d.open_deals} open deals`, foot: snapshot };
    case 'won_value':     return { value: fmtCurrency(d.won_value), hint: 'Closed won', foot: snapshot };
    case 'win_rate':      return { value: d.win_rate != null ? d.win_rate + ' %' : '—',
                                   hint: d.win_rate != null ? `${d.won_deals} won, ${d.lost_deals} lost` : 'Set won and lost stages',
                                   foot: d.win_rate != null ? snapshot : '<span class="muted">Not configured</span>' };
    case 'new_deals':     return { value: fmt(d.new_deals), hint: 'Created', foot: delta(d.new_deals, d.prev_new_deals) };
    case 'avg_deal_size': return { value: fmtCurrency(d.avg_deal_size), hint: `${d.cohort_deals || 0} deals`, foot: delta(d.avg_deal_size, d.prev_avg_deal_size) };
    case 'contacts':      return { value: fmt(d.total_contacts), hint: 'In this workspace', foot: `<span class="muted">+${d.new_contacts} this month</span>` };
    case 'deals':         return { value: fmt(d.total_deals), hint: 'All pipelines', foot: snapshot };
    default: return { value: '—', hint: '', foot: '' };
  }
}

function renderAnalyticsCards(d) {
  const el = document.getElementById('analytics-cards');
  if (!el) return;
  const visible = statCardOrder.filter(c => !c.hidden);
  if (!visible.length) { el.innerHTML = ''; return; }

  // The reference packs the cells into one card on a hairline grid, two rows at most.
  const cols = visible.length <= 4 ? visible.length : Math.ceil(visible.length / 2);
  const rest = visible.length % cols;
  const cells = visible.map(({ id }) => {
    const def = STAT_CARD_DEFS[id], c = getStatCardContent(id, d);
    return `<div class="an-kpi" data-stat-id="${id}">
      <div class="kpi-label"><span>${esc(def.label)}</span><span class="hint">${c.hint || ''}</span></div>
      <div class="kpi-value">${c.value}</div>
      <div class="kpi-foot">${c.foot || ''}</div>
    </div>`;
  });
  el.innerHTML = `<section class="card" aria-label="Key metrics">
    <div class="an-kpis" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${cells.join('')}${
      rest ? `<div class="an-kpi-fill" style="grid-column:span ${cols - rest}">Changes compare the last ${analyticsPeriodMonths} months with the ${analyticsPeriodMonths} months before.</div>` : ''
    }</div></section>`;
}


// The reference's "Deals by owner". It draws this as an SVG with a hover tooltip; this app
// already has a horizontal-bar idiom in the DOM (.pipeline-bar-*), so the same information —
// avatar, first name, bar scaled to the busiest owner, count, total value, sorted — is drawn
// with that, and the open/won/lost split the reference puts in its tooltip rides along as a
// title. No SVG or ResizeObserver engine for a bar list.
// The reference's "Win rate per month" line chart (reference/pro/src/screens/analytics.js:176),
// rebuilt on the app's own SVG idiom: a fixed viewBox that scales with CSS instead of the
// reference's ResizeObserver redraw, and the app's existing spark tooltip instead of its own
// tooltip engine. Pure string in, string out, so the geometry is testable without a browser.
// points: [{ label, longLabel, rate|null, created, decided, won }]
function anRateChart(points) {
  const W = 640, H = 232, m = { l: 46, r: 10, t: 14, b: 26 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b, n = points.length, slot = pw / n;
  const y = v => m.t + ph - v / 100 * ph, x = i => m.l + slot * i + slot / 2;
  let g = [0, 25, 50, 75, 100].map(v =>
    `<line class="an-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
    `<text class="an-tick" x="${m.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v} %</text>`).join('');
  g += `<line class="an-axis" x1="${m.l}" x2="${W - m.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
  // Months with nothing decided have no rate, so they carry no point; the line spans the rest.
  const live = points.map((p, i) => ({ p, i })).filter(o => o.p.rate != null);
  const d = live.map((o, k) => (k ? 'L' : 'M') + x(o.i).toFixed(1) + ',' + y(o.p.rate).toFixed(1)).join('');
  if (live.length > 1) {
    g += `<path class="an-area" d="${d}L${x(live[live.length - 1].i).toFixed(1)},${y(0).toFixed(1)}L${x(live[0].i).toFixed(1)},${y(0).toFixed(1)}Z"/>`;
    g += `<path class="an-line" d="${d}"/>`;
  }
  points.forEach((p, i) => {
    const label = p.rate == null ? 'nothing decided yet' : `win rate ${p.rate} %`;
    g += `<g class="an-slot" role="img" aria-label="${esc(p.longLabel)}: ${label}">` +
      `<rect class="an-hit" x="${(m.l + slot * i).toFixed(1)}" y="${m.t}" width="${slot.toFixed(1)}" height="${ph + 20}"/>`;
    if (p.rate != null) g +=
      `<line class="an-cross" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${m.t}" y2="${y(0).toFixed(1)}"/>` +
      `<circle class="an-dot spark-dot" cx="${x(i).toFixed(1)}" cy="${y(p.rate).toFixed(1)}" r="4.5"` +
      ` data-label="${esc(p.longLabel)}" data-val="${p.rate} % won · ${p.won} of ${p.decided} decided · ${p.created} created"/>`;
    g += `</g><text class="an-xlab" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>`;
  });
  const last = live[live.length - 1];
  if (last) g += `<text class="an-t1" x="${Math.min(x(last.i), W - 2).toFixed(1)}" y="${(y(last.p.rate) - 12).toFixed(1)}"` +
    ` text-anchor="${x(last.i) + 14 > W ? 'end' : 'middle'}">${last.p.rate} %</text>`;
  return `<svg class="an-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="Win rate per month, line chart">${g}</svg>`;
}

function renderWinRateTrend(d) {
  const el = document.getElementById('analytics-win-rate');
  if (!el) return;
  const points = (d.win_rate_trend || []).map(mo => {
    const dt = new Date(Number(mo.ym.slice(0, 4)), Number(mo.ym.slice(5, 7)) - 1, 1);
    return {
      label: dt.toLocaleString('default', { month: 'short' }),
      longLabel: dt.toLocaleString('default', { month: 'long', year: 'numeric' }),
      rate: mo.rate, created: mo.created, decided: mo.decided, won: mo.won,
    };
  });
  const any = points.some(p => p.rate != null);
  const asTable = analyticsTables.has('rate');
  const body = !any
    ? `<div class="empty">${icon('trending-up')}<b>Nothing decided yet</b><div>A month gets a win rate once its deals reach a won or lost stage. Pick which stages count as won or lost in Configure Metrics.</div></div>`
    : asTable
      ? anDataTable(['Month', 'Win rate', 'Created', 'Decided'],
          points.map(p => [esc(p.longLabel), p.rate == null ? 'Nothing decided' : p.rate + ' %', p.created, p.decided]))
      : `<div class="an-chart">${anRateChart(points)}</div>`;
  el.innerHTML = `<section class="card" aria-labelledby="an-rate-title">
    <div class="card-header"><div><h2 class="card-title" id="an-rate-title">Win rate per month</h2>
      <div class="an-sub">Deals grouped by the month they were created · the share of the decided ones that were won · last ${analyticsPeriodMonths} months</div></div>
      <div class="row">${anTableBtn('rate')}</div></div>
    <div class="card-body">${body}</div></section>`;
  el.querySelectorAll('.spark-dot').forEach(dot => {
    dot.addEventListener('mouseenter', e => showSparkTooltip(e, dot.dataset.label, dot.dataset.val));
    dot.addEventListener('mouseleave', hideSparkTooltip);
  });
}

// The reference's pipeline funnel: one row per stage, the bar scaled to the widest stage,
// with the conversion to the next stage stated between the rows and the lost deals under a
// divider. Drawn with the app's own DOM bars rather than the reference's SVG chart engine —
// the shape is rows of proportional bars, so nothing is lost, and it stays verifiable
// without a browser (same deviation as the Deals-by-owner card, Part 25).
function renderFunnel(d) {
  const el = document.getElementById('analytics-funnel');
  if (!el) return;
  const f = d.funnel || {};
  const rows = f.rows || [];
  const max = Math.max(1, ...rows.map(x => x.reached));
  const body = rows.map((x, i) => {
    const color = x.color || 'var(--accent)';
    const next = rows[i + 1];
    const conv = next && x.reached ? Math.round(next.reached / x.reached * 100) : null;
    const row = `<div class="an-fn-row" title="${esc(x.name)}: ${x.reached} reached, ${x.in_stage} in this stage now, ${fmtCurrency(x.value)} in stage">
        <div class="an-fn-name"><span class="an-fn-dot" style="background:${esc(color)}"></span><span class="truncate">${esc(x.name)}</span></div>
        <div class="pipeline-bar-track"><div class="pipeline-bar-fill" style="width:${Math.round(x.reached / max * 100)}%;background:${esc(color)}"></div></div>
        <div class="an-fn-n tnum">${x.reached}</div>
        <div class="an-fn-val tnum">${fmtCurrency(x.value)}</div>
      </div>`;
    const caption = conv === null ? '' :
      `<div class="an-fn-conv">${icon('chevron-down', 'ic-sm')}${conv} % move on to ${esc(next.name)}</div>`;
    return row + caption;
  }).join('');
  const lost = f.lost && f.lost.deals ? `<div class="an-fn-lost">
      <div class="an-fn-name"><span class="an-fn-dot" style="background:${esc(f.lost.color || 'var(--danger)')}"></span><span class="truncate">${esc(f.lost.name)}</span></div>
      <div class="an-fn-lost-text">${f.lost.deals} lost · ${f.lost.base ? Math.round(f.lost.deals / f.lost.base * 100) : 0} % of all deals in this period</div>
      <div class="an-fn-val tnum">${fmtCurrency(f.lost.value)}</div>
    </div>` : '';
  const asTable = analyticsTables.has('funnel');
  const table = anDataTable(['Stage', 'Reached', 'Conversion', 'In stage now', 'Value in stage'], [
    ...rows.map((x, i) => [esc(x.name), x.reached,
      i && rows[i - 1].reached ? Math.round(x.reached / rows[i - 1].reached * 100) + ' %' : '—',
      x.in_stage, fmtCurrency(x.value)]),
    ...(f.lost && f.lost.deals ? [[esc(f.lost.name), f.lost.deals, '—', f.lost.deals, fmtCurrency(f.lost.value)]] : []),
  ]);
  const pipeBtn = `<button class="btn btn-secondary btn-sm" aria-haspopup="menu" onclick="openFunnelPipelineMenu(this)">${icon('kanban')}<span>${f.pipeline_name ? esc(f.pipeline_name) : 'Pipeline'}</span>${icon('chevron-down', 'ic-sm')}</button>`;
  el.innerHTML = `<section class="card" aria-labelledby="an-funnel-title">
    <div class="card-header"><div><h2 class="card-title" id="an-funnel-title">Pipeline funnel</h2>
      <div class="an-sub">deals created in the last ${analyticsPeriodMonths} months, by stage reached</div></div>
      <div class="row">${rows.length && !asTable ? '<div class="an-fn-head">Value in stage</div>' : ''}${pipeBtn}${anTableBtn('funnel')}</div></div>
    <div class="card-body">${!rows.length
      ? `<div class="empty">${icon('target')}<b>No pipeline to chart</b><div>Add a pipeline with stages and its funnel appears here.</div></div>`
      : asTable ? table : `<div class="an-fn">${body}${lost}</div>`}</div></section>`;
}

function renderDealsByOwner(d) {
  const el = document.getElementById('analytics-by-owner');
  if (!el) return;
  const list = d.by_owner || [], max = Math.max(1, ...list.map(o => o.deals));
  const any = list.some(o => o.deals > 0);
  const rows = list.map(o => `<div class="pipeline-bar-row an-owner-row" title="${esc(o.name)}: ${o.deals} deals, ${o.open} open, ${o.won} won, ${o.lost} lost">
      <div class="pipeline-bar-label row" style="gap:8px">${avatar(o.name, 'sm')}<span class="truncate">${esc(o.name.split(' ')[0])}</span></div>
      <div class="pipeline-bar-track"><div class="pipeline-bar-fill" style="width:${Math.round(o.deals / max * 100)}%"></div></div>
      <div class="pipeline-bar-stats">${o.deals} deal${o.deals === 1 ? '' : 's'}${o.value ? ' · ' + fmtCurrency(o.value) : ''}</div>
    </div>`).join('');
  const asTable = analyticsTables.has('owner');
  const body = !any
    ? `<div class="empty">${icon('users')}<b>No deals in this period</b><div>Deals created in the last ${analyticsPeriodMonths} months are counted here, per owner.</div></div>`
    : asTable
      ? anDataTable(['Owner', 'Deals', 'Open', 'Won', 'Lost', 'Value'],
          list.map(o => [esc(o.name), o.deals, o.open, o.won, o.lost, fmtCurrency(o.value)]))
      : `<div class="col" style="gap:10px">${rows}</div>`;
  el.innerHTML = `<section class="card" aria-labelledby="an-owner-title">
    <div class="card-header"><div><h2 class="card-title" id="an-owner-title">Deals by owner</h2>
      <div class="an-sub">Created in the last ${analyticsPeriodMonths} months</div></div>
      <div class="row">${anTableBtn('owner')}</div></div>
    <div class="card-body">${body}</div></section>`;
}

// The reference's "Top open deals": the largest deals still in play, straight through to the deal.
// Its Probability and Expected close columns are left out — no stage probability, no close date.
function renderTopOpenDeals(d) {
  const el = document.getElementById('analytics-top-deals');
  if (!el) return;
  const list = d.top_open_deals || [], total = d.open_deals || 0;
  const rows = list.map(d2 => {
    const who = d2.contact_name ? [d2.contact_name, d2.contact_company].filter(Boolean).join(', ') : 'No contact';
    return `<tr class="clickable" onclick="openDealDetail(${d2.id})" tabindex="0" role="link" aria-label="Open deal ${esc(d2.title)}">
      <td style="max-width:340px"><div class="truncate" style="font-weight:620">${esc(d2.title)}</div><div class="muted truncate" style="font-size:var(--fs-sm)">${esc(who)}</div></td>
      <td>${d2.stage_name ? `<span class="stage-pill"><i style="background:${esc(d2.stage_color || 'var(--border-strong)')}"></i>${esc(d2.stage_name)}</span>` : '<span class="muted">Not set</span>'}</td>
      <td class="num-col tnum strong">${d2.value != null ? fmtCurrency(d2.value) : '<span class="muted">—</span>'}</td>
      <td>${d2.assigned_to_name ? `<div class="row" style="gap:8px">${avatar(d2.assigned_to_name, 'sm')}<span>${esc(d2.assigned_to_name.split(' ')[0])}</span></div>` : '<span class="muted">Unassigned</span>'}</td></tr>`;
  }).join('');
  const body = list.length
    ? `<div class="table-wrap" style="border:0;box-shadow:none;border-radius:0"><table class="table"><thead><tr><th>Deal</th><th>Stage</th><th class="num-col">Value</th><th>Owner</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="empty">${icon('deals')}<b>No open deals</b><div>Deals still in play show up here, biggest first.</div></div>`;
  el.innerHTML = `<section class="card" aria-labelledby="an-top-title">
    <div class="card-header"><div><h2 class="card-title" id="an-top-title">Top open deals</h2><div class="an-sub">Largest deals still in play</div></div>
      <button class="btn btn-secondary btn-sm" type="button" onclick="switchPage('deals')">View all deals</button></div>
    ${body}
    ${total > list.length ? `<div class="table-foot"><span>Showing top ${list.length} of ${total} open deals</span><span class="tnum">Open value <b style="color:var(--ink)">${fmtCurrency(d.pipeline_value)}</b></span></div>` : ''}</section>`;
}

let dragSectionId = null;
function initSectionDragDrop() {
  const main = document.getElementById('analytics-main-sections');
  if (!main) return;
  main.querySelectorAll('.analytics-draggable-section').forEach(sec => {
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

// The reference's "Win and loss" card (reference/pro/src/screens/analytics.js:326, with the
// styles in reference/pro/crm-pro.html:1483-1488): a stacked outcome bar with legend rows,
// then the per-pipeline rows under a divider. These used to be two separate sections here;
// the reference keeps them in one card, so they were merged. renderByPipeline still fills
// its own container, which this card provides.
function wlSegments(d) {
  const won = d.won_deals || 0, open = d.open_deals || 0, lost = d.lost_deals || 0;
  const total = won + open + lost;
  return [
    { name: 'Won',  count: won,  color: 'var(--success)' },
    { name: 'Open', count: open, color: 'var(--accent)'  },
    { name: 'Lost', count: lost, color: 'var(--danger)'  },
  ].map(seg => ({ ...seg, pct: total ? Math.round(seg.count / total * 100) : 0 }));
}

function renderWinLoss(d) {
  const section = document.getElementById('analytics-winloss');
  if (!section) return;
  const segs = wlSegments(d);
  const total = segs.reduce((n, seg) => n + seg.count, 0);
  const bar = `<div class="stack" role="img" aria-label="${segs.map(seg => `${seg.name} ${seg.count}`).join(', ')}">${
    segs.filter(seg => seg.count).map(seg => `<span style="flex:${seg.count};background:${seg.color}" title="${seg.name}: ${seg.count} (${seg.pct} %)"></span>`).join('')}</div>`;
  const rows = segs.map(seg => `<div class="an-wl-row"><i style="background:${seg.color}"></i><span>${seg.name}</span><span class="n">${seg.count}</span><span class="p">${seg.pct} %</span></div>`).join('');
  const outcomes = total
    ? `<div class="an-wl">${bar}<div class="an-wl-rows">${rows}</div></div>`
    : `<div class="empty">${icon('target')}<b>No deal outcomes yet</b><div>Pick which stages count as won and lost in Configure Metrics and this fills in.</div></div>`;
  const asTable = analyticsTables.has('winloss');
  const pipes = d.by_pipeline || [];
  const body = asTable
    ? anDataTable(['Outcome', 'Deals', 'Share'], segs.map(seg => [seg.name, seg.count, seg.pct + ' %']))
      + `<div class="an-divider"></div>`
      + anDataTable(['Pipeline', 'Deals', 'Value'], pipes.map(p => [esc(p.pipeline_name), parseInt(p.cnt) || 0, fmtCurrency(parseFloat(p.val) || 0)]))
    : `${outcomes}<div class="an-divider"></div><div class="section-title">By pipeline</div><div class="an-pl" id="analytics-by-pipeline"></div>`;
  section.innerHTML = `<section class="card" aria-labelledby="an-wl-title">
    <div class="card-header"><div><h2 class="card-title" id="an-wl-title">Win and loss</h2>
      <div class="an-sub">Every deal by outcome, as things stand now</div></div>
      <div class="row">${anTableBtn('winloss')}</div></div>
    <div class="card-body">${body}</div></section>`;
  renderByPipeline(d);   // a no-op in table mode: its container only exists in the chart view
}

// All deals per pipeline, not just the window's — as in the reference, whose own by-pipeline
// rows read the full deal list while the outcome bar above them is its cohort.
function renderByPipeline(d) {
  const el = document.getElementById('analytics-by-pipeline');
  if (!el) return;
  const list = d.by_pipeline || [];
  const hasValue = d.config?.value_field != null;
  if (!list.length) { el.innerHTML = `<div class="an-sub">No pipelines yet.</div>`; return; }
  const maxCount = Math.max(1, ...list.map(p => parseInt(p.cnt) || 0));
  el.innerHTML = list.map(p => {
    const count = parseInt(p.cnt) || 0, val = parseFloat(p.val) || 0;
    const plural = count === 1 ? '' : 's';
    return `<div class="an-pl-row">
      <div class="t"><b>${esc(p.pipeline_name)}</b><span>${count} deal${plural}${hasValue ? ' · ' + fmtCurrency(val) : ''}</span></div>
      <div class="progress" role="img" aria-label="${count} deal${plural}"><i style="width:${Math.round(count / maxCount * 100)}%"></i></div>
    </div>`;
  }).join('');
}

const TREND_DEFS = {
  contacts: { title: 'New Contacts', key: 'cnt', color: '#3b82f6', dataKey: 'contacts' },
  deals:    { title: 'New Deals',    key: 'cnt', color: '#8b5cf6', dataKey: 'deals'    },
  value:    { title: 'Deal Value',   key: 'val', color: '#10b981', dataKey: 'value_trend', currency: true },
};

let currentTrendPeriod = 'week';
let trendCardOrder     = [];
let trendRawData       = null;
let dragCardId         = null;

async function loadTrend(period) {
  currentTrendPeriod = period;
  const data = await api.get(`/api/analytics/trend?period=${period}`);
  if (!data || data.error) return;
  trendRawData = data;

  const hasValue = analyticsData?.config?.value_field != null;
  const saved    = analyticsData?.layout?.trend_config || [];

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
        <div class="trend-drag-handle" title="Drag to reorder">${icon('grip', 'ic-sm')}</div>
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

function openAnalyticsConfig() {
  if (!analyticsData) return;
  const { all_stages, deal_fields, config } = analyticsData;
  const wonIds     = (config.won_stage_ids  || []).map(Number);
  const lostIds    = (config.lost_stage_ids || []).map(Number);
  const valueField = config.value_field || '';

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

  const numericFields = deal_fields.filter(f => f.type === 'number' || f.type === 'currency');
  const valueOptions  = [
    { key: '',      label: 'None — hide value metrics' },
    { key: 'value', label: 'Deal Value (built-in)' },
    ...numericFields.map(f => ({ key: f.field_key, label: f.name })),
  ];
  document.getElementById('analytics-value-field').innerHTML =
    valueOptions.map(o => `<option value="${o.key}" ${valueField === o.key ? 'selected' : ''}>${o.label}</option>`).join('');

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

  document.querySelectorAll('#analytics-card-visibility input[data-card-vis]').forEach(cb => {
    const card = statCardOrder.find(c => c.id === cb.dataset.cardVis);
    if (card) card.hidden = !cb.checked;
    else statCardOrder.push({ id: cb.dataset.cardVis, hidden: !cb.checked });
  });

  const res = await api.patch('/api/analytics/config', { won_stage_ids: wonIds, lost_stage_ids: lostIds, value_field: valueField });
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
