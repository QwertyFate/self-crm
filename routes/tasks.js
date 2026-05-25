const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notify }  = require('../notifications');

router.use(requireAuth);

// Tasks — optionally filtered by list_id. Returns parents + subtasks together.
router.get('/', async (req, res, next) => {
  try {
    const { list_id } = req.query;
    const params = [req.workspaceId];
    let filter = '';
    if (list_id) { params.push(list_id); filter = ` AND t.list_id = $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT t.*,
             u.name  AS assigned_to_name,
             cu.name AS created_by_name,
             (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id) AS subtask_count,
             (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id AND s.status = 'done') AS subtask_done
      FROM tasks t
      LEFT JOIN users u  ON u.id = t.assigned_to
      LEFT JOIN users cu ON cu.id = t.created_by
      WHERE t.workspace_id = $1 ${filter}
      ORDER BY t.parent_id NULLS FIRST, t.created_at ASC
    `, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// Single task with its subtasks
router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [task] } = await pool.query(`
      SELECT t.*, u.name AS assigned_to_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.id = $1 AND t.workspace_id = $2
    `, [req.params.id, req.workspaceId]);
    if (!task) return res.status(404).json({ error: 'Not found' });

    const { rows: subtasks } = await pool.query(`
      SELECT t.*, u.name AS assigned_to_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.parent_id = $1
      ORDER BY t.created_at ASC
    `, [req.params.id]);

    res.json({ ...task, subtasks });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, description, status, priority, assigned_to, due_date, parent_id, project_id, list_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const { rows: [row] } = await pool.query(
      `INSERT INTO tasks (workspace_id, parent_id, project_id, list_id, title, description, status, priority, assigned_to, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [req.workspaceId, parent_id||null, project_id||null, list_id||null,
       title.trim(), description||null, status||'todo', priority||'medium',
       assigned_to||null, due_date||null, req.userId]
    );
    // Only notify for parent tasks (not subtasks)
    if (!parent_id) {
      notify(req.workspaceId, req.userId, {
        type: 'task_created', category: 'tasks',
        title: `New task: ${title.trim()}`,
        body: assigned_to ? `Assigned` : null,
        entityType: 'task', entityId: row.id,
      });
    }
    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title, description, status, priority, assigned_to, due_date, custom_data } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const result = await pool.query(
      `UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4,
       assigned_to=$5, due_date=$6, custom_data=$7, updated_at=NOW()
       WHERE id=$8 AND workspace_id=$9`,
      [title.trim(), description||null, status, priority, assigned_to||null,
       due_date||null, JSON.stringify(custom_data||{}), req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3',
      [req.body.status, req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
