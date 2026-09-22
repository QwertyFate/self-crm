// ---- Drive files window (public/drive.html) ---------------------------------
// A desktop-style browser for one contact's Drive files, opened by the CRM in
// its own window (public/js/drive.js openDriveWindow): the files as icon
// tiles, a search box, a Sync button and a preview pane that frames Google's
// own viewer for the selected file. Same origin as the CRM, so the session
// cookie, the theme and the language carry over. The helpers above the DOM
// code are pure and unit-tested; nothing from Drive ever lands in inline JS.

const DW_I18N = {
  en: {
    title: 'Files', search_ph: 'Search files…', sync: 'Sync', open_folder: 'Open folder ↗', open_in_drive: 'Open in Drive ↗', close: 'Close',
    view_icons: 'Icons', view_list: 'List', items: 'items',
    select_hint: 'Select a file to preview it. Double-click or press Enter to open the preview.',
    preview_none: 'No preview for this file type — open it in Drive.', preview_folder: 'Sub-folder — open it in Drive.',
    empty_title: 'No files', empty_hint: 'This folder is empty, or it has not been synced yet.',
    no_folder_title: 'No Drive folder', no_folder_hint: 'This contact has no Drive folder linked.',
    login_title: 'Not signed in', login_hint: 'Please log in to the CRM first, then open this window again.', go_crm: 'Open the CRM',
    not_found_title: 'Not found', not_found_hint: 'This contact does not exist in your workspace.',
    synced_at: 'Synced', not_synced: 'Not synced yet.',
    not_configured: 'File sync is off: the server has no GOOGLE_API_KEY.',
    not_public: 'Folder not found or not shared as "Anyone with the link".',
    timeout: 'Google Drive did not answer in time. Try Sync again.', upstream: 'Google Drive returned an error. Try Sync again.',
    kind_folder: 'Folder', kind_image: 'Image', kind_pdf: 'PDF', kind_doc: 'Word document', kind_sheet: 'Excel sheet', kind_slides: 'PowerPoint',
    kind_gdoc: 'Google Doc', kind_gsheet: 'Google Sheet', kind_gslides: 'Google Slides', kind_file: 'File',
  },
  de: {
    title: 'Dateien', search_ph: 'Dateien suchen…', sync: 'Synchronisieren', open_folder: 'Ordner öffnen ↗', open_in_drive: 'In Drive öffnen ↗', close: 'Schließen',
    view_icons: 'Symbole', view_list: 'Liste', items: 'Einträge',
    select_hint: 'Datei auswählen, um die Vorschau zu sehen. Doppelklick oder Enter öffnet die Vorschau.',
    preview_none: 'Keine Vorschau für diesen Dateityp – in Drive öffnen.', preview_folder: 'Unterordner – in Drive öffnen.',
    empty_title: 'Keine Dateien', empty_hint: 'Dieser Ordner ist leer oder noch nicht synchronisiert.',
    no_folder_title: 'Kein Drive-Ordner', no_folder_hint: 'Mit diesem Kontakt ist kein Drive-Ordner verknüpft.',
    login_title: 'Nicht angemeldet', login_hint: 'Bitte zuerst im CRM anmelden und dieses Fenster erneut öffnen.', go_crm: 'CRM öffnen',
    not_found_title: 'Nicht gefunden', not_found_hint: 'Dieser Kontakt existiert in deinem Workspace nicht.',
    synced_at: 'Synchronisiert', not_synced: 'Noch nicht synchronisiert.',
    not_configured: 'Dateisynchronisierung aus: Auf dem Server fehlt GOOGLE_API_KEY.',
    not_public: 'Ordner nicht gefunden oder nicht als „Jeder mit dem Link“ freigegeben.',
    timeout: 'Google Drive hat nicht rechtzeitig geantwortet. Bitte erneut synchronisieren.', upstream: 'Google Drive hat einen Fehler gemeldet. Bitte erneut synchronisieren.',
    kind_folder: 'Ordner', kind_image: 'Bild', kind_pdf: 'PDF', kind_doc: 'Word-Dokument', kind_sheet: 'Excel-Tabelle', kind_slides: 'PowerPoint',
    kind_gdoc: 'Google Doc', kind_gsheet: 'Google Sheet', kind_gslides: 'Google Slides', kind_file: 'Datei',
  },
};
const DW_KIND_ICON = { folder: '📁', image: '🖼️', pdf: '📄', doc: '📝', sheet: '📊', slides: '📽️', gdoc: '📝', gsheet: '📊', gslides: '📽️', file: '📎' };
const DW_ERROR_KEYS = { not_public: 'not_public', timeout: 'timeout', upstream: 'upstream', not_configured: 'not_configured' };

