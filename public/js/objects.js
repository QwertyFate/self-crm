// ── OBJECTS ───────────────────────────────────────────────
function updateObjectsNav() {
  const name  = currentWorkspace?.object_name || 'Listings';
  const label = document.getElementById('nav-objects-label');
  const title = document.getElementById('objects-page-title');
  const btn   = document.getElementById('add-object-btn');
  const tab   = document.getElementById('settings-tab-objects');
  if (label) label.textContent = name;
  if (title) title.textContent = name;
  if (btn)   btn.textContent   = `+ Add ${name.replace(/s$/i, '')}`;
  if (tab)   tab.textContent   = name;
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
  objectFields  = await api.get('/api/object-fields');
  objectColumns = currentWorkspace?.object_columns || [];
  objects       = await api.get('/api/objects');
  objCurrentPage = 1;
  setObjectView(objectViewMode, false);
  renderObjectsCurrent();
}

function setObjectView(mode, save = true) {
  objectViewMode = mode;
  if (save) localStorage.setItem('objectViewMode', mode);
  document.getElementById('obj-view-table')?.classList.toggle('active', mode === 'table');
  document.getElementById('obj-view-card')?.classList.toggle('active', mode === 'card');
  document.getElementById('objects-table-wrap')?.classList.toggle('hidden', mode === 'card');
  document.getElementById('objects-card-grid')?.classList.toggle('hidden', mode === 'table');
  if (objects.length) renderObjectsCurrent();
}

function filterObjects() {
  const q = document.getElementById('object-search').value.toLowerCase();
  const filtered = objects.filter(o => o.name.toLowerCase().includes(q));
  if (objectViewMode === 'card') renderObjectsCards(filtered); else renderObjectsTable(filtered);
}

function renderObjectsCurrent() {
  const q = document.getElementById('object-search')?.value.toLowerCase() || '';
  const filtered = q ? objects.filter(o => o.name.toLowerCase().includes(q)) : objects;
  if (objectViewMode === 'card') renderObjectsCards(filtered); else renderObjectsTable(filtered);
}

function renderObjectsCards(list) {
  const visCols = effectiveObjectColumns().filter(c => c.visible);
  const grid = document.getElementById('objects-card-grid'), pag = document.getElementById('objects-pagination');
  if (!grid) return;
  const total = list.length, totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (objCurrentPage > totalPages) objCurrentPage = totalPages;
  const page = list.slice((objCurrentPage - 1) * PAGE_SIZE, objCurrentPage * PAGE_SIZE);

  grid.innerHTML = page.map(o => {
    const fieldRows = visCols.map(col => {
      const val = col.key === 'created_at'
        ? (fmtDate(o.created_at) || '—')
        : (o.custom_data?.[col.key] ? esc(o.custom_data[col.key]) : '<span style="color:var(--muted)">—</span>');
      return `<div class="obj-card-field"><label>${esc(col.label())}</label><span>${val}</span></div>`;
    }).join('');
    return `<div class="obj-card" onclick="openObjectDetail(${o.id})">
      <div class="obj-card-header">
        <div class="obj-card-name">${esc(o.name)}</div>
        <div class="obj-card-actions">
          <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openObjectModal(${o.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteObject(${o.id})">Delete</button>
        </div>
      </div>
      ${fieldRows ? `<div class="obj-card-fields">${fieldRows}</div>` : ''}
    </div>`;
  }).join('') || '<p style="color:var(--muted);padding:20px 0">No items found.</p>';

  if (pag && totalPages > 1) {
    const s = (objCurrentPage-1)*PAGE_SIZE+1, e = Math.min(objCurrentPage*PAGE_SIZE, total);
    const pages = buildPageNumbers(objCurrentPage, totalPages);
    pag.innerHTML = `<span class="pagination-info">Showing ${s}–${e} of ${total}</span>
      <div class="pagination-controls">
        <button class="page-btn" onclick="objGoToPage(${objCurrentPage-1})" ${objCurrentPage===1?'disabled':''}>‹</button>
        ${pages.map(p => p==='…'?'<span class="page-ellipsis">…</span>':`<button class="page-btn${p===objCurrentPage?' active':''}" onclick="objGoToPage(${p})">${p}</button>`).join('')}
        <button class="page-btn" onclick="objGoToPage(${objCurrentPage+1})" ${objCurrentPage===totalPages?'disabled':''}>›</button>
      </div>`;
  } else if (pag) { pag.innerHTML = ''; }
}

