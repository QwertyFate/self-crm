// The public address of this CRM — the one thing every absolute URL the app hands out should
// agree on. With a .env, BASE_URL is that address (https://crm.upgrads.de behind a proxy, or
// http://office-mac.local:4001); without one, the address the request came in on is used, which
// is right on a LAN. server.js sets `trust proxy`, so req.protocol follows X-Forwarded-Proto.
//
//   baseUrl(req)        the Engine's download_url origin: APP_BASE_URL, then BASE_URL, then the
//                       request (briefing §5.2). APP_BASE_URL exists so the Engine can be given a
//                       different host than people use; nothing else reads it.
//   baseUrl.appUrl(req) the origin people see — the inbound webhook URL on the Integrations page
//                       and the login / webhook URLs the admin console hands a provisioned owner:
//                       APP_URL, then BASE_URL, then the request. null when nothing is known.
//   baseUrl.configured() BASE_URL alone, trimmed, or null — what the boot message shows instead
//                       of http://localhost:<port> when a .env names the public address.
const clean = v => (v == null ? '' : String(v).trim()).replace(/\/+$/, '');
const fromRequest = req => {
  if (!req || typeof req.get !== 'function') return null;
  const host = req.get('host');
  return host ? `${req.protocol || 'https'}://${host}` : null;
};

function baseUrl(req) {
  const env = [process.env.APP_BASE_URL, process.env.BASE_URL].map(clean).find(Boolean);
  return env || fromRequest(req);
}
baseUrl.appUrl     = req => [process.env.APP_URL, process.env.BASE_URL].map(clean).find(Boolean) || fromRequest(req);
baseUrl.configured = ()  => clean(process.env.BASE_URL) || null;

module.exports = baseUrl;
