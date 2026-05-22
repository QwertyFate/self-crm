// ── CONTACT MODAL ─────────────────────────────────────────
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
    `<div class="form-group"><label>${esc(f.name)}</label>${renderFieldInput(f, '')}</div>`).join('');

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
  document.getElementById('contact-modal').classList.remove('hidden');
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
  closeModal('contact-modal'); invalidate();
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'deals') loadDeals(); else loadContacts();
}

async function deleteContact(id) {
  if (!confirm('Delete this contact and all their activities?')) return;
  await api.del(`/api/contacts/${id}`); closeModal('detail-modal'); invalidate();
  const page = document.querySelector('.page.active')?.id.replace('page-', '');
  if (page === 'deals') loadDeals(); else loadContacts();
}

// ── CONTACT DETAIL ────────────────────────────────────────
async function openDetail(id) {
  await Promise.all([ensureFields()]);
  const [c, contactDeals] = await Promise.all([api.get(`/api/contacts/${id}`), api.get(`/api/deals?contact_id=${id}`)]);
  document.getElementById('detail-title').textContent = c.name;

  const infoFields = [
    ['Company',  c.company],
    ['Email',    c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : null],
    ['Phone',    c.phone ? `${esc(c.phone)}${waLink(c.phone, c) ? ` <a class="wa-detail-link" href="${waLink(c.phone, c)}" target="_blank" rel="noopener" title="Open WhatsApp">${WA_SVG} WhatsApp</a>` : ''}` : null],
    ['Assignee', c.assigned_to_name],
    ...fields.map(f => {
      const val = c.custom_data?.[f.field_key]; if (!val) return [f.name, null];
      if (f.type === 'url')   return [f.name, `<a href="${esc(val)}" target="_blank" rel="noopener">${esc(val)}</a>`];
      if (f.type === 'email') return [f.name, `<a href="mailto:${esc(val)}">${esc(val)}</a>`];
      return [f.name, esc(val)];
    }),
  ].filter(([, v]) => v);

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-grid">
        ${infoFields.map(([label, val]) => `<div class="detail-item"><label>${esc(label)}</label><span>${val}</span></div>`).join('')}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-header">
        <h3>Deals</h3>
        <button class="btn btn-sm btn-primary" onclick="closeModal('detail-modal');openDealModalForContact(${id})">+ Add Deal</button>
      </div>
      <div class="contact-deals-list" id="contact-deals-list">${renderContactDeals(contactDeals)}</div>
    </div>
    <div class="detail-section">
      <h3>${t('detail_activities')}</h3>
      <div class="mini-acts" id="detail-acts">${renderMiniActs(c.activities)}</div>
    </div>
    <div class="inline-log">
      <select id="inline-type">
        <option value="note">${t('act_note')}</option><option value="call">${t('act_call')}</option>
        <option value="email">${t('act_email')}</option><option value="whatsapp">${t('act_whatsapp')}</option>
      </select>
      <input type="text" id="inline-content" placeholder="${t('detail_log_ph')}" />
      <button class="btn btn-primary btn-sm" onclick="logInlineActivity(${id})">${t('btn_log')}</button>
    </div>
    <div class="detail-actions">
      <button class="btn btn-danger btn-sm" onclick="deleteContact(${id})">${t('btn_delete')}</button>
      <button class="btn btn-sm" onclick="closeModal('detail-modal');openContactModal(${id})">${t('btn_edit')}</button>
    </div>`;
  document.getElementById('detail-modal').classList.remove('hidden');
}

function renderContactDeals(deals) {
  if (!deals?.length) return `<p style="color:var(--muted);font-size:12px;padding:4px 0">No deals yet.</p>`;
  return deals.map(d => {
    const fmtVal = d.value != null ? `€ ${Number(d.value).toLocaleString()}` : null;
    return `<div class="contact-deal-row" onclick="closeModal('detail-modal');openDealModal(${d.id})">
      <div class="contact-deal-title">${esc(d.title)}</div>
      <div class="contact-deal-meta">
        ${d.stage_name ? `<span class="contact-deal-stage" style="border-color:${d.stage_color||'var(--border)'}">
          <span style="width:7px;height:7px;border-radius:50%;background:${d.stage_color||'#9ca3af'};display:inline-block;flex-shrink:0"></span>
          ${esc(d.stage_name)}</span>` : ''}
        ${fmtVal ? `<span class="contact-deal-value">${fmtVal}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function openDealModalForContact(contactId) {
  if (!pipelines.length) pipelines = await api.get('/api/pipelines');
  await openDealModal(null);
  const sel = document.getElementById('df-contact');
  if (sel) sel.value = contactId;
}

function renderMiniActs(acts) {
  if (!acts?.length) return `<p style="color:var(--muted);font-size:12px">${t('no_activities')}</p>`;
  return acts.map(a => `
    <div class="mini-act">
      <span class="mini-act-type">${t('act_' + a.type)}</span>
      <div>
        <div>${esc(a.content)}</div>
        <div class="mini-act-date">${fmtDate(a.created_at)}${a.logged_by_name ? ` · ${t('logged_by')} ${esc(a.logged_by_name)}` : ''}</div>
      </div>
    </div>`).join('');
}

async function moveContactStage(contactId, stageId, el) {
  el.closest('.stage-pills').querySelectorAll('.stage-pill').forEach(p => { p.classList.remove('active'); p.style.background = ''; });
  const stage = stages.find(s => s.id === stageId);
  el.classList.add('active'); el.style.background = stage ? stage.color : '#9ca3af';
  await api.patch(`/api/contacts/${contactId}/stage`, { stage_id: stageId });
  const c = contacts.find(c => c.id === contactId); if (c) c.stage_id = stageId;
  if (document.getElementById('page-deals').classList.contains('active')) renderDealsBoard();
}

async function logInlineActivity(contactId) {
  const content = document.getElementById('inline-content').value.trim(); if (!content) return;
  await api.post('/api/activities', { contact_id: contactId, type: document.getElementById('inline-type').value, content });
  document.getElementById('inline-content').value = '';
  const c = await api.get(`/api/contacts/${contactId}`);
  document.getElementById('detail-acts').innerHTML = renderMiniActs(c.activities);
}

// ── DEAL MODAL ────────────────────────────────────────────
function renderDealFieldInput(f, value = '') {
  const id = `dfield-${f.field_key}`;
  if (f.type === 'dropdown') return `<select id="${id}"><option value="">— Select —</option>
    ${(f.options||[]).map(o => `<option value="${esc(o)}"${value===o?' selected':''}>${esc(o)}</option>`).join('')}
  </select>`;
  const typeMap = { text:'text', email:'email', phone:'tel', number:'number', date:'date', url:'url' };
  return `<input type="${typeMap[f.type]||'text'}" id="${id}" value="${esc(value)}" />`;
}

async function renderContactPanelReadOnly(contact) {
  const panel = document.getElementById('deal-contact-panel'); if (!panel) return;
  if (!contact) {
    panel.innerHTML = `<div class="contact-panel-top"><div class="deal-col-label">Contact</div></div>
      <div class="contact-panel-scroll"><div class="contact-panel-empty">No contact linked.<br>Select one from the dropdown.</div></div>`;
    return;
  }
  panel.innerHTML = `<div class="contact-panel-top"><div class="deal-col-label">Contact</div></div>
    <div class="contact-panel-scroll" style="color:var(--muted);font-size:13px;padding:10px 22px">Loading…</div>`;
  await ensureFields();
  const full = await api.get(`/api/contacts/${contact.id}`);
  const visibleCols = effectiveContactColumns().filter(c => c.visible && c.key !== '_name' && c.key !== 'stage_id');
  const dash = '<span style="color:var(--muted)">—</span>';
  const rows = visibleCols.map(col => {
    let value;
    if (col.key === 'company')     { value = full.company ? esc(full.company) : dash; }
    else if (col.key === 'email')  { value = full.email ? `<a href="mailto:${esc(full.email)}">${esc(full.email)}</a>` : dash; }
    else if (col.key === 'phone')  { value = full.phone ? `${esc(full.phone)}${waLink(full.phone, full) ? ` <a class="wa-detail-link" href="${waLink(full.phone,full)}" target="_blank" rel="noopener">${WA_SVG}</a>` : ''}` : dash; }
    else if (col.key === 'assigned_to') { value = full.assigned_to_name ? esc(full.assigned_to_name) : dash; }
    else if (col.key === 'created_at')  { value = fmtDate(full.created_at) || dash; }
    else {
      const v = full.custom_data?.[col.key];
      if (!v) { value = dash; }
      else { const f = fields.find(f => f.field_key === col.key);
        if (f?.type === 'url')        value = `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>`;
        else if (f?.type === 'email') value = `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
        else                          value = esc(v);
      }
    }
    return { label: col.label(), value };
  });

  panel.innerHTML = `
    <div class="contact-panel-top">
      <div class="deal-col-label">Contact</div>
      <div class="contact-panel-header">
        <div class="contact-panel-name">${esc(full.name)}</div>
        <button class="btn btn-sm btn-ghost" onclick="editContactPanel(${full.id})">Edit</button>
      </div>
    </div>
    <div class="contact-panel-scroll">
      <div class="contact-panel-rows">
        ${rows.map(r => `<div class="contact-panel-row"><label>${esc(r.label)}</label><span>${r.value}</span></div>`).join('')}
      </div>
      <div class="contact-panel-section-label" style="margin-top:14px">Activities</div>
      <div class="mini-acts" id="cpanel-acts">${renderMiniActs(full.activities)}</div>
    </div>
    <div class="panel-note-form">
      <select id="cpanel-act-type">
        <option value="note">${t('act_note')}</option><option value="call">${t('act_call')}</option>
        <option value="email">${t('act_email')}</option><option value="whatsapp">${t('act_whatsapp')}</option>
      </select>
      <input type="text" id="cpanel-act-content" placeholder="${t('detail_log_ph')}"
        onkeydown="if(event.key==='Enter'){event.preventDefault();logContactPanelNote(${full.id});}" />
      <button id="cpanel-log-btn" class="btn btn-primary btn-sm" onclick="logContactPanelNote(${full.id})">${t('btn_log')}</button>
    </div>`;
}

