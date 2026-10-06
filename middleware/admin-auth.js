/* ═══════════════════════════════════════════════════════════════════════════
   requireAdmin — the gate on every PLATFORM console route.

   A completely separate auth scheme from middleware/auth.js: there is no user,
   no workspace and no role here, only the `isAdmin` flag that
   POST /api/admin/login sets after matching the plaintext ADMIN_SECRET.

   It lives in its own file because two routers need it — routes/admin.js and
   routes/admin-provision.js, both mounted at /api/admin — and one definition
   of the platform boundary is better than two.
   ═══════════════════════════════════════════════════════════════════════════ */

function requireAdmin(req, res, next) {
  if (!req.session?.isAdmin) return res.status(401).json({ error: 'Admin access required' });
  next();
}

module.exports = requireAdmin;
