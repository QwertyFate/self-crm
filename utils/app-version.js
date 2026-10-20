/* ═══════════════════════════════════════════════════════════════════════════
   APP VERSION — a fingerprint of the client files, so an open tab can notice
   a newer app and reload itself (public/js/core.js, "a new version").

   Computed once at start-up: a SHA-1 over the files the single-page app loads
   (public/index.html, public/style.css, public/js/*.js), in a fixed order,
   cut to twelve hex characters. A restart without client changes keeps the
   same value, so nobody's tab reloads for nothing; a deploy that changes any
   of those files changes it.

   Served by GET /api/version (server.js) and pushed to every socket on
   connect ('app:version').
   ═══════════════════════════════════════════════════════════════════════════ */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// The files that make up the app in the browser, relative to `root` (the public folder).
function clientFiles(root) {
  const js = fs.existsSync(path.join(root, 'js')) ? fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).sort().map(f => path.join('js', f)) : [];
  return ['index.html', 'style.css', 'break-game.css', ...js].filter(rel => fs.existsSync(path.join(root, rel)));
}

function computeVersion(root) {
  const h = crypto.createHash('sha1');
  for (const rel of clientFiles(root)) { h.update(rel); h.update('\0'); h.update(fs.readFileSync(path.join(root, rel))); h.update('\0'); }
  return h.digest('hex').slice(0, 12);
}

const PUBLIC = path.join(__dirname, '..', 'public');
let APP_VERSION;
try { APP_VERSION = computeVersion(PUBLIC); } catch { APP_VERSION = 'unknown'; }

module.exports = { APP_VERSION, computeVersion, clientFiles };
