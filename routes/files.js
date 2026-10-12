/* ═══════════════════════════════════════════════════════════════════════════
   /files — serves what the LOCAL storage backend keeps under data/files
   (storage.js). With Supabase configured nothing is stored here and every
   path answers 404.

   TWO DIFFERENT GATES, on purpose — which is why this router has no
   `router.use(requireAuth)`:

     GET /files/documents/<storagePath>?exp=&sig=
         A contact document. NO SESSION: the link is the proof. It is the
         302 target of /api/contacts/:id/documents/:id/download (browser) and
         /api/dokumente/:id/download (the Engine, which has an API key and no
         cookie). storage.verifySignedDocument checks the HMAC and the expiry;
         the row is then looked up by storage_path for the real file name and
         type. A bad or expired link is 403; a path that is not a stored
         document is 404.

     GET /files/task-attachments/<storagePath>
         A task attachment. SESSION required, and the first path segment —
         the workspace the file was uploaded in — must be the caller's
         workspace; anything else is 404, never 403 (nothing is enumerable
         across workspaces). This is the publicUrl stored in
         task_attachments.file_url by the local backend.

   The storage path is validated twice: storage.isSafeStoragePath on the raw
   URL segment and the resolved-inside-its-folder check in storage.localPath.
   A traversal attempt is therefore a 404, never a file.
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const fs          = require('fs');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const storage     = require('../storage');

const notFound = res => res.status(404).json({ error: 'Not found' });

// RFC 6266: an ASCII fallback plus the UTF-8 form, so umlauts in a file name survive every browser.
function contentDisposition(fileName) {
  const name  = String(fileName || 'file');
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function sendLocalFile(res, abs, { fileName, fileType } = {}) {
  if (!fs.existsSync(abs)) return notFound(res);
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (fileName) res.set('Content-Disposition', contentDisposition(fileName));
  if (fileType) res.type(fileType);          // else `send` picks one from the extension
  res.sendFile(abs);
}

// Signed, sessionless — see the header.
router.get('/documents/*', async (req, res, next) => {
  try {
    if (storage.BACKEND !== 'local') return notFound(res);
    const storagePath = req.params[0];
    if (!storage.isSafeStoragePath(storagePath)) return notFound(res);
    if (!storage.verifySignedDocument(storagePath, req.query.exp, req.query.sig)) {
      return res.status(403).json({ error: 'This download link is invalid or has expired' });
    }
    const { rows: [d] } = await pool.query('SELECT file_name, file_type FROM contact_documents WHERE storage_path=$1', [storagePath]);
    if (!d) return notFound(res);
    let abs; try { abs = storage.localDocumentPath(storagePath); } catch { return notFound(res); }
    sendLocalFile(res, abs, { fileName: d.file_name, fileType: d.file_type });
  } catch (e) { next(e); }
});

// Session + same workspace — see the header.
router.get('/task-attachments/*', requireAuth, async (req, res, next) => {
  try {
    if (storage.BACKEND !== 'local') return notFound(res);
    const storagePath = req.params[0];
    if (!storage.isSafeStoragePath(storagePath)) return notFound(res);
    if (storagePath.split('/')[0] !== String(req.workspaceId)) return notFound(res);
    const { rows: [a] } = await pool.query(
      'SELECT file_name, file_type FROM task_attachments WHERE storage_path=$1 AND workspace_id=$2', [storagePath, req.workspaceId]
    );
    if (!a) return notFound(res);
    let abs; try { abs = storage.localAttachmentPath(storagePath); } catch { return notFound(res); }
    sendLocalFile(res, abs, { fileName: a.file_name, fileType: a.file_type });
  } catch (e) { next(e); }
});

module.exports = router;
