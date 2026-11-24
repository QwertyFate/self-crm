/* ═══════════════════════════════════════════════════════════════════════════
   /api/integrations/fonio — fonio.ai calls a new deal's contact (FONIO_CHANGES).

   ONE CONNECTION PER WORKSPACE (workspace_fonio): the company's fonio API key
   and fonio number, an active switch, the delay in minutes, which new deals
   trigger a call (created by hand, through the lead link), the number rules,
   the calling hours, whether a call that reached nobody is tried again
   (follow_up, Part 33) and who gets the call at all (only_webhooks,
   only_pipelines, Part 37: null for all lead webhooks / pipelines, or the ids
   fonio is limited to) — db.js has the meaning of each column. Everyone may
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
   public result receiver can share this prefix.

   THE RESULT LINK (Part 7)  fonio's API cannot fetch a call or its
   transcript, so fonio sends them itself after each call: an "HTTP Request"
   on the assistant in fonio, Run "After the conversation", POST to
   receive_url — the workspace's own secret link (workspace_fonio.
   receive_token), shown to owners and admins only. The link alone decides
   the workspace. The call is found and the note written by
   utils/fonio-calls.js saveResult; utils/fonio-result.js reads the body and
   writes the note's text. An inbound call (direction in…) or a call that
   matches no call of the CRM is kept in the call log (fonio_other_calls,
   Part 15, saveOther): noted on the contact with that number, and on that
   contact's deal when it has exactly one; an unknown number is kept without
   a note. A body with nothing in it is acknowledged and ignored, so fonio
   does not count it as failed. A result that names a meeting agreed in the
   call (meeting_booked, meeting_date, meeting_time; Part 28) has it booked at
   Cal.com or Calendly when one is connected (utils/fonio-meeting.js); the
   note's last line says what came of it. The call's outcome as the assistant
   wrote it (call_outcome, Part 33) decides whether the contact is called
   again: utils/fonio-calls.js followUpAfterResult books that retry. A time
   the person asked to be called back at (callback_date, callback_time;
   Part 35) comes before that: callbackAfterResult plans one call for it, the
   note's last line says what came of it, and the answer carries
   callback { status, call_id, due_at }. What came out of the call then moves
   the deal (Part 39): the workspace's own variable lead_status — or a meeting
   agreed, a callback planned, or an unanswered call with no further try —
   picks a line of stage_rules, the table of stage and urgency the workspace
   keeps per pipeline (utils/fonio-stage.js); the note's last line says what
   was done, and the answer carries deal { event, status }. Every
   delivery is remembered in last_delivery (when, the outcome,
   the body's field names), so the page can show what fonio sends.
   server.js gives this path its raw bytes (1 MB, a whole transcript) and the
   webhook limits.

   THE CALLS (Parts 3–5, utils/fonio-calls.js): a new deal schedules a call,
   the worker sends it. Everyone sees the history; owners and admins cancel a
   call that is still waiting. Switching the connection off (active false)
   or removing it cancels every waiting call at once — the history keeps them,
   with the reason.

   WHO SEES A CALL. When the workspace holds members to what is assigned to
   them (utils/visibility.js), a member's history and call log (GET /calls,
   GET /log) hold only the calls of deals and contacts they see: a call follows
   its deal when it names one, else its contact. A call that names neither —
   a conversation with a number the CRM does not know — is for owners and
   admins only, so such a member cannot connect one to a contact either
   (POST /log/:id/contact answers 404). "Call this contact" (GET /calls/check,
   POST /calls) answers 404 for a contact, or a deal, the member cannot see,
   and no call is planned. Owners, admins and workspaces without the switch
   run every statement unchanged.

   ENDPOINTS
     GET    /                    { configured, settings, can_manage } (everyone; key_hint for owner/admin)
     PUT    /                    save, merged over what is saved (owner/admin); variables and stage_rules are
                                 each replaced as a whole when sent
     DELETE /                    remove the connection (owner/admin)
     GET    /calls               the last 50 calls, newest first (everyone)
     POST   /calls/:id/cancel    cancel a waiting call (owner/admin); 409 when it is no longer waiting
     GET    /calls/check         ?contact_id=&deal_id=: who "Call this contact" would call, at which number, and
                                 whether that is outside the calling hours (everyone; Part 42)
     POST   /calls               { contact_id, deal_id? }: fonio calls that contact now, whatever the calling hours
                                 (everyone); 201 { call, contact, number }; 409 with the reason when it cannot:
                                 fonio off or not connected, no number, a number fonio may not call, a call waiting,
                                 or one that went out a moment ago
     GET    /log                 the call log: calls the CRM sent and calls it did not start, newest first (everyone)
     GET    /log/:kind/:id       one call's technical record: request, fonio's answer, the result Body (owner/admin)
     POST   /log/:id/contact     { contact_id }: connect a kept call without a contact to one, and write its note
                                 (everyone); 404 unknown call or contact, 409 it has a contact already
     POST   /receive/:token      PUBLIC: fonio's result after a call → a note on the deal and contact; a call
                                 the CRM did not start → the call log; 404 unknown link, 400 not JSON
   ═══════════════════════════════════════════════════════════════════════════ */

