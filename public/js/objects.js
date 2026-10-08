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

   3. ACTIVITIES  — the feed of everything logged against any contact, ported
      in full from reference/pro (screen: activities.js).
      loadActivities → GET /api/deals + GET /api/activities (newest 200) →
      renderActivities (sub line, toolbar, compose card, feed, rail).
      Filters live in activitiesUI (search, type, person, deal, period) and are
      applied by visibleActivities(). Logging one is the inline compose card
      (submitActivityCompose → POST /api/activities); the Calendar still logs
      through modals.js (openActivityModal). The timelines inside the deal and
      contact views are detail-views.js.

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
     activities   resetActivitiesUI, activityDealOptions, actLocale, actStartOfDay, actDayDiff, actDayLabel, actAgo,
                  actTime, actPlural, actContactOf, activityDetailOpts,
                  openActivityDeal, openActivityContact,
                  loadActivities, visibleActivities,
                  activitiesAnyFilter, renderActivities,
                  renderActivitiesToolbar, activitiesChip, openActivitiesChip,
                  onActivitiesSearch, clearActivitiesFilters,
                  renderActivityCompose, setActivityComposeType,
                  activityComposeClearError, onActivityComposeInput,
                  onActivityComposeDeal, onActivityComposeContact,
                  onActivityComposeKey, focusActivityCompose,
                  submitActivityCompose, renderActivitiesFeed,
                  renderActivitiesRail, toggleActivitiesStat,
                  openActivityKebab, deleteActivity, exportActivitiesCsv
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

/* ───────────────────────────────────────────────────────────────────────────
   ACTIVITIES — ported in full from reference/pro/crm-pro.html (screen:
   activities.js): toolbar (search + Type / Person / Deal / Period chips), an
   inline compose card, the feed grouped by day, a rail that breaks the visible
   entries down by type, by person and by deal, a kebab per row, CSV export.

   The four types are the activities table's CHECK constraint set. The
   reference's fifth type (meeting) is not in it and is left out on purpose —
   the table is not changed. The reference's delete-undo re-inserts the row
   into its in-memory store; the API cannot restore a deleted row (new id,
   new timestamp, comments gone), so delete here confirms and has no undo.
   ─────────────────────────────────────────────────────────────────────────── */

// Toolbar/feed state for the Activities page: search, type, who logged it, deal, period.
let activitiesUI = { q: '', type: null, by: null, deal: null, period: 'all' };
let activityDeals = [];   // deals that have notes, captured from an unfiltered load — the Deal chip's options
let activityDealList = [];   // every deal of the workspace (GET /api/deals): the compose card's Deal picker, and stage + value for the rail
// Every contact of the workspace, BOTH types (GET /api/contacts, no filter): the compose card's Contact
// picker, the kebab's supplier label, the company in search. Not the shared `contacts` global — the
// Contacts/Suppliers page loads that filtered to whichever type was last shown.
let activityContactList = [];
let activitiesLoadSeq = 0;   // the Deal chip refetches; only the most recent request may write `activities`
// The compose card's draft lives here, not in the DOM, so re-rendering the card (a filter click, the
// reload after saving) never loses what was typed.
let activityCompose = { type: 'note', text: '', deal: '', contact: '', err: '' };
// Logout (auth.js resetClientState) clears the page's filters, the unsent compose draft and the
// cached deal / contact lists, so nothing of one workspace survives into the next login.
function resetActivitiesUI() {
  activitiesUI = { q: '', type: null, by: null, deal: null, period: 'all' };
  activityDeals = []; activityDealList = []; activityContactList = [];
  activityCompose = { type: 'note', text: '', deal: '', contact: '', err: '' };
}
const ACT_TYPES = ['note', 'call', 'email', 'whatsapp'];
const ACT_PERIODS = ['all', 'today', '7d', '30d'];

