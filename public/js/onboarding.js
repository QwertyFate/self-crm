// ---- Onboarding page --------------------------------------------------------
// Every contact that is in onboarding, with its current step. Reads the same
// rows as the contacts page (GET /api/contacts) — no extra endpoint — and
// reuses ONBOARDING_STATUS_META / onboardingBadge / onboardingLabel from
// contacts.js. The four helpers above the render code are pure and unit-tested.
let onbRows = [], onbStatusFilter = 'all', onbQuery = '';

// The six active steps in ONBOARDING_STATUS_META order (everything after kein_onboarding).
function onboardingSteps() {
  return Object.keys(ONBOARDING_STATUS_META).filter(k => k !== 'kein_onboarding');
}

// { step, total, pct } — step 0 for kein_onboarding or an unknown status.
function onboardingProgress(status) {
  const steps = onboardingSteps();
  const step  = steps.indexOf(status) + 1;
  return { step, total: steps.length, pct: Math.round(step / steps.length * 100) };
}

// Rows in onboarding (kein_onboarding and unknown statuses dropped), optional
// status filter and case-insensitive name/company/email search, newest change first.
function filterOnboardingRows(rows, { status = 'all', q = '' } = {}) {
  const steps  = onboardingSteps();
  const needle = String(q || '').trim().toLowerCase();
  return rows
    .filter(r => steps.includes(r.onboarding_status))
    .filter(r => status === 'all' || r.onboarding_status === status)
    .filter(r => !needle || [r.name, r.company, r.email].some(v => String(v || '').toLowerCase().includes(needle)))
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

// { all, <each step>: n } over the rows that are in onboarding.
function onboardingCounts(rows) {
  const counts = { all: 0 };
  for (const s of onboardingSteps()) counts[s] = 0;
  for (const r of filterOnboardingRows(rows)) { counts.all++; counts[r.onboarding_status]++; }
  return counts;
}

// ---- Stage-triggered prompt -------------------------------------------------
// Ask only when a deal ENTERS the configured trigger set — not when it moves
// between two trigger stages or is re-saved in the same one. Ids may arrive
// as strings (form values) or numbers (kanban).
function shouldPromptOnboarding(prevStageId, newStageId, triggerIds) {
  const ids  = (Array.isArray(triggerIds) ? triggerIds : []).map(Number);
  const next = Number(newStageId), prev = Number(prevStageId);
  return !!next && ids.includes(next) && !ids.includes(prev);
}

// Called after a deal's stage change was accepted by the server (kanban drop,
// deal form). Never re-asks for a contact that is already in onboarding.
async function maybePromptOnboarding(deal, prevStageId, newStageId) {
  if (!shouldPromptOnboarding(prevStageId, newStageId, currentWorkspace?.onboarding_trigger_stage_ids || [])) return;
  const contactId = Number(deal?.contact_id) || null;
  if (!contactId) return;
  const c = await api.get(`/api/contacts/${contactId}`);
  if (!c || c.error) return;
  if (c.onboarding_status && c.onboarding_status !== 'kein_onboarding') return;
  const who = `${c.name || ''}${deal.title ? ` — ${deal.title}` : ''}`;
  if (!confirm(`${t('onb_stage_prompt')}\n\n${who}`)) return;
  if (!(await requestOnboardingStart(contactId, c.onboarding_status, { confirmed: true }))) return;
  if (document.querySelector('.sidebar-nav a.active')?.dataset.page === 'onboarding') await loadOnboarding();
}

async function loadOnboarding() {
  const res = await api.get('/api/contacts');          // all contact types: the engine can set a status on any contact
  onbRows = Array.isArray(res) ? res : [];
  renderOnboardingPills();
  renderOnboarding();
}

function renderOnboardingPills() {
  const el = document.getElementById('onb-pills'); if (!el) return;
  const counts = onboardingCounts(onbRows);
  const pill = (key, label, n) =>
    `<button type="button" class="stage-pill${onbStatusFilter === key ? ' active' : ''}" onclick="setOnboardingFilter('${key}')">${esc(label)} <span class="onb-pill-count">${n}</span></button>`;
  el.innerHTML = pill('all', t('onb_filter_all'), counts.all) + onboardingSteps().map(s => pill(s, onboardingLabel(s), counts[s])).join('');
}

function onboardingProgressHtml(status) {
  const { step, total } = onboardingProgress(status);
  const color = ONBOARDING_STATUS_META[status]?.color || '#94a3b8';
  const segs  = Array.from({ length: total }, (_, i) => `<i${i < step ? ` style="background:${color};border-color:${color}"` : ''}></i>`).join('');
  return `<div class="onb-progress" title="${step}/${total}">${segs}<span class="onb-progress-label">${step}/${total}</span></div>`;
}

function renderOnboarding() {
  const tbody = document.getElementById('onb-tbody'); if (!tbody) return;
  const rows  = filterOnboardingRows(onbRows, { status: onbStatusFilter, q: onbQuery });
  const dash  = '<span class="muted-dash">—</span>';
  tbody.innerHTML = rows.map(r => `<tr>
      <td class="name-cell"><strong onclick="openDetail(${r.id})">${esc(r.name)}</strong>${r.email ? `<div class="onb-sub">${esc(r.email)}</div>` : ''}</td>
      <td>${r.company ? esc(r.company) : dash}</td>
      <td>${onboardingBadge(r.onboarding_status)}${onboardingStatusSelect(r.id, r.onboarding_status, 'page')}</td>
      <td>${onboardingProgressHtml(r.onboarding_status)}</td>
      <td>${r.assigned_to_name ? esc(r.assigned_to_name) : dash}</td>
      <td>${fmtDate(r.updated_at) || dash}</td>
    </tr>`).join('');
  const total = filterOnboardingRows(onbRows).length;
  const count = document.getElementById('onb-count');
  if (count) count.textContent = rows.length === total ? String(total) : `${rows.length} / ${total}`;
  document.getElementById('onb-empty')?.classList.toggle('hidden', rows.length > 0);
  document.getElementById('onb-table-wrap')?.classList.toggle('hidden', rows.length === 0);
}

function filterOnboarding() {
  onbQuery = document.getElementById('onb-search')?.value || '';
  renderOnboarding();
}

function setOnboardingFilter(status) {
  onbStatusFilter = status;
  renderOnboardingPills();
  renderOnboarding();
}
