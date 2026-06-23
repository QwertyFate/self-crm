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
    const { rows: projects } = await pool.query(`
      SELECT p.*, l.lists, s.statuses
      FROM task_projects p
      LEFT JOIN (
        SELECT project_id, json_agg(json_build_object('id', id, 'project_id', project_id, 'name', name, 'position', position) ORDER BY position, id) as lists
        FROM task_lists
        GROUP BY project_id
      ) l ON l.project_id = p.id
      LEFT JOIN (
        SELECT project_id, json_agg(json_build_object('id', id, 'project_id', project_id, 'key', key, 'label', label, 'color', color, 'position', position) ORDER BY position, id) as statuses
        FROM task_project_statuses
        GROUP BY project_id
      ) s ON s.project_id = p.id
      WHERE p.workspace_id=$1
      ORDER BY p.position, p.id
    `, [req.workspaceId]);

    projects.forEach(p => {
      p.lists = p.lists || [];
      p.statuses = p.statuses || [];
      if (p.statuses.length === 0) {
        p.statuses = DEFAULT_STATUSES.map(s => ({ ...s, project_id: p.id }));
      }
    });
    res.json(projects);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

    // Check for duplicate project name
    const { rows: [existing] } = await client.query(
      'SELECT id FROM task_projects WHERE workspace_id=$1 AND LOWER(name)=LOWER($2)',
      [req.workspaceId, name.trim()]
    );
    if (existing) return res.status(400).json({ error: 'Project name already exists' });

    await client.query('BEGIN');
    const { rows: [{ m }] } = await client.query(
      'SELECT COALESCE(MAX(position),-1) AS m FROM task_projects WHERE workspace_id=$1',
      [req.workspaceId]
    );
    const { rows: [proj] } = await client.query(
      'INSERT INTO task_projects (workspace_id, name, color, position, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.workspaceId, name.trim(), color||'#3b82f6', m+1, req.userId]
    );
    // Seed default statuses
    for (const s of DEFAULT_STATUSES) {
      await client.query(
        'INSERT INTO task_project_statuses (project_id, key, label, color, position) VALUES ($1,$2,$3,$4,$5)',
        [proj.id, s.key, s.label, s.color, s.position]
      );
    }
    // Seed a default list
    await client.query(
      'INSERT INTO task_lists (workspace_id, project_id, name, position) VALUES ($1,$2,$3,$4)',
      [req.workspaceId, proj.id, 'Tasks', 0]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: proj.id });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
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

    // Check for duplicate list name in same project
    const { rows: [existing] } = await pool.query(
      'SELECT id FROM task_lists WHERE project_id=$1 AND LOWER(name)=LOWER($2)',
      [req.params.id, name.trim()]
    );
    if (existing) return res.status(400).json({ error: 'List name already exists' });

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
