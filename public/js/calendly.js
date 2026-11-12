/* ═══════════════════════════════════════════════════════════════════════════
   CALENDLY — the "calendly" tab on the Integrations page (CALENDLY_CHANGES Parts 1 and 2).

   One Calendly account per workspace, and only while Cal.com is not
   connected: a workspace books with one service. The server says who may do
   what (can_manage: owners and admins connect, pick the event type, refresh
   and disconnect; members see the account and the event type read-only) and
   whether Cal.com stands in the way (blocked_by). The token is sent once
   (POST /calendly/connect) and never comes back. The disabling here is
   cosmetic: the routes in routes/calendly.js are the real gate.

   Every refusal of the server carries a `code`; clyErrorText() says it in the
   page's language. Texts shared with the Cal.com card keep their cal_ keys.

     loadCalendly, renderCalendly, clyTypeLabel, clyErrorText, renderCalendlyGuide,
     toggleCalendlyGuide, showClyMsg, connectCalendly, saveCalendlyEventType,
     refreshCalendlyEventTypes, registerCalendlyWebhook, loadCalendlyLogs, disconnectCalendly

   Part 2: the card says whether Calendly reports bookings to this CRM (the
   booking webhook), offers to register it again while it is missing, and lists
   the last deliveries — in the Cal.com log's words, since the server names
   them alike.
   ═══════════════════════════════════════════════════════════════════════════ */

let calendlyData = null;

async function loadCalendly() {
  const data = await api.get('/api/integrations/calendly');
  if (!data || data.error) return;
  calendlyData = data;
  renderCalendly();
}

// "Erstgespräch (30 Min.)" and, when Calendly hides the type from the booking page, a tag.
function clyTypeLabel(x) {
  let s = x.name || x.slug || '';
  if (x.duration) s += ` (${tf('cal_minutes', { n: x.duration })})`;
  if (x.secret) s += ` [${t('cly_secret_tag')}]`;
  return s;
}

// The server's refusal, in the page's language. An unknown code falls back to the general line.
const CLY_ERROR_KEYS = { token_shape: 'cly_err_token_shape', calcom_connected: 'cly_blocked', rejected: 'cly_err_rejected', unreachable: 'cly_err_unreachable', not_connected: 'cly_none', event_type: 'cly_err_event_type', reseal: 'cly_err_reseal' };
const CLY_LOG_KEYS = { BOOKING_CREATED: 'cal_log_BOOKING_CREATED', BOOKING_RESCHEDULED: 'cal_log_BOOKING_RESCHEDULED', BOOKING_CANCELLED: 'cal_log_BOOKING_CANCELLED' };
function clyErrorText(res) {
  if (!res) return t('cal_err_generic');
  if (res.code === 'scope') return tf('cly_err_scope', { scopes: (Array.isArray(res.scopes) ? res.scopes : []).join(', ') });
  if (res.code === 'calendly_error') return tf('cly_err_answer', { detail: res.detail || '' });
  if (res.code === 'webhook') return tf('cly_err_webhook', { detail: res.detail || '' });
  return t(CLY_ERROR_KEYS[res.code] || 'cal_err_generic');
}

// ── the setup guide, in the Cal.com guide's clothes ───────────────────────────
// Open while nothing is connected; folded to its header once connected, with a button that opens
// it again. The steps carry <strong>/<code> markup and are inserted as-is, as the Cal.com and
// Platforms guides are; the permissions are named exactly as Calendly lists them.
const CLY_GUIDE = {
  logo: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="40" height="40" rx="9" fill="#006bff"/><path d="M26.5 24.2a7.6 7.6 0 1 1 0-8.4" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round"/></svg>`,
  steps: ['cly_guide_step1', 'cly_guide_step2', 'cly_guide_step3', 'cly_guide_step4', 'cly_guide_step5', 'cly_guide_step6', 'cly_guide_step7'],
  note: 'cly_guide_note',
};
let clyGuideOpen = null;   // null: open while not connected, folded once connected; a click decides from then on
function renderCalendlyGuide(connected) {
  const panel = document.getElementById('cly-guide-panel'); if (!panel) return;
  const open = clyGuideOpen === null ? !connected : clyGuideOpen;
  const steps = CLY_GUIDE.steps.map(k => `<li>${t(k)}</li>`).join('');   // dictionary strings with markup, inserted as-is
  panel.innerHTML = `
    <div class="intg-guide-header">
      <div class="intg-guide-logo-sm">${CLY_GUIDE.logo}</div>
      <div>
        <div class="intg-guide-title-text">${esc(t('cly_guide_title'))}</div>
        <div class="intg-guide-subtitle">${esc(t('intg_setup_guide'))}</div>
      </div>
      <button type="button" class="btn btn-sm intg-guide-toggle" onclick="toggleCalendlyGuide()" aria-expanded="${open}" aria-controls="cly-guide-steps">${esc(open ? t('cal_guide_hide') : t('cal_guide_show'))}</button>
    </div>
    ${open ? `<ol class="intg-guide-steps" id="cly-guide-steps">${steps}</ol><div class="intg-guide-note">${t(CLY_GUIDE.note)}</div>` : ''}`;
}
function toggleCalendlyGuide() {
  const connected = !!calendlyData?.connected && !!calendlyData?.calendly;
  clyGuideOpen = !(clyGuideOpen === null ? !connected : clyGuideOpen);
  renderCalendlyGuide(connected);
}

