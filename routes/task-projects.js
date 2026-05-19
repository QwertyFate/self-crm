const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const DEFAULT_STATUSES = [
  { key: 'todo',        label: 'Todo',        color: '#94a3b8', position: 0 },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6', position: 1 },
  { key: 'in_review',   label: 'In Review',   color: '#f59e0b', position: 2 },
  { key: 'done',        label: 'Done',        color: '#22c55e', position: 3 },
];

// ── Projects ───────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows: projects } = await pool.query(
      'SELECT * FROM task_projects WHERE workspace_id=$1 ORDER BY position, id',
      [req.workspaceId]
    );
    for (const p of projects) {
      const { rows: lists } = await pool.query(
        'SELECT * FROM task_lists WHERE project_id=$1 ORDER BY position, id',
        [p.id]
      );
      const { rows: statuses } = await pool.query(
        'SELECT * FROM task_project_statuses WHERE project_id=$1 ORDER BY position, id',
        [p.id]
      );
      p.lists    = lists;
      p.statuses = statuses.length ? statuses : DEFAULT_STATUSES.map(s => ({ ...s, project_id: p.id }));
    }
    res.json(projects);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const { rows: [{ m }] } = await pool.query(
      'SELECT COALESCE(MAX(position),-1) AS m FROM task_projects WHERE workspace_id=$1',
      [req.workspaceId]
    );
    const { rows: [proj] } = await pool.query(
      'INSERT INTO task_projects (workspace_id, name, color, position, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.workspaceId, name.trim(), color||'#3b82f6', m+1, req.userId]
    );
    // Seed default statuses
    for (const s of DEFAULT_STATUSES) {
      await pool.query(
        'INSERT INTO task_project_statuses (project_id, key, label, color, position) VALUES ($1,$2,$3,$4,$5)',
        [proj.id, s.key, s.label, s.color, s.position]
      );
    }
    // Seed a default list
    await pool.query(
      'INSERT INTO task_lists (workspace_id, project_id, name, position) VALUES ($1,$2,$3,$4)',
      [req.workspaceId, proj.id, 'Tasks', 0]
    );
    res.status(201).json({ id: proj.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    await pool.query(
      'UPDATE task_projects SET name=$1, color=$2 WHERE id=$3 AND workspace_id=$4',
      [name, color||'#3b82f6', req.params.id, req.workspaceId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM task_projects WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Lists ──────────────────────────────────────────────────
router.post('/:id/lists', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const { rows: [{ m }] } = await pool.query(
      'SELECT COALESCE(MAX(position),-1) AS m FROM task_lists WHERE project_id=$1',
      [req.params.id]
    );
    const { rows: [row] } = await pool.query(
      'INSERT INTO task_lists (workspace_id, project_id, name, position) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.workspaceId, req.params.id, name.trim(), m+1]
    );
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/lists/:listId', async (req, res, next) => {
  try {
    const { name } = req.body;
    await pool.query(
      'UPDATE task_lists SET name=$1 WHERE id=$2 AND workspace_id=$3',
      [name, req.params.listId, req.workspaceId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/lists/:listId', async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM task_lists WHERE id=$1 AND workspace_id=$2',
      [req.params.listId, req.workspaceId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Per-project statuses ────────────────────────────────────
router.get('/:id/statuses', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM task_project_statuses WHERE project_id=$1 ORDER BY position, id',
      [req.params.id]
    );
    res.json(rows.length ? rows : DEFAULT_STATUSES);
  } catch (e) { next(e); }
});

router.put('/:id/statuses', async (req, res, next) => {
  try {
    const { statuses } = req.body;
    if (!Array.isArray(statuses)) return res.status(400).json({ error: 'statuses array required' });
    await pool.query('DELETE FROM task_project_statuses WHERE project_id=$1', [req.params.id]);
    for (let i = 0; i < statuses.length; i++) {
      const s = statuses[i];
      await pool.query(
        'INSERT INTO task_project_statuses (project_id, key, label, color, position) VALUES ($1,$2,$3,$4,$5)',
        [req.params.id, s.key, s.label, s.color, i]
      );
    }
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
