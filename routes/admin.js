const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { db }  = require('../db');

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

router.get('/invites', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT pi.*, w.name AS used_by_workspace_name
    FROM platform_invites pi
    LEFT JOIN workspaces w ON w.id = pi.used_by_workspace_id
    ORDER BY pi.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/invites', requireAdmin, (req, res) => {
  const code   = crypto.randomBytes(16).toString('hex');
  const result = db.prepare('INSERT INTO platform_invites (code) VALUES (?)').run(code);
  res.status(201).json({ id: result.lastInsertRowid, code, used: 0, created_at: new Date().toISOString() });
});

router.delete('/invites/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM platform_invites WHERE id = ? AND used = 0').run(req.params.id);
  if (result.changes === 0) return res.status(400).json({ error: 'Code not found or already used.' });
  res.json({ success: true });
});

module.exports = router;
