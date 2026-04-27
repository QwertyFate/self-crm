const express     = require('express');
const router      = express.Router();
const { db }      = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM stages WHERE workspace_id=? ORDER BY position ASC, id ASC').all(req.workspaceId));
});

router.post('/', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const maxPos = db.prepare('SELECT MAX(position) as m FROM stages WHERE workspace_id=?').get(req.workspaceId).m ?? -1;
  try {
    const result = db.prepare('INSERT INTO stages (workspace_id, name, color, position) VALUES (?,?,?,?)').run(req.workspaceId, name, color||'#4f6ef7', maxPos+1);
    res.status(201).json({ id: result.lastInsertRowid, name, color: color||'#4f6ef7', position: maxPos+1 });
  } catch { res.status(400).json({ error: 'Stage name already exists' }); }
});

router.put('/:id', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare('UPDATE stages SET name=?, color=? WHERE id=? AND workspace_id=?').run(name, color||'#4f6ef7', req.params.id, req.workspaceId);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch { res.status(400).json({ error: 'Stage name already exists' }); }
});

router.patch('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
  const update = db.prepare('UPDATE stages SET position=? WHERE id=? AND workspace_id=?');
  db.transaction(() => ids.forEach((id, i) => update.run(i, id, req.workspaceId)))();
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM stages WHERE id=? AND workspace_id=?').run(req.params.id, req.workspaceId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
