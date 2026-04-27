const { db } = require('../db');

module.exports = function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });

  // Verify user still exists in workspace (catches removed members)
  const user = db.prepare(
    'SELECT id, workspace_id, role FROM users WHERE id = ? AND workspace_id = ?'
  ).get(req.session.userId, req.session.workspaceId);

  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.userId      = user.id;
  req.workspaceId = user.workspace_id;
  req.userRole    = user.role;
  next();
};
