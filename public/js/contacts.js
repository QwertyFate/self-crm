/* ═══════════════════════════════════════════════════════════════════════════
   CONTACTS (and SUPPLIERS) — the table page with columns, filters, inline
   editing, sorting, pagination and bulk selection.

   ONE PAGE, TWO TABS. Contacts and suppliers are the same database table,
   separated by contact_type. The global currentContactType ('contact' |
   'supplier') decides which the page is showing; the sidebar has two links
   pointing at the same <section id="page-contacts">. Labels come from the
   workspace (supplier_name), so never hardcode the word "Supplier" — use
   contactsNoun().

   ENTRY POINT  loadContacts(), called by switchPage('contacts' | 'suppliers').
     loadContacts → GET /api/contacts?contact_type=… → renderContactsTable
                 → renderContactsToolbar → renderPagination

   COLUMNS are a workspace setting (workspaces.contact_columns) merged with the
   workspace's custom fields: effectiveContactColumns() is the single source of
   truth for which columns exist, in what order, and which are visible. Column
   WIDTHS are a per-user preference (users.column_widths) saved by saveColWidths().

   FILTERS live in the global activeFilters map, one entry per column. A filter
   is either a picker (dropdown/date-range) or a text match — filterKind()
   decides which. visibleContacts() applies search + every active filter and is
   the function to read if you want to know what the table is showing.

   INLINE EDITING  double-click a cell → startInlineEdit() swaps in an input →
   commitInlineEdit() PUTs the whole contact back. The row is re-rendered from
   the server response, so a failed save visibly reverts.

   FUNCTION MAP
     load/render     loadContacts, renderContactsTable, renderContactsToolbar,
                     updateContactsPageHeader, updateContactsSubLine,
                     contactsNoun, openContactsMoreMenu
     columns         effectiveContactColumns, openContactsColumnsMenu,
                     loadColWidths, saveColWidths, startColResize, onColResize,
                     stopColResize
     sort            toggleSort, getSortValue, sortContacts
     filter          visibleContacts, filterContacts, filterableColumns,
                     activeFilterKeys, contactsFilterActive, columnValue,
                     filterKind, filterOptionsFor, filterLabelFor,
                     filterValueText, contactsChip, openContactsChip,
                     openContactTextFilter, openAddFilterMenu, addContactFilter,
                     setContactFilter, removeContactFilter, onContactSearch,
                     clearContactFilters, daysSince, inDateRange
     inline edit     startInlineEdit, commitInlineEdit
     pagination      goToPage, renderPagination
     selection       toggleSelectMode, toggleContactSelection, toggleSelectAll,
                     updateBulkDeleteButton, clearContactSelection,
                     openBulkDeleteModal, confirmBulkDelete

   The create/edit form lives in modals.js; the read-only detail panel is built
   at runtime by detail-views.js (openContactDetail).
   ═══════════════════════════════════════════════════════════════════════════ */

let selectedContactIds = new Set();
let selectionModeOn = false;
let filteredContacts = [];

async function loadContacts() {
  selectedContactIds.clear();
  const contactsBody = document.getElementById('contacts-body');
  if (contactsBody) contactsBody.innerHTML = '';

  await Promise.all([ensureFields(), ensureMembers()]);
  contacts = await api.get(`/api/contacts?contact_type=${currentContactType}`);
  currentPage = 1;
  updateContactsPageHeader();
  filterContacts();
}

function updateContactsPageHeader() {
  const isSupplier = currentContactType === 'supplier';
  const name = isSupplier ? (currentWorkspace?.supplier_name || 'Suppliers') : 'Contacts';
  const singular = name.replace(/s$/i, '');
  const h1  = document.querySelector('#page-contacts .page-header h1');
  const btnLabel = document.querySelector('#list-add-btn span');
  if (h1)  h1.textContent = name;
  if (btnLabel) btnLabel.textContent = `Add ${singular}`;
}
function contactsNoun() { return currentContactType === 'supplier' ? (currentWorkspace?.supplier_name || 'Suppliers').toLowerCase() : t('page_contacts').toLowerCase(); }

