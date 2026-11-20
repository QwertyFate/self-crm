/* ═══════════════════════════════════════════════════════════════════════════
   /api/journey/mail — the workspace's sending address for the Customer Journey
   (CUSTOMER_JOURNEY_CHANGES Part 2, 2026-11-19; utils/journey-mail.js has the
   Google side and the setup; public/js/journey-mail.js the window).

   ONE ADDRESS PER WORKSPACE (workspace_mail), not one per person: the emails
   of the journey go out from it whoever set a step up. An owner or admin
   connects it by signing in on Google's own page; the CRM never sees a
   password and may only send, not read. Everyone in the workspace may see
   which address is connected. The sealed refresh token never leaves the
   server: no answer of this route carries it.

   ENDPOINTS (all behind requireAuth; every statement filters on the caller's
   workspace, but for one question that reads nothing out: "does any workspace
   still send with this address", asked before a grant is revoked)
     GET    /                 { configured, can_manage, connection, sending } — connection is null or
                              { provider, email, connected_at, connected_by_name } (everyone); sending is null
                              without a connection, else what holds for sending from the address (Part 17):
                              { kind: 'personal' | 'workspace', google_day, limits: { day, hour, person },
                                defaults: {…}, max: {…}, sent: { day, hour }, paused_until, pause_reason,
                                pause_detail }
     PUT    /limits           { day, hour, person } — whole numbers, or null for "the default" (owner/admin):
                              day 1..max.day, hour 1..day, person 1..20. Answers what GET answers; 400 limits
     POST   /resume           lifts a pause of the address now (owner/admin). Answers what GET answers
     GET    /google/start     a browser NAVIGATION, not a fetch: 302 to Google's sign-in page (owner/admin)
     GET    /google/callback  where Google sends the browser back; always a 302 to
                              /?journey_mail=<word>: connected | denied | expired | scopes | failed |
                              not_configured | forbidden. public/js/journey-mail.js says it in words.
     POST   /test             { lang? } sends a short test email from the connected address to the
                              caller's own login address (owner/admin). Its text is fixed here: nothing a
                              caller writes is sent. 409 not_connected, 409 gone (sign in again),
                              502 rejected { detail } / unreachable. It is an email like any other (Part 17):
                              counted, and not sent — 409 paused while sending is paused, 409 limit while the
                              day is full; Google answering "limit" to it pauses the address (409 paused)
     DELETE /                 disconnect (owner/admin): the row is deleted, then the grant is revoked at
                              Google once no workspace uses that address any more

   REVOKING  Google's revoke ends the person's WHOLE grant to this app, every
     token of it. So it is asked for only when no workspace is left that uses
     the address — on a disconnect, and when another address takes its place.
     Connecting the same address again revokes nothing: the new token belongs
     to the same grant.

   THE LIMITS AND THE PAUSE (Part 17, 2026-11-20) are utils/journey-sends.js:
     what holds for an address, how much went out from it, and when Google
     said "limit". They belong to the ADDRESS — a second workspace that sends
     with it shares the count and the pause — while the three numbers an
     owner or admin sets are the connection's own. Another address taking a
     connection's place starts with the defaults.
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const mail        = require('../utils/journey-mail');
const sends       = require('../utils/journey-sends');   // the sending limits, the count and the pause (Part 17)
const baseUrl     = require('../utils/base-url');   // the public origin Google sends the browser back to
const { notifyUser } = require('../notifications');   // owners and admins hear of a pause

router.use(requireAuth);

const ERRORS = {
  forbidden:     [403, 'Owner or admin only'],
  not_connected: [409, 'No address is connected'],
  no_address:    [409, 'The signed-in account has no valid email address'],
  gone:          [409, 'Google no longer accepts this connection; sign in with Google again'],
  rejected:      [502, 'Google refused the email'],
  unreachable:   [502, 'Google could not be reached'],
  limits:        [400, 'The limits are whole numbers or null: day from 1 to what Google allows the address, hour from 1 to the day, person from 1 to 20'],
  paused:        [409, 'Sending from this address is paused'],
  limit:         [409, 'The daily sending limit of this address is reached'],
};
const refuse = (res, code, detail) => res.status(ERRORS[code][0]).json({ error: ERRORS[code][1], code, ...(detail ? { detail } : {}) });

const canManage = role => role === 'owner' || role === 'admin';
function requireManage(req, res, next) {
  if (!canManage(req.userRole)) return refuse(res, 'forbidden');
  next();
}

const back = (res, word) => res.redirect(302, `/?journey_mail=${word}`);
const callbackUrl = req => `${baseUrl(req)}/api/journey/mail/google/callback`;

async function loadRow(wid) {
  const { rows: [row] } = await pool.query(
    `SELECT m.provider, m.email, m.connected_at, m.refresh_token_sealed, u.name AS connected_by_name
       FROM workspace_mail m LEFT JOIN users u ON u.id = m.connected_by
      WHERE m.workspace_id = $1`, [wid]
  );
  return row || null;
}
// What the page may know: which address, since when, connected by whom — and what holds for sending from it (its
// limits, how much went out, a pause). Never the token.
async function answer(req, row) {
  return {
    configured: mail.isConfigured(), can_manage: canManage(req.userRole),
    connection: row ? { provider: row.provider, email: row.email, connected_at: row.connected_at, connected_by_name: row.connected_by_name || null } : null,
    sending: row ? sends.sendingOf(await sends.read(pool, req.workspaceId)) : null,
  };
}

// An address this workspace has let go of: its grant is ended at Google unless another workspace still sends with it.
async function dropGrant(gone) {
  const { rows: [still] } = await pool.query('SELECT 1 FROM workspace_mail WHERE email = $1 LIMIT 1', [gone.email]);
  if (still) return;
  let token = null;
  try { token = mail.openToken(gone.refresh_token_sealed); } catch { /* sealed under an older server secret: nothing to revoke with */ }
  await mail.revoke(token);
}