function dwLang() { try { return localStorage.getItem('lang') === 'de' ? 'de' : 'en'; } catch { return 'en'; } }
function dwT(key) { return (DW_I18N[dwLang()] || DW_I18N.en)[key] ?? DW_I18N.en[key] ?? key; }
function dwEsc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ?contact=<positive int>&file=<Drive id> — anything else is ignored.
function dwParams(search) {
  const p = new URLSearchParams(search || '');
  const c = Number(p.get('contact'));
  const f = p.get('file');
  return { contact: Number.isInteger(c) && c > 0 ? c : null, file: f && /^[A-Za-z0-9_-]+$/.test(f) ? f : null };
}

// Folders first, then by name (case-insensitive) or newest change; optional name search. No mutation.
function dwFilterSort(files, q, { sort = 'name' } = {}) {
  const needle = String(q ?? '').trim().toLowerCase();
  return (Array.isArray(files) ? files : [])
    .filter(f => !needle || String(f.name ?? '').toLowerCase().includes(needle))
    .slice()
    .sort((a, b) => {
      if (!!a.is_folder !== !!b.is_folder) return a.is_folder ? -1 : 1;
      if (sort === 'date') return new Date(b.modified_at || 0) - new Date(a.modified_at || 0);
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' });
    });
}

function dwFmtSize(bytes) {
  if (bytes == null || bytes === '' || Number.isNaN(Number(bytes))) return '';
  const n = Number(bytes);
  if (n < 1024)    return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
function dwFmtDate(d) {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString(dwLang() === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// One icon tile: icon + the full name (wrapped, never truncated). Only the
// validated id goes into a data attribute; the name is escaped text.
function dwTile(f, selected) {
  const id = /^[A-Za-z0-9_-]+$/.test(String(f.id ?? '')) ? String(f.id) : '';
  return `<div class="dw-tile${selected ? ' selected' : ''}" role="option" tabindex="0" aria-selected="${selected ? 'true' : 'false'}" data-id="${id}">
    <div class="dw-tile-icon">${DW_KIND_ICON[f.kind] || DW_KIND_ICON.file}</div>
    <div class="dw-tile-name">${dwEsc(f.name)}</div>
  </div>`;
}

function dwStatusText(res) {
  if (!res) return '';
  if (res.sync_error) return dwT(DW_ERROR_KEYS[res.sync_error] || 'upstream');
  if (res.configured === false) return dwT('not_configured');
  if (res.synced_at) return `${dwT('synced_at')} ${dwFmtDate(res.synced_at)}`;
  return dwT('not_synced');
}

// The iframe source: Google's preview page only, never anything else.
function dwPreviewSrc(f) {
  const u = f && f.previewable ? f.preview_url : null;
  return u && /^https:\/\/(drive|docs)\.google\.com\//.test(String(u)) ? String(u) : null;
}

// ---- DOM ---------------------------------------------------------------------
const dwState = { contactId: null, res: null, files: [], selectedId: null, q: '', view: 'icons', name: '' };
const dwEl = id => document.getElementById(id);

async function dwApi(url, opts) {
  try {
    const r = await fetch(url, opts);
    if (r.status === 401) return { error: 'unauthorized', status: 401 };
    const text = await r.text();
    try { return { ...JSON.parse(text), status: r.status }; } catch { return { error: `Server error (${r.status})`, status: r.status }; }
  } catch { return { error: 'network' }; }
}

function dwApplyI18n() {
  dwEl('dw-search').placeholder = dwT('search_ph');
  dwEl('dw-sync').textContent = dwT('sync');
  dwEl('dw-open-drive').textContent = dwT('open_folder');
  dwEl('dw-view-icons').textContent = dwT('view_icons');
  dwEl('dw-view-list').textContent = dwT('view_list');
  dwEl('dw-preview-open').textContent = dwT('open_in_drive');
  dwEl('dw-preview-close').textContent = dwT('close');
  dwEl('dw-empty-link').textContent = dwT('go_crm');
  dwEl('dw-preview-hint').textContent = dwT('select_hint');
}

function dwShowEmpty(titleKey, hintKey, { login = false } = {}) {
  dwEl('dw-grid').innerHTML = '';
  dwEl('dw-empty').classList.remove('hidden');
  dwEl('dw-empty-title').textContent = dwT(titleKey);
  dwEl('dw-empty-hint').textContent = dwT(hintKey);
  dwEl('dw-empty-link').classList.toggle('hidden', !login);
}

function dwRender() {
  const grid = dwEl('dw-grid');
  const files = dwFilterSort(dwState.files, dwState.q);
  dwEl('dw-status').textContent = dwStatusText(dwState.res) + (dwState.files.length ? ` · ${dwState.files.length} ${dwT('items')}` : '');
  if (!files.length) { dwShowEmpty('empty_title', 'empty_hint'); return; }
  dwEl('dw-empty').classList.add('hidden');
  grid.className = `dw-grid${dwState.view === 'list' ? ' list' : ''}`;
  grid.innerHTML = files.map(f => dwTile(f, f.id === dwState.selectedId)).join('');
}

function dwFileById(id) { return dwState.files.find(f => f.id === id) || null; }

function dwSelect(id, { preview = false } = {}) {
  const f = dwFileById(id); if (!f) return;
  dwState.selectedId = id;
  dwEl('dw-grid').querySelectorAll('.dw-tile').forEach(el => { const on = el.dataset.id === id; el.classList.toggle('selected', on); el.setAttribute('aria-selected', on ? 'true' : 'false'); });
  dwEl('dw-preview-name').textContent = f.name;
  dwEl('dw-preview-meta').textContent = dwT(`kind_${f.kind}`) || dwT('kind_file');   // kind only: no sizes or dates in the files view
  const open = dwEl('dw-preview-open');
  if (f.open_url && /^https:\/\/(drive|docs)\.google\.com\//.test(f.open_url)) { open.href = f.open_url; open.classList.remove('hidden'); } else { open.classList.add('hidden'); }
  if (preview) dwPreview(f); else dwClosePreview(f);
}

function dwPreview(f) {
  const frame = dwEl('dw-frame'), hint = dwEl('dw-preview-hint');
  const src = dwPreviewSrc(f);
  dwEl('dw-preview-close').classList.toggle('hidden', !src);
  if (!src) { frame.classList.add('hidden'); frame.removeAttribute('src'); hint.textContent = dwT(f.is_folder ? 'preview_folder' : 'preview_none'); hint.classList.remove('hidden'); return; }
  hint.classList.add('hidden');
  if (frame.getAttribute('src') !== src) frame.src = src;
  frame.classList.remove('hidden');
}

function dwClosePreview(f) {
  const frame = dwEl('dw-frame'), hint = dwEl('dw-preview-hint');
  frame.classList.add('hidden'); frame.removeAttribute('src');
  dwEl('dw-preview-close').classList.add('hidden');
  hint.textContent = f ? (dwPreviewSrc(f) ? dwT('select_hint') : dwT(f.is_folder ? 'preview_folder' : 'preview_none')) : dwT('select_hint');
  hint.classList.remove('hidden');
}

async function dwLoad({ fileToOpen = null } = {}) {
  const res = await dwApi(`/api/contacts/${dwState.contactId}/drive-files`);
  if (res.error === 'unauthorized') { dwShowEmpty('login_title', 'login_hint', { login: true }); return; }
  if (res.status === 404) { dwShowEmpty('not_found_title', 'not_found_hint'); return; }
  if (res.error) { dwState.res = { sync_error: 'upstream' }; dwState.files = []; dwRender(); return; }
  dwState.res = res; dwState.files = Array.isArray(res.files) ? res.files : [];
  const open = dwEl('dw-open-drive');
  if (res.folder_url) { open.href = res.folder_url; open.classList.remove('hidden'); } else { open.classList.add('hidden'); }
  if (!res.folder_id) { dwShowEmpty('no_folder_title', 'no_folder_hint'); dwEl('dw-status').textContent = ''; return; }
  dwRender();
  if (fileToOpen && dwFileById(fileToOpen)) dwSelect(fileToOpen, { preview: true });
}

async function dwSync() {
  const btn = dwEl('dw-sync'); btn.disabled = true; btn.textContent = '…';
  const res = await dwApi(`/api/contacts/${dwState.contactId}/drive-sync`, { method: 'POST' });
  btn.disabled = false; btn.textContent = dwT('sync');
  if (res.error === 'unauthorized') { dwShowEmpty('login_title', 'login_hint', { login: true }); return; }
  if (res.error) { dwState.res = { ...(dwState.res || {}), sync_error: res.error === 'drive_not_configured' ? 'not_configured' : 'upstream' }; dwRender(); return; }
  dwState.res = res; dwState.files = Array.isArray(res.files) ? res.files : [];
  dwRender();
  if (dwState.selectedId && dwFileById(dwState.selectedId)) dwSelect(dwState.selectedId);
}

async function dwLoadName() {
  const c = await dwApi(`/api/contacts/${dwState.contactId}`);
  dwState.name = c && !c.error && c.name ? String(c.name) : '';
  const title = dwState.name ? `${dwT('title')} – ${dwState.name}` : dwT('title');
  dwEl('dw-title').textContent = title; document.title = title;
}

function dwMoveSelection(delta) {
  const tiles = [...dwEl('dw-grid').querySelectorAll('.dw-tile')]; if (!tiles.length) return;
  const i = Math.max(0, tiles.findIndex(t => t.dataset.id === dwState.selectedId));
  const next = tiles[Math.min(tiles.length - 1, Math.max(0, i + delta))];
  if (next) { dwSelect(next.dataset.id); next.focus(); }
}

function dwInit() {
  try { if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); } catch {}
  document.documentElement.lang = dwLang();
  dwApplyI18n();
  const { contact, file } = dwParams(location.search);
  if (!contact) { dwShowEmpty('not_found_title', 'not_found_hint'); return; }
  dwState.contactId = contact;

  const grid = dwEl('dw-grid');
  grid.addEventListener('click',    e => { const t = e.target.closest('.dw-tile'); if (t) dwSelect(t.dataset.id); });
  grid.addEventListener('dblclick', e => { const t = e.target.closest('.dw-tile'); if (t) dwSelect(t.dataset.id, { preview: true }); });
  grid.addEventListener('keydown',  e => {
    const t = e.target.closest('.dw-tile'); if (!t) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dwSelect(t.dataset.id, { preview: true }); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); dwMoveSelection(1); }
    else if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); dwMoveSelection(-1); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') dwClosePreview(dwFileById(dwState.selectedId)); });
  dwEl('dw-preview-close').addEventListener('click', () => dwClosePreview(dwFileById(dwState.selectedId)));
  dwEl('dw-search').addEventListener('input', e => { dwState.q = e.target.value; dwRender(); });
  dwEl('dw-sync').addEventListener('click', dwSync);
  dwEl('dw-view-icons').addEventListener('click', () => { dwState.view = 'icons'; dwEl('dw-view-icons').classList.add('active'); dwEl('dw-view-list').classList.remove('active'); dwRender(); });
  dwEl('dw-view-list').addEventListener('click',  () => { dwState.view = 'list';  dwEl('dw-view-list').classList.add('active');  dwEl('dw-view-icons').classList.remove('active'); dwRender(); });

  dwLoadName();
  dwLoad({ fileToOpen: file });
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', dwInit);
