const express = require('express');
const router = express.Router();
const db = require('../db');

const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

router.get('/', (req, res) => {
  const deals = db.prepare(`
    SELECT d.*, c.name as contact_name, c.company
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    ORDER BY d.updated_at DESC
  `).all();
  res.json(deals);
});

router.get('/pipeline', (req, res) => {
  const deals = db.prepare(`
    SELECT d.*, c.name as contact_name, c.company
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    ORDER BY d.updated_at DESC
  `).all();

  const pipeline = {};
  for (const stage of STAGES) {
    pipeline[stage] = deals.filter(d => d.stage === stage);
  }

  const summary = STAGES.map(stage => ({
    stage,
    count: pipeline[stage].length,
    total: pipeline[stage].reduce((sum, d) => sum + (d.value || 0), 0),
  }));

  res.json({ pipeline, summary, stages: STAGES });
});

router.get('/:id', (req, res) => {
  const deal = db.prepare(`
    SELECT d.*, c.name as contact_name, c.company
    FROM deals d
    LEFT JOIN contacts c ON c.id = d.contact_id
    WHERE d.id = ?
  `).get(req.params.id);

  if (!deal) return res.status(404).json({ error: 'Not found' });

  const activities = db.prepare(
    'SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  res.json({ ...deal, activities });
});

router.post('/', (req, res) => {
  const { contact_id, title, value, stage } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });

  const result = db.prepare(
    'INSERT INTO deals (contact_id, title, value, stage) VALUES (?, ?, ?, ?)'
  ).run(contact_id || null, title, value || 0, stage || 'Lead');

  res.status(201).json({ id: result.lastInsertRowid, contact_id, title, value, stage: stage || 'Lead' });
});

router.put('/:id', (req, res) => {
  const { contact_id, title, value, stage } = req.body;
  const existing = db.prepare('SELECT id FROM deals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (stage && !STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });

  db.prepare(`
    UPDATE deals SET contact_id = ?, title = ?, value = ?, stage = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(contact_id || null, title, value || 0, stage || 'Lead', req.params.id);

  res.json({ id: Number(req.params.id), contact_id, title, value, stage });
});

router.patch('/:id/stage', (req, res) => {
  const { stage } = req.body;
  if (!stage || !STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });

  const result = db.prepare(
    'UPDATE deals SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(stage, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, stage });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
