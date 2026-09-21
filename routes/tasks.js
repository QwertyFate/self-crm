const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notify }  = require('../notifications');
// Every body id is checked against req.workspaceId before a write (FKs are
// global); status/priority are validated; every read-side join is scoped.
const { taskRefs, refCheck, allowedTaskStatuses, TASK_PRIORITIES } = require('../utils/workspace-refs');

router.use(requireAuth);

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
             dl.title  AS deal_title,
             ct.name   AS contact_name,
             (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id AND s.workspace_id = t.workspace_id) AS subtask_count,
             (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id AND s.workspace_id = t.workspace_id AND s.status = 'done') AS subtask_done
      FROM tasks t
      LEFT JOIN users u  ON u.id = t.assigned_to  AND u.workspace_id  = t.workspace_id
      LEFT JOIN users cu ON cu.id = t.created_by  AND cu.workspace_id = t.workspace_id
      LEFT JOIN deals    dl ON dl.id = t.deal_id    AND dl.workspace_id = t.workspace_id
      LEFT JOIN contacts ct ON ct.id = t.contact_id AND ct.workspace_id = t.workspace_id
      WHERE t.workspace_id = $1 ${filter}
      ORDER BY t.parent_id NULLS FIRST, t.created_at ASC
    `, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [task] } = await pool.query(`
      SELECT t.*, u.name AS assigned_to_name,
             dl.title AS deal_title, ct.name AS contact_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to     AND u.workspace_id  = t.workspace_id
      LEFT JOIN deals    dl ON dl.id = t.deal_id    AND dl.workspace_id = t.workspace_id
      LEFT JOIN contacts ct ON ct.id = t.contact_id AND ct.workspace_id = t.workspace_id
      WHERE t.id = $1 AND t.workspace_id = $2
    `, [req.params.id, req.workspaceId]);
    if (!task) return res.status(404).json({ error: 'Not found' });

    const { rows: subtasks } = await pool.query(`
      SELECT t.*, u.name AS assigned_to_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to AND u.workspace_id = t.workspace_id
      WHERE t.parent_id = $1 AND t.workspace_id = $2
      ORDER BY t.created_at ASC
    `, [req.params.id, req.workspaceId]);

    res.json({ ...task, subtasks });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, description, assigned_to, due_date, parent_id, project_id, list_id, deal_id, contact_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const ids = { parent_id, project_id, list_id, assigned_to, deal_id, contact_id };
    const badRef = refCheck(await taskRefs(pool, req.workspaceId, ids), ids);
    if (badRef) return res.status(400).json({ error: badRef });
    const status   = req.body.status   || 'todo';
    const priority = req.body.priority || 'medium';
    if (!(await allowedTaskStatuses(pool, req.workspaceId, project_id)).has(status)) return res.status(400).json({ error: 'Invalid status' });
    if (!TASK_PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
    const dealId = deal_id ? parseInt(deal_id, 10) || null : null;
    const contactId = contact_id ? parseInt(contact_id, 10) || null : null;
    const { rows: [row] } = await pool.query(
      `INSERT INTO tasks (workspace_id, parent_id, project_id, list_id, deal_id, contact_id, title, description, status, priority, assigned_to, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [req.workspaceId, parent_id||null, project_id||null, list_id||null, dealId, contactId,
       title.trim(), description||null, status, priority,
       assigned_to||null, due_date||null, req.userId]
    );
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
    const { title, description, assigned_to, due_date, custom_data, project_id, list_id, deal_id, contact_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const ids = { project_id, list_id, assigned_to, deal_id, contact_id };
    const badRef = refCheck(await taskRefs(pool, req.workspaceId, ids), ids);
    if (badRef) return res.status(400).json({ error: badRef });
    // PUT replaces the row: status must be supplied and valid (a missing one
    // used to fail the NOT NULL constraint with a 500); priority defaults.
    const status   = req.body.status;
    const priority = req.body.priority ?? 'medium';
    if (!status || !(await allowedTaskStatuses(pool, req.workspaceId, project_id)).has(status)) return res.status(400).json({ error: 'Invalid status' });
    if (!TASK_PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
    const dealId = deal_id ? parseInt(deal_id, 10) || null : null;
    const contactId = contact_id ? parseInt(contact_id, 10) || null : null;
    const result = await pool.query(
      `UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4,
       assigned_to=$5, due_date=$6, project_id=$7, list_id=$8,
       deal_id=$9, contact_id=$10, custom_data=$11, updated_at=NOW()
       WHERE id=$12 AND workspace_id=$13`,
      [title.trim(), description||null, status, priority, assigned_to||null,
       due_date||null, project_id||null, list_id||null,
       dealId, contactId, JSON.stringify(custom_data||{}), req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const status = req.body.status;
    // The task's own project decides which keys are valid.
    const { rows: [t] } = await pool.query('SELECT project_id FROM tasks WHERE id=$1 AND workspace_id=$2', [req.params.id, req.workspaceId]);
    if (!t) return res.status(404).json({ error: 'Not found' });
    if (!status || !(await allowedTaskStatuses(pool, req.workspaceId, t.project_id)).has(status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await pool.query(
      'UPDATE tasks SET status=$1, updated_at=NOW() WHERE id=$2 AND workspace_id=$3',
      [status, req.params.id, req.workspaceId]
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
