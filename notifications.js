/* ═══════════════════════════════════════════════════════════════════════════
   NOTIFICATIONS (server side) — creating the rows the bell panel polls.

   notify(workspaceId, actorId, {type, category, title, body, entityType, entityId})
     Fans a notification out to every member of the workspace EXCEPT the actor,
     skipping anyone whose users.notification_prefs has that category off, in
     one multi-row INSERT. Called by the contacts, deals and tasks routes.
     entityType + entityId are what let the client jump to the record.

   notifySystem(title, body, workspaceId?)
     A system announcement to everyone (one workspace, or all of them).

   BOTH SWALLOW THEIR ERRORS ON PURPOSE: a failed notification must never fail
   the request that triggered it. The flip side is that a broken query here is
   invisible except in the log — which is exactly what happened to
   notifySystem (see below).

   ⚠ KNOWN BUG — notifySystem builds its VALUES list with a stride of 6
     placeholder slots per row but supplies only 4 parameters per row, so from
     the second user on the numbering runs past the end of the parameter array
     and Postgres rejects the statement. POST /api/notifications/announce
     therefore reports success and notifies nobody in any workspace with more
     than one member. Fix the stride to 4 and add a route test — load-route.js
     can inject this real module against a fake pool.

   These rows are read by routes/notifications.js and polled by
   public/js/notifications.js. Nothing here is realtime; chat is the only
   socket-pushed feature.
   ═══════════════════════════════════════════════════════════════════════════ */

const { pool } = require('./db');

async function notify(workspaceId, actorId, { type, category, title, body, entityType, entityId }) {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, notification_prefs FROM users WHERE workspace_id=$1 AND id != $2',
      [workspaceId, actorId]
    );
    const toNotify = users.filter(user => {
      const prefs = user.notification_prefs || {};
      return !(category && prefs[category] === false);
    });

    if (toNotify.length === 0) return;

    const values = toNotify.map((user, i) =>
      `($${i*9+1},$${i*9+2},$${i*9+3},$${i*9+4},$${i*9+5},$${i*9+6},$${i*9+7},$${i*9+8},$${i*9+9})`
    ).join(',');
    const params = toNotify.flatMap(user => [
      workspaceId, user.id, actorId, type, category, title, body||null, entityType||null, entityId||null
    ]);

    await pool.query(`
      INSERT INTO notifications
        (workspace_id, user_id, actor_id, type, category, title, body, entity_type, entity_id)
      VALUES ${values}
    `, params);
  } catch (e) {
    console.error('Notification error:', e.message);
  }
}

async function notifySystem(title, body, workspaceId = null) {
  try {
    const query = workspaceId
      ? 'SELECT id, workspace_id FROM users WHERE workspace_id=$1'
      : 'SELECT id, workspace_id FROM users';
    const params = workspaceId ? [workspaceId] : [];
    const { rows: users } = await pool.query(query, params);

    if (users.length === 0) return;

    const values = users.map((_, i) =>
      `($${i*6+1},$${i*6+2},NULL,'system','system',$${i*6+3},$${i*6+4})`
    ).join(',');
    const params2 = users.flatMap((user, i) => [
      user.workspace_id, user.id, title, body
    ]);

    await pool.query(`
      INSERT INTO notifications
        (workspace_id, user_id, actor_id, type, category, title, body)
      VALUES ${values}
    `, params2);
  } catch (e) {
    console.error('System notification error:', e.message);
  }
}

module.exports = { notify, notifySystem };
