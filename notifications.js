const { pool } = require('./db');

// Send a notification to all workspace members except the actor,
// respecting each user's notification preferences.
async function notify(workspaceId, actorId, { type, category, title, body, entityType, entityId }) {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, notification_prefs FROM users WHERE workspace_id=$1 AND id != $2',
      [workspaceId, actorId]
    );
    for (const user of users) {
      const prefs = user.notification_prefs || {};
      // Only skip if explicitly set to false
      if (category && prefs[category] === false) continue;
      await pool.query(
        `INSERT INTO notifications
           (workspace_id, user_id, actor_id, type, category, title, body, entity_type, entity_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [workspaceId, user.id, actorId, type, category, title, body||null, entityType||null, entityId||null]
      );
    }
  } catch (e) {
    // Notifications are non-critical — never crash the main request
    console.error('Notification error:', e.message);
  }
}

// Push a system announcement to all users (or all in a workspace)
async function notifySystem(title, body, workspaceId = null) {
  try {
    const query = workspaceId
      ? 'SELECT id FROM users WHERE workspace_id=$1'
      : 'SELECT id FROM users';
    const params = workspaceId ? [workspaceId] : [];
    const { rows: users } = await pool.query(query, params);
    for (const user of users) {
      await pool.query(
        `INSERT INTO notifications
           (workspace_id, user_id, actor_id, type, category, title, body)
         VALUES (
           (SELECT workspace_id FROM users WHERE id=$1),
           $1, NULL, 'system', 'system', $2, $3
         )`,
        [user.id, title, body]
      );
    }
  } catch (e) {
    console.error('System notification error:', e.message);
  }
}

module.exports = { notify, notifySystem };
