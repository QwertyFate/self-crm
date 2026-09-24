async function openContactModal(id) {
  await Promise.all([ensureFields(), ensureMembers()]);
  document.getElementById('contact-form').reset();
  document.getElementById('contact-id').value   = id || '';
  document.getElementById('cf-type').value       = currentContactType;
  const typeName = currentContactType === 'supplier'
    ? (currentWorkspace?.supplier_name || 'Supplier').replace(/s$/i, '')
    : 'Contact';
  document.getElementById('contact-modal-title').textContent = id ? `Edit ${typeName}` : `Add ${typeName}`;

  const assigneeEl = document.getElementById('cf-assignee');
  assigneeEl.innerHTML = '<option value="">— Unassigned —</option>' +
    members.map(m => `<option value="${m.id}">${esc(m.name)}${m.id === currentUser?.id ? ' (you)' : ''}</option>`).join('');

  document.getElementById('cf-custom-fields').innerHTML = fields.map(f =>
    `<div class="form-group"><label>${esc(f.name)}</label>${renderFieldInput(f, '')}</div>`).join('');

  if (id) {
    const c = await api.get(`/api/contacts/${id}`);
    document.getElementById('cf-name').value    = c.name;
    document.getElementById('cf-company').value = c.company || '';
    document.getElementById('cf-email').value   = c.email   || '';
    document.getElementById('cf-phone').value   = c.phone   || '';
    assigneeEl.value = c.assigned_to || '';
    fields.forEach(f => { const el = document.getElementById(`cfield-${f.field_key}`); if (el) el.value = c.custom_data?.[f.field_key] ?? ''; });
  } else {
    assigneeEl.value = currentUser?.id || '';
  }
  const body = document.getElementById('contact-modal-body');
  if (body) body.scrollTop = 0;
  document.getElementById('contact-modal').classList.remove('hidden');
  document.getElementById('cf-name')?.focus();
}

function renderFieldInput(f, value, prefix = 'cfield') {
  const id = `${prefix}-${f.field_key}`;
  if (f.type === 'dropdown') return `<select id="${id}"><option value="">${t('opt_select')}</option>
    ${(f.options||[]).map(o => `<option value="${esc(o)}" ${value===o?'selected':''}>${esc(o)}</option>`).join('')}
  </select>`;
  const typeMap = { text:'text', email:'email', phone:'tel', number:'number', date:'date', url:'url' };
  return `<input type="${typeMap[f.type]||'text'}" id="${id}" value="${esc(value)}" />`;
}

async function saveContact(e) {
  e.preventDefault();
  const id = document.getElementById('contact-id').value;
  const custom_data = {};
  fields.forEach(f => { const el = document.getElementById(`cfield-${f.field_key}`); if (el) custom_data[f.field_key] = el.value; });
  const payload = {
    name:         document.getElementById('cf-name').value,
    company:      document.getElementById('cf-company').value,
    email:        document.getElementById('cf-email').value,
    phone:        document.getElementById('cf-phone').value,
    assigned_to:  document.getElementById('cf-assignee').value || null,
    contact_type: document.getElementById('cf-type').value || currentContactType,
    custom_data,
  };
  if (id) await api.put(`/api/contacts/${id}`, payload); else await api.post('/api/contacts', payload);
  closeModal('contact-modal');
  invalidate();
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'deals') {
    await loadDeals();
  } else {
    await loadContacts();
  }
}

async function deleteContact(id) {
  if (!confirm(t('confirm_delete_contact'))) return;
  await api.del(`/api/contacts/${id}`);
  closeSidePanel();
  closeModal('detail-modal');
  invalidate();
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'deals') loadDeals(); else loadContacts();
}

function closeSidePanel() {
  document.getElementById('contact-side-panel')?.classList.add('hidden');
  document.querySelectorAll('#contacts-body tr.side-panel-active').forEach(r => r.classList.remove('side-panel-active'));
}

/* ── The contact record (side panel and the detail modal) ───────────────────
   One identity card: who (avatar, name, company) · the owner strip (the
   assignee as a pill over a real <select>) · how to reach them — always
   visible — then the remaining fields folded under "Contact information".
   Every value edits in place with one click; there is no Edit mode (the
   full form survives as "Edit all fields" in the ⋯ menu).
   Contacts have no stage: stages belong to deals. Creating a deal or a task
   for the contact happens in the Deals / Tasks blocks under the card.     */
function contactDetailCardHtml(c, id, opts = {}) {
  const surface = opts.surface || 'panel';   // 'panel' (side panel / detail modal) or 'deal' (the deal view's Contact column)
  const infoId = `contact-section-contact-info${surface === 'deal' ? '-deal' : ''}`;   // both cards can be in the document at once
  const dash = '<span class="muted-dash">—</span>';
  const wa = waLink(c.phone, c);
  const memberOptions = `<option value="">${t('opt_unassigned')}</option>` + members.map(m => `<option value="${m.id}"${c.assigned_to === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
  const hint = `<span class="card-edit-hint" aria-hidden="true">${UI_ICON.edit}</span>`;
  const prefs = loadPanelSections();
  const detailsOpen = panelSectionOpen(prefs, 'contact_info', false);   // the rest of the record stays folded until the user opens it
  // A click-to-edit value. The raw value rides on data-value, so the editor never needs the contacts cache.
  const edit = (onclick, raw, shown) =>
    `<span class="card-field" role="button" tabindex="0" title="${esc(t('click_to_edit'))}" data-value="${esc(raw ?? '')}" onclick="${onclick}" onkeydown="if(event.key==='Enter'){event.preventDefault();this.click();}"><span class="card-field-text">${shown}</span>${hint}</span>`;
  const empty = label => `<span class="muted-dash">${esc(label)}</span>`;
  const fieldValue = f => {
    const v = c.custom_data?.[f.field_key];
    if (v == null || v === '') return dash;
    if (f.type === 'url')   return `<a href="${esc(v)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${esc(v)}</a>`;
    if (f.type === 'email') return `<a href="mailto:${esc(v)}" onclick="event.stopPropagation()">${esc(v)}</a>`;
    return esc(v);
  };
  const row = (label, value) => `<div class="contact-card-row"><span class="contact-card-label">${esc(label)}</span><span class="contact-card-value">${value}</span></div>`;

  return `
    <div class="contact-card is-record">
      <div class="contact-card-head">
        <div class="contact-card-avatar" aria-hidden="true">${esc(initials(c.name))}</div>
        <div class="contact-card-id">
          <div class="contact-card-name">${edit(`startContactFieldEdit(this, ${id}, 'name', 'text')`, c.name, esc(c.name))}</div>
          <div class="contact-card-company">${edit(`startContactFieldEdit(this, ${id}, 'company', 'text')`, c.company, c.company ? esc(c.company) : empty(t('lbl_company')))}</div>
        </div>
        <button type="button" class="btn btn-sm btn-ghost btn-icon" title="${esc(t('contact_menu'))}" aria-label="${esc(t('contact_menu'))}" aria-haspopup="menu" aria-expanded="false" onclick="openContactDetailMenu(event, ${id}, '${surface}')">${UI_ICON.more}</button>
      </div>
      <div class="owner-strip">
        <div class="owner-pill${c.assigned_to ? '' : ' is-unassigned'}">
          <span class="owner-pill-avatar" aria-hidden="true">${c.assigned_to_name ? esc(initials(c.assigned_to_name)) : UI_ICON.plus}</span>
          <span class="owner-pill-text">
            <span class="owner-pill-caption">${c.assigned_to ? t('assigned_to_lbl') : t('assign_someone')}</span>
            <span class="owner-pill-name">${c.assigned_to_name ? esc(c.assigned_to_name) : t('detail_unassigned')}</span>
          </span>
          <span class="pill-chevron" aria-hidden="true">${UI_ICON.chevronDown}</span>
          <select class="pill-select" aria-label="${esc(t('lbl_assignee'))}" onchange="saveContactField(${id}, 'assigned_to', this.value)">${memberOptions}</select>
        </div>
      </div>
      <div class="contact-card-channels">
        <div class="contact-channel">${UI_ICON.mail}${edit(`startContactFieldEdit(this, ${id}, 'email', 'email')`, c.email, c.email ? `<a href="mailto:${esc(c.email)}" onclick="event.stopPropagation()">${esc(c.email)}</a>` : empty(t('lbl_email')))}</div>
        <div class="contact-channel">${UI_ICON.call}${edit(`startContactFieldEdit(this, ${id}, 'phone', 'phone')`, c.phone, c.phone ? esc(c.phone) : empty(t('lbl_phone')))}${wa ? `<a class="btn btn-sm btn-ghost contact-channel-action" href="${wa}" target="_blank" rel="noopener">${WA_SVG}<span>WhatsApp</span></a>` : ''}</div>
      </div>
      ${fields.length ? `<div class="contact-card-details" data-section="contact_info">
        <button type="button" class="detail-block-toggle contact-card-details-toggle" aria-expanded="${detailsOpen}" aria-controls="${infoId}" title="${esc(t('toggle_section'))}" onclick="toggleDetailBlock(this)">${UI_ICON.chevronDown}<span>${t('sec_contact_info')}</span><span class="detail-block-count">${fields.length}</span></button>
        <div class="contact-card-list${detailsOpen ? '' : ' hidden'}" id="${infoId}">
          ${fields.map(f => row(f.name, edit(`startContactFieldEdit(this, ${id}, '${f.field_key}', '${f.type}')`, c.custom_data?.[f.field_key], fieldValue(f)))).join('')}
          ${row(t('lbl_added'), fmtDate(c.created_at) || dash)}
        </div>
      </div>` : `<div class="contact-card-list">${row(t('lbl_added'), fmtDate(c.created_at) || dash)}</div>`}
    </div>`;
}

/* ── Sections that fold ────────────────────────────────────────────────────
   Each block head is one toggle (chevron · title · count) with the block's
   actions beside it. The user's choices are kept per browser and apply to
   every contact; a collapsed block opens by itself when something is added
   to it, so folding never hides the result of an action.                  */
