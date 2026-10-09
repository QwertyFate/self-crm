/**
 * Engine API — GET /api/dokumente/:id/download (Developer Briefing §5.2:
 * "Binary data; a time-limited link is acceptable").
 *
 * Mounted at /api/dokumente, API-key auth (middleware/engine-auth.js), German
 * error shape like routes/engine-api.js. Answers 302 to a signed Supabase URL
 * that lives for 10 minutes; the Engine's HTTP client follows it and receives
 * the bytes. The document must belong to the key's workspace (404 otherwise —
 * never 403, nothing is enumerable across workspaces).
 *
 * Like engine-api.js this file never requires utils/engine.js: a read must not
 * produce a webhook.
 */
const express    = require('express');
const router     = express.Router();
const { pool }   = require('../db');
const engineAuth = require('../middleware/engine-auth');
const storage    = require('../storage');

router.use(engineAuth);

const SIGNED_URL_SECONDS = 600;
const fehler = (res, status, code, nachricht) => res.status(status).json({ fehler: { code, nachricht } });

router.get('/:id/download', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return fehler(res, 400, 'ungueltige_id', 'Die Dokument-ID muss eine ganze Zahl sein.');
    const { rows: [d] } = await pool.query(
      'SELECT storage_path FROM contact_documents WHERE id=$1 AND workspace_id=$2', [Number(req.params.id), req.workspaceId]
    );
    if (!d) return fehler(res, 404, 'nicht_gefunden', 'Dokument nicht gefunden.');
    const url = await storage.signedDocumentUrl(d.storage_path, SIGNED_URL_SECONDS);
    res.set('Cache-Control', 'no-store');
    res.redirect(302, url);
  } catch (e) { next(e); }
});

router.use((req, res) => fehler(res, 404, 'nicht_gefunden', 'Unbekannter Endpunkt.'));
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  console.error('engine-dokumente:', err);
  fehler(res, 500, 'serverfehler', 'Interner Fehler. Bitte später erneut versuchen.');
});

module.exports = router;
module.exports.SIGNED_URL_SECONDS = SIGNED_URL_SECONDS;
