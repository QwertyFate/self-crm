const express     = require('express');
const router      = express.Router();
const { db }      = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, c.name AS contact_name,
           u.name AS logged_by_name, u.email AS logged_by_email
    FROM activities a
    LEFT JOIN contacts c ON c.id = a.contact_id
    LEFT JOIN users   u ON u.id = a.created_by
    WHERE a.workspace_id = ?
    ORDER BY a.created_at DESC LIMIT 200
  `).all(req.workspaceId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { contact_id, type, content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  if (!['note','call','email'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const result = db.prepare(
    'INSERT INTO activities (workspace_id, contact_id, type, content, created_by) VALUES (?,?,?,?,?)'
  ).run(req.workspaceId, contact_id||null, type, content, req.userId);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM activities WHERE id=? AND workspace_id=?').run(req.params.id, req.workspaceId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
