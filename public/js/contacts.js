// ── CONTACTS ──────────────────────────────────────────────
async function loadContacts() {
  await Promise.all([ensureStages(), ensureFields(), ensureMembers()]);
  contacts = await api.get(`/api/contacts?contact_type=${currentContactType}`);
  currentPage = 1;
  updateContactsPageHeader();
  renderFilterChips();
  filterContacts();
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
    { key: 'stage_id',    label: () => t('col_stage'),      type: 'stage',    show: true  },
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
  const q = document.getElementById('contact-search').value.toLowerCase();
  let filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.company||'').toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q)
  );
  for (const [key, values] of Object.entries(activeFilters)) {
    if (!values?.length) continue;
    filtered = filtered.filter(c => {
      const cv = key === 'stage_id'    ? (c.stage_id    == null ? '' : String(c.stage_id))
               : key === 'assigned_to' ? (c.assigned_to == null ? '' : String(c.assigned_to))
               : String(c.custom_data?.[key] ?? '');
      return values.includes(cv);
    });
  }
  renderContactsTable(filtered);
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
      let prefix, label;
      if (key === 'stage_id') { prefix = t('col_stage'); label = v === '' ? t('detail_unassigned') : esc(stages.find(s => String(s.id) === v)?.name || v); }
      else if (key === 'assigned_to') { prefix = t('col_assignee'); label = v === '' ? t('detail_unassigned') : esc(members.find(m => String(m.id) === v)?.name || v); }
      else { const f = fields.find(f => f.field_key === key); prefix = esc(f?.name || key); label = esc(v); }
      chips.push(`<span class="filter-chip"><span class="filter-chip-label">${prefix}:</span> ${label}
        <button class="filter-chip-remove" onclick="toggleFilter('${key}','${v.replace(/'/g, '&apos;')}')">✕</button>
      </span>`);
    });
  }
  el.innerHTML = chips.join('');
  el.classList.toggle('hidden', chips.length === 0);
  const count = Object.values(activeFilters).reduce((n, v) => n + v.length, 0);
  const badge = document.getElementById('filter-badge');
  if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
}
