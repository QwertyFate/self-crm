const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Parse @mentions from HTML content and notify mentioned users
async function notifyMentions(workspaceId, actorId, actorName, content, activityId) {
  try {
    // Strip HTML tags to get plain text
    const plain = content.replace(/<[^>]*>/g, ' ');
    // Match @mention: @ followed by word characters
    const mentions = plain.match(/@(\w+)/g);
    if (!mentions) return;

    // Get unique name candidates
    const nameSet = new Set();
    mentions.forEach(m => {
      const name = m.slice(1).trim().toLowerCase();
      if (name) nameSet.add(name);
    });
    if (nameSet.size === 0) return;

    // Find matching workspace members (match by first name or full name prefix)
    const { rows: users } = await pool.query(
      'SELECT id, name FROM users WHERE workspace_id = $1',
      [workspaceId]
    );
    const matched = users.filter(u => {
      const lowerName = u.name.toLowerCase();
      const words = lowerName.split(/\s+/);
      return [...nameSet].some(name =>
        lowerName === name ||
        lowerName.startsWith(name) ||
        words.some(w => w.startsWith(name))
      );
    });
    if (!matched.length) return;

    // Get activity info for richer notification body
    const { rows: [activity] } = await pool.query(`
      SELECT a.contact_id, a.type, c.name AS contact_name
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.id = $1
    `, [activityId]);

    // Get a preview of the note (first 120 chars of plain text)
    const preview = plain.replace(/@\w+/g, '').trim().slice(0, 120).replace(/\s+\S*$/, '') || 'a note';
    const contactName = activity?.contact_name || 'a contact';

    // Find which deal(s) are linked to this contact so we can navigate there
    let dealId = null;
    if (activity?.contact_id) {
      const { rows: deals } = await pool.query(
        'SELECT id FROM deals WHERE contact_id = $1 AND workspace_id = $2 ORDER BY updated_at DESC LIMIT 1',
        [activity.contact_id, workspaceId]
      );
      if (deals.length) dealId = deals[0].id;
    }

    const body = `In ${contactName}: "${preview}"`;

    for (const user of matched) {
      if (user.id === actorId) continue;
      await pool.query(`
        INSERT INTO notifications (workspace_id, user_id, actor_id, type, category, title, body, entity_type, entity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        workspaceId, user.id, actorId,
        'mention', 'activities',
        `${actorName} mentioned you in a note`,
        body,
        dealId ? 'deal' : 'contact',
        dealId || (activity?.contact_id || null)
      ]);
    }
  } catch (e) {
    console.error('Mention notification error:', e.message);
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, c.name AS contact_name,
             u.name AS logged_by_name, u.email AS logged_by_email
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN users   u ON u.id = a.created_by
      WHERE a.workspace_id = $1
      ORDER BY a.created_at DESC LIMIT 200
    `, [req.workspaceId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { contact_id, type, content, event_date } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    if (!['note','call','email','whatsapp'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    const { rows: [row] } = await pool.query(
      'INSERT INTO activities (workspace_id, contact_id, type, content, created_by, event_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.workspaceId, contact_id||null, type, content, req.userId, event_date || null]
    );

    // Notify mentioned users
    const { rows: [actor] } = await pool.query('SELECT name FROM users WHERE id=$1', [req.userId]);
    await notifyMentions(req.workspaceId, req.userId, actor?.name || 'Someone', content, row.id);

    res.status(201).json({ id: row.id });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows: [row] } = await pool.query(`
      SELECT a.*, u.name AS logged_by_name, u.email AS logged_by_email
      FROM activities a
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.id = $1 AND a.workspace_id = $2
    `, [req.params.id, req.workspaceId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { type, content, event_date } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    if (type && !['note','call','email','whatsapp'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    const result = await pool.query(
      'UPDATE activities SET type=$1, content=$2, event_date=$5 WHERE id=$3 AND workspace_id=$4 RETURNING id',
      [type, content, req.params.id, req.workspaceId, event_date || null]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Activity not found' });

    // Notify mentioned users on update too
    const { rows: [actor] } = await pool.query('SELECT name FROM users WHERE id=$1', [req.userId]);
    await notifyMentions(req.workspaceId, req.userId, actor?.name || 'Someone', content, result.rows[0].id);

    res.json({ success: true, id: result.rows[0].id });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM activities WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;