/* ═══════════════════════════════════════════════════════════════════════════
   /api/integrations/fonio — fonio.ai calls a new deal's contact (FONIO_CHANGES).

   ONE CONNECTION PER WORKSPACE (workspace_fonio): the company's fonio API key
   and fonio number, an active switch, the delay in minutes, which new deals
   trigger a call (created by hand, through the lead link), the number rules
   and the calling hours — db.js has the meaning of each column. Everyone may
   read the settings; saving and removing them are owner/admin only, as for
   Cal.com. The key is sealed like the Cal.com key (utils/calcom.js) and never
   leaves the server again: owners and admins see its last four characters.
   What fonio's API can and cannot do is in the header of utils/fonio.js.

   SAVING MERGES. A PUT names only what it changes; every other setting keeps
   its saved value (its default on the first save), so the tab's switch can
   send { active } alone. The first save needs api_key and from_number. A new
   api_key is checked with fonio once before anything is written (400 refused,
   502 fonio not reachable or busy); a save without one keeps the saved key and
   asks fonio nothing. Every refusal names its reason, so the Integrations page
   can say it in the page's language. hours_tz is stamped from the saver's
   own zone (req.userTimezone) when the hours are saved, as tasks stamp due_tz.

   requireAuth is applied per route, not with router.use, so that fonio's
   public result receiver (phase 2) can join this prefix later.

   THE CALLS (Parts 3–5, utils/fonio-calls.js): a new deal schedules a call,
   the worker sends it. Everyone sees the history; owners and admins cancel a
   call that is still waiting. Switching the connection off (active false)
   or removing it cancels every waiting call at once — the history keeps them,
   with the reason.

   ENDPOINTS
     GET    /                    { configured, settings, can_manage } (everyone; key_hint for owner/admin)
     PUT    /                    save, merged over what is saved (owner/admin)
     DELETE /                    remove the connection (owner/admin)
     GET    /calls               the last 50 calls, newest first (everyone)
     POST   /calls/:id/cancel    cancel a waiting call (owner/admin); 409 when it is no longer waiting
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const calcom      = require('../utils/calcom');   // sealKey: the fonio key is sealed like the Cal.com key
const fonio       = require('../utils/fonio');
const fonioCalls  = require('../utils/fonio-calls');

const MAX_DELAY  = 7 * 24 * 60;                 // minutes: a week
const HHMM       = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULTS = {
  from_number: '', active: false, delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true,
  country_code: '+49', number_prefixes: [], hours_on: true, hours_days: [1, 2, 3, 4, 5],
  hours_from: '09:00', hours_to: '18:00', hours_tz: 'Europe/Berlin',
};
const SETTING_KEYS = Object.keys(DEFAULTS).filter(k => k !== 'hours_tz');
const HOURS_KEYS = ['hours_on', 'hours_days', 'hours_from', 'hours_to'];

const canManage = role => role === 'owner' || role === 'admin';
function requireManage(req, res, next) {
  if (!canManage(req.userRole)) return res.status(403).json({ error: 'Owner or admin only' });
  next();
}

// A key as pasted, trimmed: 10 to 2000 visible characters, no spaces (fonio's spec calls it a bearer JWT, which can
// be long). Whether fonio accepts it is asked after this.
const keyShaped = key => /^[\x21-\x7e]{10,2000}$/.test(key);

async function loadRow(wid) {
  const { rows: [row] } = await pool.query(
    `SELECT f.from_number, f.active, f.delay_minutes, f.on_deal_manual, f.on_deal_webhook, f.country_code,
            f.number_prefixes, f.hours_on, f.hours_days, f.hours_from, f.hours_to, f.hours_tz, f.key_hint,
            f.saved_by, f.saved_at, u.name AS saved_by_name
       FROM workspace_fonio f LEFT JOIN users u ON u.id = f.saved_by
      WHERE f.workspace_id = $1`, [wid]
  );
  return row || null;
}

// The saved settings as the API speaks them (TIME comes back as HH:MM:SS).
function settingsOf(row) {
  const s = {};
  for (const k of Object.keys(DEFAULTS)) s[k] = row[k];
  s.hours_from = String(row.hours_from).slice(0, 5);
  s.hours_to   = String(row.hours_to).slice(0, 5);
  return s;
}

function answer(row, role) {
  const manage = canManage(role);
  if (!row) return { configured: false, settings: { ...DEFAULTS }, can_manage: manage };
  const settings = { ...settingsOf(row), saved_by: row.saved_by, saved_by_name: row.saved_by_name || null, saved_at: row.saved_at };
  if (manage) settings.key_hint = row.key_hint || null;
  return { configured: true, settings, can_manage: manage };
}

// The merged settings checked as a whole: { value } or { reason, error }.
function checkSettings(s) {
  const from = fonio.compactNumber(s.from_number);
  if (!fonio.isE164(from)) return { reason: 'from_number', error: 'The fonio number must start with + and the country code, e.g. +4930123456' };
  if (!Number.isInteger(s.delay_minutes) || s.delay_minutes < 0 || s.delay_minutes > MAX_DELAY) {
    return { reason: 'delay', error: `The delay is a whole number of minutes from 0 to ${MAX_DELAY}` };
  }
  for (const k of ['active', 'on_deal_manual', 'on_deal_webhook', 'hours_on']) {
    if (typeof s[k] !== 'boolean') return { reason: k, error: `${k} must be true or false` };
  }
  const cc = fonio.compactNumber(s.country_code);
  if (!/^\+[1-9]\d{0,3}$/.test(cc)) return { reason: 'country_code', error: 'The country code looks like +49' };
  if (!Array.isArray(s.number_prefixes) || s.number_prefixes.length > 20) return { reason: 'prefixes', error: 'Up to 20 number starts' };
  const prefixes = [...new Set(s.number_prefixes.map(fonio.compactNumber).filter(Boolean))];
  if (prefixes.some(p => !/^\+?\d{1,15}$/.test(p))) return { reason: 'prefixes', error: 'A number start is digits, with or without a + in front' };
  if (!Array.isArray(s.hours_days) || s.hours_days.some(d => !Number.isInteger(d) || d < 1 || d > 7)) {
    return { reason: 'hours_days', error: 'Days are 1 (Monday) to 7 (Sunday)' };
  }
  const days = [...new Set(s.hours_days)].sort((a, b) => a - b);
  if (s.hours_on && !days.length) return { reason: 'hours_days', error: 'Pick at least one day to call on' };
  if (!HHMM.test(s.hours_from) || !HHMM.test(s.hours_to) || s.hours_from >= s.hours_to) {
    return { reason: 'hours', error: 'Calling hours are HH:MM, the start before the end' };
  }
  return { value: { ...s, from_number: from, country_code: cc, number_prefixes: prefixes, hours_days: days } };
}

router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(answer(await loadRow(req.workspaceId), req.userRole)); }
  catch (err) { next(err); }
});

router.put('/', requireAuth, requireManage, async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const saved = await loadRow(req.workspaceId);
    const rawKey = body.api_key;
    if (rawKey !== undefined && typeof rawKey !== 'string') return res.status(400).json({ error: 'That does not look like a fonio API key', reason: 'key_shape' });
    const key = (rawKey || '').trim() || null;
    if (!saved && !key) return res.status(400).json({ error: 'Paste the fonio API key', reason: 'key_required' });
    if (key && !keyShaped(key)) return res.status(400).json({ error: 'That does not look like a fonio API key', reason: 'key_shape' });

    const merged = saved ? settingsOf(saved) : { ...DEFAULTS };
    for (const k of SETTING_KEYS) if (body[k] !== undefined) merged[k] = body[k];
    if (!saved || HOURS_KEYS.some(k => body[k] !== undefined)) merged.hours_tz = req.userTimezone || DEFAULTS.hours_tz;
    const checked = checkSettings(merged);
    if (!checked.value) return res.status(400).json({ error: checked.error, reason: checked.reason });
    const s = checked.value;

    // a new key is asked about once: one fonio refuses, or a fonio that does not answer, writes nothing
    if (key) {
      const check = await fonio.testKey(key);
      if (!check.ok) return res.status(check.reason === 'key' ? 400 : 502).json({ error: check.error, reason: check.reason });
    }

    const params = [
      req.workspaceId, key ? calcom.sealKey(key) : null, key ? key.slice(-4) : null, s.from_number, s.active,
      s.delay_minutes, s.on_deal_manual, s.on_deal_webhook, s.country_code, JSON.stringify(s.number_prefixes),
      s.hours_on, JSON.stringify(s.hours_days), s.hours_from, s.hours_to, s.hours_tz, req.userId,
    ];
    if (saved) {
      await pool.query(
        `UPDATE workspace_fonio SET
           api_key_sealed = COALESCE($2, api_key_sealed), key_hint = COALESCE($3, key_hint), from_number = $4,
           active = $5, delay_minutes = $6, on_deal_manual = $7, on_deal_webhook = $8, country_code = $9,
           number_prefixes = $10::jsonb, hours_on = $11, hours_days = $12::jsonb, hours_from = $13, hours_to = $14,
           hours_tz = $15, saved_by = $16, saved_at = NOW()
         WHERE workspace_id = $1`, params
      );
    } else {
      await pool.query(
        `INSERT INTO workspace_fonio (workspace_id, api_key_sealed, key_hint, from_number, active, delay_minutes,
           on_deal_manual, on_deal_webhook, country_code, number_prefixes, hours_on, hours_days, hours_from, hours_to,
           hours_tz, saved_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13,$14,$15,$16)
         ON CONFLICT (workspace_id) DO UPDATE SET
           api_key_sealed = EXCLUDED.api_key_sealed, key_hint = EXCLUDED.key_hint, from_number = EXCLUDED.from_number,
           active = EXCLUDED.active, delay_minutes = EXCLUDED.delay_minutes, on_deal_manual = EXCLUDED.on_deal_manual,
           on_deal_webhook = EXCLUDED.on_deal_webhook, country_code = EXCLUDED.country_code,
           number_prefixes = EXCLUDED.number_prefixes, hours_on = EXCLUDED.hours_on, hours_days = EXCLUDED.hours_days,
           hours_from = EXCLUDED.hours_from, hours_to = EXCLUDED.hours_to, hours_tz = EXCLUDED.hours_tz,
           saved_by = EXCLUDED.saved_by, saved_at = NOW()`, params
      );
    }
    if (saved?.active && !s.active) await fonioCalls.cancelWaiting(pool, req.workspaceId, 'inactive', req.userId);
    res.json(answer(await loadRow(req.workspaceId), req.userRole));
  } catch (err) { next(err); }
});

router.delete('/', requireAuth, requireManage, async (req, res, next) => {
  try {
    await fonioCalls.cancelWaiting(pool, req.workspaceId, 'disconnected', req.userId);
    await pool.query('DELETE FROM workspace_fonio WHERE workspace_id = $1', [req.workspaceId]);
    res.json(answer(null, req.userRole));
  } catch (err) { next(err); }
});

router.get('/calls', requireAuth, async (req, res, next) => {
  try { res.json({ calls: await fonioCalls.listCalls(pool, req.workspaceId), can_manage: canManage(req.userRole) }); }
  catch (err) { next(err); }
});

router.post('/calls/:id/cancel', requireAuth, requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad call id' });
    const row = await fonioCalls.cancelOne(pool, req.workspaceId, id, req.userId);
    if (!row) return res.status(409).json({ error: 'This call is no longer waiting', reason: 'not_waiting' });
    res.json({ calls: await fonioCalls.listCalls(pool, req.workspaceId), can_manage: true });
  } catch (err) { next(err); }
});

module.exports = router;
