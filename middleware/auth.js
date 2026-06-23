const { pool } = require('../db');

module.exports = async function requireAuth(req, res, next) {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });

    // Support both old (users.workspace_id) and new (user_workspaces) membership
    const { rows: [membership] } = await pool.query(
      `SELECT uw.role, uw.workspace_id
       FROM user_workspaces uw
       WHERE uw.user_id = $1 AND uw.workspace_id = $2`,
      [req.session.userId, req.session.workspaceId]
    );

    if (!membership) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.userId      = req.session.userId;
    req.workspaceId = membership.workspace_id;
    req.userRole    = membership.role;
    next();
  } catch (e) {
    next(e);
  }
};
