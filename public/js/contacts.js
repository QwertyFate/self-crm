// ── CONTACTS ──────────────────────────────────────────────
let selectedContactIds = new Set();
let selectionModeOn = false;
let contactViewMode = 'kanban';
let filteredContacts = [];

async function loadContacts() {
  selectedContactIds.clear();
  await Promise.all([ensureStages(), ensureFields(), ensureMembers()]);
  contacts = await api.get(`/api/contacts?contact_type=${currentContactType}`);
  currentPage = 1;
  updateContactsPageHeader();
  renderFilterChips();
  setContactViewMode(contactViewMode);
}

function updateContactsPageHeader() {
  const isSupplier = currentContactType === 'supplier';
  const name = isSupplier ? (currentWorkspace?.supplier_name || 'Suppliers') : 'Contacts';
  const singular = name.replace(/s$/i, '');
  const h1  = document.querySelector('#page-contacts .page-header h1');
  const btn  = document.querySelector('#page-contacts .page-header .btn-primary');
  const search = document.getElementById('contact-search');
  if (h1)  h1.textContent = name;
  if (btn) btn.textContent = `+ Add ${singular}`;
  if (search) search.placeholder = `Search ${name.toLowerCase()}…`;
}

// ── Column widths ─────────────────────────────────────────
function loadColWidths() { colWidths = { ...(currentUser?.column_widths || {}) }; }
function saveColWidths() {
  if (currentUser) currentUser.column_widths = { ...colWidths };
  api.patch('/api/auth/preferences', { column_widths: colWidths });
}

function startColResize(e, colKey, colEl) {
  e.preventDefault(); e.stopPropagation();
  resizingCol = { colKey, colEl, startX: e.clientX, startW: colWidths[colKey] || parseInt(colEl.style.width) || 100 };
  document.addEventListener('mousemove', onColResize);
  document.addEventListener('mouseup', stopColResize);
  document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
}
function onColResize(e) {
  if (!resizingCol) return;
  const newW = Math.max(50, resizingCol.startW + (e.clientX - resizingCol.startX));
  resizingCol.colEl.style.width = newW + 'px'; colWidths[resizingCol.colKey] = Math.round(newW);
}
function stopColResize() {
  if (!resizingCol) return;
  document.removeEventListener('mousemove', onColResize); document.removeEventListener('mouseup', stopColResize);
  document.body.style.cursor = ''; document.body.style.userSelect = '';
  saveColWidths(); resizingCol = null;
}

function effectiveContactColumns() {
  const BUILTIN = [
    { key: 'company',     label: () => t('col_company'),    type: 'text',     show: true  },
    { key: 'email',       label: () => t('col_email'),      type: 'email',    show: true  },
    { key: 'phone',       label: () => t('col_phone'),      type: 'phone',    show: true  },
    { key: 'stage_id',    label: () => t('col_stage'),      type: 'stage',    show: false },
    { key: 'assigned_to', label: () => t('col_assignee'),   type: 'assignee', show: true  },
    { key: 'created_at',  label: () => t('col_created_at'), type: 'date',     show: false },
  ];
  const ALL = [
    ...BUILTIN,
    ...fields.map(f => ({ key: f.field_key, label: () => f.name, type: f.type, show: true })),
  ];
  if (!contactColumns.length) return ALL.map(c => ({ ...c, visible: c.show }));
  const savedMap = Object.fromEntries(contactColumns.map(c => [c.key, c.visible]));
  const ordered  = contactColumns
    .map(({ key }) => { const def = ALL.find(c => c.key === key); return def ? { ...def, visible: savedMap[key] } : null; })
    .filter(Boolean);
  ALL.filter(c => !(c.key in savedMap)).forEach(c => ordered.push({ ...c, visible: c.show }));
  return ordered;
}

// ── Sort ──────────────────────────────────────────────────
function toggleSort(key) {
  if (sortKey === key) { if (sortDir === 'asc') { sortDir = 'desc'; } else { sortKey = null; sortDir = 'asc'; } }
  else { sortKey = key; sortDir = 'asc'; }
  currentPage = 1; filterContacts();
}

