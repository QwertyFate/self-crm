/* ═══════════════════════════════════════════════════════════════════════════
   /api/journey/unsubscribe — PUBLIC: the "no more emails" link at the end of a
   workflow's email (CUSTOMER_JOURNEY_CHANGES Part 4, 2026-11-19;
   utils/journey-run.js makes and checks the link).

   NO LOGIN: the person who opens it is a customer, not a user. The link is
   the contact's id with a signature only this server can make, so a link
   cannot be guessed or changed to switch another person's emails off. It asks
   nothing and reads nothing out: it sets contacts.journey_opt_out, after
   which no workflow sends that contact an email, and answers with a short
   page — the same page for a link that is no good, which only says less.

   server.js mounts it before the journey's other routes (which need a login)
   and gives it the webhooks' per-address limit.

   ONE-CLICK UNSUBSCRIBE (Part 17, 2026-11-20)  A workflow's email names this
   same address in its List-Unsubscribe header (utils/journey-mail.js). A mail
   program that shows its own "unsubscribe" button then sends a POST here for
   the person (RFC 8058) — no cookie, no login, a body this route does not
   read. It does what the link does and answers 200.

   ENDPOINTS
     GET  /:token   → 200 a short page (German and English)
     POST /:token   → the same: the contact's emails are switched off, 200
   ═══════════════════════════════════════════════════════════════════════════ */

const express    = require('express');
const router     = express.Router();
const { pool }   = require('../db');
const journeyRun = require('../utils/journey-run');

const page = (de, en) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>E-Mails</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#E9EDF2;color:#0F141C;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:460px;margin:24px;padding:28px 30px;background:#F5F7FA;border:1px solid #D3DAE3;border-radius:12px}p{margin:0 0 10px}p+p{color:#475263;font-size:14px}</style></head>
<body><main><p>${de}</p><p>${en}</p></main></body></html>`;

// The link a person pressed (GET) and a mail program's one-click unsubscribe for that person (POST): one answer.
async function unsubscribe(req, res, next) {
  try {
    const contactId = journeyRun.contactOfToken(req.params.token);
    if (contactId) await pool.query('UPDATE contacts SET journey_opt_out = true WHERE id = $1', [contactId]);
    res.status(200).type('html').send(contactId
      ? page('Es werden keine weiteren automatischen E-Mails an diese Adresse gesendet.', 'No further automatic emails will be sent to this address.')
      : page('Dieser Link ist nicht gültig.', 'This link is not valid.'));
  } catch (err) { next(err); }
}
router.get('/:token', unsubscribe);
router.post('/:token', unsubscribe);

module.exports = router;
