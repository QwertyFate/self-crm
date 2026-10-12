// OPEN SIGNUP — may people create a workspace or join one WITHOUT a code?
//
//   OPEN_SIGNUP=true   yes, always
//   OPEN_SIGNUP=false  no: a platform invite code for a new workspace, a workspace invite code
//                      to join (the original behaviour; what a hosted multi-tenant install wants)
//   unset              yes in embedded mode (no DATABASE_URL — an internal tool on one machine,
//                      embedded.js), no otherwise
//
// Read at call time, not at load, so a test can flip it. Used by routes/auth.js (signup,
// create-workspace, join-workspace, GET /signup-options), routes/workspace.js (POST /), db.js
// (the first-run invite box is pointless when no code is needed) and server.js (the boot notice).
// Invite codes keep working in open mode — a workspace code is still the only way to join as admin.
function openSignup() {
  const v = String(process.env.OPEN_SIGNUP ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v))  return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  return !process.env.DATABASE_URL;
}

module.exports = { openSignup };