// Everything is decided by three values from the server: connected, can_manage and blocked_by.
function renderCalendly() {
  const d = calendlyData;
  const card = document.getElementById('cly-card'); if (!d || !card) return;
  const c = d.calendly, manage = !!d.can_manage, connected = !!d.connected && !!c, blocked = !connected && d.blocked_by === 'calcom';
  const show = (id, on) => document.getElementById(id)?.classList.toggle('hidden', !on);
  const status = document.getElementById('cly-status');
  if (status) { status.textContent = connected ? t('cal_status_connected') : t('cal_status_none'); status.className = 'badge' + (connected ? ' badge-success' : ''); }
  show('cly-readonly-hint', !manage);
  show('cly-blocked', blocked);
  show('cly-connect-section', manage && !connected && !blocked);
  show('cly-none', !manage && !connected && !blocked);
  show('cly-account-section', connected);
  show('cly-type-section', connected);
  show('cly-actions', manage && !blocked);
  show('cly-connect-btn', manage && !connected && !blocked);
  show('cly-refresh-btn', manage && connected);
  show('cly-register-btn', manage && connected && !c?.webhook_registered);
  show('cly-log-section', connected);
  show('cly-disconnect-btn', manage && connected);
  show('cly-guide-section', manage && !blocked);   // the guide is for whoever can connect; open until connected, folded after
  renderCalendlyGuide(connected);
  if (!connected) return;
  loadCalendlyLogs();
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  const when = c.connected_at ? new Date(c.connected_at).toLocaleString(locale) : '';
  const facts = [
    [t('cal_fact_account'),      [c.name, c.email].filter(Boolean).join(', ')],
    [t('cly_fact_page'),         c.scheduling_url || ''],
    [t('cal_fact_timezone'),     c.timezone || ''],
    [t('cal_fact_connected_by'), c.connected_by_name ? tf('cal_connected_by_on', { name: c.connected_by_name, date: when }) : when],
    [t('cal_fact_webhook'),      c.webhook_registered ? t('cal_webhook_on') : t('cal_webhook_off') + (c.last_error ? ', ' + c.last_error : '') + '. ' + t('cly_webhook_hint')],
  ];
  const facts_el = document.getElementById('cly-facts');
  if (facts_el) facts_el.innerHTML = `<table class="table compact"><tbody>${facts.map(([k, v]) => `<tr><td class="strong">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
  const sel = document.getElementById('cly-event-type'), ro = document.getElementById('cly-type-readonly');
  if (!sel || !ro) return;
  if (manage) {
    const types = Array.isArray(c.event_types) ? c.event_types : [];
    sel.innerHTML = types.length
      ? types.map(x => `<option value="${esc(x.uri)}"${c.event_type && c.event_type.uri === x.uri ? ' selected' : ''}>${esc(clyTypeLabel(x))}</option>`).join('')
      : `<option value="">${esc(t('cal_no_event_types'))}</option>`;
    sel.disabled = !types.length;
    sel.classList.remove('hidden'); ro.classList.add('hidden');
  } else {
    sel.classList.add('hidden'); ro.classList.remove('hidden');
    ro.value = c.event_type ? clyTypeLabel(c.event_type) : t('cal_no_event_types');
  }
}

function showClyMsg(text, ok) {
  const el = document.getElementById('cly-msg'); if (!el) return;
  el.textContent = text;
  el.className   = 'workspace-name-msg ' + (ok ? 'success' : 'error');
  setTimeout(() => el.classList.add('hidden'), ok ? 2500 : 8000);
}