// Pure: the stored preferences, or {} for anything unreadable.
function readPanelSections(raw) {
  try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
}
// Pure: a stored boolean wins; anything else falls back.
function panelSectionOpen(prefs, name, fallback) {
  return typeof prefs?.[name] === 'boolean' ? prefs[name] : fallback;
}
function loadPanelSections() {
  try { return readPanelSections(localStorage.getItem('contactPanelSections')); } catch { return {}; }
}
function savePanelSection(name, open) {
  try { const prefs = loadPanelSections(); prefs[name] = !!open; localStorage.setItem('contactPanelSections', JSON.stringify(prefs)); }
  catch { /* storage unavailable: the choice lasts for this render only */ }
}
// The head of a block: the toggle (a real button) and, beside it, the block's actions.
function detailBlockHead(name, label, count, actionsHtml, open) {
  return `<div class="detail-block-head">
        <button type="button" class="detail-block-toggle" aria-expanded="${open}" aria-controls="contact-section-${name}" title="${esc(t('toggle_section'))}" onclick="toggleDetailBlock(this)">${UI_ICON.chevronDown}<span class="contact-panel-section-label">${label}</span><span class="detail-block-count" id="contact-${name}-count">${count || ''}</span></button>
        ${actionsHtml ? `<div class="hstack-tight detail-block-actions">${actionsHtml}</div>` : ''}
      </div>`;
}
function toggleDetailBlock(btn) {
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  document.getElementById(btn.getAttribute('aria-controls'))?.classList.toggle('hidden', !open);
  const name = btn.closest('[data-section]')?.dataset.section;
  if (name) savePanelSection(name, open);
}
// Expand a section without touching the stored preference (something was just added to it).
function openDetailBlock(name) {
  const btn = document.querySelector(`[data-section="${name}"] .detail-block-toggle`);
  if (!btn || btn.getAttribute('aria-expanded') === 'true') return;
  btn.setAttribute('aria-expanded', 'true');
  document.getElementById(btn.getAttribute('aria-controls'))?.classList.remove('hidden');
}

// The record: the identity card, then Deals · Tasks · Notes, each block with
// its count and its own "add" action in the head, each one foldable.
function buildDetailHTML(c, contactDeals, contactTasks, id) {
  const dealCount = contactDeals?.length || 0, noteCount = c.activities?.length || 0, taskCount = openTaskCount(contactTasks);
  const prefs = loadPanelSections();
  const open = { deals: panelSectionOpen(prefs, 'deals', true), tasks: panelSectionOpen(prefs, 'tasks', true), notes: panelSectionOpen(prefs, 'notes', true) };
  return `
    <div id="contact-detail-card">${contactDetailCardHtml(c, id)}</div>

    <section class="detail-block" data-section="deals">
      ${detailBlockHead('deals', t('sec_deals'), dealCount,
        `<button type="button" class="btn btn-sm" onclick="closeSidePanel();closeModal('detail-modal');openDealModalForContact(${id})">${UI_ICON.plus}<span>${t('add_deal')}</span></button>`, open.deals)}
      <div class="detail-block-body${open.deals ? '' : ' hidden'}" id="contact-section-deals">
        <div class="contact-deals-list" id="contact-deals-list">${renderContactDeals(contactDeals)}</div>
      </div>
    </section>

    <section class="detail-block" data-section="tasks">
      ${detailBlockHead('tasks', t('sec_tasks'), taskCount,
        `<button type="button" class="btn btn-sm" onclick="openTaskModalForContact(${id})">${UI_ICON.plus}<span>${t('btn_add_task')}</span></button>`, open.tasks)}
      <div class="detail-block-body${open.tasks ? '' : ' hidden'}" id="contact-section-tasks">
        <div class="contact-tasks-list" id="contact-tasks-list" data-contact-id="${id}">${renderContactTasks(contactTasks)}</div>
      </div>
    </section>

    <section class="detail-block" data-section="notes">
      ${detailBlockHead('notes', t('sec_notes'), noteCount,
        `<button type="button" class="btn btn-sm" onclick="toggleContactNoteForm(${id})">${UI_ICON.plus}<span>${t('btn_add_note')}</span></button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="toggleContactShowAllNotes(${id})" id="contact-show-all-btn">${t('btn_show_all')}${noteCount ? ` (${noteCount})` : ''}</button>`, open.notes)}
      <div class="detail-block-body${open.notes ? '' : ' hidden'}" id="contact-section-notes">
      <div id="contact-note-form-wrapper" class="contact-note-form-wrapper hidden">
        <input type="hidden" id="contact-activity-contact-id" value="${id}" />
        <div class="seg" id="contact-activity-type-seg" role="radiogroup" aria-label="${esc(t('lbl_type'))}"></div>
        <select id="contact-activity-type" class="sr-only">
          <option value="note">${t('act_note')}</option>
          <option value="call">${t('act_call')}</option>
          <option value="email">${t('act_email')}</option>
          <option value="whatsapp">${t('act_whatsapp')}</option>
        </select>
        <div class="note-editor-toolbar">
          <button type="button" class="fmt-btn" onclick="formatContactActivityNote('bold')" title="${esc(t('fmt_bold'))}"><strong>B</strong></button>
          <button type="button" class="fmt-btn" onclick="formatContactActivityNote('italic')" title="${esc(t('fmt_italic'))}"><em>I</em></button>
          <button type="button" class="fmt-btn" onclick="formatContactActivityNote('underline')" title="${esc(t('fmt_underline'))}"><u>U</u></button>
          <div class="fmt-divider"></div>
          <button type="button" class="fmt-btn" onclick="formatContactActivityNote('insertUnorderedList')" title="${esc(t('fmt_list'))}" aria-label="${esc(t('fmt_list'))}"><svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg></button>
          <button type="button" class="fmt-btn" onclick="formatContactActivityNote('createLink')" title="${esc(t('fmt_link'))}" aria-label="${esc(t('fmt_link'))}"><svg class="ic" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></button>
          <button type="button" class="fmt-btn" onclick="formatContactActivityNote('removeFormat')" title="${esc(t('fmt_clear'))}" aria-label="${esc(t('fmt_clear'))}">${UI_ICON.remove}</button>
        </div>
        <div class="hstack note-date-row">
          <label class="eyebrow" for="contact-activity-date">${t('lbl_date')}</label>
          <input type="date" id="contact-activity-date" disabled />
          <label title="${esc(t('no_date_hint'))}">
            <input type="checkbox" id="contact-activity-no-date" checked onchange="toggleNoDate(this)" /> <span>${t('no_date')}</span>
          </label>
        </div>
        <div id="contact-activity-content" class="note-editor" contenteditable="true" placeholder="${esc(t('detail_log_ph'))}"
          onkeydown="if(event.key==='Enter' && event.ctrlKey){event.preventDefault();saveContactActivity();}"></div>
        <div class="hstack note-form-actions">
          <button type="button" class="btn btn-primary" onclick="saveContactActivity()"><span>${t('btn_log')}</span><kbd class="kbd">Ctrl+Enter</kbd></button>
          <button type="button" class="btn" onclick="toggleContactNoteForm()">${t('btn_cancel')}</button>
        </div>
      </div>
      <div class="contact-timeline" id="detail-acts" data-contact-id="${id}">${renderDealTimeline(c.activities, false)}</div>
      </div>
    </section>`;
}

// The deal view's column offers its own "Edit all fields" form and nothing destructive.
function openContactDetailMenu(e, id, surface = 'panel') {
  e.stopPropagation();
  if (surface === 'deal') {
    openPopoverMenu(e.currentTarget, `
    <button type="button" class="card-menu-item" role="menuitem" onclick="closePopoverMenu();editContactPanel(${id})">${UI_ICON.edit}<span>${t('edit_all_fields')}</span></button>`);
    return;
  }
  openPopoverMenu(e.currentTarget, `
    <button type="button" class="card-menu-item" role="menuitem" onclick="closePopoverMenu();editContactDetail(${id})">${UI_ICON.edit}<span>${t('edit_all_fields')}</span></button>
    <div class="card-menu-sep"></div>
    <button type="button" class="card-menu-item danger" role="menuitem" onclick="closePopoverMenu();deleteContact(${id})">${UI_ICON.remove}<span>${t('delete_contact')}</span></button>`);
}

