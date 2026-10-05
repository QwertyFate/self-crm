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
                  dvInlineEdit, dvTypeOf, dvPlural, dvSupplierWord,
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
const DV_ACT_TYPES = [
  { id: 'note', label: 'Note', icon: 'note', verb: 'Add note', ph: 'Write a note' },
  { id: 'call', label: 'Call', icon: 'phone', verb: 'Log call', ph: 'What was discussed on the call?' },
  { id: 'email', label: 'Email', icon: 'mail', verb: 'Log email', ph: 'Summarise the email or paste its key points' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'message-circle', verb: 'Log message', ph: 'Message text or summary of the chat' },
];
const dvTypeOf = id => DV_ACT_TYPES.find(x => x.id === id) || DV_ACT_TYPES[0];
const dvPlural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function dvDigits(s) { return String(s || '').replace(/[^\d+]/g, ''); }
const dvSupplierWord = () => (currentWorkspace?.supplier_name || 'Suppliers').replace(/s$/i, '');
const dvObjectWord = n => { const w = currentWorkspace?.object_name || 'Listings'; return n === 1 ? w.replace(/s$/i, '') : w; };
const dvTaskStatuses = () => (Array.isArray(currentWorkspace?.task_statuses) && currentWorkspace.task_statuses.length) ? currentWorkspace.task_statuses : (typeof DEFAULT_TASK_STATUSES !== 'undefined' ? DEFAULT_TASK_STATUSES : []);
const dvDoneKey = () => dvTaskStatuses().at(-1)?.key || 'done';
const dvFirstKey = () => dvTaskStatuses()[0]?.key || 'todo';
const DV_PRIO = { urgent: ['Urgent', 'danger'], high: ['High', 'warning'], medium: ['Medium', 'info'], low: ['Low', ''] };
// Timeline text: legacy entries are rich HTML, new ones are escaped text with line breaks.
const dvActHtml = s => /<[a-z][\s\S]*>/i.test(s || '') ? s : esc(s || '').replace(/\n/g, '<br>');
function dvActText(s) {
  const t = String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}
const dvAgoHours = ts => { if (!ts) return ''; const h = Math.round((Date.now() - new Date(ts).getTime()) / 36e5); return h < 1 ? 'Just now' : h < 24 ? `${h} h ago` : agoDays(ts); };
const dvWhen = ts => ts ? new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
function dvDue(d, due_time) { if (!d) return 'No due date'; const day = x => { const t = new Date(x); t.setHours(0, 0, 0, 0); return t.getTime(); }; const off = Math.round((day(d) - day(Date.now())) / 864e5); const at = String(due_time || '').slice(0, 5), when = at ? ` at ${at}` : '';
  return off < 0 ? `${-off} ${-off === 1 ? 'day' : 'days'} overdue` : off === 0 ? `Due today${when}` : off === 1 ? `Due tomorrow${when}` : `In ${off} days${when}`; }
const dvIso = d => d ? String(d).slice(0, 10) : '';
// An edited note shows all of itself: the field takes the content's height rather than
// scrolling inside a fixed box. Reset to auto first so it shrinks again when text is deleted.
function dvAutoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
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
    if (f.type === 'dropdown') return fld(id, esc(f.name), `<select class="select" id="${id}" data-cf="${esc(f.field_key)}"><option value="">Not set</option>${(f.options || []).map(o => opt(o, o, v)).join('')}</select>`);
    const typeMap = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' };
    return fld(id, esc(f.name), `<input class="input" id="${id}" data-cf="${esc(f.field_key)}" type="${typeMap[f.type] || 'text'}" value="${esc(v)}" autocomplete="off">`);
  };
  const form = document.createElement('form'); form.className = 'dd-form'; form.id = fid; form.noValidate = true;
  form.innerHTML = `
    ${fld(`${fid}-title`, 'Title', `<input class="input" id="${fid}-title" name="title" maxlength="140" autocomplete="off" placeholder="For example Mehrfamilienhaus Köln, Finanzierung" value="${esc(init.title)}" autofocus aria-required="true">`, { req: true })}
    <div class="field-row">
      ${fld(`${fid}-contact`, 'Contact', `<select class="select" id="${fid}-contact" name="contact"><option value="">No contact</option>${allContacts.map(c => opt(c.id, c.company ? `${c.name}, ${c.company}` : c.name, init.contact_id)).join('')}</select>`, { help: 'Enables call, email and WhatsApp.' })}
      ${fld(`${fid}-supplier`, esc(dvSupplierWord()), `<select class="select" id="${fid}-supplier" name="supplier"><option value="">None</option>${allSuppliers.map(c => opt(c.id, c.company ? `${c.name}, ${c.company}` : c.name, init.supplier_id)).join('')}</select>`, { help: 'Notary, appraiser or partner.' })}</div>
    <div class="field-row">
      ${fld(`${fid}-pipeline`, 'Pipeline', `<select class="select" id="${fid}-pipeline" name="pipeline">${pipelines.map(p => opt(p.id, p.name, init.pipeline_id)).join('')}</select>`)}
      ${fld(`${fid}-stage`, 'Stage', `<select class="select" id="${fid}-stage" name="stage"></select>`)}</div>
    <div class="field-row">
      ${fld(`${fid}-value`, 'Value', `<div class="input-affix dd-affix"><input class="input" id="${fid}-value" name="value" type="number" min="0" step="any" inputmode="decimal" placeholder="0" value="${init.value == null || init.value === '' ? '' : esc(init.value)}"><span class="affix">EUR</span></div>`)}
      ${fld(`${fid}-urgency`, 'Urgency', `<select class="select" id="${fid}-urgency" name="urgency">${DEAL_URGENCY.map(u => opt(u.value, urgencyLabel(u), init.urgency)).join('')}</select>`)}</div>
    <div class="field-row">
      ${fld(`${fid}-owner`, 'Owner', `<select class="select" id="${fid}-owner" name="owner"><option value="">Unassigned</option>${members.map(m => opt(m.id, m.name + (m.id === currentUser?.id ? ' (you)' : ''), init.assigned_to)).join('')}</select>`)}
      <div></div></div>
    ${dealFields.length ? `<div class="field-row">${dealFields.map(customField).join('')}</div>` : ''}`;
  const q = sel => form.querySelector(sel);
  const fillStages = () => { const pid = parseInt(q(`#${fid}-pipeline`).value, 10), st = stagesFor(pid), cur = q(`#${fid}-stage`).value || init.stage_id; q(`#${fid}-stage`).innerHTML = st.map(s => opt(s.id, s.name, st.some(x => x.id === Number(cur)) ? cur : st[0]?.id)).join(''); };
  fillStages();
  q(`#${fid}-pipeline`).addEventListener('change', () => { q(`#${fid}-stage`).value = ''; fillStages(); });
  const setErr = (id, msg) => { const el = q('#' + id), er = q('#' + id + '-err'); if (!er) return; er.textContent = msg || ''; if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); };
  q(`#${fid}-title`).addEventListener('input', () => setErr(`${fid}-title`, ''));
  q(`#${fid}-value`).addEventListener('input', () => setErr(`${fid}-value`, ''));
  const m = ui.modal({ title: editing ? 'Edit deal' : 'New deal', size: 'md', body: form, onClose: opts.onClose,
    footer: `<button class="btn btn-secondary" type="button" data-close>${esc(t('btn_cancel'))}</button><button class="btn btn-primary" type="submit" form="${fid}">${editing ? 'Save changes' : 'Create deal'}</button>` });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const title = q(`#${fid}-title`).value.trim(), rawV = q(`#${fid}-value`).value.trim(), v = Number(rawV);
    const errs = {};
    if (!title) errs[`${fid}-title`] = 'Enter a deal title.'; else if (title.length > 140) errs[`${fid}-title`] = 'Use at most 140 characters.';
    if (rawV !== '' && (!isFinite(v) || v < 0)) errs[`${fid}-value`] = 'Enter a number of 0 or more.';
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
    ui.toast(editing ? 'Deal updated' : 'Deal created', editing ? {} : { action: { label: 'Open', onClick: () => openDealDetail(res.id) } });
    opts.onSave && opts.onSave(res);
  });
  return m;
}

/* ══════════════════════════════════════════════════════════════════════════
   DEAL DETAIL — reference deal-detail.js, in a pop window
   ══════════════════════════════════════════════════════════════════════════ */
let dvDeal = null;   // the open deal detail instance (one at a time)

