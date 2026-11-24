/* ═══════════════════════════════════════════════════════════════════════════
   /api/activity-comments — threaded replies under one activity.

   A COMMENT belongs to an activity and may have a parent_id pointing at
   another comment, which is what makes threads. GET / returns them already
   ASSEMBLED INTO A TREE: flat rows come back from Postgres ordered by
   created_at, and the handler builds roots with nested children[] in JS. A
   comment whose parent is missing is dropped from the tree rather than
   orphaned at the root.

   POST / verifies the activity belongs to this workspace before inserting,
   then runs its own @mention scan. That scanner matches names EXACTLY
   (LOWER(name) = ANY(...)) while the one in routes/activities.js matches
   loosely — the same @ab can notify in one place and not the other. Worth
   unifying if you touch mentions.

   WHO SEES A COMMENT. A comment follows its activity, and the activity follows
   its deal or contact (utils/visibility.js): when the workspace holds members
   to what is assigned to them, a member gets no comments of a note they cannot
   see (an empty tree), cannot comment on it (404 'Activity not found', as for
   a note that does not exist) and cannot delete a comment under it (404).
   Owners, admins and workspaces without the switch run the statements unchanged.

   ENDPOINTS
     GET    /?activity_id=    required; returns the tree
     POST   /                 { activity_id, parent_id?, content }
     DELETE /:id
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const visibility  = require('../utils/visibility');    // members held to what is assigned to them

router.use(requireAuth);

// For a held member: "and the activity `col` points at is one this member sees". Nothing for everyone else.
function onSeenActivity(req, params, col) {
  if (!visibility.restricted(req)) return '';
  params.push(req.userId);
  return ` AND EXISTS (SELECT 1 FROM activities va WHERE va.id = ${col} AND ${visibility.rules.linked({ deal: 'va.deal_id', contact: 'va.contact_id' }, params.length)})`;
}

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

    const { rows: [activity] } = await pool.query(`
      SELECT a.contact_id, a.deal_id, c.name AS contact_name
      FROM activities a
      LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.id = $1
    `, [activityId]);

    const preview = plain.replace(/@\w+/g, '').trim().slice(0, 100).replace(/\s+\S*$/, '') || 'a comment';
    const contactName = activity?.contact_name || 'a contact';

    // The notification points at what the commented note hangs on: its own deal, else its contact. It used to point at
    // the contact's most recently updated deal, which can be somebody else's: the bell of a member held to their
    // own (routes/notifications.js) then hid a mention about a note they see, or showed one about a note they do not.
    const dealId = activity?.deal_id || null;

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

router.get('/', async (req, res, next) => {
  try {
    const activityId = parseInt(req.query.activity_id);
    if (!activityId) return res.status(400).json({ error: 'activity_id required' });

    const params = [activityId, req.workspaceId];
    const { rows } = await pool.query(`
      SELECT ac.*, u.name AS created_by_name
      FROM activity_comments ac
      LEFT JOIN users u ON u.id = ac.created_by
      WHERE ac.activity_id = $1 AND ac.workspace_id = $2${onSeenActivity(req, params, 'ac.activity_id')}
      ORDER BY ac.created_at ASC
    `, params);

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

router.post('/', async (req, res, next) => {
  try {
    const { activity_id, parent_id, content } = req.body;
    if (!activity_id) return res.status(400).json({ error: 'activity_id required' });
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

    const found = [activity_id, req.workspaceId];
    const { rows: [activity] } = await pool.query(
      `SELECT id FROM activities WHERE id=$1 AND workspace_id=$2${visibility.linked(req, found, { deal: 'activities.deal_id', contact: 'activities.contact_id' })}`,
      found
    );
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const { rows: [row] } = await pool.query(
      `INSERT INTO activity_comments (activity_id, parent_id, workspace_id, content, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [activity_id, parent_id || null, req.workspaceId, content.trim(), req.userId]
    );

    const { rows: [actor] } = await pool.query('SELECT name FROM users WHERE id=$1', [req.userId]);
    await notifyMentionsInComment(req.workspaceId, req.userId, actor?.name || 'Someone', content, row.id, activity_id);

    const { rows: [comment] } = await pool.query(`
      SELECT ac.*, u.name AS created_by_name
      FROM activity_comments ac
      LEFT JOIN users u ON u.id = ac.created_by
      WHERE ac.id = $1
    `, [row.id]);

    res.status(201).json(comment);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const params = [req.params.id, req.workspaceId];
    const result = await pool.query(
      `DELETE FROM activity_comments WHERE id=$1 AND workspace_id=$2${onSeenActivity(req, params, 'activity_comments.activity_id')}`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