// Edit in place: the identity card becomes its form; everything below stays.
async function editContactDetail(id) {
  await Promise.all([ensureFields(), ensureMembers()]);
  const slot = document.getElementById('contact-detail-card'); if (!slot) return;
  const c = await api.get(`/api/contacts/${id}`);
  const customInputs = fields.map(f => `<div class="form-group"><label for="cdfield-${esc(f.field_key)}">${esc(f.name)}</label>${renderFieldInput(f, c.custom_data?.[f.field_key] ?? '', 'cdfield')}</div>`).join('');
  slot.innerHTML = `
    <div class="contact-card">
      <div class="contact-card-head">
        <div class="contact-card-avatar" aria-hidden="true">${esc(initials(c.name))}</div>
        <div class="contact-card-id"><div class="contact-card-name">${t('edit_contact_title')}</div><div class="contact-card-company">${esc(c.name)}</div></div>
      </div>
      <div class="contact-card-form">
        <div class="form-group"><label for="cd-name">${t('lbl_name')} <span class="req">*</span></label><input type="text" id="cd-name" value="${esc(c.name)}" /></div>
        <div class="form-group"><label for="cd-company">${t('lbl_company')}</label><input type="text" id="cd-company" value="${esc(c.company || '')}" /></div>
        <div class="form-group"><label for="cd-email">${t('lbl_email')}</label><input type="email" id="cd-email" value="${esc(c.email || '')}" /></div>
        <div class="form-group"><label for="cd-phone">${t('lbl_phone')}</label><input type="tel" id="cd-phone" value="${esc(c.phone || '')}" /></div>
        <div class="form-group"><label for="cd-assignee">${t('lbl_assignee')}</label>
          <select id="cd-assignee"><option value="">${t('opt_unassigned')}</option>${members.map(m => `<option value="${m.id}"${c.assigned_to === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        ${customInputs}
      </div>
      <div class="contact-card-foot">
        <button type="button" class="btn btn-sm" onclick="cancelContactDetailEdit(${id})">${t('btn_cancel')}</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="saveContactDetail(${id})">${t('btn_save')}</button>
      </div>
    </div>`;
  document.getElementById('cd-name')?.focus();
}

async function saveContactDetail(id) {
  const nameEl = document.getElementById('cd-name');
  if (!nameEl?.value.trim()) { alert(t('name_required')); nameEl?.focus(); return; }
  const custom_data = {};
  fields.forEach(f => { const el = document.getElementById(`cdfield-${f.field_key}`); if (el) custom_data[f.field_key] = el.value; });
  const payload = {
    name:        nameEl.value.trim(),
    company:     document.getElementById('cd-company')?.value  || '',
    email:       document.getElementById('cd-email')?.value    || '',
    phone:       document.getElementById('cd-phone')?.value    || '',
    assigned_to: document.getElementById('cd-assignee')?.value || null,
    custom_data,
  };
  const btn = document.querySelector('#contact-detail-card .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = t('saving'); }
  const res = await api.put(`/api/contacts/${id}`, payload);
  if (res?.error) { alert(res.error); if (btn) { btn.disabled = false; btn.textContent = t('btn_save'); } return; }
  await refreshContactDetailCard(id);
}

function cancelContactDetailEdit(id) { refreshContactDetailCard(id); }

// Re-render the card from the server copy and keep the list in step. Fields
// and members are (re)loaded first: the card draws both.
async function refreshContactDetailCard(id) {
  await Promise.all([ensureFields(), ensureMembers()]);
  const fresh = await api.get(`/api/contacts/${id}`);
  if (!fresh || fresh.error) return;
  const slot = document.getElementById('contact-detail-card');
  if (slot) slot.innerHTML = contactDetailCardHtml(fresh, id);
  const dealPanel = document.getElementById('deal-contact-panel');   // the deal view shows the same card
  if (dealPanel && Number(dealPanel.dataset.contactId) === id) dealPanel.innerHTML = contactDetailCardHtml(fresh, id, { surface: 'deal' });
  const nameEl = document.getElementById('side-panel-name'); if (nameEl) nameEl.textContent = fresh.name;
  const titleEl = document.getElementById('detail-title');   if (titleEl) titleEl.textContent = fresh.name;
  const i = contacts.findIndex(x => x.id === id);
  if (i >= 0) contacts[i] = { ...contacts[i], ...fresh };
  if (document.getElementById('page-contacts')?.classList.contains('active')) filterContacts();
}

/* ── Editing in place ──────────────────────────────────────────────────────
   PUT /api/contacts/:id replaces every column it receives (and nulls the ones
   it does not), so one field is saved by sending the whole record, built from
   a fresh server copy rather than the cache.                                */

// Pure: the PUT body for one changed field.
function applyContactFieldChange(contact, key, value) {
  const v = (value === '' || value == null) ? null : value;
  const body = {
    name: contact.name, company: contact.company, email: contact.email, phone: contact.phone,
    assigned_to: contact.assigned_to,
    custom_data: { ...(contact.custom_data || {}) },
  };
  if (key === 'assigned_to') body.assigned_to = parseInt(value, 10) || null;
  else if (['name', 'company', 'email', 'phone'].includes(key)) body[key] = v;
  else body.custom_data[key] = v;
  return body;
}

// Save one field, then re-render the card (and the table row). Resolves true on success.
async function saveContactField(id, key, value) {
  const v = typeof value === 'string' ? value.trim() : value;
  if (key === 'name' && !v) { alert(t('name_required')); await refreshContactDetailCard(id); return false; }
  const c = await api.get(`/api/contacts/${id}`);
  if (!c || c.error) { if (c?.error) alert(c.error); return false; }
  const res = await api.put(`/api/contacts/${id}`, applyContactFieldChange(c, key, v));
  if (res?.error) { alert(res.error); await refreshContactDetailCard(id); return false; }   // the re-render restores the stored value
  await refreshContactDetailCard(id);
  return true;
}

// The typed control for one field; dropdown custom fields get a select.
function contactFieldControl(key, type, current) {
  if (type === 'dropdown') {
    const f = fields.find(f => f.field_key === key);
    const el = document.createElement('select'); el.className = 'inline-select';
    el.innerHTML = `<option value="">${t('opt_select')}</option>` +
      (f?.options || []).map(o => `<option value="${esc(o)}"${current === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
    return el;
  }
  const el = document.createElement('input'); el.className = 'inline-input';
  el.type = { email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' }[type] || 'text';
  el.value = current;
  return el;
}

// Click-to-edit for one value on the record card: the value becomes its
// control; Enter / blur save, Escape puts the value back.
function startContactFieldEdit(valueEl, id, key, type) {
  if (valueEl.querySelector('input,select')) return;
  const current = valueEl.dataset.value ?? '';
  const originalHTML = valueEl.innerHTML;
  const el = contactFieldControl(key, type, current);
  const restore = () => { valueEl.innerHTML = originalHTML; valueEl.classList.remove('editing'); };
  const commit = async () => { const next = el.value; restore(); if (next !== current) await saveContactField(id, key, next); };
  if (el.tagName === 'SELECT') {
    el.onchange = commit;
    el.onblur = () => { if (valueEl.contains(el)) restore(); };
    el.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); restore(); } };
  } else {
    el.onblur = commit;
    el.onkeydown = e => {
      if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { e.stopPropagation(); el.onblur = null; restore(); }   // stopPropagation: Escape would otherwise close the modal
    };
  }
  valueEl.classList.add('editing');
  valueEl.innerHTML = ''; valueEl.appendChild(el); el.focus();
  if (el.select && type !== 'date') el.select();
}

async function openDetail(id) {
  await Promise.all([ensureFields(), ensureMembers()]);
  const [c, contactDeals, contactTasksRes] = await Promise.all([
    api.get(`/api/contacts/${id}`),
    api.get(`/api/deals?contact_id=${id}`),
    api.get(`/api/tasks?contact_id=${id}`),
  ]);
  const contactTasks = Array.isArray(contactTasksRes) ? contactTasksRes : [];

  const activePage = document.querySelector('.sidebar-nav a.active')?.dataset.page;
  const usePanel   = activePage === 'contacts' || activePage === 'suppliers';

  if (usePanel) {
    document.querySelectorAll('#contacts-body tr').forEach(r => r.classList.remove('side-panel-active'));
    document.querySelector(`#contacts-body tr[data-id="${id}"]`)?.classList.add('side-panel-active');

    document.getElementById('side-panel-name').textContent = c.name;
    document.getElementById('side-panel-body').innerHTML   = buildDetailHTML(c, contactDeals, contactTasks, id);
    document.getElementById('contact-side-panel').classList.remove('hidden');
  } else {
    document.getElementById('detail-title').textContent = c.name;
    document.getElementById('detail-body').innerHTML    = buildDetailHTML(c, contactDeals, contactTasks, id);
    document.getElementById('detail-modal').classList.remove('hidden');
  }
  renderSegFromSelect('contact-activity-type-seg', 'contact-activity-type', o => `<span>${esc(o.textContent)}</span>`);
}

function renderContactDeals(deals) {
  if (!deals?.length) return `<p class="empty-inline">${t('no_deals_hint')}</p>`;
  return deals.map(d => `
    <div class="contact-deal-row" role="button" tabindex="0" onclick="closeSidePanel();closeModal('detail-modal');openDealModal(${d.id})" onkeydown="if(event.key==='Enter'){this.click();}">
      <div class="contact-deal-title">${esc(d.title)}</div>
      <div class="contact-deal-meta">
        ${d.stage_name ? `<span class="stage-badge"><span class="stage-badge-dot" style="background:${d.stage_color || 'var(--ink-subtle)'}"></span>${esc(d.stage_name)}</span>` : ''}
        ${d.value != null ? `<span class="contact-deal-value">${fmtMoney(d.value)}</span>` : ''}
      </div>
    </div>`).join('');
}

/* ── The contact's tasks ───────────────────────────────────────────────── */

// The workspace's task statuses (edited in Settings), else the built-in four.
function contactTaskStatuses() {
  const ws = typeof currentWorkspace !== 'undefined' ? currentWorkspace?.task_statuses : null;
  return (Array.isArray(ws) && ws.length) ? ws : DEFAULT_TASK_STATUSES;
}

// Pure: the status a task is in. The last status in the list counts as "done".
function contactTaskStatus(task, statuses) {
  const list = Array.isArray(statuses) ? statuses : [];
  const i = list.findIndex(s => s.key === task.status);
  if (i < 0) return { label: task.status || '', color: 'var(--ink-subtle)', isDone: false };
  return { label: list[i].label, color: list[i].color, isDone: i === list.length - 1 };
}

function openTaskCount(list) {
  const statuses = contactTaskStatuses();
  return (list || []).filter(x => !x.parent_id && !contactTaskStatus(x, statuses).isDone).length;
}

