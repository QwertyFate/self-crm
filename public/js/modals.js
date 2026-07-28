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
  if (!confirm('Delete this contact and all their activities?')) return;
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

// ── CONTACT DETAIL ────────────────────────────────────────
function buildDetailHTML(c, contactDeals, id) {
  const stageOptions = stages.map(s => `<option value="${s.id}" ${c.stage_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const stageField = `<select style="width:100%;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg);color:var(--text)" onchange="updateContactStage(${id}, this.value)"><option value="">— None —</option>${stageOptions}</select>`;

  const infoFields = [
    ['Company',  c.company],
    ['Email',    c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : null],
    ['Phone',    c.phone ? `${esc(c.phone)}${waLink(c.phone, c) ? ` <a class="wa-detail-link" href="${waLink(c.phone, c)}" target="_blank" rel="noopener" title="Open WhatsApp">${WA_SVG} WhatsApp</a>` : ''}` : null],
    ['Stage',    stageField],
    ['Assignee', c.assigned_to_name],
    ...fields.map(f => {
      const val = c.custom_data?.[f.field_key]; if (!val) return [f.name, null];
      if (f.type === 'url')   return [f.name, `<a href="${esc(val)}" target="_blank" rel="noopener">${esc(val)}</a>`];
      if (f.type === 'email') return [f.name, `<a href="mailto:${esc(val)}">${esc(val)}</a>`];
      return [f.name, esc(val)];
    }),
  ].filter(([, v]) => v);

  return `
    <div class="detail-section">
      <div class="detail-grid">
        ${infoFields.map(([label, val]) => `<div class="detail-item"><label>${esc(label)}</label><span>${val}</span></div>`).join('')}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-header">
        <h3>Deals</h3>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-primary" onclick="openAddToKanbanModal(${id})">+ Add to Kanban</button>
          <button class="btn btn-sm btn-primary" onclick="closeSidePanel();closeModal('detail-modal');openDealModalForContact(${id})">+ Add Deal</button>
        </div>
      </div>
      <div class="contact-deals-list" id="contact-deals-list">${renderContactDeals(contactDeals)}</div>
    </div>
    <div class="detail-section">
      <h3>${t('detail_activities')}</h3>
      <div class="mini-acts" id="detail-acts" data-contact-id="${id}">${renderMiniActs(c.activities)}</div>
    </div>
    <div class="inline-log">
      <select id="inline-type" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;margin-bottom:8px;background:var(--input-bg);color:var(--text)">
        <option value="note">${t('act_note')}</option><option value="call">${t('act_call')}</option>
        <option value="email">${t('act_email')}</option><option value="whatsapp">${t('act_whatsapp')}</option>
      </select>
      <div class="note-editor-toolbar" style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap">
        <button type="button" class="fmt-btn" onclick="formatInlineNote('bold')" title="Bold"><strong>B</strong></button>
        <button type="button" class="fmt-btn" onclick="formatInlineNote('italic')" title="Italic"><em>I</em></button>
        <button type="button" class="fmt-btn" onclick="formatInlineNote('underline')" title="Underline"><u>U</u></button>
        <div style="width:1px;background:var(--border)"></div>
        <button type="button" class="fmt-btn" onclick="formatInlineNote('insertUnorderedList')" title="List">• List</button>
        <button type="button" class="fmt-btn" onclick="formatInlineNote('createLink')" title="Link">🔗 Link</button>
        <button type="button" class="fmt-btn" onclick="formatInlineNote('removeFormat')" title="Clear">✕ Clear</button>
      </div>
      <div id="inline-content" class="note-editor" contenteditable="true" placeholder="${t('detail_log_ph')}"
        onkeydown="if(event.key==='Enter' && event.ctrlKey){event.preventDefault();logInlineActivity(${id});}"></div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="logInlineActivity(${id})">${t('btn_log')} (Ctrl+Enter)</button>
    </div>
    <div class="detail-actions">
      <button class="btn btn-danger btn-sm" onclick="deleteContact(${id})">${t('btn_delete')}</button>
      <button class="btn btn-sm" onclick="closeSidePanel();closeModal('detail-modal');openContactModal(${id})">${t('btn_edit')}</button>
    </div>`;
}

async function openDetail(id) {
  await ensureFields();
  const [c, contactDeals] = await Promise.all([
    api.get(`/api/contacts/${id}`),
    api.get(`/api/deals?contact_id=${id}`),
  ]);

  const activePage = document.querySelector('.sidebar-nav a.active')?.dataset.page;
  const usePanel   = activePage === 'contacts' || activePage === 'suppliers';

  if (usePanel) {
    // Highlight the clicked row
    document.querySelectorAll('#contacts-body tr').forEach(r => r.classList.remove('side-panel-active'));
    document.querySelector(`#contacts-body tr td strong[onclick="openDetail(${id})"]`)
      ?.closest('tr')?.classList.add('side-panel-active');

    document.getElementById('side-panel-name').textContent = c.name;
    document.getElementById('side-panel-body').innerHTML   = buildDetailHTML(c, contactDeals, id);
    document.getElementById('contact-side-panel').classList.remove('hidden');
  } else {
    document.getElementById('detail-title').textContent = c.name;
    document.getElementById('detail-body').innerHTML    = buildDetailHTML(c, contactDeals, id);
    document.getElementById('detail-modal').classList.remove('hidden');
  }
}

