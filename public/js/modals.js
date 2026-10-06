/* ═══════════════════════════════════════════════════════════════════════════
   The contact create/edit form and the small stand-alone Log Activity form.
   The contact detail view, the deal detail/form and the task drawer/form are
   built at runtime by public/js/detail-views.js — see that file for the
   reference pop windows and side panels (Part 16, DESIGN_PRO_CHANGES.md).
   ═══════════════════════════════════════════════════════════════════════════ */
/* ENTRY POINTS  openContactModal(id) and openActivityModal({date, time}),
   both called from inline handlers in index.html and from other files.

   These two forms stayed as plain markup in index.html (filled in here) while
   the richer record views moved to detail-views.js. Expect that split:
     here           the contact create/edit form, the Log Activity form
     detail-views   the deal form + drawer, contact panel, task form + drawer

   renderFieldInput() / renderDealFieldInput() turn a custom-field definition
   into an <input>/<select> — renderDealFieldInput is also reused by the
   Listings modal in objects.js.

   saveActivity() refreshes whichever page is currently active (Activities or
   Calendar) so a new entry shows up without a reload.

   FUNCTION MAP  openContactModal, saveContact, deleteContact,
                 renderFieldInput, renderDealFieldInput, closeSidePanel,
                 openActivityModal, saveActivity */

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
    `<div class="field"><label class="label" for="cfield-${f.field_key}">${esc(f.name)}</label>${renderFieldInput(f, '')}</div>`).join('');

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

function renderFieldInput(f, value) {
  const id = `cfield-${f.field_key}`;
  if (f.type === 'dropdown') return `<select id="${id}"><option value="">— Select —</option>
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
  const ok = await ui.confirm({ title: 'Delete this contact?', message: 'Their activities are deleted with them. This cannot be undone.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  await api.del(`/api/contacts/${id}`);
  closeSidePanel();
  invalidate();
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'deals') loadDeals(); else loadContacts();
}

function closeSidePanel() {
  document.getElementById('contact-side-panel')?.classList.add('hidden');
  document.querySelectorAll('#contacts-body tr.side-panel-active').forEach(r => r.classList.remove('side-panel-active'));
}

// Shared by openObjectModal's custom-field loop (reused from the earlier deal-field work).
function renderDealFieldInput(f, value = '') {
  const id = `dfield-${f.field_key}`;
  if (f.type === 'dropdown') return `<select id="${id}"><option value="">— Select —</option>
    ${(f.options||[]).map(o => `<option value="${esc(o)}"${value===o?' selected':''}>${esc(o)}</option>`).join('')}
  </select>`;
  const typeMap = { text:'text', email:'email', phone:'tel', number:'number', date:'date', url:'url' };
  return `<input type="${typeMap[f.type]||'text'}" id="${id}" value="${esc(value)}" />`;
}

// date/time preset the form for "add on this day", which is how the Calendar adds an entry.
let activityModalDeals = [];   // the deals offered by the modal's Deal picker, for onActivityDealChange

async function openActivityModal({ date = '', time = '' } = {}) {
  await ensureContacts();
  document.getElementById('activity-form').reset();
  document.getElementById('act-contact').innerHTML = '<option value="">— None —</option>' +
    contacts.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  // The deal the note is about. Choosing one binds the note to it (and fills an empty contact
  // from it); leaving it empty logs a contact-level note.
  const dealList = await api.get('/api/deals');
  activityModalDeals = Array.isArray(dealList) ? dealList : [];
  document.getElementById('act-deal').innerHTML = '<option value="">— No deal —</option>' +
    activityModalDeals.map(d => `<option value="${d.id}">${esc(d.title)}${d.contact_name ? ' — ' + esc(d.contact_name) : ''}</option>`).join('');
  document.getElementById('act-date').value = date;
  document.getElementById('act-time').value = time;
  document.getElementById('activity-modal').classList.remove('hidden');
  document.getElementById('act-content')?.focus();
}

function onActivityDealChange() {
  const sel = document.getElementById('act-deal'), c = document.getElementById('act-contact');
  const d = sel.value ? activityModalDeals.find(x => x.id === +sel.value) : null;
  if (d?.contact_id && !c.value) c.value = d.contact_id;
}

async function saveActivity(e) {
  e.preventDefault();
  await api.post('/api/activities', {
    contact_id: document.getElementById('act-contact').value || null,
    deal_id:    document.getElementById('act-deal').value || null,
    type:       document.getElementById('act-type').value,
    content:    esc(document.getElementById('act-content').value).replace(/\n/g, '<br>'),   // the same stored shape as the timeline editors
    event_date: document.getElementById('act-date').value || null,
    event_time: document.getElementById('act-time').value || null,
  });
  closeModal('activity-modal');
  if (document.getElementById('page-activities').classList.contains('active')) loadActivities();
  if (document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
}
