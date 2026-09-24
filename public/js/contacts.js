let selectedContactIds = new Set();
let filteredContacts = [];

async function loadContacts() {
  selectedContactIds.clear();
  const contactsBody = document.getElementById('contacts-body');
  if (contactsBody) contactsBody.innerHTML = '';

  await Promise.all([ensureFields(), ensureMembers()]);
  contacts = await api.get(`/api/contacts?contact_type=${currentContactType}`);
  currentPage = 1;
  updateContactsPageHeader();
  renderFilterChips();
  renderSelectionBar();
  filterContacts();
}

// The same page serves Contacts and the (renamable) supplier list.
function updateContactsPageHeader() {
  const isSupplier = currentContactType === 'supplier';
  const name = isSupplier ? (currentWorkspace?.supplier_name || t('suppliers')) : t('page_contacts');
  const singular = name.replace(/s$/i, '');
  const h1  = document.querySelector('#page-contacts .page-header h1');
  const btn  = document.querySelector('#page-contacts .page-header .btn-primary');
  const search = document.getElementById('contact-search');
  if (h1)  h1.textContent = name;
  if (btn) { const lbl = btn.querySelector('span'); if (lbl) lbl.textContent = isSupplier ? t('add_named').replace('{name}', singular) : t('add_contact'); }   // keep the button's icon
  if (search) search.placeholder = isSupplier ? t('search_named_ph').replace('{name}', name.toLowerCase()) : t('search_contacts_ph');
}

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

/* ── The table ──────────────────────────────────────────────────────────────
   Checkbox column · identity column · the visible columns · an action cluster
   that appears on hover. A click on the row opens the contact; a double-click
   on an editable cell edits it in place.                                   */
