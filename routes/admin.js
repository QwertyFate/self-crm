const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const { pool } = require('../db');

function requireAdmin(req, res, next) {
  if (!req.session?.isAdmin) return res.status(401).json({ error: 'Admin access required' });
  next();
}

router.get('/me', (req, res) => {
  res.json({ isAdmin: !!req.session?.isAdmin });
});

router.post('/login', (req, res) => {
  const { secret } = req.body;
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return res.status(503).json({ error: 'ADMIN_SECRET is not configured on this server.' });
  if (!secret || secret !== adminSecret) return res.status(401).json({ error: 'Invalid admin secret.' });
  req.session.isAdmin = true;
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

router.get('/invites', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT pi.*, w.name AS used_by_workspace_name
      FROM platform_invites pi
      LEFT JOIN workspaces w ON w.id = pi.used_by_workspace_id
      ORDER BY pi.created_at DESC
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/invites', requireAdmin, async (req, res, next) => {
  try {
    const code = crypto.randomBytes(16).toString('hex');
    const { rows: [row] } = await pool.query(
      'INSERT INTO platform_invites (code) VALUES ($1) RETURNING id, created_at',
      [code]
    );
    res.status(201).json({ id: row.id, code, used: 0, created_at: row.created_at });
  } catch (e) { next(e); }
});

router.delete('/invites/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM platform_invites WHERE id=$1 AND used=0',
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(400).json({ error: 'Code not found or already used.' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /api/admin/defaults - get current defaults
router.get('/defaults', requireAdmin, async (req, res, next) => {
  try {
    const [colRes, pipeRes] = await Promise.all([
      pool.query('SELECT value FROM platform_settings WHERE key=$1', ['default_contact_columns']),
      pool.query('SELECT value FROM platform_settings WHERE key=$1', ['default_pipelines'])
    ]);

    // Default contact columns if not yet customized
    const defaultColumns = [
      { key: 'company', label: 'Company', visible: true, isCustom: false },
      { key: 'email', label: 'Email', visible: true, isCustom: false },
      { key: 'phone', label: 'Phone', visible: true, isCustom: false },
      { key: 'stage_id', label: 'Stage', visible: true, isCustom: false },
      { key: 'assigned_to', label: 'Assignee', visible: true, isCustom: false },
      { key: 'created_at', label: 'Created At', visible: false, isCustom: false },
    ];

    const defaultPipelines = [
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

    const defaults = {
      contactColumns: colRes.rows[0] ? colRes.rows[0].value : defaultColumns,
      defaultPipelines: pipeRes.rows[0] ? pipeRes.rows[0].value : defaultPipelines,
    };
    res.json(defaults);
  } catch (e) { next(e); }
});

// PATCH /api/admin/defaults - update defaults (contact columns and/or pipelines)
router.patch('/defaults', requireAdmin, async (req, res, next) => {
  try {
    const { contactColumns, defaultPipelines } = req.body;
    const updates = [];

    if (contactColumns) {
      if (!Array.isArray(contactColumns)) {
        return res.status(400).json({ error: 'contactColumns must be an array' });
      }
      updates.push(
        pool.query(
          'INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
          ['default_contact_columns', JSON.stringify(contactColumns)]
        )
      );
    }

    if (defaultPipelines) {
      if (!Array.isArray(defaultPipelines)) {
        return res.status(400).json({ error: 'defaultPipelines must be an array' });
      }
      updates.push(
        pool.query(
          'INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
          ['default_pipelines', JSON.stringify(defaultPipelines)]
        )
      );
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    await Promise.all(updates);
    res.json({ success: true, message: 'Defaults updated successfully' });
  } catch (e) { next(e); }
});

// GET /api/admin/stats - workspace statistics
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const stats = {};

    const { rows: [workspaces] } = await pool.query('SELECT COUNT(*) as count FROM workspaces');
    stats.totalWorkspaces = parseInt(workspaces.count);

    const { rows: [users] } = await pool.query('SELECT COUNT(*) as count FROM users');
    stats.totalUsers = parseInt(users.count);

    const { rows: [contacts] } = await pool.query('SELECT COUNT(*) as count FROM contacts');
    stats.totalContacts = parseInt(contacts.count);

    const { rows: [deals] } = await pool.query('SELECT COUNT(*) as count FROM deals');
    stats.totalDeals = parseInt(deals.count);

    res.json(stats);
  } catch (e) { next(e); }
});

module.exports = router;
