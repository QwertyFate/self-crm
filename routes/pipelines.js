/* ═══════════════════════════════════════════════════════════════════════════
   /api/pipelines — pipelines AND their stages (one router, two resources).

   A workspace can have several pipelines; each has its own ordered stages, and
   a deal belongs to one pipeline. GET / returns every pipeline with its stages
   already nested via json_agg, ordered by position — one request is enough to
   draw the whole board.

   CREATING A PIPELINE also creates the six default stages (New → Lost) in the
   same transaction, so a new pipeline is never unusable. A brand-new WORKSPACE
   gets its pipelines from a different place: seedDefaultPipeline() in db.js,
   which the platform admin can override.

   ORDERING is a `position` integer. Reordering goes through
   middleware/reorder.js, which rewrites every position in one transaction.

   DELETING A STAGE does not delete its deals: the FK is ON DELETE SET NULL, so
   they stay with stage_id = null and show up as unstaged.

   ENDPOINTS
     GET    /                          pipelines with nested stages
     POST   / · PUT /:id · DELETE /:id
     POST   /:id/stages
     PUT    /:id/stages/:sid
     PATCH  /:id/stages/reorder        { ids: [...] } in the new order
     DELETE /:id/stages/:sid
     PATCH  /deal-kanban-fields        workspaces.deal_kanban_fields
   A duplicate name (pipeline or stage) surfaces as Postgres 23505 → 400.

   NOTE  /deal-kanban-fields is a workspace setting that ended up on this
   router, and nothing in public/ calls it today — the Deals board reads the
   column but no UI writes it.
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { reorderItems } = require('../middleware/reorder');

router.use(requireAuth);

const DEFAULT_STAGES = [
  ['New', '#6b7280', 0], ['Contacted', '#3b82f6', 1], ['Proposal', '#f59e0b', 2],
  ['Negotiation', '#8b5cf6', 3], ['Won', '#22c55e', 4], ['Lost', '#ef4444', 5],
];

router.get('/', async (req, res, next) => {
  try {
    const { rows: pipelines } = await pool.query(`
      SELECT p.*,
        COALESCE(json_agg(json_build_object('id', s.id, 'workspace_id', s.workspace_id, 'pipeline_id', s.pipeline_id, 'name', s.name, 'color', s.color, 'position', s.position) ORDER BY s.position ASC, s.id ASC), '[]'::json) as stages
      FROM pipelines p
      LEFT JOIN pipeline_stages s ON s.pipeline_id = p.id
      WHERE p.workspace_id=$1
      GROUP BY p.id
      ORDER BY p.position ASC, p.id ASC
    `, [req.workspaceId]);
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
    const result = await reorderItems('pipeline_stages', 'id', ids, 'pipeline_id=$3 AND workspace_id=$4', [req.params.id, req.workspaceId]);
    res.json(result);
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
