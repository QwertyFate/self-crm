const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Parse @mentions from comment content and notify mentioned users
async function notifyMentionsInComment(workspaceId, actorId, actorName, content, commentId, activityId) {
  try {
    const plain = content.replace(/<[^>]*>/g, ' ');
    const mentions = plain.match(/@(\w+)/g);
    if (!mentions) return;

    const nameSet = new Set();
    mentions.forEach(m => {
      const name = m.slice(1).trim().toLowerCase();
      if (name) nameSet.add(name);
    });
    if (nameSet.size === 0) return;

    const { rows: users } = await pool.query(
      'SELECT id, name FROM users WHERE workspace_id = $1 AND LOWER(name) = ANY($2)',
      [workspaceId, [...nameSet]]
    );
    if (users.length === 0) return;

    // Get activity info for context
    const { rows: [activity] } = await pool.query(`
      SELECT a.contact_id, c.name AS contact_name
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.id = $1
    `, [activityId]);

    const preview = plain.replace(/@\w+/g, '').trim().slice(0, 100).replace(/\s+\S*$/, '') || 'a comment';
    const contactName = activity?.contact_name || 'a contact';

    let dealId = null;
    if (activity?.contact_id) {
      const { rows: deals } = await pool.query(
        'SELECT id FROM deals WHERE contact_id = $1 AND workspace_id = $2 ORDER BY updated_at DESC LIMIT 1',
        [activity.contact_id, workspaceId]
      );
      if (deals.length) dealId = deals[0].id;
    }

    const body = `In ${contactName}: "${preview}"`;

    for (const user of users) {
      if (user.id === actorId) continue;
      await pool.query(`
        INSERT INTO notifications (workspace_id, user_id, actor_id, type, category, title, body, entity_type, entity_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        workspaceId, user.id, actorId,
        'mention', 'activities',
        `${actorName} mentioned you in a comment`,
        body,
        dealId ? 'deal' : 'contact',
        dealId || (activity?.contact_id || null)
      ]);
    }
  } catch (e) {
    console.error('Comment mention notification error:', e.message);
  }
}

// GET /api/activity-comments?activity_id=X — get all comments for an activity (flat, with nesting info)
router.get('/', async (req, res, next) => {
  try {
    const activityId = parseInt(req.query.activity_id);
    if (!activityId) return res.status(400).json({ error: 'activity_id required' });

    const { rows } = await pool.query(`
      SELECT ac.*, u.name AS created_by_name
      FROM activity_comments ac
      LEFT JOIN users u ON u.id = ac.created_by
      WHERE ac.activity_id = $1 AND ac.workspace_id = $2
      ORDER BY ac.created_at ASC
    `, [activityId, req.workspaceId]);

    // Build threaded tree structure
    const map = {};
    const roots = [];
    rows.forEach(c => {
      map[c.id] = { ...c, children: [] };
    });
    rows.forEach(c => {
      if (c.parent_id && map[c.parent_id]) {
        map[c.parent_id].children.push(map[c.id]);
      } else if (!c.parent_id) {
        roots.push(map[c.id]);
      }
    });

    res.json(roots);
  } catch (e) { next(e); }
});

// POST /api/activity-comments — add a comment to an activity
router.post('/', async (req, res, next) => {
  try {
    const { activity_id, parent_id, content } = req.body;
    if (!activity_id) return res.status(400).json({ error: 'activity_id required' });
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

    // Verify the activity exists in this workspace
    const { rows: [activity] } = await pool.query(
      'SELECT id FROM activities WHERE id=$1 AND workspace_id=$2',
      [activity_id, req.workspaceId]
    );
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const { rows: [row] } = await pool.query(
      `INSERT INTO activity_comments (activity_id, parent_id, workspace_id, content, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [activity_id, parent_id || null, req.workspaceId, content.trim(), req.userId]
    );

    // Notify mentioned users in the comment
    const { rows: [actor] } = await pool.query('SELECT name FROM users WHERE id=$1', [req.userId]);
    await notifyMentionsInComment(req.workspaceId, req.userId, actor?.name || 'Someone', content, row.id, activity_id);

    // Return the full comment record
    const { rows: [comment] } = await pool.query(`
      SELECT ac.*, u.name AS created_by_name
      FROM activity_comments ac
      LEFT JOIN users u ON u.id = ac.created_by
      WHERE ac.id = $1
    `, [row.id]);

    res.status(201).json(comment);
  } catch (e) { next(e); }
});

// DELETE /api/activity-comments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM activity_comments WHERE id=$1 AND workspace_id=$2',
      [req.params.id, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;