function currentPageContacts() {
  const sorted = sortContacts(filteredContacts);
  return sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
}
function hasActiveFilters() {
  return Object.keys(activeFilters).length > 0 || (document.getElementById('contact-search')?.value || '').trim() !== '';
}
function clearAllFiltersAndSearch() {
  const search = document.getElementById('contact-search'); if (search) search.value = '';
  clearAllFilters();
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
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageList = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const allOnPage = pageList.length > 0 && pageList.every(c => selectedContactIds.has(c.id));

  document.getElementById('contacts-thead').innerHTML = `<tr>
    <th class="th-check"><input type="checkbox" id="select-all-checkbox" aria-label="${esc(t('select_page'))}" ${allOnPage ? 'checked' : ''} onchange="toggleSelectAll(this.checked)" /></th>
    ${colKeys.map(k => tableHeadCell({
      key: k,
      label: k === '_name' ? t('col_name') : esc(visibleCols.find(c => c.key === k)?.label() || ''),
      sortKey, sortDir, onSort: 'toggleSort',
      align: 'left',
    })).join('')}
    <th class="th-actions"><span class="sr-only">${esc(t('col_actions'))}</span></th>
  </tr>`;

  const body = document.getElementById('contacts-body');
  if (!pageList.length) {
    const filtered = hasActiveFilters();
    body.innerHTML = `<tr class="table-empty-row"><td class="table-empty" colspan="${colKeys.length + 2}">
      <div class="empty-state compact">
        <strong>${t(filtered ? 'empty_filtered_title' : 'empty_contacts_title')}</strong>
        <span>${t(filtered ? 'empty_filtered_hint' : 'empty_contacts_hint')}</span>
        ${filtered
          ? `<button type="button" class="btn btn-sm" onclick="clearAllFiltersAndSearch()">${t('btn_clear_filters')}</button>`
          : `<button type="button" class="btn btn-sm btn-primary" onclick="openContactModal()">${UI_ICON.plus}<span>${t('add_contact')}</span></button>`}
      </div></td></tr>`;
    document.getElementById('contacts-pagination').innerHTML = paginationHtml({ total: 0, page: 1, pageSize: PAGE_SIZE, goto: 'goToPage' });
    return;
  }

  const dash = '<span class="muted-dash">—</span>';
  // An editable cell: value + a pencil hint (shown on row hover); double-click edits in place.
  const editable = (c, key, type, value, inner) =>
    `<td class="editable-cell" ondblclick="startInlineEdit(this,${c.id},'${key}','${type}')" title="${esc(value) || esc(t('dblclick_edit'))}"><span class="cell-text">${inner}</span><span class="cell-edit-hint" aria-hidden="true">${UI_ICON.edit}</span></td>`;

  body.innerHTML = pageList.map(c => {
    const cells = visibleCols.map(col => {
      if (col.key === 'company')     return editable(c, 'company', 'text',  c.company || '', esc(c.company || '') || dash);
      if (col.key === 'email')       return editable(c, 'email',   'email', c.email   || '', c.email ? `<a href="mailto:${esc(c.email)}" onclick="event.stopPropagation()">${esc(c.email)}</a>` : dash);
      if (col.key === 'phone')       return editable(c, 'phone',   'phone', c.phone   || '', esc(c.phone || '') || dash);
      if (col.key === 'assigned_to') return editable(c, 'assigned_to', 'assignee', c.assigned_to_name || '', esc(c.assigned_to_name || '') || dash);
      if (col.key === 'created_at')  return `<td class="td-muted" title="${esc(String(c.created_at || ''))}">${fmtDate(c.created_at) || dash}</td>`;
      const v = c.custom_data?.[col.key] ?? '';
      return editable(c, col.key, col.type, String(v), esc(v) || dash);
    }).join('');

    const waHref = waLink(c.phone, c);
    const sel = selectedContactIds.has(c.id);
    return `<tr class="row${sel ? ' is-selected' : ''}" tabindex="0" data-id="${c.id}" aria-selected="${sel}" onclick="onContactRowClick(event,${c.id})" onkeydown="onContactRowKey(event,${c.id})">
      <td class="td-check"><input type="checkbox" class="contact-checkbox" aria-label="${esc(c.name)}" data-contact-id="${c.id}" ${sel ? 'checked' : ''} onchange="toggleContactSelection(${c.id}, this.checked)" /></td>
      <td class="name-cell" title="${esc(c.name)}"><span class="contact-name-link">${esc(c.name)}</span></td>
      ${cells}
      <td class="td-actions"><div class="row-actions">
        ${waHref ? `<a class="btn btn-sm btn-ghost btn-icon" href="${waHref}" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp ${esc(c.name)}">${WA_SVG}</a>` : ''}
        <button type="button" class="btn btn-sm btn-ghost btn-icon" title="${esc(t('btn_edit'))}" aria-label="${esc(t('btn_edit'))}" onclick="event.stopPropagation();openContactModal(${c.id})">${UI_ICON.edit}</button>
        <button type="button" class="btn btn-sm btn-ghost btn-icon" title="${esc(t('row_menu'))}" aria-label="${esc(t('row_menu'))}" aria-haspopup="menu" aria-expanded="false" onclick="openContactRowMenu(event,${c.id})">${UI_ICON.more}</button>
      </div></td>
    </tr>`;
  }).join('');

  document.getElementById('contacts-pagination').innerHTML = paginationHtml({ total: sorted.length, page: currentPage, pageSize: PAGE_SIZE, goto: 'goToPage' });

  // Column widths: measure once per column, then pin them so resizing sticks.
  let measured = false;
  document.querySelectorAll('#contacts-thead th[data-col-key]').forEach(th => {
    const key = th.dataset.colKey;
    if (key && !colWidths[key]) { colWidths[key] = Math.max(60, Math.round(th.getBoundingClientRect().width)); measured = true; }
  });
  if (measured) saveColWidths();

  const cg = document.createElement('colgroup');
  const checkCol = document.createElement('col'); checkCol.style.width = '36px'; cg.appendChild(checkCol);
  colKeys.forEach(key => { const col = document.createElement('col'); col.style.width = (colWidths[key] || 100) + 'px'; cg.appendChild(col); });
  const actionsCol = document.createElement('col'); actionsCol.style.width = '112px'; cg.appendChild(actionsCol);
  table.insertBefore(cg, table.firstChild);
  table.style.tableLayout = 'fixed';

  const cols = cg.children;
  document.querySelectorAll('#contacts-thead th[data-col-key]').forEach((th, i) => {
    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    const colEl = cols[i + 1];                                  // +1: the checkbox column comes first
    handle.addEventListener('mousedown', e => { e.stopPropagation(); startColResize(e, colKeys[i], colEl); });
    handle.addEventListener('click', e => e.stopPropagation());
    th.appendChild(handle);
  });
}

function onContactRowClick(e, id) {
  if (rowIsInteractive(e.target)) return;
  openDetail(id);
}
function onContactRowKey(e, id) {
  if (e.key === 'Enter' && !rowIsInteractive(e.target)) { e.preventDefault(); openDetail(id); }
}
function openContactRowMenu(e, id) {
  e.stopPropagation();
  openPopoverMenu(e.currentTarget, `
    <button type="button" class="card-menu-item" role="menuitem" onclick="closePopoverMenu();openDetail(${id})">${UI_ICON.chevronRight}<span>${t('btn_open')}</span></button>
    <button type="button" class="card-menu-item" role="menuitem" onclick="closePopoverMenu();openContactModal(${id})">${UI_ICON.edit}<span>${t('btn_edit')}</span></button>
    <div class="card-menu-sep"></div>
    <button type="button" class="card-menu-item danger" role="menuitem" onclick="closePopoverMenu();deleteContactFromList(${id})">${UI_ICON.remove}<span>${t('delete_contact')}</span></button>`);
}
async function deleteContactFromList(id) {
  if (!confirm(t('confirm_delete_contact'))) return;
  const res = await api.del(`/api/contacts/${id}`);
  if (res?.error) { alert(res.error); return; }
  contacts = contacts.filter(c => c.id !== id);
  selectedContactIds.delete(id);
  invalidate();
  filterContacts();
}

function startInlineEdit(td, contactId, fieldKey, fieldType) {
  if (td.querySelector('input,select')) return;
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;
  const originalHTML = td.innerHTML;
  td.classList.add('editing');
  const isSelect = fieldType === 'assignee' || fieldType === 'dropdown';
  let el;

  if (isSelect) {
    el = document.createElement('select');
    el.className = 'inline-select';
    if (fieldType === 'assignee') {
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
      const val = fieldType === 'assignee' ? (raw ? parseInt(raw) : null) : (raw || null);
      td.innerHTML = originalHTML; td.classList.remove('editing'); await commitInlineEdit(contactId, fieldKey, fieldType, val);
    };
    el.onkeydown = e => { if (e.key === 'Escape') { td.innerHTML = originalHTML; td.classList.remove('editing'); } };
    el.onblur = () => { if (td.contains(el)) { td.innerHTML = originalHTML; td.classList.remove('editing'); } };
  } else {
    el = document.createElement('input');
    el.className = 'inline-input';
    el.type = { email: 'email', phone: 'tel', number: 'number', date: 'date', url: 'url' }[fieldType] || 'text';
    const builtinKeys = ['company', 'email', 'phone'];
    el.value = builtinKeys.includes(fieldKey) ? (contact[fieldKey] || '') : (contact.custom_data?.[fieldKey] ?? '');
    const origVal = el.value;
    el.onblur = async () => {
      const val = el.value.trim(); td.innerHTML = originalHTML; td.classList.remove('editing');
      if (val !== origVal) await commitInlineEdit(contactId, fieldKey, fieldType, val || null);
    };
    el.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.onblur = null; td.innerHTML = originalHTML; td.classList.remove('editing'); }
    };
  }

  td.innerHTML = ''; td.appendChild(el); el.focus();
  if (el.select && fieldType !== 'date') el.select();
}

async function commitInlineEdit(contactId, fieldKey, fieldType, value) {
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;
  if (fieldType === 'assignee') {
    contact.assigned_to = value; const m = members.find(m => m.id === value);
    contact.assigned_to_name = m?.name || null;
  } else if (['company','email','phone'].includes(fieldKey)) {
    contact[fieldKey] = value;
  } else {
    contact.custom_data = { ...(contact.custom_data || {}), [fieldKey]: value };
  }
  await api.put(`/api/contacts/${contactId}`, {
    name: contact.name, company: contact.company, email: contact.email,
    phone: contact.phone, assigned_to: contact.assigned_to,
    custom_data: contact.custom_data || {}
  });
  filterContacts();
  if (document.getElementById('page-deals').classList.contains('active')) renderDealsBoard();
}

function onContactSearch() { currentPage = 1; filterContacts(); }

function filterContacts() {
  const q = (document.getElementById('contact-search')?.value || '').toLowerCase().trim();
  let filtered = contacts.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.company || '').toLowerCase().includes(q) ||
    (c.email || '').toLowerCase().includes(q) ||
    (c.phone || '').toLowerCase().includes(q)
  );
  for (const [key, values] of Object.entries(activeFilters)) {
    if (!values?.length) continue;

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
      filtered = filtered.filter(c => {
        const cv = key === 'assigned_to' ? (c.assigned_to == null ? '' : String(c.assigned_to))
                 : String(c.custom_data?.[key] ?? '');
        return values.includes(cv);
      });
    }
  }
  filteredContacts = filtered;
  // Selection survives sorting and paging; rows that left the filtered set are dropped from it.
  const visibleIds = new Set(filtered.map(c => c.id));
  selectedContactIds = new Set([...selectedContactIds].filter(id => visibleIds.has(id)));
  renderContactsTable(filtered);
  renderSelectionBar();
}

function goToPage(page) { currentPage = page; filterContacts(); }

function renderPagination(total) {
  const el = document.getElementById('contacts-pagination');
  if (!el) return;
  el.innerHTML = paginationHtml({ total, page: currentPage, pageSize: PAGE_SIZE, goto: 'goToPage' });
}

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

// Columns the keyword filter can target: the four built-ins plus every custom field.
function keywordFilterColumns() {
  return [
    { key: 'name',    label: t('col_name') },
    { key: 'email',   label: t('col_email') },
    { key: 'company', label: t('col_company') },
    { key: 'phone',   label: t('col_phone') },
    ...fields.map(f => ({ key: `custom:${f.field_key}`, label: f.name })),
  ];
}

function renderFilterPanel() {
  const el = document.getElementById('filter-panel');
  if (!el || !filterPanelOpen) return;
  const hasFilters = Object.keys(activeFilters).length > 0;
  // A pill per option.
  const mkOpt = (key, value, label) => {
    const on = isFiltered(key, value);
    return `<button type="button" class="filter-opt${on ? ' is-on' : ''}" aria-pressed="${on}" onclick="toggleFilter('${key}','${value}')">${label}</button>`;
  };
  const sections = [];

  const keywordFilterCol = document.getElementById('keyword-filter-col')?.value || 'name';
  const keywordFilterVal = document.getElementById('keyword-filter-val')?.value || '';
  const colOpts = keywordFilterColumns().map(col =>
    `<option value="${col.key}" ${keywordFilterCol === col.key ? 'selected' : ''}>${esc(col.label)}</option>`
  ).join('');
  sections.push(`
    <div class="filter-section filter-section-keyword">
      <div class="filter-section-label">${t('filter_keywords')}</div>
      <div class="filter-keyword-row">
        <select id="keyword-filter-col" class="filter-keyword-col" aria-label="${esc(t('filter_keywords'))}" onchange="renderFilterPanel()">${colOpts}</select>
        <input type="text" id="keyword-filter-val" class="filter-keyword-val" value="${esc(keywordFilterVal)}" placeholder="${esc(t('filter_keyword_ph'))}"
          onkeydown="if(event.key==='Enter') addKeywordFilter()">
        <button type="button" class="btn btn-sm btn-primary" onclick="addKeywordFilter()">${t('add_btn')}</button>
      </div>
    </div>`);

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
      <span class="filter-panel-title">${t('filter_title')}</span>
      ${hasFilters ? `<button type="button" class="btn btn-sm btn-ghost" onclick="clearAllFilters()">${t('btn_clear_all')}</button>` : ''}
    </div>
    <div class="filter-sections">${sections.join('') || `<p class="empty-inline">${t('filter_none')}</p>`}</div>`;
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
        prefix = esc(keywordFilterColumns().find(c => c.key === col)?.label || col);
        label = `"${esc(v)}"`;
      } else if (key === 'assigned_to') {
        prefix = t('col_assignee');
        label = v === '' ? t('detail_unassigned') : esc(members.find(m => String(m.id) === v)?.name || v);
      } else {
        const f = fields.find(f => f.field_key === key);
        prefix = esc(f?.name || key);
        label = esc(v);
      }

      chips.push(`<span class="filter-chip"><span class="filter-chip-label">${prefix}:</span> ${label}
        <button type="button" class="filter-chip-remove" aria-label="${esc(t('btn_clear'))}" onclick="removeFilterChip('${removeKey}','${v.replace(/'/g, '&apos;')}')">${UI_ICON.remove}</button>
      </span>`);
    });
  }
  el.innerHTML = chips.join('');
  el.classList.toggle('hidden', chips.length === 0);
  const count = Object.values(activeFilters).reduce((n, v) => n + v.length, 0);
  const badge = document.getElementById('filter-badge');
  if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
}

