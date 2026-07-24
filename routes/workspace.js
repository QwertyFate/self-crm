const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { seedDefaultPipeline } = require('../db');

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const { name, platform_invite_code } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Workspace name required' });
    if (!platform_invite_code?.trim()) return res.status(400).json({ error: 'Platform invite code required' });

    const { rows: [platformInvite] } = await pool.query(
      'SELECT * FROM platform_invites WHERE code = $1 AND used = 0',
      [platform_invite_code.trim()]
    );
    if (!platformInvite) return res.status(400).json({ error: 'Invalid or already used platform invite code' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get default contact columns and pipelines from admin settings
      let defaultContactColumns = [
        { key: 'company', label: 'Company', visible: true, isCustom: false },
        { key: 'email', label: 'Email', visible: true, isCustom: false },
        { key: 'phone', label: 'Phone', visible: true, isCustom: false },
        { key: 'stage_id', label: 'Stage', visible: true, isCustom: false },
        { key: 'assigned_to', label: 'Assignee', visible: true, isCustom: false },
        { key: 'created_at', label: 'Created At', visible: false, isCustom: false },
      ];
      let defaultPipelines = [
        {
          name: 'Sales Pipeline',
          stages: [
            { name: 'New', color: '#6b7280' },
            { name: 'Contacted', color: '#3b82f6' },
            { name: 'Proposal', color: '#f59e0b' },
            { name: 'Negotiation', color: '#8b5cf6' },
            { name: 'Won', color: '#22c55e' },
            { name: 'Lost', color: '#ef4444' },
          ]
        }
      ];

      try {
        const [colRes, pipeRes] = await Promise.all([
          client.query('SELECT value FROM platform_settings WHERE key=$1', ['default_contact_columns']),
          client.query('SELECT value FROM platform_settings WHERE key=$1', ['default_pipelines'])
        ]);
        if (colRes.rows[0]) defaultContactColumns = colRes.rows[0].value;
        if (pipeRes.rows[0]) defaultPipelines = pipeRes.rows[0].value;
      } catch (e) {
        // Use defaults if query fails
      }

      const { rows: [ws] } = await client.query(
        'INSERT INTO workspaces (name, contact_columns) VALUES ($1, $2) RETURNING id',
        [name.trim(), JSON.stringify(defaultContactColumns.filter(c => !c.isCustom))]
      );

      // Create default custom fields for contacts
      const customFields = defaultContactColumns.filter(c => c.isCustom);
      for (const field of customFields) {
        await client.query(
          'INSERT INTO custom_fields (workspace_id, name, field_key, type, options, position) VALUES ($1,$2,$3,$4,$5,$6)',
          [ws.id, field.name, field.key, field.type, JSON.stringify(field.options || []), 0]
        );
      }

      // Create default pipelines
      for (const pipeline of defaultPipelines) {
        const { rows: [p] } = await client.query(
          'INSERT INTO pipelines (workspace_id, name, position) VALUES ($1,$2,0) RETURNING id',
          [ws.id, pipeline.name]
        );
        for (let i = 0; i < (pipeline.stages || []).length; i++) {
          const stage = pipeline.stages[i];
          await client.query(
            'INSERT INTO pipeline_stages (workspace_id, pipeline_id, name, color, position) VALUES ($1,$2,$3,$4,$5)',
            [ws.id, p.id, stage.name, stage.color, i]
          );
        }
      }

      // Add current user to new workspace as owner
      const { rows: [currentUser] } = await client.query('SELECT name, email FROM users WHERE id=$1', [req.userId]);
      const { rows: [newUser] } = await client.query(
        'INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [ws.id, currentUser.name, currentUser.email, 'placeholder', 'owner']
      );

      await client.query(
        'INSERT INTO user_workspaces (user_id, workspace_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [newUser.id, ws.id, 'owner']
      );

      await client.query(
        'UPDATE platform_invites SET used=1, used_by_workspace_id=$1 WHERE id=$2',
        [ws.id, platformInvite.id]
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, workspace_id: ws.id });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) { next(e); }
});

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

router.delete('/', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });

    // Check if user has other workspaces
    const { rows: userWorkspaces } = await pool.query(
      'SELECT COUNT(*) as count FROM user_workspaces WHERE user_id=$1',
      [req.userId]
    );
    if (parseInt(userWorkspaces[0].count) <= 1) {
      return res.status(400).json({ error: 'Cannot delete your only workspace' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Delete all related data
      await client.query('DELETE FROM chat_messages WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM notifications WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM activities WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM contacts WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM custom_fields WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM stages WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM pipelines WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM deals WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM tasks WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM objects WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM user_workspaces WHERE workspace_id=$1', [req.workspaceId]);
      await client.query('DELETE FROM workspaces WHERE id=$1', [req.workspaceId]);
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

router.patch('/contact-columns', async (req, res, next) => {
  try {
    const { columns } = req.body;
    if (!Array.isArray(columns)) return res.status(400).json({ error: 'columns must be an array' });
    await pool.query('UPDATE workspaces SET contact_columns=$1 WHERE id=$2', [JSON.stringify(columns), req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/supplier-name', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    await pool.query('UPDATE workspaces SET supplier_name=$1 WHERE id=$2', [name.trim(), req.workspaceId]);
    res.json({ success: true, name: name.trim() });
  } catch (e) { next(e); }
});

router.patch('/task-statuses', async (req, res, next) => {
  try {
    const { statuses } = req.body;
    if (!Array.isArray(statuses) || !statuses.length)
      return res.status(400).json({ error: 'statuses must be a non-empty array' });
    await pool.query('UPDATE workspaces SET task_statuses=$1 WHERE id=$2',
      [JSON.stringify(statuses), req.workspaceId]);
    res.json({ success: true, statuses });
  } catch (e) { next(e); }
});

router.patch('/object-name', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    await pool.query('UPDATE workspaces SET object_name=$1 WHERE id=$2', [name.trim(), req.workspaceId]);
    res.json({ success: true, name: name.trim() });
  } catch (e) { next(e); }
});

router.patch('/object-columns', async (req, res, next) => {
  try {
    const { columns } = req.body;
    if (!Array.isArray(columns)) return res.status(400).json({ error: 'columns must be an array' });
    await pool.query('UPDATE workspaces SET object_columns=$1 WHERE id=$2', [JSON.stringify(columns), req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/miro-url', async (req, res, next) => {
  try {
    const { url } = req.body;
    await pool.query('UPDATE workspaces SET miro_url=$1 WHERE id=$2', [url || null, req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/whatsapp-template', async (req, res, next) => {
  try {
    const { template } = req.body;
    if (typeof template !== 'string') return res.status(400).json({ error: 'Template must be a string' });
    await pool.query('UPDATE workspaces SET whatsapp_template=$1 WHERE id=$2', [template, req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/kanban-fields', async (req, res, next) => {
  try {
    const { fields } = req.body;
    if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields must be an array' });
    await pool.query('UPDATE workspaces SET kanban_fields=$1 WHERE id=$2', [JSON.stringify(fields), req.workspaceId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
