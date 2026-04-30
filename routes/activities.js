const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, c.name AS contact_name,
             u.name AS logged_by_name, u.email AS logged_by_email
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN users   u ON u.id = a.created_by
      WHERE a.workspace_id = $1
      ORDER BY a.created_at DESC LIMIT 200
    `, [req.workspaceId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { contact_id, type, content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    if (!['note','call','email'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const { rows: [row] } = await pool.query(
      'INSERT INTO activities (workspace_id, contact_id, type, content, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.workspaceId, contact_id||null, type, content, req.userId]
    );
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM activities WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
