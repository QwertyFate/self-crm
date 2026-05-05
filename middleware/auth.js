const { pool } = require('../db');

module.exports = async function requireAuth(req, res, next) {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });

    const { rows: [user] } = await pool.query(
      'SELECT id, workspace_id, role FROM users WHERE id = $1 AND workspace_id = $2',
      [req.session.userId, req.session.workspaceId]
    );

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.userId      = user.id;
    req.workspaceId = user.workspace_id;
    req.userRole    = user.role;
    next();
  } catch (e) {
    next(e);
  }
};
