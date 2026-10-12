// OPEN ADMIN — may the platform admin console (/adminconsole, /api/admin/*) be used WITHOUT the
// admin secret?
//
//   OPEN_ADMIN=true    yes, always
//   OPEN_ADMIN=false   no: ADMIN_SECRET gates it, and with ADMIN_SECRET unset the console is off
//                      (the original behaviour; what a hosted multi-tenant install wants)
//   unset              yes in embedded mode (no DATABASE_URL — an internal tool on one machine,
//                      embedded.js, where there is no .env to hold a secret), no otherwise
//
// Read at call time, not at load, so a test can flip it. Used by middleware/admin-auth.js (the
// gate waves everything through) and routes/admin.js (/me reports the console open, /login
// succeeds without a secret). Same shape as utils/open-signup.js, and the same warning: open means
// anyone who can reach the server is the platform admin — fine on a LAN, never on a public URL.
function openAdmin() {
  const v = String(process.env.OPEN_ADMIN ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v))  return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  return !process.env.DATABASE_URL;
}

module.exports = { openAdmin };