router.get('/', async (req, res, next) => {
  try { res.json(await answer(req, await loadRow(req.workspaceId))); }
  catch (err) { next(err); }
});

// The connection's three limits (Part 17). null for one of them: the default for the address's kind.
router.put('/limits', requireManage, async (req, res, next) => {
  try {
    const row = await loadRow(req.workspaceId);
    if (!row) return refuse(res, 'not_connected');
    const limits = sends.readLimits(row.email, req.body);
    if (!limits) return refuse(res, 'limits');
    await sends.saveLimits(pool, req.workspaceId, limits);
    res.json(await answer(req, row));
  } catch (err) { next(err); }
});

// "Send again now": a pause is lifted before its time — for the address, in every workspace that sends with it.
router.post('/resume', requireManage, async (req, res, next) => {
  try {
    const row = await loadRow(req.workspaceId);
    if (!row) return refuse(res, 'not_connected');
    await sends.resume(pool, row.email);
    res.json(await answer(req, row));
  } catch (err) { next(err); }
});

router.get('/google/start', (req, res) => {
  if (!canManage(req.userRole)) return back(res, 'forbidden');
  if (!mail.isConfigured() || !baseUrl(req)) return back(res, 'not_configured');
  const state = mail.signState({ userId: req.userId, workspaceId: req.workspaceId });
  res.redirect(302, mail.authUrl({ redirectUri: callbackUrl(req), state }));
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (!canManage(req.userRole)) return back(res, 'forbidden');
  if (!mail.isConfigured()) return back(res, 'not_configured');
  if (!mail.checkState(state, { userId: req.userId, workspaceId: req.workspaceId })) return back(res, 'expired');
  if (error || typeof code !== 'string' || !code) return back(res, 'denied');   // error=access_denied: Cancel on Google's page
  try {
    const tokens = await mail.exchangeCode(code, callbackUrl(req));
    // No revoke on the refusals below: it would end the whole grant, which this or another workspace may be using.
    if (!mail.canSend(tokens.scopes)) return back(res, 'scopes');   // "send email" was left unticked on Google's page
    if (!tokens.refreshToken || !tokens.email || !tokens.emailVerified) return back(res, 'failed');
    const { rows: [old] } = await pool.query('SELECT email, refresh_token_sealed FROM workspace_mail WHERE workspace_id = $1', [req.workspaceId]);
    await pool.query(
      `INSERT INTO workspace_mail (workspace_id, provider, email, refresh_token_sealed, connected_by)
       VALUES ($1,'google',$2,$3,$4)
       ON CONFLICT (workspace_id) DO UPDATE SET provider = 'google', email = EXCLUDED.email,
         refresh_token_sealed = EXCLUDED.refresh_token_sealed, connected_by = EXCLUDED.connected_by, connected_at = NOW()`,
      [req.workspaceId, tokens.email, mail.sealToken(tokens.refreshToken), req.userId]
    );
    if (old && old.email !== tokens.email) {   // another address took its place
      await sends.forget(pool, req.workspaceId);   // the old one's limits and pause are not the new one's (Part 17)
      await dropGrant(old);
    }
    back(res, 'connected');
  } catch (err) {
    if (!(err instanceof mail.MailError)) console.error('journey mail: Google callback failed:', err);
    back(res, 'failed');
  }
});