// Compact rows: open tasks first (soonest due date first, undated last), done ones after.
function renderContactTasks(list) {
  if (!list?.length) return `<p class="empty-inline">${t('no_tasks_hint')}</p>`;
  const statuses = contactTaskStatuses();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueKey = x => x.due_date ? new Date(x.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  const rows = list.filter(x => !x.parent_id).map(x => ({ ...x, st: contactTaskStatus(x, statuses) }));
  rows.sort((a, b) => (a.st.isDone - b.st.isDone) || (dueKey(a) - dueKey(b)));
  if (!rows.length) return `<p class="empty-inline">${t('no_tasks_hint')}</p>`;
  return rows.map(x => {
    const overdue = x.due_date && !x.st.isDone && new Date(x.due_date) < today;
    return `<div class="contact-task-row${x.st.isDone ? ' is-done' : ''}" role="button" tabindex="0" title="${esc(x.st.label)}" onclick="openTaskModal(${x.id})" onkeydown="if(event.key==='Enter'){this.click();}">
      <span class="contact-task-dot" style="background:${esc(x.st.color)}"></span>
      <span class="contact-task-title">${esc(x.title)}</span>
      ${x.due_date ? `<span class="task-due${overdue ? ' overdue' : ''}">${fmtDate(x.due_date)}</span>` : ''}
    </div>`;
  }).join('');
}

// Re-render the open record's Tasks block after a task was saved or deleted from the task modal.
async function refreshContactTasks() {
  const el = document.getElementById('contact-tasks-list'); if (!el) return;
  const id = Number(el.dataset.contactId); if (!id) return;
  const list = await api.get(`/api/tasks?contact_id=${id}`);
  if (!Array.isArray(list)) return;
  el.innerHTML = renderContactTasks(list);
  const count = document.getElementById('contact-tasks-count');
  if (count) { const open = openTaskCount(list); count.textContent = open ? String(open) : ''; }
  openDetailBlock('tasks');                // the change must be visible even if the block was folded
}

async function openDealModalForContact(contactId) {
  if (!pipelines.length) pipelines = await api.get('/api/pipelines');
  await openDealModal(null);
  const sel = document.getElementById('df-contact');
  if (sel) { sel.value = contactId; refreshPicker('df-contact'); onDealContactChange(); }
}

function truncateActivityPreview(html, maxChars = 120, maxLines = 3) {
  const div = document.createElement('div');
  div.innerHTML = sanitizeNoteHtml(html);   // a detached div still loads <img onerror>; sanitise first
  let text = div.innerText;

  const lines = text.split('\n').slice(0, maxLines).join('\n');
  if (lines.length > maxChars) {
    return esc(lines.substring(0, maxChars)) + '...';
  }
  if (text.split('\n').length > maxLines) {
    return esc(lines) + '...';
  }
  return esc(lines);
}

function renderMiniActs(acts) {
  if (!acts?.length) return `<p class="empty-inline">${t('no_activities')}</p>`;
  return acts.map(a => `
    <div class="mini-act" onclick="editActivity(${a.id})" style="cursor:pointer;transition:all 0.2s" onmouseover="this.style.background='var(--primary-light)'" onmouseout="this.style.background='var(--bg)'">
      <span class="mini-act-type">${t('act_' + a.type)}</span>
      <div style="flex:1">
        <div class="mini-act-content" style="white-space:pre-wrap;overflow:hidden">${truncateActivityPreview(a.content)}</div>
        <div class="mini-act-date">${fmtDate(a.created_at)}${a.logged_by_name ? ` · ${t('logged_by')} ${esc(a.logged_by_name)}` : ''}</div>
      </div>
    </div>`).join('');
}

function toggleContactNoteForm(contactId) {
  const wrapper = document.getElementById('contact-note-form-wrapper');
  if (!wrapper) return;
  openDetailBlock('notes');                // the form must be visible even if the block was folded
  wrapper.classList.toggle('hidden');
  if (!wrapper.classList.contains('hidden')) {
    defaultNoDate(document.getElementById('contact-activity-no-date'));
    document.getElementById('contact-activity-content')?.focus();
  }
}

function formatContactActivityNote(cmd) {
  document.execCommand(cmd, false, null);
  document.getElementById('contact-activity-content')?.focus();
}

async function saveContactActivity() {
  const contactId = document.getElementById('contact-activity-contact-id').value;
  if (!contactId) { console.error('No contactId'); return; }
  const contentEl = document.getElementById('contact-activity-content');
  if (!contentEl) { console.error('contact-activity-content not found'); return; }
  const content = contentEl.innerHTML.trim();
  if (!content || content === '<br>') return;
  const type = document.getElementById('contact-activity-type')?.value || 'note';
  const noDate = document.getElementById('contact-activity-no-date')?.checked;
  const event_date = noDate ? null : (document.getElementById('contact-activity-date')?.value || null);
  await api.post('/api/activities', { contact_id: parseInt(contactId), type, content, event_date });
  contentEl.innerHTML = '';
  const dateEl = document.getElementById('contact-activity-date');
  if (dateEl) dateEl.value = '';
  defaultNoDate(document.getElementById('contact-activity-no-date'));
  const wrapper = document.getElementById('contact-note-form-wrapper');
  if (wrapper) wrapper.classList.add('hidden');
  const c = await api.get(`/api/contacts/${parseInt(contactId)}`);
  const actsEl = document.getElementById('detail-acts');
  if (actsEl) {
    actsEl.innerHTML = renderDealTimeline(c.activities, false);
  }
  const showAll = document.getElementById('contact-show-all-btn');
  if (showAll) showAll.textContent = `${t('btn_show_all')} (${c.activities?.length || 0})`;
}

async function toggleContactShowAllNotes(contactId) {
  if (!contactId) return;
  try {
    const c = await api.get(`/api/contacts/${parseInt(contactId)}`);
    openAllNotesModal(c.activities || []);
  } catch (e) {
    console.error('Error loading all notes:', e);
  }
}

async function editActivity(activityId) {
  const activity = await api.get(`/api/activities/${activityId}`);
  if (!activity) {
    alert('Activity not found');
    return;
  }

  let contactId = document.getElementById('detail-acts')?.dataset.contactId;
  if (!contactId) contactId = document.getElementById('deal-activities-list')?.dataset.contactId;
  window.currentEditActivityContactId = contactId;
  window.currentEditActivityId = activityId;

  const dealModal = document.getElementById('deal-modal');
  const isInDealView = dealModal && !dealModal.classList.contains('hidden');

  if (isInDealView) {
    showActivityEditModal(activity);
  } else {
    const panel = document.getElementById('side-panel-body');
    if (!panel) return;

  panel.innerHTML = `
    <div style="padding:0;display:flex;flex-direction:column;height:100%">
      <div style="padding:16px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="font-weight:600;font-size:14px">Edit Activity</div>
      </div>
      <div style="overflow-y:auto;flex:1;padding:16px">
        <div class="form-group">
          <label>Type</label>
          <select id="act-type-edit" class="field-input">
            <option value="note" ${activity.type === 'note' ? 'selected' : ''}>Note</option>
            <option value="call" ${activity.type === 'call' ? 'selected' : ''}>Call</option>
            <option value="email" ${activity.type === 'email' ? 'selected' : ''}>Email</option>
            <option value="whatsapp" ${activity.type === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
          </select>
        </div>
        <div class="form-group">
          <label>Content</label>
          <div class="note-editor-toolbar" style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap">
            <button type="button" class="fmt-btn" onclick="formatActivityNote('bold')" title="Bold"><strong>B</strong></button>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('italic')" title="Italic"><em>I</em></button>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('underline')" title="Underline"><u>U</u></button>
            <div style="width:1px;background:var(--border)"></div>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('insertUnorderedList')" title="List">• List</button>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('createLink')" title="Link">🔗 Link</button>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('removeFormat')" title="Clear">✕ Clear</button>
          </div>
          <div id="act-content-edit" class="note-editor" contenteditable="true">${sanitizeNoteHtml(activity.content)}</div>
        </div>
        <div style="color:var(--muted);font-size:12px;margin-top:12px">
          Logged by ${esc(activity.logged_by_name || 'Unknown')} on ${fmtDate(activity.created_at)}
        </div>
      </div>
      <div style="padding:12px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">
        <button class="btn btn-secondary btn-sm" onclick="confirmDiscardEdit()">Cancel</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteActivity()">Delete</button>
        <button class="btn btn-primary btn-sm" onclick="saveActivityEdit()">Save</button>
      </div>
    </div>`;
  }
}

function showActivityEditModal(activity) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'activity-edit-modal';
  modal.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <h2>Edit Activity</h2>
        <button class="close-btn" onclick="document.getElementById('activity-edit-modal')?.remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Type</label>
          <select id="act-type-edit" class="field-input">
            <option value="note" ${activity.type === 'note' ? 'selected' : ''}>Note</option>
            <option value="call" ${activity.type === 'call' ? 'selected' : ''}>Call</option>
            <option value="email" ${activity.type === 'email' ? 'selected' : ''}>Email</option>
            <option value="whatsapp" ${activity.type === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
          </select>
        </div>
        <div class="form-group">
          <label>Content</label>
          <div class="note-editor-toolbar">
            <button type="button" class="fmt-btn" onclick="formatActivityNote('bold')" title="Bold"><strong>B</strong></button>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('italic')" title="Italic"><em>I</em></button>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('underline')" title="Underline"><u>U</u></button>
            <div class="fmt-divider"></div>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('insertUnorderedList')" title="List">• List</button>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('createLink')" title="Link">🔗 Link</button>
            <button type="button" class="fmt-btn" onclick="formatActivityNote('removeFormat')" title="Clear">✕ Clear</button>
          </div>
          <div id="act-content-edit" class="note-editor note-editor-tall" contenteditable="true">${sanitizeNoteHtml(activity.content)}</div>
        </div>
        <div class="text-xs text-muted">
          Logged by ${esc(activity.logged_by_name || 'Unknown')} on ${fmtDate(activity.created_at)}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" onclick="closeActivityEditModal()">Cancel</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteActivity()">Delete</button>
        <button class="btn btn-primary btn-sm" onclick="saveActivityEdit()">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('act-content-edit')?.focus();
}

function closeActivityEditModal() {
  document.getElementById('activity-edit-modal')?.remove();
}

function formatActivityNote(cmd) {
  document.execCommand(cmd, false, null);
  document.getElementById('act-content-edit')?.focus();
}

function confirmDiscardEdit() {
  const dealModal = document.getElementById('deal-modal');
  if (dealModal && !dealModal.classList.contains('hidden')) {
    closeActivityEditModal();
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'discard-modal';
  modal.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2>Discard Changes?</h2>
        <button class="close-btn" onclick="document.getElementById('discard-modal')?.remove()">&times;</button>
      </div>
      <div style="padding:20px;background:var(--card-bg)">
        <p style="margin-bottom:20px;color:var(--text)">Do you want to discard your changes and go back?</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="document.getElementById('discard-modal')?.remove()">Keep Editing</button>
          <button class="btn btn-danger" onclick="discardAndGoBack(); document.getElementById('discard-modal')?.remove()">Discard</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function discardAndGoBack() {
  const contactId = window.currentEditActivityContactId;
  if (!contactId) return;
  const dealModal = document.getElementById('deal-modal');
  if (dealModal && !dealModal.classList.contains('hidden')) {
    await loadDealActivities(contactId);
    closeSidePanel();
  } else {
    openDetail(contactId);
  }
}

async function confirmDeleteActivity() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2>Delete Activity?</h2>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div style="padding:20px;background:var(--card-bg)">
        <p style="margin-bottom:20px;color:var(--text)">This action cannot be undone.</p>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
          <button class="btn btn-danger" onclick="deleteActivityConfirmed()">Delete</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function deleteActivityConfirmed() {
  const modal = document.querySelector('.modal-overlay');
  if (modal) modal.remove();
  const activityId = window.currentEditActivityId;
  const contactId = window.currentEditActivityContactId;
  if (activityId) {
    await api.del(`/api/activities/${activityId}`);
    if (contactId) {
      const dealModal = document.getElementById('deal-modal');
      if (dealModal && !dealModal.classList.contains('hidden')) {
        await loadDealActivities(contactId);
        closeSidePanel();
      } else {
        openDetail(contactId);
      }
    }
  }
}

async function saveActivityEdit() {
  const contentEl = document.getElementById('act-content-edit');
  const typeEl = document.getElementById('act-type-edit');
  if (!contentEl || !typeEl) return;

  const content = contentEl.innerHTML.trim();
  if (!content || content === '<br>') {
    alert('Please enter some content');
    return;
  }

  const type = typeEl.value;
  const activityId = window.currentEditActivityId;
  const contactId = window.currentEditActivityContactId;

  const result = await api.patch(`/api/activities/${activityId}`, { type, content });

  if (result.error) {
    alert('Error saving activity: ' + result.error);
    return;
  }

  if (contactId) {
    const dealModal = document.getElementById('deal-modal');
    if (dealModal && !dealModal.classList.contains('hidden')) {
      await loadDealActivities(contactId);
      closeSidePanel();
    } else {
      openDetail(contactId);
    }
  }
}

function renderDealFieldInput(f, value = '') {
  const id = `dfield-${f.field_key}`;
  if (f.type === 'dropdown') return `<select id="${id}"><option value="">${t('opt_select')}</option>
    ${(f.options||[]).map(o => `<option value="${esc(o)}"${value===o?' selected':''}>${esc(o)}</option>`).join('')}
  </select>`;
  const typeMap = { text:'text', email:'email', phone:'tel', number:'number', date:'date', url:'url' };
  return `<input type="${typeMap[f.type]||'text'}" id="${id}" value="${esc(value)}" />`;
}

async function renderContactPanelReadOnly(contact) {
  const panel = document.getElementById('deal-contact-panel'); if (!panel) return;
  if (!contact) {
    delete panel.dataset.contactId;
    panel.innerHTML = `<div class="contact-card contact-card-empty">${t('deal_no_contact_hint')}</div>`;
    return;
  }
  panel.innerHTML = `<div class="contact-card"><div class="contact-card-head"><div class="contact-card-avatar"></div><div class="contact-card-name">${t('loading')}</div></div></div>`;
  await Promise.all([ensureFields(), ensureMembers()]);   // the card lists every custom field; the owner pill lists the members
  const full = await api.get(`/api/contacts/${contact.id}`);
  if (!full || full.error) {
    delete panel.dataset.contactId;
    panel.innerHTML = `<div class="contact-card contact-card-empty">${t('deal_no_contact_hint')}</div>`;
    return;
  }
  // The same record card as the side panel: every value edits in place, the assignee is the
  // owner pill, the rest folds under "Contact information". The deal surface only changes the
  // ⋯ menu (its own "Edit all fields" form) and the fold's id.
  panel.dataset.contactId = full.id;
  panel.innerHTML = contactDetailCardHtml(full, full.id, { surface: 'deal' });
}

function formatContactNote(cmd) {
  document.execCommand(cmd, false, null);
  document.getElementById('cpanel-act-content')?.focus();
}

async function logContactPanelNote(contactId) {
  const contentEl = document.getElementById('cpanel-act-content');
  if (!contentEl) return;
  const content = contentEl.innerHTML.trim();
  if (!content || content === '<br>') return;
  const type = document.getElementById('cpanel-act-type')?.value || 'note';
  const btn = document.getElementById('cpanel-log-btn'); if (btn) btn.disabled = true;
  await api.post('/api/activities', { contact_id: contactId, type, content });
  if (contentEl) contentEl.innerHTML = '';
  if (btn) btn.disabled = false;
  const fresh = await api.get(`/api/contacts/${contactId}`);
  const actsEl = document.getElementById('cpanel-acts'); if (actsEl) actsEl.innerHTML = renderMiniActs(fresh.activities);
  contentEl?.focus();
}

const DEAL_NOTES_PREVIEW_COUNT = 5;

const _timelineIcons = { note: UI_ICON.note, call: UI_ICON.call, email: UI_ICON.mail, whatsapp: UI_ICON.chat };

function fmtEventDate(dt) {
  if (!dt) return '';
  const s = String(dt);
  const datePart = s.slice(0, 10);
  const parts = datePart.split('-');
  if (parts.length === 3) return `${parts[1]}-${parts[2]}-${parts[0]}`;
  return s;
}

function toDateInputValue(dt) {
  if (!dt) return '';
  return String(dt).slice(0, 10);
}

let mentionTimeout = null;
let mentionEl = null;

document.addEventListener('mousedown', e => {
  if (mentionEl && !e.target.closest('#mention-autocomplete')) {
    closeMentionAutocomplete();
  }
});

function closeMentionAutocomplete() {
  if (mentionEl) {
    mentionEl.remove();
    mentionEl = null;
  }
  if (mentionTimeout) { clearTimeout(mentionTimeout); mentionTimeout = null; }
}

document.addEventListener('input', e => {
  const editor = e.target.closest('.note-editor, .inline-edit-content');
  if (!editor || !editor.isContentEditable) return;
  if (mentionTimeout) clearTimeout(mentionTimeout);
  mentionTimeout = setTimeout(() => checkForMention(editor), 180);
});

document.addEventListener('keydown', e => {
  if (!mentionEl) return;
  const editor = e.target.closest('.note-editor, .inline-edit-content');
  if (!editor) { closeMentionAutocomplete(); return; }

  if (e.key === 'Escape') {
    closeMentionAutocomplete();
    return;
  }

  if (e.key === ' ' || e.key === 'Backspace') {
    closeMentionAutocomplete();
    return;
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
    const items = mentionEl.querySelectorAll('.mention-item');
    const active = mentionEl.querySelector('.mention-item.active');
    let idx = Array.from(items).indexOf(active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (idx + 1) % items.length;
      items.forEach(i => i.classList.remove('active'));
      items[next].classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (idx - 1 + items.length) % items.length;
      items.forEach(i => i.classList.remove('active'));
      items[prev].classList.add('active');
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      selectMention(editor, active);
    }
  }
});

function checkForMention(editor) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !editor.contains(sel.anchorNode)) { closeMentionAutocomplete(); return; }

  const textNode = sel.anchorNode;
  if (textNode.nodeType !== 3) { closeMentionAutocomplete(); return; }

  const text = textNode.textContent || '';
  const cursorOffset = sel.anchorOffset;
  const textBefore = text.slice(0, cursorOffset);

  const match = textBefore.match(/@(\w*)$/);
  if (!match) {
    closeMentionAutocomplete();
    return;
  }

  const query = match[1] || '';
  showMentionDropdown(editor, query);
}

function showMentionDropdown(editor, query) {
  closeMentionAutocomplete();
  if (!members.length) return;

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  );
  if (!filtered.length) return;

  const rect = editor.getBoundingClientRect();

  mentionEl = document.createElement('div');
  mentionEl.id = 'mention-autocomplete';
  mentionEl.className = 'mention-autocomplete';
  mentionEl.innerHTML = filtered.map(m => `
    <div class="mention-item" data-name="${esc(m.name)}" data-id="${m.id}">
      <span class="mention-item-avatar">${esc(m.name[0]?.toUpperCase() || '?')}</span>
      <span class="mention-item-name">${esc(m.name)}</span>
      ${m.id === currentUser?.id ? '<span class="mention-item-you">(you)</span>' : ''}
    </div>
  `).join('');
  if (mentionEl.firstElementChild) mentionEl.firstElementChild.classList.add('active');
  mentionEl.style.left = `${rect.left + 16}px`;
  mentionEl.style.top = `${rect.top - Math.min(filtered.length * 36 + 8, 200)}px`;

  mentionEl.querySelectorAll('.mention-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      selectMention(editor, item);
    });
    item.addEventListener('mouseenter', () => {
      mentionEl.querySelectorAll('.mention-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  document.body.appendChild(mentionEl);
}

function selectMention(editor, item) {
  const name = item.dataset.name;
  closeMentionAutocomplete();

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const textNode = sel.anchorNode;
  if (textNode.nodeType !== 3) return;

  const text = textNode.textContent || '';
  const offset = sel.anchorOffset;
  const before = text.slice(0, offset);
  const after = text.slice(offset);

  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return;

  const newText = before.slice(0, atIdx) + '@' + name + ' ' + after;
  textNode.textContent = newText;

  const newOffset = atIdx + name.length + 2;
  const range = document.createRange();
  range.setStart(textNode, Math.min(newOffset, newText.length));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  editor.focus();
}

const DEAL_NOTE_PREVIEW_LINES = 3;

function _countNoteLines(html = '') {
  const raw = String(html || '');
  if (!raw.trim()) return 0;
  const breaks = (raw.match(/<br\s*\/?>/gi) || []).length
    + (raw.match(/<\/(div|p|li|h[1-6]|tr)>/gi) || []).length
    + (raw.match(/\n/g) || []).length;
  return Math.max(1, breaks + 1);
}

function renderTimelineItem(a, options = {}) {
  const { fullContent = false } = options;
  const shouldCollapse = !fullContent && _countNoteLines(a.content) > DEAL_NOTE_PREVIEW_LINES;
  return `
    <div class="deal-timeline-item" data-activity-id="${a.id}" onclick="inlineEditDealNote(${a.id}, this)">
      <div class="deal-timeline-icon type-${a.type}">${_timelineIcons[a.type] || UI_ICON.note}</div>
      <div class="deal-timeline-body">
        <div class="deal-timeline-header">
          <span class="deal-timeline-type type-${a.type}">${t('act_' + a.type)}</span>
          <span class="deal-timeline-date">${fmtEventDate(String(a.created_at).split('T')[0].split(' ')[0])}</span>
        </div>
        ${a.event_date ? `<div class="deal-event-date-badge">${UI_ICON.calendar}${fmtEventDate(a.event_date)}</div>` : ''}
        <div class="deal-timeline-content ${shouldCollapse ? 'collapsed' : ''}">${sanitizeNoteHtml(a.content)}</div>
        ${shouldCollapse ? `<button type="button" class="deal-note-expand-btn" onclick="event.stopPropagation();toggleDealNoteExpand(this)">${t('show_more')}</button>` : ''}
        ${a.logged_by_name ? `<div class="deal-timeline-author">${t('logged_by')} ${esc(a.logged_by_name)}</div>` : ''}
        <div class="deal-comment-section" onclick="event.stopPropagation()">
          <button type="button" class="deal-comment-toggle-btn" aria-expanded="false" onclick="event.stopPropagation();toggleActivityComments(${a.id}, this)">${UI_ICON.chat}<span>${t('btn_comment')}</span></button>
          <div class="deal-comments-container hidden" id="deal-comments-${a.id}">
            <div class="deal-comments-loading">${t('loading')}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderDealTimeline(acts, showAll) {
  if (!acts?.length) return `<p class="empty-inline center">${t('no_activities_hint')}</p>`;
  const visible = showAll ? acts : acts.slice(0, DEAL_NOTES_PREVIEW_COUNT);
  return visible.map(a => renderTimelineItem(a, { fullContent: false })).join('');
}

function toggleDealNoteExpand(btn) {
  const content = btn.closest('.deal-timeline-body')?.querySelector('.deal-timeline-content');
  if (!content) return;
  const isCollapsed = content.classList.toggle('collapsed');
  btn.textContent = isCollapsed ? t('show_more') : t('show_less');
}

async function loadDealActivities(contactId) {
  const container = document.getElementById('deal-activities-list');
  if (!container) return;
  container.dataset.contactId = contactId;
  try {
    const c = await api.get(`/api/contacts/${contactId}`);
    container.innerHTML = renderDealTimeline(c.activities, false);
    updateShowAllBtn(c.activities?.length || 0);
  } catch (e) {
    console.error('Error loading activities:', e);
    container.innerHTML = `<p class="empty-inline center text-danger">${t('err_load_activities')}</p>`;
  }
}

function updateShowAllBtn(total) {
  const btn = document.getElementById('deal-show-all-btn');
  if (!btn) return;
  btn.style.display = '';
  btn.textContent = total > 0 ? `${t('btn_show_all')} (${total})` : t('btn_show_all');
}

async function toggleShowAllDealNotes() {
  const contactId = document.getElementById('deal-activity-deal-id')?.value;
  if (!contactId) return;
  try {
    const c = await api.get(`/api/contacts/${parseInt(contactId)}`);
    openAllNotesModal(c.activities || []);
  } catch (e) {
    console.error('Error loading all notes:', e);
  }
}

function openAllNotesModal(acts) {
  document.getElementById('all-notes-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'all-notes-modal';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  const items = acts?.length
    ? acts.map(a => renderTimelineItem(a, { fullContent: true })).join('')
    : `<div class="empty-state compact">${t('no_activities')}</div>`;
  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h2>${t('all_notes_title')}</h2>
        <button class="close-btn" onclick="document.getElementById('all-notes-modal')?.remove()">&times;</button>
      </div>
      <div class="deal-timeline">${items}</div>
    </div>`;
  document.body.appendChild(modal);
}

async function inlineEditDealNote(activityId, el) {
  if (el.classList.contains('editing')) return;
  const activity = await api.get(`/api/activities/${activityId}`);
  if (!activity) return;

  window.currentEditActivityId = activityId;
  const container = el.closest('[data-contact-id]');
  const contactId = container?.dataset.contactId
    || document.getElementById('deal-activity-deal-id')?.value;
  window.currentEditActivityContactId = contactId;

  el.classList.add('editing');
  el.onclick = null;
  const typeOpt = v => `<option value="${v}" ${activity.type === v ? 'selected' : ''}>${t('act_' + v)}</option>`;
  el.innerHTML = `
    <div class="deal-timeline-icon type-${activity.type}">${_timelineIcons[activity.type] || UI_ICON.note}</div>
    <div class="deal-timeline-body inline-edit-body">
      <div class="field-row">
        <select class="inline-edit-type field-input-sm">${['note', 'call', 'email', 'whatsapp'].map(typeOpt).join('')}</select>
        <input type="date" class="inline-edit-date field-input-sm" value="${toDateInputValue(activity.event_date)}" ${activity.event_date ? '' : 'disabled'} />
        <label class="checkbox-label" title="${esc(t('no_date_hint'))}">
          <input type="checkbox" class="inline-edit-no-date" ${activity.event_date ? '' : 'checked'} onchange="toggleInlineNoDate(this)" /> ${t('no_date')}
        </label>
      </div>
      <div class="note-editor-toolbar inline-edit-toolbar">
        <button type="button" class="fmt-btn" onclick="event.stopPropagation();document.execCommand('bold',false,null)" title="${esc(t('fmt_bold'))}"><strong>B</strong></button>
        <button type="button" class="fmt-btn" onclick="event.stopPropagation();document.execCommand('italic',false,null)" title="${esc(t('fmt_italic'))}"><em>I</em></button>
        <button type="button" class="fmt-btn" onclick="event.stopPropagation();document.execCommand('underline',false,null)" title="${esc(t('fmt_underline'))}"><u>U</u></button>
      </div>
      <div class="note-editor inline-edit-content" contenteditable="true"
        onkeydown="if(event.key==='Enter'&&event.ctrlKey){event.preventDefault();saveInlineEdit(this.closest('.deal-timeline-item'));}">${sanitizeNoteHtml(activity.content)}</div>
      <div class="inline-edit-actions">
        <button type="button" class="btn btn-sm" onclick="event.stopPropagation();cancelInlineEdit()">${t('btn_cancel')}</button>
        <button type="button" class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteInlineEdit()">${t('btn_delete')}</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="event.stopPropagation();saveInlineEdit(this.closest('.deal-timeline-item'))">${t('btn_save')}</button>
      </div>
      <div class="inline-edit-meta">${activity.logged_by_name ? `${t('logged_by')} ${esc(activity.logged_by_name)} · ` : ''}${fmtDate(activity.created_at)}</div>
    </div>`;
  el.querySelector('.inline-edit-content')?.focus();
  const editor = el.querySelector('.inline-edit-content');
  if (editor) {
    editor.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

async function saveInlineEdit(el) {
  if (!el) return;
  const content = el.querySelector('.inline-edit-content')?.innerHTML.trim();
  const type = el.querySelector('.inline-edit-type')?.value || 'note';
  if (!content || content === '<br>') { alert(t('enter_content')); return; }
  const noDateCb = el.querySelector('.inline-edit-no-date');
  const event_date = (noDateCb && noDateCb.checked) ? null : (el.querySelector('.inline-edit-date')?.value || null);
  const activityId = window.currentEditActivityId;
  const contactId = window.currentEditActivityContactId;
  await api.patch(`/api/activities/${activityId}`, { type, content, event_date });
  if (contactId) {
    const dealModal = document.getElementById('deal-modal');
    if (dealModal && !dealModal.classList.contains('hidden')) {
      await loadDealActivities(parseInt(contactId));
    } else {
      const c = await api.get(`/api/contacts/${parseInt(contactId)}`);
      const actsEl = document.getElementById('detail-acts');
      if (actsEl) actsEl.innerHTML = renderDealTimeline(c.activities, false);
    }
  }
  refreshAllNotesModal(contactId);
}

function cancelInlineEdit() {
  const contactId = window.currentEditActivityContactId || document.getElementById('deal-activity-deal-id')?.value;
  if (contactId) {
    const dealModal = document.getElementById('deal-modal');
    if (dealModal && !dealModal.classList.contains('hidden')) {
      loadDealActivities(parseInt(contactId));
    } else {
      refreshContactTimeline(parseInt(contactId));
    }
  }
}

async function refreshContactTimeline(contactId) {
  const c = await api.get(`/api/contacts/${contactId}`);
  const actsEl = document.getElementById('detail-acts');
  if (actsEl) actsEl.innerHTML = renderDealTimeline(c.activities, false);
}

async function deleteInlineEdit() {
  const activityId = window.currentEditActivityId;
  const contactId = window.currentEditActivityContactId;
  if (!confirm(t('confirm_delete_activity'))) return;
  await api.del(`/api/activities/${activityId}`);
  if (contactId) {
    const dealModal = document.getElementById('deal-modal');
    if (dealModal && !dealModal.classList.contains('hidden')) {
      await loadDealActivities(parseInt(contactId));
    } else {
      await refreshContactTimeline(parseInt(contactId));
    }
  }
  refreshAllNotesModal(contactId);
}

async function refreshAllNotesModal(contactId) {
  const modal = document.getElementById('all-notes-modal');
  if (!modal || !contactId) return;
  try {
    const c = await api.get(`/api/contacts/${parseInt(contactId)}`);
    const timeline = modal.querySelector('.deal-timeline');
    if (timeline) {
      const acts = c.activities || [];
      timeline.innerHTML = acts.length
        ? acts.map(a => renderTimelineItem(a, { fullContent: true })).join('')
        : `<div class="empty-state compact">${t('no_activities')}</div>`;
    }
  } catch(e) { console.error(e); }
}

function toggleDealNoteForm() {
  const wrapper = document.getElementById('deal-note-form-wrapper');
  if (!wrapper) return;
  wrapper.classList.toggle('hidden');
  if (!wrapper.classList.contains('hidden')) {
    defaultNoDate(document.getElementById('deal-activity-no-date'));
    document.getElementById('deal-activity-content')?.focus();
  }
}

async function formatDealNote(cmd) {
  document.execCommand(cmd, false, null);
  document.getElementById('deal-activity-content')?.focus();
}

async function saveDealActivity() {
  const contactId = document.getElementById('deal-activity-deal-id').value;
  if (!contactId) { console.error('No contactId in deal-activity-deal-id'); return; }
  const contentEl = document.getElementById('deal-activity-content');
  if (!contentEl) { console.error('deal-activity-content not found'); return; }
  const content = contentEl.innerHTML.trim();
  if (!content || content === '<br>') return;
  const type = document.getElementById('deal-activity-type')?.value || 'note';
  const noDate = document.getElementById('deal-activity-no-date')?.checked;
  const event_date = noDate ? null : (document.getElementById('deal-activity-date')?.value || null);
  await api.post('/api/activities', { contact_id: parseInt(contactId), type, content, event_date });
  contentEl.innerHTML = '';
  const dateEl = document.getElementById('deal-activity-date');
  if (dateEl) dateEl.value = '';
  defaultNoDate(document.getElementById('deal-activity-no-date'));
  const wrapper = document.getElementById('deal-note-form-wrapper');
  if (wrapper) wrapper.classList.add('hidden');
  await loadDealActivities(parseInt(contactId));
}

async function editContactPanel(contactId) {
  await Promise.all([ensureFields(), ensureMembers()]);
  const contact = contacts.find(c => c.id === contactId) || await api.get(`/api/contacts/${contactId}`);
  const panel = document.getElementById('deal-contact-panel'); if (!panel) return;
  const assigneeOptions = `<option value="">${t('opt_unassigned')}</option>` +
    members.map(m => `<option value="${m.id}"${contact.assigned_to === m.id ? ' selected' : ''}>${esc(m.name)}${m.id === currentUser?.id ? ` ${t('you_marker')}` : ''}</option>`).join('');
  const customInputs = fields.map(f => `
    <div class="form-group"><label for="cpfield-${f.field_key}">${esc(f.name)}</label>
      <input type="text" id="cpfield-${f.field_key}" value="${esc(contact.custom_data?.[f.field_key] || '')}" /></div>`).join('');
  panel.innerHTML = `
    <div class="contact-card">
      <div class="contact-card-head">
        <div class="contact-card-avatar" aria-hidden="true">${esc(initials(contact.name))}</div>
        <div class="contact-card-id"><div class="contact-card-name">${t('edit_contact_title')}</div><div class="contact-card-company">${esc(contact.name)}</div></div>
      </div>
      <div class="contact-card-form">
        <div class="form-group"><label for="cpanel-name">${t('lbl_name')} <span class="req">*</span></label><input type="text" id="cpanel-name" value="${esc(contact.name)}" /></div>
        <div class="form-group"><label for="cpanel-company">${t('lbl_company')}</label><input type="text" id="cpanel-company" value="${esc(contact.company||'')}" /></div>
        <div class="form-group"><label for="cpanel-email">${t('lbl_email')}</label><input type="email" id="cpanel-email" value="${esc(contact.email||'')}" /></div>
        <div class="form-group"><label for="cpanel-phone">${t('lbl_phone')}</label><input type="tel" id="cpanel-phone" value="${esc(contact.phone||'')}" /></div>
        <div class="form-group"><label for="cpanel-assignee">${t('lbl_assignee')}</label>
          <select id="cpanel-assignee">${assigneeOptions}</select></div>
        ${customInputs}
      </div>
      <div class="contact-card-foot">
        <button type="button" class="btn btn-sm" onclick="cancelContactPanelEdit(${contactId})">${t('btn_cancel')}</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="saveContactPanel(${contactId})">${t('btn_save')}</button>
      </div>
    </div>`;
}

async function saveContactPanel(contactId) {
  const nameEl = document.getElementById('cpanel-name');
  if (!nameEl?.value.trim()) { alert(t('name_required')); return; }
  const custom_data = {};
  fields.forEach(f => { const el = document.getElementById(`cpfield-${f.field_key}`); if (el) custom_data[f.field_key] = el.value; });
  const payload = {
    name:        nameEl.value.trim(),
    company:     document.getElementById('cpanel-company')?.value || '',
    email:       document.getElementById('cpanel-email')?.value   || '',
    phone:       document.getElementById('cpanel-phone')?.value   || '',
    assigned_to: parseInt(document.getElementById('cpanel-assignee')?.value) || null,
    custom_data,
  };
  const btn = document.querySelector('#deal-contact-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = t('saving'); }
  const res = await api.put(`/api/contacts/${contactId}`, payload);
  if (res.error) { alert(res.error); if (btn) { btn.disabled = false; btn.textContent = t('btn_save'); } return; }
  const c = contacts.find(c => c.id === contactId);
  if (c) {
    Object.assign(c, payload);
    c.assigned_to_name = members.find(m => m.id === payload.assigned_to)?.name || null;
  }
  renderContactPanelReadOnly(c || { id: contactId, ...payload });
}

function cancelContactPanelEdit(contactId) {
  renderContactPanelReadOnly(contacts.find(c => c.id === contactId) || null);
}

function onDealContactChange() {
  const contactId = parseInt(document.getElementById('df-contact').value) || null;
  renderContactPanelReadOnly(contacts.find(c => c.id === contactId) || null);
}

/* ── Segmented controls in the deal view ────────────────────────────────────
   Each writes to a hidden <select> that the save / read code already uses:
   #df-urgency (urgency) and #deal-activity-type (note type).                */
function renderSegFromSelect(segId, selectId, itemHtml) {
  const seg = document.getElementById(segId), sel = document.getElementById(selectId);
  if (!seg || !sel) return;
  seg.innerHTML = [...sel.options].map(o =>
    `<button type="button" class="seg-btn" role="radio" aria-checked="${o.selected}" data-value="${esc(o.value)}"
       onclick="setSegValue('${segId}','${selectId}',this.dataset.value)">${itemHtml(o)}</button>`).join('');
}
function syncSegFromSelect(segId, selectId) {
  const seg = document.getElementById(segId), sel = document.getElementById(selectId);
  if (!seg || !sel) return;
  seg.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === sel.value)));
}
function setSegValue(segId, selectId, value) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
  syncSegFromSelect(segId, selectId);
}
function renderUrgencySeg() {
  renderSegFromSelect('df-urgency-seg', 'df-urgency', o => `<span class="urgency-dot urgency-dot-${esc(o.value)}"></span><span>${esc(o.textContent)}</span>`);
}
function renderNoteTypeSeg() {
  renderSegFromSelect('deal-activity-type-seg', 'deal-activity-type', o => `<span>${esc(o.textContent)}</span>`);
}
// Kept under its old name: callers only need "reflect #df-urgency in the UI".
function updateUrgencyDot() {
  const seg = document.getElementById('df-urgency-seg');
  if (seg && !seg.children.length) renderUrgencySeg();
  const sel = document.getElementById('df-urgency');
  if (!sel) return;
  syncSegFromSelect('df-urgency-seg', 'df-urgency');
  seg?.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === sel.value)));
}