function getSortValue(c, key) {
  if (key === '_name')       return (c.name || '').toLowerCase();
  if (key === 'company')     return (c.company || '').toLowerCase();
  if (key === 'email')       return (c.email || '').toLowerCase();
  if (key === 'phone')       return (c.phone || '').toLowerCase();
  if (key === 'stage_id')    return (c.stage_name || '').toLowerCase();
  if (key === 'assigned_to') return (c.assigned_to_name || '').toLowerCase();
  if (key === 'created_at')  return c.created_at ? new Date(c.created_at).getTime() : 0;
  const f = fields.find(f => f.field_key === key);
  const v = c.custom_data?.[key];
  if (f?.type === 'number') return parseFloat(v) || 0;
  if (f?.type === 'date')   return v ? new Date(v).getTime() : 0;
  return (v || '').toString().toLowerCase();
}

function sortContacts(list) {
  if (!sortKey) return list;
  return [...list].sort((a, b) => {
    const va = getSortValue(a, sortKey), vb = getSortValue(b, sortKey);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; if (vb == null) return -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });
}

function renderContactsTable(list) {
  const table = document.getElementById('contacts-table');
  if (!table) return;
  const visibleCols = effectiveContactColumns().filter(c => c.visible);
  const colKeys     = ['_name', ...visibleCols.map(c => c.key)];

  const existingCg = table.querySelector('colgroup');
  if (existingCg) table.removeChild(existingCg);
  table.style.tableLayout = '';

  const sorted = sortContacts(list);

  document.getElementById('contacts-thead').innerHTML = `<tr>
    ${selectionModeOn ? `<th style="width:40px;text-align:center"><input type="checkbox" id="select-all-checkbox" onchange="toggleSelectAll(this.checked)" /></th>` : ''}
    ${colKeys.map(k => {
      const col   = visibleCols.find(c => c.key === k);
      const label = k === '_name' ? t('col_name') : col?.label() || '';
      const isActive = sortKey === k;
      const icon = isActive
        ? `<span class="sort-icon active">${sortDir === 'asc' ? '↑' : '↓'}</span>`
        : `<span class="sort-icon">⇅</span>`;
      return `<th data-col-key="${k}" class="sortable-col${isActive ? ' sort-active' : ''}" onclick="toggleSort('${k}')">${label}${icon}</th>`;
    }).join('')}
  </tr>`;

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageList = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  document.getElementById('contacts-body').innerHTML = pageList.map(c => {
    const dash  = '<span class="muted-dash">—</span>';
    const cells = visibleCols.map(col => {
      if (col.key === 'company')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'company','text')" title="${esc(c.company||'')}">${esc(c.company||'')||dash}</td>`;
      if (col.key === 'email')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'email','email')" title="${esc(c.email||'')}">${esc(c.email||'')||dash}</td>`;
      if (col.key === 'phone')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'phone','phone')" title="${esc(c.phone||'')}">${esc(c.phone||'')||dash}</td>`;
      if (col.key === 'stage_id') {
        const stage = stages.find(s => s.id === c.stage_id);
        const badge = stage ? `<span class="stage-badge"><span class="stage-badge-dot" style="background:${stage.color}"></span>${esc(stage.name)}</span>` : dash;
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'stage_id','stage')">${badge}</td>`;
      }
      if (col.key === 'assigned_to')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'assigned_to','assignee')" title="${esc(c.assigned_to_name||'')}">${esc(c.assigned_to_name||'')||dash}</td>`;
      if (col.key === 'created_at')
        return `<td title="${esc(String(c.created_at||''))}">${fmtDate(c.created_at)||dash}</td>`;
      const v = c.custom_data?.[col.key] ?? '';
      return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'${col.key}','${col.type}')" title="${esc(v)}">${esc(v)||dash}</td>`;
    }).join('');

    const waHref = waLink(c.phone, c);
    return `<tr>
      ${selectionModeOn ? `<td style="text-align:center"><input type="checkbox" class="contact-checkbox" data-contact-id="${c.id}" onchange="toggleContactSelection(${c.id}, this.checked)" /></td>` : ''}
      <td class="name-cell" title="${esc(c.name)}">
        ${waHref ? `<a class="btn-wa-inline" href="${waHref}" target="_blank" rel="noopener" title="WhatsApp ${esc(c.name)}">${WA_SVG}</a>` : ''}
        <strong class="contact-name-link" onclick="openDetail(${c.id})">${esc(c.name)}</strong>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  renderPagination(sorted.length);

  // Measure + apply column widths
  let measured = false;
  document.querySelectorAll('#contacts-thead th').forEach(th => {
    const key = th.dataset.colKey;
    if (key && !colWidths[key]) { colWidths[key] = Math.max(60, Math.round(th.getBoundingClientRect().width)); measured = true; }
  });
  if (measured) saveColWidths();

  const cg = document.createElement('colgroup');
  if (selectionModeOn) {
    const col = document.createElement('col');
    col.style.width = '40px';
    cg.appendChild(col);
  }
  colKeys.forEach(key => { const col = document.createElement('col'); col.style.width = (colWidths[key] || 100) + 'px'; cg.appendChild(col); });
  table.insertBefore(cg, table.firstChild);
  table.style.tableLayout = 'fixed';

  const ths = document.querySelectorAll('#contacts-thead th');
  const cols = cg.children;
  ths.forEach((th, i) => {
    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    const colEl = cols[i];
    handle.addEventListener('mousedown', e => { e.stopPropagation(); startColResize(e, colKeys[i], colEl); });
    handle.addEventListener('click', e => e.stopPropagation());
    th.appendChild(handle);
  });
}

// ── Inline edit ───────────────────────────────────────────
function startInlineEdit(td, contactId, fieldKey, fieldType) {
  if (td.querySelector('input,select')) return;
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;
  const originalHTML = td.innerHTML;
  const isSelect = fieldType === 'stage' || fieldType === 'assignee' || fieldType === 'dropdown';
  let el;

  if (isSelect) {
    el = document.createElement('select');
    el.className = 'inline-select';
    if (fieldType === 'stage') {
      el.innerHTML = `<option value="">${t('opt_no_stage')}</option>` +
        stages.map(s => `<option value="${s.id}"${contact.stage_id === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    } else if (fieldType === 'assignee') {
      el.innerHTML = `<option value="">${t('opt_unassigned')}</option>` +
        members.map(m => `<option value="${m.id}"${contact.assigned_to === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
    } else {
      const fDef = fields.find(f => f.field_key === fieldKey);
      const opts = Array.isArray(fDef?.options) ? fDef.options : [];
      const cur = contact.custom_data?.[fieldKey] ?? '';
      el.innerHTML = '<option value="">—</option>' +
        opts.map(o => `<option value="${esc(o)}"${cur === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
    }
    el.onchange = async () => {
      const raw = el.value;
      const val = (fieldType === 'stage' || fieldType === 'assignee') ? (raw ? parseInt(raw) : null) : (raw || null);
      td.innerHTML = originalHTML; await commitInlineEdit(contactId, fieldKey, fieldType, val);
    };
    el.onkeydown = e => { if (e.key === 'Escape') td.innerHTML = originalHTML; };
    el.onblur = () => { if (td.contains(el)) td.innerHTML = originalHTML; };
  } else {
    el = document.createElement('input');
    el.className = 'inline-input';
    el.type = { email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' }[fieldType] || 'text';
    const builtinKeys = ['company', 'email', 'phone'];
    el.value = builtinKeys.includes(fieldKey) ? (contact[fieldKey] || '') : (contact.custom_data?.[fieldKey] ?? '');
    const origVal = el.value;
    el.onblur = async () => {
      const val = el.value.trim(); td.innerHTML = originalHTML;
      if (val !== origVal) await commitInlineEdit(contactId, fieldKey, fieldType, val || null);
    };
    el.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.onblur = null; td.innerHTML = originalHTML; }
    };
  }

  td.innerHTML = ''; td.appendChild(el); el.focus();
  if (el.select && fieldType !== 'date') el.select();
}

