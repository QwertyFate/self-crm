/* ═══════════════════════════════════════════════════════════════════════════
   FONIO CALLS (#page-calls) — every call fonio reported, in and out, with the
   contact and deal it is connected to (FONIO_CHANGES Part 17). The list is
   GET /api/integrations/fonio/log: the calls the CRM sent and the calls it
   did not start (an incoming call, or one started in fonio by hand).

   Sidebar: the link exists only while fonio is connected in Integrations.
   updateFonioLogNav() asks at login; showFonioLogNav() follows the fonio tab
   (integrations.js renderFonio) when the connection is saved or removed.

   A call from a number no contact has stays here, without a note, until
   someone gives it a contact:
     Add contact         the normal contact dialog (modals.js), the number and
                         the name fonio gave filled in. saveContact() hands the
                         new contact to fonioLogContactSaved().
     Connect to contact  a picker over the existing contacts, for a known
                         person calling from another phone.
   Either way POST /log/:id/contact writes the kept call as the note on that
   contact. Opening the contact dialog anywhere else forgets the pending call
   (fonioLogForget), so an unrelated new contact never takes it.

   TECHNICAL DETAILS (Part 18)  Owners and admins get three dots at the end
   of a row, shown while the row is hovered or focused. They open what the CRM
   keeps about that call: what it sent to fonio, what fonio answered, the Body
   fonio sent afterwards, and the row itself (GET /log/:kind/:id).
   ═══════════════════════════════════════════════════════════════════════════ */
let fonioLogEntries = [];
let fonioLogFilter  = 'all';
let fonioLogManage  = false;  // owner or admin: may open a call's technical details
let fonioLogPending = null;   // the kept call the open contact dialog is for
let fonioLogPicking = null;   // the kept call the picker is for
let fonioLogContacts = [];    // the picker's own list: the Contacts page's list is left alone
const FONIO_LOG_FILTERS = ['all', 'planned', 'inbound', 'outbound', 'unknown'];
const FONIO_LOG_PICK_MAX = 30;

function showFonioLogNav(on) {
  document.getElementById('nav-fonio-log-link')?.classList.toggle('hidden', !on);
}
async function updateFonioLogNav() {
  if (!document.getElementById('nav-fonio-log-link')) return;
  const s = await apiFetchSilent('/api/integrations/fonio');
  showFonioLogNav(!!(s && !s.error && s.configured));
}

// A kept call nobody has given a contact yet.
function fonioLogIsUnknown(e) { return !e.by_crm && e.contact_id == null; }
function fonioLogMatches(e, filter) {
  if (filter === 'unknown') return fonioLogIsUnknown(e);
  if (filter === 'planned') return !!e.planned;
  return filter === 'all' || (!e.planned && e.direction === filter);   // a call still to come is no outgoing call yet
}

async function loadFonioLog() {
  const data = await api.get('/api/integrations/fonio/log');
  fonioLogEntries = data && !data.error && Array.isArray(data.entries) ? data.entries : [];
  fonioLogManage  = !!(data && !data.error && data.can_manage);
  renderFonioLog();
}

function setFonioLogFilter(f) {
  fonioLogFilter = FONIO_LOG_FILTERS.includes(f) ? f : 'all';
  renderFonioLog();
}

function renderFonioLog() {
  const body = document.getElementById('fonio-log-body'); if (!body) return;
  const tools = document.getElementById('fonio-log-toolbar');
  const sub   = document.getElementById('fonio-log-sub');
  const counts = {};
  FONIO_LOG_FILTERS.forEach(f => { counts[f] = fonioLogEntries.filter(e => fonioLogMatches(e, f)).length; });
  if (sub) sub.textContent = tf('fcl_sub', { inbound: counts.inbound, outbound: counts.outbound });
  if (tools) tools.innerHTML = `<div class="seg" role="group" aria-label="${esc(t('fcl_filter_aria'))}">${
    FONIO_LOG_FILTERS.map(f => `<button type="button" aria-pressed="${f === fonioLogFilter}" onclick="setFonioLogFilter('${f}')">${esc(t('fcl_filter_' + f))} <span class="muted">${counts[f]}</span></button>`).join('')
  }</div>`;
  const shown = fonioLogEntries.filter(e => fonioLogMatches(e, fonioLogFilter));
  body.innerHTML = shown.length
    ? shown.map(fonioLogRowHtml).join('')
    : `<tr class="table-empty-row"><td colspan="8"><div class="table-empty"><h2>${esc(t(fonioLogEntries.length ? 'fcl_empty_filter' : 'fcl_empty'))}</h2><p>${esc(t('fcl_empty_hint'))}</p></div></td></tr>`;
}

