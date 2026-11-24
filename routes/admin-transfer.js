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

   THE WAY BACK (WORKSPACE_IMPORT_CHANGES Part 1, 2026-11-24;
   utils/workspace-import.js has the rule and the reasons): the DATA of an
   export — contacts, deals, notes and how they hang together; no owner, no
   team — is brought INTO A WORKSPACE that exists here, chosen in the admin
   console (there is no import inside the CRM itself). An import only adds:
   no row that is here is replaced, changed or deleted. Part 1 is the CHECK:
   the file is read and what an import would add is said. It writes nothing.

   ENDPOINTS
     GET  /workspaces/:id/export         200 the bundle · 400 bad id · 404 no such workspace
     POST /workspaces/:id/import/check   :id = the workspace the file would go into; the export file is the
                                         request's body (server.js keeps its bytes) →
                                         { file: { name, exported_at, version }, into: { id, name },
                                           tables: [{ name, rows, adds, here, left_out }], unassigned,
                                           pipelines: [{ name, as }], not_included: [{ name, rows }],
                                           warnings: [string], blockers: [string], can_import }
                                         400 { error, code }: id · file · not_gzip · too_big · not_bundle · format ·
                                         version · shape  ·  404 workspace
     POST /workspaces/:id/import         the same file again: its data is added to the workspace (Part 2), in one
                                         transaction → { imported: { id, into, tables, unassigned, pipelines,
                                         not_included, warnings } } · the check's refusals · 409 blocked +
                                         blockers: [string] (nothing was written)
     GET  /workspaces/imports            the record: what was brought in, newest first (50)
   ═══════════════════════════════════════════════════════════════════════════ */

const express      = require('express');
const router       = express.Router();
const zlib         = require('zlib');
const { pipeline } = require('stream/promises');
const { pool }     = require('../db');
const requireAdmin = require('../middleware/admin-auth');
const { tarStream } = require('../utils/tar');
const { readWorkspace, bundleEntries, bundleFileName } = require('../utils/workspace-export');
const importer = require('../utils/workspace-import');

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

// The file of a request, read: { id, bundle } — or the refusal has been answered (null).
async function fileOf(req, res) {
  const id = /^[1-9]\d{0,9}$/.test(req.params.id) ? Number(req.params.id) : null;
  if (!id) { res.status(400).json({ error: 'Workspace id must be a positive integer.', code: 'id' }); return null; }
  const bytes = Buffer.isBuffer(req.body) && req.body.length ? req.body : null;
  if (!bytes) { res.status(400).json({ error: 'Choose the export file (.tar.gz).', code: 'file' }); return null; }
  try { return { id, bundle: await importer.readBundle(bytes) }; }
  catch (err) {
    if (!(err instanceof importer.ImportError)) throw err;
    res.status(400).json({ error: err.message, code: err.code });
    return null;
  }
}
const fileView = bundle => ({ name: String(bundle.workspace_name || ''), exported_at: typeof bundle.exported_at === 'string' ? bundle.exported_at : null, version: bundle.version });

// The check before an import: what the file would add to the workspace. It reads the file, this database's own
// description of its tables and what the workspace already has — and writes nothing.
router.post('/workspaces/:id/import/check', requireAdmin, async (req, res, next) => {
  try {
    const got = await fileOf(req, res);
    if (!got) return;
    const target = await importer.targetOf(pool, got.id, got.bundle);
    if (!target) return res.status(404).json({ error: 'Workspace not found.', code: 'workspace' });
    const plan = importer.plan(got.bundle, await importer.schemaOf(pool), target);
    res.set('Cache-Control', 'no-store');
    res.json({ file: fileView(got.bundle), into: target.workspace, ...plan, can_import: plan.blockers.length === 0 });
  } catch (err) { next(err); }
});

// The import: the file's data is added to the workspace — decided again as the check decided it, written in one
// transaction, by INSERT only (utils/workspace-import.js run). The file's name, for the record, comes in a header.
router.post('/workspaces/:id/import', requireAdmin, async (req, res, next) => {
  try {
    const got = await fileOf(req, res);
    if (!got) return;
    const name = String(req.get('X-File-Name') || '').replace(/[^\w.() -]/g, '').slice(0, 200);
    const out = await importer.run(pool, got.id, got.bundle, { file: { name } });
    if (!out.ok && out.code === 'workspace') return res.status(404).json({ error: 'Workspace not found.', code: 'workspace' });
    if (!out.ok) return res.status(409).json({ error: 'This file cannot be imported into this workspace as things are. Nothing was written.', code: 'blocked', blockers: out.blockers });
    const { ok, ...imported } = out;
    res.set('Cache-Control', 'no-store');
    res.json({ file: fileView(got.bundle), imported });
  } catch (err) { next(err); }
});

// The record of what was brought in, newest first.
router.get('/workspaces/imports', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, workspace_id, workspace_name, file_name, source_name, exported_at, counts, created_at FROM workspace_imports ORDER BY id DESC LIMIT 50');
    res.json({ imports: rows });
  } catch (err) { next(err); }
});

module.exports = router;
