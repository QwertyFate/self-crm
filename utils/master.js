/* ═══════════════════════════════════════════════════════════════════════════
   The master CRM — the platform's way into EVERY workspace, through the
   normal CRM UI (MASTER_ACCESS_CHANGES Part 1, 2026-11-09).

   WHY  The Upgrads team sets each customer's workspace up for them (pipelines,
        fields, integrations). They do it in the CRM itself, not in a second UI.

   HOW  POST /api/admin/crm-login (the admin console's "CRM-Zugang" tab)
        checks ADMIN_SECRET and puts `session.master` on a session that holds
        no user yet. From then on routes/auth.js lists EVERY workspace in the
        login picker and the in-app switcher. Entering one points the session
        at that workspace's OWNER (the oldest user_workspaces row with role
        owner), so middleware/auth.js passes unchanged and the CRM works
        exactly as it does for that owner. The user chose this over a member
        of its own (2026-11-09): what is done inside shows as the owner's.

   LOG  Every visit is one master_access_log row: the workspace, the owner row
        it acted as, entered_at, left_at, ip and user agent. The names are
        copied so a row outlives a deleted workspace or user.

   OFF  Master mode needs `isAdmin` too, so the console's logout ends it
        (routes/admin.js) as well as the CRM's (routes/auth.js).
   ═══════════════════════════════════════════════════════════════════════════ */
const { pool } = require('../db');

const isMaster = req => !!(req.session && req.session.isAdmin && req.session.master);

// Every workspace, for the picker and the switcher. The role shown is the one the visit acts with.
async function allWorkspaces() {
  const { rows } = await pool.query(`SELECT w.id, w.name, 'owner' AS role FROM workspaces w ORDER BY w.name ASC, w.id ASC`);
  return rows;
}

// The owner row a visit acts as, with the names the log keeps. null when the workspace has no owner (or no row).
async function ownerOf(workspaceId) {
  const { rows: [o] } = await pool.query(
    `SELECT u.id, u.name, w.name AS workspace_name
       FROM user_workspaces uw
       JOIN users u      ON u.id = uw.user_id
       JOIN workspaces w ON w.id = uw.workspace_id
      WHERE uw.workspace_id = $1 AND uw.role = 'owner'
      ORDER BY uw.joined_at ASC, u.id ASC
      LIMIT 1`,
    [workspaceId]
  );
  return o || null;
}

// Close the open visit, if any (switching on, logging out).
async function leave(req) {
  const m = req.session && req.session.master;
  if (!m || !m.logId) return;
  await pool.query('UPDATE master_access_log SET left_at = NOW() WHERE id = $1 AND left_at IS NULL', [m.logId]);
  m.logId = null;
}

// Enter a workspace as its owner: log the visit and point the session at the owner row.
// Returns the owner, or null when the id is not a workspace with an owner (the session is then unchanged).
async function enter(req, workspaceId) {
  const id = Number(workspaceId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const owner = await ownerOf(id);
  if (!owner) return null;
  await leave(req);
  const { rows: [log] } = await pool.query(
    `INSERT INTO master_access_log (workspace_id, user_id, workspace_name, user_name, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [id, owner.id, owner.workspace_name, owner.name, req.ip || null, String(req.get('user-agent') || '').slice(0, 300) || null]
  );
  req.session.userId      = owner.id;
  req.session.workspaceId = id;
  req.session.userRole    = 'owner';
  req.session.master.logId = log.id;
  return owner;
}

module.exports = { isMaster, allWorkspaces, ownerOf, enter, leave };