/* ── Stage stepper: one pill per stage of the selected pipeline ─────────────
   #df-stage stays the source of truth (saveDeal reads it, the board presets
   it); the stepper only writes to it. Clicking the active stage clears it.  */
function renderStageStepper() {
  const wrap = document.getElementById('df-stage-stepper'), stageSel = document.getElementById('df-stage');
  if (!wrap || !stageSel) return;
  const pipelineId = parseInt(document.getElementById('df-pipeline')?.value, 10) || null;
  const stages = pipelines.find(p => p.id === pipelineId)?.stages || [];
  const current = stageSel.value;
  wrap.innerHTML = stages.length
    ? stages.map(s => `
      <button type="button" class="stage-step" role="radio" aria-checked="${String(s.id) === current}" onclick="setDealStage(${s.id})">
        <span class="col-dot" style="--stage:${esc(s.color || '')}"></span><span>${esc(s.name)}</span>
      </button>`).join('')
    : `<span class="stage-stepper-empty">${t('stage_none')}</span>`;
}
function setDealStage(stageId) {
  const stageSel = document.getElementById('df-stage');
  if (!stageSel) return;
  if (String(stageSel.value) === String(stageId)) return;
  stageSel.value = String(stageId);
  renderStageStepper();
}

function showDealFormError(msg) {
  const el = document.getElementById('deal-form-error');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

// opts.stageId: pre-select a stage of the current pipeline (the board's per-column "Add deal").
async function openDealModal(id, opts = {}) {
  const noteFormW = document.getElementById('deal-note-form-wrapper');
  if (noteFormW) noteFormW.classList.add('hidden');
  document.getElementById('deal-form').reset();
  document.getElementById('df-title').value = '';
  document.getElementById('deal-id').value = id || '';
  document.getElementById('deal-modal-title').textContent = t(id ? 'deal_edit' : 'deal_new');
  document.getElementById('deal-delete-btn').style.display = id ? '' : 'none';
  const addTaskBtn = document.getElementById('deal-add-task-btn');
  if (addTaskBtn) addTaskBtn.style.display = id ? '' : 'none';
  showDealFormError('');
  renderUrgencySeg();
  renderNoteTypeSeg();
  updateUrgencyDot();

  const [, , , pipelinesRes, dealFieldsRes, allContacts, allSuppliers, dealDataRes, objectsRes, objectFieldsRes] = await Promise.all([
    ensureContacts(),
    ensureMembers(),
    ensureFields(),
    pipelines.length ? null : api.get('/api/pipelines'),
    dealFields.length ? null : api.get('/api/deal-fields'),
    api.get('/api/contacts?contact_type=contact'),
    api.get('/api/contacts?contact_type=supplier'),
    id ? api.get(`/api/deals/${id}`) : null,
    objects.length ? null : api.get('/api/objects'),
    objectFields.length ? null : api.get('/api/object-fields'),
  ]);

  if (pipelinesRes) pipelines = pipelinesRes;
  if (dealFieldsRes) dealFields = dealFieldsRes;
  if (objectsRes) objects = objectsRes;
  if (objectFieldsRes) objectFields = objectFieldsRes;
  const dealData = dealDataRes;

  const pipelineSel = document.getElementById('df-pipeline');
  pipelineSel.innerHTML = pipelines.map(p =>
    `<option value="${p.id}"${currentPipelineId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  populateDealStages(pipelineSel.value ? parseInt(pipelineSel.value) : null, null);
  if (!id && opts.stageId) {
    if (currentPipelineId) pipelineSel.value = String(currentPipelineId);
    populateDealStages(parseInt(pipelineSel.value) || null, Number(opts.stageId));
  }

  const contactSel  = document.getElementById('df-contact');
  const supplierSel = document.getElementById('df-supplier');
  const supplierLabel = currentWorkspace?.supplier_name || t('lbl_supplier');
  const supLabelEl = document.getElementById('df-supplier-label');
  if (supLabelEl) supLabelEl.textContent = supplierLabel;
  // Options carry company · email as data-meta: the searchable pickers show and filter on it.
  const personOption = c => `<option value="${c.id}" data-meta="${esc([c.company, c.email].filter(Boolean).join(' · '))}">${esc(c.name)}</option>`;
  contactSel.innerHTML = `<option value="">${t('opt_no_contact')}</option>` + allContacts.map(personOption).join('');
  supplierSel.innerHTML = `<option value="">${esc(t('opt_none_named').replace('{name}', supplierLabel.replace(/s$/i, '')))}</option>` + allSuppliers.map(personOption).join('');
  attachPicker('df-contact',  { placeholder: t('search_contact_ph') });
  attachPicker('df-supplier', { placeholder: t('search_named_ph').replace('{name}', supplierLabel) });

  const assigneeSel = document.getElementById('df-assignee');
  assigneeSel.innerHTML = `<option value="">${t('opt_unassigned')}</option>` +
    members.map(m => `<option value="${m.id}"${m.id === currentUser?.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');

  // Custom fields join the label-left grid under a "More fields" divider.
  document.getElementById('df-custom-fields').innerHTML = dealFields.length
    ? `<div class="field-grid-sep">${t('more_fields')}</div>` + dealFields.map(f =>
        `<label for="dfield-${esc(f.field_key)}">${esc(f.name)}</label>${renderDealFieldInput(f, '')}`).join('')
    : '';

  let linkedContact = null, linkedObjects = [];

  if (dealData) {
    const d = dealData;
    document.getElementById('df-title').value = d.title;
    document.getElementById('df-value').value = d.value != null ? d.value : '';
    pipelineSel.value = d.pipeline_id || '';
    populateDealStages(d.pipeline_id, d.stage_id);
    contactSel.value  = d.contact_id  || '';
    supplierSel.value = d.supplier_id || '';
    refreshPicker('df-contact'); refreshPicker('df-supplier');
    assigneeSel.value = d.assigned_to || '';
    dealFields.forEach(f => { const el = document.getElementById(`dfield-${f.field_key}`); if (el) el.value = d.custom_data?.[f.field_key] ?? ''; });
    const urgSel = document.getElementById('df-urgency');
    if (urgSel) urgSel.value = String(d.urgency ?? 0);
    updateUrgencyDot();
    if (d.contact_id) {
      linkedContact = allContacts.find(c => c.id === d.contact_id) || null;
      document.getElementById('deal-activity-deal-id').value = d.contact_id;
      await loadDealActivities(d.contact_id);
    } else {
      document.getElementById('deal-activity-deal-id').value = '';
      document.getElementById('deal-activities-list').innerHTML = `<div class="empty-inline center">${t('deal_no_contact_hint')}</div>`;
    }
    linkedObjects = d.objects || [];
  } else {
    document.getElementById('deal-activity-deal-id').value = '';
    document.getElementById('deal-activities-list').innerHTML = `<div class="empty-inline center">${t('deal_save_first_hint')}</div>`;
  }
  renderStageStepper();

  renderContactPanelReadOnly(linkedContact);
  await renderObjectPanel(id, linkedObjects);
  document.getElementById('deal-modal').classList.remove('hidden');
}

async function renderObjectPanel(dealId, linkedObjects) {
  const label = document.getElementById('deal-object-panel-label');
  const body  = document.getElementById('deal-object-panel-body');
  if (!label || !body) return;

  const objName  = currentWorkspace?.object_name || 'Listings';
  const lower    = objName.toLowerCase();
  const singular = objName.replace(/s$/i, '');
  label.textContent = objName;
  linkedObjects = Array.isArray(linkedObjects) ? linkedObjects : [];

  if (!dealId) {
    body.innerHTML = `<div class="object-panel-empty">${esc(t('objects_save_first').replace('{name}', lower))}</div>`;
    return;
  }

  if (!objectFields.length) objectFields = await api.get('/api/object-fields');
  if (!objects.length)      objects      = await api.get('/api/objects');

  const linkedIds = new Set(linkedObjects.map(o => o.id));
  const available = objects.filter(o => !linkedIds.has(o.id));

  const cards = linkedObjects.length
    ? linkedObjects.map(o => {
        const customData = o.custom_data || {};
        const fieldRows = objectFields.map(f => {
          const raw = customData[f.field_key];
          if (raw === undefined || raw === null || raw === '') return '';         // empty values stay out of the card
          let val;
          if (f.type === 'date') { val = esc(fmtDate(raw)); }
          else if (f.type === 'checkbox') { val = raw === true || raw === 'true' || raw === '1' ? t('yes') : t('no'); }
          else if ((f.type === 'select' || f.type === 'dropdown') && Array.isArray(f.options)) {
            const opt = f.options.find(op => op === raw || (typeof op === 'object' && op.value === raw));
            val = esc(typeof opt === 'object' ? opt.label : (opt || raw));
          } else { val = esc(String(raw)); }
          return `<div class="object-panel-field-row"><label>${esc(f.name)}</label><span>${val}</span></div>`;
        }).join('');
        return `<div class="object-panel-card" id="opcard-${o.id}">
          <div class="object-panel-card-header">
            <div class="object-panel-card-name" title="${esc(o.name)}">${esc(o.name)}</div>
            <button type="button" class="object-panel-unlink" title="${esc(t('btn_unlink'))}" aria-label="${esc(t('btn_unlink'))}" onclick="unlinkObjectFromDeal(${dealId},${o.id})">${UI_ICON.remove}</button>
          </div>
          ${fieldRows ? `<div class="object-panel-card-fields">${fieldRows}</div>` : ''}
        </div>`;
      }).join('')
    : `<div class="object-panel-empty">${esc(t('objects_none').replace('{name}', lower))}</div>`;

  // The add row explains itself when there is nothing to add.
  let addRow;
  if (!objects.length) {
    addRow = `<div class="object-panel-empty">${esc(t('objects_none_yet').replace('{name}', lower).replace('{page}', objName))}</div>`;
  } else if (!available.length) {
    addRow = `<div class="object-panel-empty">${esc(t('objects_all_linked').replace('{name}', lower))}</div>`;
  } else {
    addRow = `<div class="object-panel-add">
      <select id="object-panel-select" aria-label="${esc(objName)}"><option value="">${esc(t('objects_add').replace('{name}', singular))}</option>
        ${available.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-sm btn-primary" onclick="linkObjectInDeal(${dealId})">${t('btn_link')}</button>
    </div>`;
  }

  body.innerHTML = `${addRow}<div id="object-panel-cards" class="object-panel">${cards}</div>`;
}

async function linkObjectInDeal(dealId) {
  const sel = document.getElementById('object-panel-select');
  const objectId = parseInt(sel?.value, 10);
  if (!objectId) { sel?.focus(); return; }
  const res = await api.post(`/api/deals/${dealId}/objects`, { object_id: objectId });
  if (res?.error) { alert(res.error); return; }
  objects = await api.get('/api/objects');
  const linked = await api.get(`/api/deals/${dealId}/objects`);
  await renderObjectPanel(dealId, Array.isArray(linked) ? linked : []);
}

async function unlinkObjectFromDeal(dealId, objectId) {
  const res = await api.del(`/api/deals/${dealId}/objects/${objectId}`);
  if (res?.error) { alert(res.error); return; }
  objects = await api.get('/api/objects');
  const linked = await api.get(`/api/deals/${dealId}/objects`);
  await renderObjectPanel(dealId, Array.isArray(linked) ? linked : []);
}

function populateDealStages(pipelineId, selectedStageId) {
  const pipeline = pipelines.find(p => p.id === pipelineId);
  const stageSel = document.getElementById('df-stage');
  stageSel.innerHTML = (pipeline?.stages || []).map(s =>
      `<option value="${s.id}" ${selectedStageId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');
  renderStageStepper();
}

function onDealPipelineChange() {
  populateDealStages(parseInt(document.getElementById('df-pipeline').value) || null, null);
}

async function saveDeal(e) {
  e.preventDefault();
  const id = document.getElementById('deal-id').value;
  const payload = {
    title:       document.getElementById('df-title').value,
    contact_id:  document.getElementById('df-contact').value  || null,
    supplier_id: document.getElementById('df-supplier').value || null,
    pipeline_id: parseInt(document.getElementById('df-pipeline').value),
    stage_id:    document.getElementById('df-stage').value    || null,
    value:       document.getElementById('df-value').value    || null,
    assigned_to: document.getElementById('df-assignee').value || null,
    urgency:     document.getElementById('df-urgency').value || 0,
    custom_data: Object.fromEntries(dealFields.map(f => [f.field_key, document.getElementById(`dfield-${f.field_key}`)?.value || ''])),
  };
  showDealFormError('');
  const saved = id ? await api.put(`/api/deals/${id}`, payload) : await api.post('/api/deals', payload);
  if (saved?.error) {
    // Keep the modal open with the reason; re-arm the submit button the double-submit guard disabled.
    showDealFormError(saved.error);
    const form = document.getElementById('deal-form'); if (form) form._submitting = false;
    document.querySelectorAll('[form="deal-form"][type="submit"]').forEach(b => { b.disabled = false; });
    return;
  }
  closeModal('deal-modal');
  deals = await api.get(currentPipelineId ? `/api/deals?pipeline_id=${currentPipelineId}` : '/api/deals');
  renderDealsCurrent();
}

async function deleteDeal(id) {
  if (!confirm(t('confirm_delete_deal'))) return;
  const res = await api.del(`/api/deals/${id}`);
  if (res?.error) { showBoardNotice(res.error); return; }
  deals = deals.filter(d => d.id !== id);
  renderDealsCurrent();
}

async function deleteDealFromModal() {
  const id = document.getElementById('deal-id').value;
  if (!id) return;
  if (!confirm(t('confirm_delete_deal'))) return;
  const res = await api.del(`/api/deals/${id}`);
  if (res?.error) { alert(res.error); return; }
  closeModal('deal-modal');
  deals = deals.filter(d => d.id !== Number(id));
  renderDealsCurrent();
}

async function addTaskFromDeal() {
  const id = Number(document.getElementById('deal-id').value);
  if (!id) { alert(t('save_deal_first_task')); return; }
  const d = await api.get(`/api/deals/${id}`);
  if (!d || d.error) { alert(d?.error || t('err_load_deal')); return; }
  openTaskModal(null, {
    dealId:   d.id,
    dealTitle: d.title,
    contactId: d.contact_id || null,
    contactName: d.contact_name || null,
  });
}

async function openActivityModal() {
  await ensureContacts();
  document.getElementById('activity-form').reset();
  document.getElementById('act-contact').innerHTML = '<option value="">— None —</option>' +
    contacts.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  document.getElementById('activity-modal').classList.remove('hidden');
}

async function saveActivity(e) {
  e.preventDefault();
  await api.post('/api/activities', {
    contact_id: document.getElementById('act-contact').value || null,
    type:       document.getElementById('act-type').value,
    content:    document.getElementById('act-content').value,
  });
  closeModal('activity-modal');
  if (document.getElementById('page-activities').classList.contains('active')) loadActivities();
}

async function toggleActivityComments(activityId, btn) {
  const timelineItem = btn.closest('.deal-timeline-item');
  if (!timelineItem) return;
  const container = timelineItem.querySelector('.deal-comments-container');
  if (!container) return;
  const nowHidden = container.classList.toggle('hidden');
  btn.setAttribute('aria-expanded', String(!nowHidden));
  if (nowHidden) return;
  await renderActivityComments(activityId, container);
}

async function renderActivityComments(activityId, container) {
  if (!container) {
    container = document.getElementById(`deal-comments-${activityId}`);
  }
  if (!container) return;
  container.innerHTML = `<div class="deal-comments-loading">${t('loading')}</div>`;
  try {
    const comments = await api.get(`/api/activity-comments?activity_id=${activityId}`);
    container.innerHTML = renderCommentTree(comments, activityId, null) + commentFormHTML(activityId, null);
  } catch (e) {
    console.error('Error loading comments:', e);
    container.innerHTML = `<div class="deal-comments-error">${t('err_load_comments')}</div>`;
  }
}

function renderCommentTree(comments, activityId, parentId) {
  if (!comments || !comments.length) return '';
  return comments.map(c => {
    const childrenHtml = c.children && c.children.length
      ? `<div class="deal-comment-nested">${renderCommentTree(c.children, activityId, c.id)}</div>`
      : '';
    return `
      <div class="deal-comment" data-comment-id="${c.id}">
        <div class="deal-comment-author">${esc(c.created_by_name || t('unknown_user'))}</div>
        <div class="deal-comment-date">${fmtDate(c.created_at)}</div>
        <div class="deal-comment-content">${esc(c.content)}</div>
        <button type="button" class="deal-comment-reply-btn" onclick="event.stopPropagation();showCommentReplyForm(${activityId}, ${c.id}, this)">${t('btn_reply')}</button>
        ${childrenHtml}
        <div class="deal-comment-reply-form-container hidden" id="reply-form-${c.id}"></div>
      </div>`;
  }).join('');
}

function commentFormHTML(activityId, parentId) {
  const idSuffix = parentId ? `reply-${parentId}` : `top-${activityId}`;
  return `
    <div class="deal-comment-form" data-parent-id="${parentId || ''}">
      <input type="text" class="deal-comment-input" id="comment-input-${idSuffix}"
        placeholder="${esc(t(parentId ? 'reply_ph' : 'comment_ph'))}"
        onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();submitComment(${activityId}, ${parentId || 'null'}, this.value)}" />
      <button type="button" class="btn btn-sm btn-primary deal-comment-submit" onclick="submitComment(${activityId}, ${parentId || 'null'}, this.previousElementSibling.value)">${t('btn_send')}</button>
    </div>`;
}

function showCommentReplyForm(activityId, parentId, el) {
  const container = document.getElementById(`reply-form-${parentId}`);
  if (!container) return;
  const topForm = el.closest('.deal-timeline-item')?.querySelector('.deal-comment-form[data-parent-id=""]');
  if (!container.classList.contains('hidden')) {
    container.classList.add('hidden');
    topForm?.classList.remove('hidden');
    return;
  }
  topForm?.classList.add('hidden');
  container.innerHTML = commentFormHTML(activityId, parentId);
  container.classList.remove('hidden');
  container.querySelector('input')?.focus();
}

async function submitComment(activityId, parentId, content) {
  if (!content?.trim()) return;
  const btn = event?.target?.closest?.('.deal-comment-form')?.querySelector?.('.deal-comment-submit')
    || document.querySelector(`#comment-input-top-${activityId}`)?.nextElementSibling;
  const timelineItem = event?.target?.closest?.('.deal-timeline-item');
  const container = timelineItem ? timelineItem.querySelector('.deal-comments-container') : null;
  if (btn) btn.disabled = true;
  try {
    await api.post('/api/activity-comments', {
      activity_id: activityId,
      parent_id: parentId || null,
      content: content.trim(),
    });
    const idSuffix = parentId ? `reply-${parentId}` : `top-${activityId}`;
    const input = document.getElementById(`comment-input-${idSuffix}`);
    if (input) input.value = '';
    await renderActivityComments(activityId, container);
  } catch (e) {
    console.error('Error saving comment:', e);
    alert(t('err_save_comment'));
  } finally {
    if (btn) btn.disabled = false;
  }
}
