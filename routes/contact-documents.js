/* ═══════════════════════════════════════════════════════════════════════════
   /api/contacts/:contactId/documents — files on a customer (contracts, call
   recordings, anything else). Briefing §5.2 "dokumente" / §5.1 dokument.hinzugefuegt.

   MOUNTED ON THE SAME PREFIX AS routes/contacts.js, after it. contacts.js only
   declares one-segment /:id paths and the literal /bulk/delete, so these two-
   and three-segment paths fall through to here (same trick as task-attachments).

   STORAGE  multer keeps the file in MEMORY (10 MB cap); storage.js puts it in the
   PRIVATE "contact-documents" bucket under <workspaceId>/<contactId>/<ts>-<name>.
   Nothing is public: the CRM download below and the Engine's
   GET /api/dokumente/:id/download both answer a time-limited signed link.

   THE ENGINE  every upload fires dokument.hinzugefuegt (utils/engine.js), and a
   'vertrag' document makes vertrag.unterschrieben carry a real dokument_url.

   ENDPOINTS (session; every query scoped to the workspace)
     GET    /:contactId/documents                 list (+ uploader name)
     POST   /:contactId/documents                 multipart "file"; fields typ (vertrag|aufnahme|sonstiges), deal_id
     GET    /:contactId/documents/:id/download    302 → signed URL (10 min)
     DELETE /:contactId/documents/:id             storage object first, then the row
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const storage     = require('../storage');
const engine      = require('../utils/engine');
const baseUrl     = require('../utils/base-url');
const { DOCUMENT_TYPES } = require('../utils/kunde');

const MAX_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

router.use(requireAuth);

const intId = v => (/^\d+$/.test(String(v)) ? Number(v) : null);

// The contact must be in the caller's workspace — every handler starts here.
async function ownContact(req, res) {
  const id = intId(req.params.contactId);
  if (id === null) { res.status(400).json({ error: 'Invalid contact id' }); return null; }
  const { rows: [c] } = await pool.query('SELECT id, contact_type FROM contacts WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]);
  if (!c) { res.status(404).json({ error: 'Not found' }); return null; }
  return c;
}

router.get('/:contactId/documents', async (req, res, next) => {
  try {
    const c = await ownContact(req, res); if (!c) return;
    const { rows } = await pool.query(
      `SELECT d.id, d.contact_id, d.deal_id, d.typ, d.file_name, d.file_size, d.file_type, d.uploaded_by, d.created_at, u.name AS uploaded_by_name
         FROM contact_documents d
         LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.contact_id = $1 AND d.workspace_id = $2
        ORDER BY d.created_at DESC, d.id DESC`,
      [c.id, req.workspaceId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:contactId/documents', (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
    if (err) return next(err);
    next();
  });
}, async (req, res, next) => {
  try {
    const c = await ownContact(req, res); if (!c) return;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const typ = req.body?.typ ? String(req.body.typ) : 'sonstiges';
    if (!DOCUMENT_TYPES.includes(typ)) return res.status(400).json({ error: `typ must be one of ${DOCUMENT_TYPES.join(', ')}` });

    // An optional link to the contract (deal) — it must be this contact's deal in this workspace.
    let dealId = null;
    if (req.body?.deal_id != null && String(req.body.deal_id) !== '') {
      dealId = intId(req.body.deal_id);
      if (dealId === null) return res.status(400).json({ error: 'Invalid deal id' });
      const { rows: [d] } = await pool.query('SELECT id FROM deals WHERE id=$1 AND workspace_id=$2 AND contact_id=$3', [dealId, req.workspaceId, c.id]);
      if (!d) return res.status(400).json({ error: 'The deal does not belong to this contact' });
    }

    const { storagePath } = await storage.uploadDocument(req.workspaceId, c.id, file.buffer, file.originalname, file.mimetype);
    const { rows: [row] } = await pool.query(
      `INSERT INTO contact_documents (workspace_id, contact_id, deal_id, typ, file_name, file_size, file_type, storage_path, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, contact_id, deal_id, typ, file_name, file_size, file_type, uploaded_by, created_at`,
      [req.workspaceId, c.id, dealId, typ, file.originalname, file.size, file.mimetype || '', storagePath, req.userId]
    );

    // Fire-and-forget: the dispatcher checks the Engine settings and the contact type itself.
    engine.dispatchDocumentAdded({ workspaceId: req.workspaceId, documentId: row.id, baseUrl: baseUrl(req) }).catch(() => {});
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.get('/:contactId/documents/:id/download', async (req, res, next) => {
  try {
    const c = await ownContact(req, res); if (!c) return;
    const id = intId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid document id' });
    const { rows: [d] } = await pool.query(
      'SELECT storage_path FROM contact_documents WHERE id=$1 AND contact_id=$2 AND workspace_id=$3', [id, c.id, req.workspaceId]
    );
    if (!d) return res.status(404).json({ error: 'Not found' });
    const url = await storage.signedDocumentUrl(d.storage_path, 600);
    res.redirect(302, url);
  } catch (e) { next(e); }
});

router.delete('/:contactId/documents/:id', async (req, res, next) => {
  try {
    const c = await ownContact(req, res); if (!c) return;
    const id = intId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid document id' });
    const { rows: [d] } = await pool.query(
      'SELECT id, storage_path FROM contact_documents WHERE id=$1 AND contact_id=$2 AND workspace_id=$3', [id, c.id, req.workspaceId]
    );
    if (!d) return res.status(404).json({ error: 'Not found' });
    await storage.deleteDocument(d.storage_path);
    await pool.query('DELETE FROM contact_documents WHERE id=$1 AND workspace_id=$2', [d.id, req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