/* ── Selection ─────────────────────────────────────────────────────────────
   The checkbox column is always there. The header box selects the current
   page; the selection bar offers "select all N" for the whole filtered set. */
function setRowSelected(contactId, on) {
  const row = document.querySelector(`#contacts-body tr[data-id="${contactId}"]`);
  if (!row) return;
  row.classList.toggle('is-selected', on);
  row.setAttribute('aria-selected', String(on));
  const cb = row.querySelector('.contact-checkbox'); if (cb) cb.checked = on;
}
function syncSelectAllCheckbox() {
  const cb = document.getElementById('select-all-checkbox'); if (!cb) return;
  const page = currentPageContacts();
  cb.checked = page.length > 0 && page.every(c => selectedContactIds.has(c.id));
}

function toggleContactSelection(contactId, isChecked) {
  if (isChecked) selectedContactIds.add(contactId); else selectedContactIds.delete(contactId);
  setRowSelected(contactId, isChecked);
  syncSelectAllCheckbox();
  renderSelectionBar();
}

function toggleSelectAll(isChecked) {
  currentPageContacts().forEach(c => { if (isChecked) selectedContactIds.add(c.id); else selectedContactIds.delete(c.id); setRowSelected(c.id, isChecked); });
  syncSelectAllCheckbox();
  renderSelectionBar();
}

