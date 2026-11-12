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
   note's last line says what came of it. Every delivery is remembered in last_delivery (when, the outcome,
   the body's field names), so the page can show what fonio sends.
   server.js gives this path its raw bytes (1 MB, a whole transcript) and the
   webhook limits.

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
const { notifyUser } = require('../notifications');

const MAX_DELAY  = 7 * 24 * 60;                 // minutes: a week
const HHMM       = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULTS = {
  from_number: '', active: false, delay_minutes: 5, on_deal_manual: true, on_deal_webhook: true,
  country_code: '+49', number_prefixes: [], hours_on: true, hours_days: [1, 2, 3, 4, 5],
  hours_from: '09:00', hours_to: '18:00', hours_tz: 'Europe/Berlin',
};
const SETTING_KEYS = Object.keys(DEFAULTS).filter(k => k !== 'hours_tz');
const HOURS_KEYS = ['hours_on', 'hours_days', 'hours_from', 'hours_to'];
const LINK = /^[0-9a-f]{64}$/;   // receive_token: two random UUIDs without their dashes (db.js)

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
            f.receive_token, f.last_delivery, f.variables, f.saved_by, f.saved_at, u.name AS saved_by_name
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

// The result link fonio posts to, or null without a token or a known origin.
function receiveUrl(req, row) {
  const origin = baseUrl(req);
  return origin && row.receive_token ? `${origin}/api/integrations/fonio/receive/${row.receive_token}` : null;
}

function answer(req, row) {
  const manage = canManage(req.userRole);
  if (!row) return { configured: false, settings: { ...DEFAULTS }, can_manage: manage };
  const settings = { ...settingsOf(row), variables: Array.isArray(row.variables) ? row.variables : [],
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

    const merged = saved ? settingsOf(saved) : { ...DEFAULTS };
    for (const k of SETTING_KEYS) if (body[k] !== undefined) merged[k] = body[k];
    if (!saved || HOURS_KEYS.some(k => body[k] !== undefined)) merged.hours_tz = req.userTimezone || DEFAULTS.hours_tz;
    const checked = checkSettings(merged);
    if (!checked.value) return res.status(400).json({ error: checked.error, reason: checked.reason });
    const s = checked.value;
    // the workspace's own variables for the prompt: replaced as a whole when sent, kept when not
    let variables = null;
    if (body.variables !== undefined) {
      const v = fonioCalls.checkVariables(body.variables);
      if (!v.value) return res.status(400).json({ error: v.error, reason: 'variables' });
      variables = v.value;
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
    if (variables) await pool.query('UPDATE workspace_fonio SET variables = $2::jsonb WHERE workspace_id = $1', [req.workspaceId, JSON.stringify(variables)]);
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

// The call log (Part 16): everyone in the workspace reads it, as everyone reads the calls and the notes.
router.get('/log', requireAuth, async (req, res, next) => {
  try { res.json({ entries: await fonioCalls.listLog(pool, req.workspaceId), can_manage: canManage(req.userRole) }); }
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
// Never throws and never fails fonio's delivery; answers what came of it, or null when the call named no meeting.
async function meetingFromCall(wid, r, noteId) {
  if (!r.meeting || !noteId) return null;
  try {
    const { rows: [note] } = await pool.query('SELECT contact_id, deal_id FROM activities WHERE id = $1 AND workspace_id = $2', [noteId, wid]);
    if (!note) return null;
    const m = await fonioMeeting.bookMeeting(pool, { wid, contactId: note.contact_id, dealId: note.deal_id, meeting: r.meeting });
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

router.post('/receive/:token', async (req, res, next) => {
  const token = String(req.params.token || '');
  if (!LINK.test(token)) return res.status(404).json({ error: 'Unknown link' });
  try {
    const { rows: [conn] } = await pool.query('SELECT workspace_id, from_number, country_code FROM workspace_fonio WHERE receive_token = $1', [token]);
    if (!conn) return res.status(404).json({ error: 'Unknown link' });
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
      const meeting = o.outcome === 'noted' ? await meetingFromCall(conn.workspace_id, r, o.activity_id) : null;
      return res.json({ success: true, already: o.outcome === 'already', call_id: null, other_id: o.other_id, activity_id: o.activity_id ?? null, ...(meeting ? { meeting } : {}) });
    }
    if (out.outcome === 'noted') await fonioCalls.keepResultBody(pool, 'call', out.call_id, body);
    await remember(out.outcome, out.call_id ?? null);
    if (out.outcome === 'gone') return res.json({ ignored: true, reason: out.outcome });
    const meeting = out.outcome === 'noted' ? await meetingFromCall(conn.workspace_id, r, out.activity_id) : null;
    res.json({ success: true, already: out.outcome === 'already', call_id: out.call_id, activity_id: out.activity_id ?? null, ...(meeting ? { meeting } : {}) });
  } catch (err) { next(err); }
});

module.exports = router;
