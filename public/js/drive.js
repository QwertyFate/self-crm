// ---- Google Drive folder per contact ----------------------------------------
// contacts.drive_ordner_id holds the folder (set by the engine or pasted by a
// user). The server reads the public ("anyone with the link") folder with the
// Drive API and keeps the files in contact_drive_files; this file shows that
// list on the contact detail and in the deal editor's contact panel, lets the
// user re-sync, and opens Google's own viewer in a popup for previews.
const DRIVE_FOLDER_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const DRIVE_KIND_ICON = { folder: '📁', image: '🖼️', pdf: '📄', doc: '📝', sheet: '📊', slides: '📽️', gdoc: '📝', gsheet: '📊', gslides: '📽️', file: '📎' };
const DRIVE_ERROR_KEYS = { not_public: 'drive_not_public', timeout: 'drive_timeout', upstream: 'drive_upstream', not_configured: 'drive_not_configured' };

// Mirrors utils/google-drive.js: bare id or a Drive folder link -> id, else null.
function parseDriveFolderId(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  if (DRIVE_FOLDER_ID_RE.test(s)) return s;
  let url;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== 'https:' || !/^(drive|docs)\.google\.com$/.test(url.hostname)) return null;
  const m = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^\/(open|folderview|drive\/folderview)$/.test(url.pathname)) {
    const id = url.searchParams.get('id');
    if (id && DRIVE_FOLDER_ID_RE.test(id)) return id;
  }
  return null;
}

