/* ═══════════════════════════════════════════════════════════════════════════
   /api/notifications — reading the bell panel. The rows are WRITTEN elsewhere.

   Who creates them: notify() in notifications.js (called by the contacts,
   deals and tasks routes) and the @mention scanners in routes/activities.js
   and routes/activity-comments.js. Nothing in this file creates a
   notification except /announce.

   SCOPED BY USER, NOT WORKSPACE. Every query here filters on req.userId,
   because a notification row already belongs to one person. Remember that a
   person has one users row per workspace, so their notifications are
   naturally per workspace too.

   WHO SEES A NOTIFICATION. notify() writes one row per person for everything
   that happens in the workspace. When the workspace holds members to what is
   assigned to them (utils/visibility.js), such a member's bell leaves out —
   when it is READ, so a later reassignment or switch is respected — every
   notification about a deal or a contact they cannot see, and about a task
   the Tasks page would not show them (utils/task-visibility.js); the unread
   count is of what is left. A notification
   that names nothing (a system notice) stays; one whose deal, contact or
   task no longer exists is left out for them. A mention ("… mentioned you in
   a note") follows the deal or contact its row names, like any other — so
   whoever writes it must name the note's OWN deal, else its contact. The rows
   themselves are not touched: with the switch off again they are all there.
   Owners, admins and workspaces without the switch run the statement
   unchanged.

   PREFERENCES  users.notification_prefs is a map of category → boolean,
   honoured by notify() at CREATE time. Turning a category off means the rows
   are never written, so turning it back on shows nothing retroactively.

   ENDPOINTS
     GET    /                  newest 50 + an unread count
     PATCH  /:id/read · PATCH /read-all
     DELETE /clear             removes the already-read ones only
     PATCH  /preferences       { prefs: {...} }
     POST   /announce          owner only; a system notice to the workspace

   ⚠ /announce calls notifySystem(), which is broken for workspaces with more
     than one member (placeholder numbering bug) and swallows the error, so it
     reports success and delivers nothing. See notifications.js.
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { notifySystem } = require('../notifications');
const visibility  = require('../utils/visibility');    // members held to what is assigned to them
const taskRule    = require('../utils/task-visibility');   // … and which tasks that leaves them (the Tasks page's own rule)

router.use(requireAuth);

// What a notification is about, for a member held to their own: entity_type says which table entity_id is of. A deal
// and a contact follow the rule itself; a task follows the Tasks page's rule (utils/task-visibility.js: the deal or
// contact it hangs on, a subtask its parent too, a task on neither is nobody's lead), so the bell and that page
// agree; a notification that names nothing is for everyone. '' and nothing pushed for whoever is not held.
function ownBell(req, params) {
  if (!visibility.restricted(req)) return '';
  params.push(req.userId);
  const n = params.length;
  return ` AND (CASE WHEN n.entity_id IS NULL THEN true
        WHEN n.entity_type = 'deal' THEN EXISTS (SELECT 1 FROM deals nd WHERE nd.id = n.entity_id AND nd.workspace_id = n.workspace_id AND ${visibility.rules.deal('nd', n)})
        WHEN n.entity_type = 'contact' THEN EXISTS (SELECT 1 FROM contacts nc WHERE nc.id = n.entity_id AND nc.workspace_id = n.workspace_id AND ${visibility.rules.contact('nc', n)})
        WHEN n.entity_type = 'task' THEN EXISTS (SELECT 1 FROM tasks nt WHERE nt.id = n.entity_id AND nt.workspace_id = n.workspace_id AND ${taskRule.rule('nt', n)})
        ELSE true END)`;
}

router.get('/', async (req, res, next) => {
  try {
    const params = [req.userId];
    const { rows } = await pool.query(`
      SELECT n.*, u.name AS actor_name
      FROM notifications n
      LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = $1${ownBell(req, params)}
      ORDER BY n.created_at DESC
      LIMIT 50
    `, params);
    const unread = rows.filter(n => !n.read).length;
    res.json({ notifications: rows, unread });
  } catch (e) { next(e); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET read=true WHERE user_id=$1',
      [req.userId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.delete('/clear', async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE user_id=$1 AND read=true',
      [req.userId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

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