function selectAllFiltered() {
  filteredContacts.forEach(c => selectedContactIds.add(c.id));
  currentPageContacts().forEach(c => setRowSelected(c.id, true));
  syncSelectAllCheckbox();
  renderSelectionBar();
}

function clearSelection() {
  selectedContactIds.clear();
  document.querySelectorAll('#contacts-body tr.is-selected').forEach(r => { r.classList.remove('is-selected'); r.setAttribute('aria-selected', 'false'); });
  document.querySelectorAll('#contacts-body .contact-checkbox').forEach(cb => { cb.checked = false; });
  syncSelectAllCheckbox();
  renderSelectionBar();
}

// While rows are selected the toolbar shows the selection bar instead of search + filters.
function renderSelectionBar() {
  const bar = document.getElementById('selection-bar'), toolbar = document.getElementById('contacts-toolbar');
  if (!bar || !toolbar) return;
  const n = selectedContactIds.size, total = filteredContacts.length;
  toolbar.classList.toggle('is-selecting', n > 0);
  bar.classList.toggle('hidden', n === 0);
  if (!n) { bar.innerHTML = ''; return; }
  bar.innerHTML = `
    <span class="selection-count">${esc(t('n_selected').replace('{n}', n))}</span>
    ${n < total ? `<button type="button" class="btn btn-sm btn-ghost" onclick="selectAllFiltered()">${esc(t('select_all_n').replace('{n}', total))}</button>` : ''}
    <span class="spacer"></span>
    <button type="button" class="btn btn-sm btn-danger" onclick="openBulkDeleteModal()">${UI_ICON.remove}<span>${t('btn_delete')}</span></button>
    <button type="button" class="btn btn-sm" onclick="clearSelection()">${t('btn_clear')}</button>`;
}

function openBulkDeleteModal() {
  const msgEl = document.getElementById('bulk-delete-message');
  const inputEl = document.getElementById('bulk-delete-confirm-input');
  const modalEl = document.getElementById('bulk-delete-modal');
  if (!msgEl || !inputEl || !modalEl) return;
  msgEl.textContent = t('bulk_delete_msg').replace('{n}', selectedContactIds.size);
  inputEl.value = '';
  modalEl.classList.remove('hidden');
  inputEl.focus();
}

async function confirmBulkDelete() {
  const inputEl = document.getElementById('bulk-delete-confirm-input');
  const entered = inputEl.value.trim();
  const required = String(selectedContactIds.size);
  if (entered !== required) { alert(t('bulk_delete_confirm_hint').replace('{n}', required)); return; }

  const contactIds = Array.from(selectedContactIds);
  const res = await api.post('/api/contacts/bulk/delete', { contactIds });
  if (res.error) { alert(`${t('err_delete_contacts')} ${res.error}`); return; }

  closeModal('bulk-delete-modal');
  selectedContactIds.clear();
  renderSelectionBar();
  invalidate();
  await loadContacts();
}