async function updateContactStage(contactId, stageId) {
  await api.patch(`/api/contacts/${contactId}/stage`, { stage_id: stageId || null });
  invalidate();
}

function openAddToKanbanModal(contactId) {
  const stageSelect = document.getElementById('add-to-kanban-stage');
  stageSelect.innerHTML = '<option value="">— Select a stage —</option>' +
    (stages || []).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  // Store the contact ID for use in the submit handler
  document.getElementById('add-to-kanban-form').dataset.contactId = contactId;
  document.getElementById('add-to-kanban-modal').classList.remove('hidden');
}

async function confirmAddToKanban(e) {
  e.preventDefault();
  const contactId = parseInt(document.getElementById('add-to-kanban-form').dataset.contactId);
  const stageId = parseInt(document.getElementById('add-to-kanban-stage').value);

  if (!stageId) {
    alert('Please select a stage');
    return;
  }

  await api.patch(`/api/contacts/${contactId}/stage`, { stage_id: stageId });
  closeModal('add-to-kanban-modal');
  closeSidePanel();
  closeModal('detail-modal');

  // Update local contacts array
  const contact = contacts.find(c => c.id === contactId);
  if (contact) {
    contact.stage_id = stageId;
  }

  // Reload contacts and switch to kanban view
  await loadContacts();
  setContactViewMode('kanban');
}

