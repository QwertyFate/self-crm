const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const DEFAULT_STAGES = [
  ['New', '#6b7280', 0], ['Contacted', '#3b82f6', 1], ['Proposal', '#f59e0b', 2],
  ['Negotiation', '#8b5cf6', 3], ['Won', '#22c55e', 4], ['Lost', '#ef4444', 5],
];

// ── Pipelines ─────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { rows: pipelines } = await pool.query(
      'SELECT * FROM pipelines WHERE workspace_id=$1 ORDER BY position ASC, id ASC',
      [req.workspaceId]
    );
    for (const p of pipelines) {
      const { rows } = await pool.query(
        'SELECT * FROM pipeline_stages WHERE pipeline_id=$1 ORDER BY position ASC, id ASC',
        [p.id]
      );
      p.stages = rows;
    }
    res.json(pipelines);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const { rows: [{ m }] } = await pool.query(
      'SELECT COALESCE(MAX(position),-1) AS m FROM pipelines WHERE workspace_id=$1',
      [req.workspaceId]
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [p] } = await client.query(
        'INSERT INTO pipelines (workspace_id, name, position) VALUES ($1,$2,$3) RETURNING id',
        [req.workspaceId, name.trim(), m + 1]
      );
      for (const [sName, color, pos] of DEFAULT_STAGES) {
        await client.query(
          'INSERT INTO pipeline_stages (workspace_id, pipeline_id, name, color, position) VALUES ($1,$2,$3,$4,$5)',
          [req.workspaceId, p.id, sName, color, pos]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ id: p.id, name: name.trim() });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Pipeline name already exists' });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const result = await pool.query(
      'UPDATE pipelines SET name=$1 WHERE id=$2 AND workspace_id=$3',
      [name.trim(), req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Pipeline name already exists' });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM pipelines WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Pipeline Stages ───────────────────────────────────────

router.post('/:id/stages', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows: [{ m }] } = await pool.query(
      'SELECT COALESCE(MAX(position),-1) AS m FROM pipeline_stages WHERE pipeline_id=$1',
      [req.params.id]
    );
    const { rows: [row] } = await pool.query(
      'INSERT INTO pipeline_stages (workspace_id, pipeline_id, name, color, position) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.workspaceId, req.params.id, name, color || '#4f6ef7', m + 1]
    );
    res.status(201).json({ id: row.id, name, color: color || '#4f6ef7', position: m + 1 });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Stage name already exists' });
    next(e);
  }
});

router.put('/:id/stages/:sid', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = await pool.query(
      'UPDATE pipeline_stages SET name=$1, color=$2 WHERE id=$3 AND pipeline_id=$4 AND workspace_id=$5',
      [name, color || '#4f6ef7', req.params.sid, req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Stage name already exists' });
    next(e);
  }
});

router.patch('/:id/stages/reorder', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i++) {
        await client.query(
          'UPDATE pipeline_stages SET position=$1 WHERE id=$2 AND pipeline_id=$3 AND workspace_id=$4',
          [i, ids[i], req.params.id, req.workspaceId]
        );
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});

router.delete('/:id/stages/:sid', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM pipeline_stages WHERE id=$1 AND pipeline_id=$2 AND workspace_id=$3',
      [req.params.sid, req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Deal kanban fields
router.patch('/deal-kanban-fields', async (req, res, next) => {
  try {
    const { fields } = req.body;
    if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });
    await pool.query('UPDATE workspaces SET deal_kanban_fields=$1 WHERE id=$2',
      [JSON.stringify(fields), req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
