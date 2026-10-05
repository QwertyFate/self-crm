/* ═══════════════════════════════════════════════════════════════════════════
   requireAuth — the 25 lines that make this app safely multi-tenant.
   Read this before anything else in the codebase.

   Every protected router starts with `router.use(requireAuth)`. On EVERY
   request it:
     1. rejects with 401 when there is no session user;
     2. looks up user_workspaces for (session.userId, session.workspaceId) —
        the membership is re-read from the database every single time, never
        trusted from the cookie, so removing someone logs them out instantly;
     3. destroys the session and 401s when that membership is gone;
     4. sets the three values the rest of the app runs on:
          req.userId       who is asking
          req.workspaceId  THE TENANT BOUNDARY — every query must filter on it
          req.userRole     'owner' | 'admin' | 'member', for role checks

   THE RULE  a route never takes a workspace id from the client. Not from the
   body, not from the query string, not from a path parameter. If you find
   yourself writing `WHERE id = $1` with an id out of req.params, ask what
   stops that id belonging to another workspace — the answer must be an
   `AND workspace_id = $n` in the same statement.

   Role checks are each route's own job (`if (req.userRole !== 'owner') ...`);
   this middleware only supplies the role.
   ═══════════════════════════════════════════════════════════════════════════ */

const { pool } = require('../db');

module.exports = async function requireAuth(req, res, next) {
  try {
    if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });

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
