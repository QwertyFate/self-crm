/* ═══════════════════════════════════════════════════════════════════════════
   LISTINGS ("objects") + the BOARD page + the ACTIVITIES page.

   Three pages in one file, because all three are small and were ported
   together. If you are looking for one of them, jump to its section:
     1. Listings    — a generic record type a workspace names itself
     2. Board       — an embedded Miro iframe, nothing more
     3. Activities  — the workspace-wide feed of notes/calls/emails/WhatsApp

   1. LISTINGS  (sidebar label = workspaces.object_name, default "Listings")
      A deliberately generic record: a name plus custom fields. It exists so a
      workspace can track whatever its business is about (properties, vehicles,
      SKUs) without a schema change. A listing can be linked to deals
      (deal_objects) and to contacts (object_contacts), which is what makes the
      detail view useful.
        loadObjects → GET /api/objects → renderObjectsTable (search, paging,
        inline edit) ;  openObjectDetail(id) → GET /api/objects/:id → a drawer
        with its linked deals and contacts.
      Columns work exactly like the Contacts page: effectiveObjectColumns()
      merges workspaces.object_columns with the workspace's object fields.
      The nav item hides itself when the workspace has no listings configured —
      updateObjectsNav(); the same pattern as updateSuppliersNav().

   2. BOARD  — loadBoard() drops workspaces.miro_url into an iframe.
      getMiroBoardUrl() converts a normal Miro link into an embed link.
      updateBoardNavVisibility() hides the nav item when no URL is set.

   3. ACTIVITIES  — the feed of everything logged against any contact.
      loadActivities → GET /api/activities (newest 200) → renderActivitiesFeed.
      Filters live in activitiesUI (search, type, person) and are applied by
      visibleActivities(). Creating one is modals.js (openActivityModal); the
      timelines inside the deal and contact views are detail-views.js.

   FUNCTION MAP
     listings     loadObjects, renderObjectsCurrent, renderObjectsTable,
                  objectMatchesQuery, onObjectSearch, clearObjectSearch,
                  updateObjectCountTag, objGoToPage, openObjectKebab,
                  openObjectsMoreMenu, exportObjectsCsv,
                  startObjectInlineEdit, openObjectModal, saveObject,
                  deleteObject, openObjectDetail, navigateToDeal
     obj config   effectiveObjectColumns, renderObjectColumnSettings,
                  objColDragStart, objColDrop, objColToggle, saveObjectColumns,
                  saveObjectTypeName, updateObjectsNav, renderObjectFieldsList,
                  openObjectFieldModal, autoObjectFieldKey,
                  toggleObjectFieldOptions, refreshObjectFieldViews,
                  saveObjectField, deleteObjectField
     suppliers    updateSuppliersNav, saveSupplierName
     board        updateBoardNavVisibility, loadBoard, getMiroBoardUrl,
                  reloadMiroIframe, saveMiroUrl
     activities   loadActivities, visibleActivities, renderActivities,
                  renderActivitiesToolbar, renderActivitiesFeed,
                  activitiesChip, openActivitiesChip, onActivitiesSearch,
                  clearActivitiesFilters, openActivityKebab, deleteActivity,
                  exportActivitiesCsv, openActivitiesMoreMenu
   ═══════════════════════════════════════════════════════════════════════════ */

function updateSuppliersNav() {
  const name  = currentWorkspace?.supplier_name || 'Suppliers';
  const label = document.getElementById('nav-suppliers-label');
  if (label) label.textContent = name;
}

