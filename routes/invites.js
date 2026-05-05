const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { rows } = await pool.query(`
      SELECT ic.*, cb.name AS created_by_name, ub.name AS used_by_name
      FROM invite_codes ic
      LEFT JOIN users cb ON cb.id = ic.created_by
      LEFT JOIN users ub ON ub.id = ic.used_by
      WHERE ic.workspace_id = $1
      ORDER BY ic.created_at DESC
    `, [req.workspaceId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const code = crypto.randomBytes(14).toString('hex');
    const { rows: [row] } = await pool.query(
      'INSERT INTO invite_codes (workspace_id, code, created_by) VALUES ($1,$2,$3) RETURNING id',
      [req.workspaceId, code, req.userId]
    );
    res.status(201).json({ id: row.id, code, used: 0 });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const result = await pool.query(
      'DELETE FROM invite_codes WHERE id=$1 AND workspace_id=$2 AND used=0',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found or already used' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