async function commitInlineEdit(contactId, fieldKey, fieldType, value) {
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;
  if (fieldType === 'stage') {
    contact.stage_id = value; const s = stages.find(s => s.id === value);
    contact.stage_name = s?.name || null; contact.stage_color = s?.color || null;
  } else if (fieldType === 'assignee') {
    contact.assigned_to = value; const m = members.find(m => m.id === value);
    contact.assigned_to_name = m?.name || null;
  } else if (['company','email','phone'].includes(fieldKey)) {
    contact[fieldKey] = value;
  } else {
    contact.custom_data = { ...(contact.custom_data || {}), [fieldKey]: value };
  }
  await api.put(`/api/contacts/${contactId}`, {
    name: contact.name, company: contact.company, email: contact.email,
    phone: contact.phone, stage_id: contact.stage_id, assigned_to: contact.assigned_to,
    custom_data: contact.custom_data || {}
  });
  filterContacts();
  if (document.getElementById('page-deals').classList.contains('active')) renderDealsBoard();
}

function onContactSearch() { currentPage = 1; filterContacts(); }

function filterContacts() {
  selectedContactIds.clear();
  const selectAllCb = document.getElementById('select-all-checkbox');
  if (selectAllCb) selectAllCb.checked = false;
  updateBulkDeleteButton();

  const q = document.getElementById('contact-search').value.toLowerCase();
  let filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.company||'').toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q)
  );
  for (const [key, values] of Object.entries(activeFilters)) {
    if (!values?.length) continue;

    // Handle keyword filters
    if (key.startsWith('keyword:')) {
      const col = key.substring(8);
      filtered = filtered.filter(c => {
        let fieldValue;
        if (col.startsWith('custom:')) {
          fieldValue = c.custom_data?.[col.substring(7)];
        } else {
          fieldValue = c[col];
        }
        const strValue = String(fieldValue || '').toLowerCase();
        return values.some(keyword => strValue.includes(keyword.toLowerCase()));
      });
    } else {
      // Handle regular filters (dropdown/select)
      filtered = filtered.filter(c => {
        const cv = key === 'stage_id'    ? (c.stage_id    == null ? '' : String(c.stage_id))
                 : key === 'assigned_to' ? (c.assigned_to == null ? '' : String(c.assigned_to))
                 : String(c.custom_data?.[key] ?? '');
        return values.includes(cv);
      });
    }
  }
  filteredContacts = filtered;
  if (contactViewMode === 'kanban') {
    renderContactsKanban();
  } else {
    renderContactsTable(filtered);
  }
}

