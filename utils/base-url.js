// The absolute origin the Engine should use to reach this CRM — for the
// download_url values in dokument.hinzugefuegt, vertrag.unterschrieben and
// GET /api/kunden/:id/dokumente (briefing §5.2 "download_url").
//
// APP_BASE_URL, then BASE_URL (the one the e-mails already use), win when set:
// the canonical public origin behind a proxy or CDN. Otherwise the request's own
// protocol and Host header are used — server.js sets `trust proxy`, so
// req.protocol is https behind the usual X-Forwarded-Proto.
function baseUrl(req) {
  const env = [process.env.APP_BASE_URL, process.env.BASE_URL].map(v => (v == null ? '' : String(v).trim())).find(Boolean);
  if (env) return env.replace(/\/+$/, '');
  if (!req || typeof req.get !== 'function') return null;
  const host = req.get('host');
  if (!host) return null;
  return `${req.protocol || 'https'}://${host}`;
}

module.exports = baseUrl;
