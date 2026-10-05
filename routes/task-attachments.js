/* ═══════════════════════════════════════════════════════════════════════════
   /api/tasks/:taskId/attachments — files on a task.

   MOUNTED ON THE SAME PREFIX AS routes/tasks.js. server.js mounts tasks.js
   first; because that router only declares one- and two-segment paths, these
   three-segment paths fall through to here. Keep it that way: a /:id/:x route
   added to tasks.js would shadow this file.

   THE UPLOAD PATH  multer keeps the file in MEMORY (no temp files) with a
   10 MB cap, then storage.js pushes it to Supabase Storage under
   <workspaceId>/<taskId>/<timestamp>-<name> and returns a PUBLIC url, which is
   stored in task_attachments along with the storage_path. Deleting removes the
   object from Supabase first, then the row.

   REQUIRES SUPABASE. Without SUPABASE_URL / SUPABASE_SERVICE_KEY the upload
   throws a clear "not configured" error; everything else in the app is fine.

   NOT CHECKED  file type. And the URL is public: anyone with the link can read
   the file without a CRM session.

   ENDPOINTS
     GET    /:taskId/attachments
     POST   /:taskId/attachments       multipart, field name "file"
     DELETE /:taskId/attachments/:id
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
});

router.use(requireAuth);

router.get('/:taskId/attachments', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ta.*, u.name AS uploaded_by_name
       FROM task_attachments ta
       LEFT JOIN users u ON u.id = ta.uploaded_by
       WHERE ta.task_id = $1 AND ta.workspace_id = $2
       ORDER BY ta.created_at ASC`,
      [req.params.taskId, req.workspaceId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/:taskId/attachments', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const { publicUrl, storagePath } = await uploadFile(
      req.workspaceId, req.params.taskId,
      file.buffer, file.originalname, file.mimetype
    );

    const { rows: [row] } = await pool.query(
      `INSERT INTO task_attachments
         (task_id, workspace_id, file_name, file_size, file_type, file_url, storage_path, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.taskId, req.workspaceId, file.originalname, file.size,
       file.mimetype, publicUrl, storagePath, req.userId]
    );

    res.status(201).json(row);
  } catch (e) {
    if (e.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
    next(e);
  }
});

router.delete('/:taskId/attachments/:id', async (req, res, next) => {
  try {
    const { rows: [att] } = await pool.query(
      'SELECT * FROM task_attachments WHERE id=$1 AND task_id=$2 AND workspace_id=$3',
      [req.params.id, req.params.taskId, req.workspaceId]
    );
    if (!att) return res.status(404).json({ error: 'Not found' });

    await deleteFile(att.storage_path);
    await pool.query('DELETE FROM task_attachments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
