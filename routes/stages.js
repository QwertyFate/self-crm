const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { reorderItems } = require('../middleware/reorder');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM stages WHERE workspace_id=$1 ORDER BY position ASC, id ASC',
      [req.workspaceId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { rows: [{ m }] } = await pool.query(
      'SELECT COALESCE(MAX(position), -1) AS m FROM stages WHERE workspace_id=$1',
      [req.workspaceId]
    );
    const { rows: [row] } = await pool.query(
      'INSERT INTO stages (workspace_id, name, color, position) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.workspaceId, name, color||'#4f6ef7', m + 1]
    );
    res.status(201).json({ id: row.id, name, color: color||'#4f6ef7', position: m + 1 });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Stage name already exists' });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await pool.query(
      'UPDATE stages SET name=$1, color=$2 WHERE id=$3 AND workspace_id=$4',
      [name, color||'#4f6ef7', req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Stage name already exists' });
    next(e);
  }
});

router.patch('/reorder', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    const result = await reorderItems('stages', 'id', ids, 'workspace_id=$3', [req.workspaceId]);
    res.json(result);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM stages WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
