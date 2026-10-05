/* ═══════════════════════════════════════════════════════════════════════════
   /api/platform — the read-only window onto platform-wide settings.

   GET /features returns the same flags as the admin console's /api/admin/features,
   but for any logged-in user and without the admin secret, so the client can
   tell whether a feature exists at all. Today that is just tourEnabled, read
   by public/js/guide.js.

   Keep this router read-only. Anything that WRITES platform settings belongs
   in routes/admin.js behind ADMIN_SECRET.
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const requireAuth = require('../middleware/auth');
const { readFeatures } = require('../utils/features');

router.use(requireAuth);

router.get('/features', async (req, res, next) => {
  try {
    res.json(await readFeatures());
  } catch (e) { next(e); }
});

module.exports = router;