// One table row. Pure apart from t()/tf()/icon() and the language.
function fonioLogRowHtml(e) {
  const dash = '<span class="muted-dash">—</span>';
  const inbound = e.direction === 'inbound';
  const when = e.at ? new Date(e.at).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const direction = (e.planned
    ? `<span class="badge badge-warning">${esc(t('fcl_planned'))}</span>`
    : `<span class="badge ${inbound ? 'badge-info' : ''}">${esc(t(inbound ? 'fcl_dir_inbound' : 'fcl_dir_outbound'))}</span>`)
    + (e.by_crm ? `<div class="muted fcl-sub">${esc(t('fcl_by_crm'))}</div>` : '');
  const number = (e.number ? esc(e.number) : `<span class="muted">${esc(t('fcl_hidden_number'))}</span>`)
    + (e.caller_name ? `<div class="muted fcl-sub">${esc(e.caller_name)}</div>` : '');
  const unknown = fonioLogIsUnknown(e);
  const contact = e.contact_id != null
    ? `<a href="#" onclick="event.preventDefault();openContactDetail(${Number(e.contact_id)})">${esc(e.contact_name || '')}</a>`
    : unknown ? `<span class="badge badge-warning">${esc(t('fcl_unknown'))}</span>` : dash;
  const deal = e.deal_id != null
    ? `<a href="#" onclick="event.preventDefault();openDealDetail(${Number(e.deal_id)})">${esc(e.deal_title || '')}</a>`
    : dash;

  // what came of it: the summary of a kept call; for a call the CRM sent, whether fonio's result is in
  // a call still to come (Part 24) has no result yet
  const state = e.planned ? t('fcl_planned_waiting') : e.by_crm ? t(!e.result ? 'fcl_no_result' : e.noted ? 'fcl_noted' : 'fcl_result_no_note')
    : e.summary ? '' : t(e.noted ? 'fcl_noted' : 'fcl_no_summary');
  const extras = [
    e.duration ? esc(tf('fcl_duration', { d: e.duration })) : '',
    /^https:\/\//.test(e.link || '') ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(t('fcl_open_fonio'))}</a>` : '',
  ].filter(Boolean).join(' ');
  const result = (e.summary ? `<div class="fcl-summary">${esc(e.summary)}</div>` : `<span class="muted">${esc(state)}</span>`)
    + (extras ? `<div class="muted fcl-sub">${extras}</div>` : '');

  const actions = e.planned
    ? (fonioLogManage ? `<button type="button" class="btn btn-secondary btn-sm" onclick="fonioLogCancel(${Number(e.id)}, this)">${esc(t('fonio_call_cancel'))}</button>` : '')
    : unknown
    ? `<button type="button" class="btn btn-primary btn-sm" onclick="fonioLogAddContact(${Number(e.id)})">${esc(t('fcl_btn_add'))}</button>
       <button type="button" class="btn btn-secondary btn-sm" onclick="fonioLogPickContact(${Number(e.id)})">${esc(t('fcl_btn_connect'))}</button>`
    : '';
  const more = fonioLogManage
    ? `<button type="button" class="iconbtn fcl-more-btn" title="${esc(t('fcl_tech_title'))}" aria-label="${esc(t('fcl_tech_title'))}" onclick="openFonioLogTech('${e.by_crm ? 'call' : 'other'}', ${Number(e.id)})">${icon('ellipsis')}</button>`
    : '';
  return `<tr data-call="${esc(e.key)}">
    <td class="fcl-when">${esc(when)}</td>
    <td>${direction}</td>
    <td>${number}</td>
    <td>${contact}</td>
    <td>${deal}</td>
    <td>${result}</td>
    <td class="fcl-actions">${actions}</td>
    <td class="fcl-more">${more}</td>
  </tr>`;
}

function fonioLogUnknownById(id) { return fonioLogEntries.find(e => e.id === id && fonioLogIsUnknown(e)) || null; }

// The kept call is written onto the contact; the list is read again either way.
async function fonioLogConnect(id, contactId) {
  const res = await api.post(`/api/integrations/fonio/log/${id}/contact`, { contact_id: contactId });
  const ok = !!res && !res.error;
  ui.toast(t(ok ? 'fcl_connected' : res?.code === 'connected' ? 'fcl_already' : 'fcl_connect_failed'));
  await loadFonioLog();
  return ok;
}

