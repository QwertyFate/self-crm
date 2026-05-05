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

module.exports = router;
