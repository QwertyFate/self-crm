const express     = require('express');
const router      = express.Router();
const multer      = require('multer');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

router.use(requireAuth);

// GET all attachments for a task
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

// POST upload a file
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

// DELETE an attachment
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
