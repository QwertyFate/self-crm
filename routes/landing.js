/* ═══════════════════════════════════════════════════════════════════════════
   /api/landing — the request form on the landing page (LOGIN_LANDING_CHANGES Part 42, 2026-10-21).

   PUBLIC ON PURPOSE: visitors are not signed in. A request becomes a lead in the
   Upgrads team's own workspace by going to that workspace's inbound webhook, the
   same path every website form takes (routes/integrations.js, POST /receive/:key):
   so the field map, the contact matched by email, the deal in the chosen stage,
   the assignee and the delivery log all apply, and the page shows the product by
   using it.

   LANDING_LEAD_URL  the inbound webhook address of that workspace, copied from
                     Integrations → Webhook. Map name, email, company, phone and
                     message there, and switch on "create a deal". Unset: /status
                     says { ready: false } and the page sends the request by mail.

   GET  /status   { ready }: whether a request can be delivered (no secret in it)
   POST /ask      { name, email, company?, phone?, message?, lang?, website? }
                  website is a hidden field: filled means a bot, answered as a
                  success and sent nowhere. 400 without a name or a real-looking
                  email; 503 not set up; 502 when the webhook refuses or is silent.
   server.js limits /ask to five requests a quarter hour per address.
   ═══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const router  = express.Router();

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const line  = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
function leadUrl() {
  const u = String(process.env.LANDING_LEAD_URL || '').trim();
  return /^https?:\/\/\S+$/i.test(u) ? u : null;
}

router.get('/status', (req, res) => res.json({ ready: !!leadUrl() }));

router.post('/ask', async (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (line(b.website, 200)) return res.json({ success: true });   // the hidden field: a bot
  const lead = {
    name:    line(b.name, 120),
    email:   line(b.email, 254).toLowerCase(),
    company: line(b.company, 120),
    phone:   line(b.phone, 40),
    message: String(b.message ?? '').trim().slice(0, 1000),
  };
  if (lead.name.length < 2 || !EMAIL.test(lead.email)) return res.status(400).json({ error: 'invalid' });
  const url = leadUrl();
  if (!url) return res.status(503).json({ error: 'not_configured' });
  const body = Object.fromEntries(Object.entries(lead).filter(([, v]) => v));
  body.source = 'Landingpage';
  body.language = b.lang === 'en' ? 'en' : 'de';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!r.ok) { console.error('Landing request: the webhook answered', r.status); return res.status(502).json({ error: 'not_received' }); }
    res.json({ success: true });
  } catch (err) {
    console.error('Landing request: the webhook could not be reached:', err?.message || err);
    res.status(502).json({ error: 'not_received' });
  }
});

module.exports = router;