function renderContactDeals(deals) {
  if (!deals?.length) return `<p style="color:var(--muted);font-size:12px;padding:4px 0">No deals yet.</p>`;
  return deals.map(d => {
    const fmtVal = d.value != null ? `€ ${Number(d.value).toLocaleString()}` : null;
    return `<div class="contact-deal-row" onclick="closeSidePanel();closeModal('detail-modal');openDealModal(${d.id})">
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

function truncateActivityPreview(html, maxChars = 120, maxLines = 3) {
  const div = document.createElement('div');
  div.innerHTML = html;
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
  if (!acts?.length) return `<p style="color:var(--muted);font-size:12px">${t('no_activities')}</p>`;
  return acts.map(a => `
    <div class="mini-act" onclick="editActivity(${a.id})" style="cursor:pointer;transition:all 0.2s" onmouseover="this.style.background='var(--primary-light)'" onmouseout="this.style.background='var(--bg)'">
      <span class="mini-act-type">${t('act_' + a.type)}</span>
      <div style="flex:1">
        <div class="mini-act-content" style="white-space:pre-wrap;overflow:hidden">${truncateActivityPreview(a.content)}</div>
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

function formatInlineNote(cmd) {
  document.execCommand(cmd, false, null);
  document.getElementById('inline-content')?.focus();
}

async function logInlineActivity(contactId) {
  const contentEl = document.getElementById('inline-content');
  if (!contentEl) return;
  const content = contentEl.innerHTML.trim();
  if (!content || content === '<br>') return;
  await api.post('/api/activities', { contact_id: contactId, type: document.getElementById('inline-type').value, content });
  contentEl.innerHTML = '';
  const c = await api.get(`/api/contacts/${contactId}`);
  document.getElementById('detail-acts').innerHTML = renderMiniActs(c.activities);
}

async function editActivity(activityId) {
  // Fetch the activity
  const activity = await api.get(`/api/activities/${activityId}`);
  if (!activity) {
    alert('Activity not found');
    return;
  }

  // Store the contact ID for later use (check both contact tab and deal view)
  let contactId = document.getElementById('detail-acts')?.dataset.contactId;
  if (!contactId) contactId = document.getElementById('deal-activities-list')?.dataset.contactId;
  window.currentEditActivityContactId = contactId;
  window.currentEditActivityId = activityId;

  // Check if we're in deal view or contact view
  const dealModal = document.getElementById('deal-modal');
  const isInDealView = dealModal && !dealModal.classList.contains('hidden');

  if (isInDealView) {
    // Show modal dialog for deal view
    showActivityEditModal(activity);
  } else {
    // Use side panel for contact view
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
          <select id="act-type-edit" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--input-bg);color:var(--text)">
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
          <div id="act-content-edit" class="note-editor" contenteditable="true">${activity.content}</div>
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
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <h2>Edit Activity</h2>
        <button class="close-btn" onclick="document.getElementById('activity-edit-modal')?.remove()">&times;</button>
      </div>
      <div style="padding:20px;background:var(--card-bg);max-height:70vh;overflow-y:auto">
        <div class="form-group">
          <label>Type</label>
          <select id="act-type-edit" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--input-bg);color:var(--text)">
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
          <div id="act-content-edit" class="note-editor" contenteditable="true" style="min-height:200px;padding:12px;border:1px solid var(--border);border-radius:4px;background:var(--input-bg);color:var(--text)">${activity.content}</div>
        </div>
        <div style="color:var(--muted);font-size:12px;margin-top:12px">
          Logged by ${esc(activity.logged_by_name || 'Unknown')} on ${fmtDate(activity.created_at)}
        </div>
      </div>
      <div style="padding:12px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;background:var(--card-bg)">
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
  // If in deal view, just close the modal without confirmation
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
    await api.delete(`/api/activities/${activityId}`);
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
    </div>`;
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

const _timelineIcons = { note: '📝', call: '📞', email: '✉️', whatsapp: '💬' };

const DEAL_NOTE_PREVIEW_LINES = 3;

function _countNoteLines(html = '') {
  const raw = String(html || '');
  if (!raw.trim()) return 0;
  // Count vertical breaks from Enter presses: <br>, block tags, and \n
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
      <div class="deal-timeline-icon type-${a.type}">${_timelineIcons[a.type] || '📝'}</div>
      <div class="deal-timeline-body">
        <div class="deal-timeline-header">
          <span class="deal-timeline-type type-${a.type}">${t('act_' + a.type)}</span>
          <span class="deal-timeline-date">${fmtDate(a.created_at)}</span>
        </div>
        <div class="deal-timeline-content ${shouldCollapse ? 'collapsed' : ''}">${a.content}</div>
        ${shouldCollapse ? '<button type="button" class="deal-note-expand-btn" onclick="event.stopPropagation();toggleDealNoteExpand(this)">Show more</button>' : ''}
        ${a.logged_by_name ? `<div class="deal-timeline-author">${t('logged_by')} ${esc(a.logged_by_name)}</div>` : ''}
      </div>
    </div>`;
}

function renderDealTimeline(acts, showAll) {
  if (!acts?.length) return `<p style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center">No activities yet. Click <strong>+ Add Note</strong> to get started.</p>`;
  const visible = showAll ? acts : acts.slice(0, DEAL_NOTES_PREVIEW_COUNT);
  return visible.map(a => renderTimelineItem(a, { fullContent: false })).join('');
}

function toggleDealNoteExpand(btn) {
  const content = btn.closest('.deal-timeline-body')?.querySelector('.deal-timeline-content');
  if (!content) return;
  const isCollapsed = content.classList.toggle('collapsed');
  btn.textContent = isCollapsed ? 'Show more' : 'Show less';
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
    container.innerHTML = `<p style="color:var(--danger);font-size:13px">Error loading activities.</p>`;
  }
}

function updateShowAllBtn(total) {
  const btn = document.getElementById('deal-show-all-btn');
  if (!btn) return;
  btn.style.display = '';
  btn.textContent = total > 0 ? `Show All (${total})` : 'Show All';
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
    : `<p style="color:var(--muted);font-size:13px;padding:40px 0;text-align:center">No activities yet.</p>`;
  modal.innerHTML = `
    <div class="modal" style="max-width:720px;width:92vw;max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-header" style="flex-shrink:0">
        <h2>All Notes & Activities</h2>
        <button class="close-btn" onclick="document.getElementById('all-notes-modal')?.remove()">&times;</button>
      </div>
      <div class="deal-timeline" style="flex:1;overflow-y:auto;padding:18px 24px">${items}</div>
    </div>`;
  document.body.appendChild(modal);
}

async function inlineEditDealNote(activityId, el) {
  if (el.classList.contains('editing')) return;
  const activity = await api.get(`/api/activities/${activityId}`);
  if (!activity) return;

  window.currentEditActivityId = activityId;
  const contactId = document.getElementById('deal-activities-list')?.dataset.contactId
    || document.getElementById('deal-activity-deal-id')?.value;
  window.currentEditActivityContactId = contactId;

  el.classList.add('editing');
  el.onclick = null;
  el.innerHTML = `
    <div class="deal-timeline-icon type-${activity.type}">${_timelineIcons[activity.type] || '📝'}</div>
    <div class="deal-timeline-body" style="width:100%">
      <select class="inline-edit-type" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;margin-bottom:6px;background:var(--input-bg);color:var(--text);font-size:12px">
        <option value="note" ${activity.type === 'note' ? 'selected' : ''}>Note</option>
        <option value="call" ${activity.type === 'call' ? 'selected' : ''}>Call</option>
        <option value="email" ${activity.type === 'email' ? 'selected' : ''}>Email</option>
        <option value="whatsapp" ${activity.type === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
      </select>
      <div class="note-editor-toolbar" style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
        <button type="button" class="fmt-btn" onclick="event.stopPropagation();document.execCommand('bold',false,null)" title="Bold"><strong>B</strong></button>
        <button type="button" class="fmt-btn" onclick="event.stopPropagation();document.execCommand('italic',false,null)" title="Italic"><em>I</em></button>
        <button type="button" class="fmt-btn" onclick="event.stopPropagation();document.execCommand('underline',false,null)" title="Underline"><u>U</u></button>
      </div>
      <div class="note-editor inline-edit-content" contenteditable="true" style="min-height:60px;font-size:13px"
        onkeydown="if(event.key==='Enter'&&event.ctrlKey){event.preventDefault();saveInlineEdit(this.closest('.deal-timeline-item'));}">${activity.content}</div>
      <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
        <button class="btn btn-sm" onclick="event.stopPropagation();cancelInlineEdit()">Cancel</button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteInlineEdit()">Delete</button>
        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();saveInlineEdit(this.closest('.deal-timeline-item'))">Save</button>
      </div>
      <div style="color:var(--muted);font-size:11px;margin-top:6px">${activity.logged_by_name ? `${t('logged_by')} ${esc(activity.logged_by_name)} · ` : ''}${fmtDate(activity.created_at)}</div>
    </div>`;
  el.querySelector('.inline-edit-content')?.focus();
  const editor = el.querySelector('.inline-edit-content');
  if (editor) {
    editor.focus();
    // Place caret at end so the insertion point is immediately visible
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
  if (!content || content === '<br>') { alert('Please enter some content'); return; }
  const activityId = window.currentEditActivityId;
  const contactId = window.currentEditActivityContactId;
  await api.patch(`/api/activities/${activityId}`, { type, content });
  if (contactId) await loadDealActivities(parseInt(contactId));
  refreshAllNotesModal(contactId);
}

function cancelInlineEdit() {
  const contactId = window.currentEditActivityContactId || document.getElementById('deal-activity-deal-id')?.value;
  if (contactId) loadDealActivities(parseInt(contactId));
}

async function deleteInlineEdit() {
  const activityId = window.currentEditActivityId;
  const contactId = window.currentEditActivityContactId;
  if (!confirm('Delete this activity? This cannot be undone.')) return;
  await api.delete(`/api/activities/${activityId}`);
  if (contactId) await loadDealActivities(parseInt(contactId));
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
        : `<p style="color:var(--muted);font-size:13px;padding:40px 0;text-align:center">No activities yet.</p>`;
    }
  } catch(e) { console.error(e); }
}

