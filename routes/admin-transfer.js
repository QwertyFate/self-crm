/* ═══════════════════════════════════════════════════════════════════════════
   /api/admin/workspaces/:id/export — a whole workspace as one download, to be
   imported into the local CRM (branch v2.2.1local). The fourth router mounted
   at /api/admin, behind the same platform gate (middleware/admin-auth.js):
   the console's session, or X-Admin-Secret for a script.

   A COPY. The route only reads; the workspace stays exactly as it was. What
   goes into the bundle and what stays out, and why, is in the header of
   utils/workspace-export.js.

   THE RESPONSE  application/gzip, a .tar.gz named
   upgrads-<name>-<id>-<date>.tar.gz, Cache-Control: no-store — the bundle
   holds every member's password hash, so no proxy or browser cache may keep
   it. Everything is read before the first byte is sent: an error while
   reading is still a JSON 500, never half a file.

   ENDPOINTS
     GET /workspaces/:id/export   200 the bundle · 400 bad id · 404 no such workspace
   ═══════════════════════════════════════════════════════════════════════════ */

const express      = require('express');
const router       = express.Router();
const zlib         = require('zlib');
const { pipeline } = require('stream/promises');
const { pool }     = require('../db');
const requireAdmin = require('../middleware/admin-auth');
const { tarStream } = require('../utils/tar');
const { readWorkspace, bundleEntries, bundleFileName } = require('../utils/workspace-export');

router.get('/workspaces/:id/export', requireAdmin, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Workspace id must be a positive integer.' });

  let bundle;
  try {
    bundle = await readWorkspace(pool, id);
  } catch (e) { return next(e); }
  if (!bundle) return res.status(404).json({ error: 'Workspace not found.' });

  res.set({
    'Content-Type':        'application/gzip',
    'Content-Disposition': `attachment; filename="${bundleFileName(bundle)}"`,
    'Cache-Control':       'no-store',
  });
  try {
    await pipeline(tarStream(bundleEntries(bundle)), zlib.createGzip(), res);
  } catch (e) {
    res.destroy(e);   // the headers are sent; a cut-off download is the only signal left
  }
});

module.exports = router;