const express     = require('express');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const calcom      = require('../utils/calcom');   // sealKey: the fonio key is sealed like the Cal.com key
const fonio       = require('../utils/fonio');
const fonioCalls  = require('../utils/fonio-calls');
const fonioResult = require('../utils/fonio-result');
const baseUrl     = require('../utils/base-url');
const fonioMeeting = require('../utils/fonio-meeting');   // a meeting agreed in a call, booked at Cal.com or Calendly (Part 28)
const fonioStage  = require('../utils/fonio-stage');      // the deal after the call: stage and urgency by what came out (Part 39)
const engine      = require('../utils/engine');           // hears of a deal a call moved into one of its trigger stages
const { notifyUser } = require('../notifications');
const visibility  = require('../utils/visibility');       // members held to what is assigned to them

const MAX_DELAY  = 7 * 24 * 60;                 // minutes: a week
const HHMM       = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULTS = {
  from_number: '', active: false, delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true,
  country_code: '+49', number_prefixes: [], hours_on: true, hours_days: [1, 2, 3, 4, 5],
  hours_from: '09:00', hours_to: '18:00', hours_tz: 'Europe/Berlin',
  book_meetings: true,                        // who books a meeting agreed in the call (Part 34): the CRM until switched off
  only_webhooks: null, only_pipelines: null,  // who gets the call (Part 37): null is all, a list is only those ids
  follow_up: { ...fonioCalls.FOLLOW_UP },   // retrying a call that reached nobody (Part 33): off until saved
};
const SETTING_KEYS = Object.keys(DEFAULTS).filter(k => k !== 'hours_tz' && k !== 'follow_up');
const HOURS_KEYS = ['hours_on', 'hours_days', 'hours_from', 'hours_to'];
const LINK = /^[0-9a-f]{64}$/;   // receive_token: two random UUIDs without their dashes (db.js)

const canManage = role => role === 'owner' || role === 'admin';
function requireManage(req, res, next) {
  if (!canManage(req.userRole)) return res.status(403).json({ error: 'Owner or admin only' });
  next();
}
// What holds a member to the calls of their own deals and contacts, for the lists in utils/fonio-calls.js: a call
// follows its deal, else its contact; one that names neither is not shown to them. Nothing for everyone else.
const ownCalls = req => (params, t) => visibility.linked(req, params, { deal: `${t}.deal_id`, contact: `${t}.contact_id`, orphans: false });

// A key as pasted, trimmed: 10 to 2000 visible characters, no spaces (fonio's spec calls it a bearer JWT, which can
// be long). Whether fonio accepts it is asked after this.
const keyShaped = key => /^[\x21-\x7e]{10,2000}$/.test(key);