async function logContactPanelNote(contactId) {
  const contentEl = document.getElementById('cpanel-act-content'), content = contentEl?.value.trim();
  if (!content) return;
  const type = document.getElementById('cpanel-act-type')?.value || 'note';
  const btn = document.getElementById('cpanel-log-btn'); if (btn) btn.disabled = true;
  await api.post('/api/activities', { contact_id: contactId, type, content });
  if (contentEl) contentEl.value = ''; if (btn) btn.disabled = false;
  const fresh = await api.get(`/api/contacts/${contactId}`);
  const actsEl = document.getElementById('cpanel-acts'); if (actsEl) actsEl.innerHTML = renderMiniActs(fresh.activities);
  contentEl?.focus();
}

async function editContactPanel(contactId) {
  await Promise.all([ensureStages(), ensureFields()]);
  const contact = contacts.find(c => c.id === contactId) || await api.get(`/api/contacts/${contactId}`);
  const panel = document.getElementById('deal-contact-panel'); if (!panel) return;
  const customInputs = fields.map(f => `
    <div class="form-group"><label>${esc(f.name)}</label>
      <input type="text" id="cpfield-${f.field_key}" value="${esc(contact.custom_data?.[f.field_key] || '')}" /></div>`).join('');
  panel.innerHTML = `
    <div class="contact-panel-top"><div class="deal-col-label">Edit Contact</div></div>
    <div class="contact-panel-scroll">
      <div class="form-group"><label>Name <span class="req">*</span></label><input type="text" id="cpanel-name" value="${esc(contact.name)}" /></div>
      <div class="form-group"><label>Company</label><input type="text" id="cpanel-company" value="${esc(contact.company||'')}" /></div>
      <div class="form-group"><label>Email</label><input type="email" id="cpanel-email" value="${esc(contact.email||'')}" /></div>
      <div class="form-group"><label>Phone</label><input type="tel" id="cpanel-phone" value="${esc(contact.phone||'')}" /></div>
      <div class="form-group"><label>Stage</label>
        <select id="cpanel-stage"><option value="">— None —</option>
          ${stages.map(s => `<option value="${s.id}"${contact.stage_id===s.id?' selected':''}>${esc(s.name)}</option>`).join('')}
        </select></div>
      ${customInputs}
      <div class="contact-panel-edit-actions">
        <button class="btn btn-sm" onclick="cancelContactPanelEdit(${contactId})">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="saveContactPanel(${contactId})">Save Contact</button>
      </div>
    </div>`;
}

