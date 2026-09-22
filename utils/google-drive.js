/**
 * Google Drive — the per-contact onboarding folder.
 *
 * Folders are shared "anyone with the link" (product decision), so the Drive
 * API v3 files.list call needs only an API key (GOOGLE_API_KEY): it identifies
 * the app for quota, grants no access of its own, and works for folders owned
 * by any Google account. The key is sent as a query parameter to
 * googleapis.com and never logged or returned. fetch/clock are injectable
 * (like utils/engine-webhook.js) so the unit tests run without the network.
 *
 * Previews are not proxied: the browser opens Google's own viewer in a popup
 * (public/js/drive.js) from the URLs describeFile() builds.
 */
const API          = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const FILE_ID_RE   = /^[A-Za-z0-9_-]+$/;
const FOLDER_MIME  = 'application/vnd.google-apps.folder';
const FIELDS       = 'nextPageToken,files(id,name,mimeType,size,modifiedTime)';

// Google-native types: preview and edit live on docs.google.com.
const GOOGLE_KINDS = {
  'application/vnd.google-apps.document':     ['gdoc',    'document'],
  'application/vnd.google-apps.spreadsheet':  ['gsheet',  'spreadsheets'],
  'application/vnd.google-apps.presentation': ['gslides', 'presentation'],
};
// Office types Google's viewer renders.
const OFFICE_KINDS = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':   'doc',
  'application/msword':                                                        'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':         'sheet',
  'application/vnd.ms-excel':                                                  'sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
  'application/vnd.ms-powerpoint':                                             'slides',
};
const PREVIEWABLE = new Set(['image', 'pdf', 'doc', 'sheet', 'slides', 'gdoc', 'gsheet', 'gslides']);

// A bare id, or any of the folder link shapes Drive hands out. Anything else -> null.
function parseDriveFolderId(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  if (FOLDER_ID_RE.test(s)) return s;
  let url;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== 'https:' || !/^(drive|docs)\.google\.com$/.test(url.hostname)) return null;
  const m = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^\/(open|folderview|drive\/folderview)$/.test(url.pathname)) {
    const id = url.searchParams.get('id');
    if (id && FOLDER_ID_RE.test(id)) return id;
  }
  return null;
}

const folderUrl = id => `https://drive.google.com/drive/folders/${id}`;
const embedUrl  = id => `https://drive.google.com/embeddedfolderview?id=${id}#list`;

function fileKind(mime) {
  if (mime === FOLDER_MIME) return 'folder';
  if (GOOGLE_KINDS[mime]) return GOOGLE_KINDS[mime][0];
  if (typeof mime === 'string' && mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return OFFICE_KINDS[mime] || 'file';
}

// One file -> the shape the UI renders. Accepts Google's shape (id, mimeType,
// modifiedTime) and our table row (file_id, mime_type, modified_at). URLs are
// built only from a validated id, never from anything Google sends as a link.
function describeFile(f = {}) {
  const rawId = f.file_id ?? f.id;
  const id    = FILE_ID_RE.test(String(rawId ?? '')) ? String(rawId) : null;
  const mime  = f.mime_type ?? f.mimeType ?? null;
  const kind  = fileKind(mime);
  let preview_url = null, open_url = null;
  if (id) {
    if (kind === 'folder') {
      open_url = folderUrl(id);
    } else if (GOOGLE_KINDS[mime]) {
      const app = GOOGLE_KINDS[mime][1];
      preview_url = `https://docs.google.com/${app}/d/${id}/preview`;
      open_url    = `https://docs.google.com/${app}/d/${id}/edit`;
    } else {
      open_url = `https://drive.google.com/file/d/${id}/view`;
      if (PREVIEWABLE.has(kind)) preview_url = `https://drive.google.com/file/d/${id}/preview`;
    }
  }
  const sizeRaw = f.size;
  return {
    id, name: String(f.name ?? ''), mime_type: mime,
    size: sizeRaw != null && sizeRaw !== '' && !Number.isNaN(Number(sizeRaw)) ? Number(sizeRaw) : null,
    modified_at: f.modified_at ?? f.modifiedTime ?? null,
    kind, is_folder: kind === 'folder', previewable: !!preview_url, preview_url, open_url,
  };
}

class DriveError extends Error {
  constructor(code, status) { super(`drive_${code}`); this.code = code; this.status = status ?? null; }
}

function createDriveClient({ apiKey = '', fetch = (...a) => globalThis.fetch(...a), now = Date.now, ttlMs = 60_000, timeoutMs = 10_000, maxPages = 10 } = {}) {
  const cache = new Map();                           // folderId -> { until, files }
  const configured = !!apiKey;

  // Every top-level entry of the folder (files and sub-folders), raw Google shape.
  async function listFolder(folderId) {
    if (!configured) throw new DriveError('not_configured');
    if (!FOLDER_ID_RE.test(String(folderId ?? ''))) throw new DriveError('invalid_folder');
    const hit = cache.get(folderId);
    if (hit && hit.until > now()) return hit.files;

    const files = [];
    let pageToken = null;
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: FIELDS, orderBy: 'folder,name', pageSize: '200',
        supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
        key: apiKey,
      });
      if (pageToken) params.set('pageToken', pageToken);
      let res;
      try {
        res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        throw new DriveError(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'upstream');
      }
      if (res.status === 404) throw new DriveError('not_public', 404);   // unknown folder, or not shared by link
      if (!res.ok)            throw new DriveError('upstream', res.status);
      const data = await res.json();
      files.push(...(Array.isArray(data.files) ? data.files : []));
      pageToken = data.nextPageToken || null;
      if (!pageToken) break;
    }
    cache.set(folderId, { until: now() + ttlMs, files });
    return files;
  }

  return { listFolder, configured };
}

module.exports = { parseDriveFolderId, folderUrl, embedUrl, fileKind, describeFile, createDriveClient, DriveError, FOLDER_MIME };