// ── Add contact: the normal dialog, filled from the call ──
function fonioLogForget() { fonioLogPending = null; }
async function fonioLogAddContact(id) {
  const e = fonioLogUnknownById(id); if (!e) return;
  currentContactType = 'contact';
  await openContactModal();   // forgets any earlier pending call
  document.getElementById('cf-name').value  = e.caller_name || '';
  document.getElementById('cf-phone').value = e.number || '';
  fonioLogPending = id;
}
// Called by saveContact() after a NEW contact was saved: true when the contact was made from a call here.
async function fonioLogContactSaved(contactId) {
  const id = fonioLogPending;
  fonioLogPending = null;
  if (id == null || !contactId) return false;
  await fonioLogConnect(id, contactId);
  return true;
}

// ── Connect to a contact that exists ──
async function fonioLogPickContact(id) {
  const e = fonioLogUnknownById(id); if (!e) return;
  fonioLogPicking = id;
  const list = await api.get('/api/contacts?contact_type=contact');
  fonioLogContacts = Array.isArray(list) ? list : [];
  const search = document.getElementById('fcl-pick-search');
  if (search) search.value = '';
  renderFonioLogPick();
  document.getElementById('fcl-pick-modal')?.classList.remove('hidden');
  search?.focus();
}
function fonioLogPickMatches(list, query) {
  const q = String(query || '').trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  if (!q) return list;
  return list.filter(c => [c.name, c.company, c.email].some(v => String(v || '').toLowerCase().includes(q))
    || (digits.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(digits)));
}
function renderFonioLogPick() {
  const el = document.getElementById('fcl-pick-list'); if (!el) return;
  const found = fonioLogPickMatches(fonioLogContacts, document.getElementById('fcl-pick-search')?.value);
  const rows = found.slice(0, FONIO_LOG_PICK_MAX).map(c => `<li><button type="button" class="fcl-pick-row" onclick="fonioLogPicked(${Number(c.id)})">
      <b>${esc(c.name)}</b><span class="muted">${esc([c.company, c.phone].filter(Boolean).join(', '))}</span></button></li>`).join('');
  const more = found.length > FONIO_LOG_PICK_MAX ? `<li class="muted fcl-pick-note">${esc(tf('fcl_pick_more', { n: FONIO_LOG_PICK_MAX }))}</li>` : '';
  el.innerHTML = found.length ? rows + more : `<li class="muted fcl-pick-note">${esc(t('fcl_pick_none'))}</li>`;
}
async function fonioLogPicked(contactId) {
  const id = fonioLogPicking;
  fonioLogPicking = null;
  closeModal('fcl-pick-modal');
  if (id != null) await fonioLogConnect(id, contactId);
}

// A call still to come is cancelled from its row (owners and admins; the server decides). The list is read again
// either way: a call that went out meanwhile has moved down into the history.
async function fonioLogCancel(id, btn) {
  if (btn) btn.disabled = true;
  const res = await api.post(`/api/integrations/fonio/calls/${Number(id)}/cancel`, {});
  ui.toast(!res || res.error ? t(res?.reason === 'not_waiting' ? 'fonio_call_not_waiting' : 'fonio_err_generic') : t('fonio_call_cancelled_ok'));
  await loadFonioLog();
}

// ── Technical details (owners and admins) ──
const FONIO_LOG_TECH_PARTS = ['request', 'response', 'result_body', 'record'];
// A part as indented JSON, or '' when the CRM kept nothing for it (a call from before, a part that does not apply).
function fonioLogTechText(value) {
  return value === null || value === undefined ? '' : JSON.stringify(value, null, 2);
}
async function openFonioLogTech(kind, id) {
  const d = await api.get(`/api/integrations/fonio/log/${kind === 'call' ? 'call' : 'other'}/${Number(id)}`);
  if (!d || d.error) { ui.toast(t('fcl_tech_failed')); return; }
  for (const part of FONIO_LOG_TECH_PARTS) {
    const text = fonioLogTechText(d[part]);
    const applies = d.kind === 'call' || part === 'result_body' || part === 'record';   // a call the CRM did not start has no request
    document.getElementById(`fcl-tech-${part}-wrap`)?.classList.toggle('hidden', !applies);
    const pre = document.getElementById(`fcl-tech-${part}`);
    if (pre) pre.textContent = text || t('fcl_tech_none');
    document.getElementById(`fcl-tech-${part}-copy`)?.classList.toggle('hidden', !text);
  }
  document.getElementById('fcl-tech-modal')?.classList.remove('hidden');
}