async function saveContactPanel(contactId) {
  const nameEl = document.getElementById('cpanel-name');
  if (!nameEl?.value.trim()) { alert('Name is required.'); return; }
  const custom_data = {};
  fields.forEach(f => { const el = document.getElementById(`cpfield-${f.field_key}`); if (el) custom_data[f.field_key] = el.value; });
  const payload = {
    name:        nameEl.value.trim(),
    company:     document.getElementById('cpanel-company')?.value || '',
    email:       document.getElementById('cpanel-email')?.value   || '',
    phone:       document.getElementById('cpanel-phone')?.value   || '',
    stage_id:    document.getElementById('cpanel-stage')?.value   || null,
    assigned_to: contacts.find(c => c.id === contactId)?.assigned_to || null,
    custom_data,
  };
  const btn = document.querySelector('#deal-contact-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const res = await api.put(`/api/contacts/${contactId}`, payload);
  if (res.error) { alert(res.error); if (btn) { btn.disabled = false; btn.textContent = 'Save Contact'; } return; }
  const c = contacts.find(c => c.id === contactId);
  if (c) { Object.assign(c, payload); const stg = stages.find(s => String(s.id) === String(payload.stage_id)); c.stage_name = stg?.name || null; c.stage_color = stg?.color || null; }
  renderContactPanelReadOnly(c || { id: contactId, ...payload });
}

function cancelContactPanelEdit(contactId) {
  renderContactPanelReadOnly(contacts.find(c => c.id === contactId) || null);
}

function onDealContactChange() {
  const contactId = parseInt(document.getElementById('df-contact').value) || null;
  renderContactPanelReadOnly(contacts.find(c => c.id === contactId) || null);
}

async function openDealModal(id) {
  await Promise.all([ensureContacts(), ensureMembers(), ensureStages(), ensureFields()]);
  if (!pipelines.length) pipelines = await api.get('/api/pipelines');
  if (!dealFields.length) dealFields = await api.get('/api/deal-fields');

  document.getElementById('deal-form').reset();
  document.getElementById('deal-id').value = id || '';
  document.getElementById('deal-modal-title').textContent = id ? 'Edit Deal' : 'Add Deal';
  document.getElementById('deal-delete-btn').style.display = id ? '' : 'none';

  const pipelineSel = document.getElementById('df-pipeline');
  pipelineSel.innerHTML = pipelines.map(p =>
    `<option value="${p.id}"${currentPipelineId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  populateDealStages(pipelineSel.value ? parseInt(pipelineSel.value) : null, null);

  const contactSel  = document.getElementById('df-contact');
  const supplierSel = document.getElementById('df-supplier');
  const [allContacts, allSuppliers] = await Promise.all([
    api.get('/api/contacts?contact_type=contact'),
    api.get('/api/contacts?contact_type=supplier'),
  ]);
  const supplierLabel = currentWorkspace?.supplier_name || 'Suppliers';
  const supLabelEl = document.getElementById('df-supplier-label');
  if (supLabelEl) supLabelEl.textContent = supplierLabel;
  contactSel.innerHTML = `<option value="">— No contact —</option>` +
    allContacts.map(c => `<option value="${c.id}">${esc(c.name)}${c.company ? ` (${esc(c.company)})` : ''}</option>`).join('');
  supplierSel.innerHTML = `<option value="">— No ${esc(supplierLabel.replace(/s$/i,''))} —</option>` +
    allSuppliers.map(c => `<option value="${c.id}">${esc(c.name)}${c.company ? ` (${esc(c.company)})` : ''}</option>`).join('');

  const assigneeSel = document.getElementById('df-assignee');
  assigneeSel.innerHTML = `<option value="">— Unassigned —</option>` +
    members.map(m => `<option value="${m.id}"${m.id === currentUser?.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');

  document.getElementById('df-custom-fields').innerHTML = dealFields.map(f =>
    `<div class="form-group"><label>${esc(f.name)}</label>${renderDealFieldInput(f, '')}</div>`
  ).join('');

  let linkedContact = null, linkedObjects = [];

  if (id) {
    const d = await api.get(`/api/deals/${id}`);
    document.getElementById('df-title').value = d.title;
    document.getElementById('df-value').value = d.value != null ? d.value : '';
    pipelineSel.value = d.pipeline_id || '';
    populateDealStages(d.pipeline_id, d.stage_id);
    contactSel.value  = d.contact_id  || '';
    supplierSel.value = d.supplier_id || '';
    assigneeSel.value = d.assigned_to || '';
    dealFields.forEach(f => { const el = document.getElementById(`dfield-${f.field_key}`); if (el) el.value = d.custom_data?.[f.field_key] ?? ''; });
    if (d.contact_id) linkedContact = allContacts.find(c => c.id === d.contact_id) || null;
    linkedObjects = d.objects || [];
  }

  if (!objects.length) objects = await api.get('/api/objects');
  renderContactPanelReadOnly(linkedContact);
  await renderObjectPanel(id, linkedObjects);
  document.getElementById('deal-modal').classList.remove('hidden');
}

async function renderObjectPanel(dealId, linkedObjects) {
  const label = document.getElementById('deal-object-panel-label'), body = document.getElementById('deal-object-panel-body');
  if (!label || !body) return;
  const objName = currentWorkspace?.object_name || 'Objects';
  label.textContent = objName;
  if (!dealId) { body.innerHTML = `<div class="object-panel-empty">Save the deal first to link ${esc(objName.toLowerCase())}.</div>`; return; }
  if (!objectFields.length) objectFields = await api.get('/api/object-fields');
  const dash = `<span style="color:var(--muted)">—</span>`;
  const linkedIds = new Set(linkedObjects.map(o => o.id));
  const available = objects.filter(o => !linkedIds.has(o.id));

  const cards = linkedObjects.length
    ? linkedObjects.map(o => {
        const customData = o.custom_data || {};
        const fieldRows = objectFields.map(f => {
          const raw = customData[f.field_key]; let val;
          if (raw === undefined || raw === null || raw === '') { val = dash; }
          else if (f.type === 'date') { val = esc(fmtDate(raw)); }
          else if (f.type === 'checkbox') { val = raw === true || raw === 'true' || raw === '1' ? '✓ Yes' : '✗ No'; }
          else if (f.type === 'select' && Array.isArray(f.options)) {
            const opt = f.options.find(op => op === raw || (typeof op === 'object' && op.value === raw));
            val = esc(typeof opt === 'object' ? opt.label : (opt || raw));
          } else { val = esc(String(raw)); }
          return `<div class="object-panel-field-row"><label>${esc(f.name)}</label><span>${val}</span></div>`;
        }).join('');
        return `<div class="object-panel-card" id="opcard-${o.id}">
          <div class="object-panel-card-header">
            <div class="object-panel-card-name">${esc(o.name)}</div>
            <button class="object-panel-unlink" title="Unlink" onclick="unlinkObjectFromDeal(${dealId},${o.id})">×</button>
          </div>
          ${fieldRows ? `<div class="object-panel-card-fields">${fieldRows}</div>` : ''}
        </div>`;
      }).join('')
    : `<div class="object-panel-empty">No ${esc(objName.toLowerCase())} linked yet.</div>`;

  body.innerHTML = `
    <div id="object-panel-cards">${cards}</div>
    <div class="object-panel-add">
      <select id="object-panel-select"><option value="">— Add ${esc(objName)} —</option>
        ${available.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}
      </select>
      <button class="btn btn-sm btn-primary" onclick="linkObjectInDeal(${dealId})">Add</button>
    </div>`;
}

async function linkObjectInDeal(dealId) {
  const sel = document.getElementById('object-panel-select'), objectId = parseInt(sel?.value);
  if (!objectId) return;
  await api.post(`/api/deals/${dealId}/objects`, { object_id: objectId });
  objects = await api.get('/api/objects');
  const linked = await api.get(`/api/deals/${dealId}/objects`);
  await renderObjectPanel(dealId, linked);
}

async function unlinkObjectFromDeal(dealId, objectId) {
  await api.del(`/api/deals/${dealId}/objects/${objectId}`);
  objects = await api.get('/api/objects');
  const linked = await api.get(`/api/deals/${dealId}/objects`);
  await renderObjectPanel(dealId, linked);
}

function populateDealStages(pipelineId, selectedStageId) {
  const pipeline = pipelines.find(p => p.id === pipelineId);
  const stageSel = document.getElementById('df-stage');
  stageSel.innerHTML = `<option value="">— No stage —</option>` +
    (pipeline?.stages || []).map(s =>
      `<option value="${s.id}" ${selectedStageId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');
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
    custom_data: Object.fromEntries(dealFields.map(f => [f.field_key, document.getElementById(`dfield-${f.field_key}`)?.value || ''])),
  };
  if (id) await api.put(`/api/deals/${id}`, payload); else await api.post('/api/deals', payload);
  closeModal('deal-modal');
  deals = await api.get(`/api/deals?pipeline_id=${currentPipelineId}`);
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

async function deleteDeal(id) {
  if (!confirm('Delete this deal?')) return;
  await api.del(`/api/deals/${id}`);
  deals = deals.filter(d => d.id !== id);
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

async function deleteDealFromModal() {
  const id = document.getElementById('deal-id').value;
  if (!id) return;
  if (!confirm('Delete this deal?')) return;
  await api.del(`/api/deals/${id}`);
  closeModal('deal-modal');
  deals = deals.filter(d => d.id !== Number(id));
  if (dealViewMode === 'list') renderDealsList(); else renderDealsBoard();
}

// ── ACTIVITY MODAL ────────────────────────────────────────
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