async function loadRow(wid) {
  const { rows: [row] } = await pool.query(
    `SELECT f.from_number, f.active, f.delay_minutes, f.on_deal_manual, f.on_deal_webhook, f.country_code,
            f.number_prefixes, f.hours_on, f.hours_days, f.hours_from, f.hours_to, f.hours_tz, f.key_hint,
            f.receive_token, f.last_delivery, f.variables, f.follow_up, f.book_meetings, f.only_webhooks, f.only_pipelines,
            f.stage_rules, f.saved_by, f.saved_at,
            u.name AS saved_by_name
       FROM workspace_fonio f LEFT JOIN users u ON u.id = f.saved_by
      WHERE f.workspace_id = $1`, [wid]
  );
  return row || null;
}

// The saved settings as the API speaks them (TIME comes back as HH:MM:SS). follow_up always has every field, filled
// from the defaults for a row saved before the card existed (Part 33); a column added later (book_meetings, Part 34)
// reads as its default when a row predates it.
function settingsOf(row) {
  const s = {};
  for (const k of Object.keys(DEFAULTS)) s[k] = row[k] ?? DEFAULTS[k];
  s.hours_from = String(row.hours_from).slice(0, 5);
  s.hours_to   = String(row.hours_to).slice(0, 5);
  s.follow_up  = fonioCalls.followUpSettings(row);
  return s;
}

// The result link fonio posts to, or null without a token or a known origin.
function receiveUrl(req, row) {
  const origin = baseUrl(req);
  return origin && row.receive_token ? `${origin}/api/integrations/fonio/receive/${row.receive_token}` : null;
}

function answer(req, row) {
  const manage = canManage(req.userRole);
  if (!row) return { configured: false, settings: { ...DEFAULTS }, can_manage: manage };
  const settings = { ...settingsOf(row), variables: Array.isArray(row.variables) ? row.variables : [],
    // the deal after the call (Part 39): pipeline id → event → { stage_id, urgency }; {} on a row from before
    stage_rules: row.stage_rules && typeof row.stage_rules === 'object' && !Array.isArray(row.stage_rules) ? row.stage_rules : {},
    saved_by: row.saved_by, saved_by_name: row.saved_by_name || null, saved_at: row.saved_at };
  if (manage) {
    settings.key_hint = row.key_hint || null;
    settings.receive_url = receiveUrl(req, row);   // a secret: whoever has it can write notes into this workspace
    settings.last_delivery = row.last_delivery || null;
  }
  return { configured: true, settings, can_manage: manage };
}