function actLocale() { return currentLang === 'de' ? 'de-DE' : 'en-GB'; }
function actStartOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function actDayDiff(a) { return Math.round((actStartOfDay(Date.now()) - actStartOfDay(a.created_at)) / 864e5); }
function actDayLabel(n, ts) { return n === 0 ? t('today') : n === 1 ? t('yesterday') : new Date(ts).toLocaleDateString(actLocale(), { weekday: 'long', day: 'numeric', month: 'long' }); }
function actAgo(ts) { const h = (Date.now() - new Date(ts).getTime()) / 36e5; return h < 1 ? t('ago_now') : h < 24 ? tf('ago_h', { n: Math.round(h) }) : h < 48 ? t('yesterday') : tf('ago_d', { n: Math.round(h / 24) }); }
function actTime(ts) { return new Date(ts).toLocaleTimeString(actLocale(), { hour: '2-digit', minute: '2-digit' }); }
function actPlural(n) { return n === 1 ? t('one_activity') : tf('n_activities', { n }); }
function actContactOf(a) { return a.contact_id ? activityContactList.find(c => c.id === a.contact_id) || null : null; }
// A detail opened from this page can log or delete entries. The reference re-renders on every store
// change; here the feed reloads when the pop-up closes (while the page is still the one shown).
function activityDetailOpts() { return { onClose: () => document.getElementById('page-activities')?.classList.contains('active') ? loadActivities() : undefined }; }
function openActivityDeal(id) { openDealDetail(id, activityDetailOpts()); }
function openActivityContact(id) { openContactDetail(id, activityDetailOpts()); }

async function loadActivities() {
  const seq = ++activitiesLoadSeq;
  await ensureMembers();
  const [dealList, contactList] = await Promise.all([api.get('/api/deals'), api.get('/api/contacts')]);
  if (seq !== activitiesLoadSeq) return;   // a newer load is under way; its answer is the one to show
  activityDealList = Array.isArray(dealList) ? dealList : [];
  activityContactList = Array.isArray(contactList) ? contactList : [];
  // The Deal filter is applied by the SERVER (?deal_id=): "bound to the deal, or a contact-level
  // note on its contact" is one SQL rule, not a second copy here. Type, person, period and search stay local.
  const rows = await api.get(activitiesUI.deal ? `/api/activities?deal_id=${activitiesUI.deal}` : '/api/activities');
  if (seq !== activitiesLoadSeq) return;
  activities = Array.isArray(rows) ? rows : [];
  if (!activitiesUI.deal) activityDeals = activityDealOptions();
  renderActivities();
}
// The Deal chip's options: the deals that actually have notes BOUND to them (bound_deal_id) — not
// deal_id, which for an unbound note is the derived fallback and would be an option matching nothing.
function activityDealOptions() {
  return [...new Map(activities.filter(a => a.bound_deal_id).map(a => [a.bound_deal_id, { id: a.bound_deal_id, title: a.deal_title || 'Deal' }])).values()];
}

