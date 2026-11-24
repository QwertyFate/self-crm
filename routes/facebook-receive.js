/* ═══════════════════════════════════════════════════════════════════════════
   /api/integrations/facebook/receive — PUBLIC: where Facebook says "a lead
   arrived" (FACEBOOK_CHANGES Part 3, 2026-11-24; utils/facebook.js has
   Facebook's side, utils/facebook-leads.js what becomes of a lead; the
   address is registered and the Pages are given in the admin console,
   routes/admin-facebook.js).

   ONE ADDRESS FOR THE WHOLE PLATFORM, as there is one Facebook app. No login
   and no key in the address: what counts is the signature. server.js keeps
   the request's bytes for it (express.raw on this path) and limits the
   requests per IP.

     GET  /receive   Facebook asks once, while the address is registered,
                     whether this is the right server: hub.mode=subscribe,
                     hub.verify_token (the word utils/facebook.js verifyToken
                     makes from the app's secret) and hub.challenge, which is
                     answered back as plain text. Everything else: 403.
     POST /receive   a message of Facebook's, signed with the app's secret
                     (X-Hub-Signature-256). Without a right signature: 401,
                     and nothing is read. Each lead it names is taken
                     (utils/facebook-leads.js take): fetched from Facebook and
                     handed to the lead webhook of the workspace the Page was
                     given to.
                     200  every lead is settled — a contact, or it is certain
                          that nothing will come of it (the reason is kept in
                          facebook_leads)
                     503  a lead could not be taken YET (Facebook did not
                          answer, the database was away, time ran out):
                          Facebook sends the message again, for up to 36
                          hours; what was taken is not taken twice
                     404  no Facebook app is set up on this server

   A message is answered within a time Facebook waits for: after BUDGET_MS the
   leads not yet looked at are left for the next sending.
   ═══════════════════════════════════════════════════════════════════════════ */

const express      = require('express');
const router       = express.Router();
const { pool }     = require('../db');
const facebook     = require('../utils/facebook');
const leads        = require('../utils/facebook-leads');
const integrations = require('./integrations');   // takeDelivery: what a delivery to a lead webhook becomes

const BUDGET_MS = 15000;

router.get('/receive', (req, res) => {
  const q = req.query, challenge = q['hub.challenge'];
  if (q['hub.mode'] !== 'subscribe' || !facebook.verifyMatches(q['hub.verify_token']) || typeof challenge !== 'string' || !/^[\w.-]{1,200}$/.test(challenge)) {
    return res.status(403).type('text/plain').send('Forbidden');
  }
  res.type('text/plain').send(challenge);
});

router.post('/receive', async (req, res) => {
  try {
    if (!facebook.isConfigured()) return res.status(404).json({ error: 'Not found' });
    // the raw bytes (server.js mounts express.raw on this path); a body some other parser already read is re-serialised
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    if (!facebook.signatureMatches(raw, req.get('X-Hub-Signature-256'))) return res.status(401).json({ error: 'Bad signature' });
    // signed by Facebook, but not about a Page's leads: confirmed, so that it is not sent again
    const events = facebook.leadEvents(raw) || [];
    const started = Date.now();
    let again = false;
    for (const ev of events) {
      if (Date.now() - started > BUDGET_MS) { again = true; break; }
      const out = await leads.take(pool, ev, { deliver: integrations.takeDelivery });
      if (out.retry) again = true;
    }
    if (again) return res.status(503).json({ error: 'Not every lead could be taken yet.' });
    res.json({ success: true });
  } catch (err) {
    console.error('facebook: a message could not be taken:', (err && err.message) || err);
    res.status(503).json({ error: 'Not every lead could be taken yet.' });
  }
});

router.BUDGET_MS = BUDGET_MS;
module.exports = router;
