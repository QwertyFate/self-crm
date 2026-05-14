const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM task_fields WHERE workspace_id=$1 ORDER BY position, id',
      [req.workspaceId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, field_key, type, options } = req.body;
    if (!name?.trim() || !field_key?.trim()) return res.status(400).json({ error: 'Name and key required' });
    const { rows: [{ m }] } = await pool.query(
      'SELECT COALESCE(MAX(position), -1) AS m FROM task_fields WHERE workspace_id=$1',
      [req.workspaceId]
    );
    const { rows: [row] } = await pool.query(
      'INSERT INTO task_fields (workspace_id, name, field_key, type, options, position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.workspaceId, name.trim(), field_key.trim(), type||'text', JSON.stringify(options||[]), m+1]
    );
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, field_key, type, options } = req.body;
    await pool.query(
      'UPDATE task_fields SET name=$1, field_key=$2, type=$3, options=$4 WHERE id=$5 AND workspace_id=$6',
      [name, field_key, type, JSON.stringify(options||[]), req.params.id, req.workspaceId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM task_fields WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
