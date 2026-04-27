const express     = require('express');
const router      = express.Router();
const { db }      = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/members', (req, res) => {
  const members = db.prepare(
    'SELECT id, name, email, role, created_at FROM users WHERE workspace_id = ? ORDER BY created_at ASC'
  ).all(req.workspaceId);
  res.json(members);
});

router.delete('/members/:id', (req, res) => {
  if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });

  const memberId = parseInt(req.params.id);
  if (memberId === req.userId) return res.status(400).json({ error: 'You cannot remove yourself' });

  const member = db.prepare('SELECT id, role FROM users WHERE id = ? AND workspace_id = ?').get(memberId, req.workspaceId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (member.role === 'owner') return res.status(400).json({ error: 'Cannot remove the workspace owner' });

  db.transaction(() => {
    db.prepare('UPDATE contacts SET assigned_to = NULL WHERE assigned_to = ? AND workspace_id = ?').run(memberId, req.workspaceId);
    db.prepare('DELETE FROM users WHERE id = ? AND workspace_id = ?').run(memberId, req.workspaceId);
  })();

  res.json({ success: true });
});

router.patch('/name', (req, res) => {
  if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Workspace name required' });
  db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name.trim(), req.workspaceId);
  res.json({ success: true, name: name.trim() });
});

router.patch('/kanban-fields', (req, res) => {
  const { fields } = req.body;
  if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });
  db.prepare('UPDATE workspaces SET kanban_fields = ? WHERE id = ?')
    .run(JSON.stringify(fields), req.workspaceId);
  res.json({ success: true });
});

module.exports = router;