// skip: 'type' | 'by' — ignore that one filter, so the rail can count the options the user did not pick.
function visibleActivities(skip) {
  const q = activitiesUI.q.trim().toLowerCase();
  return activities.filter(a => {
    if (skip !== 'type' && activitiesUI.type && a.type !== activitiesUI.type) return false;
    if (skip !== 'by' && activitiesUI.by != null && a.created_by !== activitiesUI.by) return false;
    if (activitiesUI.period && activitiesUI.period !== 'all') {
      const n = actDayDiff(a);
      if (activitiesUI.period === 'today' ? n !== 0 : activitiesUI.period === '7d' ? n > 6 : n > 29) return false;
    }
    // search the visible text (not stored <br>/entities), the type label, the contact and their company, the deal and the author
    if (q && !`${dvActText(a.content)} ${t('act_' + a.type)} ${a.contact_name || ''} ${actContactOf(a)?.company || ''} ${a.deal_title || ''} ${a.logged_by_name || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function activitiesAnyFilter() { return !!(activitiesUI.q.trim() || activitiesUI.type || activitiesUI.by != null || activitiesUI.deal != null || activitiesUI.period !== 'all'); }

function renderActivities() {
  const sub = document.getElementById('activities-page-sub');
  if (sub) {
    const weekMs = 7 * 86400000, week = activities.filter(a => Date.now() - new Date(a.created_at).getTime() < weekMs).length;
    sub.textContent = tf('activities_logged', { n: activities.length, m: week });
  }
  renderActivitiesToolbar();
  renderActivityCompose();
  renderActivitiesFeed();
}

/* ----- toolbar ----- */
function renderActivitiesToolbar() {
  const el = document.getElementById('activities-toolbar');
  if (!el) return;
  const active = document.activeElement && document.activeElement.id === 'activities-q';
  el.innerHTML = `<div class="input-group" style="width:260px">${icon('search')}<input class="input" id="activities-q" type="search" placeholder="${esc(t('search_activities'))}" value="${esc(activitiesUI.q)}" aria-label="${esc(t('search_activities'))}" oninput="onActivitiesSearch(this.value)"></div>
    ${activitiesChip('type')}${activitiesChip('by')}${activitiesChip('deal')}${activitiesChip('period')}
    ${activitiesAnyFilter() ? `<button class="btn btn-ghost btn-sm" type="button" onclick="clearActivitiesFilters()">${esc(t('clear_filters'))}</button>` : ''}`;
  if (active) { const q = document.getElementById('activities-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
function activitiesChip(key) {
  const v = activitiesUI[key], on = key === 'period' ? v !== 'all' : v != null && v !== '';
  const txt = !on ? '' : key === 'type' ? t('act_' + v) : key === 'deal' ? (activityDeals.find(d => d.id === v)?.title || '') : key === 'period' ? t('period_' + v) : (members.find(m => m.id === v)?.name || '');
  return `<button class="chip ${on ? 'on' : ''}" type="button" id="activities-chip-${key}" onclick="openActivitiesChip(this,'${key}')" aria-haspopup="menu">${esc(t('chip_' + (key === 'by' ? 'person' : key)))}${on ? ': ' + esc(txt) : ''}${icon('chevron-down', 'ic-sm')}</button>`;
}
function openActivitiesChip(anchor, key) {
  const opts = key === 'type' ? ACT_TYPES.map(v => ({ value: v, label: t('act_' + v), icon: v }))
    : key === 'deal' ? activityDeals.map(d => ({ value: d.id, label: d.title }))
    : key === 'period' ? ACT_PERIODS.map(p => ({ value: p, label: t('period_' + p) }))
    : members.map(m => ({ value: m.id, label: m.name }));
  const all = key === 'period' ? [] : [{ value: null, label: t('filter_all') }];   // "All time" is one of the periods, so no extra "All"
  ui.select(anchor, [...all, ...opts], activitiesUI[key], v => {
    activitiesUI[key] = v;
    if (key === 'deal') loadActivities(); else renderActivities();
    document.getElementById('activities-chip-' + key)?.focus();
  });
}
let activitiesSearchTimer = null;
function onActivitiesSearch(value) {
  activitiesUI.q = value;
  clearTimeout(activitiesSearchTimer);
  activitiesSearchTimer = setTimeout(() => { renderActivitiesToolbar(); renderActivitiesFeed(); }, 120);
}
function clearActivitiesFilters() { const refetch = activitiesUI.deal != null; activitiesUI = { q: '', type: null, by: null, deal: null, period: 'all' }; if (refetch) loadActivities(); else renderActivities(); }

/* ----- compose card ----- */
function renderActivityCompose() {
  const el = document.getElementById('activities-compose');
  if (!el) return;
  const C = activityCompose, L = actLocale();
  const deals = [...activityDealList].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), L));
  const people = [...activityContactList].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), L));
  // keep the caret where it was when the card is rebuilt under the user's hands
  const ae = document.activeElement, focusId = ae && ae.id && el.contains(ae) ? ae.id : null;
  const sel = focusId && typeof ae.selectionStart === 'number' ? [ae.selectionStart, ae.selectionEnd] : null;
  el.innerHTML = `<form class="card ac-compose" id="ac-form" novalidate aria-label="${esc(t('act_compose_aria'))}" onsubmit="submitActivityCompose(event)"><div class="card-body">
    <div class="seg" role="group" aria-label="${esc(t('lbl_type'))}" style="align-self:flex-start">${ACT_TYPES.map(x => `<button type="button" data-ctype="${x}" aria-pressed="${C.type === x}" onclick="setActivityComposeType('${x}')">${icon(x, 'ic-sm')}${esc(t('act_' + x))}</button>`).join('')}</div>
    <div class="field"><label class="sr-only" for="ac-text">${esc(t('lbl_content'))}</label><textarea class="textarea" id="ac-text" rows="2" placeholder="${esc(t('act_ph_' + C.type))}" ${C.err && !C.text.trim() ? 'aria-invalid="true"' : ''} oninput="onActivityComposeInput(this)" onkeydown="onActivityComposeKey(event)">${esc(C.text)}</textarea></div>
    <div class="ac-compose-row">
      <div class="field"><label class="label" for="ac-deal">${esc(t('lbl_deal'))}</label><select class="select" id="ac-deal" onchange="onActivityComposeDeal(this)"><option value="">${esc(t('opt_no_deal'))}</option>${deals.map(d => `<option value="${d.id}" ${String(d.id) === C.deal ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}</select></div>
      <div class="field"><label class="label" for="ac-contact">${esc(t('lbl_contact'))}</label><select class="select" id="ac-contact" onchange="onActivityComposeContact(this)"><option value="">${esc(t('opt_no_contact'))}</option>${people.map(c => `<option value="${c.id}" ${String(c.id) === C.contact ? 'selected' : ''}>${esc(c.name)}${c.company ? ', ' + esc(c.company) : ''}</option>`).join('')}</select></div>
      <button class="btn btn-primary" type="submit" id="ac-go">${esc(t('act_verb_' + C.type))}</button></div>
    <div class="error-text" id="ac-err" role="alert">${esc(C.err)}</div></div></form>`;
  if (focusId) { const n = document.getElementById(focusId); if (n) { n.focus(); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text control */ } } }
}
function setActivityComposeType(type) {
  activityCompose.type = type; activityCompose.err = '';
  renderActivityCompose();
  document.querySelector(`#ac-form [data-ctype="${type}"]`)?.focus();
}
function activityComposeClearError() {
  if (!activityCompose.err) return;
  activityCompose.err = '';
  document.getElementById('ac-text')?.removeAttribute('aria-invalid');
  const e = document.getElementById('ac-err'); if (e) e.textContent = '';
}
function onActivityComposeInput(el) { activityCompose.text = el.value; activityComposeClearError(); }
function onActivityComposeDeal(el) {
  // Choosing a deal links its contact as well (the reference overwrites, so the pair stays consistent).
  activityCompose.deal = el.value;
  const d = activityDealList.find(x => x.id === +el.value);
  if (d && d.contact_id) { activityCompose.contact = String(d.contact_id); const c = document.getElementById('ac-contact'); if (c) c.value = activityCompose.contact; }
  activityComposeClearError();
}
function onActivityComposeContact(el) { activityCompose.contact = el.value; activityComposeClearError(); }
function onActivityComposeKey(e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitActivityCompose(); } }
function focusActivityCompose() {
  const ta = document.getElementById('ac-text'); if (!ta) return;
  ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
  ta.focus({ preventScroll: true });
}
async function submitActivityCompose(e) {
  if (e) e.preventDefault();
  const C = activityCompose, text = C.text.trim(), type = C.type;
  C.err = !text ? t('act_err_text') : !C.deal && !C.contact ? t('act_err_link') : '';
  if (C.err) { renderActivityCompose(); document.getElementById(!text ? 'ac-text' : 'ac-deal')?.focus(); return; }
  const res = await api.post('/api/activities', {
    contact_id: C.contact || null,
    deal_id:    C.deal || null,
    type,
    content:    esc(text).replace(/\n/g, '<br>'),   // the same stored shape as the modal and the timeline editors
  });
  if (!res || res.error) { C.err = (res && res.error) || t('act_err_save'); renderActivityCompose(); return; }
  C.text = ''; C.err = '';
  await loadActivities();
  document.getElementById('ac-text')?.focus();
  ui.toast(tf('act_logged', { type: t('act_' + type) }), { action: { label: t('undo'), onClick: async () => { await api.del(`/api/activities/${res.id}`); loadActivities(); } } });
}

/* ----- feed ----- */
function renderActivitiesFeed() {
  const el = document.getElementById('activities-list');
  if (!el) return;
  const rows = visibleActivities(), total = activities.length;
  if (!rows.length) {
    el.innerHTML = `<div class="card"><div class="empty">${icon(total ? 'search' : 'activity')}<b>${esc(t(total ? 'no_activities_match' : 'no_activities'))}</b><div>${esc(t(total ? 'no_activities_match_sub' : 'no_activities_sub'))}</div>${total ? `<div style="margin-top:14px"><button class="btn btn-secondary btn-sm" type="button" onclick="clearActivitiesFilters()">${esc(t('clear_filters'))}</button></div>` : ''}</div></div>`;
    renderActivitiesRail();
    return;
  }
  const row = a => {
    const label = t('act_' + a.type);
    const full = new Date(a.created_at).toLocaleString(actLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="ac-row" data-aid="${a.id}"><span class="tl-ic ${a.type}" title="${esc(label)}">${icon(a.type)}</span>
      <div style="min-width:0"><div class="ac-head"><b>${esc(label)}</b>
        ${a.deal_id ? `<a href="#" class="ac-link" title="${esc(a.deal_title || '')}" onclick="event.preventDefault();openActivityDeal(${a.deal_id})">${icon('deals')}<span>${esc(a.deal_title || 'Deal')}</span></a>` : ''}
        ${a.contact_id ? `<a href="#" class="ac-link" title="${esc(actContactOf(a)?.company || '')}" onclick="event.preventDefault();openActivityContact(${a.contact_id})">${icon('users')}<span>${esc(a.contact_name || 'Contact')}</span></a>` : ''}
        <span class="ac-time" title="${esc(full)}">${esc(actAgo(a.created_at))}</span></div>
        <div class="tl-text ac-text">${dvActHtml(a.content)}</div>
        <div class="ac-meta">${a.logged_by_name ? avatar(a.logged_by_name, 'sm') + `<span>${esc(a.logged_by_name)}</span><span class="ac-dot"></span>` : ''}<span>${esc(actTime(a.created_at))}</span></div></div>
      <button class="iconbtn kebab" type="button" onclick="openActivityKebab(this,${a.id})" aria-label="Actions" aria-haspopup="menu">${icon('ellipsis')}</button></div>`;
  };
  // the server returns newest first; consecutive rows of the same calendar day form one group
  const groups = [];
  rows.forEach(a => { const n = actDayDiff(a), g = groups[groups.length - 1]; if (g && g.n === n) g.items.push(a); else groups.push({ n, ts: a.created_at, items: [a] }); });
  el.innerHTML = groups.map(g => `<section class="ac-group" aria-label="${esc(actDayLabel(g.n, g.ts))}"><div class="ac-day"><h2 class="section-title">${esc(actDayLabel(g.n, g.ts))}</h2><span class="muted">${esc(actPlural(g.items.length))}</span></div>
    <div class="card">${g.items.map(row).join('')}</div></section>`).join('');
  renderActivitiesRail();
}

/* ----- rail ----- */
function renderActivitiesRail() {
  const el = document.getElementById('activities-rail');
  if (!el) return;
  const vis = visibleActivities();
  const byType = ACT_TYPES.map(ty => ({ ty, n: visibleActivities('type').filter(a => a.type === ty).length })), maxT = Math.max(1, ...byType.map(x => x.n));
  const byPerson = members.map(m => ({ m, n: visibleActivities('by').filter(a => a.created_by === m.id).length })), maxP = Math.max(1, ...byPerson.map(x => x.n));
  const count = {}; vis.forEach(a => { if (a.deal_id) count[a.deal_id] = (count[a.deal_id] || 0) + 1; });
  const top = Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 4);
  const bar = (n, max) => `<span class="bar"><i style="width:${Math.round(n / max * 100)}%"></i></span>`;
  const dealRow = ([id, n]) => {
    const d = activityDealList.find(x => x.id === +id);
    const title = d ? d.title : (vis.find(a => a.deal_id === +id)?.deal_title || 'Deal');
    const sub = d ? [d.stage_name, d.value != null && d.value !== '' ? fmtEURShort(d.value) : ''].filter(Boolean).join(', ') : '';
    return `<a class="ac-deal-row" href="#" onclick="event.preventDefault();openActivityDeal(${+id})"><span class="grow"><span class="truncate" style="display:block;font-weight:600">${esc(title)}</span>${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</span><span class="n">${n}</span></a>`;
  };
  el.innerHTML = `<section class="card" aria-label="${esc(t('rail_by_type'))}"><div class="card-header"><h2 class="card-title">${esc(t('rail_by_type'))}</h2><span class="muted">${esc(actPlural(vis.length))}</span></div><div class="card-body">
      ${byType.map(({ ty, n }) => `<button class="ac-stat" type="button" data-stat-type="${ty}" aria-pressed="${activitiesUI.type === ty}" onclick="toggleActivitiesStat('type','${ty}')"><span class="tl-ic ${ty} ac-ic">${icon(ty)}</span><span><span class="nm">${esc(t('act_' + ty))}</span>${bar(n, maxT)}</span><span class="n">${n}</span></button>`).join('')}</div></section>
    <section class="card" aria-label="${esc(t('rail_by_person'))}"><div class="card-header"><h2 class="card-title">${esc(t('rail_by_person'))}</h2></div><div class="card-body">
      ${byPerson.map(({ m, n }) => `<button class="ac-stat" type="button" data-stat-by="${m.id}" aria-pressed="${activitiesUI.by === m.id}" onclick="toggleActivitiesStat('by',${m.id})">${avatar(m.name, 'sm')}<span><span class="nm">${esc(m.name)}</span>${bar(n, maxP)}</span><span class="n">${n}</span></button>`).join('')}</div></section>
    <section class="card" aria-label="${esc(t('rail_top_deals'))}"><div class="card-header"><h2 class="card-title">${esc(t('rail_top_deals'))}</h2></div><div class="card-body">
      ${top.length ? top.map(dealRow).join('') : `<div class="ac-rail-empty">${esc(t('rail_no_deals'))}</div>`}</div></section>`;
}
function toggleActivitiesStat(key, value) { activitiesUI[key] = activitiesUI[key] === value ? null : value; renderActivities(); }

/* ----- row actions, export ----- */
function openActivityKebab(anchor, id) {
  const a = activities.find(x => x.id === id); if (!a) return;
  const items = [];
  if (a.deal_id) items.push({ label: t('open_deal'), icon: 'deals', onSelect: () => openActivityDeal(a.deal_id) });
  if (a.contact_id) {
    // "Open supplier" (the workspace's own word, singular) for a supplier contact — the reference's linkBase rule
    const word = (currentWorkspace?.supplier_name || 'Suppliers').replace(/s$/i, '');
    const label = actContactOf(a)?.contact_type === 'supplier' ? tf('open_supplier', { name: currentLang === 'de' ? word : word.toLowerCase() }) : t('open_contact');
    items.push({ label, icon: 'users', onSelect: () => openActivityContact(a.contact_id) });
  }
  if (items.length) items.push({ sep: true });
  items.push({ label: t('delete_activity'), icon: 'trash', danger: true, onSelect: () => deleteActivity(id) });
  ui.menu(anchor, items, { align: 'right' });
}
async function deleteActivity(id) {
  const ok = await ui.confirm({ title: t('delete_activity_q'), message: t('delete_activity_msg'), confirmLabel: t('btn_delete'), danger: true });
  if (!ok) return;
  const res = await api.del(`/api/activities/${id}`);
  if (res?.error) return ui.toast(res.error);
  activities = activities.filter(a => a.id !== id);
  if (!activitiesUI.deal) activityDeals = activityDealOptions();   // the chip must not offer a deal that no longer has a note
  renderActivities();
  ui.toast(t('activity_deleted'));
}

function exportActivitiesCsv() {
  const rows = visibleActivities();
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Type', 'Person', 'Deal', 'Contact', 'Date', 'Text'];
  const lines = rows.map(a => [t('act_' + a.type), a.logged_by_name || '', a.deal_title || '', a.contact_name || '', a.created_at ? new Date(a.created_at).toISOString() : '', dvActText(a.content)].map(q).join(','));
  const csv = [head.map(q).join(','), ...lines].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = `activities-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  ui.toast(tf('export_activities_csv', { n: rows.length }));
}