// The merged settings checked as a whole: { value } or { reason, error }.
function checkSettings(s) {
  const from = fonio.compactNumber(s.from_number);
  if (!fonio.isE164(from)) return { reason: 'from_number', error: 'The fonio number must start with + and the country code, e.g. +4930123456' };  if (!Number.isInteger(s.delay_minutes) || s.delay_minutes < 0 || s.delay_minutes > MAX_DELAY) {
    return { reason: 'delay', error: `The delay is a whole number of minutes from 0 to ${MAX_DELAY}` };
  }
  for (const k of ['active', 'on_deal_manual', 'on_deal_webhook', 'hours_on', 'book_meetings']) {
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
  const follow = fonioCalls.checkFollowUp(s.follow_up);
  if (!follow.value) return { reason: 'follow_up', error: follow.error };
  const who = {};
  for (const k of fonioCalls.WHO_KEYS) {
    const list = fonioCalls.checkWho(s[k]);
    if (list.error) return { reason: k, error: `${WHO[k].what}: ${list.error}` };
    who[k] = list.value;
  }
  return { value: { ...s, ...who, from_number: from, country_code: cc, number_prefixes: prefixes, hours_days: days, follow_up: follow.value } };
}

// Who gets the call (Part 37): the table each list's ids live in. A list that is SENT may name only this workspace's
// own rows; a saved list is not asked about again — an id deleted since simply matches nothing.
const WHO = {
  only_webhooks:  { table: 'workspace_webhook', what: 'Lead webhooks' },
  only_pipelines: { table: 'pipelines',         what: 'Pipelines' },
};
async function foreignIds(wid, key, ids) {
  const { rows } = await pool.query(`SELECT id FROM ${WHO[key].table} WHERE workspace_id = $1 AND id = ANY($2::int[])`, [wid, ids]);
  const own = new Set(rows.map(r => Number(r.id)));
  return ids.filter(id => !own.has(id));
}

router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(answer(req, await loadRow(req.workspaceId))); }
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

    const merged = saved ? settingsOf(saved) : { ...DEFAULTS, follow_up: { ...DEFAULTS.follow_up } };
    for (const k of SETTING_KEYS) if (body[k] !== undefined) merged[k] = body[k];
    // the follow-up policy is merged field by field, so the switch alone can be sent (Part 33)
    if (body.follow_up !== undefined) {
      if (!body.follow_up || typeof body.follow_up !== 'object' || Array.isArray(body.follow_up)) {
        return res.status(400).json({ error: 'The follow-up settings are an object', reason: 'follow_up' });
      }
      merged.follow_up = { ...(merged.follow_up || {}), ...body.follow_up };
    }
    if (!saved || HOURS_KEYS.some(k => body[k] !== undefined)) merged.hours_tz = req.userTimezone || DEFAULTS.hours_tz;
    const checked = checkSettings(merged);
    if (!checked.value) return res.status(400).json({ error: checked.error, reason: checked.reason });
    const s = checked.value;
    for (const k of fonioCalls.WHO_KEYS) {
      if (body[k] === undefined || s[k] === null) continue;
      if ((await foreignIds(req.workspaceId, k, s[k])).length) {
        return res.status(400).json({ error: `${WHO[k].what}: an id in the list is not in this workspace`, reason: k });
      }
    }
    // the workspace's own variables for the prompt: replaced as a whole when sent, kept when not
    let variables = null;
    if (body.variables !== undefined) {
      const v = fonioCalls.checkVariables(body.variables);
      if (!v.value) return res.status(400).json({ error: v.error, reason: 'variables' });
      variables = v.value;
    }
    // the deal after the call (Part 39): the table is replaced as a whole when sent, kept when not. A table that is
    // sent may name only this workspace's pipelines, and under each only that pipeline's own stages.
    let stageRules = null;
    if (body.stage_rules !== undefined) {
      const t = fonioStage.checkRules(body.stage_rules);
      if (!t.value) return res.status(400).json({ error: t.error, reason: 'stage_rules' });
      const foreign = await fonioStage.foreignRefs(pool, req.workspaceId, t.value);
      if (foreign) return res.status(400).json({ error: `The table names a ${foreign} that is not in this workspace`, reason: 'stage_rules' });
      stageRules = t.value;
    }

    // a new key is asked about once: one fonio refuses, or a fonio that does not answer, writes nothing
    if (key) {
      const check = await fonio.testKey(key);
      if (!check.ok) return res.status(check.reason === 'key' ? 400 : 502).json({ error: check.error, reason: check.reason });
    }

    const params = [
      req.workspaceId, key ? calcom.sealKey(key) : null, key ? key.slice(-4) : null, s.from_number, s.active,
      s.delay_minutes, s.on_deal_manual, s.on_deal_webhook, s.country_code, JSON.stringify(s.number_prefixes),
      s.hours_on, JSON.stringify(s.hours_days), s.hours_from, s.hours_to, s.hours_tz, req.userId,
      JSON.stringify(s.follow_up), s.book_meetings,
      s.only_webhooks && JSON.stringify(s.only_webhooks), s.only_pipelines && JSON.stringify(s.only_pipelines),   // null stays NULL: all
    ];
    if (saved) {
      await pool.query(
        `UPDATE workspace_fonio SET
           api_key_sealed = COALESCE($2, api_key_sealed), key_hint = COALESCE($3, key_hint), from_number = $4,
           active = $5, delay_minutes = $6, on_deal_manual = $7, on_deal_webhook = $8, country_code = $9,
           number_prefixes = $10::jsonb, hours_on = $11, hours_days = $12::jsonb, hours_from = $13, hours_to = $14,
           hours_tz = $15, saved_by = $16, follow_up = $17::jsonb, book_meetings = $18,
           only_webhooks = $19::jsonb, only_pipelines = $20::jsonb, saved_at = NOW()
         WHERE workspace_id = $1`, params
      );
    } else {
      await pool.query(
        `INSERT INTO workspace_fonio (workspace_id, api_key_sealed, key_hint, from_number, active, delay_minutes,
           on_deal_manual, on_deal_webhook, country_code, number_prefixes, hours_on, hours_days, hours_from, hours_to,
           hours_tz, saved_by, follow_up, book_meetings, only_webhooks, only_pipelines)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13,$14,$15,$16,$17::jsonb,$18,$19::jsonb,$20::jsonb)
         ON CONFLICT (workspace_id) DO UPDATE SET
           api_key_sealed = EXCLUDED.api_key_sealed, key_hint = EXCLUDED.key_hint, from_number = EXCLUDED.from_number,
           active = EXCLUDED.active, delay_minutes = EXCLUDED.delay_minutes, on_deal_manual = EXCLUDED.on_deal_manual,
           on_deal_webhook = EXCLUDED.on_deal_webhook, country_code = EXCLUDED.country_code,
           number_prefixes = EXCLUDED.number_prefixes, hours_on = EXCLUDED.hours_on, hours_days = EXCLUDED.hours_days,
           hours_from = EXCLUDED.hours_from, hours_to = EXCLUDED.hours_to, hours_tz = EXCLUDED.hours_tz,
           saved_by = EXCLUDED.saved_by, follow_up = EXCLUDED.follow_up, book_meetings = EXCLUDED.book_meetings,
           only_webhooks = EXCLUDED.only_webhooks, only_pipelines = EXCLUDED.only_pipelines, saved_at = NOW()`, params
      );
    }
    if (variables) await pool.query('UPDATE workspace_fonio SET variables = $2::jsonb WHERE workspace_id = $1', [req.workspaceId, JSON.stringify(variables)]);
    if (stageRules) await pool.query('UPDATE workspace_fonio SET stage_rules = $2::jsonb WHERE workspace_id = $1', [req.workspaceId, JSON.stringify(stageRules)]);
    if (saved?.active && !s.active) await fonioCalls.cancelWaiting(pool, req.workspaceId, 'inactive', req.userId);
    res.json(answer(req, await loadRow(req.workspaceId)));
  } catch (err) { next(err); }
});