// The token goes to the server once; the field is emptied whatever the outcome of the request.
async function connectCalendly(btn) {
  const input = document.getElementById('cly-token');
  const token = input ? input.value.trim() : '';
  if (!token) { showClyMsg(t('cly_token_required'), false); input?.focus(); return; }
  if (btn) btn.disabled = true;
  try {
    const res = await api.post('/api/integrations/calendly/connect', { token });
    if (input) input.value = '';
    if (!res || res.error) { showClyMsg(clyErrorText(res), false); if (res?.code === 'calcom_connected') loadCalendly(); return; }
    calendlyData = res; renderCalendly();
    showClyMsg(t('cly_connected_ok'), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveCalendlyEventType() {
  const sel = document.getElementById('cly-event-type');
  const uri = sel ? sel.value : '';
  if (!uri) return;
  const res = await api.patch('/api/integrations/calendly', { event_type: uri });
  if (!res || res.error) { showClyMsg(clyErrorText(res), false); renderCalendly(); return; }
  calendlyData = res; renderCalendly();
  showClyMsg(t('cal_saved'), true);
}

async function refreshCalendlyEventTypes(btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await api.post('/api/integrations/calendly/refresh', {});
    if (!res || res.error) { showClyMsg(clyErrorText(res), false); return; }
    calendlyData = res; renderCalendly();
    showClyMsg(t('cal_refreshed'), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Retry the booking webhook at Calendly; the server answers the card's state either way.
async function registerCalendlyWebhook(btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await api.post('/api/integrations/calendly/register-webhook', {});
    if (!res) { showClyMsg(t('cal_err_generic'), false); return; }
    if (res.calendly !== undefined) { calendlyData = { connected: res.connected, calendly: res.calendly, can_manage: res.can_manage, blocked_by: res.blocked_by }; renderCalendly(); }
    if (res.error) { showClyMsg(clyErrorText(res), false); return; }
    showClyMsg(t('cal_registered_ok'), true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// The last 30 deliveries from Calendly: what was booked, moved or cancelled, and what became of it.
async function loadCalendlyLogs() {
  const el = document.getElementById('cly-log'); if (!el) return;
  const data = await api.get('/api/integrations/calendly/logs');
  const logs = data && !data.error ? (data.logs || []) : [];
  if (!logs.length) { el.innerHTML = `<p class="empty-inline">${esc(t('cal_log_none'))}</p>`; return; }
  const locale = currentLang === 'de' ? 'de-DE' : 'en-GB';
  el.innerHTML = logs.map(l => {
    const c = l.captured || {};
    const what = CLY_LOG_KEYS[c.trigger] ? t(CLY_LOG_KEYS[c.trigger]) : '';
    const when = [c.event_date, c.event_time].filter(Boolean).join(' ');
    const notes = [c.created_contact ? t('cal_log_new_contact') : '', c.created_deal ? t('cal_log_new_deal') : ''].filter(Boolean).join(', ');
    return `<div class="intg-log-entry${l.status === 'error' ? ' error' : ''}">
      <div class="intg-log-entry-header">
        <span class="intg-log-badge ${esc(l.status)}">${esc(t('intg_log_' + l.status))}</span>
        <span class="intg-log-time">${esc(new Date(l.created_at).toLocaleString(locale))}</span>
        <span class="intg-log-contact">${esc([what, l.contact_name].filter(Boolean).join(': ') || l.error || '')}</span>
      </div>
      ${l.status === 'success' ? `<div class="intg-log-fields">${[c.title ? `<span class="intg-log-field">${esc(c.title)}</span>` : '', when ? `<span class="intg-log-field">${esc(when)}</span>` : '', notes ? `<span class="intg-log-field">${esc(notes)}</span>` : ''].join('')}</div>` : (l.error ? `<div class="intg-log-fields"><span class="intg-log-field">${esc(l.error)}</span></div>` : '')}
    </div>`;
  }).join('');
}

async function disconnectCalendly() {
  const ok = await ui.confirm({ title: t('cal_btn_disconnect'), message: t('cly_confirm_disconnect'), confirmLabel: t('cal_btn_disconnect'), danger: true });
  if (!ok) return;
  const res = await api.del('/api/integrations/calendly');
  if (!res || res.error) { showClyMsg(clyErrorText(res), false); return; }
  calendlyData = res; renderCalendly();
  showClyMsg(t('cly_disconnected_ok'), true);
}