async function openDealDetail(id) {
  if (dvDeal) dvDeal.close();
  await Promise.all([ensureMembers(), pipelines.length ? null : api.get('/api/pipelines').then(r => { pipelines = r; }), dealFields.length ? null : api.get('/api/deal-fields').then(r => { dealFields = r; })]);
  const [d, allContacts, allSuppliers, allTasks, objs] = await Promise.all([api.get(`/api/deals/${id}`), dvContacts('contact'), dvContacts('supplier'), dvAllTasks(), api.get('/api/objects')]);
  if (!d || d.error) { ui.toast('That deal no longer exists.'); return; }
  objects = Array.isArray(objs) ? objs : objects;
  const S = { d, contacts: allContacts, suppliers: allSuppliers, tasks: allTasks.filter(x => x.deal_id === d.id && !x.parent_id), acts: [], tab: 'overview', type: 'note', text: '', textErr: '', filter: null, editAct: null, editText: '', addTask: false, task: { title: '', due_date: '', due_time: '', priority: 'medium', assigned_to: currentUser?.id || '' }, taskErr: '', gone: false };
  const contactOf = () => S.contacts.find(c => c.id === S.d.contact_id) || null;
  const supplierOf = () => S.suppliers.find(c => c.id === S.d.supplier_id) || null;
  const pipe = () => pipelines.find(p => p.id === S.d.pipeline_id) || { name: '', stages: [] };
  const stage = () => pipe().stages.find(s => s.id === S.d.stage_id) || null;
  const owner = () => members.find(m => m.id === S.d.assigned_to) || null;
  const loadActs = async () => { if (!S.d.contact_id) { S.acts = []; return; } const c = await api.get(`/api/contacts/${S.d.contact_id}`); S.acts = (c?.activities || []); };
  await loadActs();

  const payload = patch => ({ title: S.d.title, contact_id: S.d.contact_id, supplier_id: S.d.supplier_id, pipeline_id: S.d.pipeline_id, stage_id: S.d.stage_id, value: S.d.value, assigned_to: S.d.assigned_to, urgency: S.d.urgency, custom_data: S.d.custom_data || {}, ...patch });
  async function commit(patch, msg, extra = {}) {
    const prev = {}; Object.keys(patch).forEach(k => prev[k] = S.d[k]);
    Object.assign(S.d, patch);
    const res = await api.put(`/api/deals/${S.d.id}`, payload(patch));
    if (res?.error) { Object.assign(S.d, prev); ui.toast(res.error); render(); return false; }
    const row = deals.find(x => x.id === S.d.id); if (row) { Object.assign(row, patch, extra); }
    dvRefreshDeals(); render();
    if (msg) ui.toast(msg, { action: { label: 'Undo', onClick: () => commit(prev, null) } });
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
    ui.toast(`Moved to ${s.name}`, { action: { label: 'Undo', onClick: () => move(prev.stage_id) } });
  }

  /* ----- html: top, head ----- */
  const ie = (key, inner, label, menu) => `<button class="dd-ie ${menu ? 'dd-ie-menu' : ''}" data-ie="${key}" ${menu ? 'aria-haspopup="menu"' : ''} aria-label="Edit ${esc(label)}"><span class="dd-ie-v">${inner}</span>${icon(menu ? 'chevron-down' : 'pencil', 'ic-sm')}</button>`;
  function topHtml() {
    const d = S.d, c = contactOf(), st = stage();
    const dis = c ? '' : 'disabled title="No contact linked to this deal"';
    return `<div class="page-header">
      <div class="grow"><h1 class="page-title dd-h1"><button class="dd-ie dd-ie-title" data-ie="title" aria-label="Edit title: ${esc(d.title)}"><span class="dd-ie-v">${esc(d.title)}</span>${icon('pencil', 'ic-sm')}</button></h1>
        <div class="dd-meta">${st ? `<span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span>` : ''}${urgencyBadge(d.urgency)}<span class="dd-sep"></span><span>${esc(pipe().name)}</span><span class="dd-sep"></span><span>Created ${esc(agoDays(d.created_at).toLowerCase())}</span></div></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-act="qa" data-type="call" ${dis}>${icon('phone')}Call</button>
        <button class="btn btn-secondary" data-act="qa" data-type="email" ${dis}>${icon('mail')}Email</button>
        <button class="btn btn-secondary" data-act="qa" data-type="whatsapp" ${dis}>${icon('message-circle')}WhatsApp</button>
        <button class="btn btn-secondary btn-icon" data-act="more" aria-label="More actions" aria-haspopup="menu">${icon('ellipsis')}</button>
      </div></div>`;
  }
  function stepperHtml() {
    const st = pipe().stages, cur = st.findIndex(s => s.id === S.d.stage_id);
    return `<div class="stepper dd-stepper" role="group" aria-label="Deal stage">${st.map((s, i) => `<button class="step ${i === cur ? 'current' : i < cur ? 'done' : ''}" data-act="stage" data-stage="${s.id}" ${i === cur ? 'aria-current="step"' : ''} title="${esc(s.name)}" aria-label="${i === cur ? 'Current stage: ' : 'Move to '}${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div>`;
  }
  function headHtml() {
    const d = S.d, st = stage(), o = owner(), stages = pipe().stages, pos = stages.findIndex(s => s.id === d.stage_id) + 1;
    const last = S.acts[0]?.created_at || d.updated_at;
    const k = (label, val, foot) => `<div class="dd-kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${val}</div><div class="kpi-foot">${foot}</div></div>`;
    return `<div class="dd-stepper-wrap">${stages.length ? stepperHtml() : '<span class="muted">No stages in this pipeline</span>'}</div>
      <div class="dd-kpis">
        ${k('Deal value', ie('value', `<span class="tnum">${d.value != null ? fmtEUR(d.value) : '<span class="muted">Not set</span>'}</span>`, 'deal value'), esc(pipe().name))}
        ${k('Stage', `<button class="dd-ie dd-ie-menu" data-act="stage-menu" aria-haspopup="menu" aria-label="Change stage"><span class="dd-ie-v">${st ? esc(st.name) : 'Not set'}</span>${icon('chevron-down', 'ic-sm')}</button>`, st ? `Stage ${pos} of ${stages.length}` : '')}
        ${k('Urgency', ie('urgency', d.urgency > 0 ? urgencyBadge(d.urgency) : '<span class="muted">Not set</span>', 'urgency', true), 'Shown on the board')}
        ${k('Owner', `<button class="dd-ie dd-ie-menu dd-owner" data-act="owner" aria-haspopup="menu" aria-label="Change owner">${o ? avatar(o.name, 'sm') : ''}<span class="dd-ie-v">${o ? esc(o.name) : 'Unassigned'}</span>${icon('chevron-down', 'ic-sm')}</button>`, o ? esc(o.email || '') : '')}
        ${k('Last activity', `<span>${esc(last ? agoDays(last) : 'Never')}</span>`, dvPlural(S.acts.length, 'logged activity', 'logged activities'))}
      </div>`;
  }

  /* ----- html: main ----- */
  function tabsHtml() {
    const openTasks = S.tasks.filter(x => x.status !== dvDoneKey()).length;
    const T = [['overview', 'Overview', null], ['activity', 'Activity', S.acts.length], ['tasks', 'Tasks', openTasks]];
    return `<div class="tabs" role="tablist" aria-label="Deal sections">${T.map(([id, label, n]) => `<button class="tab" role="tab" data-act="tab" data-tab="${id}" aria-selected="${S.tab === id}" tabindex="${S.tab === id ? 0 : -1}">${label}${n ? `<span class="badge">${n}</span>` : ''}</button>`).join('')}</div>`;
  }
  function miniTasks() {
    const list = S.tasks.filter(x => x.status !== dvDoneKey()).sort((a, b) => (a.due_date || '9') < (b.due_date || '9') ? -1 : 1).slice(0, 3);
    return `<section class="dd-mini" aria-label="Next tasks"><div class="dd-mini-head"><span>Next tasks</span><button class="btn btn-ghost btn-sm" data-act="goto" data-tab="tasks">View all</button></div>
      ${list.length ? list.map(x => `<div class="dd-mini-row"><div class="grow"><a class="dd-task-title" href="#" data-act="open-task" data-id="${x.id}">${esc(x.title)}</a><div class="dd-task-meta"><span class="${taskIsOverdue(x, false) ? 'dd-late' : ''}">${esc(dvDue(x.due_date, x.due_time))}</span>${x.assigned_to_name ? avatar(x.assigned_to_name, 'sm') : ''}</div></div></div>`).join('')
        : `<div class="dd-mini-empty">No open tasks. <button class="btn btn-ghost btn-sm" data-act="goto-task">Add task</button></div>`}</section>`;
  }
  function miniActs() {
    const list = S.acts.slice(0, 3);
    return `<section class="dd-mini" aria-label="Latest activity"><div class="dd-mini-head"><span>Latest activity</span><button class="btn btn-ghost btn-sm" data-act="goto" data-tab="activity">View all</button></div>
      ${list.length ? list.map(a => { const ty = dvTypeOf(a.type); return `<div class="dd-mini-row"><span class="tl-ic ${a.type}">${icon(ty.icon)}</span><div class="grow" style="min-width:0"><div class="row-between"><b>${ty.label}</b><span class="muted" style="font-size:var(--fs-sm)" title="${esc(dvWhen(a.created_at))}">${esc(dvAgoHours(a.created_at))}</span></div><div class="dd-clamp">${dvActHtml(a.content)}</div></div></div>`; }).join('')
        : `<div class="dd-mini-empty">No activity yet. <button class="btn btn-ghost btn-sm" data-act="goto" data-tab="activity">Log activity</button></div>`}</section>`;
  }
  function overviewHtml() {
    const c = contactOf();
    const hint = c ? '' : `<div class="dd-hint warn">${icon('info')}<span>No contact is linked to this deal. Link one from the Contact card to log calls, emails and messages.</span></div>`;
    return `${hint}<div class="grid-2">${miniTasks()}${miniActs()}</div>`;
  }
  function hintHtml() {
    const c = contactOf();
    if (S.type === 'note') return '';
    if (!c) return `<div class="dd-hint warn">${icon('info')}<span>No contact is linked to this deal. Link one to log a ${dvTypeOf(S.type).label.toLowerCase()}.</span></div>`;
    const who = `<b>${esc(c.name)}</b>`;
    if (S.type === 'call') return `<div class="dd-hint">${icon('phone')}<span class="grow">${who}${c.phone ? ', ' + esc(c.phone) : ''}</span>${c.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${esc(dvDigits(c.phone))}">Open dialer</a>` : ''}</div>`;
    if (S.type === 'email') return `<div class="dd-hint">${icon('mail')}<span class="grow">To ${who}${c.email ? ', ' + esc(c.email) : ''}</span>${c.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${esc(c.email)}">Open mail app</a>` : ''}</div>`;
    const wa = waLink(c.phone, c);
    return `<div class="dd-hint">${icon('message-circle')}<span class="grow">${who}${c.phone ? ', ' + esc(c.phone) : ''}</span>${wa ? `<a class="btn btn-secondary btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">Open WhatsApp</a>` : ''}</div>`;
  }
  function tlItem(a) {
    const ty = dvTypeOf(a.type), editing = S.editAct === a.id;
    return `<div class="tl-item" data-aid="${a.id}"><span class="tl-ic ${a.type}">${icon(ty.icon)}</span><div class="dd-tl-main">
      <div class="tl-head"><b>${ty.label}</b>${a.logged_by_name ? `<span class="muted">by ${esc(a.logged_by_name)}</span>` : ''}<span class="dd-tl-time muted" title="${esc(dvWhen(a.created_at))}">${esc(dvAgoHours(a.created_at))}</span>
        <span class="dd-tl-actions"><button class="iconbtn dd-ibtn" data-act="act-edit" data-id="${a.id}" aria-label="Edit entry">${icon('pencil')}</button><button class="iconbtn dd-ibtn" data-act="act-del" data-id="${a.id}" aria-label="Delete entry">${icon('trash')}</button></span></div>
      ${editing ? `<div class="dd-editor"><textarea class="textarea dv-grow" id="dd-act-edit" rows="3" aria-label="${esc(t('edit_entry'))}">${esc(S.editText)}</textarea>
          <div class="row" style="justify-content:flex-end"><button class="btn btn-secondary btn-sm" data-act="act-cancel">Cancel</button><button class="btn btn-primary btn-sm" data-act="act-save" data-id="${a.id}">Save</button></div></div>`
        : `<div class="tl-text dd-pre" data-note="${a.id}" title="${esc(t('click_to_edit'))}">${dvActHtml(a.content)}</div>`}</div></div>`;
  }
  function activityHtml() {
    const ty = dvTypeOf(S.type), all = S.acts, list = S.filter ? all.filter(a => a.type === S.filter) : all, c = contactOf();
    return `<form class="dd-compose" id="dd-compose" novalidate aria-label="Log activity">
        <div class="row-between"><div class="seg" role="group" aria-label="Activity type">${DV_ACT_TYPES.map(x => `<button type="button" data-act="ctype" data-type="${x.id}" aria-pressed="${S.type === x.id}">${icon(x.icon, 'ic-sm')}${x.label}</button>`).join('')}</div></div>
        ${hintHtml()}
        <div class="field"><label class="sr-only" for="dd-compose-text">${ty.label} text</label>
          <textarea class="textarea" id="dd-compose-text" rows="3" placeholder="${esc(ty.ph)}" ${c ? '' : 'disabled'} ${S.textErr ? 'aria-invalid="true"' : ''}>${esc(S.text)}</textarea>
          <div class="error-text" id="dd-compose-err" role="alert">${esc(S.textErr)}</div></div>
        <div class="row-between"><span class="help">Logged as ${esc(currentUser?.name || '')}${c ? `, on ${esc(c.name)}` : ''}. Press Ctrl+Enter to save.</span><button class="btn btn-primary btn-sm" type="submit" ${c ? '' : 'disabled'}>${ty.verb}</button></div></form>
      <div class="dd-bar"><button class="chip ${S.filter ? 'on' : ''}" data-act="tlfilter" aria-haspopup="menu">Type${S.filter ? ': ' + dvTypeOf(S.filter).label : ''}${icon('chevron-down', 'ic-sm')}</button>
        <span class="muted" style="font-size:var(--fs-sm)">${S.filter ? `${list.length} of ${all.length}` : dvPlural(all.length, 'entry', 'entries')}</span></div>
      ${list.length ? `<div class="timeline">${list.map(tlItem).join('')}</div>`
        : dvEmpty('activity', all.length ? 'No entries of this type' : 'No activity yet', all.length ? 'Choose another type or clear the filter.' : c ? 'Log a call, email or note to start the history of this deal.' : 'Link a contact to this deal first.', all.length ? '<button class="btn btn-secondary btn-sm" data-act="tlclear">Clear filter</button>' : '')}`;
  }
  function taskRow(x) {
    const done = x.status === dvDoneKey(), pr = DV_PRIO[x.priority] || DV_PRIO.medium, st = dvTaskStatuses().find(s => s.key === x.status), late = taskIsOverdue(x, done);
    return `<li class="dd-task ${done ? 'done' : ''}" data-tid="${x.id}"><label class="check"><input type="checkbox" data-toggle="${x.id}" ${done ? 'checked' : ''} aria-label="${done ? 'Reopen' : 'Complete'} task: ${esc(x.title)}"></label>
      <div class="grow"><a class="dd-task-title" href="#" data-act="open-task" data-id="${x.id}">${esc(x.title)}</a>
        <div class="dd-task-meta"><span class="badge ${pr[1] ? 'badge-' + pr[1] : ''}">${pr[0]}</span>${st ? `<span>${esc(st.label)}</span>` : ''}<span class="dd-sep"></span><span class="${late ? 'dd-late' : ''}">${esc(done ? 'Done' : dvDue(x.due_date, x.due_time))}</span></div></div>${x.assigned_to_name ? avatar(x.assigned_to_name, 'sm') : ''}</li>`;
  }
  function taskFormHtml() {
    const x = S.task;
    return `<form class="dd-taskform" id="dd-taskform" novalidate aria-label="New task">
      <div class="field"><label class="label" for="dd-task-title">Task <span class="req">*</span></label><input class="input" id="dd-task-title" name="title" value="${esc(x.title)}" placeholder="What needs to be done?" autocomplete="off" ${S.taskErr ? 'aria-invalid="true"' : ''}><div class="error-text" role="alert">${esc(S.taskErr)}</div></div>
      <div class="field-row-3"><div class="field"><label class="label" for="dd-task-due">Due date</label><input class="input" type="date" id="dd-task-due" name="due_date" value="${esc(x.due_date)}"><input class="input" type="time" id="dd-task-time" name="due_time" value="${esc(x.due_time || '')}" aria-label="Time" style="margin-top:6px"></div>
        <div class="field"><label class="label" for="dd-task-prio">Priority</label><select class="select" id="dd-task-prio" name="priority">${Object.keys(DV_PRIO).map(p => `<option value="${p}" ${x.priority === p ? 'selected' : ''}>${DV_PRIO[p][0]}</option>`).join('')}</select></div>
        <div class="field"><label class="label" for="dd-task-owner">Assignee</label><select class="select" id="dd-task-owner" name="assigned_to"><option value="">Unassigned</option>${members.map(m => `<option value="${m.id}" ${String(x.assigned_to) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-secondary btn-sm" data-act="task-cancel">Cancel</button><button type="submit" class="btn btn-primary btn-sm">Add task</button></div></form>`;
  }
  function tasksHtml() {
    const all = S.tasks, open = all.filter(x => x.status !== dvDoneKey()), done = all.filter(x => x.status === dvDoneKey());
    return `<div class="dd-bar"><div><b>${open.length} open</b><span class="muted">, ${done.length} done</span></div>
        ${S.addTask ? '' : `<button class="btn btn-secondary btn-sm" data-act="task-add">${icon('plus')}Add task</button>`}</div>
      ${S.addTask ? taskFormHtml() : ''}
      ${all.length ? `<ul class="list dd-tasks" aria-label="Tasks linked to this deal">${open.concat(done).map(taskRow).join('')}</ul>`
        : S.addTask ? '' : dvEmpty('check-square', 'No tasks linked to this deal', 'Add a task to track the next step, for example a call-back or a document request.')}`;
  }
  function mainHtml() {
    const body = S.tab === 'activity' ? activityHtml() : S.tab === 'tasks' ? tasksHtml() : overviewHtml();
    return `${tabsHtml()}<div class="dd-panel" role="tabpanel" tabindex="0">${body}</div>`;
  }

  /* ----- html: side ----- */
  function detailsCard() {
    const d = S.d, st = stage(), o = owner(), row = (label, inner) => `<dt>${label}</dt><dd>${inner}</dd>`;
    const custom = dealFields.map(f => { const v = d.custom_data?.[f.field_key]; return row(esc(f.name), f.type === 'dropdown' ? ie('cf:' + f.field_key, v ? esc(v) : '<span class="muted">Not set</span>', f.name, true) : ie('cf:' + f.field_key, v ? esc(v) : '<span class="muted">Not set</span>', f.name)); }).join('');
    return `<section class="card" aria-label="Details"><div class="card-header"><h2 class="card-title">Details</h2><button class="btn btn-ghost btn-sm" data-act="edit-full">${icon('pencil')}Edit all</button></div>
      <div class="card-body"><dl class="kv" style="margin:0">
        ${row('Pipeline', ie('pipeline', esc(pipe().name), 'pipeline', true))}
        ${row('Stage', `<button class="dd-ie dd-ie-menu" data-act="stage-menu" aria-haspopup="menu" aria-label="Change stage"><span class="dd-ie-v">${st ? `<span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span>` : '<span class="muted">Not set</span>'}</span>${icon('chevron-down', 'ic-sm')}</button>`)}
        ${row('Urgency', ie('urgency', d.urgency > 0 ? urgencyBadge(d.urgency) : '<span class="muted">Not set</span>', 'urgency', true))}
        ${row('Owner', `<button class="dd-ie dd-ie-menu" data-act="owner" aria-haspopup="menu" aria-label="Change owner"><span class="dd-ie-v">${o ? esc(o.name) : '<span class="muted">Unassigned</span>'}</span>${icon('chevron-down', 'ic-sm')}</button>`)}
        ${row('Created', `<span>${esc(fmtDate(d.created_at))}</span>`)}
        ${row('Updated', `<span>${esc(agoDays(d.updated_at || d.created_at))}</span>`)}
        ${custom}
      </dl></div></section>`;
  }
  function personCard({ title, c, kind, emptyTitle, emptyText, addLabel }) {
    const head = `<div class="card-header"><h2 class="card-title">${title}</h2><button class="iconbtn" style="width:28px;height:28px" data-act="${kind}-menu" aria-label="${c ? 'Change ' : 'Add '}${title.toLowerCase()}" aria-haspopup="menu">${icon('ellipsis')}</button></div>`;
    if (!c) return `<section class="card" aria-label="${title}">${head}${dvEmpty(kind === 'contact' ? 'users' : 'truck', emptyTitle, emptyText, `<button class="btn btn-secondary btn-sm" data-act="${kind}-menu">${icon('plus')}${addLabel}</button>`)}</section>`;
    return `<section class="card" aria-label="${title}">${head}<div class="card-body">
      <div class="dd-person">${avatar(c.name, 'lg')}<div class="grow" style="min-width:0"><a class="dd-pname truncate" style="display:block" href="#" data-act="open-contact" data-id="${c.id}">${esc(c.name)}</a><div class="muted truncate">${esc(c.company || '')}</div></div></div>
      <div class="dd-lines">${c.email ? `<div>${icon('mail')}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}${c.phone ? `<div>${icon('phone')}<a href="tel:${esc(dvDigits(c.phone))}">${esc(c.phone)}</a></div>` : ''}
        ${c.assigned_to_name ? `<div>${icon('users')}<span>${esc(c.assigned_to_name)}</span></div>` : ''}</div></div>
      <div class="card-footer"><button class="btn btn-secondary btn-sm" data-act="open-contact" data-id="${c.id}">Open ${kind === 'contact' ? 'contact' : esc(dvSupplierWord().toLowerCase())}${icon('chevron-right', 'ic-sm')}</button></div></section>`;
  }
  function listingCard() {
    const ls = S.d.objects || [], word = dvObjectWord(ls.length);
    const available = objects.filter(o => !ls.some(l => l.id === o.id));
    return `<section class="card" aria-label="${esc(word)}"><div class="card-header"><h2 class="card-title">${esc(dvObjectWord(2))}</h2><button class="btn btn-ghost btn-sm" data-act="object-add" aria-haspopup="menu" ${available.length ? '' : 'disabled'}>${icon('plus')}Add</button></div>
      ${ls.length ? `<div class="card-body">${ls.map(l => { const rows = objectFields.filter(f => l.custom_data?.[f.field_key]).slice(0, 3); return `<div class="dd-lst"><div class="row-between" style="align-items:flex-start"><a class="dd-lst-name" href="#" data-act="open-object" data-id="${l.id}">${esc(l.name)}</a><button class="iconbtn dd-ibtn" data-act="object-rm" data-id="${l.id}" aria-label="Unlink ${esc(l.name)}">${icon('x')}</button></div>
        ${rows.length ? `<div class="dd-stat">${rows.map(f => `<div>${esc(f.name)}<b>${esc(String(l.custom_data[f.field_key]))}</b></div>`).join('')}</div>` : ''}</div>`; }).join('')}</div>`
        : dvEmpty('building', `No ${esc(dvObjectWord(2).toLowerCase())} linked`, available.length ? `Link a ${esc(dvObjectWord(1).toLowerCase())} to keep it with this deal.` : `Add ${esc(dvObjectWord(2).toLowerCase())} on the ${esc(dvObjectWord(2))} page first.`)}</section>`;
  }
  function sideHtml() {
    return detailsCard()
      + personCard({ title: 'Contact', c: contactOf(), kind: 'contact', emptyTitle: 'No contact linked', emptyText: 'Link a contact to call, email or message them from this deal.', addLabel: 'Add contact' })
      + personCard({ title: dvSupplierWord(), c: supplierOf(), kind: 'supplier', emptyTitle: `No ${dvSupplierWord().toLowerCase()} linked`, emptyText: 'Notary, appraiser or financing partner for this deal.', addLabel: `Add ${dvSupplierWord().toLowerCase()}` })
      + listingCard();
  }

  /* ----- rendering ----- */
  const m = ui.modal({ title: 'Deal', size: 'xl', body: `<div class="dd" id="dd-root"><div id="dd-top"></div><section class="card dd-head" id="dd-head" aria-label="Deal summary"></section>
      <div class="split split-2-1"><section class="card dd-main" id="dd-main"></section><div class="dd-side" id="dd-side"></div></div></div>`,
    onClose: () => { if (dvDeal === inst) dvDeal = null; } });
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
    title: { label: 'Title', size: 'title', get: () => S.d.title, parse: v => { v = v.trim(); return !v ? { error: 'Enter a deal title.' } : v.length > 140 ? { error: 'Use at most 140 characters.' } : { v }; }, patch: v => ({ title: v }), msg: 'Title updated' },
    value: { label: 'Value', type: 'number', size: 'kpi', get: () => S.d.value == null ? '' : S.d.value, parse: v => { if (String(v).trim() === '') return { v: null }; const n = Number(v); return !isFinite(n) || n < 0 ? { error: 'Use 0 or more.' } : { v: Math.round(n * 100) / 100 }; }, patch: v => ({ value: v }), msg: 'Value updated' },
  };
  function startEdit(btn) {
    const key = btn.dataset.ie;
    if (key === 'urgency') return ui.select(btn, DEAL_URGENCY.map(u => ({ value: u.value, label: urgencyLabel(u) })), parseInt(S.d.urgency, 10) || 0, async v => {
      const prev = S.d.urgency; S.d.urgency = v; render();
      const res = await api.patch(`/api/deals/${S.d.id}/urgency`, { urgency: v }); if (res?.error) { S.d.urgency = prev; render(); return ui.toast(res.error); }
      const row = deals.find(x => x.id === S.d.id); if (row) row.urgency = v; dvRefreshDeals(); ui.toast('Urgency updated');
    });
    if (key === 'pipeline') return ui.select(btn, pipelines.map(p => ({ value: p.id, label: p.name })), S.d.pipeline_id, v => { if (v === S.d.pipeline_id) return; const p = pipelines.find(x => x.id === v), s0 = p?.stages?.[0]; commit({ pipeline_id: v, stage_id: s0?.id || null }, `Moved to ${p?.name}, stage reset to ${s0?.name || 'none'}`, { stage_name: s0?.name || null, stage_color: s0?.color || null }); });
    if (key.startsWith('cf:')) {
      const fk = key.slice(3), f = dealFields.find(x => x.field_key === fk), cur = S.d.custom_data?.[fk] ?? '';
      const save = v => { if (v === null || v === cur) return render(); commit({ custom_data: { ...(S.d.custom_data || {}), [fk]: v } }, `${f?.name || 'Field'} updated`); };
      if (f?.type === 'dropdown') return ui.select(btn, [{ value: '', label: 'Not set' }, ...(f.options || []).map(o => ({ value: o, label: o }))], cur, save);
      const typeMap = { email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' };
      return dvInlineEdit(btn, { value: cur, type: typeMap[f?.type] || 'text', label: f?.name || 'Field', onSave: save });
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
    if (!text) { S.textErr = 'Add a short description before saving.'; render('main'); const ta = R('#dd-compose-text'); ta && ta.focus(); return; }
    const res = await api.post('/api/activities', { contact_id: c.id, type: S.type, content: esc(text).replace(/\n/g, '<br>') });
    if (res?.error) return ui.toast(res.error);
    S.text = ''; S.textErr = ''; await loadActs(); render('head main');
    ui.toast(`${ty.label} logged`); const ta = R('#dd-compose-text'); ta && ta.focus();
  }
  async function delAct(aid) {
    const ok = await ui.confirm({ title: 'Delete this entry?', message: 'The entry is removed from the activity history of this deal.', confirmLabel: 'Delete', danger: true }); if (!ok) return;
    const res = await api.del(`/api/activities/${aid}`); if (res?.error) return ui.toast(res.error);
    await loadActs(); render('head main'); ui.toast('Entry deleted');
  }
  async function del() {
    const ok = await ui.confirm({ title: 'Delete this deal?', message: 'The deal will be removed from all pipelines. Linked activities and tasks stay in the workspace.', confirmLabel: 'Delete deal', danger: true }); if (!ok) return;
    const res = await api.del(`/api/deals/${S.d.id}`); if (res?.error) return ui.toast(res.error);
    S.gone = true; deals = deals.filter(x => x.id !== S.d.id); dvRefreshDeals(); m.close(); ui.toast('Deal deleted');
  }
  async function duplicate() {
    const res = await api.post('/api/deals', payload({ title: S.d.title + ' (copy)' })); if (res?.error) return ui.toast(res.error);
    if (typeof loadDeals === 'function' && document.getElementById('page-deals')?.classList.contains('active')) await loadDeals();
    ui.toast('Deal duplicated', { action: { label: 'Open', onClick: () => openDealDetail(res.id) } });
  }
  function moreMenu(anchor) {
    ui.menu(anchor, [
      { label: 'Edit deal', icon: 'pencil', onSelect: () => openDealForm({ deal: S.d, onSave: () => reload() }) },
      { label: 'Duplicate', icon: 'copy', onSelect: duplicate }, { sep: true },
      { label: 'Delete deal', icon: 'trash', danger: true, onSelect: del }], { align: 'right' });
  }
  function linkMenu(anchor, kind) {
    const list = kind === 'contact' ? S.contacts : S.suppliers, field = kind === 'contact' ? 'contact_id' : 'supplier_id', cur = S.d[field];
    const word = kind === 'contact' ? 'contact' : dvSupplierWord().toLowerCase();
    const set = async v => { const ok = await commit({ [field]: v }, null, kind === 'contact' ? { contact_name: list.find(c => c.id === v)?.name || null, contact_company: list.find(c => c.id === v)?.company || null } : {}); if (!ok) return; if (kind === 'contact') { await loadActs(); render(); } ui.toast(v ? `${kind === 'contact' ? 'Contact' : dvSupplierWord()} set to ${list.find(c => c.id === v)?.name}` : `${kind === 'contact' ? 'Contact' : dvSupplierWord()} removed`); };
    ui.menu(anchor, [{ heading: cur ? `Change ${word}` : `Add ${word}` }, ...list.map(c => ({ label: c.company ? `${c.name}, ${c.company}` : c.name, checked: c.id === cur, onSelect: () => set(c.id) })),
      ...(cur ? [{ sep: true }, { label: `Remove ${word}`, icon: 'x', danger: true, onSelect: () => set(null) }] : [])], { align: 'right' });
  }
  async function reload() { const fresh = await api.get(`/api/deals/${S.d.id}`); if (fresh && !fresh.error) { S.d = fresh; await loadActs(); render(); } }
  async function submitTask() {
    const x = S.task, title = x.title.trim();
    if (!title) { S.taskErr = 'Enter a task title.'; render('main'); R('#dd-task-title')?.focus(); return; }
    const res = await api.post('/api/tasks', { title, status: dvFirstKey(), priority: x.priority, due_date: x.due_date || null, due_time: x.due_time || null, assigned_to: x.assigned_to || null, deal_id: S.d.id, contact_id: S.d.contact_id || null });
    if (res?.error) return ui.toast(res.error);
    S.addTask = false; S.taskErr = ''; S.task = { title: '', due_date: '', due_time: '', priority: 'medium', assigned_to: currentUser?.id || '' };
    S.tasks = (await dvAllTasks()).filter(t2 => t2.deal_id === S.d.id && !t2.parent_id); dvRefreshTasks(); render('main'); ui.toast('Task added');
  }

  const A = {
    tab: el => setTab(el.dataset.tab), goto: el => setTab(el.dataset.tab), 'goto-task': () => { setTab('tasks'); S.addTask = true; render('main'); R('#dd-task-title')?.focus(); },
    stage: el => move(+el.dataset.stage),
    'stage-menu': el => ui.select(el, pipe().stages.map(s => ({ value: s.id, label: s.name })), S.d.stage_id, move),
    owner: el => ui.select(el, [{ value: null, label: 'Unassigned' }, ...members.map(x => ({ value: x.id, label: x.name }))], S.d.assigned_to, v => { if (v === S.d.assigned_to) return; commit({ assigned_to: v }, 'Owner updated', { assigned_to_name: members.find(x => x.id === v)?.name || null }); }),
    qa: el => quick(el.dataset.type), more: el => moreMenu(el),
    ctype: el => { S.type = el.dataset.type; S.textErr = ''; render('main'); R(`[data-act="ctype"][data-type="${S.type}"]`)?.focus(); },
    tlfilter: el => ui.select(el, [{ value: null, label: 'All types' }, ...DV_ACT_TYPES.map(x => ({ value: x.id, label: x.label, icon: x.icon }))], S.filter, v => { S.filter = v; render('main'); }),
    tlclear: () => { S.filter = null; render('main'); },
    'act-edit': el => { const a = S.acts.find(x => x.id === +el.dataset.id); if (!a) return; S.editAct = a.id; S.editText = dvActText(a.content); render('main'); const ta = R('#dd-act-edit'); if (ta) { dvAutoGrow(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } },
    'act-cancel': () => { S.editAct = null; render('main'); },
    'act-save': async el => { const ta = R('#dd-act-edit'), v = ta.value.trim(); if (!v) { ta.setAttribute('aria-invalid', 'true'); ta.focus(); return; } const res = await api.patch(`/api/activities/${+el.dataset.id}`, { content: esc(v).replace(/\n/g, '<br>') }); if (res?.error) return ui.toast(res.error); S.editAct = null; await loadActs(); render('main'); ui.toast('Entry updated'); },
    'act-del': el => delAct(+el.dataset.id),
    'task-add': () => { S.addTask = true; S.taskErr = ''; render('main'); R('#dd-task-title')?.focus(); },
    'task-cancel': () => { S.addTask = false; S.taskErr = ''; render('main'); },
    'open-task': el => openTaskDrawer(+el.dataset.id, { onChange: async () => { S.tasks = (await dvAllTasks()).filter(t2 => t2.deal_id === S.d.id && !t2.parent_id); render('main'); } }),
    'contact-menu': el => linkMenu(el, 'contact'), 'supplier-menu': el => linkMenu(el, 'supplier'),
    'open-contact': el => { m.close(); openContactDetail(+el.dataset.id); },
    'open-object': el => { m.close(); if (typeof openObjectDetail === 'function') openObjectDetail(+el.dataset.id); },
    'object-add': el => { const available = objects.filter(o => !(S.d.objects || []).some(l => l.id === o.id)); ui.select(el, available.map(o => ({ value: o.id, label: o.name })), null, async v => { const res = await api.post(`/api/deals/${S.d.id}/objects`, { object_id: v }); if (res?.error) return ui.toast(res.error); S.d.objects = await api.get(`/api/deals/${S.d.id}/objects`); render('side'); ui.toast(`${dvObjectWord(1)} linked`); }); },
    'object-rm': async el => { const res = await api.del(`/api/deals/${S.d.id}/objects/${+el.dataset.id}`); if (res?.error) return ui.toast(res.error); S.d.objects = await api.get(`/api/deals/${S.d.id}/objects`); render('side'); ui.toast(`${dvObjectWord(1)} unlinked`); },
    'edit-full': () => openDealForm({ deal: S.d, onSave: () => reload() }),
  };
  on(root, 'click', '[data-act]', (e, el) => { const fn = A[el.dataset.act]; if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el); } });
  on(root, 'click', '[data-ie]', (e, el) => startEdit(el));
  on(root, 'change', '[data-toggle]', async (e, el) => {
    const x = S.tasks.find(y => y.id === +el.dataset.toggle), prev = x.status, to = el.checked ? dvDoneKey() : dvFirstKey();
    x.status = to; render('main');
    const res = await api.patch(`/api/tasks/${x.id}/status`, { status: to }); if (res?.error) { x.status = prev; render('main'); return ui.toast(res.error); }
    const row = tasks.find(y => y.id === x.id); if (row) row.status = to; dvRefreshTasks();
    ui.toast(to === dvDoneKey() ? 'Task completed' : 'Task reopened');
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
  on(root, 'input', '#dd-taskform [name]', (e, el) => { S.task[el.name] = el.value; if (el.name === 'title' && S.taskErr) { S.taskErr = ''; el.removeAttribute('aria-invalid'); } });
  on(root, 'change', '#dd-taskform [name]', (e, el) => { S.task[el.name] = el.value; });
  on(root, 'submit', '#dd-compose', e => { e.preventDefault(); submitCompose(); });
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
  const [c, contactDeals, allTasks] = await Promise.all([api.get(`/api/contacts/${id}`), api.get(`/api/deals?contact_id=${id}`), dvAllTasks()]);
  if (!c || c.error) { ui.toast('That contact no longer exists.'); return; }
  if (!pipelines.length) pipelines = await api.get('/api/pipelines');
  const sup = c.contact_type === 'supplier', one = sup ? dvSupplierWord().toLowerCase() : 'contact', plural = sup ? (currentWorkspace?.supplier_name || 'Suppliers') : 'Contacts';
  const S = { c, deals: Array.isArray(contactDeals) ? contactDeals : [], tasks: allTasks.filter(x => x.contact_id === id && !x.parent_id), tab: 'overview', draft: { type: 'note', text: '', err: false, filter: 'all' }, editAct: null, editText: '' };
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
    const v = key.startsWith('cf:') ? S.c.custom_data?.[key.slice(3)] : S.c[key], shown = v ? esc(String(v)) : '<span class="muted">Not set</span>';
    const ext = key === 'email' && v ? `<a class="ct-ext" href="mailto:${esc(v)}" aria-label="Email ${esc(S.c.name)}" title="Send email">${icon('mail')}</a>` : key === 'phone' && tel() ? `<a class="ct-ext" href="${esc(tel())}" aria-label="Call ${esc(S.c.name)}" title="Call">${icon('phone')}</a>` : '';
    return `<div class="ct-f"><dt>${esc(lbl)}</dt><dd><button class="ct-edit" data-edit="${esc(key)}" title="Click to edit"><span>${shown}</span>${icon('pencil', 'ic-sm')}</button>${ext}</dd></div>`;
  };
  const actItem = a => {
    const ty = dvTypeOf(a.type), editing = S.editAct === a.id;
    return `<div class="tl-item" data-aid="${a.id}"><span class="tl-ic ${a.type}">${icon(ty.icon)}</span><div class="dd-tl-main"><div class="tl-head"><b>${ty.label}</b><span class="muted" style="font-size:var(--fs-sm)">${a.logged_by_name ? 'by ' + esc(a.logged_by_name) : ''}</span><span class="muted" style="margin-left:auto;font-size:var(--fs-sm)" title="${esc(dvWhen(a.created_at))}">${esc(dvAgoHours(a.created_at))}</span>
      <span class="dd-tl-actions"><button class="iconbtn dd-ibtn" data-act="act-edit" data-id="${a.id}" aria-label="${esc(t('edit_entry'))}">${icon('pencil')}</button><button class="iconbtn dd-ibtn" data-act="act-del" data-id="${a.id}" aria-label="${esc(t('delete_entry'))}">${icon('trash')}</button></span></div>
      ${editing ? `<div class="dd-editor"><textarea class="textarea dv-grow" id="ct-aedit" rows="3" aria-label="${esc(t('edit_entry'))}">${esc(S.editText)}</textarea>
          <div class="row-between"><span class="help">${esc(t('enter_saves_esc_cancels'))}</span><span class="row"><button class="btn btn-secondary btn-sm" type="button" data-act="act-cancel">${esc(t('btn_cancel'))}</button><button class="btn btn-primary btn-sm" type="button" data-act="act-save">${esc(t('btn_save'))}</button></span></div></div>`
        : `<div class="tl-text dd-pre" data-note="${a.id}" title="${esc(t('click_to_edit'))}">${dvActHtml(a.content)}</div>`}</div></div>`;
  };
  const taskRow = x => { const done = x.status === dvDoneKey(), pr = DV_PRIO[x.priority] || DV_PRIO.medium, late = taskIsOverdue(x, done);
    return `<li class="list-item"><label class="check round"><input type="checkbox" data-task-toggle="${x.id}" aria-label="Mark ${esc(x.title)} as ${done ? 'not done' : 'done'}" ${done ? 'checked' : ''}></label>
      <div class="grow"><a class="ct-task-title ${done ? 'done' : ''}" href="#" data-act="open-task" data-id="${x.id}">${esc(x.title)}</a>${x.deal_title ? `<div class="muted truncate" style="font-size:var(--fs-sm)">${esc(x.deal_title)}</div>` : ''}</div>
      ${done ? '<span class="badge badge-success">Done</span>' : late ? `<span class="badge badge-danger">${esc(dvDue(x.due_date, x.due_time))}</span>` : `<span class="muted" style="font-size:var(--fs-sm);white-space:nowrap">${esc(dvDue(x.due_date, x.due_time))}</span>`}
      <span class="badge ${pr[1] ? 'badge-' + pr[1] : ''}">${pr[0]}</span>${x.assigned_to_name ? avatar(x.assigned_to_name, 'sm') : ''}</li>`; };
  function overviewPanel() {
    const a = acts().slice(0, 3), open = S.tasks.filter(x => x.status !== dvDoneKey()).slice(0, 3);
    return `<div class="ct-sec"><div class="ct-sec-head"><div class="section-title">${esc(sup ? dvSupplierWord() : 'Contact')} information</div><span class="help">Click a value to edit, Enter saves, Esc cancels</span></div>
      <dl class="ct-fgrid">${editable('name', 'Full name')}${editable('company', 'Company')}${editable('email', 'Email')}${editable('phone', 'Phone')}${fields.map(f => editable('cf:' + f.field_key, f.name)).join('')}
        <div class="ct-f"><dt>Owner</dt><dd><button class="ct-edit" data-edit="owner" aria-haspopup="menu" title="Change owner"><span class="row" style="gap:8px">${S.c.assigned_to_name ? avatar(S.c.assigned_to_name, 'sm') + esc(S.c.assigned_to_name) : '<span class="muted">Unassigned</span>'}</span>${icon('chevron-down', 'ic-sm')}</button></dd></div></dl></div>
      <div class="ct-sec"><div class="ct-sec-head"><div class="section-title">Latest activity</div>${a.length ? `<button class="btn btn-ghost btn-sm" data-act="tab" data-tab="activity">View all</button>` : ''}</div>
        ${a.length ? `<div class="timeline">${a.map(actItem).join('')}</div>` : `<div class="muted">No activity logged yet. <button class="btn btn-ghost btn-sm" data-act="tab" data-tab="activity" style="height:auto;padding:0 2px;color:var(--link)">Log the first interaction</button></div>`}</div>
      <div class="ct-sec"><div class="ct-sec-head"><div class="section-title">Open tasks</div>${open.length ? `<button class="btn btn-ghost btn-sm" data-act="tab" data-tab="tasks">View all</button>` : ''}</div>
        ${open.length ? `<ul class="list" style="margin:0 -18px">${open.map(taskRow).join('')}</ul>` : `<div class="muted">No open tasks for this ${esc(one)}.</div>`}</div>`;
  }
  function activityPanel() {
    const d = S.draft, all = acts(), list = d.filter === 'all' ? all : all.filter(a => a.type === d.filter);
    return `<form class="ct-compose" id="ct-compose" novalidate aria-label="Log an activity">
        <div class="seg" role="group" aria-label="Activity type">${DV_ACT_TYPES.map(x => `<button type="button" data-atype="${x.id}" aria-pressed="${d.type === x.id}">${icon(x.icon, 'ic-sm')}${x.label}</button>`).join('')}</div>
        <div class="field"><textarea class="textarea" id="ct-atext" aria-label="Activity details" placeholder="${d.type === 'note' ? 'Write a note about ' + esc(S.c.name.split(' ')[0]) + '...' : 'What was discussed or agreed?'}" ${d.err ? 'aria-invalid="true"' : ''}>${esc(d.text)}</textarea><div class="error-text" id="ct-aerr" ${d.err ? '' : 'hidden'}>Enter a short description before logging.</div></div>
        <div class="ct-compose-foot"><span class="help">Press Ctrl+Enter to save.</span><button class="btn btn-primary btn-sm" type="submit">Log ${esc(dvTypeOf(d.type).label.toLowerCase())}</button></div></form>
      <div class="ct-tl-head"><div class="section-title" style="margin:0">Activity timeline</div><select class="select select-sm" id="ct-afilter" aria-label="Filter activity">${[['all', 'All types'], ...DV_ACT_TYPES.map(x => [x.id, x.label + 's'])].map(o => `<option value="${o[0]}" ${d.filter === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
      ${list.length ? `<div class="timeline">${list.map(actItem).join('')}</div>` : dvEmpty('activity', all.length ? 'No activity of this type' : 'No activity yet', all.length ? 'Choose another type above.' : 'Log a note, call or email to start the timeline.')}`;
  }
  function dealsPanel() {
    const ds = [...S.deals].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    return `<div class="row-between" style="padding:14px 18px;border-bottom:1px solid var(--divider)"><span class="muted">${dvPlural(ds.length, 'deal', 'deals')}</span><button class="btn btn-secondary btn-sm" data-act="add-deal">${icon('plus')}Add deal</button></div>
      ${ds.length ? `<div style="overflow:auto"><table class="table"><thead><tr><th>Deal</th><th>Stage</th><th class="num-col">Value</th><th>Owner</th></tr></thead><tbody>
        ${ds.map(d => { const st = stageOfDeal(d); return `<tr class="clickable" data-act="open-deal" data-id="${d.id}"><td style="max-width:280px"><a class="ct-name truncate" style="display:block" href="#" data-act="open-deal" data-id="${d.id}">${esc(d.title)}</a></td><td>${st ? `<span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span>` : '<span class="muted">Not set</span>'}</td><td class="num-col tnum strong">${d.value != null ? fmtEUR(d.value) : '<span class="muted">—</span>'}</td><td>${d.assigned_to_name ? `<div class="row" style="gap:8px">${avatar(d.assigned_to_name, 'sm')}<span>${esc(d.assigned_to_name.split(' ')[0])}</span></div>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>
        <div class="card-footer row-between"><span class="muted">${dvPlural(ds.length, 'deal', 'deals')}</span><span class="tnum">Total value <b>${fmtEUR(sumVal(ds))}</b></span></div>`
      : dvEmpty('deals', 'No deals yet', `Deals linked to this ${one} will show up here.`, `<button class="btn btn-secondary" data-act="add-deal">${icon('plus')}Add deal</button>`)}`;
  }
  function tasksPanel() {
    const ts = S.tasks, open = ts.filter(x => x.status !== dvDoneKey()).length;
    return `<div class="row-between" style="padding:14px 18px;border-bottom:1px solid var(--divider)"><span class="muted">${dvPlural(ts.length, 'task', 'tasks')}, ${open} open</span><button class="btn btn-secondary btn-sm" data-act="add-task">${icon('plus')}Add task</button></div>
      ${ts.length ? `<ul class="list">${ts.map(taskRow).join('')}</ul>` : dvEmpty('check-square', 'No tasks yet', `Tasks linked to this ${one} will show up here.`, `<button class="btn btn-secondary" data-act="add-task">${icon('plus')}Add task</button>`)}`;
  }
  function sideCards() {
    const ds = S.deals, last = acts()[0]?.created_at;
    return `<div class="ct-side">
      <section class="card" aria-label="Details"><div class="card-header"><h2 class="card-title">Details</h2></div><div class="card-body"><dl class="kv" style="margin:0">
        <dt>Owner</dt><dd>${S.c.assigned_to_name ? `<div class="row" style="gap:8px">${avatar(S.c.assigned_to_name, 'sm')}<span>${esc(S.c.assigned_to_name)}</span></div>` : '<span class="muted">Unassigned</span>'}</dd>
        <dt>Created</dt><dd>${esc(fmtDate(S.c.created_at))}</dd><dt>Last contact</dt><dd>${esc(last ? agoDays(last) : 'Never')}</dd></dl></div></section>
      <section class="card" aria-label="Deals"><div class="card-header"><h2 class="card-title">Deals</h2>${ds.length ? `<button class="btn btn-ghost btn-sm" data-act="tab" data-tab="deals">View all</button>` : ''}</div>
        <div class="card-body" style="padding-bottom:${ds.length ? 8 : 18}px"><div class="ct-big">${fmtEUR(sumVal(ds))}</div><div class="muted" style="margin:2px 0 ${ds.length ? 10 : 0}px">${ds.length ? dvPlural(ds.length, 'deal', 'deals') + ' in total' : 'No deals'}</div>
          ${ds.slice(0, 3).map(d => { const st = stageOfDeal(d); return `<div class="ct-mini clickable" data-act="open-deal" data-id="${d.id}"><div class="grow"><a class="ct-name truncate" style="display:block" href="#" data-act="open-deal" data-id="${d.id}">${esc(d.title)}</a>${st ? `<div style="margin-top:4px"><span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span></div>` : ''}</div><span class="tnum strong" style="font-weight:650">${d.value != null ? fmtEURShort(d.value) : ''}</span></div>`; }).join('')}
          ${ds.length > 3 ? `<div class="ct-mini"><button class="btn btn-ghost btn-sm" data-act="tab" data-tab="deals" style="margin-left:-10px">+ ${ds.length - 3} more</button></div>` : ''}</div></section></div>`;
  }
  function detailHtml() {
    const counts = { activity: acts().length, deals: S.deals.length, tasks: S.tasks.filter(x => x.status !== dvDoneKey()).length }, tabLbl = { overview: 'Overview', activity: 'Activity', deals: 'Deals', tasks: 'Tasks' };
    const panel = { overview: overviewPanel, activity: activityPanel, deals: dealsPanel, tasks: tasksPanel }[S.tab]();
    const last = acts()[0]?.created_at, t = tel(), w = wa();
    return `<div class="ct-detail">
      <div class="page-header ct-head"><div class="ct-id">${avatar(S.c.name, 'xl')}<div style="min-width:0"><h1 class="page-title">${esc(S.c.name)}</h1>
          <div class="ct-meta">${S.c.company ? `<span>${icon('building', 'ic-sm')}${esc(S.c.company)}</span>` : ''}<span>${icon('clock', 'ic-sm')}Last contact: ${esc(last ? agoDays(last).toLowerCase() : 'never')}</span></div></div></div>
        <div class="page-actions">${t ? `<a class="btn btn-secondary" href="${esc(t)}">${icon('phone')}Call</a>` : `<button class="btn btn-secondary" disabled title="No phone number on file">${icon('phone')}Call</button>`}
          ${S.c.email ? `<a class="btn btn-secondary" href="mailto:${esc(S.c.email)}">${icon('mail')}Email</a>` : `<button class="btn btn-secondary" disabled title="No email address on file">${icon('mail')}Email</button>`}
          ${w ? `<a class="btn btn-secondary" href="${esc(w)}" target="_blank" rel="noopener">${icon('message-circle')}WhatsApp</a>` : `<button class="btn btn-secondary" disabled title="No phone number on file">${icon('message-circle')}WhatsApp</button>`}
          <button class="btn btn-secondary" data-act="edit-all">${icon('pencil')}Edit</button>
          <button class="btn btn-secondary btn-icon" data-act="more" aria-label="More actions" aria-haspopup="menu">${icon('ellipsis')}</button></div></div>
      <div class="split split-2-1 ct-split"><section class="card" style="align-self:start"><div class="tabs" role="tablist" aria-label="${esc(S.c.name)}" style="padding:0 8px">
          ${Object.keys(tabLbl).map(k => `<button class="tab" role="tab" data-act="tab" data-tab="${k}" aria-selected="${S.tab === k}" tabindex="${S.tab === k ? 0 : -1}">${tabLbl[k]}${counts[k] ? `<span class="badge">${counts[k]}</span>` : ''}</button>`).join('')}</div>
        <div role="tabpanel" class="${S.tab === 'deals' || S.tab === 'tasks' ? '' : 'ct-panel'}">${panel}</div></section>${sideCards()}</div></div>`;
  }

  /* ----- host: side panel on the Contacts/Suppliers page, pop window elsewhere ----- */
  const activePage = document.querySelector('.sb-link[aria-current="page"]')?.dataset.page;
  const usePanel = !opts.modal && (activePage === 'contacts' || activePage === 'suppliers') && document.getElementById('contact-side-panel');
  let host, modal = null;
  if (usePanel) {
    document.querySelectorAll('#contacts-body tr.side-panel-active').forEach(r => r.classList.remove('side-panel-active'));
    document.querySelector(`#contacts-body [onclick="openDetail(${id})"]`)?.closest('tr')?.classList.add('side-panel-active');
    document.getElementById('side-panel-name').textContent = sup ? dvSupplierWord() : 'Contact';
    host = document.getElementById('side-panel-body'); host.innerHTML = ''; host.scrollTop = 0;
    document.getElementById('contact-side-panel').classList.remove('hidden');
  } else {
    modal = ui.modal({ title: sup ? dvSupplierWord() : 'Contact', size: 'xl', body: '<div></div>' });
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
    if (key === 'owner') return ui.select(btn, [{ value: null, label: 'Unassigned' }, ...members.map(x => ({ value: x.id, label: x.name }))], S.c.assigned_to, v => { if (v !== S.c.assigned_to) commit({ assigned_to: v }, 'Owner updated'); });
    const isCf = key.startsWith('cf:'), fk = isCf ? key.slice(3) : null, f = isCf ? fields.find(x => x.field_key === fk) : null, cur = isCf ? (S.c.custom_data?.[fk] ?? '') : (S.c[key] || '');
    const lbl = isCf ? f?.name : { name: 'Name', company: 'Company', email: 'Email', phone: 'Phone' }[key];
    if (f?.type === 'dropdown') return ui.select(btn, [{ value: '', label: 'Not set' }, ...(f.options || []).map(o => ({ value: o, label: o }))], cur, v => { if (v !== cur) commit({ custom_data: { ...(S.c.custom_data || {}), [fk]: v } }, `${lbl} updated`); });
    const type = key === 'email' ? 'email' : key === 'phone' ? 'tel' : ({ email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' })[f?.type] || 'text';
    const orig = dd.innerHTML;
    dd.innerHTML = `<div class="ct-fedit"><input class="input input-sm" type="${type}" value="${esc(cur)}" aria-label="${esc(lbl)}" autocomplete="off"><div class="error-text" role="alert" hidden></div></div>`;
    const inp = dd.querySelector('input'), err = dd.querySelector('.error-text'); let done = false; inp.focus(); inp.select();
    const finish = (save, strict) => {
      if (done) return; const v = inp.value.trim();
      if (!save || v === String(cur)) { done = true; dd.innerHTML = orig; return; }
      if (key === 'name' && !v) { if (strict) { inp.setAttribute('aria-invalid', 'true'); err.textContent = 'Enter a name.'; err.hidden = false; return; } done = true; dd.innerHTML = orig; return; }
      if (key === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { if (strict) { inp.setAttribute('aria-invalid', 'true'); err.textContent = 'Enter a valid email address.'; err.hidden = false; return; } done = true; dd.innerHTML = orig; ui.toast('Not saved. Enter a valid email address.'); return; }
      done = true; commit(isCf ? { custom_data: { ...(S.c.custom_data || {}), [fk]: v } } : { [key]: v }, `${lbl} updated`);
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true, true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
    inp.addEventListener('input', () => { inp.removeAttribute('aria-invalid'); err.hidden = true; });
    inp.addEventListener('blur', () => finish(true, false));
  }
  async function logActivity() {
    const d = S.draft, text = d.text.trim();
    if (!text) { d.err = true; render(); host.querySelector('#ct-atext')?.focus(); return; }
    const res = await api.post('/api/activities', { contact_id: id, type: d.type, content: esc(text).replace(/\n/g, '<br>') }); if (res?.error) return ui.toast(res.error);
    d.text = ''; d.err = false; const fresh = await api.get(`/api/contacts/${id}`); if (fresh && !fresh.error) S.c = fresh; render(); host.querySelector('#ct-atext')?.focus(); ui.toast(`${dvTypeOf(d.type).label} logged`);
  }
  const A = {
    tab: el => { S.tab = el.dataset.tab; render(); host.querySelector(`[data-tab="${S.tab}"]`)?.focus(); },
    'edit-all': () => { if (typeof openContactModal === 'function') { currentContactType = S.c.contact_type || 'contact'; openContactModal(id); } },
    more: el => ui.menu(el, [
      { label: 'Copy email', icon: 'copy', onSelect: () => S.c.email ? navigator.clipboard.writeText(S.c.email).then(() => ui.toast('Email copied')) : ui.toast('No email address on file.') },
      { label: 'Copy phone', icon: 'copy', onSelect: () => S.c.phone ? navigator.clipboard.writeText(S.c.phone).then(() => ui.toast('Phone number copied')) : ui.toast('No phone number on file.') }, { sep: true },
      { label: `Delete ${one}`, icon: 'trash', danger: true, onSelect: async () => { const ok = await ui.confirm({ title: `Delete this ${one}?`, message: 'Their activities are deleted with them. This cannot be undone.', confirmLabel: 'Delete', danger: true }); if (!ok) return; const res = await api.del(`/api/contacts/${id}`); if (res?.error) return ui.toast(res.error); close(); invalidate(); if (typeof loadContacts === 'function' && document.getElementById('page-contacts')?.classList.contains('active')) loadContacts(); ui.toast(`${one[0].toUpperCase() + one.slice(1)} deleted`); } }], { align: 'right' }),
    'add-deal': () => openDealForm({ contactId: id, onSave: async () => { S.deals = await api.get(`/api/deals?contact_id=${id}`) || []; render(); } }),
    'add-task': () => openTaskForm({ contactId: id, contactName: S.c.name, onSave: async () => { S.tasks = (await dvAllTasks()).filter(x => x.contact_id === id && !x.parent_id); render(); } }),
    'open-deal': el => { close(); openDealDetail(+el.dataset.id); },
    'open-task': el => openTaskDrawer(+el.dataset.id, { onChange: async () => { S.tasks = (await dvAllTasks()).filter(x => x.contact_id === id && !x.parent_id); render(); } }),
    'act-del': async el => { const ok = await ui.confirm({ title: 'Delete this entry?', message: 'The entry is removed from the activity history.', confirmLabel: 'Delete', danger: true }); if (!ok) return; const res = await api.del(`/api/activities/${+el.dataset.id}`); if (res?.error) return ui.toast(res.error); const fresh = await api.get(`/api/contacts/${id}`); if (fresh && !fresh.error) S.c = fresh; render(); ui.toast('Entry deleted'); },
    'act-edit': el => startNoteEdit(+el.dataset.id),
    'act-cancel': () => { S.editAct = null; S.editText = ''; render(); },
    'act-save': () => saveNoteEdit(),
  };
  offs.push(on(host, 'click', '[data-act]', (e, el) => { const fn = A[el.dataset.act]; if (fn) { if (el.tagName === 'A') e.preventDefault(); e.stopPropagation(); fn(el); } }));
  offs.push(on(host, 'click', '[data-edit]', (e, el) => startEdit(el, el.dataset.edit)));
  offs.push(on(host, 'change', '[data-task-toggle]', async (e, el) => { const x = S.tasks.find(y => y.id === +el.dataset.taskToggle), prev = x.status, to = el.checked ? dvDoneKey() : dvFirstKey(); x.status = to; render(); const res = await api.patch(`/api/tasks/${x.id}/status`, { status: to }); if (res?.error) { x.status = prev; render(); return ui.toast(res.error); } const row = tasks.find(y => y.id === x.id); if (row) row.status = to; dvRefreshTasks(); ui.toast(el.checked ? 'Task completed' : 'Task reopened'); }));
  offs.push(on(host, 'click', '[data-atype]', (e, el) => { S.draft.type = el.dataset.atype; host.querySelectorAll('[data-atype]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); const ta = host.querySelector('#ct-atext'), sb = host.querySelector('#ct-compose [type=submit]'); if (ta) { ta.placeholder = S.draft.type === 'note' ? 'Write a note about ' + S.c.name.split(' ')[0] + '...' : 'What was discussed or agreed?'; ta.focus(); } if (sb) sb.textContent = 'Log ' + dvTypeOf(S.draft.type).label.toLowerCase(); }));
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
const dvListOpts = (pid, cur) => { const p = taskProjects.find(x => x.id === Number(pid)); return dvOpt('', 'Not set', cur) + (p?.lists || []).map(l => dvOpt(l.id, l.name, cur)).join(''); };

async function openTaskForm(opts = {}) {
  await ensureMembers(); const { dealList, contactList } = await dvTaskLists();
  const fid = 'tkf-' + uid();
  const init = { project_id: opts.projectId !== undefined ? opts.projectId : (currentProjectId || taskProjects[0]?.id || ''), list_id: opts.listId !== undefined ? opts.listId : (currentListId || ''), status: dvFirstKey(), priority: 'medium', assigned_to: currentUser?.id || '', deal_id: opts.dealId || '', contact_id: opts.contactId || '', due_date: '', due_time: '' };
  if (!init.list_id && init.project_id) init.list_id = (taskProjects.find(p => p.id === Number(init.project_id))?.lists || [])[0]?.id || '';
  if (init.deal_id && !init.contact_id) { const d = dealList.find(x => x.id === Number(init.deal_id)); if (d?.contact_id) init.contact_id = d.contact_id; }
  const cf = f => { const id = `${fid}-cf-${f.field_key}`; const typeMap = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' };
    return `<div class="field"><label class="label" for="${id}">${esc(f.name)}</label>${f.type === 'dropdown' ? `<select class="select" id="${id}" data-cf="${esc(f.field_key)}"><option value="">Not set</option>${(f.options || []).map(o => dvOpt(o, o, '')).join('')}</select>` : `<input class="input" id="${id}" data-cf="${esc(f.field_key)}" type="${typeMap[f.type] || 'text'}" autocomplete="off">`}</div>`; };
  const m = ui.modal({ title: 'New task', size: 'md', onClose: opts.onClose,
    body: `<form id="${fid}" novalidate class="col" style="gap:14px;padding-top:4px">
      <div class="field"><label class="label" for="${fid}-t">Title <span class="req">*</span></label><input class="input" id="${fid}-t" name="title" autofocus autocomplete="off" placeholder="What needs to be done?"><div class="error-text" id="${fid}-te" hidden></div></div>
      <div class="field"><label class="label" for="${fid}-ds">Description</label><textarea class="textarea" id="${fid}-ds" name="description" rows="2" placeholder="Optional details"></textarea></div>
      <div class="field-row"><div class="field"><label class="label" for="${fid}-pr">Project</label><select class="select" id="${fid}-pr" name="project_id">${dvOpt('', 'Not set', init.project_id) + taskProjects.map(p => dvOpt(p.id, p.name, init.project_id)).join('')}</select></div>
        <div class="field"><label class="label" for="${fid}-l">List</label><select class="select" id="${fid}-l" name="list_id">${dvListOpts(init.project_id, init.list_id)}</select></div></div>
      <div class="field-row"><div class="field"><label class="label" for="${fid}-s">Status</label><select class="select" id="${fid}-s" name="status">${dvTaskStatuses().map(s => dvOpt(s.key, s.label, init.status)).join('')}</select></div>
        <div class="field"><label class="label" for="${fid}-p">Priority</label><select class="select" id="${fid}-p" name="priority">${Object.keys(DV_PRIO).map(p => dvOpt(p, DV_PRIO[p][0], init.priority)).join('')}</select></div></div>
      <div class="field-row"><div class="field"><label class="label" for="${fid}-d">Due date</label><input class="input" type="date" id="${fid}-d" name="due_date" value=""></div>
        <div class="field"><label class="label" for="${fid}-dt">Time</label><input class="input" type="time" id="${fid}-dt" name="due_time" value=""><span class="hint">Optional. A time puts it on the calendar's hour grid.</span></div>
        <div class="field"><label class="label" for="${fid}-o">Assignee</label><select class="select" id="${fid}-o" name="assigned_to"><option value="">Unassigned</option>${members.map(x => dvOpt(x.id, x.name, init.assigned_to)).join('')}</select></div></div>
      <div class="field-row"><div class="field"><label class="label" for="${fid}-de">Deal</label><select class="select" id="${fid}-de" name="deal_id">${dvOpt('', 'No deal', init.deal_id) + dealList.map(d => dvOpt(d.id, d.title, init.deal_id)).join('')}</select></div>
        <div class="field"><label class="label" for="${fid}-c">Contact</label><select class="select" id="${fid}-c" name="contact_id">${dvOpt('', 'No contact', init.contact_id) + contactList.map(c => dvOpt(c.id, c.name, init.contact_id)).join('')}</select></div></div>
      ${taskFields.length ? `<div class="field-row">${taskFields.map(cf).join('')}</div>` : ''}</form>`,
    footer: `<button class="btn btn-secondary" data-close>${esc(t('btn_cancel'))}</button><button class="btn btn-primary" type="submit" form="${fid}">Create task</button>` });
  const f = m.el.querySelector('form'), title = f.querySelector('[name=title]'), err = f.querySelector('#' + fid + '-te');
  title.addEventListener('input', () => { title.removeAttribute('aria-invalid'); err.hidden = true; });
  f.querySelector('[name=project_id]').addEventListener('change', e => { f.querySelector('[name=list_id]').innerHTML = dvListOpts(e.target.value, ''); });
  f.querySelector('[name=deal_id]').addEventListener('change', e => { const d = e.target.value ? dealList.find(x => x.id === +e.target.value) : null, c = f.querySelector('[name=contact_id]'); if (d?.contact_id && !c.value) c.value = d.contact_id; });
  f.addEventListener('submit', async e => {
    e.preventDefault(); const d = ui.formData(f), tt = d.title.trim();
    if (!tt) { title.setAttribute('aria-invalid', 'true'); err.textContent = 'Enter a title for the task.'; err.hidden = false; title.focus(); return; }
    const payload = { title: tt, description: d.description.trim(), project_id: d.project_id || null, list_id: d.list_id || null, status: d.status, priority: d.priority, due_date: d.due_date || null, due_time: d.due_time || null, assigned_to: d.assigned_to || null, deal_id: d.deal_id || null, contact_id: d.contact_id || null,
      custom_data: Object.fromEntries([...f.querySelectorAll('[data-cf]')].map(el => [el.dataset.cf, el.value])) };
    const res = await api.post('/api/tasks', payload); if (res?.error) return ui.toast(res.error);
    m.close();
    if (currentListId && typeof renderTasksCurrent === 'function') { tasks = await api.get(`/api/tasks?list_id=${currentListId}`); dvRefreshTasks(); }
    opts.onSave && opts.onSave(res);
    ui.toast('Task created', { action: { label: 'View', onClick: () => openTaskDrawer(res.id) } });
  });
  return m;
}

let dvDrawer = null;
async function openTaskDrawer(id, opts = {}) {
  if (dvDrawer) { const d = dvDrawer; dvDrawer = null; d.close(); }
  await ensureMembers(); const { dealList, contactList } = await dvTaskLists();
  let x = await api.get(`/api/tasks/${id}`);
  if (!x || x.error) { ui.toast('That task no longer exists.'); return; }
  const fid = 'tkd-' + uid(), fin = () => x.status === dvDoneKey();
  const cf = f => { const id2 = `${fid}-cf-${f.field_key}`, v = x.custom_data?.[f.field_key] ?? '', typeMap = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' };
    return `<dt><label for="${id2}">${esc(f.name)}</label></dt><dd>${f.type === 'dropdown' ? `<select class="select select-sm" id="${id2}" data-f="cf:${esc(f.field_key)}"><option value="">Not set</option>${(f.options || []).map(o => dvOpt(o, o, v)).join('')}</select>` : `<input class="input input-sm" id="${id2}" data-f="cf:${esc(f.field_key)}" type="${typeMap[f.type] || 'text'}" value="${esc(v)}">`}</dd>`; };
  const body = `<div class="tk-dr">
    <div><div class="tk-dr-head"><button class="tk-done big ${fin() ? 'on' : ''}" data-dtoggle aria-pressed="${fin()}" aria-label="${fin() ? 'Reopen task' : 'Complete task'}">${icon('check')}</button>
      <textarea class="tk-dr-title" id="${fid}-t" rows="1" aria-label="Task title">${esc(x.title)}</textarea></div><div class="error-text" id="${fid}-te" hidden style="margin-left:38px"></div></div>
    <dl class="kv tk-props">
      <dt><label for="${fid}-s">Status</label></dt><dd><select class="select select-sm" id="${fid}-s" data-f="status">${dvTaskStatuses().map(s => dvOpt(s.key, s.label, x.status)).join('')}</select></dd>
      <dt><label for="${fid}-p">Priority</label></dt><dd><select class="select select-sm" id="${fid}-p" data-f="priority">${Object.keys(DV_PRIO).map(p => dvOpt(p, DV_PRIO[p][0], x.priority)).join('')}</select></dd>
      <dt><label for="${fid}-o">Assignee</label></dt><dd><select class="select select-sm" id="${fid}-o" data-f="assigned_to"><option value="">Unassigned</option>${members.map(mm => dvOpt(mm.id, mm.name, x.assigned_to)).join('')}</select></dd>
      <dt><label for="${fid}-d">Due date</label></dt><dd><input class="input input-sm" type="date" id="${fid}-d" data-f="due_date" value="${esc(dvIso(x.due_date))}"><input class="input input-sm" type="time" id="${fid}-dt" data-f="due_time" value="${esc(String(x.due_time || '').slice(0, 5))}" aria-label="Time" style="max-width:104px"><span class="muted" id="${fid}-dl" style="white-space:nowrap;font-size:var(--fs-sm)"></span></dd>
      <dt><label for="${fid}-pr">Project</label></dt><dd><select class="select select-sm" id="${fid}-pr" data-f="project_id">${dvOpt('', 'Not set', x.project_id) + taskProjects.map(p => dvOpt(p.id, p.name, x.project_id)).join('')}</select><select class="select select-sm" id="${fid}-l" data-f="list_id" aria-label="List">${dvListOpts(x.project_id, x.list_id)}</select></dd>
      <dt><label for="${fid}-de">Deal</label></dt><dd><select class="select select-sm" id="${fid}-de" data-f="deal_id">${dvOpt('', 'No deal', x.deal_id) + dealList.map(d => dvOpt(d.id, d.title, x.deal_id)).join('')}</select><button class="btn btn-ghost btn-sm btn-icon" id="${fid}-dea" data-open="deal" aria-label="Open deal" title="Open deal" ${x.deal_id ? '' : 'hidden'}>${icon('external')}</button></dd>
      <dt><label for="${fid}-c">Contact</label></dt><dd><select class="select select-sm" id="${fid}-c" data-f="contact_id">${dvOpt('', 'No contact', x.contact_id) + contactList.map(c => dvOpt(c.id, c.name, x.contact_id)).join('')}</select><button class="btn btn-ghost btn-sm btn-icon" id="${fid}-ca" data-open="contact" aria-label="Open contact" title="Open contact" ${x.contact_id ? '' : 'hidden'}>${icon('external')}</button></dd>
      ${taskFields.map(cf).join('')}
    </dl>
    <div class="field"><label class="label" for="${fid}-ds">Description</label><textarea class="textarea" id="${fid}-ds" data-f="description" rows="3" placeholder="Add a description">${esc(x.description || '')}</textarea></div>
    <section aria-label="Subtasks" id="${fid}-subs"></section></div>`;
  const dr = ui.drawer({ title: 'Task details', width: 580, body,
    footer: `<button class="btn btn-danger-ghost" data-del style="margin-right:auto">${icon('trash')}Delete task</button><button class="btn btn-secondary" data-close>Close</button>`,
    onClose: () => { if (dvDrawer === dr) dvDrawer = null; } });
  dvDrawer = dr; dr.el.querySelector('.drawer').classList.add('tk-drawer');
  const q = sel => dr.el.querySelector(sel);
  const syncRow = () => { const row = tasks.find(y => y.id === id); if (row) Object.assign(row, { title: x.title, status: x.status, priority: x.priority, assigned_to: x.assigned_to, assigned_to_name: members.find(mm => mm.id === x.assigned_to)?.name || null, due_date: x.due_date, due_time: x.due_time, description: x.description }); dvRefreshTasks(); opts.onChange && opts.onChange(x); };
  const payload = () => ({ title: x.title, description: x.description, status: x.status, priority: x.priority, assigned_to: x.assigned_to || null, due_date: x.due_date ? dvIso(x.due_date) : null, due_time: x.due_time || null, project_id: x.project_id || null, list_id: x.list_id || null, deal_id: x.deal_id || null, contact_id: x.contact_id || null, custom_data: x.custom_data || {} });
  async function save(patch, msg) { const prev = {}; Object.keys(patch).forEach(k => prev[k] = x[k]); Object.assign(x, patch); const res = await api.put(`/api/tasks/${id}`, payload()); if (res?.error) { Object.assign(x, prev); return ui.toast(res.error); } syncRow(); if (msg) ui.toast(msg, { ms: 1800 }); }
  const titleEl = q(`#${fid}-t`), titleErr = q(`#${fid}-te`);
  const fit = () => { titleEl.style.height = 'auto'; titleEl.style.height = titleEl.scrollHeight + 2 + 'px'; };
  fit(); titleEl.addEventListener('input', () => { fit(); titleEl.removeAttribute('aria-invalid'); titleErr.hidden = true; });
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } if (e.key === 'Escape') { e.stopPropagation(); titleEl.value = x.title; fit(); titleEl.blur(); } });
  titleEl.addEventListener('blur', () => { const v = titleEl.value.trim(); if (!v) { titleEl.value = x.title; titleEl.setAttribute('aria-invalid', 'true'); titleErr.textContent = 'The title cannot be empty. The previous title was restored.'; titleErr.hidden = false; fit(); return; } if (v !== x.title) save({ title: v }, 'Title saved'); });
  const dueNote = () => { q(`#${fid}-dl`).textContent = x.due_date ? dvDue(x.due_date, x.due_time) : ''; };
  const links = () => { q(`#${fid}-dea`).hidden = !x.deal_id; q(`#${fid}-ca`).hidden = !x.contact_id; };
  const syncDone = () => { const b = q('[data-dtoggle]'), f = fin(); b.classList.toggle('on', f); b.setAttribute('aria-pressed', f); b.setAttribute('aria-label', f ? 'Reopen task' : 'Complete task'); q(`#${fid}-s`).value = x.status; };
  dueNote(); links();
  on(dr.el, 'click', '[data-dtoggle]', async () => { const next = fin() ? dvFirstKey() : dvDoneKey(), prev = x.status; x.status = next; syncDone(); const res = await api.patch(`/api/tasks/${id}/status`, { status: next }); if (res?.error) { x.status = prev; syncDone(); return ui.toast(res.error); } syncRow(); ui.toast(next === dvDoneKey() ? 'Task completed' : 'Task reopened', { ms: 1800 }); });
  on(dr.el, 'change', '[data-f]', (e, el) => {
    const k = el.dataset.f, v = el.value, patch = {};
    if (k.startsWith('cf:')) patch.custom_data = { ...(x.custom_data || {}), [k.slice(3)]: v };
    else if (k === 'assigned_to' || k === 'deal_id' || k === 'contact_id' || k === 'project_id' || k === 'list_id') patch[k] = v ? +v : null;
    else if (k === 'description') patch.description = v.trim();
    else patch[k] = v || null;
    if (k === 'project_id') { patch.list_id = (taskProjects.find(p => p.id === patch.project_id)?.lists || [])[0]?.id || null; q(`#${fid}-l`).innerHTML = dvListOpts(patch.project_id, patch.list_id); }
    if (k === 'deal_id' && patch.deal_id && !x.contact_id) { const d = dealList.find(y => y.id === patch.deal_id); if (d?.contact_id) { patch.contact_id = d.contact_id; q(`#${fid}-c`).value = d.contact_id; } }
    save(patch, { status: 'Status updated', priority: 'Priority updated', assigned_to: 'Assignee updated', due_date: 'Due date updated', due_time: 'Time updated', description: 'Description saved', project_id: 'Project updated', list_id: 'List updated', deal_id: 'Deal link updated', contact_id: 'Contact updated' }[k] || 'Saved').then(() => { if (k === 'status') syncDone(); if (k === 'due_date' || k === 'due_time') dueNote(); if (k === 'deal_id' || k === 'contact_id') links(); });
  });
  on(dr.el, 'click', '[data-open]', (e, el) => { const kind = el.dataset.open; dr.close(); if (kind === 'deal' && x.deal_id) openDealDetail(x.deal_id); if (kind === 'contact' && x.contact_id) openContactDetail(x.contact_id); });
  on(dr.el, 'click', '[data-del]', async () => { const ok = await ui.confirm({ title: 'Delete this task?', message: 'Its subtasks are deleted with it. This cannot be undone.', confirmLabel: 'Delete task', danger: true }); if (!ok) return; const res = await api.del(`/api/tasks/${id}`); if (res?.error) return ui.toast(res.error); tasks = tasks.filter(y => y.id !== id && y.parent_id !== id); dvRefreshTasks(); opts.onChange && opts.onChange(null); dr.close(); ui.toast('Task deleted'); });

  /* subtasks */
  const subHost = q(`#${fid}-subs`);
  function paintSubs(focus) {
    const a = x.subtasks || [], done = a.filter(s => s.status === dvDoneKey()).length;
    subHost.innerHTML = `<div class="tk-secH"><b>Subtasks</b><span class="muted tnum">${done} of ${a.length} done</span></div>
      ${a.length ? `<div class="progress" style="margin-bottom:8px"><i style="width:${Math.round(done / a.length * 100)}%"></i></div>` : ''}
      ${a.map(s => `<div class="tk-si"><label class="check"><input type="checkbox" data-sub="${s.id}" ${s.status === dvDoneKey() ? 'checked' : ''}><span class="truncate ${s.status === dvDoneKey() ? 'tk-strike' : ''}">${esc(s.title)}</span></label><button class="iconbtn tk-mini tk-x" data-subdel="${s.id}" aria-label="Delete subtask ${esc(s.title)}">${icon('x')}</button></div>`).join('') || '<div class="muted" style="font-size:var(--fs-sm);padding:2px 0 8px">No subtasks yet.</div>'}
      <div class="row" style="margin-top:8px"><input class="input input-sm" id="${fid}-sin" placeholder="Add a subtask" aria-label="New subtask" autocomplete="off"><button class="btn btn-secondary btn-sm" data-subadd>Add</button></div>`;
    if (focus) { const el = focus === 'add' ? q(`#${fid}-sin`) : subHost.querySelector(`[data-sub="${focus}"]`); el && el.focus(); }
  }
  const reloadSubs = async () => { const fresh = await api.get(`/api/tasks/${id}`); if (fresh && !fresh.error) x.subtasks = fresh.subtasks || []; const row = tasks.find(y => y.id === id); if (row) { row.subtask_count = (x.subtasks || []).length; row.subtask_done = (x.subtasks || []).filter(s => s.status === dvDoneKey()).length; } dvRefreshTasks(); };
  const addSub = async () => { const inp = q(`#${fid}-sin`), v = inp.value.trim(); if (!v) { inp.focus(); return; } const res = await api.post('/api/tasks', { title: v, parent_id: id, project_id: x.project_id || null, list_id: x.list_id || null, status: dvFirstKey(), priority: 'medium' }); if (res?.error) return ui.toast(res.error); await reloadSubs(); paintSubs('add'); };
  on(dr.el, 'click', '[data-subadd]', addSub);
  dr.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === `${fid}-sin`) { e.preventDefault(); addSub(); } });
  on(dr.el, 'change', '[data-sub]', async (e, el) => { const res = await api.patch(`/api/tasks/${+el.dataset.sub}/status`, { status: el.checked ? dvDoneKey() : dvFirstKey() }); if (res?.error) return ui.toast(res.error); await reloadSubs(); paintSubs(+el.dataset.sub); });
  on(dr.el, 'click', '[data-subdel]', async (e, el) => { const res = await api.del(`/api/tasks/${+el.dataset.subdel}`); if (res?.error) return ui.toast(res.error); await reloadSubs(); paintSubs('add'); ui.toast('Subtask deleted'); });
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