router.delete('/', requireAuth, requireManage, async (req, res, next) => {
  try {
    await fonioCalls.cancelWaiting(pool, req.workspaceId, 'disconnected', req.userId);
    await pool.query('DELETE FROM workspace_fonio WHERE workspace_id = $1', [req.workspaceId]);
    res.json(answer(req, null));
  } catch (err) { next(err); }
});

// What a variable can be connected to (Part 14): the built-in values and this workspace's custom fields.
router.get('/sources', requireAuth, requireManage, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT 'contact' AS kind, field_key, name FROM custom_fields WHERE workspace_id = $1
       UNION ALL SELECT 'deal' AS kind, field_key, name FROM deal_fields WHERE workspace_id = $1`, [req.workspaceId]
    );
    const of = kind => rows.filter(r => r.kind === kind).map(r => ({ key: r.field_key, name: r.name }));
    res.json({ values: fonioCalls.VALUE_SOURCES, contact_fields: of('contact'), deal_fields: of('deal') });
  } catch (err) { next(err); }
});

router.get('/calls', requireAuth, async (req, res, next) => {
  try { res.json({ calls: await fonioCalls.listCalls(pool, req.workspaceId, { scope: ownCalls(req) }), can_manage: canManage(req.userRole) }); }
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

// "Call this contact" (Part 42): a person asks fonio to call a contact, now. For everyone in the workspace, like
// booking a meeting. GET /calls/check answers who would be called, at which number and whether that is outside the
// calling hours, so the page can ask first; POST /calls books the call — utils/fonio-calls.js scheduleByHand asks
// everything again and signs the call with who asked. Who and where come from the session; the body names the
// contact and, when the row had one, the deal (used only when it is that contact's own). Every refusal names its
// reason, so the page can say it in its language.
const HAND_REFUSALS = {
  not_connected:      [409, 'fonio is not connected'],
  inactive:           [409, 'fonio is switched off'],
  no_contact:         [404, 'Contact not found'],
  no_phone:           [409, 'The contact has no phone number'],
  bad_number:         [409, 'The contact\'s number cannot be made international'],
  number_not_allowed: [409, 'The contact\'s number is outside the number starts fonio may call'],
  already_scheduled:  [409, 'A call to this contact is already waiting'],
  just_called:        [409, 'fonio called this contact a moment ago'],
};
const refuseHand = (res, code) => (HAND_REFUSALS[code]
  ? res.status(HAND_REFUSALS[code][0]).json({ error: HAND_REFUSALS[code][1], reason: code })
  : res.status(400).json({ error: 'Name the contact to call', reason: 'contact' }));
// The contact and the deal as sent: whole positive numbers, the deal optional. null when they are anything else.
function handIds(src) {
  const id = v => ((typeof v === 'number' || typeof v === 'string') && /^[1-9]\d{0,9}$/.test(String(v)) ? Number(v) : null);   // a list of one is no id
  const contactId = id(src?.contact_id), sent = src?.deal_id, none = sent === undefined || sent === null || sent === '';
  const dealId = none ? null : id(sent);
  return contactId && (none || dealId) ? { contactId, dealId } : null;
}
// A member held to their own calls only a contact they see, and rides only a deal they see along: true when this
// request names one they do not (answered like a contact or deal that is not there, before anything is planned).
async function handHidden(req, res, ids) {
  if (!(await visibility.seesContact(pool, req, ids.contactId))) { refuseHand(res, 'no_contact'); return true; }
  if (ids.dealId && !(await visibility.seesDeal(pool, req, ids.dealId))) { res.status(404).json({ error: 'Not found' }); return true; }
  return false;
}

router.get('/calls/check', requireAuth, async (req, res, next) => {
  try {
    const ids = handIds(req.query);
    if (!ids) return refuseHand(res, 'contact');
    if (await handHidden(req, res, ids)) return;
    const out = await fonioCalls.checkByHand(pool, { workspaceId: req.workspaceId, ...ids });
    if (out.code) return refuseHand(res, out.code);
    res.json(out);
  } catch (err) { next(err); }
});

router.post('/calls', requireAuth, async (req, res, next) => {
  try {
    const ids = handIds(req.body);
    if (!ids) return refuseHand(res, 'contact');
    if (await handHidden(req, res, ids)) return;
    const out = await fonioCalls.scheduleByHand(pool, { workspaceId: req.workspaceId, ...ids, userId: req.userId });
    if (out.code) return refuseHand(res, out.code);
    res.status(201).json({ success: true, call: out.call, contact: out.contact, number: out.number, deal_id: out.deal_id });
  } catch (err) { next(err); }
});

// The call log (Part 16): everyone in the workspace reads it, as everyone reads the calls and the notes.
// A member held to their own reads the calls of the deals and contacts they see (ownCalls).
router.get('/log', requireAuth, async (req, res, next) => {
  try { res.json({ entries: await fonioCalls.listLog(pool, req.workspaceId, { scope: ownCalls(req) }), can_manage: canManage(req.userRole) }); }
  catch (err) { next(err); }
});

// One call's technical record (Part 18): what was sent to fonio, what it answered, the Body it sent afterwards.
router.get('/log/:kind/:id', requireAuth, requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!['call', 'other'].includes(req.params.kind) || !Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad call id' });
    const detail = await fonioCalls.callDetail(pool, req.workspaceId, req.params.kind, id);
    if (!detail) return res.status(404).json({ error: 'Call not found' });
    res.json(detail);
  } catch (err) { next(err); }
});

// A kept conversation without a contact is connected to one: the page first makes the contact through /api/contacts
// (its checks, its notification, the Engine) or picks an existing one, then names it here.
router.post('/log/:id/contact', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id), contactId = Number(req.body?.contact_id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Bad call id' });
    if (!Number.isInteger(contactId) || contactId <= 0) return res.status(400).json({ error: 'Bad contact id' });
    // a call without a contact is not shown to a member held to their own, so there is none they could connect
    if (visibility.restricted(req)) return res.status(404).json({ error: 'Call not found', code: 'not_found' });
    const note = row => fonioResult.resultNote({ inbound: row.direction === 'inbound', duration: row.duration || '', summary: row.summary || '',
      transcript: row.transcript || '', link: row.conversation_link });
    const out = await fonioCalls.connectOther(pool, req.workspaceId, id, contactId, note);
    if (out.error === 'connected') return res.status(409).json({ error: 'This call already has a contact', code: 'connected' });
    if (out.error) return res.status(404).json({ error: out.error === 'no_contact' ? 'Contact not found' : 'Call not found', code: out.error });
    res.json({ success: true, contact_id: out.contact_id, deal_id: out.deal_id, activity_id: out.activity_id });
  } catch (err) { next(err); }
});

// A meeting agreed in the call (Part 28): booked for the note's contact at the connected booking service, the
// outcome added to the note as its last line, and somebody told — the assignee of the deal (else of the contact)
// hears of the booked meeting like of any other, and of one that could not be booked so a person can see to it.
// With book_meetings off the workspace books in fonio itself (Part 34): nothing is booked here and nobody is told,
// the note only keeps what was agreed. Never throws and never fails fonio's delivery; answers what came of it, or
// null when the call named no meeting.
async function meetingFromCall(wid, r, noteId, bookMeetings = true) {
  if (!r.meeting || !noteId) return null;
  try {
    const { rows: [note] } = await pool.query('SELECT contact_id, deal_id FROM activities WHERE id = $1 AND workspace_id = $2', [noteId, wid]);
    if (!note) return null;
    const m = bookMeetings
      ? await fonioMeeting.bookMeeting(pool, { wid, contactId: note.contact_id, dealId: note.deal_id, meeting: r.meeting })
      : fonioMeeting.leaveToAssistant(r.meeting);
    if (!m) return null;
    await pool.query("UPDATE activities SET content = content || $3 WHERE id = $1 AND workspace_id = $2", [noteId, wid, '\n\n' + fonioMeeting.noteLine(m)]);
    if (m.status === 'booked' && m.inserted) {
      await require('./integrations').booking.tellAssignee(wid, null, { kind: 'booked', dealId: note.deal_id, contactId: note.contact_id, title: m.title, start: m.start, url: m.url, location: m.location });
    } else if (m.status === 'failed') {
      const assignee = await fonioMeeting.assigneeOf(pool, wid, note.deal_id, note.contact_id);
      if (assignee) await notifyUser(wid, null, assignee, {
        type: 'meeting_failed', category: 'activities', title: fonioMeeting.whenText(m), body: fonioMeeting.noteLine(m).slice(0, 300),
        entityType: note.deal_id ? 'deal' : 'contact', entityId: note.deal_id || note.contact_id,
      });
    }
    return { status: m.status, service: m.service || null, reason: m.reason || null, activity_id: m.activity_id || null };
  } catch (err) {
    console.error('fonio: booking the agreed meeting failed:', err?.message || err);
    return { status: 'failed', service: null, reason: null, activity_id: null };
  }
}

// What the call means for the deal (Part 39): the event picks a line of the workspace's table, the deal is moved when
// it is still where it was as the call went out, the note's last line says what was done, and a move is told like
// one by hand. Never throws and never fails fonio's delivery; null when there was nothing to do.
async function dealAfterCall(req, conn, r, out) {
  try {
    const event = fonioStage.eventOf({ leadStatus: r.leadStatus, meeting: !!r.meeting, callback: out.callback?.status === 'planned', outcome: r.outcome, retry: !!out.retry });
    const done = await fonioStage.applyAfterCall(pool, conn.workspace_id, out.call_id, event);
    if (!done) return null;
    const line = fonioStage.noteLine(done);
    if (line && out.activity_id) {
      await pool.query('UPDATE activities SET content = content || $3 WHERE id = $1 AND workspace_id = $2', [out.activity_id, conn.workspace_id, '\n\n' + line]).catch(() => {});
    }
    await fonioStage.tellMoved(pool, conn.workspace_id, done, { notifyUser, engine, timezone: conn.hours_tz, baseUrl: baseUrl(req) });
    return { event: done.event, status: done.status, stage_id: done.stage ? done.stage.id : null, urgency: done.urgency ?? null };
  } catch (err) {
    console.error('fonio: the deal after the call failed:', err?.message || err);
    return null;
  }
}

router.post('/receive/:token', async (req, res, next) => {
  const token = String(req.params.token || '');
  if (!LINK.test(token)) return res.status(404).json({ error: 'Unknown link' });
  try {
    const { rows: [conn] } = await pool.query('SELECT workspace_id, from_number, country_code, book_meetings, hours_tz FROM workspace_fonio WHERE receive_token = $1', [token]);
    if (!conn) return res.status(404).json({ error: 'Unknown link' });
    // the workspace may book in fonio itself (Part 34): an old row (undefined) still books here
    const bookMeetings = conn.book_meetings !== false;
    const body = fonioResult.parseBody(req.body);
    const remember = (outcome, callId = null) => pool.query(
      'UPDATE workspace_fonio SET last_delivery = $2::jsonb WHERE workspace_id = $1',
      [conn.workspace_id, JSON.stringify({ at: new Date().toISOString(), outcome, call_id: callId, fields: body ? fonioResult.fieldNames(body) : [] })]
    );
    if (!body) { await remember('bad_json'); return res.status(400).json({ error: 'Body is not JSON' }); }

    const r = fonioResult.readResult(body, conn.from_number);
    const content = fonioResult.resultNote(r);
    const out = r.inbound ? { outcome: 'no_match' } : await fonioCalls.saveResult(pool, conn.workspace_id, r, content);
    if (out.outcome === 'no_match') {   // not a call the CRM started: kept in the call log, noted on the contact with that number
      const o = await fonioCalls.saveOther(pool, conn, r, content);
      if (o.outcome === 'noted' || o.outcome === 'logged') await fonioCalls.keepResultBody(pool, 'other', o.other_id, body);
      await remember(o.outcome);
      if (o.outcome === 'no_match') return res.json({ ignored: true, reason: o.outcome });
      const meeting = o.outcome === 'noted' ? await meetingFromCall(conn.workspace_id, r, o.activity_id, bookMeetings) : null;
      return res.json({ success: true, already: o.outcome === 'already', call_id: null, other_id: o.other_id, activity_id: o.activity_id ?? null, ...(meeting ? { meeting } : {}) });
    }
    if (out.outcome === 'noted') await fonioCalls.keepResultBody(pool, 'call', out.call_id, body);
    await remember(out.outcome, out.call_id ?? null);
    if (out.outcome === 'gone') return res.json({ ignored: true, reason: out.outcome });
    // a time the person asked to be called back at (Part 35): what came of it is the note's last line; a failure to
    // write that line changes nothing about the call that was planned
    if (out.callback && out.activity_id) {
      await pool.query('UPDATE activities SET content = content || $3 WHERE id = $1 AND workspace_id = $2',
        [out.activity_id, conn.workspace_id, '\n\n' + fonioCalls.callbackLine(out.callback)]).catch(() => {});
    }
    const meeting = out.outcome === 'noted' ? await meetingFromCall(conn.workspace_id, r, out.activity_id, bookMeetings) : null;
    const deal = out.outcome === 'noted' ? await dealAfterCall(req, conn, r, out) : null;
    res.json({ success: true, already: out.outcome === 'already', call_id: out.call_id, activity_id: out.activity_id ?? null, ...(meeting ? { meeting } : {}),
      ...(out.callback ? { callback: { status: out.callback.status, call_id: out.callback.call_id ?? null, due_at: out.callback.due_at ?? null } } : {}),
      ...(deal ? { deal } : {}) });
  } catch (err) { next(err); }
});

module.exports = router;
