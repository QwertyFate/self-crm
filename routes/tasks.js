const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notify }  = require('../notifications');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { list_id, contact_id } = req.query;
    const params = [req.workspaceId];
    let filter = '';
    if (list_id)    { params.push(list_id);    filter += ` AND t.list_id = $${params.length}`; }
    if (contact_id) { params.push(contact_id); filter += ` AND t.contact_id = $${params.length}`; }   // the contact record's Tasks block

    const { rows } = await pool.query(`
      SELECT t.*,
             u.name  AS assigned_to_name,
             cu.name AS created_by_name,
             dl.title  AS deal_title,
             ct.name   AS contact_name,
             (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id) AS subtask_count,
             (SELECT COUNT(*)::int FROM tasks s WHERE s.parent_id = t.id AND s.status = 'done') AS subtask_done
      FROM tasks t
      LEFT JOIN users u  ON u.id = t.assigned_to
      LEFT JOIN users cu ON cu.id = t.created_by
      LEFT JOIN deals    dl ON dl.id = t.deal_id
      LEFT JOIN contacts ct ON ct.id = t.contact_id
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
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN deals    dl ON dl.id = t.deal_id
      LEFT JOIN contacts ct ON ct.id = t.contact_id
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
    const { title, description, status, priority, assigned_to, due_date, parent_id, project_id, list_id, deal_id, contact_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const dealId = deal_id ? parseInt(deal_id, 10) || null : null;
    const contactId = contact_id ? parseInt(contact_id, 10) || null : null;
    if (dealId) {
      const { rows: [d] } = await pool.query('SELECT 1 FROM deals WHERE id=$1 AND workspace_id=$2', [dealId, req.workspaceId]);
      if (!d) return res.status(400).json({ error: 'Deal not found in this workspace' });
    }
    if (contactId) {
      const { rows: [c] } = await pool.query('SELECT 1 FROM contacts WHERE id=$1 AND workspace_id=$2', [contactId, req.workspaceId]);
      if (!c) return res.status(400).json({ error: 'Contact not found in this workspace' });
    }
    const { rows: [row] } = await pool.query(
      `INSERT INTO tasks (workspace_id, parent_id, project_id, list_id, deal_id, contact_id, title, description, status, priority, assigned_to, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [req.workspaceId, parent_id||null, project_id||null, list_id||null, dealId, contactId,
       title.trim(), description||null, status||'todo', priority||'medium',
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
    const { title, description, status, priority, assigned_to, due_date, custom_data, project_id, list_id, deal_id, contact_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    const dealId = deal_id ? parseInt(deal_id, 10) || null : null;
    const contactId = contact_id ? parseInt(contact_id, 10) || null : null;
    if (dealId) {
      const { rows: [d] } = await pool.query('SELECT 1 FROM deals WHERE id=$1 AND workspace_id=$2', [dealId, req.workspaceId]);
      if (!d) return res.status(400).json({ error: 'Deal not found in this workspace' });
    }
    if (contactId) {
      const { rows: [c] } = await pool.query('SELECT 1 FROM contacts WHERE id=$1 AND workspace_id=$2', [contactId, req.workspaceId]);
      if (!c) return res.status(400).json({ error: 'Contact not found in this workspace' });
    }
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
