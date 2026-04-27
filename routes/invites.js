const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const { db }      = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const codes = db.prepare(`
    SELECT ic.*, cb.name AS created_by_name, ub.name AS used_by_name
    FROM invite_codes ic
    LEFT JOIN users cb ON cb.id = ic.created_by
    LEFT JOIN users ub ON ub.id = ic.used_by
    WHERE ic.workspace_id = ?
    ORDER BY ic.created_at DESC
  `).all(req.workspaceId);
  res.json(codes);
});

router.post('/', (req, res) => {
  if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const code = crypto.randomBytes(14).toString('hex');
  const result = db.prepare(
    'INSERT INTO invite_codes (workspace_id, code, created_by) VALUES (?,?,?)'
  ).run(req.workspaceId, code, req.userId);
  res.status(201).json({ id: result.lastInsertRowid, code, used: 0 });
});

router.delete('/:id', (req, res) => {
  if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const result = db.prepare(
    'DELETE FROM invite_codes WHERE id = ? AND workspace_id = ? AND used = 0'
  ).run(req.params.id, req.workspaceId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found or already used' });
  res.json({ success: true });
});

module.exports = router;
