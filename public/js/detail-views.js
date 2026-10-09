/* ═══════════════════════════════════════════════════════════════════════════
   DETAIL VIEWS — the reference's pop windows and side panels
   (reference/pro/src/screens/deal-detail.js, contacts.js detail + form,
   tasks.js drawer + form), rendered through the ui.modal / ui.drawer
   primitives from core.js and backed by the app's own API.

   Loaded last, so the openers below replace the older modal-based ones:
     openDealModal(id)          → openDealDetail(id)   | openDealForm()
     openDealModalForContact(c) → openDealForm({ contactId })
     openDetail(id)             → openContactDetail(id) (side panel or modal)
     openTaskModal(id, ctx)     → openTaskDrawer(id)   | openTaskForm(ctx)
     openTaskModalForContact(c), addTaskFromDeal(), openLinkedTaskObject()
   ═══════════════════════════════════════════════════════════════════════════ */
/* THE BIGGEST CLIENT FILE, and the last one loaded, because it uses helpers
   from every other file. It builds the record views at runtime instead of
   reading them from index.html: a deal form, a deal detail drawer, a contact
   detail panel, a task form and a task drawer.

   THE PUBLIC ENTRY POINTS (what other files call — keep these stable):
     openDealModal(id) / openDealForm({pipelineId, stageId, contactId})
     openDealDetail(id)            the deal drawer with timeline + linked records
     openDealModalForContact(id)
     openContactDetail(id)         the contact panel
     openDetail(id)                alias used by the Contacts table
     openTaskModal(id, ctx) / openTaskForm(...)
     openTaskDrawer(id)
     addTaskFromDeal(dealId), openLinkedTaskObject(kind, id)

   HOW A VIEW IS BUILT  each opener keeps a local state object `S` (the record,
   its activities, which inline editor is open) and a render() that rebuilds the
   drawer's innerHTML from S. Interactions are delegated through a map of
   data-attribute handlers rather than inline onclick, so re-rendering never
   loses listeners. dvInlineEdit() is the shared "click a field, edit in place,
   PUT the record" helper.

   FUNCTION MAP
     helpers      dvDigits, dvActText, dvActHtml, dvDue, dvAutoGrow, dvEmpty,
                  dvInlineEdit, dvTypeOf, dvPlural, dvLower, dvNotSet, dvSupplierWord,
                  dvObjectWord, dvTaskStatuses, dvDoneKey, dvFirstKey,
                  dvAgoHours, dvWhen, dvIso, dvOpt, dvListOpts
     data         dvAllTasks, dvContacts, dvTaskLists, dvRefreshDeals,
                  dvRefreshTasks, dvRefreshContacts
     deals        openDealForm, openDealDetail, openDealModal,
                  openDealModalForContact
     contacts     openContactDetail, openDetail
     tasks        openTaskForm, openTaskDrawer, openTaskModal,
                  openTaskModalForContact, addTaskFromDeal,
                  openLinkedTaskObject

   CAUTION: dvActHtml() renders an activity's stored content as RAW HTML when it looks
     like HTML. Nothing sanitises it on the way in or out — see §8 of
     readmedev.md before extending activity rendering. */

/* ---------- shared helpers ---------- */
// label / verb / ph are dictionary KEYS (act_*, act_verb_*, act_ph_*): resolve with t() where they are shown.
const DV_ACT_TYPES = [
  { id: 'note', label: 'act_note', icon: 'note', verb: 'act_verb_note', ph: 'act_ph_note' },
  { id: 'call', label: 'act_call', icon: 'phone', verb: 'act_verb_call', ph: 'act_ph_call' },
  { id: 'email', label: 'act_email', icon: 'mail', verb: 'act_verb_email', ph: 'act_ph_email' },
  { id: 'whatsapp', label: 'act_whatsapp', icon: 'message-circle', verb: 'act_verb_whatsapp', ph: 'act_ph_whatsapp' },
];
const dvTypeOf = id => DV_ACT_TYPES.find(x => x.id === id) || DV_ACT_TYPES[0];
const dvPlural = (n, oneKey, manyKey) => n === 1 ? t(oneKey) : tf(manyKey, { n });   // dictionary keys: the singular carries its "1", the plural a {n}
const dvLower = w => currentLang === 'de' ? w : w.toLowerCase();   // a noun inside an English sentence is lower case; German keeps the capital
const dvNotSet = () => `<span class="muted">${esc(t('not_set'))}</span>`;
function dvDigits(s) { return String(s || '').replace(/[^\d+]/g, ''); }
const dvSupplierWord = () => currentWorkspace?.supplier_name ? currentWorkspace.supplier_name.replace(/s$/i, '') : t('dv_supplier_one');
const dvObjectWord = n => { const w = currentWorkspace?.object_name; if (!w) return t(n === 1 ? 'dv_object_one' : 'dv_objects_many'); return n === 1 ? w.replace(/s$/i, '') : w; };
const dvTaskStatuses = () => (Array.isArray(currentWorkspace?.task_statuses) && currentWorkspace.task_statuses.length) ? currentWorkspace.task_statuses : (typeof DEFAULT_TASK_STATUSES !== 'undefined' ? DEFAULT_TASK_STATUSES : []);
const dvDoneKey = () => dvTaskStatuses().at(-1)?.key || 'done';
const dvFirstKey = () => dvTaskStatuses()[0]?.key || 'todo';
const DV_PRIO = { urgent: ['prio_urgent', 'danger'], high: ['prio_high', 'warning'], medium: ['prio_medium', 'info'], low: ['prio_low', ''] };   // [dictionary key, badge tone]
// Timeline text: legacy entries are rich HTML, new ones are escaped text with line breaks.
// A stored note → safe HTML for display. Notes arrive in two shapes — escaped text with <br>
// (the timeline editors and, now, the modal) and raw text (older modal rows) — and the server
// stores whatever it was sent. So: reduce to plain text FIRST (dvActText: <br>/</p> → newline,
// tags stripped, entities decoded), THEN escape, THEN newline → <br>. Every legitimate note
// looks exactly as before, and no stored markup can ever reach the DOM — the old version trusted
// any string that contained a tag, which a raw "<img onerror=…>" would have satisfied.
function dvActHtml(s) { return esc(dvActText(s)).replace(/\n/g, '<br>'); }
function dvActText(s) {
  const t = String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}
