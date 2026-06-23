const { pool } = require('./db');

// Send a notification to all workspace members except the actor,
// respecting each user's notification preferences.
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
    // Notifications are non-critical — never crash the main request
    console.error('Notification error:', e.message);
  }
}

// Push a system announcement to all users (or all in a workspace)
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
