const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { pool, seedDefaultStages, seedDefaultPipeline } = require('../db');
const { sendPasswordReset } = require('../utils/mailer');

router.get('/me', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.json({ user: null });

    const { rows: [user] } = await pool.query(
      'SELECT id, name, email, role, workspace_id, column_widths, deal_columns, analytics_layout FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (user) { user.column_widths = user.column_widths || {}; user.deal_columns = user.deal_columns || []; }
    const { rows: [workspace] } = await pool.query(
      'SELECT id, name, kanban_fields, contact_columns, whatsapp_template, deal_kanban_fields, miro_url, object_name, object_columns, supplier_name, task_statuses FROM workspaces WHERE id = $1',
      [req.session.workspaceId]
    );

    if (!user || !workspace) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }

    workspace.kanban_fields    = workspace.kanban_fields    || ['company', 'email'];
    workspace.contact_columns  = workspace.contact_columns  || [];
    res.json({ user, workspace });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows: [user] } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid email or password' });

    // Get all workspaces this user belongs to
    const { rows: memberships } = await pool.query(
      `SELECT w.id, w.name, uw.role
       FROM user_workspaces uw
       JOIN workspaces w ON w.id = uw.workspace_id
       WHERE uw.user_id = $1
       ORDER BY uw.joined_at ASC`,
      [user.id]
    );

    // If user has no memberships yet (old data), fall back to users.workspace_id
    if (!memberships.length) {
      await pool.query(
        `INSERT INTO user_workspaces (user_id, workspace_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [user.id, user.workspace_id, user.role]
      );
      memberships.push({ id: user.workspace_id, name: '', role: user.role });
    }

    // If user has multiple workspaces, return the list for the picker
    if (memberships.length > 1) {
      req.session.userId   = user.id;
      req.session.userRole = user.role;
      // Don't set workspaceId yet — wait for picker selection
      return res.json({
        needs_workspace_picker: true,
        workspaces: memberships,
        user: { id: user.id, name: user.name, email: user.email },
      });
    }

    // Single workspace — proceed as before
    const activeWsId = memberships[0].id;
    req.session.userId      = user.id;
    req.session.workspaceId = activeWsId;
    req.session.userRole    = memberships[0].role;

    const { rows: [workspace] } = await pool.query(
      'SELECT id, name, kanban_fields, contact_columns, whatsapp_template, deal_kanban_fields, miro_url, object_name, object_columns, supplier_name, task_statuses FROM workspaces WHERE id = $1',
      [activeWsId]
    );
    workspace.kanban_fields   = workspace.kanban_fields   || ['company', 'email'];
    workspace.contact_columns = workspace.contact_columns || [];
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: memberships[0].role, column_widths: user.column_widths || {}, deal_columns: user.deal_columns || [], analytics_layout: user.analytics_layout || {} }, workspace });
  } catch (e) { next(e); }
});

// POST /api/auth/select-workspace — called from workspace picker after login
router.post('/select-workspace', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
    const { workspace_id } = req.body;
    const { rows: [mem] } = await pool.query(
      'SELECT role FROM user_workspaces WHERE user_id=$1 AND workspace_id=$2',
      [req.session.userId, workspace_id]
    );
    if (!mem) return res.status(403).json({ error: 'Not a member of this workspace' });

    req.session.workspaceId = workspace_id;
    req.session.userRole    = mem.role;

    const { rows: [user] } = await pool.query(
      'SELECT id, name, email, column_widths, deal_columns, analytics_layout FROM users WHERE id=$1', [req.session.userId]
    );
    const { rows: [workspace] } = await pool.query(
      'SELECT id, name, kanban_fields, contact_columns, whatsapp_template, deal_kanban_fields, miro_url, object_name, object_columns, supplier_name, task_statuses FROM workspaces WHERE id=$1',
      [workspace_id]
    );
    workspace.kanban_fields   = workspace.kanban_fields   || ['company', 'email'];
    workspace.contact_columns = workspace.contact_columns || [];
    res.json({ user: { ...user, role: mem.role, column_widths: user.column_widths || {}, deal_columns: user.deal_columns || [], analytics_layout: user.analytics_layout || {} }, workspace });
  } catch (e) { next(e); }
});

// POST /api/auth/switch-workspace — switch active workspace (already logged in)
router.post('/switch-workspace', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
    const { workspace_id } = req.body;
    const { rows: [mem] } = await pool.query(
      'SELECT role FROM user_workspaces WHERE user_id=$1 AND workspace_id=$2',
      [req.session.userId, workspace_id]
    );
    if (!mem) return res.status(403).json({ error: 'Not a member of this workspace' });

    req.session.workspaceId = workspace_id;
    req.session.userRole    = mem.role;

    const { rows: [workspace] } = await pool.query(
      'SELECT id, name, kanban_fields, contact_columns, whatsapp_template, deal_kanban_fields, miro_url, object_name, object_columns, supplier_name, task_statuses FROM workspaces WHERE id=$1',
      [workspace_id]
    );
    workspace.kanban_fields   = workspace.kanban_fields   || ['company', 'email'];
    workspace.contact_columns = workspace.contact_columns || [];
    res.json({ workspace, role: mem.role });
  } catch (e) { next(e); }
});

// GET /api/auth/my-workspaces — list all workspaces for logged-in user
router.get('/my-workspaces', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { rows } = await pool.query(
      `SELECT w.id, w.name, uw.role
       FROM user_workspaces uw JOIN workspaces w ON w.id=uw.workspace_id
       WHERE uw.user_id=$1 ORDER BY uw.joined_at ASC`,
      [req.session.userId]
    );
    res.json({ workspaces: rows, active_workspace_id: req.session.workspaceId });
  } catch (e) { next(e); }
});

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password, mode, workspace_name, invite_code, platform_invite_code } = req.body;

    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const normalizedEmail = email.toLowerCase().trim();
    const { rows: [existing] } = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const password_hash = bcrypt.hashSync(password, 10);

    if (mode === 'create') {
      if (!workspace_name?.trim()) return res.status(400).json({ error: 'Workspace name required' });
      if (!platform_invite_code?.trim()) return res.status(400).json({ error: 'Platform invite code required' });

      const { rows: [platformInvite] } = await pool.query(
        'SELECT * FROM platform_invites WHERE code = $1 AND used = 0',
        [platform_invite_code.trim()]
      );
      if (!platformInvite) return res.status(400).json({ error: 'Invalid or already used platform invite code' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: [ws] } = await client.query(
          'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
          [workspace_name.trim()]
        );
        await seedDefaultPipeline(ws.id, client);
        const { rows: [u] } = await client.query(
          'INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [ws.id, name.trim(), normalizedEmail, password_hash, 'owner']
        );
        await client.query(
          'UPDATE platform_invites SET used=1, used_by_workspace_id=$1 WHERE id=$2',
          [ws.id, platformInvite.id]
        );
        await client.query(
          'INSERT INTO user_workspaces (user_id, workspace_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [u.id, ws.id, 'owner']
        );
        await client.query('COMMIT');
        req.session.userId      = u.id;
        req.session.workspaceId = ws.id;
        req.session.userRole    = 'owner';
        return res.status(201).json({ success: true });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    if (mode === 'join') {
      if (!invite_code?.trim()) return res.status(400).json({ error: 'Invite code required' });

      const { rows: [invite] } = await pool.query(
        'SELECT * FROM invite_codes WHERE code = $1',
        [invite_code.trim()]
      );
      if (!invite)      return res.status(400).json({ error: 'Invalid invite code' });
      if (invite.used)  return res.status(400).json({ error: 'Invite code already used' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: [u] } = await client.query(
          'INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [invite.workspace_id, name.trim(), normalizedEmail, password_hash, 'member']
        );
        await client.query(
          'UPDATE invite_codes SET used=1, used_by=$1 WHERE id=$2',
          [u.id, invite.id]
        );
        await client.query(
          'INSERT INTO user_workspaces (user_id, workspace_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [u.id, invite.workspace_id, 'member']
        );
        await client.query('COMMIT');
        req.session.userId      = u.id;
        req.session.workspaceId = invite.workspace_id;
        req.session.userRole    = 'member';
        return res.status(201).json({ success: true });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    res.status(400).json({ error: 'mode must be "create" or "join"' });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { rows: [user] } = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    await pool.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1,$2,$3)',
      [user.id, token, expiresAt]
    );

    const base     = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const resetUrl = `${base}?reset=${token}`;
    const result   = await sendPasswordReset(user.email, resetUrl);

    if (result.sent) {
      res.json({ success: true, message: 'Reset link sent — check your email.' });
    } else {
      res.json({ success: true, resetUrl, message: 'Email not configured. Copy the link below.' });
    }
  } catch (e) { next(e); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { rows: [reset] } = await pool.query(
      'SELECT * FROM password_resets WHERE token = $1 AND used = 0',
      [token]
    );
    if (!reset)                        return res.status(400).json({ error: 'Invalid or expired reset link' });
    if (new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: 'Reset link has expired' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [bcrypt.hashSync(password, 10), reset.user_id]);
      await client.query('UPDATE password_resets SET used=1 WHERE id=$1', [reset.id]);
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

router.patch('/preferences', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { column_widths, deal_columns } = req.body;
    if (column_widths && typeof column_widths === 'object' && !Array.isArray(column_widths)) {
      await pool.query('UPDATE users SET column_widths=$1 WHERE id=$2',
        [JSON.stringify(column_widths), req.session.userId]);
    }
    if (Array.isArray(deal_columns)) {
      await pool.query('UPDATE users SET deal_columns=$1 WHERE id=$2',
        [JSON.stringify(deal_columns), req.session.userId]);
    }
    res.json({ success: true });
  } catch (e) { next(e); }
});

// POST /api/auth/create-workspace — create a new workspace while already logged in
router.post('/create-workspace', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { workspace_name, platform_invite_code } = req.body;
    if (!workspace_name?.trim())      return res.status(400).json({ error: 'Workspace name required' });
    if (!platform_invite_code?.trim()) return res.status(400).json({ error: 'Platform invite code required' });

    const { rows: [invite] } = await pool.query(
      'SELECT * FROM platform_invites WHERE code=$1 AND used=0',
      [platform_invite_code.trim()]
    );
    if (!invite) return res.status(400).json({ error: 'Invalid or already used platform invite code' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [ws] } = await client.query(
        'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
        [workspace_name.trim()]
      );
      await seedDefaultPipeline(ws.id, client);
      await client.query(
        'INSERT INTO user_workspaces (user_id, workspace_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [req.session.userId, ws.id, 'owner']
      );
      await client.query(
        'UPDATE platform_invites SET used=1, used_by_workspace_id=$1 WHERE id=$2',
        [ws.id, invite.id]
      );
      await client.query('COMMIT');

      req.session.workspaceId = ws.id;
      req.session.userRole    = 'owner';

      const { rows: [workspace] } = await pool.query(
        'SELECT id, name, kanban_fields, contact_columns, whatsapp_template, deal_kanban_fields, miro_url, object_name, object_columns, supplier_name, task_statuses FROM workspaces WHERE id=$1',
        [ws.id]
      );
      workspace.kanban_fields   = workspace.kanban_fields   || ['company', 'email'];
      workspace.contact_columns = workspace.contact_columns || [];
      res.status(201).json({ workspace });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) { next(e); }
});

// POST /api/auth/join-workspace — join a new workspace while already logged in
router.post('/join-workspace', async (req, res, next) => {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { invite_code } = req.body;
    if (!invite_code?.trim()) return res.status(400).json({ error: 'Invite code required' });

    const { rows: [invite] } = await pool.query(
      'SELECT * FROM invite_codes WHERE code=$1', [invite_code.trim()]
    );
    if (!invite)     return res.status(400).json({ error: 'Invalid invite code' });
    if (invite.used) return res.status(400).json({ error: 'Invite code already used' });

    // Check if already a member
    const { rows: [existing] } = await pool.query(
      'SELECT 1 FROM user_workspaces WHERE user_id=$1 AND workspace_id=$2',
      [req.session.userId, invite.workspace_id]
    );
    if (existing) return res.status(400).json({ error: 'You are already a member of this workspace' });

    await pool.query(
      'INSERT INTO user_workspaces (user_id, workspace_id, role) VALUES ($1,$2,$3)',
      [req.session.userId, invite.workspace_id, 'member']
    );
    await pool.query('UPDATE invite_codes SET used=1, used_by=$1 WHERE id=$2', [req.session.userId, invite.id]);

    req.session.workspaceId = invite.workspace_id;
    req.session.userRole    = 'member';

    const { rows: [workspace] } = await pool.query(
      'SELECT id, name, kanban_fields, contact_columns, whatsapp_template, deal_kanban_fields, miro_url, object_name, object_columns, supplier_name, task_statuses FROM workspaces WHERE id=$1',
      [invite.workspace_id]
    );
    workspace.kanban_fields   = workspace.kanban_fields   || ['company', 'email'];
    workspace.contact_columns = workspace.contact_columns || [];
    res.json({ workspace });
  } catch (e) { next(e); }
});

module.exports = router;
