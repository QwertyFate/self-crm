const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/members', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE workspace_id=$1 ORDER BY created_at ASC',
      [req.workspaceId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.delete('/members/:id', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const memberId = parseInt(req.params.id);
    if (memberId === req.userId) return res.status(400).json({ error: 'You cannot remove yourself' });

    const { rows: [member] } = await pool.query(
      'SELECT id, role FROM users WHERE id=$1 AND workspace_id=$2',
      [memberId, req.workspaceId]
    );
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.role === 'owner') return res.status(400).json({ error: 'Cannot remove the workspace owner' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE contacts SET assigned_to=NULL WHERE assigned_to=$1 AND workspace_id=$2', [memberId, req.workspaceId]);
      await client.query('DELETE FROM users WHERE id=$1 AND workspace_id=$2', [memberId, req.workspaceId]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) { next(e); }
});

router.patch('/name', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Workspace name required' });
    await pool.query('UPDATE workspaces SET name=$1 WHERE id=$2', [name.trim(), req.workspaceId]);
    res.json({ success: true, name: name.trim() });
  } catch (e) { next(e); }
});

router.patch('/contact-columns', async (req, res, next) => {
  try {
    const { columns } = req.body;
    if (!Array.isArray(columns)) return res.status(400).json({ error: 'columns must be an array' });
    await pool.query('UPDATE workspaces SET contact_columns=$1 WHERE id=$2', [columns, req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/kanban-fields', async (req, res, next) => {
  try {
    const { fields } = req.body;
    if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });
    await pool.query('UPDATE workspaces SET kanban_fields=$1 WHERE id=$2', [fields, req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
