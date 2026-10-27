/* ═══════════════════════════════════════════════════════════════════════════
   /api/mailbox — a person's own mailbox (EMAIL_SYNC_CHANGES Part 1, 2026-10-22).

   ONE mailbox per person per workspace (email_accounts, UNIQUE workspace_id +
   user_id). Everyone connects their own; the emails read from it (Part 2) are
   for the whole team. This part is the connection only: nothing is read yet.

   ENDPOINTS (all behind requireAuth; every query filters on the caller's
   workspace AND user — a person only ever sees or changes their own mailbox)
     GET    /                 { configured, account } — never the token
     GET    /google/start     a browser NAVIGATION, not a fetch: 302 to Google's consent screen
     GET    /google/callback  where Google sends the browser back; always a 302 to
                              /?mailbox=<word>: connected | denied | expired | scopes | taken |
                              failed | not_configured. public/js/mailbox.js turns it into a toast.
     DELETE /                 disconnect: the row is deleted, then the grant is revoked at Google
                              once no workspace uses that address any more

   NOT TWICE IN ONE WORKSPACE  an address another person there has already
     connected is refused ("taken"): the same mail would be read twice.
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const gmail       = require('../utils/gmail');
const baseUrl     = require('../utils/base-url');   // the public origin Google sends the browser back to

router.use(requireAuth);

const back = (res, word) => res.redirect(302, `/?mailbox=${word}`);
const callbackUrl = req => `${baseUrl(req)}/api/mailbox/google/callback`;
const answer = account => ({ configured: gmail.isConfigured(), account: account || null });

router.get('/', async (req, res, next) => {
  try {
    const { rows: [row] } = await pool.query(
      `SELECT provider, email_address, connected_at, last_error FROM email_accounts WHERE workspace_id=$1 AND user_id=$2`,
      [req.workspaceId, req.userId]
    );
    res.json(answer(row));
  } catch (err) { next(err); }
});

router.get('/google/start', (req, res) => {
  if (!gmail.isConfigured() || !baseUrl(req)) return back(res, 'not_configured');
  const state = gmail.signState({ userId: req.userId, workspaceId: req.workspaceId });
  res.redirect(302, gmail.authUrl({ redirectUri: callbackUrl(req), state }));
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (!gmail.isConfigured()) return back(res, 'not_configured');
  if (!gmail.checkState(state, { userId: req.userId, workspaceId: req.workspaceId })) return back(res, 'expired');
  if (error || typeof code !== 'string' || !code) return back(res, 'denied');   // error=access_denied: Cancel on Google's screen
  try {
    const tokens = await gmail.exchangeCode(code, callbackUrl(req));
    // No revoke on the refusals below: Google's revoke ends the person's whole grant, which another
    // workspace (or the teammate who already connected this address) may be using.
    if (!gmail.hasAllScopes(tokens.scopes)) return back(res, 'scopes');
    if (!tokens.refreshToken || !tokens.accessToken) return back(res, 'failed');
    const { emailAddress } = await gmail.profile(tokens.accessToken);
    const { rows: [other] } = await pool.query(
      `SELECT 1 FROM email_accounts WHERE workspace_id=$1 AND LOWER(email_address)=$2 AND user_id<>$3`,
      [req.workspaceId, emailAddress, req.userId]
    );
    if (other) return back(res, 'taken');
    await pool.query(
      `INSERT INTO email_accounts (workspace_id, user_id, provider, email_address, refresh_token_sealed, scopes)
       VALUES ($1,$2,'google',$3,$4,$5)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET provider='google', email_address=EXCLUDED.email_address,
         refresh_token_sealed=EXCLUDED.refresh_token_sealed, scopes=EXCLUDED.scopes,
         connected_at=NOW(), updated_at=NOW(), last_error=NULL`,
      [req.workspaceId, req.userId, emailAddress, gmail.sealToken(tokens.refreshToken), tokens.scopes.join(' ')]
    );
    back(res, 'connected');
  } catch (err) {
    if (!(err instanceof gmail.GmailError)) console.error('mailbox: Google callback failed:', err);
    back(res, 'failed');
  }
});

router.delete('/', async (req, res, next) => {
  try {
    const { rows: [gone] } = await pool.query(
      `DELETE FROM email_accounts WHERE workspace_id=$1 AND user_id=$2 RETURNING email_address, refresh_token_sealed`,
      [req.workspaceId, req.userId]
    );
    if (gone) {
      const { rows: [still] } = await pool.query(
        `SELECT 1 FROM email_accounts WHERE LOWER(email_address)=LOWER($1) LIMIT 1`, [gone.email_address]
      );
      if (!still) {
        let token = null;
        try { token = gmail.openToken(gone.refresh_token_sealed); } catch { /* sealed under an older server secret: nothing to revoke with */ }
        await gmail.revoke(token);
      }
    }
    res.json(answer(null));
  } catch (err) { next(err); }
});

module.exports = router;