function driveFolderUrl(id) { return `https://drive.google.com/drive/folders/${id}`; }
function driveEmbedUrl(id)  { return `https://drive.google.com/embeddedfolderview?id=${id}#list`; }
function driveKindIcon(kind) { return DRIVE_KIND_ICON[kind] || DRIVE_KIND_ICON.file; }
function driveFmtSize(bytes) {
  if (bytes == null || bytes === '' || Number.isNaN(Number(bytes))) return '';
  const n = Number(bytes);
  if (n < 1024)    return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// The status line under the folder row. `res` is the GET/POST response.
function driveStatusText(res) {
  if (!res) return '';
  if (res.sync_error) return t(DRIVE_ERROR_KEYS[res.sync_error] || 'drive_upstream');
  if (res.configured === false) return t('drive_not_configured');
  if (res.synced_at) return `${t('drive_synced_at')} ${typeof fmtDate === 'function' ? fmtDate(res.synced_at) : res.synced_at}`;
  return t('drive_never_synced');
}

// One file row: icon, the full name (wrapped, never truncated), Preview and
// Open. The name comes from Drive: it is HTML-escaped and never placed inside
// an inline JavaScript string; the preview URL and name travel as data
// attributes into the in-page preview popup.
function driveFileRow(f, contactId) {
  const preview = f.previewable && f.preview_url
    ? `<button type="button" class="btn btn-sm btn-primary" data-preview="${esc(f.preview_url)}" data-open="${esc(f.open_url || '')}" data-name="${esc(f.name)}" onclick="openDrivePreview(this)">${esc(t('drive_preview'))}</button>` : '';
  const open = f.open_url
    ? `<a class="btn btn-sm btn-ghost" href="${esc(f.open_url)}" target="_blank" rel="noopener">${esc(t('drive_open'))}</a>` : '';
  return `<div class="drive-file">
    <span class="drive-file-icon">${driveKindIcon(f.kind)}</span>
    <span class="drive-file-name">${esc(f.name)}</span>
    <div class="drive-file-actions">${preview}${open}</div>
  </div>`;
}

// Folder link/id input + Save + Open + Popup, the status line + Sync, and the
// list container (filled by loadDriveFiles). Every URL is built from the
// validated id, never from the raw input.
function driveSectionHtml(contactId, folderId, ctx) {
  const id = parseDriveFolderId(folderId || '');
  const cid = Number(contactId);
  return `<div class="drive-section" id="drive-section-${ctx}-${cid}">
    <div class="drive-folder-row">
      <input type="text" id="drive-folder-${ctx}-${cid}" value="${esc(id ? driveFolderUrl(id) : '')}" placeholder="${esc(t('drive_folder_ph'))}" />
      <button type="button" class="btn btn-sm" onclick="saveDriveFolder(${cid}, '${ctx}')">${esc(t('btn_save'))}</button>
      ${id ? `<a class="btn btn-sm btn-ghost" href="${esc(driveFolderUrl(id))}" target="_blank" rel="noopener">${esc(t('drive_open_folder'))}</a>
      <button type="button" class="btn btn-sm btn-ghost" data-contact="${cid}" onclick="openDriveWindow(this.dataset.contact)">${esc(t('drive_files_window'))}</button>` : ''}
    </div>
    ${id ? `<div class="drive-status-row">
      <span class="drive-status" id="drive-status-${ctx}-${cid}"></span>
      <button type="button" class="btn btn-sm btn-ghost" id="drive-sync-${ctx}-${cid}" onclick="syncDriveFiles(${cid}, '${ctx}')">${esc(t('drive_sync'))}</button>
    </div>
    <div class="drive-files" id="drive-files-${ctx}-${cid}"></div>` : `<p class="drive-hint">${esc(t('drive_no_folder'))}</p>`}
  </div>`;
}

function renderDriveFiles(res, contactId, ctx) {
  const list = document.getElementById(`drive-files-${ctx}-${contactId}`);
  const status = document.getElementById(`drive-status-${ctx}-${contactId}`);
  if (status) status.textContent = driveStatusText(res);
  if (!list) return;
  const files = Array.isArray(res?.files) ? res.files : [];
  list.innerHTML = files.length ? files.map(f => driveFileRow(f, contactId)).join('') : `<p class="drive-hint">${esc(t('drive_empty'))}</p>`;
}

async function loadDriveFiles(contactId, ctx) {
  if (!document.getElementById(`drive-files-${ctx}-${contactId}`)) return;   // no folder: nothing to load
  const res = await api.get(`/api/contacts/${contactId}/drive-files`);
  if (!res || res.error) { renderDriveFiles({ sync_error: 'upstream', files: [] }, contactId, ctx); return; }
  renderDriveFiles(res, contactId, ctx);
}

async function syncDriveFiles(contactId, ctx) {
  const btn = document.getElementById(`drive-sync-${ctx}-${contactId}`);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const res = await api.post(`/api/contacts/${contactId}/drive-sync`, {});
  if (btn) { btn.disabled = false; btn.textContent = t('drive_sync'); }
  if (!res || res.error) { renderDriveFiles({ sync_error: res?.error === 'drive_not_configured' ? 'not_configured' : 'upstream', files: [] }, contactId, ctx); return; }
  renderDriveFiles(res, contactId, ctx);
}

// The files window (public/drive.html): a desktop-style browser for the
// contact's files with the preview inside. One window per contact; an optional
// file id preselects and previews that file. Falls back to a new tab when
// popups are blocked.
function openDriveWindow(contactId, fileId) {
  const cid = Number(contactId);
  if (!Number.isInteger(cid) || cid <= 0) return;
  const fid = fileId && /^[A-Za-z0-9_-]+$/.test(String(fileId)) ? String(fileId) : null;
  const url = `/drive.html?contact=${cid}${fid ? `&file=${fid}` : ''}`;
  const w = window.open(url, `crm-drive-${cid}`, 'popup=yes,width=1200,height=800,resizable=yes,scrollbars=yes');
  if (!w) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click(); }
}
// In-page preview popup (#drive-preview-modal): Google's viewer in an iframe
// over the CRM, no new window or tab. Only Google's preview URLs are framed.
const DRIVE_PREVIEW_URL_RE = /^https:\/\/(drive|docs)\.google\.com\//;
function openDrivePreview(btn) {
  const url = btn?.dataset?.preview;
  if (!url || !DRIVE_PREVIEW_URL_RE.test(url)) return;
  const modal = document.getElementById('drive-preview-modal'), frame = document.getElementById('drive-preview-frame');
  if (!modal || !frame) return;
  document.getElementById('drive-preview-title').textContent = btn.dataset.name || '';
  const open = document.getElementById('drive-preview-open');
  if (open) { const o = btn.dataset.open || ''; if (DRIVE_PREVIEW_URL_RE.test(o)) { open.href = o; open.classList.remove('hidden'); } else { open.classList.add('hidden'); } }
  if (frame.getAttribute('src') !== url) frame.src = url;
  modal.classList.remove('hidden');
}
function closeDrivePreview() {
  const modal = document.getElementById('drive-preview-modal'), frame = document.getElementById('drive-preview-frame');
  if (frame) frame.removeAttribute('src');                // stop the viewer when the popup closes
  if (modal) modal.classList.add('hidden');
}

async function saveDriveFolder(contactId, ctx) {
  const input = document.getElementById(`drive-folder-${ctx}-${contactId}`); if (!input) return;
  const raw = input.value.trim();
  if (raw && !parseDriveFolderId(raw)) { alert(t('drive_invalid')); return; }
  const res = await api.patch(`/api/contacts/${contactId}/drive-folder`, { drive_ordner_id: raw || null });
  if (res.error) { alert(res.error); return; }
  invalidate();
  if (ctx === 'deal') await renderContactPanelReadOnly({ id: contactId });
  else                await openDetail(contactId);
}
