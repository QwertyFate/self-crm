/* ═══════════════════════════════════════════════════════════════════════════
   requireAdmin — the gate on every PLATFORM console route.

   A completely separate auth scheme from middleware/auth.js: there is no user,
   no workspace and no role here. Two ways through:

     1. The console's session — `isAdmin`, set by POST /api/admin/login after
        matching ADMIN_SECRET. What the browser uses.
     2. The secret in the request itself (2026-10-07) — `admin_secret` in a
        JSON body, or the `X-Admin-Secret` header for GETs. What a script or an
        automation uses: one request, no cookie first. The secret is compared
        in constant time and REMOVED from the body before the handler runs, so
        it never reaches a result or a log line. It does not mint a session.

   With ADMIN_SECRET unset the admin API is off: a presented secret gets 503
   (same as POST /login), a missing or wrong one 401.

   It lives in its own file because two routers need it — routes/admin.js and
   routes/admin-provision.js, both mounted at /api/admin — and one definition
   of the platform boundary is better than two.
   ═══════════════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');

function secretMatches(given, expected) {
  if (typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length) return false;              // timingSafeEqual throws on unequal lengths
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();

  const given = (req.body && typeof req.body === 'object' && 'admin_secret' in req.body)
    ? req.body.admin_secret
    : req.headers?.['x-admin-secret'];
  if (req.body && typeof req.body === 'object') delete req.body.admin_secret;

  if (given !== undefined && given !== '') {
    const expected = process.env.ADMIN_SECRET;
    if (!expected) return res.status(503).json({ error: 'ADMIN_SECRET is not configured on this server.' });
    if (secretMatches(given, expected)) return next();
  }
  return res.status(401).json({ error: 'Admin access required' });
}

module.exports = requireAdmin;
