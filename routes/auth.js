const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { db, seedDefaultStages } = require('../db');
const { sendPasswordReset } = require('../utils/mailer');

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.json({ user: null });

  const user = db.prepare(
    'SELECT id, name, email, role, workspace_id FROM users WHERE id = ?'
  ).get(req.session.userId);

  const workspace = db.prepare(
    'SELECT id, name, kanban_fields FROM workspaces WHERE id = ?'
  ).get(req.session.workspaceId);

  if (!user || !workspace) {
    req.session.destroy(() => {});
    return res.json({ user: null });
  }

  try { workspace.kanban_fields = JSON.parse(workspace.kanban_fields); }
  catch { workspace.kanban_fields = ['company', 'email']; }

  res.json({ user, workspace });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });

  req.session.userId      = user.id;
  req.session.workspaceId = user.workspace_id;
  req.session.userRole    = user.role;

  const workspace = db.prepare('SELECT id, name, kanban_fields FROM workspaces WHERE id = ?').get(user.workspace_id);
  try { workspace.kanban_fields = JSON.parse(workspace.kanban_fields); }
  catch { workspace.kanban_fields = ['company', 'email']; }

  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, workspace });
});

router.post('/signup', (req, res) => {
  const { name, email, password, mode, workspace_name, invite_code, platform_invite_code } = req.body;

  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const normalizedEmail = email.toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail))
    return res.status(400).json({ error: 'Email already registered' });

  const password_hash = bcrypt.hashSync(password, 10);

  if (mode === 'create') {
    if (!workspace_name?.trim()) return res.status(400).json({ error: 'Workspace name required' });
    if (!platform_invite_code?.trim()) return res.status(400).json({ error: 'Platform invite code required' });

    const platformInvite = db.prepare(
      'SELECT * FROM platform_invites WHERE code = ? AND used = 0'
    ).get(platform_invite_code.trim());
    if (!platformInvite) return res.status(400).json({ error: 'Invalid or already used platform invite code' });

    const result = db.transaction(() => {
      const ws = db.prepare('INSERT INTO workspaces (name) VALUES (?)').run(workspace_name.trim());
      seedDefaultStages(ws.lastInsertRowid);
      const u = db.prepare(
        'INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES (?,?,?,?,?)'
      ).run(ws.lastInsertRowid, name.trim(), normalizedEmail, password_hash, 'owner');
      db.prepare('UPDATE platform_invites SET used = 1, used_by_workspace_id = ? WHERE id = ?')
        .run(ws.lastInsertRowid, platformInvite.id);
      return { userId: u.lastInsertRowid, workspaceId: ws.lastInsertRowid };
    })();

    req.session.userId      = result.userId;
    req.session.workspaceId = result.workspaceId;
    req.session.userRole    = 'owner';
    return res.status(201).json({ success: true });
  }

  if (mode === 'join') {
    if (!invite_code?.trim()) return res.status(400).json({ error: 'Invite code required' });

    const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(invite_code.trim());
    if (!invite)       return res.status(400).json({ error: 'Invalid invite code' });
    if (invite.used)   return res.status(400).json({ error: 'Invite code already used' });

    const result = db.transaction(() => {
      const u = db.prepare(
        'INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES (?,?,?,?,?)'
      ).run(invite.workspace_id, name.trim(), normalizedEmail, password_hash, 'member');
      db.prepare('UPDATE invite_codes SET used = 1, used_by = ? WHERE id = ?').run(u.lastInsertRowid, invite.id);
      return { userId: u.lastInsertRowid, workspaceId: invite.workspace_id };
    })();

    req.session.userId      = result.userId;
    req.session.workspaceId = result.workspaceId;
    req.session.userRole    = 'member';
    return res.status(201).json({ success: true });
  }

  res.status(400).json({ error: 'mode must be "create" or "join"' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase().trim());
  // Always respond success to prevent email enumeration
  if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

  // Invalidate any existing unused tokens for this user
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)').run(user.id, token, expiresAt);

  const base     = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const resetUrl = `${base}?reset=${token}`;

  const result = await sendPasswordReset(user.email, resetUrl);

  if (result.sent) {
    res.json({ success: true, message: 'Reset link sent — check your email.' });
  } else {
    // No SMTP configured: return the link so the admin can pass it on
    res.json({ success: true, resetUrl, message: 'Email not configured. Copy the link below.' });
  }
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const reset = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
  if (!reset)                          return res.status(400).json({ error: 'Invalid or expired reset link' });
  if (new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: 'Reset link has expired' });

  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
  })();

  res.json({ success: true });
});

module.exports = router;