// ── Pagination ────────────────────────────────────────────
function goToPage(page) { currentPage = page; filterContacts(); }

function renderPagination(total) {
  const el = document.getElementById('contacts-pagination');
  if (!el) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  const start = (currentPage - 1) * PAGE_SIZE + 1, end = Math.min(currentPage * PAGE_SIZE, total);
  const pages = buildPageNumbers(currentPage, totalPages);
  el.innerHTML = `
    <span class="pagination-info">Showing ${start}–${end} of ${total}</span>
    <div class="pagination-controls">
      <button class="page-btn" onclick="goToPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>
      ${pages.map(p => p === '…'
        ? '<span class="page-ellipsis">…</span>'
        : `<button class="page-btn${p===currentPage?' active':''}" onclick="goToPage(${p})">${p}</button>`
      ).join('')}
      <button class="page-btn" onclick="goToPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>
    </div>`;
}

// ── Filters ───────────────────────────────────────────────
function toggleFilterPanel() {
  filterPanelOpen = !filterPanelOpen;
  document.getElementById('filter-panel')?.classList.toggle('hidden', !filterPanelOpen);
  document.getElementById('filter-toggle-btn')?.classList.toggle('active', filterPanelOpen);
  if (filterPanelOpen) renderFilterPanel();
}

function isFiltered(key, value) { return (activeFilters[key] || []).includes(value); }