function toggleDealNoteForm() {
  const wrapper = document.getElementById('deal-note-form-wrapper');
  if (!wrapper) return;
  wrapper.classList.toggle('hidden');
  if (!wrapper.classList.contains('hidden')) {
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
  await api.post('/api/activities', { contact_id: parseInt(contactId), type, content });
  contentEl.innerHTML = '';
  const wrapper = document.getElementById('deal-note-form-wrapper');
  if (wrapper) wrapper.classList.add('hidden');
  await loadDealActivities(parseInt(contactId));
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
  const noteFormW = document.getElementById('deal-note-form-wrapper');
  if (noteFormW) noteFormW.classList.add('hidden');
  document.getElementById('deal-form').reset();
  document.getElementById('deal-id').value = id || '';
  document.getElementById('deal-modal-title').textContent = id ? 'Edit Deal' : 'Add Deal';
  document.getElementById('deal-delete-btn').style.display = id ? '' : 'none';

  // Batch all API calls together
  const [, , , , pipelinesRes, dealFieldsRes, allContacts, allSuppliers, dealDataRes, objectsRes, objectFieldsRes] = await Promise.all([
    ensureContacts(),
    ensureMembers(),
    ensureStages(),
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

  const contactSel  = document.getElementById('df-contact');
  const supplierSel = document.getElementById('df-supplier');
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

  if (dealData) {
    const d = dealData;
    document.getElementById('df-title').value = d.title;
    document.getElementById('df-value').value = d.value != null ? d.value : '';
    pipelineSel.value = d.pipeline_id || '';
    populateDealStages(d.pipeline_id, d.stage_id);
    contactSel.value  = d.contact_id  || '';
    supplierSel.value = d.supplier_id || '';
    assigneeSel.value = d.assigned_to || '';
    dealFields.forEach(f => { const el = document.getElementById(`dfield-${f.field_key}`); if (el) el.value = d.custom_data?.[f.field_key] ?? ''; });
    if (d.contact_id) {
      linkedContact = allContacts.find(c => c.id === d.contact_id) || null;
      document.getElementById('deal-activity-deal-id').value = d.contact_id;
      await loadDealActivities(d.contact_id);
    } else {
      document.getElementById('deal-activity-deal-id').value = '';
      document.getElementById('deal-activities-list').innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px;text-align:center;">No contact linked.</div>`;
    }
    linkedObjects = d.objects || [];
  } else {
    document.getElementById('deal-activity-deal-id').value = '';
    document.getElementById('deal-activities-list').innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px;text-align:center;">Save the deal and link a contact to view activities.</div>`;
  }

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
