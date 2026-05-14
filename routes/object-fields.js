const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

const VALID_TYPES = ['text','email','phone','number','dropdown','date','url'];

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM object_fields WHERE workspace_id=$1 ORDER BY position ASC, id ASC',
      [req.workspaceId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, field_key, type, options } = req.body;
    if (!name || !field_key) return res.status(400).json({ error: 'Name and key required' });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const { rows: [{ m }] } = await pool.query(
      'SELECT COALESCE(MAX(position),-1) AS m FROM object_fields WHERE workspace_id=$1',
      [req.workspaceId]
    );
    const { rows: [row] } = await pool.query(
      'INSERT INTO object_fields (workspace_id,name,field_key,type,options,position) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.workspaceId, name, field_key, type, JSON.stringify(options||[]), m + 1]
    );
    res.status(201).json({ id: row.id });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Field key already exists' });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, type, options } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const result = await pool.query(
      'UPDATE object_fields SET name=$1,type=$2,options=$3 WHERE id=$4 AND workspace_id=$5',
      [name, type, JSON.stringify(options||[]), req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM object_fields WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