function toggleFilter(key, value) {
  if (!activeFilters[key]) activeFilters[key] = [];
  const idx = activeFilters[key].indexOf(value);
  if (idx >= 0) activeFilters[key].splice(idx, 1); else activeFilters[key].push(value);
  if (!activeFilters[key].length) delete activeFilters[key];
  renderFilterPanel(); renderFilterChips(); currentPage = 1; filterContacts();
}

function addKeywordFilter() {
  const colEl = document.getElementById('keyword-filter-col');
  const valEl = document.getElementById('keyword-filter-val');
  const col = colEl?.value?.trim();
  const keyword = valEl?.value?.trim();
  if (!col || !keyword) return;

  const key = `keyword:${col}`;
  if (!activeFilters[key]) activeFilters[key] = [];
  if (!activeFilters[key].includes(keyword)) {
    activeFilters[key].push(keyword);
  }
  valEl.value = '';
  renderFilterPanel(); renderFilterChips(); currentPage = 1; filterContacts();
}

function removeFilterChip(key, value) {
  if (activeFilters[key]) {
    const idx = activeFilters[key].indexOf(value);
    if (idx >= 0) activeFilters[key].splice(idx, 1);
    if (!activeFilters[key].length) delete activeFilters[key];
  }
  renderFilterPanel(); renderFilterChips(); currentPage = 1; filterContacts();
}

function clearAllFilters() {
  activeFilters = {}; renderFilterPanel(); renderFilterChips(); currentPage = 1; filterContacts();
}

function renderFilterPanel() {
  const el = document.getElementById('filter-panel');
  if (!el || !filterPanelOpen) return;
  const hasFilters = Object.keys(activeFilters).length > 0;
  const mkOpt = (key, value, label, style = '') => {
    const on = isFiltered(key, value);
    return `<button class="filter-opt${on ? ' active' : ''}" style="${style}" onclick="toggleFilter('${key}','${value}')">${label}</button>`;
  };
  const sections = [];

  // Keyword filter section
  const keywordFilterCol = document.getElementById('keyword-filter-col')?.value || 'name';
  const keywordFilterVal = document.getElementById('keyword-filter-val')?.value || '';
  const filterableColumns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'company', label: 'Company' },
    { key: 'phone', label: 'Phone' },
    ...fields.map(f => ({ key: `custom:${f.field_key}`, label: f.name }))
  ];
  const colOpts = filterableColumns.map(col =>
    `<option value="${col.key}" ${keywordFilterCol === col.key ? 'selected' : ''}>${esc(col.label)}</option>`
  ).join('');
  sections.push(`
    <div class="filter-section">
      <div class="filter-section-label">Search by Keywords</div>
      <div style="display:flex;gap:8px;padding:0 12px 12px">
        <select id="keyword-filter-col" class="form-control" style="flex:0.6" onchange="renderFilterPanel()">
          ${colOpts}
        </select>
        <input type="text" id="keyword-filter-val" class="form-control" style="flex:1" placeholder="Enter keywords..."
          onkeydown="if(event.key==='Enter') addKeywordFilter()">
        <button class="btn btn-sm btn-primary" onclick="addKeywordFilter()">Add</button>
      </div>
    </div>
  `);

  if (stages.length) {
    const opts = [mkOpt('stage_id', '', t('detail_unassigned')),
      ...stages.map(s => mkOpt('stage_id', String(s.id), esc(s.name),
        isFiltered('stage_id', String(s.id)) ? `background:${s.color};border-color:${s.color};color:#fff` : `border-color:${s.color}40`
      ))].join('');
    sections.push(`<div class="filter-section"><div class="filter-section-label">${t('col_stage')}</div><div class="filter-options">${opts}</div></div>`);
  }
  if (members.length) {
    const opts = [mkOpt('assigned_to', '', t('detail_unassigned')),
      ...members.map(m => mkOpt('assigned_to', String(m.id), esc(m.name)))].join('');
    sections.push(`<div class="filter-section"><div class="filter-section-label">${t('col_assignee')}</div><div class="filter-options">${opts}</div></div>`);
  }
  fields.filter(f => f.type === 'dropdown' && f.options?.length).forEach(f => {
    const opts = f.options.map(o => mkOpt(f.field_key, o, esc(o))).join('');
    sections.push(`<div class="filter-section"><div class="filter-section-label">${esc(f.name)}</div><div class="filter-options">${opts}</div></div>`);
  });
  el.innerHTML = `
    <div class="filter-panel-header">
      <span class="filter-panel-title">Filters</span>
      ${hasFilters ? `<button class="btn btn-sm btn-ghost" onclick="clearAllFilters()">Clear all</button>` : ''}
    </div>
    <div class="filter-sections">${sections.join('') || '<p style="color:var(--muted);font-size:13px">No filterable fields available.</p>'}</div>`;
}

