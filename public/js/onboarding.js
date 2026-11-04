/* ═══════════════════════════════════════════════════════════════════════════
   ONBOARDING MONITOR — read-only view of every deal with its customer's
   Upgrads Engine onboarding status (Developer Briefing §5.3).

   The status itself belongs to the Engine: it arrives through
   PATCH /api/kunden/:id/status and the CRM never sets it. What the CRM owns is
   the kick-off: a deal entering a trigger stage fires `vertrag.unterschrieben`.
   The "Start onboarding" button here is a shortcut to that same move — it calls
   PATCH /api/deals/:id/stage with the pipeline's first trigger stage, exactly
   like dragging the card on the board — so there is one trigger path, not two.

   Data: GET /api/engine/onboarding (owners/admins; routes/engine.js).
   Sidebar: updateOnboardingNav() shows the link only to owners/admins while the
   integration is active (GET /api/engine/status, cheap, never creates a row).
   ═══════════════════════════════════════════════════════════════════════════ */

let onboardingData   = null;    // last answer of GET /api/engine/onboarding
let onboardingFilter = 'all';   // all | not_started | running | done

const ONB_STALE_DAYS = 14;      // "running" with no status change for this long gets a marker
const ONB_STATUSES   = ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];
const ONB_FILTERS    = ['all', 'not_started', 'running', 'done'];

// Sidebar link: owners/admins only, and only while the Engine integration is on.
async function updateOnboardingNav() {
  const link = document.getElementById('nav-onboarding-link'); if (!link) return;
  const manager = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  if (!manager) { link.classList.add('hidden'); return; }
  const s = await apiFetchSilent('/api/engine/status');
  link.classList.toggle('hidden', !(s && !s.error && s.active && s.can_manage));
}

// Where a deal stands from the CRM's point of view.
//   done        the Engine reported onboarding_abgeschlossen
//   running     the Engine reported any other progress, or the deal was kicked
//               off (sits in a trigger stage / a webhook went out) and the
//               Engine has not reported yet
//   not_started nothing has happened
function onboardingPhase(row) {
  if (!row) return 'not_started';
  if (row.onboarding_status === 'onboarding_abgeschlossen') return 'done';
  if (row.onboarding_status && row.onboarding_status !== 'kein_onboarding') return 'running';
  if (row.in_trigger || row.delivery) return 'running';
  return 'not_started';
}

function onboardingIsStale(row, now = Date.now()) {
  if (onboardingPhase(row) !== 'running' || !row.status_since) return false;
  return now - new Date(row.status_since).getTime() > ONB_STALE_DAYS * 86_400_000;
}

// 0 (kein_onboarding) … 6 (onboarding_abgeschlossen); unknown values count as 0.
function onboardingStatusStep(status) { const i = ONB_STATUSES.indexOf(status); return i < 0 ? 0 : i; }

async function loadOnboarding() {
  const data = await api.get('/api/engine/onboarding');
  onboardingData = data && !data.error ? data : null;
  renderOnboarding();
}

function setOnboardingFilter(f) {
  onboardingFilter = ONB_FILTERS.includes(f) ? f : 'all';
  renderOnboarding();
}

function renderOnboarding() {
  const body  = document.getElementById('onboarding-body'); if (!body) return;
  const tools = document.getElementById('onboarding-toolbar');
  const sub   = document.getElementById('onboarding-page-sub');
  const hint  = document.getElementById('onboarding-inactive');
  const rows  = onboardingData?.rows || [];
  const counts = { all: rows.length, not_started: 0, running: 0, done: 0 };
  rows.forEach(r => { counts[onboardingPhase(r)] += 1; });

  if (hint) hint.classList.toggle('hidden', !onboardingData || !!onboardingData.active);
  if (sub)  sub.textContent = tf('onb_sub', { running: counts.running, done: counts.done });
  if (tools) tools.innerHTML = `<div class="seg" role="group" aria-label="${esc(t('onb_filter_aria'))}">${
    ONB_FILTERS.map(f => `<button type="button" aria-pressed="${f === onboardingFilter}" onclick="setOnboardingFilter('${f}')">${esc(t('onb_filter_' + f))} <span class="muted">${counts[f]}</span></button>`).join('')
  }</div>`;

  const shown = rows.filter(r => onboardingFilter === 'all' || onboardingPhase(r) === onboardingFilter);
  body.innerHTML = shown.length
    ? shown.map(onboardingRowHtml).join('')
    : `<tr class="table-empty-row"><td colspan="8"><div class="table-empty"><h2>${esc(t(rows.length ? 'onb_empty_filter' : 'onb_empty'))}</h2><p>${esc(t('onb_empty_hint'))}</p></div></td></tr>`;
}

