const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Owners and admins may manage invite codes. Admins may only issue/revoke member-level codes.
const INVITE_ROLES = ['member', 'admin'];
const canManageInvites = (role) => role === 'owner' || role === 'admin';

router.get('/', async (req, res, next) => {
  try {
    if (!canManageInvites(req.userRole)) return res.status(403).json({ error: 'Owner or admin only' });
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
    if (!canManageInvites(req.userRole)) return res.status(403).json({ error: 'Owner or admin only' });
    const role = req.body?.role || 'member';
    if (!INVITE_ROLES.includes(role)) return res.status(400).json({ error: 'Role must be "member" or "admin"' });
    if (req.userRole !== 'owner' && role !== 'member') return res.status(403).json({ error: 'Only the owner can invite admins' });
    const code = crypto.randomBytes(14).toString('hex');
    const { rows: [row] } = await pool.query(
      'INSERT INTO invite_codes (workspace_id, code, created_by, role) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.workspaceId, code, req.userId, role]
    );
    res.status(201).json({ id: row.id, code, used: 0, role });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!canManageInvites(req.userRole)) return res.status(403).json({ error: 'Owner or admin only' });
    const roleFilter = req.userRole === 'owner' ? '' : " AND role='member'";
    const result = await pool.query(
      `DELETE FROM invite_codes WHERE id=$1 AND workspace_id=$2 AND used=0${roleFilter}`,
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found or already used' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
