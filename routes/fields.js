const express     = require('express');
const router      = express.Router();
const { db }      = require('../db');
const requireAuth = require('../middleware/auth');

const VALID_TYPES = ['text','email','phone','number','dropdown','date','url'];

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM custom_fields WHERE workspace_id=? ORDER BY position ASC, id ASC').all(req.workspaceId).map(parseField));
});

router.post('/', (req, res) => {
  const { name, field_key, type, options } = req.body;
  if (!name || !field_key) return res.status(400).json({ error: 'Name and key required' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const maxPos = db.prepare('SELECT MAX(position) as m FROM custom_fields WHERE workspace_id=?').get(req.workspaceId).m ?? -1;
  try {
    const result = db.prepare('INSERT INTO custom_fields (workspace_id, name, field_key, type, options, position) VALUES (?,?,?,?,?,?)').run(req.workspaceId, name, field_key, type, JSON.stringify(options||[]), maxPos+1);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch { res.status(400).json({ error: 'Field key already exists' }); }
});

router.put('/:id', (req, res) => {
  const { name, type, options } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const result = db.prepare('UPDATE custom_fields SET name=?, type=?, options=? WHERE id=? AND workspace_id=?').run(name, type, JSON.stringify(options||[]), req.params.id, req.workspaceId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM custom_fields WHERE id=? AND workspace_id=?').run(req.params.id, req.workspaceId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

function parseField(row) {
  try { row.options = JSON.parse(row.options||'[]'); } catch { row.options = []; }
  return row;
}

module.exports = router;
