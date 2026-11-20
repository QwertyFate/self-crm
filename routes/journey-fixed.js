/* ═══════════════════════════════════════════════════════════════════════════
   /api/journey/fixed — the workflows of the integrations
   (CUSTOMER_JOURNEY_CHANGES Part 8, 2026-11-19; utils/journey-fixed.js draws
   them from the integrations' settings, public/js/journey-fixed.js shows them).

   What fonio, the lead webhooks, the Upgrads Engine, Cal.com and Calendly do
   stands on the Workflows page as workflows nobody edits there. Nothing of
   them is kept: every answer is drawn from the settings as they are now.

   THE SWITCH of a fixed workflow is the integration's own switch — the same
   column its own page saves — so it can be switched off (and on again) from
   either page, and both show the same. Cal.com and Calendly have none: they
   happen while they are connected.

   WHO  Everyone in the workspace reads them, as everyone reads the workflows;
   the switch is owner/admin only, as every change on the Workflows page is.
   Who and where always come from the session. Every refusal carries a `code`.

   ENDPOINTS
     GET /        { fixed: [{ key, source, name, active, switchable, blocked, steps }], can_manage } (everyone)
     PUT /:key    { active } → { fixed } as it is afterwards (owner/admin); 400 active (not true or false),
                  400 no_switch, 404 not_found, 409 fonio_off (fonio itself is switched off)
   ═══════════════════════════════════════════════════════════════════════════ */

const express      = require('express');
const router       = express.Router();
const { pool }     = require('../db');
const requireAuth  = require('../middleware/auth');
const journeyFixed = require('../utils/journey-fixed');

router.use(requireAuth);

const ERRORS = {
  forbidden: [403, 'Owner or admin only'],
  active:    [400, 'active must be true or false'],
  no_switch: [400, 'This workflow has no switch: it happens while the service is connected'],
  fonio_off: [409, 'fonio is switched off; switch it on in its settings first'],
  not_found: [404, 'Not found'],
};
const refuse = (res, code) => res.status(ERRORS[code][0]).json({ error: ERRORS[code][1], code });
const canManage = role => role === 'owner' || role === 'admin';

router.get('/', async (req, res, next) => {
  try { res.json({ fixed: await journeyFixed.read(pool, req.workspaceId), can_manage: canManage(req.userRole) }); }
  catch (err) { next(err); }
});

router.put('/:key', async (req, res, next) => {
  try {
    if (!canManage(req.userRole)) return refuse(res, 'forbidden');
    const active = req.body?.active;
    if (typeof active !== 'boolean') return refuse(res, 'active');
    const out = await journeyFixed.setActive(pool, { workspaceId: req.workspaceId, key: req.params.key, active, userId: req.userId });
    if (out.code) return refuse(res, out.code);
    res.json({ fixed: await journeyFixed.read(pool, req.workspaceId) });
  } catch (err) { next(err); }
});

module.exports = router;
