// ── ANALYTICS ─────────────────────────────────────────────
let analyticsData = null;

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
  const data = await api.get('/api/analytics/summary');
  if (!data || data.error) return;
  analyticsData = data;

  const now = new Date();
  document.getElementById('analytics-period').textContent =
    now.toLocaleString('default', { month: 'long', year: 'numeric' });

  renderAnalyticsCards(data);
  renderWinLoss(data);
  renderByPipeline(data);
  loadTrend(currentTrendPeriod);
}

function renderAnalyticsCards(d) {
  const hasValue = d.config.value_field != null;

  const cards = [
    { label: 'Total Contacts', value: fmt(d.total_contacts), sub: `+${d.new_contacts} this month`, color: '#3b82f6' },
    { label: 'Total Deals',    value: fmt(d.total_deals),    sub: `${d.open_deals} open`,           color: '#8b5cf6' },
    { label: 'Win Rate',
      value: d.win_rate != null ? d.win_rate + '%' : '—',
      sub:   d.win_rate != null ? `${d.won_deals} won · ${d.lost_deals} lost` : 'Configure won/lost stages',
      color: '#22c55e' },
    hasValue && { label: 'Pipeline Value', value: fmtCurrency(d.pipeline_value), sub: 'Open deals',                         color: '#f59e0b' },
    hasValue && { label: 'Won Value',      value: fmtCurrency(d.won_value),      sub: d.avg_value != null ? `Avg ${fmtCurrency(d.avg_value)}` : 'Won deals', color: '#10b981' },
    { label: 'New Deals', value: fmt(d.new_deals), sub: 'This month', color: '#6366f1' },
  ].filter(Boolean);

  document.getElementById('analytics-cards').innerHTML = cards.map(c => `
    <div class="analytics-card">
      <div class="analytics-card-accent" style="background:${c.color}"></div>
      <div class="analytics-card-label">${c.label}</div>
      <div class="analytics-card-value">${c.value}</div>
      <div class="analytics-card-sub">${c.sub}</div>
    </div>`).join('');
}

function renderWinLoss(d) {
  const section = document.getElementById('analytics-winloss-section');
  const total   = d.won_deals + d.lost_deals + d.open_deals;
  if (total === 0) { section.style.display = 'none'; return; }
  section.style.display = '';

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
let currentTrendPeriod = 'week';

async function loadTrend(period) {
  currentTrendPeriod = period;
  const data = await api.get(`/api/analytics/trend?period=${period}`);
  if (!data || data.error) return;

  const hasValue = analyticsData?.config?.value_field != null;
  const charts = [
    { id: 'trend-contacts', title: 'New Contacts', rows: data.contacts, key: 'cnt', color: '#3b82f6' },
    { id: 'trend-deals',    title: 'New Deals',    rows: data.deals,    key: 'cnt', color: '#8b5cf6' },
  ];
  if (hasValue && data.value_trend) {
    charts.push({ id: 'trend-value', title: 'Deal Value', rows: data.value_trend, key: 'val', color: '#10b981', currency: true });
  }

  document.getElementById('analytics-trend-grid').innerHTML = charts.map(c => `
    <div class="trend-card">
      <div class="trend-card-title">${c.title}</div>
      <div class="trend-card-total">${c.currency ? fmtCurrency(c.rows.reduce((s, r) => s + parseFloat(r[c.key] || 0), 0)) : fmt(c.rows.reduce((s, r) => s + parseInt(r[c.key] || 0), 0))}</div>
      <div class="trend-chart-wrap" id="${c.id}"></div>
      <div class="trend-x-labels" id="${c.id}-labels"></div>
    </div>`).join('');

  charts.forEach(c => {
    const values = c.rows.map(r => parseFloat(r[c.key] || 0));
    const labels = c.rows.map(r => formatTrendLabel(r.period, period));
    renderSparkline(c.id, values, labels, c.color, c.currency);
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

  const W = 500, H = 90, padX = 4, padY = 8;
  const max  = Math.max(...values, 1);
  const n    = values.length;
  const step = (W - padX * 2) / Math.max(n - 1, 1);

  const pts = values.map((v, i) => ({
    x: padX + i * step,
    y: padY + (1 - v / max) * (H - padY * 2),
  }));

  const linePath  = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath  = `${linePath} L${pts[pts.length-1].x},${H} L${pts[0].x},${H} Z`;
  const gradId    = `grad-${containerId}`;

  // Pick evenly-spaced label indices
  const maxLabels = 7;
  const labelStep = Math.ceil(n / maxLabels);
  const labelIndices = values.map((_, i) => i).filter(i => i % labelStep === 0 || i === n - 1);

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="sparkline-svg">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="${color}" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})"/>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => `
        <circle class="spark-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"
          fill="${color}" stroke="var(--card-bg)" stroke-width="2"
          data-val="${isCurrency ? fmtCurrency(values[i]) : values[i]}"
          data-label="${labels[i]}"/>
      `).join('')}
    </svg>`;

  el.innerHTML = svg;

  // X-axis labels
  const labelsEl = document.getElementById(`${containerId}-labels`);
  if (labelsEl) {
    labelsEl.innerHTML = `<div class="spark-label-row">` +
      labelIndices.map(i => {
        const pct = n <= 1 ? 0 : (i / (n - 1)) * 100;
        return `<span class="spark-label" style="left:${pct}%">${labels[i]}</span>`;
      }).join('') + `</div>`;
  }

  // Tooltip on hover
  el.querySelectorAll('.spark-dot').forEach(dot => {
    dot.addEventListener('mouseenter', e => showSparkTooltip(e, dot.dataset.label, dot.dataset.val));
    dot.addEventListener('mouseleave', hideSparkTooltip);
  });
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

  const res = await api.patch('/api/analytics/config', { won_stage_ids: wonIds, lost_stage_ids: lostIds, value_field: valueField });
  if (res.error) {
    msgEl.textContent = res.error;
    msgEl.className   = 'workspace-name-msg error';
    msgEl.classList.remove('hidden');
    return;
  }
  closeAnalyticsConfig();
  loadAnalytics();
}
