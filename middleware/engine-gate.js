/* ═══════════════════════════════════════════════════════════════════════════
   The platform switch and the error shaping for the Engine API paths.

   engineGate        — while utils/engine-controls.js says api_enabled: false,
                       every call to /api/kunden and /api/dokumente answers
                       503 api_deaktiviert (with Retry-After). Mounted after the
                       request log and the rate limiter, before the routers.
                       A failing controls read lets the request through: the gate
                       never takes the API down on its own.

   engineBodyErrors  — body-parser errors on those paths (malformed JSON, body
                       over the limit) happen BEFORE the routers run, so the
                       routers' own error handlers never see them and the global
                       handler would answer the browser's { error } shape. This
                       one, mounted right after express.json() for the two paths,
                       answers the Engine's { fehler } shape instead — and never
                       lets anything escape as a crash.
   ═══════════════════════════════════════════════════════════════════════════ */
const { readControls } = require('../utils/engine-controls');

const DISABLED = { fehler: { code: 'api_deaktiviert', nachricht: 'Die Engine-API ist vom Plattform-Administrator deaktiviert. Bitte später erneut versuchen.' } };

async function engineGate(req, res, next) {
  try {
    const controls = await readControls();
    if (controls.api_enabled === false) {
      res.set('Retry-After', '600');
      return res.status(503).json(DISABLED);
    }
  } catch (e) {
    console.error('engine gate:', e && e.message ? e.message : e);
  }
  next();
}

// eslint-disable-next-line no-unused-vars
function engineBodyErrors(err, req, res, next) {
  if (!err) return next();
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ fehler: { code: 'anfrage_zu_gross', nachricht: 'Der Request-Body ist zu groß.' } });
  }
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ fehler: { code: 'ungueltige_daten', nachricht: 'Der Request-Body ist kein gültiges JSON.' } });
  }
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500 && err.expose) {
    return res.status(err.status).json({ fehler: { code: 'ungueltige_daten', nachricht: String(err.message || 'Ungültige Anfrage.') } });
  }
  console.error('engine api:', err);
  res.status(500).json({ fehler: { code: 'serverfehler', nachricht: 'Interner Fehler. Bitte später erneut versuchen.' } });
}

module.exports = engineGate;
module.exports.engineBodyErrors = engineBodyErrors;
module.exports.DISABLED = DISABLED;
