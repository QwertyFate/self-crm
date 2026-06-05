const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notifySystem } = require('../notifications');

router.use(requireAuth);

// GET — list recent notifications for current user
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT n.*, u.name AS actor_name
      FROM notifications n
      LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [req.userId]);
    const unread = rows.filter(n => !n.read).length;
    res.json({ notifications: rows, unread });
  } catch (e) { next(e); }
});

// PATCH — mark one as read
router.patch('/:id/read', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// PATCH — mark all as read
router.patch('/read-all', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET read=true WHERE user_id=$1',
      [req.userId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// DELETE — clear all read notifications
router.delete('/clear', async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE user_id=$1 AND read=true',
      [req.userId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// PATCH — update notification preferences
router.patch('/preferences', async (req, res, next) => {
  try {
    const { prefs } = req.body;
    if (!prefs || typeof prefs !== 'object') return res.status(400).json({ error: 'prefs required' });
    await pool.query(
      'UPDATE users SET notification_prefs=$1 WHERE id=$2',
      [JSON.stringify(prefs), req.userId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// POST — admin pushes a system announcement (owner only)
router.post('/announce', async (req, res, next) => {
  try {
    if (req.userRole !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { title, body } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
    await notifySystem(title.trim(), body?.trim() || null, req.workspaceId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