function renderFilterChips() {
  const el = document.getElementById('filter-chips');
  if (!el) return;
  const chips = [];
  for (const [key, values] of Object.entries(activeFilters)) {
    if (!values?.length) continue;
    values.forEach(v => {
      let prefix, label, removeKey = key;

      if (key.startsWith('keyword:')) {
        const col = key.substring(8);
        const colName = col.startsWith('custom:')
          ? fields.find(f => f.field_key === col.substring(7))?.name
          : col === 'name' ? 'Name'
            : col === 'email' ? 'Email'
            : col === 'company' ? 'Company'
            : col === 'phone' ? 'Phone'
            : col;
        prefix = colName;
        label = `"${esc(v)}"`;
      } else if (key === 'stage_id') {
        prefix = t('col_stage');
        label = v === '' ? t('detail_unassigned') : esc(stages.find(s => String(s.id) === v)?.name || v);
      } else if (key === 'assigned_to') {
        prefix = t('col_assignee');
        label = v === '' ? t('detail_unassigned') : esc(members.find(m => String(m.id) === v)?.name || v);
      } else {
        const f = fields.find(f => f.field_key === key);
        prefix = esc(f?.name || key);
        label = esc(v);
      }

      chips.push(`<span class="filter-chip"><span class="filter-chip-label">${prefix}:</span> ${label}
        <button class="filter-chip-remove" onclick="removeFilterChip('${removeKey}','${v.replace(/'/g, '&apos;')}')">✕</button>
      </span>`);
    });
  }
  el.innerHTML = chips.join('');
  el.classList.toggle('hidden', chips.length === 0);
  const count = Object.values(activeFilters).reduce((n, v) => n + v.length, 0);
  const badge = document.getElementById('filter-badge');
  if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
}

// ── SELECTION MODE ─────────────────────────────────────────
function toggleSelectMode() {
  selectionModeOn = !selectionModeOn;
  const btn = document.getElementById('select-mode-btn');

  if (selectionModeOn) {
    if (btn) btn.classList.add('active');
  } else {
    if (btn) btn.classList.remove('active');
    selectedContactIds.clear();
    updateBulkDeleteButton();
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
  }

  filterContacts();
}

// ── BULK DELETE ────────────────────────────────────────────
function toggleContactSelection(contactId, isChecked) {
  if (isChecked) {
    selectedContactIds.add(contactId);
  } else {
    selectedContactIds.delete(contactId);
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
  }
  updateBulkDeleteButton();
}

