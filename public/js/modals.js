/* ═══════════════════════════════════════════════════════════════════════════
   The contact create/edit form and the small stand-alone Log Activity form.
   The contact detail view, the deal detail/form and the task drawer/form are
   built at runtime by public/js/detail-views.js — see that file for the
   reference pop windows and side panels (Part 16, DESIGN_PRO_CHANGES.md).
   ═══════════════════════════════════════════════════════════════════════════ */

async function openContactModal(id) {
  await Promise.all([ensureStages(), ensureFields(), ensureMembers()]);
  document.getElementById('contact-form').reset();
  document.getElementById('contact-id').value   = id || '';
  document.getElementById('cf-type').value       = currentContactType;
  const typeName = currentContactType === 'supplier'
    ? (currentWorkspace?.supplier_name || 'Supplier').replace(/s$/i, '')
    : 'Contact';
  document.getElementById('contact-modal-title').textContent = id ? `Edit ${typeName}` : `Add ${typeName}`;

  const stageEl = document.getElementById('cf-stage');
  stageEl.innerHTML = '<option value="">— None —</option>' +
    stages.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

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
    stageEl.value = c.stage_id || ''; assigneeEl.value = c.assigned_to || '';
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
    stage_id:     document.getElementById('cf-stage').value    || null,
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
    renderContactsKanban();
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