function renderObjectsTable(list) {
  const visCols = effectiveObjectColumns().filter(c => c.visible);
  document.getElementById('objects-thead').innerHTML = `<tr><th>Name</th>${visCols.map(c => `<th>${c.label()}</th>`).join('')}<th></th></tr>`;
  const total = list.length, totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (objCurrentPage > totalPages) objCurrentPage = totalPages;
  const page = list.slice((objCurrentPage - 1) * PAGE_SIZE, objCurrentPage * PAGE_SIZE);
  const dash = '<span class="muted-dash">—</span>';

  document.getElementById('objects-tbody').innerHTML = page.map(o => {
    const cells = visCols.map(col => {
      if (col.key === 'created_at') return `<td>${fmtDate(o.created_at)}</td>`;
      const v = o.custom_data?.[col.key] ?? '';
      return `<td class="editable-cell" onclick="startObjectInlineEdit(this,${o.id},'${col.key}','${col.type||'text'}')">${esc(v)||dash}</td>`;
    }).join('');
    return `<tr>
      <td><strong class="contact-name-link" onclick="openObjectDetail(${o.id})">${esc(o.name)}</strong></td>
      ${cells}
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-ghost" onclick="openObjectModal(${o.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteObject(${o.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');

  const pagEl = document.getElementById('objects-pagination');
  if (pagEl && totalPages > 1) {
    const s = (objCurrentPage-1)*PAGE_SIZE+1, e = Math.min(objCurrentPage*PAGE_SIZE, total);
    const pages = buildPageNumbers(objCurrentPage, totalPages);
    pagEl.innerHTML = `<span class="pagination-info">Showing ${s}–${e} of ${total}</span>
      <div class="pagination-controls">
        <button class="page-btn" onclick="objGoToPage(${objCurrentPage-1})" ${objCurrentPage===1?'disabled':''}>‹</button>
        ${pages.map(p => p==='…'?'<span class="page-ellipsis">…</span>':`<button class="page-btn${p===objCurrentPage?' active':''}" onclick="objGoToPage(${p})">${p}</button>`).join('')}
        <button class="page-btn" onclick="objGoToPage(${objCurrentPage+1})" ${objCurrentPage===totalPages?'disabled':''}>›</button>
      </div>`;
  } else if (pagEl) { pagEl.innerHTML = ''; }
}

function objGoToPage(p) { objCurrentPage = p; filterObjects(); }

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
    filterObjects();
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
  document.getElementById('obj-custom-fields').innerHTML = objectFields.map(f =>
    `<div class="form-group"><label>${esc(f.name)}</label>${renderDealFieldInput(f,'')}</div>`
  ).join('');
  if (id) {
    const obj = objects.find(o => o.id === id) || await api.get(`/api/objects/${id}`);
    document.getElementById('obj-name').value = obj.name;
    objectFields.forEach(f => { const el = document.getElementById(`dfield-${f.field_key}`); if (el) el.value = obj.custom_data?.[f.field_key] ?? ''; });
  }
  document.getElementById('object-modal').classList.remove('hidden');
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
  if (!confirm('Delete this item?')) return;
  await api.del(`/api/objects/${id}`);
  objects = objects.filter(o => o.id !== id); filterObjects();
}

async function openObjectDetail(id) {
  const obj = await api.get(`/api/objects/${id}`);
  if (!objectFields.length) objectFields = await api.get('/api/object-fields');
  if (!deals.length) deals = await api.get('/api/deals');

  document.getElementById('object-detail-title').textContent = obj.name;

  const fieldHtml = objectFields.map(f => {
    const v = obj.custom_data?.[f.field_key];
    return v ? `<div class="detail-item"><label>${esc(f.name)}</label><span>${esc(v)}</span></div>` : '';
  }).join('');

  const linkedDealIds = new Set((obj.deals || []).map(d => d.id));

  const dealRows = (obj.deals || []).map(d => `
    <div class="contact-deal-row" style="cursor:pointer" onclick="navigateToDeal(${d.id})">
      <div class="contact-deal-title">${esc(d.title)}</div>
      <div class="contact-deal-meta">
        ${d.stage_name ? `<span class="contact-deal-stage" style="border-color:${d.stage_color||'var(--border)'}">${esc(d.stage_name)}</span>` : ''}
        ${d.pipeline_name ? `<span style="font-size:11px;color:var(--muted)">${esc(d.pipeline_name)}</span>` : ''}
        ${d.value != null ? `<span class="contact-deal-value">€ ${Number(d.value).toLocaleString()}</span>` : ''}
      </div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:12px;padding:4px 0">No deals linked.</p>';

  document.getElementById('object-detail-body').innerHTML = `
    <div class="detail-section"><div class="detail-grid">${fieldHtml}</div></div>
    <div class="detail-section">
      <div class="detail-section-header"><h3>Deals</h3></div>
      <div class="contact-deals-list" id="obj-detail-deal-rows">${dealRows}</div>
      <div class="object-panel-add" style="margin-top:10px;align-items:flex-start">
        <div class="deal-search-wrap">
          <input type="text" id="obj-deal-search" placeholder="Search deals by name or contact…"
            autocomplete="off" oninput="filterDealSearch(${id})" onfocus="filterDealSearch(${id})" />
          <div class="deal-search-dropdown hidden" id="obj-deal-dropdown"></div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="linkDealToObject(${id})" style="flex-shrink:0">Link</button>
      </div>
    </div>
    <div class="detail-actions">
      <button class="btn btn-danger btn-sm" onclick="deleteObject(${id});closeModal('object-detail-modal')">Delete</button>
      <button class="btn btn-sm" onclick="closeModal('object-detail-modal');openObjectModal(${id})">Edit</button>
    </div>`;

  const input = document.getElementById('obj-deal-search');
  input._availableDeals = deals.filter(d => !linkedDealIds.has(d.id));
  input._selectedDealId = null;

  document.addEventListener('mousedown', function closeDD(e) {
    if (!e.target.closest('#obj-deal-search') && !e.target.closest('#obj-deal-dropdown')) {
      document.getElementById('obj-deal-dropdown')?.classList.add('hidden');
      document.removeEventListener('mousedown', closeDD);
    }
  });

  document.getElementById('object-detail-modal').classList.remove('hidden');
}

function filterDealSearch(objectId) {
  const input = document.getElementById('obj-deal-search'), dropdown = document.getElementById('obj-deal-dropdown');
  if (!input || !dropdown) return;
  const q = input.value.toLowerCase().trim(), available = input._availableDeals || [];
  const results = q
    ? available.filter(d => d.title.toLowerCase().includes(q) || (d.contact_name || '').toLowerCase().includes(q)).slice(0, 8)
    : available.slice(0, 5);
  if (!results.length) {
    dropdown.innerHTML = `<div class="deal-search-item dsi-empty">${q ? 'No matching deals' : 'No deals available to link'}</div>`;
    dropdown.classList.remove('hidden'); return;
  }
  dropdown.innerHTML = results.map(d => `
    <div class="deal-search-item" data-id="${d.id}" onclick="selectDealSearchItem(${d.id}, ${objectId})">
      <div class="dsi-title">${esc(d.title)}</div>
      <div class="dsi-meta">${d.contact_name ? esc(d.contact_name) + (d.stage_name ? ' · ' : '') : ''}${d.stage_name ? esc(d.stage_name) : ''}</div>
    </div>`).join('');
  dropdown.classList.remove('hidden');
}

function selectDealSearchItem(dealId, objectId) {
  const input = document.getElementById('obj-deal-search'), dropdown = document.getElementById('obj-deal-dropdown');
  const deal = (input?._availableDeals || []).find(d => d.id === dealId);
  if (!deal || !input) return;
  input.value = deal.title + (deal.contact_name ? ` — ${deal.contact_name}` : '');
  input._selectedDealId = dealId; dropdown?.classList.add('hidden');
}

async function linkDealToObject(objectId) {
  const input = document.getElementById('obj-deal-search'), dealId = input?._selectedDealId;
  if (!dealId) return;
  await api.post(`/api/objects/${objectId}/deals`, { deal_id: dealId });
  objects = await api.get('/api/objects'); deals = await api.get('/api/deals');
  await openObjectDetail(objectId);
}

async function navigateToDeal(dealId) {
  closeModal('object-detail-modal'); switchPage('deals'); await openDealModal(dealId);
}

// ── Object field settings ──────────────────────────────────
function renderObjectFieldsList() {
  const el = document.getElementById('object-fields-list'); if (!el) return;
  if (!objectFields.length) { el.innerHTML = '<li style="color:var(--muted);font-size:13px;padding:6px 10px">No fields yet.</li>'; return; }
  el.innerHTML = objectFields.map(f => `
    <li class="settings-row">
      <span class="row-label">${esc(f.name)}</span><span class="row-sub">${f.type}</span>
      <div class="row-actions">
        <button class="btn btn-sm btn-ghost btn-icon" onclick="openObjectFieldModal(${f.id})">✏️</button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteObjectField(${f.id})">✕</button>
      </div>
    </li>`).join('');
}

function openObjectFieldModal(id) {
  document.getElementById('object-field-form').reset();
  document.getElementById('objf-id').value = id || '';
  document.getElementById('objf-options-group').classList.add('hidden');
  document.getElementById('object-field-modal-title').textContent = id ? 'Edit Field' : 'Add Field';
  if (id) {
    const f = objectFields.find(f => f.id === id);
    document.getElementById('objf-name').value = f.name;
    document.getElementById('objf-key').value  = f.field_key;
    document.getElementById('objf-type').value = f.type;
    document.getElementById('objf-options').value = (f.options||[]).join('\n');
    if (f.type === 'dropdown') document.getElementById('objf-options-group').classList.remove('hidden');
  }
  document.getElementById('object-field-modal').classList.remove('hidden');
}
function autoObjectFieldKey() {
  if (document.getElementById('objf-id').value) return;
  document.getElementById('objf-key').value = document.getElementById('objf-name').value
    .toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
function toggleObjectFieldOptions() {
  document.getElementById('objf-options-group').classList.toggle('hidden', document.getElementById('objf-type').value !== 'dropdown');
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
  closeModal('object-field-modal'); objectFields = await api.get('/api/object-fields'); renderObjectFieldsList();
}
async function deleteObjectField(id) {
  if (!confirm('Delete this field?')) return;
  await api.del(`/api/object-fields/${id}`); objectFields = objectFields.filter(f => f.id !== id); renderObjectFieldsList();
}

// ── Object column settings ────────────────────────────────
function renderObjectColumnSettings() {
  const el = document.getElementById('object-columns-list'); if (!el) return;
  const cols = effectiveObjectColumns();
  el.innerHTML = cols.map((col, i) => `
    <li class="settings-row col-cfg-row" draggable="true"
      ondragstart="objColDragStart(event,${i})" ondragover="colDragOver(event)" ondrop="objColDrop(event,${i})" ondragleave="colDragLeave(event)">
      <span class="drag-handle">⠿</span>
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
  if(msgEl){msgEl.textContent='✓ Saved';msgEl.className='workspace-name-msg success';msgEl.classList.remove('hidden');}
  setTimeout(()=>msgEl?.classList.add('hidden'),2500); filterObjects();
}
async function saveObjectTypeName(){
  const input=document.getElementById('object-name-input'), msgEl=document.getElementById('object-name-msg');
  const name=input?.value.trim(); if(!name) return;
  const res=await api.patch('/api/workspace/object-name',{name});
  if(res.error){if(msgEl){msgEl.textContent=res.error;msgEl.className='workspace-name-msg error';msgEl.classList.remove('hidden');}return;}
  currentWorkspace.object_name=res.name; updateObjectsNav();
  if(msgEl){msgEl.textContent='✓ Saved';msgEl.className='workspace-name-msg success';msgEl.classList.remove('hidden');}
  setTimeout(()=>msgEl?.classList.add('hidden'),2500);
}

// ── Miro Board ────────────────────────────────────────────
function updateBoardNavVisibility() {
  document.getElementById('nav-board-link')?.classList.toggle('hidden', !currentWorkspace?.miro_url);
}
function getMiroBoardUrl(embedUrl) { return embedUrl?.replace('/live-embed/', '/board/') || null; }
function reloadMiroIframe() { const f = document.getElementById('miro-iframe'); if (f) { const s = f.src; f.src = ''; f.src = s; } }
function loadBoard() {
  const el = document.getElementById('board-content'), url = currentWorkspace?.miro_url;
  if (!el) return;
  if (!url) { el.innerHTML = `<div class="board-empty"><p>No Miro board linked yet.</p><p>Go to <strong>Settings → General → Miro Board</strong> and paste your embed URL.</p></div>`; return; }
  const boardUrl = getMiroBoardUrl(url);
  el.innerHTML = `
    <div class="board-topbar">
      <span class="board-topbar-hint">⚠️ Seeing a login page or 403? Google blocks login inside iframes. Open Miro in a new tab, log in, then click Reload.</span>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn btn-sm" onclick="reloadMiroIframe()">🔄 Reload</button>
        <a class="btn btn-sm btn-primary" href="${esc(boardUrl)}" target="_blank" rel="noopener">Open in Miro ↗</a>
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
  if (msgEl) { msgEl.textContent = '✓ Saved'; msgEl.className = 'workspace-name-msg success'; msgEl.classList.remove('hidden'); }
  setTimeout(() => msgEl?.classList.add('hidden'), 2500);
}

// ── Activities ────────────────────────────────────────────
async function loadActivities() {
  activities = await api.get('/api/activities');
  const el = document.getElementById('activities-list');
  if (!activities.length) { el.innerHTML = `<p style="color:var(--muted);padding:8px">${t('no_activities')}</p>`; return; }
  el.innerHTML = activities.map(a => `
    <div class="activity-item">
      <div class="act-icon ${a.type}">${ICONS[a.type]}</div>
      <div class="act-body">
        <div class="act-meta"><strong>${t('act_' + a.type)}</strong>${a.contact_name ? ` · ${esc(a.contact_name)}` : ''} · ${fmtDate(a.created_at)}</div>
        ${a.logged_by_name ? `<div class="act-logged-by">${t('logged_by')} ${esc(a.logged_by_name)} · <span class="act-logged-email">${esc(a.logged_by_email||'')}</span></div>` : ''}
        <div class="act-content">${esc(a.content)}</div>
      </div>
      <button class="btn btn-sm btn-danger btn-icon" onclick="deleteActivity(${a.id})">✕</button>
    </div>`).join('');
}

async function deleteActivity(id) { await api.del(`/api/activities/${id}`); loadActivities(); }