// The test email, in the language the page is shown in. Its words are fixed here.
const htmlText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const testHtml = (headline, lines) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#0F141C;max-width:520px">`
  + `<p style="margin:0 0 12px;font-size:17px;font-weight:bold;color:#18345D">${htmlText(headline)}</p>`
  + lines.map(l => `<p style="margin:0 0 12px">${htmlText(l)}</p>`).join('') + '</div>';
const TEST_MAIL = {
  de: from => {
    const subject = 'Test: Die E-Mail-Verbindung des CRM funktioniert';
    const lines = [`Diese Test-E-Mail wurde vom CRM über die verbundene Adresse ${from} gesendet.`, 'Die E-Mails der Workflows werden von dieser Adresse gesendet.'];
    return { subject, text: lines.join('\n\n'), html: testHtml('Die Verbindung funktioniert', lines) };
  },
  en: from => {
    const subject = 'Test: the CRM\'s email connection works';
    const lines = [`This test email was sent by the CRM through the connected address ${from}.`, 'The emails of the workflows are sent from this address.'];
    return { subject, text: lines.join('\n\n'), html: testHtml('The connection works', lines) };
  },
};

router.post('/test', requireManage, async (req, res, next) => {
  try {
    const row = await loadRow(req.workspaceId);
    if (!row) return refuse(res, 'not_connected');
    const { rows: [me] } = await pool.query(
      'SELECT u.email FROM users u JOIN user_workspaces uw ON uw.user_id = u.id WHERE u.id = $1 AND uw.workspace_id = $2', [req.userId, req.workspaceId]
    );
    const to = String(me?.email || '').trim().toLowerCase();
    if (!mail.isAddress(to)) return refuse(res, 'no_address');
    let refreshToken;
    try { refreshToken = mail.openToken(row.refresh_token_sealed); }
    catch { return refuse(res, 'gone'); }   // sealed under an older server secret: only a new sign-in helps
    // Part 17: a test email is an email. While the address is paused or its day is full, Google is not asked.
    const now = new Date(), door = await sends.gate(pool, { workspaceId: req.workspaceId, now, test: true });
    if (!door.state) return refuse(res, 'not_connected');
    if (!door.ok) return refuse(res, door.why === 'paused' ? 'paused' : 'limit', door.state.pause_detail);
    try {
      const token = await mail.accessToken(refreshToken);
      const words = TEST_MAIL[req.body?.lang === 'en' ? 'en' : 'de'](row.email);
      await mail.send(token, mail.buildMessage({ from: row.email, to, ...words }));
    } catch (err) {
      if (!(err instanceof mail.MailError)) throw err;
      if (err.code === 'limited') {   // Google itself says "limit": the address is paused, as for a workflow's email
        await sends.pause(pool, { from: row.email, now, retryAt: err.retryAt, detail: err.message, tell: { notifyUser } });
        return refuse(res, 'paused', err.message);
      }
      return refuse(res, err.code, err.code === 'rejected' ? err.message : undefined);
    }
    await sends.sent(pool, { workspaceId: req.workspaceId, from: row.email, kind: 'test', now, state: door.state })
      .catch(err => console.error('journey mail: a sent test email could not be counted:', err?.message || err));   // it is out all the same
    res.json({ success: true, to });
  } catch (err) { next(err); }
});

router.delete('/', requireManage, async (req, res, next) => {
  try {
    const { rows: [gone] } = await pool.query('DELETE FROM workspace_mail WHERE workspace_id = $1 RETURNING email, refresh_token_sealed', [req.workspaceId]);
    if (gone) await dropGrant(gone);
    res.json(await answer(req, null));
  } catch (err) { next(err); }
});

module.exports = router;
