const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

router.get('/messages', async (req, res, next) => {
  try {
    const before = parseInt(req.query.before) || null;
    const params = [req.workspaceId];
    let cursor = '';
    if (before) { params.push(before); cursor = `AND m.id < $${params.length}`; }

    const { rows } = await pool.query(`
      SELECT m.id, m.content, m.created_at, m.user_id, u.name AS user_name
      FROM chat_messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1 ${cursor}
      ORDER BY m.created_at DESC LIMIT 50
    `, params);

    res.json({ messages: rows.reverse() });
  } catch (err) { next(err); }
});

router.get('/unread', async (req, res, next) => {
  try {
    const { rows: [row] } = await pool.query(`
      SELECT COUNT(*) AS count FROM chat_messages m
      WHERE m.workspace_id = $1 AND m.user_id != $2
        AND m.created_at > COALESCE(
          (SELECT last_read_at FROM chat_reads WHERE user_id=$2 AND workspace_id=$1),
          '1970-01-01'
        )
    `, [req.workspaceId, req.userId]);
    res.json({ unread: parseInt(row.count) });
  } catch (err) { next(err); }
});

router.post('/messages', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
    const { rows: [msg] } = await pool.query(
      `INSERT INTO chat_messages (workspace_id, user_id, content) VALUES ($1,$2,$3) RETURNING id, created_at`,
      [req.workspaceId, req.userId, content.trim()]
    );
    await pool.query(
      `INSERT INTO chat_reads (user_id, workspace_id, last_read_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id, workspace_id) DO UPDATE SET last_read_at = NOW()`,
      [req.userId, req.workspaceId]
    );
    res.status(201).json({ id: msg.id, created_at: msg.created_at });
  } catch (err) { next(err); }
});

router.patch('/read', async (req, res, next) => {
  try {
    await pool.query(
      `INSERT INTO chat_reads (user_id, workspace_id, last_read_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id, workspace_id) DO UPDATE SET last_read_at = NOW()`,
      [req.userId, req.workspaceId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