async function saveSupplierName() {
  const input = document.getElementById('supplier-name-input'), msgEl = document.getElementById('supplier-name-msg');
  const name = input?.value.trim(); if (!name) return;
  const res = await api.patch('/api/workspace/supplier-name', { name });
  if (res.error) { if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); } return; }
  currentWorkspace.supplier_name = res.name;
  updateSuppliersNav();
  if (currentContactType === 'supplier') updateContactsPageHeader();
  if (msgEl) { msgEl.textContent = 'Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}

function updateObjectsNav() {
  const name  = currentWorkspace?.object_name || 'Listings';
  const singular = name.replace(/s$/i, '');
  const label = document.getElementById('nav-objects-label');
  const title = document.getElementById('objects-page-title');
  const btn   = document.getElementById('add-object-btn');
  const tab   = document.getElementById('settings-tab-objects');
  const search = document.getElementById('object-search');
  if (label) label.textContent = name;
  if (title) title.textContent = name;
  // Keep the plus icon: only the label inside the button changes.
  if (btn)   { const span = btn.querySelector('span'); if (span) span.textContent = `Add ${singular}`; }
  if (tab)   tab.textContent   = name;
  const paneTitle = document.getElementById('settings-objects-pane-title');   // heading of the settings section for this list
  if (paneTitle) paneTitle.textContent = name;
  if (search) search.placeholder = `Search ${name.toLowerCase()}…`;
}

function effectiveObjectColumns() {
  const BUILTIN = [{ key: 'created_at', label: () => t('col_created_at'), show: false }];
  const ALL = [...BUILTIN, ...objectFields.map(f => ({ key: f.field_key, label: () => f.name, type: f.type, show: true }))];
  if (!objectColumns.length) return ALL.map(c => ({ ...c, visible: c.show }));
  const savedMap = Object.fromEntries(objectColumns.map(c => [c.key, c.visible]));
  const ordered  = objectColumns
    .map(({ key }) => { const def = ALL.find(c => c.key === key); return def ? { ...def, visible: savedMap[key] } : null; })
    .filter(Boolean);
  ALL.filter(c => !(c.key in savedMap)).forEach(c => ordered.push({ ...c, visible: c.show }));
  return ordered;
}

async function loadObjects() {
  localStorage.removeItem('objectViewMode'); // legacy card/table preference — this page is list-only now
  objectFields   = await api.get('/api/object-fields');
  objectColumns  = currentWorkspace?.object_columns || [];
  objects        = await api.get('/api/objects');
  objCurrentPage = 1;
  renderObjectsCurrent();
}

// A new search term resets to page 1 so results are never missed off-page.
function onObjectSearch() {
  objCurrentPage = 1;
  renderObjectsCurrent();
}

function clearObjectSearch() {
  const input = document.getElementById('object-search');
  if (input) input.value = '';
  objCurrentPage = 1;
  renderObjectsCurrent();
}

// Matches the name plus every custom value, so users can search any column.
function objectMatchesQuery(o, q) {
  if (!q) return true;
  if ((o.name || '').toLowerCase().includes(q)) return true;
  return Object.values(o.custom_data || {}).some(v => String(v ?? '').toLowerCase().includes(q));
}

function renderObjectsCurrent() {
  const q = (document.getElementById('object-search')?.value || '').trim().toLowerCase();
  renderObjectsTable(objects.filter(o => objectMatchesQuery(o, q)), q);
}

function renderObjectsTable(list, q = '') {
  const visCols  = effectiveObjectColumns().filter(c => c.visible);
  const typeName = currentWorkspace?.object_name || 'Listings';
  const singular = typeName.replace(/s$/i, '');
  const dash     = '<span class="muted-dash">—</span>';
  const colspan  = visCols.length + 2;

  document.getElementById('objects-thead').innerHTML =
    `<tr><th>${esc(singular)} name</th>${visCols.map(c => `<th>${esc(c.label())}</th>`).join('')}<th></th></tr>`;

  const total = list.length, totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (objCurrentPage > totalPages) objCurrentPage = totalPages;
  const page = list.slice((objCurrentPage - 1) * PAGE_SIZE, objCurrentPage * PAGE_SIZE);
  const tbody = document.getElementById('objects-tbody');

  if (!page.length) {
    tbody.innerHTML = `<tr class="table-empty-row"><td colspan="${colspan}">
      <div class="table-empty">
        <div class="empty-state-art"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg></div>
        <h2>${q ? 'No matches found' : `No ${esc(typeName.toLowerCase())} yet`}</h2>
        <p>${q
          ? `Nothing matches “${esc(q)}”. Try a different search term.`
          : `Add your first ${esc(singular.toLowerCase())} to keep everything in one place.`}</p>
        ${q
          ? '<button class="btn btn-sm" onclick="clearObjectSearch()">Clear search</button>'
          : `<div class="hstack-tight">
              <button class="btn btn-sm btn-primary" onclick="openObjectModal()">+ Add ${esc(singular)}</button>
              ${objectFields.length ? '' : '<button class="btn btn-sm" onclick="openObjectFieldModal()">Add column</button>'}
            </div>`}
      </div>
    </td></tr>`;
  } else {
    tbody.innerHTML = page.map(o => {
      const cells = visCols.map(col => {
        if (col.key === 'created_at')
          return `<td title="${esc(String(o.created_at || ''))}">${fmtDate(o.created_at) || dash}</td>`;
        const v = o.custom_data?.[col.key] ?? '';
        return `<td class="editable-cell" title="${esc(v)}" onclick="startObjectInlineEdit(this,${o.id},'${col.key}','${col.type||'text'}')">${esc(v) || dash}</td>`;
      }).join('');
      return `<tr>
        <td class="name-cell" title="${esc(o.name)}"><strong class="contact-name-link" onclick="openObjectDetail(${o.id})">${esc(o.name)}</strong></td>
        ${cells}
        <td style="white-space:nowrap"><button class="iconbtn" style="width:28px;height:28px" onclick="openObjectKebab(this,${o.id})" aria-label="Actions for ${esc(o.name)}" aria-haspopup="menu">${icon('ellipsis')}</button></td>
      </tr>`;
    }).join('');
  }

  updateObjectCountTag(total, page.length, q);

  const pagEl = document.getElementById('objects-pagination');
  if (!pagEl) return;
  if (!total) { pagEl.innerHTML = ''; return; }
  const s = (objCurrentPage - 1) * PAGE_SIZE + 1, e = Math.min(objCurrentPage * PAGE_SIZE, total);
  pagEl.innerHTML = `<span class="tnum">Showing ${s}–${e} of ${total}</span>` + (totalPages > 1
    ? `<nav class="ct-pg" aria-label="Pagination">
        <button type="button" onclick="objGoToPage(${objCurrentPage-1})" aria-label="Previous page" ${objCurrentPage===1?'disabled':''}><span class="ct-flip">${icon('chevron-right')}</span></button>
        ${buildPageNumbers(objCurrentPage, totalPages).map(p => p==='…'?'<span class="gap" aria-hidden="true">…</span>':`<button type="button" onclick="objGoToPage(${p})" ${p===objCurrentPage?'aria-current="page"':''}>${p}</button>`).join('')}
        <button type="button" onclick="objGoToPage(${objCurrentPage+1})" aria-label="Next page" ${objCurrentPage===totalPages?'disabled':''}>${icon('chevron-right')}</button>
      </nav>`
    : '');
}

function openObjectKebab(anchor, id) {
  ui.menu(anchor, [
    { label: t('btn_edit'), icon: 'pencil', onSelect: () => openObjectModal(id) },
    { sep: true },
    { label: t('btn_delete'), icon: 'trash', danger: true, onSelect: () => deleteObject(id) },
  ], { align: 'right' });
}

function exportObjectsCsv() {
  const visCols = effectiveObjectColumns().filter(c => c.visible);
  const typeName = currentWorkspace?.object_name || 'Listings';
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = [typeName.replace(/s$/i, '') + ' name', ...visCols.map(c => c.label()), 'Created'];
  const rows = objects.map(o => [o.name, ...visCols.map(c => c.key === 'created_at' ? fmtDate(o.created_at) : (o.custom_data?.[c.key] ?? '')), fmtDate(o.created_at)].map(q).join(','));
  const csv = [head.map(q).join(','), ...rows].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = `${typeName.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
}
function openObjectsMoreMenu(anchor) {
  ui.menu(anchor, [{ label: t('export_csv'), icon: 'download', onSelect: () => exportObjectsCsv() }], { align: 'right' });
}

// Toolbar feedback: how many rows matched + a Clear button while searching.
function updateObjectCountTag(total, showing, q) {
  const tag = document.getElementById('object-count');
  if (tag) {
    if (!total)   tag.textContent = '';
    else if (q)   tag.textContent = `${showing} of ${total} shown`;
    else          tag.textContent = `${total} item${total === 1 ? '' : 's'}`;
  }
  document.getElementById('object-search-clear')?.classList.toggle('hidden', !q);
}

function objGoToPage(p) { objCurrentPage = p; renderObjectsCurrent(); }

function startObjectInlineEdit(td, objectId, fieldKey, fieldType) {
  if (td.querySelector('input,select')) return;
  const obj = objects.find(o => o.id === objectId); if (!obj) return;
  const origHTML = td.innerHTML;
  const el = document.createElement('input');
  el.className = 'inline-input';
  el.type = { number:'number', date:'date', url:'url', email:'email', phone:'tel' }[fieldType] || 'text';
  el.value = obj.custom_data?.[fieldKey] ?? ''; const origVal = el.value;
  el.onblur = async () => {
    const val = el.value.trim(); td.innerHTML = origHTML; if (val === origVal) return;
    obj.custom_data = { ...(obj.custom_data||{}), [fieldKey]: val };
    await api.put(`/api/objects/${objectId}`, { name: obj.name, custom_data: obj.custom_data });
    renderObjectsCurrent();
  };
  el.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.onblur = null; td.innerHTML = origHTML; }
  };
  td.innerHTML = ''; td.appendChild(el); el.focus(); el.select?.();
}

async function openObjectModal(id) {
  if (!objectFields.length) objectFields = await api.get('/api/object-fields');
  document.getElementById('object-form').reset();
  document.getElementById('object-id').value = id || '';
  const typeName = (currentWorkspace?.object_name || 'Listing').replace(/s$/i,'');
  document.getElementById('object-modal-title').textContent = id ? `Edit ${typeName}` : `Add ${typeName}`;
  const nameLabel = document.getElementById('obj-name-label');
  if (nameLabel) nameLabel.innerHTML = `${esc(typeName)} name <span class="req">*</span>`;
  document.getElementById('obj-custom-fields').innerHTML = objectFields.length
    ? objectFields.map(f =>
        `<div class="field"><label class="label" for="dfield-${f.field_key}">${esc(f.name)}</label>${renderDealFieldInput(f,'')}</div>`
      ).join('')
    : '<p class="text-xs text-muted">No extra fields set up yet — the name is all that is needed.</p>';
  if (id) {
    const obj = objects.find(o => o.id === id) || await api.get(`/api/objects/${id}`);
    document.getElementById('obj-name').value = obj.name;
    objectFields.forEach(f => { const el = document.getElementById(`dfield-${f.field_key}`); if (el) el.value = obj.custom_data?.[f.field_key] ?? ''; });
  }
  const body = document.getElementById('object-modal-body');
  if (body) body.scrollTop = 0;
  document.getElementById('object-modal').classList.remove('hidden');
  document.getElementById('obj-name')?.focus();
}

async function saveObject(e) {
  e.preventDefault();
  const id = document.getElementById('object-id').value;
  const custom_data = Object.fromEntries(objectFields.map(f => [f.field_key, document.getElementById(`dfield-${f.field_key}`)?.value || '']));
  const payload = { name: document.getElementById('obj-name').value, custom_data };
  if (id) await api.put(`/api/objects/${id}`, payload); else await api.post('/api/objects', payload);
  closeModal('object-modal'); await loadObjects();
}

async function deleteObject(id) {
  const singular = (currentWorkspace?.object_name || 'Listing').replace(/s$/i,'');
  const ok = await ui.confirm({ title: `Delete this ${singular.toLowerCase()}?`, message: 'Links to deals and contacts are removed with it. This cannot be undone.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  await api.del(`/api/objects/${id}`);
  objects = objects.filter(o => o.id !== id); renderObjectsCurrent();
}

async function openObjectDetail(id) {
  const [obj, allContacts, allSuppliers] = await Promise.all([
    api.get(`/api/objects/${id}`),
    api.get('/api/contacts?contact_type=contact'),
    api.get('/api/contacts?contact_type=supplier'),
  ]);
  if (!objectFields.length) objectFields = await api.get('/api/object-fields');
  if (!deals.length) deals = await api.get('/api/deals');
  if (!pipelines.length) pipelines = await api.get('/api/pipelines');

  const S = { obj };
  const supplierLabel = currentWorkspace?.supplier_name || 'Suppliers';
  const stageOfDeal = d => (pipelines.find(p => p.id === d.pipeline_id)?.stages || []).find(s => s.id === d.stage_id);

  function detailsCard() {
    const rows = objectFields.map(f => { const v = S.obj.custom_data?.[f.field_key]; return v ? `<dt>${esc(f.name)}</dt><dd>${esc(v)}</dd>` : ''; }).join('');
    return `<section class="card" aria-label="Details"><div class="card-header"><h2 class="card-title">Details</h2></div>
      <div class="card-body">${rows ? `<dl class="kv" style="margin:0">${rows}</dl>` : '<p class="muted">No details recorded yet.</p>'}</div></section>`;
  }
  function peopleCard() {
    const linked = S.obj.contacts || [];
    const rows = linked.map(c => `<li class="list-item"><div class="person">${avatar(c.name)}<div style="min-width:0"><div class="p-name truncate">${esc(c.name)}${c.company ? ` <span class="muted">${esc(c.company)}</span>` : ''}</div>
        <div class="p-sub">${c.contact_type === 'supplier' ? esc(supplierLabel.replace(/s$/i, '')) : 'Contact'}${c.email ? ` · ${esc(c.email)}` : ''}</div></div></div>
      <button class="iconbtn" data-act="unlink-contact" data-id="${c.id}" aria-label="Unlink ${esc(c.name)}">${icon('x')}</button></li>`).join('');
    return `<section class="card" aria-label="Contacts and ${esc(supplierLabel)}"><div class="card-header"><h2 class="card-title">Contacts &amp; ${esc(supplierLabel)}</h2>
        <button class="btn btn-ghost btn-sm" data-act="link-contact">${icon('plus')}Link</button></div>
      ${rows ? `<ul class="list">${rows}</ul>` : '<div class="card-body"><p class="muted">No contacts or suppliers linked.</p></div>'}</section>`;
  }
  function dealsCard() {
    const linked = S.obj.deals || [];
    const rows = linked.map(d => { const st = stageOfDeal(d); return `<li class="list-item clickable" data-act="open-deal" data-id="${d.id}"><div class="grow" style="min-width:0"><div class="p-name truncate">${esc(d.title)}</div>
        <div class="p-sub">${st ? `<span class="stage-pill"><i style="background:${esc(st.color)}"></i>${esc(st.name)}</span>` : 'No stage'}${d.value != null ? ` · ${fmtEUR(d.value)}` : ''}</div></div>
      <button class="iconbtn" data-act="unlink-deal" data-id="${d.id}" aria-label="Unlink ${esc(d.title)}">${icon('x')}</button></li>`; }).join('');
    return `<section class="card" aria-label="Deals"><div class="card-header"><h2 class="card-title">Deals</h2>
        <button class="btn btn-ghost btn-sm" data-act="link-deal">${icon('plus')}Link</button></div>
      ${rows ? `<ul class="list">${rows}</ul>` : '<div class="card-body"><p class="muted">No deals linked.</p></div>'}</section>`;
  }
  function render() { m.body.innerHTML = `<div class="col" style="gap:16px">${detailsCard()}${peopleCard()}${dealsCard()}</div>`; }

  const m = ui.modal({ title: obj.name, size: 'lg', body: '<div></div>',
    footer: `<button class="btn btn-danger-ghost" data-act="delete" style="margin-right:auto">${icon('trash')}Delete</button><button class="btn btn-secondary" data-act="edit">${icon('pencil')}Edit</button><button class="btn btn-secondary" data-close>Close</button>` });

  async function reload() { S.obj = await api.get(`/api/objects/${id}`); render(); }
  const A = {
    'link-contact': el => {
      const linkedIds = new Set((S.obj.contacts || []).map(c => c.id));
      const available = [...allContacts, ...allSuppliers].filter(c => !linkedIds.has(c.id));
      if (!available.length) return ui.toast('Everyone is already linked.');
      ui.select(el, available.map(c => ({ value: c.id, label: c.company ? `${c.name}, ${c.company}` : c.name })), null, async v => {
        const res = await api.post(`/api/objects/${id}/contacts`, { contact_id: v }); if (res?.error) return ui.toast(res.error);
        await reload(); ui.toast('Linked');
      });
    },
    'unlink-contact': async el => { const res = await api.del(`/api/objects/${id}/contacts/${+el.dataset.id}`); if (res?.error) return ui.toast(res.error); await reload(); ui.toast('Unlinked'); },
    'link-deal': el => {
      const linkedIds = new Set((S.obj.deals || []).map(d => d.id));
      const available = deals.filter(d => !linkedIds.has(d.id));
      if (!available.length) return ui.toast('Every deal is already linked.');
      ui.select(el, available.map(d => ({ value: d.id, label: d.contact_name ? `${d.title} — ${d.contact_name}` : d.title })), null, async v => {
        const res = await api.post(`/api/objects/${id}/deals`, { deal_id: v }); if (res?.error) return ui.toast(res.error);
        deals = await api.get('/api/deals'); await reload(); ui.toast('Linked');
      });
    },
    'unlink-deal': async el => { const res = await api.del(`/api/objects/${id}/deals/${+el.dataset.id}`); if (res?.error) return ui.toast(res.error); deals = await api.get('/api/deals'); await reload(); ui.toast('Unlinked'); },
    'open-deal': el => { m.close(); openDealDetail(+el.dataset.id); },
    delete: async () => { m.close(); await deleteObject(id); },
    edit: () => { m.close(); openObjectModal(id); },
  };
  on(m.el, 'click', '[data-act]', (e, el) => { const fn = A[el.dataset.act]; if (fn) fn(el); });
  render();
}

async function navigateToDeal(dealId) {
  await openDealDetail(dealId);
}

function renderObjectFieldsList() {
  const el = document.getElementById('object-fields-list'); if (!el) return;
  if (!objectFields.length) { el.innerHTML = `<li class="settings-empty">${t('no_fields')}</li>`; return; }
  el.innerHTML = objectFields.map(f => `
    <li class="settings-row">
      <span class="row-label">${esc(f.name)}</span><span class="row-sub">${esc(f.type)}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" title="${t('btn_edit')}" aria-label="${t('btn_edit')}" onclick="openObjectFieldModal(${f.id})">${UI_ICON.edit}</button>
        <button class="btn btn-sm btn-danger btn-icon" title="${t('btn_delete')}" aria-label="${t('btn_delete')}" onclick="deleteObjectField(${f.id})">${UI_ICON.remove}</button>
      </div>
    </li>`).join('');
}

function openObjectFieldModal(id) {
  document.getElementById('object-field-form').reset();
  document.getElementById('objf-id').value = id || '';
  document.getElementById('objf-options-group').classList.add('hidden');
  const objName = currentWorkspace?.object_name || 'Listings';
  document.getElementById('object-field-modal-title').textContent = id ? 'Edit Field' : 'Add Field';
  const hint = document.getElementById('objf-hint');
  if (hint) hint.textContent = `Each field becomes a column in ${objName} and a property on every item.`;
  if (id) {
    const f = objectFields.find(f => f.id === id);
    document.getElementById('objf-name').value = f.name;
    document.getElementById('objf-key').value  = f.field_key;
    document.getElementById('objf-type').value = f.type;
    document.getElementById('objf-options').value = (f.options||[]).join('\n');
    if (f.type === 'dropdown') document.getElementById('objf-options-group').classList.remove('hidden');
  }
  document.getElementById('object-field-modal').classList.remove('hidden');
  document.getElementById('objf-name')?.focus();
}
function autoObjectFieldKey() {
  if (document.getElementById('objf-id').value) return;
  document.getElementById('objf-key').value = document.getElementById('objf-name').value
    .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function toggleObjectFieldOptions() {
  document.getElementById('objf-options-group').classList.toggle('hidden', document.getElementById('objf-type').value !== 'dropdown');
}
// Keep Settings (fields + column order) and the listings table in sync.
function refreshObjectFieldViews() {
  renderObjectFieldsList();
  renderObjectColumnSettings();
  if (document.getElementById('page-objects')?.classList.contains('active')) renderObjectsCurrent();
}
async function saveObjectField(e) {
  e.preventDefault();
  const id = document.getElementById('objf-id').value, type = document.getElementById('objf-type').value;
  const payload = {
    name: document.getElementById('objf-name').value, field_key: document.getElementById('objf-key').value, type,
    options: type === 'dropdown' ? document.getElementById('objf-options').value.split('\n').map(s=>s.trim()).filter(Boolean) : [],
  };
  const res = id ? await api.put(`/api/object-fields/${id}`, payload) : await api.post('/api/object-fields', payload);
  if (res.error) { alert(res.error); return; }
  closeModal('object-field-modal');
  objectFields = await api.get('/api/object-fields');
  refreshObjectFieldViews();
}
async function deleteObjectField(id) {
  if (!confirm('Delete this column? Values stored in it will no longer show on any item.')) return;
  await api.del(`/api/object-fields/${id}`);
  objectFields = objectFields.filter(f => f.id !== id);
  refreshObjectFieldViews();
}

function renderObjectColumnSettings() {
  const el = document.getElementById('object-columns-list'); if (!el) return;
  const cols = effectiveObjectColumns();
  el.innerHTML = cols.map((col, i) => `
    <li class="settings-row col-cfg-row" draggable="true"
      ondragstart="objColDragStart(event,${i})" ondragover="colDragOver(event)" ondrop="objColDrop(event,${i})" ondragleave="colDragLeave(event)">
      <span class="drag-handle">${UI_ICON.drag}</span>
      <span class="row-label">${col.label()}</span>
      <label class="col-vis-toggle"><input type="checkbox" ${col.visible?'checked':''} onchange="objColToggle(${i},this.checked)" /></label>
    </li>`).join('');
}
function objColDragStart(e,i){ objColDragIdx=i; e.dataTransfer.effectAllowed='move'; }
function objColDrop(e,targetIdx){
  e.preventDefault(); e.currentTarget.classList.remove('col-drag-over');
  if(objColDragIdx===null||objColDragIdx===targetIdx){objColDragIdx=null;return;}
  const cols=effectiveObjectColumns(); const moved=cols.splice(objColDragIdx,1)[0]; cols.splice(targetIdx,0,moved);
  objColDragIdx=null; objectColumns=cols.map(({key,visible})=>({key,visible})); renderObjectColumnSettings();
}
function objColToggle(i,visible){const cols=effectiveObjectColumns();cols[i].visible=visible;objectColumns=cols.map(({key,visible})=>({key,visible}));}
async function saveObjectColumns(){
  const toSave=effectiveObjectColumns().map(({key,visible})=>({key,visible}));
  const btn=document.getElementById('save-obj-cols-btn'), msgEl=document.getElementById('obj-cols-msg');
  if(btn){btn.disabled=true;btn.textContent='…';}
  const res=await api.patch('/api/workspace/object-columns',{columns:toSave});
  if(btn){btn.disabled=false;btn.textContent=t('btn_save');}
  if(res.error){if(msgEl){msgEl.textContent=res.error;msgEl.className='workspace-name-msg error';msgEl.classList.remove('hidden');}return;}
  objectColumns=toSave; currentWorkspace.object_columns=toSave;
  if(msgEl){msgEl.textContent='Saved';msgEl.className='workspace-name-msg success';msgEl.classList.remove('hidden');}
  setTimeout(()=>msgEl?.classList.add('hidden'),2500); renderObjectsCurrent();
}
async function saveObjectTypeName(){
  const input=document.getElementById('object-name-input'), msgEl=document.getElementById('object-name-msg');
  const name=input?.value.trim(); if(!name) return;
  const res=await api.patch('/api/workspace/object-name',{name});
  if(res.error){if(msgEl){msgEl.textContent=res.error;msgEl.className='workspace-name-msg error';msgEl.classList.remove('hidden');}return;}
  currentWorkspace.object_name=res.name; updateObjectsNav();
  if(msgEl){msgEl.textContent='Saved';msgEl.className='workspace-name-msg success';msgEl.classList.remove('hidden');}
  setTimeout(()=>msgEl?.classList.add('hidden'),2500);
}

function updateBoardNavVisibility() {
  document.getElementById('nav-board-link')?.classList.toggle('hidden', !currentWorkspace?.miro_url);
}
function getMiroBoardUrl(embedUrl) { return embedUrl?.replace('/live-embed/', '/board/') || null; }
function reloadMiroIframe() { const f = document.getElementById('miro-iframe'); if (f) { const s = f.src; f.src = ''; f.src = s; } }
function loadBoard() {
  const el = document.getElementById('board-content'), url = currentWorkspace?.miro_url;
  if (!el) return;
  el.innerHTML = '';
  if (!url) {
    el.innerHTML = `<div class="board-empty bd-empty">
      <div class="hero">${icon('board')}</div>
      <h2>No Miro board linked yet</h2>
      <ol class="bd-steps">
        <li>Open <strong>Settings → General → Miro Board</strong>.</li>
        <li>In Miro, choose <strong>Share → Embed</strong> and copy the link.</li>
        <li>Paste it there and save — this page will show it from then on.</li>
      </ol>
    </div>`;
    return;
  }
  const boardUrl = getMiroBoardUrl(url);
  el.innerHTML = `
    <div class="board-topbar">
      <span class="board-topbar-hint">${icon('alert', 'ic-sm')} Seeing a login page or 403? Google blocks login inside iframes. Open Miro in a new tab, log in, then click Reload.</span>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-sm" onclick="reloadMiroIframe()">${icon('refresh', 'ic-sm')}Reload</button>
        <a class="btn btn-sm btn-primary" href="${esc(boardUrl)}" target="_blank" rel="noopener">${icon('arrow-up-right', 'ic-sm')}Open in Miro</a>
      </div>
    </div>
    <iframe id="miro-iframe" src="${esc(url)}" class="miro-iframe" allow="fullscreen; clipboard-read; clipboard-write" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
}
async function saveMiroUrl() {
  const input = document.getElementById('miro-url-input'), msgEl = document.getElementById('miro-url-msg');
  const url = input?.value.trim() || null;
  const res = await api.patch('/api/workspace/miro-url', { url });
  if (res.error) { if (msgEl) { msgEl.textContent = res.error; msgEl.className = 'workspace-name-msg error'; msgEl.classList.remove('hidden'); } return; }
  currentWorkspace.miro_url = url; updateBoardNavVisibility();
  if (msgEl) { msgEl.textContent = 'Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}

// Toolbar/feed state for the Activities page: search, type, and who logged it.
let activitiesUI = { q: '', type: null, by: null, deal: null };
let activityDeals = [];   // deals that have notes, captured from an unfiltered load — the Deal chip's options

async function loadActivities() {
  await ensureMembers();
  // The Deal filter is applied by the SERVER (?deal_id=): "bound to the deal, or a contact-level
  // note on its contact" is one SQL rule, not a second copy here. Type, person and search stay local.
  activities = await api.get(activitiesUI.deal ? `/api/activities?deal_id=${activitiesUI.deal}` : '/api/activities');
  if (!Array.isArray(activities)) activities = [];
  // Options are the deals that actually have notes BOUND to them (bound_deal_id) — not deal_id, which
  // for an unbound note is the derived fallback and would be an option that matches nothing.
  if (!activitiesUI.deal) activityDeals = [...new Map(activities.filter(a => a.bound_deal_id).map(a => [a.bound_deal_id, { id: a.bound_deal_id, title: a.deal_title || 'Deal' }])).values()];
  renderActivities();
}

function visibleActivities() {
  const q = activitiesUI.q.trim().toLowerCase();
  return activities.filter(a => {
    if (activitiesUI.type && a.type !== activitiesUI.type) return false;
    if (activitiesUI.by != null && a.created_by !== activitiesUI.by) return false;
    if (q && !`${dvActText(a.content)} ${a.contact_name || ''} ${a.deal_title || ''}`.toLowerCase().includes(q)) return false;   // search the visible text (not stored <br>/entities), the contact and the deal
    return true;
  });
}

function renderActivities() {
  const sub = document.getElementById('activities-page-sub');
  if (sub) {
    const weekMs = 7 * 86400000, week = activities.filter(a => Date.now() - new Date(a.created_at).getTime() < weekMs).length;
    sub.textContent = tf('activities_logged', { n: activities.length, m: week });
  }
  renderActivitiesToolbar();
  renderActivitiesFeed();
}

function renderActivitiesToolbar() {
  const el = document.getElementById('activities-toolbar');
  if (!el) return;
  const active = document.activeElement && document.activeElement.id === 'activities-q';
  const types = [...new Set(activities.map(a => a.type))];
  const any = activitiesUI.q || activitiesUI.type || activitiesUI.by != null || activitiesUI.deal != null;
  el.innerHTML = `<div class="input-group" style="width:260px">${icon('search')}<input class="input" id="activities-q" type="search" placeholder="${esc(t('search_activities'))}" value="${esc(activitiesUI.q)}" aria-label="${esc(t('search_activities'))}" oninput="onActivitiesSearch(this.value)"></div>
    ${activitiesChip('type', types)}${activitiesChip('by', members)}${activitiesChip('deal', activityDeals)}
    ${any ? `<button class="btn btn-ghost btn-sm" type="button" onclick="clearActivitiesFilters()">${esc(t('clear_filters'))}</button>` : ''}`;
  if (active) { const q = document.getElementById('activities-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
function activitiesChip(key, opts) {
  const v = activitiesUI[key], on = v != null && v !== '';
  const txt = on ? (key === 'type' ? t('act_' + v) : key === 'deal' ? (activityDeals.find(d => d.id === v)?.title || '') : (members.find(m => m.id === v)?.name || '')) : '';
  return `<button class="chip ${on ? 'on' : ''}" type="button" onclick="openActivitiesChip(this,'${key}')" aria-haspopup="menu">${esc(t('chip_' + (key === 'by' ? 'person' : key)))}${on ? ': ' + esc(txt) : ''}${icon('chevron-down', 'ic-sm')}</button>`;
}
function openActivitiesChip(anchor, key) {
  const opts = key === 'type' ? [...new Set(activities.map(a => a.type))].map(v => ({ value: v, label: t('act_' + v) }))
    : key === 'deal' ? activityDeals.map(d => ({ value: d.id, label: d.title }))
    : members.map(m => ({ value: m.id, label: m.name }));
  ui.select(anchor, [{ value: null, label: t('filter_all') }, ...opts], activitiesUI[key], v => { activitiesUI[key] = v; if (key === 'deal') loadActivities(); else renderActivities(); });
}
let activitiesSearchTimer = null;
function onActivitiesSearch(value) {
  activitiesUI.q = value;
  clearTimeout(activitiesSearchTimer);
  activitiesSearchTimer = setTimeout(() => { renderActivitiesToolbar(); renderActivitiesFeed(); }, 120);
}
function clearActivitiesFilters() { const refetch = activitiesUI.deal != null; activitiesUI = { q: '', type: null, by: null, deal: null }; if (refetch) loadActivities(); else renderActivities(); }

function renderActivitiesFeed() {
  const el = document.getElementById('activities-list');
  if (!el) return;
  const rows = visibleActivities();
  if (!activities.length) { el.innerHTML = `<p style="color:var(--muted);padding:8px">${t('no_activities')}</p>`; return; }
  if (!rows.length) { el.innerHTML = `<div class="empty">${icon('search')}<b>${esc(t('no_activities_match'))}</b></div>`; return; }
  el.innerHTML = rows.map(a => `
    <div class="activity-item">
      <div class="act-icon ${a.type}">${icon(a.type)}</div>
      <div class="act-body">
        <div class="act-meta"><strong>${t('act_' + a.type)}</strong>${a.contact_id ? ` · <a href="#" class="act-link" onclick="event.preventDefault();openContactDetail(${a.contact_id})">${esc(a.contact_name || 'Contact')}</a>` : a.contact_name ? ` · ${esc(a.contact_name)}` : ''}${a.deal_id ? ` · <a href="#" class="act-link" onclick="event.preventDefault();openDealDetail(${a.deal_id})">${esc(a.deal_title || 'Deal')}</a>` : ''} · ${fmtDate(a.created_at)}</div>
        ${a.logged_by_name ? `<div class="act-logged-by">${t('logged_by')} ${esc(a.logged_by_name)} · <span class="act-logged-email">${esc(a.logged_by_email||'')}</span></div>` : ''}
        <div class="act-content">${dvActHtml(a.content)}</div>
      </div>
      <button class="iconbtn" onclick="openActivityKebab(this,${a.id})" aria-label="Actions" aria-haspopup="menu">${icon('ellipsis')}</button>
    </div>`).join('');
}

function openActivityKebab(anchor, id) {
  ui.menu(anchor, [{ label: t('delete_activity'), icon: 'trash', danger: true, onSelect: () => deleteActivity(id) }], { align: 'right' });
}
async function deleteActivity(id) { await api.del(`/api/activities/${id}`); activities = activities.filter(a => a.id !== id); renderActivities(); ui.toast(t('activity_deleted')); }

function exportActivitiesCsv() {
  const rows = visibleActivities();
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Type', 'Contact', 'Logged by', 'Date', 'Content'];
  const lines = rows.map(a => [t('act_' + a.type), a.contact_name || '', a.logged_by_name || '', a.created_at ? new Date(a.created_at).toISOString().slice(0, 10) : '', dvActText(a.content)].map(q).join(','));
  const csv = [head.map(q).join(','), ...lines].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = `activities-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  ui.toast(tf('export_activities_csv', { n: rows.length }));
}
function openActivitiesMoreMenu(anchor) {
  ui.menu(anchor, [{ label: t('export_csv'), icon: 'download', onSelect: () => exportActivitiesCsv() }], { align: 'right' });
}
