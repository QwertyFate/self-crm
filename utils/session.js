/**
 * Promisified express-session helpers.
 *
 * Regenerating the session issues a new session ID and drops the old session
 * record. It must happen before authenticated state (userId / workspaceId /
 * isAdmin) is stored, so a session ID that an attacker planted in a victim's
 * browser can never be upgraded into a logged-in session.
 */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => (err ? reject(err) : resolve()));
  });
}

module.exports = { regenerateSession };
