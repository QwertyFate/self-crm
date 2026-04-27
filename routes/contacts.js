const express     = require('express');
const router      = express.Router();
const { db }      = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, s.name AS stage_name, s.color AS stage_color,
           u.name AS assigned_to_name, u.email AS assigned_to_email
    FROM contacts c
    LEFT JOIN stages s ON s.id = c.stage_id
    LEFT JOIN users  u ON u.id = c.assigned_to
    WHERE c.workspace_id = ?
    ORDER BY c.created_at DESC
  `).all(req.workspaceId);
  res.json(rows.map(parse));
});

router.post('/import', (req, res) => {
  const { contacts: rows, newFields } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'contacts must be an array' });

  if (Array.isArray(newFields) && newFields.length) {
    const maxPos = db.prepare('SELECT COALESCE(MAX(position),0) AS p FROM custom_fields WHERE workspace_id = ?').get(req.workspaceId)?.p || 0;
    const insertField = db.prepare(
      'INSERT OR IGNORE INTO custom_fields (workspace_id, name, field_key, type, options, position) VALUES (?,?,?,?,?,?)'
    );
    newFields.forEach((f, i) => {
      insertField.run(req.workspaceId, f.name, f.field_key, 'text', '[]', maxPos + i + 1);
    });
  }

  const insert = db.prepare(
    'INSERT INTO contacts (workspace_id, name, email, phone, company, stage_id, assigned_to, custom_data) VALUES (?,?,?,?,?,?,?,?)'
  );
  let count = 0;
  db.transaction(() => {
    for (const row of rows) {
      if (!row.name?.trim()) continue;
      insert.run(req.workspaceId, row.name.trim(), row.email||null, row.phone||null,
        row.company||null, row.stage_id||null, req.userId, JSON.stringify(row.custom_data||{}));
      count++;
    }
  })();

  res.status(201).json({ imported: count });
});

router.get('/:id', (req, res) => {
  const contact = db.prepare(`
    SELECT c.*, s.name AS stage_name, s.color AS stage_color,
           u.name AS assigned_to_name, u.email AS assigned_to_email
    FROM contacts c
    LEFT JOIN stages s ON s.id = c.stage_id
    LEFT JOIN users  u ON u.id = c.assigned_to
    WHERE c.id = ? AND c.workspace_id = ?
  `).get(req.params.id, req.workspaceId);
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const activities = db.prepare(`
    SELECT a.*, u.name AS logged_by_name, u.email AS logged_by_email
    FROM activities a
    LEFT JOIN users u ON u.id = a.created_by
    WHERE a.contact_id = ? AND a.workspace_id = ?
    ORDER BY a.created_at DESC
  `).all(req.params.id, req.workspaceId);

  res.json({ ...parse(contact), activities });
});

router.post('/', (req, res) => {
  const { name, email, phone, company, stage_id, assigned_to, custom_data } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  // default assignee to the creator
  const assignee = assigned_to ? Number(assigned_to) : req.userId;

  const result = db.prepare(`
    INSERT INTO contacts (workspace_id, name, email, phone, company, stage_id, assigned_to, custom_data)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(req.workspaceId, name, email||null, phone||null, company||null, stage_id||null, assignee, JSON.stringify(custom_data||{}));

  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, email, phone, company, stage_id, assigned_to, custom_data } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const result = db.prepare(`
    UPDATE contacts SET name=?, email=?, phone=?, company=?, stage_id=?, assigned_to=?, custom_data=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND workspace_id=?
  `).run(name, email||null, phone||null, company||null, stage_id||null, assigned_to||null, JSON.stringify(custom_data||{}), req.params.id, req.workspaceId);

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

router.patch('/:id/stage', (req, res) => {
  const { stage_id } = req.body;
  const result = db.prepare(
    'UPDATE contacts SET stage_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?'
  ).run(stage_id||null, req.params.id, req.workspaceId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM contacts WHERE id=? AND workspace_id=?').run(req.params.id, req.workspaceId);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

function parse(row) {
  try { row.custom_data = JSON.parse(row.custom_data || '{}'); } catch { row.custom_data = {}; }
  return row;
}

module.exports = router;