// Toolbar's more menu: the same CSV import/export the old two buttons called.
function openContactsMoreMenu(anchor) {
  const isSupplier = currentContactType === 'supplier';
  const noun = isSupplier ? (currentWorkspace?.supplier_name || 'Suppliers').toLowerCase() : 'contacts';
  ui.menu(anchor, [
    { label: t('import_csv'), icon: 'upload', onSelect: () => openImportModal() },
    { label: t('export_csv'), icon: 'download', onSelect: () => exportContactsCSV() },
  ], { align: 'right' });
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
      const arrow = isActive ? icon(sortDir === 'asc' ? 'arrow-up' : 'arrow-down', 'ic-sm') : '';
      return `<th data-col-key="${k}" class="sortable-col${isActive ? ' sort-active' : ''}" onclick="toggleSort('${k}')">${label}${arrow}</th>`;
    }).join('')}
  </tr>`;

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageList = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const emptyRow = () => {
    const span = colKeys.length + (selectionModeOn ? 1 : 0), noun = contactsNoun();
    const inner = contactsFilterActive()
      ? `<div class="empty">${icon('search')}<b>${esc(tf('no_contacts_match', { noun }))}</b><div>${esc(t('try_removing_filter'))}</div><div style="margin-top:14px"><button class="btn btn-secondary" type="button" onclick="clearContactFilters()">${esc(t('clear_filters'))}</button></div></div>`
      : `<div class="empty">${icon('contacts')}<b>${esc(tf('no_contacts_yet', { noun }))}</b></div>`;
    return `<tr><td colspan="${span}">${inner}</td></tr>`;
  };
  document.getElementById('contacts-body').innerHTML = pageList.length ? pageList.map(c => {
    const dash  = '<span class="muted-dash">—</span>';
    const cells = visibleCols.map(col => {
      if (col.key === 'company')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'company','text')" title="${esc(c.company||'')}">${esc(c.company||'')||dash}</td>`;
      if (col.key === 'email')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'email','email')" title="${esc(c.email||'')}">${esc(c.email||'')||dash}</td>`;
      if (col.key === 'phone')
        return `<td class="editable-cell" onclick="startInlineEdit(this,${c.id},'phone','phone')" title="${esc(c.phone||'')}">${esc(c.phone||'')||dash}</td>`;
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
        <div class="person">${avatar(c.name)}<div style="min-width:0"><strong class="contact-name-link truncate" title="${esc(c.name)}" onclick="openDetail(${c.id})" style="display:block">${esc(c.name)}</strong><div class="p-sub truncate">${c.company ? esc(c.company) : dash}</div></div>${waHref ? `<a class="btn-wa-inline" href="${waHref}" target="_blank" rel="noopener" title="WhatsApp ${esc(c.name)}" style="margin-left:auto">${WA_SVG}</a>` : ''}</div>
      </td>
      ${cells}
    </tr>`;
  }).join('') : emptyRow();

  renderPagination(sorted.length);

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

function startInlineEdit(td, contactId, fieldKey, fieldType) {
  if (td.querySelector('input,select')) return;
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;
  const originalHTML = td.innerHTML;
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

let contactsSearchTimer = null;

/* ---------- filtering: any column the user has, not a fixed set ----------
   activeFilters = { q, cols: { [columnKey]: value } }. A key present in `cols` means the
   user added that filter; its value may still be null (chip shown, nothing filtered yet).
   For an id column (assigned_to) '' means Unassigned; date columns take a range key. */
const CONTACT_DATE_RANGES = () => [{ value: 'today', label: t('last_today') }, { value: 'week', label: t('last_week') }, { value: 'month', label: t('last_month') }, { value: 'older', label: t('last_older') }, { value: 'never', label: t('last_never') }];

// Everything the user can filter on: the same column set the table draws, minus the name
// column (that is what the search box is for). Custom fields come along automatically.
function filterableColumns() {
  return effectiveContactColumns().filter(c => c.key !== '_name');
}
function activeFilterKeys() { return Object.keys(activeFilters.cols || {}); }
function contactsFilterActive() {
  return !!(activeFilters.q || Object.values(activeFilters.cols || {}).some(v => v != null && String(v).trim() !== ''));
}
function daysSince(ts) {
  if (!ts) return null;
  const day = x => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  return Math.max(0, Math.round((day(Date.now()) - day(ts)) / 864e5));
}
function columnValue(c, key) {
  if (key === 'assigned_to') return c.assigned_to ?? '';
  if (key === 'created_at')  return c.created_at ?? null;
  if (['company', 'email', 'phone'].includes(key)) return c[key] ?? '';
  return c.custom_data?.[key] ?? '';
}
function inDateRange(ts, range) {
  const d = daysSince(ts);
  if (range === 'today') return d === 0;
  if (range === 'week')  return d != null && d <= 7;
  if (range === 'month') return d != null && d <= 30;
  if (range === 'older') return d != null && d > 30;
  if (range === 'never') return d == null;
  return true;
}
function visibleContacts() {
  const q = String(activeFilters.q || '').trim().toLowerCase(), dg = q.replace(/\D/g, ''), cols = activeFilters.cols || {};
  const byKey = Object.fromEntries(filterableColumns().map(c => [c.key, c]));
  return contacts.filter(c => {
    if (q) {
      const hay = [c.name, c.company, c.email, c.phone].map(x => x || '').join(' ').toLowerCase();
      if (!hay.includes(q) && !(dg.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(dg))) return false;
    }
    for (const [key, want] of Object.entries(cols)) {
      if (want == null || want === undefined) continue;             // added, nothing typed or picked yet
      if (byKey[key]?.type === 'date') { if (!inDateRange(columnValue(c, key), want)) return false; continue; }
      if (filterKind(key) === 'text') {
        const needle = String(want).trim().toLowerCase();
        if (needle && !String(columnValue(c, key)).toLowerCase().includes(needle)) return false;
        continue;
      }
      if (String(columnValue(c, key)) !== String(want)) return false;
    }
    return true;
  });
}
// How a column is filtered. A listable set (a dropdown's own options, the team, the date
// ranges) is a menu. Everything else — email, phone, company, a text/number/url custom
// field — is a typed field: picking one email out of a list of every address is no better
// than scrolling the table, so you type part of it instead.
const FILTER_MENU_TYPES = ['dropdown', 'assignee', 'date'];
function filterKind(key) {
  const type = filterableColumns().find(c => c.key === key)?.type;
  return FILTER_MENU_TYPES.includes(type) ? 'menu' : 'text';
}
function filterOptionsFor(key) {
  const col = filterableColumns().find(c => c.key === key), type = col?.type;
  const unassigned = { value: '', label: t('detail_unassigned') };
  if (type === 'assignee') return [unassigned, ...members.map(m => ({ value: m.id, label: m.name + (m.id === currentUser?.id ? ' (you)' : '') }))];
  if (type === 'dropdown') {
    const f = fields.find(x => x.field_key === key);
    return (f?.options || []).map(o => ({ value: o, label: o }));
  }
  if (type === 'date') return CONTACT_DATE_RANGES();
  return [];
}
function filterLabelFor(key) { return filterableColumns().find(c => c.key === key)?.label() || key; }
function filterValueText(key) {
  const v = activeFilters.cols?.[key];
  if (v == null) return '';
  const col = filterableColumns().find(c => c.key === key);
  if (col?.type === 'assignee') return v === '' ? t('detail_unassigned') : (members.find(m => m.id === v)?.name || '');
  if (col?.type === 'date') return CONTACT_DATE_RANGES().find(o => o.value === v)?.label || String(v);
  if (filterKind(key) === 'text') return String(v).trim() ? `"${v}"` : '';
  return v === '' ? t('detail_unassigned') : String(v);
}
function contactsChip(key) {
  const txt = filterValueText(key), on = txt !== '';
  return `<button class="chip ${on ? 'on' : ''}" type="button" data-chip="${esc(key)}" onclick="openContactsChip(this,'${esc(key)}')" aria-haspopup="menu">${esc(filterLabelFor(key))}${on ? ': ' + esc(txt) : ''}${icon('chevron-down', 'ic-sm')}</button>`;
}
function openContactsChip(anchor, key) {
  if (filterKind(key) === 'text') return openContactTextFilter(anchor, key);
  const opts = filterOptionsFor(key), cur = activeFilters.cols?.[key] ?? null;
  ui.menu(anchor, [
    { label: t('filter_all'), checked: cur == null, onSelect: () => setContactFilter(key, null) },
    ...opts.map(o => ({ label: o.label, checked: cur === o.value, onSelect: () => setContactFilter(key, o.value) })),
    { sep: true },
    { label: t('remove_filter'), icon: 'x', danger: true, onSelect: () => removeContactFilter(key) },
  ]);
}
// A small popover holding one input: the table narrows as you type (debounced), so finding
// one email is typing a few characters rather than hunting through every value.
let contactFilterTimer = null;
function openContactTextFilter(anchor, key) {
  const cur = activeFilters.cols?.[key] ?? '';
  const id = 'ctf-' + key.replace(/[^a-z0-9]+/gi, '-');
  const pop = ui.popover(anchor, `<div class="ct-filter-pop">
      <label class="label" for="${id}">${esc(filterLabelFor(key))}</label>
      <input class="input" id="${id}" type="search" value="${esc(cur ?? '')}" placeholder="${esc(t('filter_contains_ph'))}" autocomplete="off" aria-label="${esc(filterLabelFor(key))}">
      <button class="btn btn-ghost btn-sm" type="button" data-rm>${icon('x', 'ic-sm')}${esc(t('remove_filter'))}</button>
    </div>`, { keys: false, width: 260 });
  const input = pop.el.querySelector('input');
  input.focus(); input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('input', () => {
    const v = input.value;
    clearTimeout(contactFilterTimer);
    // Keep the toolbar as it is while typing: re-rendering it would replace this popover's
    // anchor chip and take the caret with it.
    contactFilterTimer = setTimeout(() => {
      activeFilters.cols = { ...(activeFilters.cols || {}), [key]: v };
      currentPage = 1; filterContacts({ skipToolbar: true });
    }, 140);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pop.close(); } });
  pop.el.querySelector('[data-rm]').addEventListener('click', () => { pop.close(); removeContactFilter(key); });
  return pop;
}

// Pick which column to filter on — this is what makes the set of filters follow the user's own columns.
function openAddFilterMenu(anchor) {
  const added = activeFilterKeys();
  ui.menu(anchor, filterableColumns().map(c => ({
    label: c.label(), checked: added.includes(c.key),
    onSelect: () => (added.includes(c.key) ? removeContactFilter(c.key) : addContactFilter(c.key)),
  })), { align: 'right' });
}
function addContactFilter(key) {
  activeFilters.cols = { ...(activeFilters.cols || {}), [key]: filterKind(key) === 'text' ? '' : null };
  renderContactsToolbar();
  const chip = document.querySelector(`#contacts-toolbar [data-chip="${key}"]`);
  if (chip) openContactsChip(chip, key);              // straight into picking a value
}
function setContactFilter(key, value) {
  activeFilters.cols = { ...(activeFilters.cols || {}), [key]: value };
  currentPage = 1; filterContacts();
}
function removeContactFilter(key) {
  const cols = { ...(activeFilters.cols || {}) }; delete cols[key];
  activeFilters.cols = cols; currentPage = 1; filterContacts();
}
function onContactSearch(value) {
  activeFilters.q = value; currentPage = 1;
  clearTimeout(contactsSearchTimer);
  contactsSearchTimer = setTimeout(filterContacts, 140);
}
function clearContactFilters() { activeFilters = {}; currentPage = 1; filterContacts(); }
function openContactsColumnsMenu(anchor) {
  const cols = effectiveContactColumns();
  ui.menu(anchor, cols.map((c, i) => ({ label: c.label(), checked: c.visible, onSelect: async () => {
    cols[i].visible = !cols[i].visible;
    contactColumns = cols.map(({ key, visible }) => ({ key, visible }));
    filterContacts();
    const res = await api.patch('/api/workspace/contact-columns', { columns: contactColumns });
    if (!res?.error && currentWorkspace) currentWorkspace.contact_columns = contactColumns;
  } })), { align: 'right' });
}
function renderContactsToolbar() {
  const el = document.getElementById('contacts-toolbar');
  if (!el) return;
  const active = document.activeElement && document.activeElement.id === 'contact-search';
  const noun = contactsNoun();
  el.innerHTML = `<div class="input-group ct-search">${icon('search')}<input class="input" id="contact-search" type="search" placeholder="${esc(t('search_ph'))}" value="${esc(activeFilters.q || '')}" aria-label="${esc(t('search_ph'))}" oninput="onContactSearch(this.value)"></div>
    ${activeFilterKeys().map(k => contactsChip(k)).join('')}
    <button class="chip" type="button" onclick="openAddFilterMenu(this)" aria-haspopup="menu">${icon('filter')}${esc(t('add_filter'))}</button>
    ${contactsFilterActive() ? `<button class="btn btn-ghost btn-sm" type="button" onclick="clearContactFilters()">${esc(t('clear_filters'))}</button>` : ''}<span class="grow"></span>
    <button class="btn btn-secondary btn-sm" type="button" id="select-mode-btn" onclick="toggleSelectMode()" aria-pressed="${selectionModeOn}">${icon('check')}${esc(t('btn_select'))}</button>
    <button class="btn btn-secondary btn-sm" type="button" onclick="openContactsColumnsMenu(this)" aria-haspopup="menu">${icon('columns')}${esc(t('btn_columns'))}</button>`;
  updateContactsSubLine();
  if (active) { const q = document.getElementById('contact-search'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
function updateContactsSubLine() {
  const sub = document.getElementById('contacts-page-sub');
  if (!sub) return;
  const noun = contactsNoun();
  sub.textContent = contactsFilterActive() ? tf('n_of_items', { a: filteredContacts.length, b: contacts.length, noun }) : tf('n_items', { n: contacts.length, noun });
}

function filterContacts(opts = {}) {
  selectedContactIds.clear();
  const selectAllCb = document.getElementById('select-all-checkbox');
  if (selectAllCb) selectAllCb.checked = false;
  updateBulkDeleteButton();

  filteredContacts = visibleContacts();
  if (opts.skipToolbar) updateContactsSubLine(); else renderContactsToolbar();
  renderContactsTable(filteredContacts);
}

function goToPage(page) { currentPage = page; filterContacts(); }

function renderPagination(total) {
  const el = document.getElementById('contacts-pagination');
  if (!el) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  const start = (currentPage - 1) * PAGE_SIZE + 1, end = Math.min(currentPage * PAGE_SIZE, total);
  const pages = buildPageNumbers(currentPage, totalPages);
  el.innerHTML = `
    <div class="table-foot" style="margin-top:-1px;border:1px solid var(--border);border-top:0">
      <span class="tnum">Showing ${start}–${end} of ${total}</span>
      <nav class="ct-pg" aria-label="Pagination">
        <button type="button" onclick="goToPage(${currentPage-1})" aria-label="Previous page" ${currentPage===1?'disabled':''}><span class="ct-flip">${icon('chevron-right')}</span></button>
        ${pages.map(p => p === '…'
          ? '<span class="gap" aria-hidden="true">…</span>'
          : `<button type="button" onclick="goToPage(${p})" ${p===currentPage?'aria-current="page"':''}>${p}</button>`
        ).join('')}
        <button type="button" onclick="goToPage(${currentPage+1})" aria-label="Next page" ${currentPage===totalPages?'disabled':''}>${icon('chevron-right')}</button>
      </nav>
    </div>`;
}

function toggleSelectMode() {
  selectionModeOn = !selectionModeOn;
  if (!selectionModeOn) {
    selectedContactIds.clear();
    updateBulkDeleteButton();
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) selectAllCb.checked = false;
  }
  filterContacts();
}

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
    const sorted = sortContacts(filteredContacts);
    sorted.forEach(c => selectedContactIds.add(c.id));
  }
  document.querySelectorAll('.contact-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  const selectAllCb = document.getElementById('select-all-checkbox');
  if (selectAllCb) selectAllCb.checked = isChecked;
  updateBulkDeleteButton();
}

function updateBulkDeleteButton() {
  const el = document.getElementById('contacts-bulkbar');
  if (!el) return;
  const n = selectedContactIds.size;
  el.innerHTML = n ? `<div class="bulkbar" role="toolbar" aria-label="Bulk actions"><b>${n} selected</b><button class="btn btn-sm" type="button" onclick="openBulkDeleteModal()">${t('btn_delete')}</button><button class="btn btn-sm" type="button" style="margin-left:auto" onclick="clearContactSelection()">Clear selection</button></div>` : '';
}

function clearContactSelection() {
  selectedContactIds.clear();
  document.querySelectorAll('.contact-checkbox').forEach(cb => { cb.checked = false; });
  const selectAllCb = document.getElementById('select-all-checkbox');
  if (selectAllCb) selectAllCb.checked = false;
  updateBulkDeleteButton();
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