const dvAgoHours = ts => { if (!ts) return ''; const h = Math.round((Date.now() - new Date(ts).getTime()) / 36e5); return h < 1 ? t('ago_now') : h < 24 ? tf('ago_h', { n: h }) : agoDays(ts); };
const dvWhen = ts => ts ? new Date(ts).toLocaleString(currentLang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
// What a freshly ticked "Set a due date" starts with: today on the VIEWER's clock, three
// hours from now, rounded UP to the next quarter hour (14:07 → 17:15). Crossing midnight rolls
// the date — Date arithmetic does that. `now` is a parameter so tests can pin it.
function dvDefaultDue(now = nowInTimezone(currentTimezone())) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 3, Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
// A due date phrased against the VIEWER's today, after converting the stored wall-clock
// (typed in `tz`, or the default zone for a row with none) to the viewer's zone. Days are
// built from parts: new Date('YYYY-MM-DD') is UTC midnight and lands a day early west of
// UTC. `now` is a parameter so tests can pin the viewer's clock.
function dvDue(d, due_time, tz, now = nowInTimezone(currentTimezone())) {
  if (!d) return t('tk_due_none');
  const shown = toViewerClock(String(d).slice(0, 10), String(due_time || '').slice(0, 5) || null, tz);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shown.date); if (!m) return t('tk_due_none');
  const day = new Date(+m[1], +m[2] - 1, +m[3]).getTime(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const off = Math.round((day - today) / 864e5), n = Math.abs(off), time = shown.time;
  if (off < 0) return off === -1 ? t('dv_overdue_one') : tf('dv_overdue_n', { n });
  if (off === 0) return time ? tf('dv_due_today_at', { time }) : t('dv_due_today');
  if (off === 1) return time ? tf('dv_due_tomorrow_at', { time }) : t('dv_due_tomorrow');
  return time ? tf('dv_due_in_days_at', { n, time }) : tf('dv_due_in_days', { n }); }
const dvIso = d => d ? String(d).slice(0, 10) : '';
// An edited note shows all of itself: the field takes the content's height rather than
// scrolling inside a fixed box. Reset to auto first so it shrinks again when text is deleted.
function dvAutoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
// Documents on a contact (contracts, call recordings, other) — the types the server accepts.
const DV_DOC_TYPES = ['vertrag', 'aufnahme', 'sonstiges'];
function dvFileSize(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(b < 10 * 1024 ? 1 : 0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function dvEmpty(ic, title, text = '', action = '') { return `<div class="empty">${icon(ic)}<b>${esc(title)}</b>${text ? `<div>${esc(text)}</div>` : ''}${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`; }
async function dvAllTasks() { const r = await api.get('/api/tasks'); return Array.isArray(r) ? r : []; }
async function dvContacts(type) { const r = await api.get(`/api/contacts?contact_type=${type}`); return Array.isArray(r) ? r : []; }
function dvRefreshDeals() { if (typeof renderDeals === 'function' && document.getElementById('page-deals')?.classList.contains('active')) renderDeals(); }
function dvRefreshTasks() { if (typeof renderTasksCurrent === 'function' && document.getElementById('page-tasks')?.classList.contains('active')) renderTasksCurrent(); }
function dvRefreshContacts() { if (typeof filterContacts === 'function' && document.getElementById('page-contacts')?.classList.contains('active')) filterContacts(); }
// Inline edit of a value (reference deal-detail startEdit): swaps the button for an input, Enter saves, Esc cancels, blur saves.
function dvInlineEdit(btn, { value, type = 'text', size = '', label = '', parse = v => ({ v: v.trim() }), onSave }) {
  const wrap = document.createElement('span'); wrap.className = 'dd-ie-edit' + (size ? ' dd-w-' + size : '');
  const input = document.createElement('input'); input.className = 'input'; input.type = type; input.value = value == null ? '' : value; input.setAttribute('aria-label', label); input.autocomplete = 'off';
  if (type === 'number') { input.min = '0'; input.step = 'any'; input.inputMode = 'decimal'; }
  const err = document.createElement('span'); err.className = 'error-text'; err.setAttribute('role', 'alert');
  wrap.appendChild(input); wrap.appendChild(err); btn.replaceWith(wrap); input.focus(); if (type !== 'date') input.select();
  let done = false;
  const finish = (save, viaBlur) => {
    if (done) return;
    if (save) { const r = parse(input.value); if (r.error) { if (viaBlur) { done = true; return onSave(null); } err.textContent = r.error; input.setAttribute('aria-invalid', 'true'); input.focus(); return; } done = true; return onSave(r.v); }
    done = true; onSave(null);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
  input.addEventListener('blur', () => setTimeout(() => finish(true, true), 0));
  input.addEventListener('input', () => { err.textContent = ''; input.removeAttribute('aria-invalid'); });
}

/* ══════════════════════════════════════════════════════════════════════════
   DEAL FORM — reference Forms.deal (create, or "Edit all" on an existing deal)
   ══════════════════════════════════════════════════════════════════════════ */
async function openDealForm(opts = {}) {
  await Promise.all([ensureMembers(), pipelines.length ? null : api.get('/api/pipelines').then(r => { pipelines = r; }), dealFields.length ? null : api.get('/api/deal-fields').then(r => { dealFields = r; })]);
  const [allContacts, allSuppliers] = await Promise.all([dvContacts('contact'), dvContacts('supplier')]);
  const editing = opts.deal || null;
  const init = editing ? { ...editing } : { pipeline_id: opts.pipelineId || currentPipelineId || pipelines[0]?.id || null, stage_id: opts.stageId || null, title: '', contact_id: opts.contactId || null, supplier_id: null, value: '', urgency: 0, assigned_to: currentUser?.id || null, custom_data: {} };
  if (!pipelines.find(p => p.id === init.pipeline_id)) init.pipeline_id = pipelines[0]?.id || null;
  const stagesFor = pid => pipelines.find(p => p.id === pid)?.stages || [];
  if (!init.stage_id || !stagesFor(init.pipeline_id).some(s => s.id === init.stage_id)) init.stage_id = stagesFor(init.pipeline_id)[0]?.id || null;
  if (!editing && opts.contactId) { const c = allContacts.find(x => x.id === opts.contactId); if (c) { init.title = c.name; if (c.assigned_to) init.assigned_to = c.assigned_to; } }
  const fid = 'df-' + uid();
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const fld = (id, label, control, { req, help } = {}) => `<div class="field"><label class="label" for="${id}">${label}${req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${control}${help ? `<div class="help">${help}</div>` : ''}<div class="error-text" id="${id}-err" role="alert"></div></div>`;
  const customField = f => {
    const id = `${fid}-cf-${f.field_key}`, v = init.custom_data?.[f.field_key] ?? '';
    if (f.type === 'dropdown') return fld(id, esc(f.name), `<select class="select" id="${id}" data-cf="${esc(f.field_key)}"><option value="">${esc(t('not_set'))}</option>${(f.options || []).map(o => opt(o, o, v)).join('')}</select>`);
    const typeMap = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' };
    return fld(id, esc(f.name), `<input class="input" id="${id}" data-cf="${esc(f.field_key)}" type="${typeMap[f.type] || 'text'}" value="${esc(v)}" autocomplete="off">`);
  };
  const form = document.createElement('form'); form.className = 'dd-form'; form.id = fid; form.noValidate = true;
  form.innerHTML = `
    ${fld(`${fid}-title`, esc(t('lbl_deal_title')), `<input class="input" id="${fid}-title" name="title" maxlength="140" autocomplete="off" placeholder="${esc(t('dv_deal_title_ph'))}" value="${esc(init.title)}" autofocus aria-required="true">`, { req: true })}
    <div class="field-row">
      ${fld(`${fid}-contact`, esc(t('lbl_contact')), `<select class="select" id="${fid}-contact" name="contact"><option value="">${esc(t('no_contact'))}</option>${allContacts.map(c => opt(c.id, c.company ? `${c.name}, ${c.company}` : c.name, init.contact_id)).join('')}</select>`, { help: esc(t('dv_contact_help')) })}
      ${fld(`${fid}-supplier`, esc(dvSupplierWord()), `<select class="select" id="${fid}-supplier" name="supplier"><option value="">${esc(t('dv_none'))}</option>${allSuppliers.map(c => opt(c.id, c.company ? `${c.name}, ${c.company}` : c.name, init.supplier_id)).join('')}</select>`, { help: esc(t('dv_supplier_help')) })}</div>
    <div class="field-row">
      ${fld(`${fid}-pipeline`, esc(t('lbl_pipeline')), `<select class="select" id="${fid}-pipeline" name="pipeline">${pipelines.map(p => opt(p.id, p.name, init.pipeline_id)).join('')}</select>`)}
      ${fld(`${fid}-stage`, esc(t('lbl_stage')), `<select class="select" id="${fid}-stage" name="stage"></select>`)}</div>
    <div class="field-row">
      ${fld(`${fid}-value`, esc(t('lbl_deal_value')), `<div class="input-affix dd-affix"><input class="input" id="${fid}-value" name="value" type="number" min="0" step="any" inputmode="decimal" placeholder="0" value="${init.value == null || init.value === '' ? '' : esc(init.value)}"><span class="affix">EUR</span></div>`)}
      ${fld(`${fid}-urgency`, esc(t('chip_urgency')), `<select class="select" id="${fid}-urgency" name="urgency">${DEAL_URGENCY.map(u => opt(u.value, urgencyLabel(u), init.urgency)).join('')}</select>`)}</div>
    <div class="field-row">
      ${fld(`${fid}-owner`, esc(t('chip_owner')), `<select class="select" id="${fid}-owner" name="owner"><option value="">${esc(t('unassigned'))}</option>${members.map(m => opt(m.id, m.name + (m.id === currentUser?.id ? ' ' + t('you_marker') : ''), init.assigned_to)).join('')}</select>`)}
      <div></div></div>
    ${dealFields.length ? `<div class="field-row">${dealFields.map(customField).join('')}</div>` : ''}`;
  const q = sel => form.querySelector(sel);
  const fillStages = () => { const pid = parseInt(q(`#${fid}-pipeline`).value, 10), st = stagesFor(pid), cur = q(`#${fid}-stage`).value || init.stage_id; q(`#${fid}-stage`).innerHTML = st.map(s => opt(s.id, s.name, st.some(x => x.id === Number(cur)) ? cur : st[0]?.id)).join(''); };
  fillStages();
  q(`#${fid}-pipeline`).addEventListener('change', () => { q(`#${fid}-stage`).value = ''; fillStages(); });
  const setErr = (id, msg) => { const el = q('#' + id), er = q('#' + id + '-err'); if (!er) return; er.textContent = msg || ''; if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); };
  q(`#${fid}-title`).addEventListener('input', () => setErr(`${fid}-title`, ''));
  q(`#${fid}-value`).addEventListener('input', () => setErr(`${fid}-value`, ''));
  const m = ui.modal({ title: editing ? t('dv_edit_deal') : t('dv_new_deal'), size: 'md', body: form, onClose: opts.onClose,
    footer: `<button class="btn btn-secondary" type="button" data-close>${esc(t('btn_cancel'))}</button><button class="btn btn-primary" type="submit" form="${fid}">${esc(editing ? t('btn_save_changes') : t('dv_create_deal'))}</button>` });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const title = q(`#${fid}-title`).value.trim(), rawV = q(`#${fid}-value`).value.trim(), v = Number(rawV);
    const errs = {};
    if (!title) errs[`${fid}-title`] = t('dv_err_deal_title'); else if (title.length > 140) errs[`${fid}-title`] = t('dv_err_title_len');
    if (rawV !== '' && (!isFinite(v) || v < 0)) errs[`${fid}-value`] = t('dv_err_value');
    [`${fid}-title`, `${fid}-value`].forEach(id => setErr(id, errs[id]));
    const first = Object.keys(errs)[0]; if (first) { q('#' + first).focus(); return; }
    const toId = s => s === '' ? null : +s;
    const payload = { title, contact_id: toId(q(`#${fid}-contact`).value), supplier_id: toId(q(`#${fid}-supplier`).value), pipeline_id: +q(`#${fid}-pipeline`).value, stage_id: toId(q(`#${fid}-stage`).value),
      value: rawV === '' ? null : Math.round(v * 100) / 100, assigned_to: toId(q(`#${fid}-owner`).value), urgency: +q(`#${fid}-urgency`).value,
      custom_data: Object.fromEntries([...form.querySelectorAll('[data-cf]')].map(el => [el.dataset.cf, el.value])) };
    const res = editing ? await api.put(`/api/deals/${editing.id}`, payload) : await api.post('/api/deals', payload);
    if (res?.error) { ui.toast(res.error); return; }
    m.close();
    if (!editing) currentPipelineId = payload.pipeline_id;
    if (typeof loadDeals === 'function' && document.getElementById('page-deals')?.classList.contains('active')) await loadDeals();
    ui.toast(editing ? t('dv_deal_updated') : t('dv_deal_created'), editing ? {} : { action: { label: t('tk_open'), onClick: () => openDealDetail(res.id) } });
    opts.onSave && opts.onSave(res);
  });
  return m;
}

/* ══════════════════════════════════════════════════════════════════════════
   DEAL DETAIL — reference deal-detail.js, in a pop window
   ══════════════════════════════════════════════════════════════════════════ */
let dvDeal = null;   // the open deal detail instance (one at a time)

// opts.onClose: fired when the pop window closes by any path (button, scrim, Escape, close()) — the
// Activities page uses it to reload its feed, since entries can be logged or deleted in here.
async function openDealDetail(id, opts = {}) {
  if (dvDeal) dvDeal.close();
  await Promise.all([ensureMembers(), pipelines.length ? null : api.get('/api/pipelines').then(r => { pipelines = r; }), dealFields.length ? null : api.get('/api/deal-fields').then(r => { dealFields = r; })]);
  const [d, allContacts, allSuppliers, allTasks, objs] = await Promise.all([api.get(`/api/deals/${id}`), dvContacts('contact'), dvContacts('supplier'), dvAllTasks(), api.get('/api/objects')]);
  if (!d || d.error) { ui.toast(t('dv_deal_gone')); return; }
  objects = Array.isArray(objs) ? objs : objects;
  const S = { d, contacts: allContacts, suppliers: allSuppliers, tasks: allTasks.filter(x => x.deal_id === d.id && !x.parent_id), acts: [], tab: 'activity', actsOnly: false, type: 'note', text: '', textErr: '', filter: null, editAct: null, editText: '', addTask: false, task: { title: '', due_on: false, due_date: '', due_time: '', priority: 'medium', assigned_to: currentUser?.id || '' }, taskErr: '', gone: false };
  const contactOf = () => S.contacts.find(c => c.id === S.d.contact_id) || null;
  const supplierOf = () => S.suppliers.find(c => c.id === S.d.supplier_id) || null;
  const pipe = () => pipelines.find(p => p.id === S.d.pipeline_id) || { name: '', stages: [] };
  const stage = () => pipe().stages.find(s => s.id === S.d.stage_id) || null;
  const owner = () => members.find(m => m.id === S.d.assigned_to) || null;
  // The activity tab shows the CONTACT's whole history by default — every note, whichever deal it
  // was logged on, each labelled with that deal. "This deal only" keeps this deal's notes PLUS the
  // contact's notes not tied to any deal; only the other deals' notes drop out (the server's
  // ?deal_id= rule). A deal with no contact can only have bound notes, so it always asks for those.
  const loadActs = async () => {
    const url = S.actsOnly || !S.d.contact_id ? `/api/activities?deal_id=${S.d.id}` : `/api/activities?contact_id=${S.d.contact_id}`;
    const rows = await api.get(url); S.acts = Array.isArray(rows) ? rows : [];
  };
  await loadActs();

  const payload = patch => ({ title: S.d.title, contact_id: S.d.contact_id, supplier_id: S.d.supplier_id, pipeline_id: S.d.pipeline_id, stage_id: S.d.stage_id, value: S.d.value, assigned_to: S.d.assigned_to, urgency: S.d.urgency, custom_data: S.d.custom_data || {}, ...patch });
  async function commit(patch, msg, extra = {}) {
    const prev = {}; Object.keys(patch).forEach(k => prev[k] = S.d[k]);
    Object.assign(S.d, patch);
    const res = await api.put(`/api/deals/${S.d.id}`, payload(patch));
    if (res?.error) { Object.assign(S.d, prev); ui.toast(res.error); render(); return false; }
    const row = deals.find(x => x.id === S.d.id); if (row) { Object.assign(row, patch, extra); }
    dvRefreshDeals(); render();
    if (msg) ui.toast(msg, { action: { label: t('undo'), onClick: () => commit(prev, null) } });
    return true;
  }
  async function move(stageId) {
    const s = pipe().stages.find(x => x.id === stageId); if (!s || S.d.stage_id === stageId) return;
    const prev = { stage_id: S.d.stage_id, stage_name: S.d.stage_name, stage_color: S.d.stage_color };
    Object.assign(S.d, { stage_id: s.id, stage_name: s.name, stage_color: s.color }); render();
    const res = await api.patch(`/api/deals/${S.d.id}/stage`, { stage_id: s.id });
    if (res?.error) { Object.assign(S.d, prev); ui.toast(res.error); render(); return; }
    const row = deals.find(x => x.id === S.d.id); if (row) Object.assign(row, { stage_id: s.id, stage_name: s.name, stage_color: s.color });
    dvRefreshDeals();
    ui.toast(tf('moved_to', { s: s.name }), { action: { label: t('undo'), onClick: () => move(prev.stage_id) } });
  }

  /* ----- html: top, head ----- */
  const ie = (key, inner, label, menu) => `<button class="dd-ie ${menu ? 'dd-ie-menu' : ''}" data-ie="${key}" ${menu ? 'aria-haspopup="menu"' : ''} aria-label="${esc(tf('dv_edit_aria', { what: label }))}"><span class="dd-ie-v">${inner}</span>${icon(menu ? 'chevron-down' : 'pencil', 'ic-sm')}</button>`;
  function topHtml() {
    const d = S.d, c = contactOf(), st = stage();
    const dis = c ? '' : `disabled title="${esc(t('dv_no_contact_deal'))}"`;
    return `<div class="page-header">
      <div class="grow"><h1 class="page-title dd-h1"><button class="dd-ie dd-ie-title" data-ie="title" aria-label="${esc(tf('dv_edit_title_aria', { title: d.title }))}"><span class="dd-ie-v">${esc(d.title)}</span>${icon('pencil', 'ic-sm')}</button></h1>
        <div class="dd-meta">${st ? `<span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span>` : ''}${urgencyBadge(d.urgency)}<span class="dd-sep"></span><span>${esc(pipe().name)}</span><span class="dd-sep"></span><span>${esc(tf('dv_created_ago', { when: agoDays(d.created_at).toLowerCase() }))}</span></div></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-act="qa" data-type="call" ${dis}>${icon('phone')}${esc(t('act_call'))}</button>
        <button class="btn btn-secondary" data-act="qa" data-type="email" ${dis}>${icon('mail')}${esc(t('act_email'))}</button>
        <button class="btn btn-secondary" data-act="qa" data-type="whatsapp" ${dis}>${icon('message-circle')}WhatsApp</button>
        <button class="btn btn-secondary btn-icon" data-act="more" aria-label="${esc(t('dv_more_actions'))}" aria-haspopup="menu">${icon('ellipsis')}</button>
      </div></div>`;
  }
  function stepperHtml() {
    const st = pipe().stages, cur = st.findIndex(s => s.id === S.d.stage_id);
    return `<div class="stepper dd-stepper" role="group" aria-label="${esc(t('dv_deal_stage_aria'))}">${st.map((s, i) => `<button class="step ${i === cur ? 'current' : i < cur ? 'done' : ''}" data-act="stage" data-stage="${s.id}" ${i === cur ? 'aria-current="step"' : ''} title="${esc(s.name)}" aria-label="${esc(i === cur ? tf('dv_current_stage', { s: s.name }) : tf('dv_move_to_stage', { s: s.name }))}">${esc(s.name)}</button>`).join('')}</div>`;
  }
  function headHtml() {
    const d = S.d, st = stage(), o = owner(), stages = pipe().stages, pos = stages.findIndex(s => s.id === d.stage_id) + 1;
    const last = S.acts[0]?.created_at || d.updated_at;
    const k = (label, val, foot) => `<div class="dd-kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${val}</div><div class="kpi-foot">${foot}</div></div>`;
    return `<div class="dd-stepper-wrap">${stages.length ? stepperHtml() : `<span class="muted">${esc(t('intg_no_stages_in_pipeline'))}</span>`}</div>
      <div class="dd-kpis">
        ${k(esc(t('dv_deal_value')), ie('value', `<span class="tnum">${d.value != null ? fmtEUR(d.value) : dvNotSet()}</span>`, t('lbl_deal_value')), esc(pipe().name))}
        ${k(esc(t('lbl_stage')), `<button class="dd-ie dd-ie-menu" data-act="stage-menu" aria-haspopup="menu" aria-label="${esc(t('dv_change_stage'))}"><span class="dd-ie-v">${st ? esc(st.name) : esc(t('not_set'))}</span>${icon('chevron-down', 'ic-sm')}</button>`, st ? esc(tf('dv_stage_pos', { a: pos, b: stages.length })) : '')}
        ${k(esc(t('chip_urgency')), ie('urgency', d.urgency > 0 ? urgencyBadge(d.urgency) : dvNotSet(), t('chip_urgency'), true), esc(t('dv_shown_on_board')))}
        ${k(esc(t('chip_owner')), `<button class="dd-ie dd-ie-menu dd-owner" data-act="owner" aria-haspopup="menu" aria-label="${esc(t('dv_change_owner'))}">${o ? avatar(o.name, 'sm') : ''}<span class="dd-ie-v">${o ? esc(o.name) : esc(t('unassigned'))}</span>${icon('chevron-down', 'ic-sm')}</button>`, o ? esc(o.email || '') : '')}
        ${k(esc(t('dv_last_activity')), `<span>${esc(last ? agoDays(last) : t('dv_never'))}</span>`, esc(dvPlural(S.acts.length, 'dv_one_logged_activity', 'dv_n_logged_activities')))}
      </div>`;
  }

  /* ----- html: main ----- */
  function tabsHtml() {
    const openTasks = S.tasks.filter(x => x.status !== dvDoneKey()).length;
    const T = [['overview', t('dv_tab_overview'), null], ['activity', t('dv_tab_activity'), S.acts.length], ['tasks', t('tab_tasks'), openTasks]];
    return `<div class="tabs" role="tablist" aria-label="${esc(t('dv_deal_sections'))}">${T.map(([id, label, n]) => `<button class="tab" role="tab" data-act="tab" data-tab="${id}" aria-selected="${S.tab === id}" tabindex="${S.tab === id ? 0 : -1}">${esc(label)}${n ? `<span class="badge">${n}</span>` : ''}</button>`).join('')}</div>`;
  }
  function miniTasks() {
    const list = S.tasks.filter(x => x.status !== dvDoneKey()).sort((a, b) => (a.due_date || '9') < (b.due_date || '9') ? -1 : 1).slice(0, 3);
    return `<section class="dd-mini" aria-label="${esc(t('dv_next_tasks'))}"><div class="dd-mini-head"><span>${esc(t('dv_next_tasks'))}</span><button class="btn btn-ghost btn-sm" data-act="goto" data-tab="tasks">${esc(t('dv_view_all'))}</button></div>
      ${list.length ? list.map(x => `<div class="dd-mini-row"><div class="grow"><a class="dd-task-title" href="#" data-act="open-task" data-id="${x.id}">${esc(x.title)}</a><div class="dd-task-meta"><span class="${taskIsOverdue(x, false) ? 'dd-late' : ''}">${esc(dvDue(x.due_date, x.due_time, x.due_tz))}</span>${x.assigned_to_name ? avatar(x.assigned_to_name, 'sm') : ''}</div></div></div>`).join('')
        : `<div class="dd-mini-empty">${esc(t('dv_no_open_tasks'))} <button class="btn btn-ghost btn-sm" data-act="goto-task">${esc(t('tk_add_task'))}</button></div>`}</section>`;
  }
  function miniActs() {
    const list = S.acts.slice(0, 3);
    return `<section class="dd-mini" aria-label="${esc(t('dv_latest_activity'))}"><div class="dd-mini-head"><span>${esc(t('dv_latest_activity'))}</span><button class="btn btn-ghost btn-sm" data-act="goto" data-tab="activity">${esc(t('dv_view_all'))}</button></div>
      ${list.length ? list.map(a => { const ty = dvTypeOf(a.type); return `<div class="dd-mini-row"><span class="tl-ic ${a.type}">${icon(ty.icon)}</span><div class="grow" style="min-width:0"><div class="row-between"><b>${esc(t(ty.label))}</b><span class="muted" style="font-size:var(--fs-sm)" title="${esc(dvWhen(a.created_at))}">${esc(dvAgoHours(a.created_at))}</span></div><div class="dd-clamp">${dvActHtml(a.content)}</div></div></div>`; }).join('')
        : `<div class="dd-mini-empty">${esc(t('dv_no_activity_yet_dot'))} <button class="btn btn-ghost btn-sm" data-act="goto" data-tab="activity">${esc(t('dv_log_activity'))}</button></div>`}</section>`;
  }
  function overviewHtml() {
    const c = contactOf();
    const hint = c ? '' : `<div class="dd-hint warn">${icon('info')}<span>${esc(t('dv_hint_no_contact_overview'))}</span></div>`;
    return `${hint}<div class="grid-2">${miniTasks()}${miniActs()}</div>`;
  }
  function hintHtml() {
    const c = contactOf();
    if (S.type === 'note') return '';
    if (!c) return `<div class="dd-hint warn">${icon('info')}<span>${esc(t('dv_hint_link_' + S.type))}</span></div>`;
    const who = `<b>${esc(c.name)}</b>`;
    if (S.type === 'call') return `<div class="dd-hint">${icon('phone')}<span class="grow">${who}${c.phone ? ', ' + esc(c.phone) : ''}</span>${c.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${esc(dvDigits(c.phone))}">${esc(t('dv_open_dialer'))}</a>` : ''}</div>`;
    if (S.type === 'email') return `<div class="dd-hint">${icon('mail')}<span class="grow">${tf('dv_to_whom', { who })}${c.email ? ', ' + esc(c.email) : ''}</span>${c.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${esc(c.email)}">${esc(t('dv_open_mail'))}</a>` : ''}</div>`;
    const wa = waLink(c.phone, c);
    return `<div class="dd-hint">${icon('message-circle')}<span class="grow">${who}${c.phone ? ', ' + esc(c.phone) : ''}</span>${wa ? `<a class="btn btn-secondary btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">${esc(t('dv_open_whatsapp'))}</a>` : ''}</div>`;
  }
  function tlItem(a) {
    const ty = dvTypeOf(a.type), editing = S.editAct === a.id;
    return `<div class="tl-item" data-aid="${a.id}"><span class="tl-ic ${a.type}">${icon(ty.icon)}</span><div class="dd-tl-main">
      <div class="tl-head"><b>${esc(t(ty.label))}</b>${a.bound_deal_id && a.bound_deal_id !== S.d.id ? `<span class="badge badge-outline" title="${esc(t('dv_logged_other_deal'))}" style="margin-right:6px">${esc(a.deal_title || t('dv_other_deal'))}</span>` : ''}${a.logged_by_name ? `<span class="muted">${esc(tf('dv_by_name', { name: a.logged_by_name }))}</span>` : ''}<span class="dd-tl-time muted" title="${esc(dvWhen(a.created_at))}">${esc(dvAgoHours(a.created_at))}</span>
        <span class="dd-tl-actions"><button class="iconbtn dd-ibtn" data-act="act-edit" data-id="${a.id}" aria-label="${esc(t('edit_entry'))}">${icon('pencil')}</button><button class="iconbtn dd-ibtn" data-act="act-del" data-id="${a.id}" aria-label="${esc(t('delete_entry'))}">${icon('trash')}</button></span></div>
      ${editing ? `<div class="dd-editor"><textarea class="textarea dv-grow" id="dd-act-edit" rows="3" aria-label="${esc(t('edit_entry'))}">${esc(S.editText)}</textarea>
          <div class="row" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" data-act="act-cancel">${esc(t('btn_cancel'))}</button><button class="btn btn-primary btn-sm" data-act="act-save" data-id="${a.id}">${esc(t('btn_save'))}</button></div></div>`
        : `<div class="tl-text dd-pre" data-note="${a.id}" title="${esc(t('click_to_edit'))}">${dvActHtml(a.content)}</div>`}</div></div>`;
  }
  function activityHtml() {
    const ty = dvTypeOf(S.type), all = S.acts, list = S.filter ? all.filter(a => a.type === S.filter) : all, c = contactOf();
    return `<form class="dd-compose" id="dd-compose" novalidate aria-label="${esc(t('dv_log_activity'))}">
        <div class="row-between"><div class="seg" role="group" aria-label="${esc(t('dv_activity_type'))}">${DV_ACT_TYPES.map(x => `<button type="button" data-act="ctype" data-type="${x.id}" aria-pressed="${S.type === x.id}">${icon(x.icon, 'ic-sm')}${esc(t(x.label))}</button>`).join('')}</div></div>
        ${hintHtml()}
        <div class="field"><label class="sr-only" for="dd-compose-text">${esc(tf('dv_compose_text_lbl', { type: t(ty.label) }))}</label>
          <textarea class="textarea" id="dd-compose-text" rows="3" placeholder="${esc(t(ty.ph))}" ${c ? '' : 'disabled'} ${S.textErr ? 'aria-invalid="true"' : ''}>${esc(S.text)}</textarea>
          <div class="error-text" id="dd-compose-err" role="alert">${esc(S.textErr)}</div></div>
        <div class="row-between"><span class="help">${esc(c ? tf('dv_logged_as_on', { user: currentUser?.name || '', contact: c.name }) : tf('dv_logged_as', { user: currentUser?.name || '' }))} ${esc(t('dv_ctrl_enter'))}</span><button class="btn btn-primary btn-sm" type="submit" ${c ? '' : 'disabled'}>${esc(t(ty.verb))}</button></div></form>
      <div class="dd-bar"><button class="chip ${S.filter ? 'on' : ''}" data-act="tlfilter" aria-haspopup="menu">${esc(t('chip_type'))}${S.filter ? ': ' + esc(t(dvTypeOf(S.filter).label)) : ''}${icon('chevron-down', 'ic-sm')}</button><button class="chip ${S.actsOnly ? 'on' : ''}" data-act="tlonly" type="button" aria-pressed="${S.actsOnly}" title="${esc(S.actsOnly ? t('dv_tlonly_on_title') : t('dv_tlonly_off_title'))}">${esc(S.actsOnly ? t('dv_show_all_notes') : t('dv_this_deal_only'))}</button>
        <span class="muted" style="font-size:var(--fs-sm)">${esc(S.filter ? tf('tk_n_of_total', { n: list.length, total: all.length }) : dvPlural(all.length, 'dv_one_entry', 'dv_n_entries'))}</span></div>
      ${list.length ? `<div class="timeline">${list.map(tlItem).join('')}</div>`
        : dvEmpty('activity', all.length ? t('dv_no_entries_type') : t('dv_no_activity_yet'), all.length ? t('dv_choose_type_or_clear') : c ? t('dv_log_to_start_deal') : t('dv_link_contact_first'), all.length ? `<button class="btn btn-secondary btn-sm" data-act="tlclear">${esc(t('dv_clear_filter'))}</button>` : '')}`;
  }
  function taskRow(x) {
    const done = x.status === dvDoneKey(), pr = DV_PRIO[x.priority] || DV_PRIO.medium, st = dvTaskStatuses().find(s => s.key === x.status), late = taskIsOverdue(x, done);
    return `<li class="dd-task ${done ? 'done' : ''}" data-tid="${x.id}"><label class="check"><input type="checkbox" data-toggle="${x.id}" ${done ? 'checked' : ''} aria-label="${esc(done ? t('tk_reopen_task') : t('tk_complete'))}: ${esc(x.title)}"></label>
      <div class="grow"><a class="dd-task-title" href="#" data-act="open-task" data-id="${x.id}">${esc(x.title)}</a>
        <div class="dd-task-meta"><span class="badge ${pr[1] ? 'badge-' + pr[1] : ''}">${esc(t(pr[0]))}</span>${st ? `<span>${esc(st.label)}</span>` : ''}<span class="dd-sep"></span><span class="${late ? 'dd-late' : ''}">${esc(done ? t('tk_done') : dvDue(x.due_date, x.due_time, x.due_tz))}</span></div></div>${x.assigned_to_name ? avatar(x.assigned_to_name, 'sm') : ''}</li>`;
  }
  function taskFormHtml() {
    const x = S.task;
    return `<form class="dd-taskform" id="dd-taskform" novalidate aria-label="${esc(t('dv_new_task'))}">
      <div class="field"><label class="label" for="dd-task-title">${esc(t('tk_col_task'))} <span class="req">*</span></label><input class="input" id="dd-task-title" name="title" value="${esc(x.title)}" placeholder="${esc(t('dv_task_title_ph'))}" autocomplete="off" ${S.taskErr ? 'aria-invalid="true"' : ''}><div class="error-text" role="alert">${esc(S.taskErr)}</div></div>
      <div class="field-row-3"><div class="field"><span class="label">${esc(t('chip_due'))}</span><label class="check" style="margin-top:8px"><input type="checkbox" name="due_on" id="dd-task-dueon" ${x.due_on ? 'checked' : ''}><span>${esc(t('dv_set_due'))}</span></label></div>
        <div class="field"><label class="label" for="dd-task-prio">${esc(t('tk_priority'))}</label><select class="select" id="dd-task-prio" name="priority">${Object.keys(DV_PRIO).map(p => `<option value="${p}" ${x.priority === p ? 'selected' : ''}>${esc(t(DV_PRIO[p][0]))}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="dd-task-owner">${esc(t('lbl_assignee'))}</label><select class="select" id="dd-task-owner" name="assigned_to"><option value="">${esc(t('unassigned'))}</option>${members.map(m => `<option value="${m.id}" ${String(x.assigned_to) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div></div>
      <div class="field-row-3 ${x.due_on ? '' : 'hidden'}" id="dd-task-duew"><div class="field"><label class="label" for="dd-task-due">${esc(t('dv_due_date'))}</label><input class="input" type="date" id="dd-task-due" name="due_date" value="${esc(x.due_date)}"><input class="input" type="time" id="dd-task-time" name="due_time" value="${esc(x.due_time || '')}" aria-label="${esc(t('dv_time'))}" style="margin-top:6px"></div></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-secondary btn-sm" data-act="task-cancel">${esc(t('btn_cancel'))}</button><button type="submit" class="btn btn-primary btn-sm">${esc(t('tk_add_task'))}</button></div></form>`;
  }
  function tasksHtml() {
    const all = S.tasks, open = all.filter(x => x.status !== dvDoneKey()), done = all.filter(x => x.status === dvDoneKey());
    return `<div class="dd-bar"><div><b>${esc(tf('dv_n_open', { n: open.length }))}</b><span class="muted">, ${esc(tf('dv_n_done', { n: done.length }))}</span></div>
        ${S.addTask ? '' : `<button class="btn btn-secondary btn-sm" data-act="task-add">${icon('plus')}${esc(t('tk_add_task'))}</button>`}</div>
      ${S.addTask ? taskFormHtml() : ''}
      ${all.length ? `<ul class="list dd-tasks" aria-label="${esc(t('dv_tasks_linked_deal'))}">${open.concat(done).map(taskRow).join('')}</ul>`
        : S.addTask ? '' : dvEmpty('check-square', t('dv_no_tasks_deal'), t('dv_no_tasks_deal_sub'))}`;
  }
  function mainHtml() {
    const body = S.tab === 'activity' ? activityHtml() : S.tab === 'tasks' ? tasksHtml() : overviewHtml();
    return `${tabsHtml()}<div class="dd-panel" role="tabpanel" tabindex="0">${body}</div>`;
  }

  /* ----- html: side ----- */
  function detailsCard() {
    const d = S.d, st = stage(), o = owner(), row = (label, inner) => `<dt>${label}</dt><dd>${inner}</dd>`;
    const custom = dealFields.map(f => { const v = d.custom_data?.[f.field_key]; return row(esc(f.name), f.type === 'dropdown' ? ie('cf:' + f.field_key, v ? esc(v) : dvNotSet(), f.name, true) : ie('cf:' + f.field_key, v ? esc(v) : dvNotSet(), f.name)); }).join('');
    return `<section class="card" aria-label="${esc(t('dv_details'))}"><div class="card-header"><h2 class="card-title">${esc(t('dv_details'))}</h2><button class="btn btn-ghost btn-sm" data-act="edit-full">${icon('pencil')}${esc(t('dv_edit_all'))}</button></div>
      <div class="card-body"><dl class="kv" style="margin:0">
        ${row(esc(t('lbl_pipeline')), ie('pipeline', esc(pipe().name), t('lbl_pipeline'), true))}
        ${row(esc(t('lbl_stage')), `<button class="dd-ie dd-ie-menu" data-act="stage-menu" aria-haspopup="menu" aria-label="${esc(t('dv_change_stage'))}"><span class="dd-ie-v">${st ? `<span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span>` : dvNotSet()}</span>${icon('chevron-down', 'ic-sm')}</button>`)}
        ${row(esc(t('chip_urgency')), ie('urgency', d.urgency > 0 ? urgencyBadge(d.urgency) : dvNotSet(), t('chip_urgency'), true))}
        ${row(esc(t('chip_owner')), `<button class="dd-ie dd-ie-menu" data-act="owner" aria-haspopup="menu" aria-label="${esc(t('dv_change_owner'))}"><span class="dd-ie-v">${o ? esc(o.name) : `<span class="muted">${esc(t('unassigned'))}</span>`}</span>${icon('chevron-down', 'ic-sm')}</button>`)}
        ${row(esc(t('created_lbl')), `<span>${esc(fmtDate(d.created_at))}</span>`)}
        ${row(esc(t('updated_lbl')), `<span>${esc(agoDays(d.updated_at || d.created_at))}</span>`)}
        ${custom}
      </dl></div></section>`;
  }
  function personCard({ title, c, kind, emptyTitle, emptyText, addLabel }) {
    const head = `<div class="card-header"><h2 class="card-title">${esc(title)}</h2><button class="iconbtn" style="width:28px;height:28px" data-act="${kind}-menu" aria-label="${esc(c ? tf('dv_change_x', { x: dvLower(title) }) : tf('dv_add_x', { x: dvLower(title) }))}" aria-haspopup="menu">${icon('ellipsis')}</button></div>`;
    if (!c) return `<section class="card" aria-label="${esc(title)}">${head}${dvEmpty(kind === 'contact' ? 'users' : 'truck', emptyTitle, emptyText, `<button class="btn btn-secondary btn-sm" data-act="${kind}-menu">${icon('plus')}${esc(addLabel)}</button>`)}</section>`;
    return `<section class="card" aria-label="${esc(title)}">${head}<div class="card-body">
      <div class="dd-person">${avatar(c.name, 'lg')}<div class="grow" style="min-width:0"><a class="dd-pname truncate" style="display:block" href="#" data-act="open-contact" data-id="${c.id}">${esc(c.name)}</a><div class="muted truncate">${esc(c.company || '')}</div></div></div>
      <div class="dd-lines">${c.email ? `<div>${icon('mail')}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}${c.phone ? `<div>${icon('phone')}<a href="tel:${esc(dvDigits(c.phone))}">${esc(c.phone)}</a></div>` : ''}
        ${c.assigned_to_name ? `<div>${icon('users')}<span>${esc(c.assigned_to_name)}</span></div>` : ''}</div></div>
      <div class="card-footer"><button class="btn btn-secondary btn-sm" data-act="open-contact" data-id="${c.id}">${esc(kind === 'contact' ? t('open_contact') : tf('open_supplier', { name: dvLower(dvSupplierWord()) }))}${icon('chevron-right', 'ic-sm')}</button></div></section>`;
  }
  function listingCard() {
    const ls = S.d.objects || [], word = dvObjectWord(ls.length);
    const available = objects.filter(o => !ls.some(l => l.id === o.id));
    return `<section class="card" aria-label="${esc(word)}"><div class="card-header"><h2 class="card-title">${esc(dvObjectWord(2))}</h2><button class="btn btn-ghost btn-sm" data-act="object-add" aria-haspopup="menu" ${available.length ? '' : 'disabled'}>${icon('plus')}${esc(t('add_btn'))}</button></div>
      ${ls.length ? `<div class="card-body">${ls.map(l => { const rows = objectFields.filter(f => l.custom_data?.[f.field_key]).slice(0, 3); return `<div class="dd-lst"><div class="row-between" style="align-items:flex-start"><a class="dd-lst-name" href="#" data-act="open-object" data-id="${l.id}">${esc(l.name)}</a><button class="iconbtn dd-ibtn" data-act="object-rm" data-id="${l.id}" aria-label="${esc(tf('dv_unlink_x', { name: l.name }))}">${icon('x')}</button></div>
        ${rows.length ? `<div class="dd-stat">${rows.map(f => `<div>${esc(f.name)}<b>${esc(String(l.custom_data[f.field_key]))}</b></div>`).join('')}</div>` : ''}</div>`; }).join('')}</div>`
        : dvEmpty('building', tf('dv_no_xs_linked', { x: dvLower(dvObjectWord(2)) }), available.length ? tf('dv_link_object_sub', { one: dvLower(dvObjectWord(1)), many: dvObjectWord(2) }) : tf('dv_add_objects_first', { many: dvLower(dvObjectWord(2)), page: dvObjectWord(2) }))}</section>`;
  }
  function sideHtml() {
    return detailsCard()
      + personCard({ title: t('lbl_contact'), c: contactOf(), kind: 'contact', emptyTitle: t('dv_no_contact_linked'), emptyText: t('dv_link_contact_sub'), addLabel: t('dv_add_contact') })
      + personCard({ title: dvSupplierWord(), c: supplierOf(), kind: 'supplier', emptyTitle: tf('dv_no_x_linked', { x: dvLower(dvSupplierWord()) }), emptyText: t('dv_supplier_empty_sub'), addLabel: tf('dv_add_x', { x: dvLower(dvSupplierWord()) }) })
      + listingCard();
  }

  /* ----- rendering ----- */
  const m = ui.modal({ title: 'Deal', size: 'xl', body: `<div class="dd" id="dd-root"><div id="dd-top"></div><section class="card dd-head" id="dd-head" aria-label="${esc(t('dv_deal_summary'))}"></section>
      <div class="split split-2-1"><section class="card dd-main" id="dd-main"></section><div class="dd-side" id="dd-side"></div></div></div>`,
    onClose: () => { if (dvDeal === inst) dvDeal = null; opts.onClose && opts.onClose(); } });
  m.el.querySelector('.modal').classList.add('dd-modal');
  const root = m.el.querySelector('#dd-root'), R = sel => root.querySelector(sel);
  function keep(fn) {
    const a = document.activeElement, id = a && a.id && root.contains(a) ? a.id : null;
    const s = a && id && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    fn();
    if (id) { const n = document.getElementById(id); if (n) { n.focus(); if (s && n.setSelectionRange) try { n.setSelectionRange(s[0], s[1]); } catch (e) { /* not a text field */ } } }
  }
  function render(parts = 'top head main side') {
    if (S.gone) return;
    keep(() => {
      if (parts.includes('top')) R('#dd-top').innerHTML = topHtml();
      if (parts.includes('head')) R('#dd-head').innerHTML = headHtml();
      if (parts.includes('main')) R('#dd-main').innerHTML = mainHtml();
      if (parts.includes('side')) R('#dd-side').innerHTML = sideHtml();
    });
    const title = m.el.querySelector('.modal-title'); if (title) title.textContent = S.d.title;
    dvAutoGrow(R('#dd-act-edit'));   // a re-render rebuilds the editor, so re-fit it
  }

  /* ----- inline editing ----- */
  const FIELDS = {
    title: { label: t('lbl_deal_title'), size: 'title', get: () => S.d.title, parse: v => { v = v.trim(); return !v ? { error: t('dv_err_deal_title') } : v.length > 140 ? { error: t('dv_err_title_len') } : { v }; }, patch: v => ({ title: v }), msg: t('dv_title_updated') },
    value: { label: t('lbl_deal_value'), type: 'number', size: 'kpi', get: () => S.d.value == null ? '' : S.d.value, parse: v => { if (String(v).trim() === '') return { v: null }; const n = Number(v); return !isFinite(n) || n < 0 ? { error: t('dv_err_value_min') } : { v: Math.round(n * 100) / 100 }; }, patch: v => ({ value: v }), msg: t('dv_value_updated') },
  };
  function startEdit(btn) {
    const key = btn.dataset.ie;
    if (key === 'urgency') return ui.select(btn, DEAL_URGENCY.map(u => ({ value: u.value, label: urgencyLabel(u) })), parseInt(S.d.urgency, 10) || 0, async v => {
      const prev = S.d.urgency; S.d.urgency = v; render();
      const res = await api.patch(`/api/deals/${S.d.id}/urgency`, { urgency: v }); if (res?.error) { S.d.urgency = prev; render(); return ui.toast(res.error); }
      const row = deals.find(x => x.id === S.d.id); if (row) row.urgency = v; dvRefreshDeals(); ui.toast(t('dv_urgency_updated'));
    });
    if (key === 'pipeline') return ui.select(btn, pipelines.map(p => ({ value: p.id, label: p.name })), S.d.pipeline_id, v => { if (v === S.d.pipeline_id) return; const p = pipelines.find(x => x.id === v), s0 = p?.stages?.[0]; commit({ pipeline_id: v, stage_id: s0?.id || null }, tf('dv_moved_pipeline', { p: p?.name, s: s0?.name || t('dv_none_stage') }), { stage_name: s0?.name || null, stage_color: s0?.color || null }); });
    if (key.startsWith('cf:')) {
      const fk = key.slice(3), f = dealFields.find(x => x.field_key === fk), cur = S.d.custom_data?.[fk] ?? '';
      const save = v => { if (v === null || v === cur) return render(); commit({ custom_data: { ...(S.d.custom_data || {}), [fk]: v } }, tf('dv_x_updated', { x: f?.name || t('dv_field') })); };
      if (f?.type === 'dropdown') return ui.select(btn, [{ value: '', label: t('not_set') }, ...(f.options || []).map(o => ({ value: o, label: o }))], cur, save);
      const typeMap = { email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' };
      return dvInlineEdit(btn, { value: cur, type: typeMap[f?.type] || 'text', label: f?.name || t('dv_field'), onSave: save });
    }
    const f = FIELDS[key]; if (!f) return;
    dvInlineEdit(btn, { value: f.get(), type: f.type || 'text', size: f.size, label: f.label, parse: f.parse, onSave: v => { if (v === null) return render(); const patch = f.patch(v); if (Object.keys(patch).every(k => patch[k] === S.d[k])) return render(); commit(patch, f.msg); } });
  }

  /* ----- actions ----- */
  function setTab(tab) { S.tab = tab; render('main'); const b = R(`[data-tab="${tab}"]`); b && b.focus(); }
  function quick(type) { S.type = type; S.textErr = ''; setTab('activity'); const ta = R('#dd-compose-text'); if (ta) { ta.focus(); ta.scrollIntoView({ block: 'nearest' }); } }
  async function submitCompose() {
    const text = S.text.trim(), ty = dvTypeOf(S.type), c = contactOf();
    if (!c) return;
    if (!text) { S.textErr = t('act_err_text'); render('main'); const ta = R('#dd-compose-text'); ta && ta.focus(); return; }
    const res = await api.post('/api/activities', { contact_id: c.id, deal_id: S.d.id, type: S.type, content: esc(text).replace(/\n/g, '<br>') });   // composed on this deal → bound to it
    if (res?.error) return ui.toast(res.error);
    S.text = ''; S.textErr = ''; await loadActs(); render('head main');
    ui.toast(tf('act_logged', { type: t(ty.label) })); const ta = R('#dd-compose-text'); ta && ta.focus();
  }
  async function delAct(aid) {
    const ok = await ui.confirm({ title: t('dv_delete_entry_q'), message: t('dv_delete_entry_deal_msg'), confirmLabel: t('btn_delete'), danger: true }); if (!ok) return;
    const res = await api.del(`/api/activities/${aid}`); if (res?.error) return ui.toast(res.error);
    await loadActs(); render('head main'); ui.toast(t('dv_entry_deleted'));
  }
  async function del() {
    const ok = await ui.confirm({ title: t('delete_deal_q'), message: t('dv_delete_deal_msg'), confirmLabel: t('delete_deal'), danger: true }); if (!ok) return;
    const res = await api.del(`/api/deals/${S.d.id}`); if (res?.error) return ui.toast(res.error);
    S.gone = true; deals = deals.filter(x => x.id !== S.d.id); dvRefreshDeals(); m.close(); ui.toast(t('deal_deleted'));
  }
  async function duplicate() {
    const res = await api.post('/api/deals', payload({ title: tf('dv_copy_suffix', { title: S.d.title }) })); if (res?.error) return ui.toast(res.error);
    if (typeof loadDeals === 'function' && document.getElementById('page-deals')?.classList.contains('active')) await loadDeals();
    ui.toast(t('dv_deal_duplicated'), { action: { label: t('tk_open'), onClick: () => openDealDetail(res.id) } });
  }
  function moreMenu(anchor) {
    ui.menu(anchor, [
      { label: t('dv_edit_deal'), icon: 'pencil', onSelect: () => openDealForm({ deal: S.d, onSave: () => reload() }) },
      { label: t('dv_duplicate'), icon: 'copy', onSelect: duplicate }, { sep: true },
      { label: t('delete_deal'), icon: 'trash', danger: true, onSelect: del }], { align: 'right' });
  }
  function linkMenu(anchor, kind) {
    const list = kind === 'contact' ? S.contacts : S.suppliers, field = kind === 'contact' ? 'contact_id' : 'supplier_id', cur = S.d[field];
    const noun = kind === 'contact' ? t('lbl_contact') : dvSupplierWord(), word = dvLower(noun);
    const set = async v => { const ok = await commit({ [field]: v }, null, kind === 'contact' ? { contact_name: list.find(c => c.id === v)?.name || null, contact_company: list.find(c => c.id === v)?.company || null } : {}); if (!ok) return; if (kind === 'contact') { await loadActs(); render(); } ui.toast(v ? tf('dv_x_set_to', { x: noun, name: list.find(c => c.id === v)?.name }) : tf('dv_x_removed', { x: noun })); };
    ui.menu(anchor, [{ heading: cur ? tf('dv_change_x', { x: word }) : tf('dv_add_x', { x: word }) }, ...list.map(c => ({ label: c.company ? `${c.name}, ${c.company}` : c.name, checked: c.id === cur, onSelect: () => set(c.id) })),
      ...(cur ? [{ sep: true }, { label: tf('dv_remove_x', { x: word }), icon: 'x', danger: true, onSelect: () => set(null) }] : [])], { align: 'right' });
  }
  async function reload() { const fresh = await api.get(`/api/deals/${S.d.id}`); if (fresh && !fresh.error) { S.d = fresh; await loadActs(); render(); } }
  async function submitTask() {
    const x = S.task, title = x.title.trim();
    if (!title) { S.taskErr = t('dv_err_task_title'); render('main'); R('#dd-task-title')?.focus(); return; }
    const res = await api.post('/api/tasks', { title, status: dvFirstKey(), priority: x.priority, due_date: x.due_on ? (x.due_date || null) : null, due_time: x.due_on ? (x.due_time || null) : null, assigned_to: x.assigned_to || null, deal_id: S.d.id, contact_id: S.d.contact_id || null });
    if (res?.error) return ui.toast(res.error);
    S.addTask = false; S.taskErr = ''; S.task = { title: '', due_on: false, due_date: '', due_time: '', priority: 'medium', assigned_to: currentUser?.id || '' };
    S.tasks = (await dvAllTasks()).filter(t2 => t2.deal_id === S.d.id && !t2.parent_id); dvRefreshTasks(); render('main'); ui.toast(t('dv_task_added'));
  }

  const A = {
    tab: el => setTab(el.dataset.tab), goto: el => setTab(el.dataset.tab), 'goto-task': () => { setTab('tasks'); S.addTask = true; render('main'); R('#dd-task-title')?.focus(); },
    stage: el => move(+el.dataset.stage),
    'stage-menu': el => ui.select(el, pipe().stages.map(s => ({ value: s.id, label: s.name })), S.d.stage_id, move),
    owner: el => ui.select(el, [{ value: null, label: t('unassigned') }, ...members.map(x => ({ value: x.id, label: x.name }))], S.d.assigned_to, v => { if (v === S.d.assigned_to) return; commit({ assigned_to: v }, t('dv_owner_updated'), { assigned_to_name: members.find(x => x.id === v)?.name || null }); }),
    qa: el => quick(el.dataset.type), more: el => moreMenu(el),
    ctype: el => { S.type = el.dataset.type; S.textErr = ''; render('main'); R(`[data-act="ctype"][data-type="${S.type}"]`)?.focus(); },
    tlfilter: el => ui.select(el, [{ value: null, label: t('dv_all_types') }, ...DV_ACT_TYPES.map(x => ({ value: x.id, label: t(x.label), icon: x.icon }))], S.filter, v => { S.filter = v; render('main'); }),
    tlclear: () => { S.filter = null; render('main'); },
    'act-edit': el => { const a = S.acts.find(x => x.id === +el.dataset.id); if (!a) return; S.editAct = a.id; S.editText = dvActText(a.content); render('main'); const ta = R('#dd-act-edit'); if (ta) { dvAutoGrow(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } },
    'act-cancel': () => { S.editAct = null; render('main'); },
    'act-save': async el => { const ta = R('#dd-act-edit'), v = ta.value.trim(); if (!v) { ta.setAttribute('aria-invalid', 'true'); ta.focus(); return; } const res = await api.patch(`/api/activities/${+el.dataset.id}`, { content: esc(v).replace(/\n/g, '<br>') }); if (res?.error) return ui.toast(res.error); S.editAct = null; await loadActs(); render('main'); ui.toast(t('entry_updated')); },
    'act-del': el => delAct(+el.dataset.id),
    'task-add': () => { S.addTask = true; S.taskErr = ''; render('main'); R('#dd-task-title')?.focus(); },
    'task-cancel': () => { S.addTask = false; S.taskErr = ''; render('main'); },
    'open-task': el => openTaskDrawer(+el.dataset.id, { onChange: async () => { S.tasks = (await dvAllTasks()).filter(t2 => t2.deal_id === S.d.id && !t2.parent_id); render('main'); } }),
    'contact-menu': el => linkMenu(el, 'contact'), 'supplier-menu': el => linkMenu(el, 'supplier'),
    'open-contact': el => { m.close(); openContactDetail(+el.dataset.id); },
    'open-object': el => { m.close(); if (typeof openObjectDetail === 'function') openObjectDetail(+el.dataset.id); },
    'object-add': el => { const available = objects.filter(o => !(S.d.objects || []).some(l => l.id === o.id)); ui.select(el, available.map(o => ({ value: o.id, label: o.name })), null, async v => { const res = await api.post(`/api/deals/${S.d.id}/objects`, { object_id: v }); if (res?.error) return ui.toast(res.error); S.d.objects = await api.get(`/api/deals/${S.d.id}/objects`); render('side'); ui.toast(tf('dv_x_linked', { x: dvObjectWord(1) })); }); },
    'object-rm': async el => { const res = await api.del(`/api/deals/${S.d.id}/objects/${+el.dataset.id}`); if (res?.error) return ui.toast(res.error); S.d.objects = await api.get(`/api/deals/${S.d.id}/objects`); render('side'); ui.toast(tf('dv_x_unlinked', { x: dvObjectWord(1) })); },
    'edit-full': () => openDealForm({ deal: S.d, onSave: () => reload() }),
  };
  on(root, 'click', '[data-act]', (e, el) => { const fn = A[el.dataset.act]; if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el); } });
  on(root, 'click', '[data-ie]', (e, el) => startEdit(el));
  on(root, 'change', '[data-toggle]', async (e, el) => {
    const x = S.tasks.find(y => y.id === +el.dataset.toggle), prev = x.status, to = el.checked ? dvDoneKey() : dvFirstKey();
    x.status = to; render('main');
    const res = await api.patch(`/api/tasks/${x.id}/status`, { status: to }); if (res?.error) { x.status = prev; render('main'); return ui.toast(res.error); }
    const row = tasks.find(y => y.id === x.id); if (row) row.status = to; dvRefreshTasks();
    ui.toast(to === dvDoneKey() ? t('tk_completed') : t('tk_reopened'));
  });
  on(root, 'input', '#dd-compose-text', (e, el) => { S.text = el.value; if (S.textErr) { S.textErr = ''; el.removeAttribute('aria-invalid'); const er = R('#dd-compose-err'); er && (er.textContent = ''); } });
  on(root, 'input', '#dd-act-edit', (e, el) => { S.editText = el.value; el.removeAttribute('aria-invalid'); dvAutoGrow(el); });
  // Same gestures as the contact panel: a click opens the editor, a double-click too; a click
  // that merely ends a text selection is ignored so the selection is not thrown away.
  const noteEdit = el => A['act-edit']({ dataset: { id: el.dataset.note } });
  on(root, 'click', '[data-note]', (e, el) => { if (!String(window.getSelection() || '')) noteEdit(el); });
  on(root, 'dblclick', '[data-note]', (e, el) => noteEdit(el));
  on(root, 'keydown', '#dd-act-edit', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); S.editAct = null; render('main'); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const b = R('[data-act="act-save"]'); b && A['act-save'](b); }
  });
  on(root, 'input', '#dd-taskform [name]', (e, el) => { S.task[el.name] = el.type === 'checkbox' ? el.checked : el.value; if (el.name === 'title' && S.taskErr) { S.taskErr = ''; el.removeAttribute('aria-invalid'); } });
  on(root, 'change', '#dd-taskform [name]', (e, el) => { S.task[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    // the due tick box: on → prefill today + 3h and show the fields; off → clear and hide
    if (el.name === 'due_on') { if (el.checked) { const dd = dvDefaultDue(); S.task.due_date = dd.date; S.task.due_time = dd.time; } else { S.task.due_date = ''; S.task.due_time = ''; } render('main'); R('#dd-task-due')?.focus(); } });
  on(root, 'submit', '#dd-compose', e => { e.preventDefault(); submitCompose(); });
  // "This deal only": the filter is applied by the server (?deal_id= vs ?contact_id=), so toggling reloads.
  on(root, 'click', '[data-act="tlonly"]', async () => { S.actsOnly = !S.actsOnly; await loadActs(); render('head main'); });
  on(root, 'submit', '#dd-taskform', e => { e.preventDefault(); submitTask(); });
  on(root, 'keydown', '#dd-compose-text', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitCompose(); } });
  on(root, 'keydown', '[role="tab"]', (e, el) => { const ids = ['overview', 'activity', 'tasks'], i = ids.indexOf(el.dataset.tab); let n = -1; if (e.key === 'ArrowRight') n = (i + 1) % ids.length; else if (e.key === 'ArrowLeft') n = (i + ids.length - 1) % ids.length; if (n >= 0) { e.preventDefault(); setTab(ids[n]); } });
  const inst = { close: () => m.close(), reload };
  dvDeal = inst; render();
  return inst;
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTACT DETAIL — reference contacts.js detail, in the side panel or a pop window
   ══════════════════════════════════════════════════════════════════════════ */
async function openContactDetail(id, opts = {}) {
  await Promise.all([ensureFields(), ensureMembers()]);
  const [c, contactDeals, allTasks, contactDocs] = await Promise.all([api.get(`/api/contacts/${id}`), api.get(`/api/deals?contact_id=${id}`), dvAllTasks(), api.get(`/api/contacts/${id}/documents`)]);
  if (!c || c.error) { ui.toast(t('dv_contact_gone')); return; }
  if (!pipelines.length) pipelines = await api.get('/api/pipelines');
  const sup = c.contact_type === 'supplier', noun = sup ? dvSupplierWord() : t('lbl_contact'), one = dvLower(noun);   // `one` sits inside sentences: lower case in English, capital in German
  const S = { c, deals: Array.isArray(contactDeals) ? contactDeals : [], tasks: allTasks.filter(x => x.contact_id === id && !x.parent_id), docs: Array.isArray(contactDocs) ? contactDocs : [], tab: 'overview', draft: { type: 'note', text: '', err: false, filter: 'all' }, editAct: null, editText: '' };
  const acts = () => S.c.activities || [];
  const stageOfDeal = d => (pipelines.find(p => p.id === d.pipeline_id)?.stages || []).find(s => s.id === d.stage_id);
  const sumVal = a => a.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const tel = () => dvDigits(S.c.phone).length >= 6 ? 'tel:' + dvDigits(S.c.phone) : null;
  const wa = () => waLink(S.c.phone, S.c);
  const payload = patch => ({ name: S.c.name, company: S.c.company, email: S.c.email, phone: S.c.phone, assigned_to: S.c.assigned_to, custom_data: S.c.custom_data || {}, contact_type: S.c.contact_type, ...patch });
  async function commit(patch, msg) {
    const prev = {}; Object.keys(patch).forEach(k => prev[k] = S.c[k]); Object.assign(S.c, patch);
    const res = await api.put(`/api/contacts/${id}`, payload(patch)); if (res?.error) { Object.assign(S.c, prev); render(); return ui.toast(res.error); }
    if ('assigned_to' in patch) S.c.assigned_to_name = members.find(x => x.id === patch.assigned_to)?.name || null;
    const row = contacts.find(x => x.id === id); if (row) Object.assign(row, patch, { assigned_to_name: S.c.assigned_to_name });
    dvRefreshContacts(); render(); if (msg) ui.toast(msg);
  }

  /* ----- html ----- */
  const editable = (key, lbl) => {
    const v = key.startsWith('cf:') ? S.c.custom_data?.[key.slice(3)] : S.c[key], shown = v ? esc(String(v)) : dvNotSet();
    const ext = key === 'email' && v ? `<a class="ct-ext" href="mailto:${esc(v)}" aria-label="${esc(tf('dv_email_x_aria', { name: S.c.name }))}" title="${esc(t('dv_send_email'))}">${icon('mail')}</a>` : key === 'phone' && tel() ? `<a class="ct-ext" href="${esc(tel())}" aria-label="${esc(tf('dv_call_x_aria', { name: S.c.name }))}" title="${esc(t('act_call'))}">${icon('phone')}</a>` : '';
    return `<div class="ct-f"><dt>${esc(lbl)}</dt><dd><button class="ct-edit" data-edit="${esc(key)}" title="${esc(t('click_to_edit'))}"><span>${shown}</span>${icon('pencil', 'ic-sm')}</button>${ext}</dd></div>`;
  };
  const actItem = a => {
    const ty = dvTypeOf(a.type), editing = S.editAct === a.id;
    return `<div class="tl-item" data-aid="${a.id}"><span class="tl-ic ${a.type}">${icon(ty.icon)}</span><div class="dd-tl-main"><div class="tl-head"><b>${esc(t(ty.label))}</b>${a.deal_title ? `<span class="badge badge-outline" title="${esc(t('dv_logged_on_deal'))}" style="margin-left:6px">${esc(a.deal_title)}</span>` : ''}<span class="muted" style="font-size:var(--fs-sm)">${a.logged_by_name ? esc(tf('dv_by_name', { name: a.logged_by_name })) : ''}</span><span class="muted" style="margin-left:auto;font-size:var(--fs-sm)" title="${esc(dvWhen(a.created_at))}">${esc(dvAgoHours(a.created_at))}</span>
      <span class="dd-tl-actions"><button class="iconbtn dd-ibtn" data-act="act-edit" data-id="${a.id}" aria-label="${esc(t('edit_entry'))}">${icon('pencil')}</button><button class="iconbtn dd-ibtn" data-act="act-del" data-id="${a.id}" aria-label="${esc(t('delete_entry'))}">${icon('trash')}</button></span></div>
      ${editing ? `<div class="dd-editor"><textarea class="textarea dv-grow" id="ct-aedit" rows="3" aria-label="${esc(t('edit_entry'))}">${esc(S.editText)}</textarea>
          <div class="row-between"><span class="help">${esc(t('enter_saves_esc_cancels'))}</span><span class="row"><button class="btn btn-secondary btn-sm" type="button" data-act="act-cancel">${esc(t('btn_cancel'))}</button><button class="btn btn-primary btn-sm" type="button" data-act="act-save">${esc(t('btn_save'))}</button></span></div></div>`
        : `<div class="tl-text dd-pre" data-note="${a.id}" title="${esc(t('click_to_edit'))}">${dvActHtml(a.content)}</div>`}</div></div>`;
  };
  const taskRow = x => { const done = x.status === dvDoneKey(), pr = DV_PRIO[x.priority] || DV_PRIO.medium, late = taskIsOverdue(x, done);
    return `<li class="list-item"><label class="check round"><input type="checkbox" data-task-toggle="${x.id}" aria-label="${esc(done ? tf('dv_mark_not_done', { title: x.title }) : tf('dv_mark_done', { title: x.title }))}" ${done ? 'checked' : ''}></label>
      <div class="grow"><a class="ct-task-title ${done ? 'done' : ''}" href="#" data-act="open-task" data-id="${x.id}">${esc(x.title)}</a>${x.deal_title ? `<div class="muted truncate" style="font-size:var(--fs-sm)">${esc(x.deal_title)}</div>` : ''}</div>
      ${done ? `<span class="badge badge-success">${esc(t('tk_done'))}</span>` : late ? `<span class="badge badge-danger">${esc(dvDue(x.due_date, x.due_time, x.due_tz))}</span>` : `<span class="muted" style="font-size:var(--fs-sm);white-space:nowrap">${esc(dvDue(x.due_date, x.due_time, x.due_tz))}</span>`}
      <span class="badge ${pr[1] ? 'badge-' + pr[1] : ''}">${esc(t(pr[0]))}</span>${x.assigned_to_name ? avatar(x.assigned_to_name, 'sm') : ''}</li>`; };
  function overviewPanel() {
    const a = acts().slice(0, 3), open = S.tasks.filter(x => x.status !== dvDoneKey()).slice(0, 3);
    return `<div class="ct-sec"><div class="ct-sec-head"><div class="section-title">${esc(tf('dv_x_information', { x: noun }))}</div><span class="help">${esc(t('dv_click_value_hint'))}</span></div>
      <dl class="ct-fgrid">${editable('name', t('lbl_your_name'))}${editable('company', t('lbl_company'))}${editable('email', t('lbl_email'))}${editable('phone', t('lbl_phone'))}${fields.map(f => editable('cf:' + f.field_key, f.name)).join('')}
        <div class="ct-f"><dt>${esc(t('chip_owner'))}</dt><dd><button class="ct-edit" data-edit="owner" aria-haspopup="menu" title="${esc(t('dv_change_owner'))}"><span class="row" style="gap:8px">${S.c.assigned_to_name ? avatar(S.c.assigned_to_name, 'sm') + esc(S.c.assigned_to_name) : `<span class="muted">${esc(t('unassigned'))}</span>`}</span>${icon('chevron-down', 'ic-sm')}</button></dd></div></dl></div>
      <div class="ct-sec"><div class="ct-sec-head"><div class="section-title">${esc(t('dv_latest_activity'))}</div>${a.length ? `<button class="btn btn-ghost btn-sm" data-act="tab" data-tab="activity">${esc(t('dv_view_all'))}</button>` : ''}</div>
        ${a.length ? `<div class="timeline">${a.map(actItem).join('')}</div>` : `<div class="muted">${esc(t('dv_no_activity_logged'))} <button class="btn btn-ghost btn-sm" data-act="tab" data-tab="activity" style="height:auto;padding:0 2px;color:var(--link)">${esc(t('dv_log_first'))}</button></div>`}</div>
      <div class="ct-sec"><div class="ct-sec-head"><div class="section-title">${esc(t('tk_kpi_open'))}</div>${open.length ? `<button class="btn btn-ghost btn-sm" data-act="tab" data-tab="tasks">${esc(t('dv_view_all'))}</button>` : ''}</div>
        ${open.length ? `<ul class="list" style="margin:0 -18px">${open.map(taskRow).join('')}</ul>` : `<div class="muted">${esc(tf('dv_no_open_tasks_for', { noun: one }))}</div>`}</div>`;
  }
  function activityPanel() {
    const d = S.draft, all = acts(), list = d.filter === 'all' ? all : all.filter(a => a.type === d.filter);
    return `<form class="ct-compose" id="ct-compose" novalidate aria-label="${esc(t('dv_log_activity'))}">
        <div class="seg" role="group" aria-label="${esc(t('dv_activity_type'))}">${DV_ACT_TYPES.map(x => `<button type="button" data-atype="${x.id}" aria-pressed="${d.type === x.id}">${icon(x.icon, 'ic-sm')}${esc(t(x.label))}</button>`).join('')}</div>
        <div class="field"><textarea class="textarea" id="ct-atext" aria-label="${esc(t('dv_activity_details'))}" placeholder="${esc(d.type === 'note' ? tf('dv_ph_note_about', { name: S.c.name.split(' ')[0] }) : t('dv_ph_discussed'))}" ${d.err ? 'aria-invalid="true"' : ''}>${esc(d.text)}</textarea><div class="error-text" id="ct-aerr" ${d.err ? '' : 'hidden'}>${esc(t('act_err_text'))}</div></div>
        <div class="ct-compose-foot"><span class="help">${esc(t('dv_ctrl_enter'))}</span><button class="btn btn-primary btn-sm" type="submit">${esc(t(dvTypeOf(d.type).verb))}</button></div></form>
      <div class="ct-tl-head"><div class="section-title" style="margin:0">${esc(t('dv_activity_timeline'))}</div><select class="select select-sm" id="ct-afilter" aria-label="${esc(t('dv_filter_activity'))}">${[['all', t('dv_all_types')], ...DV_ACT_TYPES.map(x => [x.id, t('dv_filter_' + x.id)])].map(o => `<option value="${o[0]}" ${d.filter === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>
      ${list.length ? `<div class="timeline">${list.map(actItem).join('')}</div>` : dvEmpty('activity', all.length ? t('dv_no_activity_type') : t('dv_no_activity_yet'), all.length ? t('dv_choose_type_above') : t('dv_log_to_start_contact'))}`;
  }
  function dealsPanel() {
    const ds = [...S.deals].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    return `<div class="row-between" style="padding:14px 18px;border-bottom:1px solid var(--divider)"><span class="muted">${dvPlural(ds.length, 'dv_one_deal', 'n_deals')}</span><button class="btn btn-secondary btn-sm" data-act="add-deal">${icon('plus')}${esc(t('add_deal'))}</button></div>
      ${ds.length ? `<div style="overflow:auto"><table class="table"><thead><tr><th>${esc(t('lbl_deal'))}</th><th>${esc(t('lbl_stage'))}</th><th class="num-col">${esc(t('lbl_deal_value'))}</th><th>${esc(t('chip_owner'))}</th></tr></thead><tbody>
        ${ds.map(d => { const st = stageOfDeal(d); return `<tr class="clickable" data-act="open-deal" data-id="${d.id}"><td style="max-width:280px"><a class="ct-name truncate" style="display:block" href="#" data-act="open-deal" data-id="${d.id}">${esc(d.title)}</a></td><td>${st ? `<span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span>` : dvNotSet()}</td><td class="num-col tnum strong">${d.value != null ? fmtEUR(d.value) : '<span class="muted">—</span>'}</td><td>${d.assigned_to_name ? `<div class="row" style="gap:8px">${avatar(d.assigned_to_name, 'sm')}<span>${esc(d.assigned_to_name.split(' ')[0])}</span></div>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>
        <div class="card-footer row-between"><span class="muted">${dvPlural(ds.length, 'dv_one_deal', 'n_deals')}</span><span class="tnum">${esc(t('dv_total_value'))} <b>${fmtEUR(sumVal(ds))}</b></span></div>`
      : dvEmpty('deals', t('no_deals_yet'), tf('dv_deals_linked_here', { noun: one }), `<button class="btn btn-secondary" data-act="add-deal">${icon('plus')}${esc(t('add_deal'))}</button>`)}`;
  }
  function tasksPanel() {
    const ts = S.tasks, open = ts.filter(x => x.status !== dvDoneKey()).length;
    return `<div class="row-between" style="padding:14px 18px;border-bottom:1px solid var(--divider)"><span class="muted">${esc(dvPlural(ts.length, 'one_task', 'n_tasks'))}, ${esc(tf('dv_n_open', { n: open }))}</span><button class="btn btn-secondary btn-sm" data-act="add-task">${icon('plus')}${esc(t('tk_add_task'))}</button></div>
      ${ts.length ? `<ul class="list">${ts.map(taskRow).join('')}</ul>` : dvEmpty('check-square', t('dv_no_tasks_yet'), tf('dv_tasks_linked_here', { noun: one }), `<button class="btn btn-secondary" data-act="add-task">${icon('plus')}${esc(t('tk_add_task'))}</button>`)}`;
  }
  // Documents: contracts and call recordings the Upgrads Engine evaluates (uploaded here, fetched by the Engine through its API).
  function documentsPanel() {
    const ds = S.docs, typeIcon = { vertrag: 'file-text', aufnahme: 'message-circle', sonstiges: 'paperclip' };
    const uploadBtn = cls => `<button class="btn btn-secondary ${cls}" data-act="doc-upload">${icon('upload')}${esc(t('dv_doc_upload'))}</button>`;
    return `<div class="row-between" style="padding:14px 18px;border-bottom:1px solid var(--divider)"><span class="muted">${esc(dvPlural(ds.length, 'dv_one_doc', 'n_docs'))}</span>
        <span class="row" style="gap:8px"><select class="select select-sm" id="ct-doctype" aria-label="${esc(t('dv_doc_type_aria'))}">${DV_DOC_TYPES.map(x => `<option value="${x}">${esc(t('dv_doc_type_' + x))}</option>`).join('')}</select>
        <input type="file" id="ct-docfile" class="hidden" aria-label="${esc(t('dv_doc_upload'))}">${uploadBtn('btn-sm')}</span></div>
      ${ds.length ? `<ul class="list">${ds.map(d => { const typ = DV_DOC_TYPES.includes(d.typ) ? d.typ : 'sonstiges';
        return `<li class="list-item"><span class="tl-ic">${icon(typeIcon[typ])}</span>
        <div class="grow"><a class="ct-name truncate" style="display:block" href="/api/contacts/${id}/documents/${Number(d.id)}/download" target="_blank" rel="noopener" title="${esc(t('dv_doc_download'))}">${esc(d.file_name)}</a>
          <div class="muted truncate" style="font-size:var(--fs-sm)">${esc(dvFileSize(d.file_size))} · ${esc(fmtDate(d.created_at))}${d.uploaded_by_name ? ` · ${esc(d.uploaded_by_name)}` : ''}</div></div>
        <span class="badge">${esc(t('dv_doc_type_' + typ))}</span>
        <button class="iconbtn dd-ibtn" data-act="doc-del" data-id="${Number(d.id)}" aria-label="${esc(t('btn_delete'))}">${icon('trash')}</button></li>`; }).join('')}</ul>`
      : dvEmpty('paperclip', t('dv_no_docs'), t('dv_docs_hint'), uploadBtn(''))}`;
  }
  async function uploadDocument(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return ui.toast(t('dv_doc_too_large'));
    const fd = new FormData(); fd.append('file', file); fd.append('typ', host.querySelector('#ct-doctype')?.value || 'sonstiges');
    host.querySelectorAll('[data-act="doc-upload"]').forEach(b => { b.disabled = true; b.textContent = t('dv_doc_uploading'); });
    let res = null, status = 0;
    try { const r = await fetch(`/api/contacts/${id}/documents`, { method: 'POST', body: fd }); status = r.status; try { res = await r.json(); } catch {} }
    catch { res = { error: t('core_network_error') }; }
    if (!res || res.error || status >= 400) { render(); return ui.toast(res?.error || tf('core_server_error', { status })); }
    const fresh = await api.get(`/api/contacts/${id}/documents`); S.docs = Array.isArray(fresh) ? fresh : S.docs; render(); ui.toast(t('dv_doc_uploaded'));
  }
  function sideCards() {
    const ds = S.deals, last = acts()[0]?.created_at;
    return `<div class="ct-side">
      <section class="card" aria-label="${esc(t('dv_details'))}"><div class="card-header"><h2 class="card-title">${esc(t('dv_details'))}</h2></div><div class="card-body"><dl class="kv" style="margin:0">
        <dt>${esc(t('chip_owner'))}</dt><dd>${S.c.assigned_to_name ? `<div class="row" style="gap:8px">${avatar(S.c.assigned_to_name, 'sm')}<span>${esc(S.c.assigned_to_name)}</span></div>` : `<span class="muted">${esc(t('unassigned'))}</span>`}</dd>
        <dt>${esc(t('created_lbl'))}</dt><dd>${esc(fmtDate(S.c.created_at))}</dd><dt>${esc(t('chip_last'))}</dt><dd>${esc(last ? agoDays(last) : t('dv_never'))}</dd></dl></div></section>
      <section class="card" aria-label="${esc(t('tab_deals'))}"><div class="card-header"><h2 class="card-title">${esc(t('tab_deals'))}</h2>${ds.length ? `<button class="btn btn-ghost btn-sm" data-act="tab" data-tab="deals">${esc(t('dv_view_all'))}</button>` : ''}</div>
        <div class="card-body" style="padding-bottom:${ds.length ? 8 : 18}px"><div class="ct-big">${fmtEUR(sumVal(ds))}</div><div class="muted" style="margin:2px 0 ${ds.length ? 10 : 0}px">${esc(ds.length ? dvPlural(ds.length, 'dv_one_deal_total', 'dv_n_deals_total') : t('dv_no_deals'))}</div>
          ${ds.slice(0, 3).map(d => { const st = stageOfDeal(d); return `<div class="ct-mini clickable" data-act="open-deal" data-id="${d.id}"><div class="grow"><a class="ct-name truncate" style="display:block" href="#" data-act="open-deal" data-id="${d.id}">${esc(d.title)}</a>${st ? `<div style="margin-top:4px"><span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span></div>` : ''}</div><span class="tnum strong" style="font-weight:650">${d.value != null ? fmtEURShort(d.value) : ''}</span></div>`; }).join('')}
          ${ds.length > 3 ? `<div class="ct-mini"><button class="btn btn-ghost btn-sm" data-act="tab" data-tab="deals" style="margin-left:-10px">${esc(tf('dv_n_more', { n: ds.length - 3 }))}</button></div>` : ''}</div></section></div>`;
  }
  function detailHtml() {
    const counts = { activity: acts().length, deals: S.deals.length, tasks: S.tasks.filter(x => x.status !== dvDoneKey()).length, documents: S.docs.length }, tabLbl = { overview: t('dv_tab_overview'), activity: t('dv_tab_activity'), deals: t('tab_deals'), tasks: t('tab_tasks'), documents: t('dv_tab_documents') };
    const panel = { overview: overviewPanel, activity: activityPanel, deals: dealsPanel, tasks: tasksPanel, documents: documentsPanel }[S.tab]();
    const last = acts()[0]?.created_at, telHref = tel(), w = wa();   // not `t`: that is the global translator
    return `<div class="ct-detail">
      <div class="page-header ct-head"><div class="ct-id">${avatar(S.c.name, 'xl')}<div style="min-width:0"><h1 class="page-title">${esc(S.c.name)}</h1>
          <div class="ct-meta">${S.c.company ? `<span>${icon('building', 'ic-sm')}${esc(S.c.company)}</span>` : ''}<span>${icon('clock', 'ic-sm')}${esc(tf('dv_last_contact_when', { when: last ? agoDays(last).toLowerCase() : t('dv_never').toLowerCase() }))}</span></div></div></div>
        <div class="page-actions">${telHref ? `<a class="btn btn-secondary" href="${esc(telHref)}">${icon('phone')}${esc(t('act_call'))}</a>` : `<button class="btn btn-secondary" disabled title="${esc(t('dv_no_phone'))}">${icon('phone')}${esc(t('act_call'))}</button>`}
          ${S.c.email ? `<a class="btn btn-secondary" href="mailto:${esc(S.c.email)}">${icon('mail')}${esc(t('act_email'))}</a>` : `<button class="btn btn-secondary" disabled title="${esc(t('dv_no_email'))}">${icon('mail')}${esc(t('act_email'))}</button>`}
          ${w ? `<a class="btn btn-secondary" href="${esc(w)}" target="_blank" rel="noopener">${icon('message-circle')}WhatsApp</a>` : `<button class="btn btn-secondary" disabled title="${esc(t('dv_no_phone'))}">${icon('message-circle')}WhatsApp</button>`}
          <button class="btn btn-secondary" data-act="edit-all">${icon('pencil')}${esc(t('btn_edit'))}</button>
          <button class="btn btn-secondary btn-icon" data-act="more" aria-label="${esc(t('dv_more_actions'))}" aria-haspopup="menu">${icon('ellipsis')}</button></div></div>
      <div class="split split-2-1 ct-split"><section class="card" style="align-self:start"><div class="tabs" role="tablist" aria-label="${esc(S.c.name)}" style="padding:0 8px">
          ${Object.keys(tabLbl).map(k => `<button class="tab" role="tab" data-act="tab" data-tab="${k}" aria-selected="${S.tab === k}" tabindex="${S.tab === k ? 0 : -1}">${esc(tabLbl[k])}${counts[k] ? `<span class="badge">${counts[k]}</span>` : ''}</button>`).join('')}</div>
        <div role="tabpanel" class="${S.tab === 'deals' || S.tab === 'tasks' || S.tab === 'documents' ? '' : 'ct-panel'}">${panel}</div></section>${sideCards()}</div></div>`;
  }

  /* ----- host: side panel on the Contacts/Suppliers page, pop window elsewhere ----- */
  const activePage = document.querySelector('.sb-link[aria-current="page"]')?.dataset.page;
  const usePanel = !opts.modal && (activePage === 'contacts' || activePage === 'suppliers') && document.getElementById('contact-side-panel');
  let host, modal = null;
  if (usePanel) {
    document.querySelectorAll('#contacts-body tr.side-panel-active').forEach(r => r.classList.remove('side-panel-active'));
    document.querySelector(`#contacts-body [onclick="openDetail(${id})"]`)?.closest('tr')?.classList.add('side-panel-active');
    document.getElementById('side-panel-name').textContent = noun;
    host = document.getElementById('side-panel-body'); host.innerHTML = ''; host.scrollTop = 0;
    document.getElementById('contact-side-panel').classList.remove('hidden');
  } else {
    // opts.onClose fires for the pop-window host only; the side panel (Contacts/Suppliers page) has no caller that needs it
    modal = ui.modal({ title: noun, size: 'xl', body: '<div></div>', onClose: opts.onClose });
    modal.el.querySelector('.modal').classList.add('ct-modal'); host = modal.body;
  }
  if (host._ctOff) host._ctOff.forEach(f => f()); const offs = []; host._ctOff = offs;
  function render() {
    const a = document.activeElement, fid = a && host.contains(a) ? a.id : null;
    host.innerHTML = detailHtml();
    if (fid) document.getElementById(fid)?.focus();
    dvAutoGrow(host.querySelector('#ct-aedit'));   // a re-render rebuilds the editor, so re-fit it
  }
  const close = () => { if (modal) modal.close(); else closeSidePanel(); };

  /* ----- editing ----- */
  function startEdit(btn, key) {
    const dd = btn.closest('dd');
    if (key === 'owner') return ui.select(btn, [{ value: null, label: t('unassigned') }, ...members.map(x => ({ value: x.id, label: x.name }))], S.c.assigned_to, v => { if (v !== S.c.assigned_to) commit({ assigned_to: v }, t('dv_owner_updated')); });
    const isCf = key.startsWith('cf:'), fk = isCf ? key.slice(3) : null, f = isCf ? fields.find(x => x.field_key === fk) : null, cur = isCf ? (S.c.custom_data?.[fk] ?? '') : (S.c[key] || '');
    const lbl = isCf ? f?.name : { name: t('lbl_name'), company: t('lbl_company'), email: t('lbl_email'), phone: t('lbl_phone') }[key];
    if (f?.type === 'dropdown') return ui.select(btn, [{ value: '', label: t('not_set') }, ...(f.options || []).map(o => ({ value: o, label: o }))], cur, v => { if (v !== cur) commit({ custom_data: { ...(S.c.custom_data || {}), [fk]: v } }, tf('dv_x_updated', { x: lbl })); });
    const type = key === 'email' ? 'email' : key === 'phone' ? 'tel' : ({ email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' })[f?.type] || 'text';
    const orig = dd.innerHTML;
    dd.innerHTML = `<div class="ct-fedit"><input class="input input-sm" type="${type}" value="${esc(cur)}" aria-label="${esc(lbl)}" autocomplete="off"><div class="error-text" role="alert" hidden></div></div>`;
    const inp = dd.querySelector('input'), err = dd.querySelector('.error-text'); let done = false; inp.focus(); inp.select();
    const finish = (save, strict) => {
      if (done) return; const v = inp.value.trim();
      if (!save || v === String(cur)) { done = true; dd.innerHTML = orig; return; }
      if (key === 'name' && !v) { if (strict) { inp.setAttribute('aria-invalid', 'true'); err.textContent = t('dv_err_name'); err.hidden = false; return; } done = true; dd.innerHTML = orig; return; }
      if (key === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { if (strict) { inp.setAttribute('aria-invalid', 'true'); err.textContent = t('dv_err_email'); err.hidden = false; return; } done = true; dd.innerHTML = orig; ui.toast(t('dv_err_email_not_saved')); return; }
      done = true; commit(isCf ? { custom_data: { ...(S.c.custom_data || {}), [fk]: v } } : { [key]: v }, tf('dv_x_updated', { x: lbl }));
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true, true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
    inp.addEventListener('input', () => { inp.removeAttribute('aria-invalid'); err.hidden = true; });
    inp.addEventListener('blur', () => finish(true, false));
  }
  async function logActivity() {
    const d = S.draft, text = d.text.trim();
    if (!text) { d.err = true; render(); host.querySelector('#ct-atext')?.focus(); return; }
    const res = await api.post('/api/activities', { contact_id: id, type: d.type, content: esc(text).replace(/\n/g, '<br>') }); if (res?.error) return ui.toast(res.error);
    d.text = ''; d.err = false; const fresh = await api.get(`/api/contacts/${id}`); if (fresh && !fresh.error) S.c = fresh; render(); host.querySelector('#ct-atext')?.focus(); ui.toast(tf('act_logged', { type: t(dvTypeOf(d.type).label) }));
  }
  const A = {
    tab: el => { S.tab = el.dataset.tab; render(); host.querySelector(`[data-tab="${S.tab}"]`)?.focus(); },
    'edit-all': () => { if (typeof openContactModal === 'function') { currentContactType = S.c.contact_type || 'contact'; openContactModal(id); } },
    more: el => ui.menu(el, [
      { label: t('dv_copy_email'), icon: 'copy', onSelect: () => S.c.email ? navigator.clipboard.writeText(S.c.email).then(() => ui.toast(t('dv_email_copied'))) : ui.toast(t('dv_no_email')) },
      { label: t('dv_copy_phone'), icon: 'copy', onSelect: () => S.c.phone ? navigator.clipboard.writeText(S.c.phone).then(() => ui.toast(t('dv_phone_copied'))) : ui.toast(t('dv_no_phone')) }, { sep: true },
      { label: tf('dv_delete_noun', { noun: one }), icon: 'trash', danger: true, onSelect: async () => { const ok = await ui.confirm({ title: tf('dv_delete_noun_q', { noun: one }), message: t('dv_delete_contact_msg'), confirmLabel: t('btn_delete'), danger: true }); if (!ok) return; const res = await api.del(`/api/contacts/${id}`); if (res?.error) return ui.toast(res.error); close(); invalidate(); if (typeof loadContacts === 'function' && document.getElementById('page-contacts')?.classList.contains('active')) loadContacts(); ui.toast(tf('dv_noun_deleted', { noun })); } }], { align: 'right' }),
    'add-deal': () => openDealForm({ contactId: id, onSave: async () => { S.deals = await api.get(`/api/deals?contact_id=${id}`) || []; render(); } }),
    'add-task': () => openTaskForm({ contactId: id, contactName: S.c.name, onSave: async () => { S.tasks = (await dvAllTasks()).filter(x => x.contact_id === id && !x.parent_id); render(); } }),
    'open-deal': el => { close(); openDealDetail(+el.dataset.id); },
    'open-task': el => openTaskDrawer(+el.dataset.id, { onChange: async () => { S.tasks = (await dvAllTasks()).filter(x => x.contact_id === id && !x.parent_id); render(); } }),
    'act-del': async el => { const ok = await ui.confirm({ title: t('dv_delete_entry_q'), message: t('dv_delete_entry_msg'), confirmLabel: t('btn_delete'), danger: true }); if (!ok) return; const res = await api.del(`/api/activities/${+el.dataset.id}`); if (res?.error) return ui.toast(res.error); const fresh = await api.get(`/api/contacts/${id}`); if (fresh && !fresh.error) S.c = fresh; render(); ui.toast(t('dv_entry_deleted')); },
    'act-edit': el => startNoteEdit(+el.dataset.id),
    'act-cancel': () => { S.editAct = null; S.editText = ''; render(); },
    'act-save': () => saveNoteEdit(),
    'doc-upload': () => host.querySelector('#ct-docfile')?.click(),
    'doc-del': async el => { const ok = await ui.confirm({ title: t('dv_doc_delete_q'), message: t('dv_doc_delete_msg'), confirmLabel: t('btn_delete'), danger: true }); if (!ok) return; const res = await api.del(`/api/contacts/${id}/documents/${+el.dataset.id}`); if (res?.error) return ui.toast(res.error); S.docs = S.docs.filter(d => d.id !== +el.dataset.id); render(); ui.toast(t('dv_doc_deleted')); },
  };
  offs.push(on(host, 'click', '[data-act]', (e, el) => { const fn = A[el.dataset.act]; if (fn) { if (el.tagName === 'A') e.preventDefault(); e.stopPropagation(); fn(el); } }));
  offs.push(on(host, 'change', '#ct-docfile', (e, el) => { const f = el.files && el.files[0]; el.value = ''; uploadDocument(f); }));
  offs.push(on(host, 'click', '[data-edit]', (e, el) => startEdit(el, el.dataset.edit)));
  offs.push(on(host, 'change', '[data-task-toggle]', async (e, el) => { const x = S.tasks.find(y => y.id === +el.dataset.taskToggle), prev = x.status, to = el.checked ? dvDoneKey() : dvFirstKey(); x.status = to; render(); const res = await api.patch(`/api/tasks/${x.id}/status`, { status: to }); if (res?.error) { x.status = prev; render(); return ui.toast(res.error); } const row = tasks.find(y => y.id === x.id); if (row) row.status = to; dvRefreshTasks(); ui.toast(el.checked ? t('tk_completed') : t('tk_reopened')); }));
  offs.push(on(host, 'click', '[data-atype]', (e, el) => { S.draft.type = el.dataset.atype; host.querySelectorAll('[data-atype]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); const ta = host.querySelector('#ct-atext'), sb = host.querySelector('#ct-compose [type=submit]'); if (ta) { ta.placeholder = S.draft.type === 'note' ? tf('dv_ph_note_about', { name: S.c.name.split(' ')[0] }) : t('dv_ph_discussed'); ta.focus(); } if (sb) sb.textContent = t(dvTypeOf(S.draft.type).verb); }));
  offs.push(on(host, 'input', '#ct-atext', (e, el) => { S.draft.text = el.value; if (S.draft.err && el.value.trim()) { S.draft.err = false; el.removeAttribute('aria-invalid'); const er = host.querySelector('#ct-aerr'); if (er) er.hidden = true; } }));
  offs.push(on(host, 'change', '#ct-afilter', (e, el) => { S.draft.filter = el.value; render(); host.querySelector('#ct-afilter')?.focus(); }));
  offs.push(on(host, 'submit', '#ct-compose', e => { e.preventDefault(); logActivity(); }));
  offs.push(on(host, 'keydown', '#ct-atext', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); logActivity(); } }));
  // A note is edited where it sits: one click (or a double-click) on its text opens the editor.
  function startNoteEdit(aid) {
    const a = acts().find(x => x.id === aid); if (!a) return;
    S.editAct = aid; S.editText = dvActText(a.content); render();
    const ta = host.querySelector('#ct-aedit');
    if (ta) { dvAutoGrow(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  async function saveNoteEdit() {
    const ta = host.querySelector('#ct-aedit'); if (!ta) return;
    const v = ta.value.trim();
    if (!v) { ta.setAttribute('aria-invalid', 'true'); ta.focus(); return; }
    const res = await api.patch(`/api/activities/${S.editAct}`, { content: esc(v).replace(/\n/g, '<br>') });
    if (res?.error) return ui.toast(res.error);
    S.editAct = null; S.editText = '';
    const fresh = await api.get(`/api/contacts/${id}`); if (fresh && !fresh.error) S.c = fresh;
    render(); ui.toast(t('entry_updated'));
  }
  // A click that ends a text selection should not swallow the selection by re-rendering.
  offs.push(on(host, 'click', '[data-note]', (e, el) => { if (!String(window.getSelection() || '')) startNoteEdit(+el.dataset.note); }));
  offs.push(on(host, 'dblclick', '[data-note]', (e, el) => startNoteEdit(+el.dataset.note)));
  offs.push(on(host, 'input', '#ct-aedit', (e, el) => { S.editText = el.value; el.removeAttribute('aria-invalid'); dvAutoGrow(el); }));
  offs.push(on(host, 'keydown', '#ct-aedit', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); S.editAct = null; S.editText = ''; render(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNoteEdit(); }
  }));
  render();
  return { close, render };
}

/* ══════════════════════════════════════════════════════════════════════════
   TASK FORM and TASK DRAWER — reference Forms.task and the tasks.js drawer
   ══════════════════════════════════════════════════════════════════════════ */
async function dvTaskLists() {
  const [dealList, contactList] = await Promise.all([api.get('/api/deals'), dvContacts('contact')]);
  if (!taskProjects.length) { try { taskProjects = await api.get('/api/task-projects'); } catch (e) { taskProjects = []; } }
  if (!taskFields.length) taskFields = await api.get('/api/task-fields');
  return { dealList: Array.isArray(dealList) ? dealList : [], contactList };
}
const dvOpt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
const dvListOpts = (pid, cur) => { const p = taskProjects.find(x => x.id === Number(pid)); return dvOpt('', t('not_set'), cur) + (p?.lists || []).map(l => dvOpt(l.id, l.name, cur)).join(''); };

async function openTaskForm(opts = {}) {
  await ensureMembers(); const { dealList, contactList } = await dvTaskLists();
  const fid = 'tkf-' + uid();
  const init = { project_id: opts.projectId !== undefined ? opts.projectId : (currentProjectId || taskProjects[0]?.id || ''), list_id: opts.listId !== undefined ? opts.listId : (currentListId || ''), status: opts.status || dvFirstKey(), priority: 'medium', assigned_to: currentUser?.id || '', deal_id: opts.dealId || '', contact_id: opts.contactId || '', due_date: '', due_time: '' };
  if (!init.list_id && init.project_id) init.list_id = (taskProjects.find(p => p.id === Number(init.project_id))?.lists || [])[0]?.id || '';
  if (init.deal_id && !init.contact_id) { const d = dealList.find(x => x.id === Number(init.deal_id)); if (d?.contact_id) init.contact_id = d.contact_id; }
  const cf = f => { const id = `${fid}-cf-${f.field_key}`; const typeMap = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' };
    return `<div class="field"><label class="label" for="${id}">${esc(f.name)}</label>${f.type === 'dropdown' ? `<select class="select" id="${id}" data-cf="${esc(f.field_key)}"><option value="">${esc(t('not_set'))}</option>${(f.options || []).map(o => dvOpt(o, o, '')).join('')}</select>` : `<input class="input" id="${id}" data-cf="${esc(f.field_key)}" type="${typeMap[f.type] || 'text'}" autocomplete="off">`}</div>`; };
  const m = ui.modal({ title: t('dv_new_task'), size: 'md', onClose: opts.onClose,
    body: `<form id="${fid}" novalidate class="col" style="gap:14px;padding-top:4px">
      <div class="field"><label class="label" for="${fid}-t">${esc(t('lbl_deal_title'))} <span class="req">*</span></label><input class="input" id="${fid}-t" name="title" autofocus autocomplete="off" placeholder="${esc(t('dv_task_title_ph'))}"><div class="error-text" id="${fid}-te" hidden></div></div>
      <div class="field"><label class="label" for="${fid}-ds">${esc(t('dv_description'))}</label><textarea class="textarea" id="${fid}-ds" name="description" rows="2" placeholder="${esc(t('dv_optional_details'))}"></textarea></div>
      <div class="field-row"><div class="field"><label class="label" for="${fid}-pr">${esc(t('dv_project'))}</label><select class="select" id="${fid}-pr" name="project_id">${dvOpt('', t('not_set'), init.project_id) + taskProjects.map(p => dvOpt(p.id, p.name, init.project_id)).join('')}</select></div>
        <div class="field"><label class="label" for="${fid}-l">${esc(t('dv_list'))}</label><select class="select" id="${fid}-l" name="list_id">${dvListOpts(init.project_id, init.list_id)}</select></div></div>
      <div class="field-row"><div class="field"><label class="label" for="${fid}-s">${esc(t('chip_status'))}</label><select class="select" id="${fid}-s" name="status">${dvTaskStatuses().map(s => dvOpt(s.key, s.label, init.status)).join('')}</select></div>
        <div class="field"><label class="label" for="${fid}-p">${esc(t('tk_priority'))}</label><select class="select" id="${fid}-p" name="priority">${Object.keys(DV_PRIO).map(p => dvOpt(p, t(DV_PRIO[p][0]), init.priority)).join('')}</select></div></div>
      <div class="field-row"><div class="field"><label class="label" for="${fid}-o">${esc(t('lbl_assignee'))}</label><select class="select" id="${fid}-o" name="assigned_to"><option value="">${esc(t('unassigned'))}</option>${members.map(x => dvOpt(x.id, x.name, init.assigned_to)).join('')}</select></div>
        <div class="field"><span class="label">${esc(t('chip_due'))}</span><label class="check" style="margin-top:8px"><input type="checkbox" name="due_on" id="${fid}-don"><span>${esc(t('dv_set_due_time'))}</span></label><span class="hint">${esc(t('dv_due_hint'))}</span></div></div>
      <div class="field-row hidden" id="${fid}-dw"><div class="field"><label class="label" for="${fid}-d">${esc(t('dv_due_date'))}</label><input class="input" type="date" id="${fid}-d" name="due_date" value=""></div>
        <div class="field"><label class="label" for="${fid}-dt">${esc(t('dv_time'))}</label><input class="input" type="time" id="${fid}-dt" name="due_time" value=""><span class="hint">${esc(t('dv_time_hint'))}</span></div></div>
      <div class="field-row"><div class="field"><label class="label" for="${fid}-de">${esc(t('lbl_deal'))}</label><select class="select" id="${fid}-de" name="deal_id">${dvOpt('', t('tk_no_deal'), init.deal_id) + dealList.map(d => dvOpt(d.id, d.title, init.deal_id)).join('')}</select></div>
        <div class="field"><label class="label" for="${fid}-c">${esc(t('lbl_contact'))}</label><select class="select" id="${fid}-c" name="contact_id">${dvOpt('', t('no_contact'), init.contact_id) + contactList.map(c => dvOpt(c.id, c.name, init.contact_id)).join('')}</select></div></div>
      ${taskFields.length ? `<div class="field-row">${taskFields.map(cf).join('')}</div>` : ''}</form>`,
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_cancel'))}</button><button class="btn btn-primary" type="submit" form="${fid}">${esc(t('dv_create_task'))}</button>` });
  const f = m.el.querySelector('form'), title = f.querySelector('[name=title]'), err = f.querySelector('#' + fid + '-te');
  title.addEventListener('input', () => { title.removeAttribute('aria-invalid'); err.hidden = true; });
  f.querySelector('[name=project_id]').addEventListener('change', e => { f.querySelector('[name=list_id]').innerHTML = dvListOpts(e.target.value, ''); });
  f.querySelector('[name=deal_id]').addEventListener('change', e => { const d = e.target.value ? dealList.find(x => x.id === +e.target.value) : null, c = f.querySelector('[name=contact_id]'); if (d?.contact_id && !c.value) c.value = d.contact_id; });
  // An EMPTY <input type="date"> is painted as today's date in Safari, so a form that looked
  // filled used to save "no due date". The tick box makes it explicit: off = no due date, on =
  // the fields are shown AND filled, so an untouched form still submits a real date and time.
  const dueOn = f.querySelector('[name=due_on]'), dueWrap = f.querySelector('#' + fid + '-dw'), dueD = f.querySelector('[name=due_date]'), dueT = f.querySelector('[name=due_time]');
  dueOn.addEventListener('change', () => {
    dueWrap.classList.toggle('hidden', !dueOn.checked);   // .hidden is !important; the [hidden] attribute lost to .field-row's display:grid
    if (dueOn.checked) { const dd = dvDefaultDue(); dueD.value = dd.date; dueT.value = dd.time; dueD.focus(); }
    else { dueD.value = ''; dueT.value = ''; }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault(); const d = ui.formData(f), tt = d.title.trim();
    if (!tt) { title.setAttribute('aria-invalid', 'true'); err.textContent = t('dv_err_task_title'); err.hidden = false; title.focus(); return; }
    const payload = { title: tt, description: d.description.trim(), project_id: d.project_id || null, list_id: d.list_id || null, status: d.status, priority: d.priority, due_date: d.due_on ? (d.due_date || null) : null, due_time: d.due_on ? (d.due_time || null) : null, assigned_to: d.assigned_to || null, deal_id: d.deal_id || null, contact_id: d.contact_id || null,
      custom_data: Object.fromEntries([...f.querySelectorAll('[data-cf]')].map(el => [el.dataset.cf, el.value])) };
    const res = await api.post('/api/tasks', payload); if (res?.error) return ui.toast(res.error);
    m.close();
    // the Tasks page holds every task of the workspace now (Part 40): reload it all, then re-render
    if (typeof reloadTasksData === 'function' && document.getElementById('page-tasks')?.classList.contains('active')) { await reloadTasksData(); dvRefreshTasks(); }
    opts.onSave && opts.onSave(res);
    ui.toast(t('dv_task_created'), { action: { label: t('btn_view'), onClick: () => openTaskDrawer(res.id) } });
  });
  return m;
}

let dvDrawer = null;
async function openTaskDrawer(id, opts = {}) {
  if (dvDrawer) { const d = dvDrawer; dvDrawer = null; d.close(); }
  await ensureMembers(); const { dealList, contactList } = await dvTaskLists();
  let x = await api.get(`/api/tasks/${id}`);
  if (!x || x.error) { ui.toast(t('dv_task_gone')); return; }
  // Show, edit and save on the VIEWER's clock: convert the stored wall-clock once, remember
  // what was typed and where for the note, and stamp the viewer's zone — what the inputs
  // now hold is in that zone, and the server records it again on save.
  const typed = { time: String(x.due_time || '').slice(0, 5) || null, tz: x.due_tz || null };
  const shownDue = taskDueShown(x); x.due_date = shownDue.date || null; x.due_time = shownDue.time;
  x.due_tz = currentTimezone();
  const fid = 'tkd-' + uid(), fin = () => x.status === dvDoneKey();
  const cf = f => { const id2 = `${fid}-cf-${f.field_key}`, v = x.custom_data?.[f.field_key] ?? '', typeMap = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' };
    return `<dt><label for="${id2}">${esc(f.name)}</label></dt><dd>${f.type === 'dropdown' ? `<select class="select select-sm" id="${id2}" data-f="cf:${esc(f.field_key)}"><option value="">${esc(t('not_set'))}</option>${(f.options || []).map(o => dvOpt(o, o, v)).join('')}</select>` : `<input class="input input-sm" id="${id2}" data-f="cf:${esc(f.field_key)}" type="${typeMap[f.type] || 'text'}" value="${esc(v)}">`}</dd>`; };
  const body = `<div class="tk-dr">
    <div><div class="tk-dr-head"><button class="tk-done big ${fin() ? 'on' : ''}" data-dtoggle aria-pressed="${fin()}" aria-label="${esc(fin() ? t('tk_reopen_task') : t('dv_complete_task'))}">${icon('check')}</button>
      <textarea class="tk-dr-title" id="${fid}-t" rows="1" aria-label="${esc(t('dv_task_title_aria'))}">${esc(x.title)}</textarea></div><div class="error-text" id="${fid}-te" hidden style="margin-left:38px"></div></div>
    <dl class="kv tk-props">
      <dt><label for="${fid}-s">${esc(t('chip_status'))}</label></dt><dd><select class="select select-sm" id="${fid}-s" data-f="status">${dvTaskStatuses().map(s => dvOpt(s.key, s.label, x.status)).join('')}</select></dd>
      <dt><label for="${fid}-p">${esc(t('tk_priority'))}</label></dt><dd><select class="select select-sm" id="${fid}-p" data-f="priority">${Object.keys(DV_PRIO).map(p => dvOpt(p, t(DV_PRIO[p][0]), x.priority)).join('')}</select></dd>
      <dt><label for="${fid}-o">${esc(t('lbl_assignee'))}</label></dt><dd><select class="select select-sm" id="${fid}-o" data-f="assigned_to"><option value="">${esc(t('unassigned'))}</option>${members.map(mm => dvOpt(mm.id, mm.name, x.assigned_to)).join('')}</select></dd>
      <dt><label for="${fid}-don">${esc(t('dv_due_date'))}</label></dt><dd><label class="check"><input type="checkbox" id="${fid}-don" data-due-on ${x.due_date ? 'checked' : ''}><span class="muted" style="font-size:var(--fs-sm)">${esc(t('dv_has_due'))}</span></label><span id="${fid}-dw" class="${x.due_date ? '' : 'hidden'}" style="display:contents"><input class="input input-sm" type="date" id="${fid}-d" data-f="due_date" value="${esc(dvIso(x.due_date))}"><input class="input input-sm" type="time" id="${fid}-dt" data-f="due_time" value="${esc(String(x.due_time || '').slice(0, 5))}" aria-label="${esc(t('dv_time'))}" style="max-width:104px"><span class="muted" id="${fid}-dl" style="white-space:nowrap;font-size:var(--fs-sm)"></span></span></dd>
      <dt><label for="${fid}-pr">${esc(t('dv_project'))}</label></dt><dd><select class="select select-sm" id="${fid}-pr" data-f="project_id">${dvOpt('', t('not_set'), x.project_id) + taskProjects.map(p => dvOpt(p.id, p.name, x.project_id)).join('')}</select><select class="select select-sm" id="${fid}-l" data-f="list_id" aria-label="${esc(t('dv_list'))}">${dvListOpts(x.project_id, x.list_id)}</select></dd>
      <dt><label for="${fid}-de">${esc(t('lbl_deal'))}</label></dt><dd><select class="select select-sm" id="${fid}-de" data-f="deal_id">${dvOpt('', t('tk_no_deal'), x.deal_id) + dealList.map(d => dvOpt(d.id, d.title, x.deal_id)).join('')}</select><button class="btn btn-ghost btn-sm btn-icon" id="${fid}-dea" data-open="deal" aria-label="${esc(t('tk_open_deal'))}" title="${esc(t('tk_open_deal'))}" ${x.deal_id ? '' : 'hidden'}>${icon('external')}</button></dd>
      <dt><label for="${fid}-c">${esc(t('lbl_contact'))}</label></dt><dd><select class="select select-sm" id="${fid}-c" data-f="contact_id">${dvOpt('', t('no_contact'), x.contact_id) + contactList.map(c => dvOpt(c.id, c.name, x.contact_id)).join('')}</select><button class="btn btn-ghost btn-sm btn-icon" id="${fid}-ca" data-open="contact" aria-label="${esc(t('tk_open_contact'))}" title="${esc(t('tk_open_contact'))}" ${x.contact_id ? '' : 'hidden'}>${icon('external')}</button></dd>
      ${taskFields.map(cf).join('')}
    </dl>
    <div class="field"><label class="label" for="${fid}-ds">${esc(t('dv_description'))}</label><textarea class="textarea" id="${fid}-ds" data-f="description" rows="3" placeholder="${esc(t('dv_add_description'))}">${esc(x.description || '')}</textarea></div>
    <section aria-label="${esc(t('tk_col_subtasks'))}" id="${fid}-subs"></section></div>`;
  const dr = ui.drawer({ title: t('dv_task_details'), width: 580, body,
    footer: `<button class="btn btn-danger-ghost" data-del style="margin-right:auto">${icon('trash')}${esc(t('tk_delete_task'))}</button><button class="btn btn-secondary" data-close>${esc(t('btn_close'))}</button>`,
    onClose: () => { if (dvDrawer === dr) dvDrawer = null; } });
  dvDrawer = dr; dr.el.querySelector('.drawer').classList.add('tk-drawer');
  const q = sel => dr.el.querySelector(sel);
  // The Tasks page groups by project / list and shows the links, so a move or relink in here must land in its row too (Part 40).
  const syncRow = () => { const row = tasks.find(y => y.id === id); if (row) Object.assign(row, { title: x.title, status: x.status, priority: x.priority, assigned_to: x.assigned_to, assigned_to_name: members.find(mm => mm.id === x.assigned_to)?.name || null, due_date: x.due_date, due_time: x.due_time, due_tz: x.due_tz, description: x.description, project_id: x.project_id, list_id: x.list_id, deal_id: x.deal_id || null, deal_title: x.deal_title || null, contact_id: x.contact_id || null, contact_name: x.contact_name || null }); dvRefreshTasks(); opts.onChange && opts.onChange(x); };
  const payload = () => ({ title: x.title, description: x.description, status: x.status, priority: x.priority, assigned_to: x.assigned_to || null, due_date: x.due_date ? dvIso(x.due_date) : null, due_time: x.due_time || null, project_id: x.project_id || null, list_id: x.list_id || null, deal_id: x.deal_id || null, contact_id: x.contact_id || null, custom_data: x.custom_data || {} });
  async function save(patch, msg) { const prev = {}; Object.keys(patch).forEach(k => prev[k] = x[k]); Object.assign(x, patch); const res = await api.put(`/api/tasks/${id}`, payload()); if (res?.error) { Object.assign(x, prev); return ui.toast(res.error); } syncRow(); if (msg) ui.toast(msg, { ms: 1800 }); }
  const titleEl = q(`#${fid}-t`), titleErr = q(`#${fid}-te`);
  const fit = () => { titleEl.style.height = 'auto'; titleEl.style.height = titleEl.scrollHeight + 2 + 'px'; };
  fit(); titleEl.addEventListener('input', () => { fit(); titleEl.removeAttribute('aria-invalid'); titleErr.hidden = true; });
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } if (e.key === 'Escape') { e.stopPropagation(); titleEl.value = x.title; fit(); titleEl.blur(); } });
  titleEl.addEventListener('blur', () => { const v = titleEl.value.trim(); if (!v) { titleEl.value = x.title; titleEl.setAttribute('aria-invalid', 'true'); titleErr.textContent = t('dv_err_title_empty'); titleErr.hidden = false; fit(); return; } if (v !== x.title) save({ title: v }, t('dv_title_saved')); });
  const dueNote = () => { q(`#${fid}-dl`).textContent = (x.due_date ? dvDue(x.due_date, x.due_time, x.due_tz) : '')
    + (x.due_time && typed.tz && typed.tz !== x.due_tz ? ' ' + tf('dv_entered_as', { time: typed.time, tz: typed.tz }) : ''); };
  const links = () => { q(`#${fid}-dea`).hidden = !x.deal_id; q(`#${fid}-ca`).hidden = !x.contact_id; };
  const syncDone = () => { const b = q('[data-dtoggle]'), f = fin(); b.classList.toggle('on', f); b.setAttribute('aria-pressed', f); b.setAttribute('aria-label', f ? t('tk_reopen_task') : t('dv_complete_task')); q(`#${fid}-s`).value = x.status; };
  // Box, wrapper, inputs and note all follow x — the saved task — so a failed save snaps them back.
  const syncDue = () => { const on = !!x.due_date; q(`#${fid}-don`).checked = on; q(`#${fid}-dw`).classList.toggle('hidden', !on); q(`#${fid}-d`).value = on ? dvIso(x.due_date) : ''; q(`#${fid}-dt`).value = x.due_time ? String(x.due_time).slice(0, 5) : ''; dueNote(); };
  dueNote(); links();
  on(dr.el, 'click', '[data-dtoggle]', async () => { const next = fin() ? dvFirstKey() : dvDoneKey(), prev = x.status; x.status = next; syncDone(); const res = await api.patch(`/api/tasks/${id}/status`, { status: next }); if (res?.error) { x.status = prev; syncDone(); return ui.toast(res.error); } syncRow(); ui.toast(next === dvDoneKey() ? t('tk_completed') : t('tk_reopened'), { ms: 1800 }); });
  // The same tick box as the create forms. The drawer saves on change, so ticking SAVES at once
  // (today + 3 h) — the inputs must never show a value that is not stored — and unticking saves
  // null for both date and time, which is how a due date put on the wrong task is removed.
  on(dr.el, 'change', '[data-due-on]', async (e, el) => {
    if (el.checked) { const dd = dvDefaultDue(); await save({ due_date: dd.date, due_time: dd.time }, tf('dv_due_set', { d: dvDue(dd.date, dd.time, x.due_tz) })); }
    else { await save({ due_date: null, due_time: null }, t('dv_due_removed')); }
    syncDue();
  });
  on(dr.el, 'change', '[data-f]', (e, el) => {
    const k = el.dataset.f, v = el.value, patch = {};
    if (k.startsWith('cf:')) patch.custom_data = { ...(x.custom_data || {}), [k.slice(3)]: v };
    else if (k === 'assigned_to' || k === 'deal_id' || k === 'contact_id' || k === 'project_id' || k === 'list_id') patch[k] = v ? +v : null;
    else if (k === 'description') patch.description = v.trim();
    else patch[k] = v || null;
    if (k === 'due_date' && !v) patch.due_time = null;   // a time without a date is useless
    if (k === 'project_id') { patch.list_id = (taskProjects.find(p => p.id === patch.project_id)?.lists || [])[0]?.id || null; q(`#${fid}-l`).innerHTML = dvListOpts(patch.project_id, patch.list_id); }
    if (k === 'deal_id' && patch.deal_id && !x.contact_id) { const d = dealList.find(y => y.id === patch.deal_id); if (d?.contact_id) { patch.contact_id = d.contact_id; q(`#${fid}-c`).value = d.contact_id; } }
    save(patch, t({ status: 'dv_status_updated', priority: 'dv_priority_updated', assigned_to: 'dv_assignee_updated', due_date: 'dv_due_updated', due_time: 'dv_time_updated', description: 'dv_description_saved', project_id: 'tk_project_updated', list_id: 'dv_list_updated', deal_id: 'dv_deal_link_updated', contact_id: 'dv_contact_updated' }[k] || 'msg_saved')).then(() => { if (k === 'status') syncDone(); if (k === 'due_date' || k === 'due_time') syncDue(); if (k === 'deal_id' || k === 'contact_id') links(); });
  });
  on(dr.el, 'click', '[data-open]', (e, el) => { const kind = el.dataset.open; dr.close(); if (kind === 'deal' && x.deal_id) openDealDetail(x.deal_id); if (kind === 'contact' && x.contact_id) openContactDetail(x.contact_id); });
  on(dr.el, 'click', '[data-del]', async () => { const ok = await ui.confirm({ title: t('tk_delete_task_q'), message: t('dv_delete_task_msg'), confirmLabel: t('tk_delete_task'), danger: true }); if (!ok) return; const res = await api.del(`/api/tasks/${id}`); if (res?.error) return ui.toast(res.error); tasks = tasks.filter(y => y.id !== id && y.parent_id !== id); dvRefreshTasks(); opts.onChange && opts.onChange(null); dr.close(); ui.toast(t('tk_deleted')); });

  /* subtasks */
  const subHost = q(`#${fid}-subs`);
  function paintSubs(focus) {
    const a = x.subtasks || [], done = a.filter(s => s.status === dvDoneKey()).length;
    subHost.innerHTML = `<div class="tk-secH"><b>${esc(t('tk_col_subtasks'))}</b><span class="muted tnum">${esc(tf('dv_n_of_done', { d: done, n: a.length }))}</span></div>
      ${a.length ? `<div class="progress" style="margin-bottom:8px"><i style="width:${Math.round(done / a.length * 100)}%"></i></div>` : ''}
      ${a.map(s => `<div class="tk-si"><label class="check"><input type="checkbox" data-sub="${s.id}" ${s.status === dvDoneKey() ? 'checked' : ''}><span class="truncate ${s.status === dvDoneKey() ? 'tk-strike' : ''}">${esc(s.title)}</span></label><button class="iconbtn tk-mini tk-x" data-subdel="${s.id}" aria-label="${esc(tf('dv_delete_subtask_aria', { title: s.title }))}">${icon('x')}</button></div>`).join('') || `<div class="muted" style="font-size:var(--fs-sm);padding:2px 0 8px">${esc(t('dv_no_subtasks'))}</div>`}
      <div class="row" style="margin-top:8px"><input class="input input-sm" id="${fid}-sin" placeholder="${esc(t('dv_add_subtask_ph'))}" aria-label="${esc(t('dv_new_subtask'))}" autocomplete="off"><button class="btn btn-secondary btn-sm" data-subadd>${esc(t('add_btn'))}</button></div>`;
    if (focus) { const el = focus === 'add' ? q(`#${fid}-sin`) : subHost.querySelector(`[data-sub="${focus}"]`); el && el.focus(); }
  }
  // The page's expandable subtask rows come from the shared `tasks` global, so the fresh subtasks replace the parent's there as well (Part 40).
  const reloadSubs = async () => { const fresh = await api.get(`/api/tasks/${id}`); if (fresh && !fresh.error) x.subtasks = fresh.subtasks || []; const row = tasks.find(y => y.id === id); if (row) { row.subtask_count = (x.subtasks || []).length; row.subtask_done = (x.subtasks || []).filter(s => s.status === dvDoneKey()).length; } tasks = tasks.filter(y => y.parent_id !== id).concat((x.subtasks || []).map(s => ({ ...s, parent_id: id }))); dvRefreshTasks(); };
  const addSub = async () => { const inp = q(`#${fid}-sin`), v = inp.value.trim(); if (!v) { inp.focus(); return; } const res = await api.post('/api/tasks', { title: v, parent_id: id, project_id: x.project_id || null, list_id: x.list_id || null, status: dvFirstKey(), priority: 'medium' }); if (res?.error) return ui.toast(res.error); await reloadSubs(); paintSubs('add'); };
  on(dr.el, 'click', '[data-subadd]', addSub);
  dr.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === `${fid}-sin`) { e.preventDefault(); addSub(); } });
  on(dr.el, 'change', '[data-sub]', async (e, el) => { const res = await api.patch(`/api/tasks/${+el.dataset.sub}/status`, { status: el.checked ? dvDoneKey() : dvFirstKey() }); if (res?.error) return ui.toast(res.error); await reloadSubs(); paintSubs(+el.dataset.sub); });
  on(dr.el, 'click', '[data-subdel]', async (e, el) => { const res = await api.del(`/api/tasks/${+el.dataset.subdel}`); if (res?.error) return ui.toast(res.error); await reloadSubs(); paintSubs('add'); ui.toast(t('dv_subtask_deleted')); });
  paintSubs();
  return dr;
}

/* ══════════════════════════════════════════════════════════════════════════
   OPENERS — these replace the older modal-based functions (declared last, so they win)
   ══════════════════════════════════════════════════════════════════════════ */
async function openDealModal(id) { return id ? openDealDetail(id) : openDealForm(); }
async function openDealModalForContact(contactId) { return openDealForm({ contactId }); }
async function openDetail(id) { return openContactDetail(id); }
async function openTaskModal(id, ctx = null) { return id ? openTaskDrawer(id) : openTaskForm({ dealId: ctx?.dealId || null, contactId: ctx?.contactId || null }); }
async function openTaskModalForContact(contactId) { return openTaskForm({ contactId }); }
async function addTaskFromDeal(dealId) { return openTaskForm({ dealId }); }
function openLinkedTaskObject(kind, id) { if (dvDrawer) { const d = dvDrawer; dvDrawer = null; d.close(); } if (kind === 'deal') openDealDetail(id); else openContactDetail(id); }