// One table row. Pure apart from t()/tf()/fmtDate()/icon() and the clock.
function onboardingRowHtml(r) {
  const phase = onboardingPhase(r);
  const stale = onboardingIsStale(r);
  const dash  = '<span class="muted-dash">—</span>';
  const hasContact = r.contact_id != null;

  const stage = r.stage_name
    ? `<span class="stage-pill"><i style="background:${esc(r.stage_color || '#999')}"></i>${esc(r.stage_name)}</span>`
    : dash;

  const statusKey = ONB_STATUSES.includes(r.onboarding_status) ? r.onboarding_status : 'kein_onboarding';
  const status = hasContact
    ? `<span class="onb-status step-${onboardingStatusStep(r.onboarding_status)}${phase === 'done' ? ' done' : ''}">${esc(t('onb_status_' + statusKey))}</span>`
    : dash;

  const since = hasContact && r.status_since
    ? `${esc(fmtDate(r.status_since))}${stale ? ` <span class="badge badge-warning">${esc(tf('onb_stale', { days: ONB_STALE_DAYS }))}</span>` : ''}`
    : '';

  const d = r.delivery;
  const dStatus = d && ['success', 'failed', 'pending'].includes(d.status) ? d.status : 'pending';
  const delivery = !d
    ? `<span class="muted">${esc(t('onb_delivery_none'))}</span>`
    : `<span class="badge ${dStatus === 'success' ? 'badge-success' : dStatus === 'failed' ? 'badge-danger' : 'badge-warning'}" title="${esc(d.last_error || '')}">${esc(t('engine_status_' + dStatus))}</span>`;

  const drive = r.drive_ordner_id
    ? `<a class="onb-drive" href="https://drive.google.com/drive/folders/${encodeURIComponent(r.drive_ordner_id)}" target="_blank" rel="noopener" title="${esc(t('onb_drive_link'))}" aria-label="${esc(t('onb_drive_link'))}">${icon('folder')}</a>`
    : '';

  // The button appears only where a kick-off is still possible. Without a customer the
  // Engine has nothing to create; without a trigger stage there is nowhere to move the deal.
  let action = '';
  if (phase === 'not_started' && !r.in_trigger) {
    const why = !hasContact ? t('onb_no_contact') : !r.trigger_stage_id ? t('onb_no_trigger_stage') : '';
    action = why
      ? `<button type="button" class="btn btn-secondary btn-sm" disabled title="${esc(why)}">${esc(t('onb_btn_start'))}</button>`
      : `<button type="button" class="btn btn-primary btn-sm" onclick="startOnboarding(${Number(r.deal_id)})">${esc(t('onb_btn_start'))}</button>`;
  }

  const customer = hasContact
    ? `<a href="#" onclick="event.preventDefault();openContactDetail(${Number(r.contact_id)})">${esc(r.contact_name)}</a>${r.contact_company ? `<div class="muted onb-sub">${esc(r.contact_company)}</div>` : ''}`
    : dash;

  return `<tr data-deal="${Number(r.deal_id)}">
    <td class="strong"><a href="#" onclick="event.preventDefault();openDealDetail(${Number(r.deal_id)})">${esc(r.deal_title)}</a><div class="muted onb-sub">${esc(r.pipeline_name || '')}</div></td>
    <td>${customer}</td>
    <td>${stage}</td>
    <td>${status}</td>
    <td>${since}</td>
    <td>${delivery}</td>
    <td>${drive}</td>
    <td class="onb-actions">${action}</td>
  </tr>`;
}

// Shortcut to the existing trigger: move the deal into its pipeline's first trigger
// stage through PATCH /api/deals/:id/stage. routes/deals.js fires the webhook.
async function startOnboarding(dealId) {
  const row = (onboardingData?.rows || []).find(r => r.deal_id === dealId);
  if (!row || row.in_trigger || !row.trigger_stage_id || row.contact_id == null) return;
  const ok = await ui.confirm({
    title: t('onb_confirm_title'),
    message: tf('onb_confirm_body', { deal: row.deal_title, stage: row.trigger_stage_name || '' }),
    confirmLabel: t('onb_btn_start'),
  });
  if (!ok) return;
  const res = await api.patch(`/api/deals/${dealId}/stage`, { stage_id: row.trigger_stage_id });
  if (!res || res.error) { ui.toast(res?.error || t('core_network_error')); return; }
  ui.toast(tf('onb_started_toast', { deal: row.deal_title }));
  deals = [];   // the Deals page re-fetches on its next visit (its cache holds the old stage)
  await loadOnboarding();
}