function toggleSelectAll(isChecked) {
  selectedContactIds.clear();
  if (isChecked) {
    // Select all filtered/visible contacts (all pages)
    const sorted = sortContacts(contacts);
    sorted.forEach(c => selectedContactIds.add(c.id));
  }
  // Update all visible checkboxes on current page
  document.querySelectorAll('.contact-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  const selectAllCb = document.getElementById('select-all-checkbox');
  if (selectAllCb) selectAllCb.checked = isChecked;
  updateBulkDeleteButton();
}

function updateBulkDeleteButton() {
  const section = document.getElementById('bulk-delete-section');
  const countEl = document.getElementById('bulk-delete-count');
  if (!section || !countEl) return;
  if (selectedContactIds.size > 0) {
    section.classList.remove('hidden');
    countEl.textContent = `${selectedContactIds.size} selected`;
  } else {
    section.classList.add('hidden');
  }
}

function openBulkDeleteModal() {
  const msgEl = document.getElementById('bulk-delete-message');
  const inputEl = document.getElementById('bulk-delete-confirm-input');
  const modalEl = document.getElementById('bulk-delete-modal');
  if (!msgEl || !inputEl || !modalEl) return;
  msgEl.textContent = `You are about to delete ${selectedContactIds.size} contact${selectedContactIds.size === 1 ? '' : 's'}. This action cannot be undone.`;
  inputEl.value = '';
  modalEl.classList.remove('hidden');
}

async function confirmBulkDelete() {
  const inputEl = document.getElementById('bulk-delete-confirm-input');
  const entered = inputEl.value.trim();
  const required = String(selectedContactIds.size);

  if (entered !== required) {
    alert(`Please enter the correct number (${required}) to confirm deletion.`);
    return;
  }

  const contactIds = Array.from(selectedContactIds);
  const res = await api.post('/api/contacts/bulk/delete', { contactIds });
  if (res.error) {
    alert('Error deleting contacts: ' + res.error);
    return;
  }

  closeModal('bulk-delete-modal');
  selectedContactIds.clear();
  updateBulkDeleteButton();
  invalidate();
  await loadContacts();
}

// ── Kanban view ────────────────────────────────
let kanbanAllContacts = [];

async function openKanbanAddContactModal() {
  // Get all contacts (including those without a stage)
  kanbanAllContacts = await api.get(`/api/contacts?contact_type=${currentContactType}`);

  // Populate contact dropdown
  const contactSel = document.getElementById('kanban-contact-select');
  contactSel.innerHTML = kanbanAllContacts.map(c =>
    `<option value="${c.id}">${esc(c.name)}${c.company ? ` - ${esc(c.company)}` : ''}</option>`
  ).join('');

  // Populate stage dropdown
  const stageSel = document.getElementById('kanban-stage-select');
  stageSel.innerHTML = stages.map(s =>
    `<option value="${s.id}">${esc(s.name)}</option>`
  ).join('');

  document.getElementById('kanban-contact-search').value = '';
  document.getElementById('kanban-add-contact-modal').classList.remove('hidden');
}

function filterKanbanContacts() {
  const query = document.getElementById('kanban-contact-search').value.toLowerCase();
  const filtered = kanbanAllContacts.filter(c =>
    c.name.toLowerCase().includes(query) ||
    (c.company || '').toLowerCase().includes(query) ||
    (c.email || '').toLowerCase().includes(query)
  );

  const sel = document.getElementById('kanban-contact-select');
  sel.innerHTML = filtered.map(c =>
    `<option value="${c.id}">${esc(c.name)}${c.company ? ` - ${esc(c.company)}` : ''}</option>`
  ).join('');
}

async function confirmAddContactToKanban(e) {
  e.preventDefault();
  const contactId = parseInt(document.getElementById('kanban-contact-select').value);
  const stageId = parseInt(document.getElementById('kanban-stage-select').value);

  if (!contactId || !stageId) {
    alert('Please select a contact and stage');
    return;
  }

  await api.patch(`/api/contacts/${contactId}/stage`, { stage_id: stageId });
  closeModal('kanban-add-contact-modal');
  invalidate();
  await loadContacts();
}

function setContactViewMode(mode) {
  contactViewMode = mode;
  document.getElementById('contacts-kanban-board')?.classList.toggle('hidden', mode === 'list');
  document.getElementById('contacts-table-wrap')?.classList.toggle('hidden', mode === 'kanban');
  document.getElementById('contacts-pagination')?.classList.toggle('hidden', mode === 'kanban');

  // Update toggle button active class
  document.getElementById('contact-view-kanban-btn')?.classList.toggle('active', mode === 'kanban');
  document.getElementById('contact-view-list-btn')?.classList.toggle('active', mode === 'list');

  // Toggle add buttons based on view mode
  document.getElementById('kanban-add-btn')?.classList.toggle('hidden', mode === 'list');
  document.getElementById('list-add-btn')?.classList.toggle('hidden', mode === 'kanban');
  document.getElementById('kanban-add-stage-btn')?.classList.toggle('hidden', mode === 'list' || !stages.length);
  document.getElementById('select-mode-btn')?.classList.toggle('hidden', mode === 'kanban');

  if (mode === 'kanban') {
    renderContactsKanban();
  } else {
    filterContacts();
  }
}

let draggedContactId = null;

function renderContactsKanban() {
  const board = document.getElementById('contacts-kanban-board');
  if (!board) return;

  const stageList = stages || [];
  if (!stageList.length) {
    board.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;width:100%;min-height:300px;flex-direction:column;gap:20px">
        <div style="color:var(--muted);font-size:14px">No stages available</div>
        <button class="btn btn-primary" onclick="openKanbanStageModal()">+ Add Stage</button>
      </div>
    `;
    return;
  }

  board.innerHTML = stageList.map(stage => {
    const contactsToUse = filteredContacts.length ? filteredContacts : contacts;
    const stageContacts = contactsToUse.filter(c => c.stage_id === stage.id);
    return `
      <div class="pipeline-col">
        <div class="col-header">
          <span class="col-dot" style="background:${stage.color}"></span>
          <span class="col-name">${esc(stage.name)}</span>
          <span class="col-count">${stageContacts.length}</span>
        </div>
        <div class="col-cards" ondragover="contactDragOver(event)" ondragleave="contactDragLeave(event)" ondrop="contactDrop(event,${stage.id})">
          ${stageContacts.length ? stageContacts.map(c => contactCard(c)).join('') : `<div class="col-empty">No contacts</div>`}
        </div>
      </div>
    `;
  }).join('');
}

function contactCard(c) {
  return `
    <div class="contact-card" draggable="true" data-id="${c.id}"
      ondragstart="contactDragStart(event,${c.id})" ondragend="contactDragEnd(event)"
      onclick="openDetail(${c.id})" style="position:relative">
      <button class="card-remove-btn" onclick="removeContactFromKanban(event,${c.id})" title="Remove from kanban">×</button>
      <div class="card-name">${esc(c.name)}</div>
      ${c.company ? `<div class="card-field">${esc(c.company)}</div>` : ''}
      ${c.assigned_to_name ? `<div class="card-field">→ ${esc(c.assigned_to_name)}</div>` : ''}
    </div>
  `;
}

function contactDragStart(e, id) {
  draggedContactId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.closest('[draggable]').classList.add('dragging'), 0);
}

function contactDragEnd(e) {
  e.target.closest('[draggable]').classList.remove('dragging');
}

function contactDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function contactDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function contactDrop(e, stageId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (!draggedContactId) return;

  const contact = contacts.find(c => c.id === draggedContactId);
  if (!contact || contact.stage_id === stageId) return;

  contact.stage_id = stageId;
  const stage = stages.find(s => s.id === stageId);
  contact.stage_name = stage?.name || null;
  contact.stage_color = stage?.color || null;

  renderContactsKanban();
  await api.patch(`/api/contacts/${draggedContactId}/stage`, { stage_id: stageId });
  draggedContactId = null;
}

async function removeContactFromKanban(e, contactId) {
  e.stopPropagation();
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;

  contact.stage_id = null;
  contact.stage_name = null;
  contact.stage_color = null;

  renderContactsKanban();
  await api.patch(`/api/contacts/${contactId}/stage`, { stage_id: null });
}

function openKanbanStageModal() {
  document.getElementById('stage-form').reset();
  document.getElementById('stage-id').value = '';
  document.getElementById('stage-color').value = '#4f6ef7';
  document.getElementById('stage-modal-title').textContent = 'Add Stage';
  document.getElementById('stage-modal').classList.remove('hidden');
  document.getElementById('stage-name').focus();
}
