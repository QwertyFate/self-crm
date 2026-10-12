/* ═══════════════════════════════════════════════════════════════════════════
   FILE STORAGE — task attachments and contact documents. Two backends, picked
   once at boot:

     local     DEFAULT. No configuration. Files live under data/files/
               (embedded.js → FILES_DIR):
                 data/files/task-attachments/<workspaceId>/<taskId>/<ts>-<name>
                 data/files/contact-documents/<workspaceId>/<contactId>/<ts>-<name>
               They are served by routes/files.js: attachments behind the
               session (same workspace only), documents through a SIGNED link
               that expires — an HMAC over path + expiry with the key from
               data/secrets.json. Nothing in data/files is reachable without
               one of those two.
     supabase  when SUPABASE_URL and SUPABASE_SERVICE_KEY are both set. Two
               buckets: "task-attachments" (public — anyone with the link can
               read, no CRM session) and a PRIVATE one for contact documents,
               reached only through Supabase's own signed URLs. Create the
               private bucket in Supabase; SUPABASE_DOCS_BUCKET renames it
               (default "contact-documents").

   THE INTERFACE IS THE SAME for both: uploadFile/deleteFile (attachments),
   uploadDocument/deleteDocument/signedDocumentUrl (documents). The routes
   never know which backend is active. storagePath is what rows store; it is
   <workspaceId>/<ownerId>/<timestamp>-<name> in both backends, every segment
   restricted to [A-Za-z0-9._-] so it can never leave its folder locally.
   The workspace prefix keeps one tenant's files out of another's, and the
   timestamp means two uploads of the same filename never collide. The file
   TYPE is not restricted; the routes cap the size at 10 MB.
   ═══════════════════════════════════════════════════════════════════════════ */

const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const embedded = require('./embedded');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET       = 'task-attachments';
const DOCS_BUCKET  = process.env.SUPABASE_DOCS_BUCKET || 'contact-documents';
const BACKEND      = SUPABASE_URL && SUPABASE_KEY ? 'supabase' : 'local';

// ── Shared ───────────────────────────────────────────────────────────────────
// One path segment: [A-Za-z0-9._-], never empty, never only dots (so never "." or "..").
function safeSegment(v) {
  const s = String(v ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  return /^\.*$/.test(s) ? '_' : s;
}
const safeName = safeSegment;
const storagePathFor = (workspaceId, ownerId, originalName) =>
  `${safeSegment(workspaceId)}/${safeSegment(ownerId)}/${Date.now()}-${safeName(originalName)}`;

// True only for the exact shape uploads produce: <workspaceId>/<ownerId>/<file> — three safe
// segments. routes/files.js reads the workspace from the first one, so anything else is refused.
function isSafeStoragePath(p) {
  if (typeof p !== 'string' || !p) return false;
  const segs = p.split('/');
  return segs.length === 3 && segs.every(seg => seg && /^[A-Za-z0-9._-]+$/.test(seg) && !/^\.*$/.test(seg));
}

// ── Local backend ────────────────────────────────────────────────────────────
const LOCAL_DIRS = {
  attachments: path.join(embedded.FILES_DIR, 'task-attachments'),
  documents:   path.join(embedded.FILES_DIR, 'contact-documents'),
};

// Absolute path of a stored file, or a throw — it must be a safe path AND resolve inside its folder.
function localPath(kind, storagePath) {
  if (!isSafeStoragePath(storagePath)) throw Object.assign(new Error('Invalid storage path'), { code: 'BAD_STORAGE_PATH' });
  const base = LOCAL_DIRS[kind];
  const abs  = path.resolve(base, ...storagePath.split('/'));
  if (!abs.startsWith(base + path.sep)) throw Object.assign(new Error('Invalid storage path'), { code: 'BAD_STORAGE_PATH' });
  return abs;
}
const localAttachmentPath = p => localPath('attachments', p);
const localDocumentPath   = p => localPath('documents', p);

async function localWrite(kind, storagePath, buffer) {
  const abs = localPath(kind, storagePath);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, buffer, { flag: 'wx' });   // never overwrite: the timestamp makes a collision an error, as upsert:false did
}
async function localRemove(kind, storagePath) {
  let abs; try { abs = localPath(kind, storagePath); } catch { return; }
  try { await fs.promises.unlink(abs); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

// Signed document links: HMAC-SHA256 over "<storagePath>\n<exp>" with the generated file key.
const sign = (storagePath, exp) => crypto.createHmac('sha256', embedded.fileKey()).update(`${storagePath}\n${exp}`).digest('base64url');

// routes/files.js calls this for every GET /files/documents/… — false for a bad or expired link.
function verifySignedDocument(storagePath, exp, sig) {
  if (!isSafeStoragePath(storagePath)) return false;
  const e = Number(exp);
  if (!Number.isInteger(e) || e < Math.floor(Date.now() / 1000)) return false;
  if (typeof sig !== 'string' || !sig) return false;
  const expected = sign(storagePath, e);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Supabase backend ─────────────────────────────────────────────────────────
let supabaseClient = null;
function getClient() {
  if (BACKEND !== 'supabase') return null;
  if (!supabaseClient) {
    const { createClient } = require('@supabase/supabase-js');   // lazy: the local backend never loads it
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}

// ── Task attachments ─────────────────────────────────────────────────────────
async function uploadFile(workspaceId, taskId, buffer, originalName, mimeType) {
  const storagePath = storagePathFor(workspaceId, taskId, originalName);
  if (BACKEND === 'local') {
    await localWrite('attachments', storagePath, buffer);
    return { publicUrl: `/files/task-attachments/${storagePath}`, storagePath };
  }
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return { publicUrl, storagePath };
}

async function deleteFile(storagePath) {
  if (BACKEND === 'local') return localRemove('attachments', storagePath);
  await getClient().storage.from(BUCKET).remove([storagePath]);
}

// ── Contact documents (private; signed links only) ───────────────────────────
async function uploadDocument(workspaceId, contactId, buffer, originalName, mimeType) {
  const storagePath = storagePathFor(workspaceId, contactId, originalName);
  if (BACKEND === 'local') {
    await localWrite('documents', storagePath, buffer);
    return { storagePath };
  }
  const { error } = await getClient().storage.from(DOCS_BUCKET).upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
  return { storagePath };
}

async function deleteDocument(storagePath) {
  if (BACKEND === 'local') return localRemove('documents', storagePath);
  await getClient().storage.from(DOCS_BUCKET).remove([storagePath]);
}

// A link that works for `expiresSec` seconds (default 10 minutes), then dies. Local: a
// root-relative URL on this CRM (routes/files.js) — browsers and HTTP clients resolve the
// 302 Location against the origin they called. Supabase: its absolute signed URL.
async function signedDocumentUrl(storagePath, expiresSec = 600) {
  if (BACKEND === 'local') {
    if (!isSafeStoragePath(storagePath)) throw new Error('Invalid storage path');
    const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresSec));
    return `/files/documents/${storagePath}?exp=${exp}&sig=${sign(storagePath, exp)}`;
  }
  const { data, error } = await getClient().storage.from(DOCS_BUCKET).createSignedUrl(storagePath, expiresSec);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not sign the document URL');
  return data.signedUrl;
}

module.exports = {
  uploadFile, deleteFile, uploadDocument, deleteDocument, signedDocumentUrl, DOCS_BUCKET,
  // local backend, for routes/files.js and tests
  BACKEND, LOCAL_DIRS, isSafeStoragePath, localAttachmentPath, localDocumentPath, verifySignedDocument,
};
