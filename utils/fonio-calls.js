/* ═══════════════════════════════════════════════════════════════════════════
   FONIO CALLS — the queue and the history behind "fonio calls a new deal's
   contact" (FONIO_CHANGES Parts 3–5). One row per call in fonio_calls (db.js
   has the statuses and reasons); the connection is workspace_fonio
   (routes/fonio.js), fonio's API is utils/fonio.js.

   SCHEDULING  scheduleForDeal() runs right after a deal is created: by hand
   (routes/deals.js, trigger 'deal_manual') or through the lead link
   (routes/integrations.js /receive, 'deal_webhook'). CSV imports and Cal.com
   bookings create deals too and call nobody. Nothing is written when there is
   no connection, it is not active, or that trigger is off. Otherwise the row
   says what will happen: 'scheduled' at now + delay, moved into the calling
   hours, or 'skipped' with why (no contact, no number, a number that cannot
   be made international, one outside the number starts, a call for this
   contact already waiting). One waiting call per contact: the check, backed
   by the unique index fonio_calls_one_waiting.

   SENDING  runDue() is the worker's tick (every 30 s, started by server.js):
   it claims each due row (scheduled → sending, attempts + 1) and decides with
   what is true NOW — the connection still there and active (else cancelled),
   still inside the hours (else back to scheduled at the next opening), the
   contact's number as it is now — then asks fonio once (utils/fonio.js
   outboundCall). sent, or failed with fonio's words; scheduled again in 5
   minutes, up to 3 attempts, only when fonio cannot have taken the call.
   A row left in 'sending' for 2 minutes (the process died mid-request) is
   failed 'interrupted', never sent again. NEVER CALL A CLIENT TWICE.

   THE CONTEXT fonio gets with the call is flat text, for its assistant: the
   whole contact (name, email, phone, company, the master data, its owner and
   its custom fields by their names), the deal as deal_* (title, value,
   pipeline, stage, owner, custom fields), and crm_call_id / crm_deal_id /
   crm_contact_id so fonio's result can be matched later (phase 2). A custom
   field never overwrites a built-in key. first_name and last_name are the
   name's first word and the rest, unless a custom field has that name.
   fonio fills a value in where the assistant's prompt names it as {{key}},
   so every custom field also goes under a plain name (lead_source for
   "Lead Source", deal_budget for the deal's "Budget"), and request_date is
   the day the call was queued (DD.MM.YYYY, the calling hours' zone). German
   prompts can use vorname, nachname, anfragedatum, telefon and firma: the
   same values under German names (email, strasse, plz, ort already are).
   The workspace's own variables (workspace_fonio.variables, Part 13) come
   last: a name of the workspace's choosing for a CRM value of its choosing.
   With Cal.com or Calendly connected, the call also carries the service's
   next free times (freie_termine, freie_termine_json) and today's date
   (heute), so the assistant offers only times that can be booked (Part 29).

   THE RESULT (Part 7)  saveResult() takes what fonio sent after a call
   (utils/fonio-result.js readResult) and finds the call it belongs to: by
   crm_call_id when fonio filled it in, else the newest call sent to one of
   its numbers in the last RESULT_HOURS that has no result yet. One result per
   call and one note per conversation: the claim (result_at) and the note are
   one statement, and fonio_calls_one_conversation refuses a conversation that
   was already noted. The note goes on the call's deal and contact, with no
   author and source 'fonio' (the timelines sign it "fonio").

   Every function takes the pool, so the routes' pool (and a test's fake)
   is the one used.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const calcom = require('./calcom');   // openKey: the fonio key is sealed like the Cal.com key
const fonio  = require('./fonio');
const bookingSlots = require('./booking-slots');   // the free times of Cal.com or Calendly for the assistant (Part 29); called through the module, so a test can stand in for it

const RETRY_MINUTES = 5;
const MAX_ATTEMPTS  = 3;
const STUCK_MINUTES = 2;
const RESULT_HOURS  = 6;
const TRIGGERS = ['deal_manual', 'deal_webhook'];
const CONTACT_FIELDS = ['name', 'email', 'phone', 'company', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'strasse', 'plz', 'ort'];

async function loadConnection(pool, wid) {
  const { rows: [c] } = await pool.query('SELECT * FROM workspace_fonio WHERE workspace_id = $1', [wid]);
  return c || null;
}

async function insertCall(pool, f) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO fonio_calls (workspace_id, deal_id, contact_id, trigger, status, reason, raw_number, to_number, due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, NOW()))
     RETURNING id, status, reason, due_at`,
    [f.workspaceId, f.dealId, f.contactId, f.trigger, f.status, f.reason || null, f.rawNumber || null, f.toNumber || null, f.dueAt || null]
  );
  return row;
}

// The checks a number goes through, at scheduling and again at sending: { number } or { reason }.
function checkNumber(raw, conn) {
  if (!String(raw ?? '').trim()) return { reason: 'no_phone' };
  const number = fonio.toInternational(raw, conn.country_code);
  if (!number) return { reason: 'bad_number' };
  if (!fonio.numberAllowed(number, conn.number_prefixes, conn.country_code)) return { reason: 'number_not_allowed', number };
  return { number };
}

async function scheduleForDeal(pool, { workspaceId, dealId, trigger, now = new Date() }) {
  if (!TRIGGERS.includes(trigger)) return null;
  const conn = await loadConnection(pool, workspaceId);
  if (!conn || !conn.active) return null;
  if (trigger === 'deal_manual' ? !conn.on_deal_manual : !conn.on_deal_webhook) return null;
  const { rows: [deal] } = await pool.query(
    `SELECT d.id, d.contact_id, c.phone
       FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id AND c.workspace_id = d.workspace_id
      WHERE d.id = $1 AND d.workspace_id = $2`, [dealId, workspaceId]
  );
  if (!deal) return null;
  const base = { workspaceId, dealId: deal.id, contactId: deal.contact_id || null, trigger, rawNumber: deal.phone || null };
  const skip = (reason, toNumber = null) => insertCall(pool, { ...base, status: 'skipped', reason, toNumber });
  if (!deal.contact_id) return skip('no_contact');
  const n = checkNumber(deal.phone, conn);
  if (!n.number || n.reason) return skip(n.reason, n.number || null);
  const { rows: [waiting] } = await pool.query(
    `SELECT id FROM fonio_calls WHERE workspace_id = $1 AND contact_id = $2 AND status IN ('scheduled','sending') LIMIT 1`,
    [workspaceId, deal.contact_id]
  );
  if (waiting) return skip('already_scheduled', n.number);
  const due = fonio.nextCallTime(new Date(new Date(now).getTime() + conn.delay_minutes * 60000), conn);
  if (!due) return skip('no_hours', n.number);
  try {
    return await insertCall(pool, { ...base, status: 'scheduled', toNumber: n.number, dueAt: due.toISOString() });
  } catch (err) {
    if (err && err.code === '23505') return skip('already_scheduled', n.number);   // a second deal won the race
    throw err;
  }
}

// A value as one line of text for fonio's context, or '' for nothing worth sending.
function asText(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim();
}

// A custom field's name as a plain variable name for fonio's prompt: "Lead Source" → lead_source, "Größe" → groesse.
function plainKey(name) {
  return String(name).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// The day the call was queued (the deal was made that moment), as people in Germany write it, in the zone `tz`.
function requestDate(at, tz) {
  const d = new Date(at);
  if (!at || Number.isNaN(d.getTime())) return '';
  const opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
  try { return d.toLocaleDateString('de-DE', { ...opts, timeZone: tz || 'Europe/Berlin' }); }
  catch { return d.toLocaleDateString('de-DE', { ...opts, timeZone: 'Europe/Berlin' }); }
}

// German key → the key whose value it repeats. A custom field of that name wins (it is put first).
const GERMAN_KEYS = [['vorname', 'first_name'], ['nachname', 'last_name'], ['anfragedatum', 'request_date'], ['telefon', 'phone'], ['firma', 'company']];

// THE WORKSPACE'S OWN VARIABLES (Part 13). The assistant's prompt in fonio uses a value as {{name}}; owners and
// admins say which CRM value goes under which name: [{ name, source }]. A source is
//   value:<key>            one of VALUE_SOURCES, the values every call carries anyway
//   contact_field:<key>    a custom contact field, by its field_key
//   deal_field:<key>       a custom deal field, by its field_key
// crm_… names are the CRM's own (the result is matched by them) and cannot be taken.
const VALUE_SOURCES = ['name', 'first_name', 'last_name', 'email', 'phone', 'company', 'rechtsform', 'ust_id', 'handelsregisternummer',
  'webseite', 'quelle', 'strasse', 'plz', 'ort', 'contact_owner', 'request_date', 'deal_title', 'deal_value', 'deal_pipeline', 'deal_stage', 'deal_owner',
  'free_times', 'free_times_json', 'today'];   // the booking service's free times and today's date (Parts 29 and 32), '' without a service
const MAX_VARIABLES = 60;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,59}$/;
const FIELD_SOURCE = /^(contact_field|deal_field):([^\s:]{1,120})$/;

// A variables list as sent by the page, checked: { value } (trimmed) or { error }.
function checkVariables(list) {
  if (!Array.isArray(list) || list.length > MAX_VARIABLES) return { error: `Up to ${MAX_VARIABLES} variables` };
  const out = [], seen = new Set();
  for (const v of list) {
    const name = typeof v?.name === 'string' ? v.name.trim() : '';
    const source = typeof v?.source === 'string' ? v.source.trim() : '';
    if (!VARIABLE_NAME.test(name)) return { error: 'A variable name is letters, digits and _, starting with a letter or _' };
    if (/^crm_/i.test(name)) return { error: 'Names starting with crm_ are used by the CRM itself' };
    if (seen.has(name)) return { error: `The variable ${name} is there twice` };
    const known = source.startsWith('value:') ? VALUE_SOURCES.includes(source.slice(6)) : FIELD_SOURCE.test(source);
    if (!known) return { error: `The variable ${name} is not connected to a CRM value` };
    seen.add(name);
    out.push({ name, source });
  }
  return { value: out };
}

async function callContext(pool, call, tz, variables, extra = null) {
  const wid = call.workspace_id;
  const { rows: [deal] } = call.deal_id ? await pool.query(
    `SELECT d.id, d.title, d.value, d.custom_data, d.contact_id, p.name AS pipeline, s.name AS stage, u.name AS owner
       FROM deals d
       LEFT JOIN pipelines p ON p.id = d.pipeline_id
       LEFT JOIN pipeline_stages s ON s.id = d.stage_id
       LEFT JOIN users u ON u.id = d.assigned_to
      WHERE d.id = $1 AND d.workspace_id = $2`, [call.deal_id, wid]
  ) : { rows: [] };
  const contactId = deal ? deal.contact_id : call.contact_id;
  const { rows: [contact] } = contactId ? await pool.query(
    `SELECT c.*, u.name AS owner FROM contacts c LEFT JOIN users u ON u.id = c.assigned_to
      WHERE c.id = $1 AND c.workspace_id = $2`, [contactId, wid]
  ) : { rows: [] };
  if (!contact) return { contact: null, deal: deal || null, context: null };
  const { rows: fields } = await pool.query(
    `SELECT 'contact' AS kind, field_key, name FROM custom_fields WHERE workspace_id = $1
     UNION ALL SELECT 'deal' AS kind, field_key, name FROM deal_fields WHERE workspace_id = $1`, [wid]
  );
  const label = (kind, key) => fields.find(f => f.kind === kind && f.field_key === key)?.name || key;
  const ctx = { crm_call_id: String(call.id), crm_contact_id: String(contact.id) };
  if (deal) ctx.crm_deal_id = String(deal.id);
  const put = (k, v) => { const s = asText(v); if (s && !(k in ctx)) ctx[k] = s; };
  for (const f of CONTACT_FIELDS) put(f, contact[f]);
  put('contact_owner', contact.owner);
  if (deal) {
    put('deal_title', deal.title);
    put('deal_value', deal.value);
    put('deal_pipeline', deal.pipeline);
    put('deal_stage', deal.stage);
    put('deal_owner', deal.owner);
  }
  put('request_date', requestDate(call.created_at, tz));
  for (const [k, v] of Object.entries(contact.custom_data || {})) put(label('contact', k), v);
  if (deal) for (const [k, v] of Object.entries(deal.custom_data || {})) put(`deal_${label('deal', k)}`, v);
  // The same custom fields once more under plain names: fonio's prompt uses a value as {{name}}, and a field
  // called "Lead Source" is easier to write there as {{lead_source}}.
  const plain = (prefix, name, v) => { const k = plainKey(name); if (k) put(prefix + k, v); };
  for (const [k, v] of Object.entries(contact.custom_data || {})) plain('', label('contact', k), v);
  if (deal) for (const [k, v] of Object.entries(deal.custom_data || {})) plain('deal_', label('deal', k), v);
  // The CRM keeps one name; fonio assistants often greet by first_name / last_name. The first word and the rest,
  // put last so a custom field of that name (the real thing) wins over this split.
  const [first, ...rest] = asText(contact.name).split(/\s+/).filter(Boolean);
  put('first_name', first);
  put('last_name', rest.join(' '));
  // German names for the same values: the assistants' prompts are German, and {{vorname}} reads better there.
  for (const [de, en] of GERMAN_KEYS) put(de, ctx[en]);
  // What the caller found out for this call (the booking service's free times and today, Parts 29 and 32): built-in
  // values like the rest, so a variable of the workspace's own can carry them under its own name. Empty text counts.
  for (const [k, v] of Object.entries(extra || {})) if (!(k in ctx)) ctx[k] = typeof v === 'string' ? v : asText(v);
  // The workspace's own variables last, over everything but the CRM's ids. Read from the values as they are before
  // any of them is written, so one variable never feeds another. An empty value is sent as '' (the prompt named it).
  const base = { ...ctx };
  for (const v of Array.isArray(variables) ? variables : []) {
    if (!v || typeof v.name !== 'string' || typeof v.source !== 'string' || /^crm_/i.test(v.name)) continue;
    const field = FIELD_SOURCE.exec(v.source);
    const value = v.source.startsWith('value:') ? base[v.source.slice(6)]
      : field ? asText(((field[1] === 'deal_field' ? deal?.custom_data : contact.custom_data) || {})[field[2]]) : '';
    ctx[v.name] = value || '';
  }
  return { contact, deal: deal || null, context: ctx };
}

// The free times of the workspace's booking service, as context for the assistant (Parts 29 and 32): with Cal.com or
// Calendly connected, a call carries freie_termine (the next free times as a line of text), freie_termine_json (the
// same as a JSON list) and heute (today's weekday and date) — all on the connected account's clock, which is also
// the clock a meeting agreed in the call is booked on (utils/fonio-meeting.js). English prompts can use free_times,
// free_times_json and today, and those three are also the names the workspace's own variables connect to
// (VALUE_SOURCES), so a prompt can call them what it likes. Nothing free, or the service silent: the times are empty
// text, so a prompt never shows a raw placeholder. Without a booking service: null, nothing is added. Never throws.
const SLOT_NAMES = { text: ['freie_termine', 'free_times'], json: ['freie_termine_json', 'free_times_json'], today: ['heute', 'today'] };
async function freeTimeValues(pool, wid, now) {
  try {
    const found = await bookingSlots.freeSlots(pool, wid, new Date(now).getTime());
    if (!found) return null;
    const values = { text: bookingSlots.slotsText(found.slots, found.zone), json: bookingSlots.slotsJson(found.slots, found.zone), today: bookingSlots.todayText(now, found.zone) };
    const out = {};
    for (const [kind, names] of Object.entries(SLOT_NAMES)) for (const n of names) out[n] = values[kind];
    return out;
  } catch { return null; }
}

// One due call, claimed and decided now. null when another tick has it already.
async function sendCall(pool, id, now = new Date()) {
  const { rows: [call] } = await pool.query(
    `UPDATE fonio_calls SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
      WHERE id = $1 AND status = 'scheduled' RETURNING *`, [id]
  );
  if (!call) return null;
  const done = async (status, { reason = null, message = null, toNumber = null, dueAt = null, sent = false, giveBack = false } = {}) => {
    await pool.query(
      `UPDATE fonio_calls SET status = $2, reason = $3, message = COALESCE($4, message), to_number = COALESCE($5, to_number),
         due_at = COALESCE($6::timestamptz, due_at), sent_at = CASE WHEN $7 THEN NOW() ELSE sent_at END,
         attempts = attempts - $8::int, updated_at = NOW()
       WHERE id = $1`,
      [call.id, status, reason, message, toNumber, dueAt, sent, giveBack ? 1 : 0]
    );
    return { id: call.id, status, reason };
  };

  let conn, number, context;
  try {
    conn = await loadConnection(pool, call.workspace_id);
    if (!conn) return done('cancelled', { reason: 'disconnected' });
    if (!conn.active) return done('cancelled', { reason: 'inactive' });
    const at = fonio.nextCallTime(now, conn);
    if (!at) return done('skipped', { reason: 'no_hours' });
    // the hours were changed since: wait for them (that claim was no attempt)
    if (at.getTime() > new Date(now).getTime()) return done('scheduled', { dueAt: at.toISOString(), giveBack: true });
    const ctx = await callContext(pool, call, conn.hours_tz, conn.variables, await freeTimeValues(pool, call.workspace_id, now));
    if (!ctx.contact) return done('skipped', { reason: 'no_contact' });
    const n = checkNumber(ctx.contact.phone, conn);
    if (!n.number || n.reason) return done('skipped', { reason: n.reason, toNumber: n.number || null });
    number = n.number;
    context = ctx.context;
  } catch (err) {
    return done('failed', { reason: 'error', message: String(err?.message || err).slice(0, 200) });
  }

  let apiKey;
  try { apiKey = calcom.openKey(conn.api_key_sealed); }
  catch { return done('failed', { reason: 'key', message: 'The saved fonio key cannot be opened; save it again' }); }

  const result = await fonio.outboundCall(apiKey, { fromNumber: conn.from_number, toNumber: number, context });
  // what was sent and what fonio answered, for the call's technical details (Part 18) — never the key; a failure to
  // keep them changes nothing about the call
  await keepJson(pool, 'UPDATE fonio_calls SET request = $2::jsonb, response = $3::jsonb WHERE id = $1',
    call.id, { url: `${fonio.BASE}/public/v1/outbound_call`, body: { apiKey: '(hidden)', fromNumber: conn.from_number, toNumber: number, context } },
    result.answer || { http: result.http ?? 0, body: null, error: result.error || null });
  if (result.ok) return done('sent', { message: result.message, toNumber: number, sent: true });
  if (result.retry && call.attempts < MAX_ATTEMPTS) {
    return done('scheduled', { message: result.error, toNumber: number, dueAt: new Date(new Date(now).getTime() + RETRY_MINUTES * 60000).toISOString() });
  }
  return done('failed', { reason: 'fonio', message: result.error, toNumber: number });
}

async function runDue(pool, { now = new Date(), limit = 20 } = {}) {
  await pool.query(
    `UPDATE fonio_calls SET status = 'failed', reason = 'interrupted', updated_at = NOW()
      WHERE status = 'sending' AND updated_at < $1`, [new Date(new Date(now).getTime() - STUCK_MINUTES * 60000)]
  );
  const { rows } = await pool.query(
    `SELECT id FROM fonio_calls WHERE status = 'scheduled' AND due_at <= $1 ORDER BY due_at, id LIMIT $2`, [now, limit]
  );
  const out = [];
  for (const r of rows) {
    const x = await sendCall(pool, r.id, now);
    if (x) out.push(x);
  }
  return out;
}

let worker = null;
function startWorker(pool, { intervalMs = 30000, limit = 20, log = console } = {}) {
  if (worker) return worker;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await runDue(pool, { limit }); }
    catch (err) { log.error('fonio worker:', err?.message || err); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  worker = { tick, stop() { clearInterval(timer); worker = null; } };
  return worker;
}

// Every waiting call of a workspace is cancelled (the connection switched off or removed); the count.
async function cancelWaiting(pool, wid, reason, userId = null) {
  const r = await pool.query(
    `UPDATE fonio_calls SET status = 'cancelled', reason = $2, cancelled_by = $3, updated_at = NOW()
      WHERE workspace_id = $1 AND status = 'scheduled'`, [wid, reason, userId]
  );
  return r.rowCount || 0;
}

// One waiting call cancelled by a person; null when it is not waiting (sent, or not this workspace's).
async function cancelOne(pool, wid, id, userId) {
  const { rows: [row] } = await pool.query(
    `UPDATE fonio_calls SET status = 'cancelled', reason = 'by_user', cancelled_by = $3, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND status = 'scheduled' RETURNING id`, [id, wid, userId]
  );
  return row || null;
}

async function listCalls(pool, wid, { limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT f.id, f.trigger, f.status, f.reason, f.raw_number, f.to_number, f.message, f.due_at, f.sent_at, f.attempts,
            f.created_at, f.deal_id, f.contact_id, c.name AS contact_name, d.title AS deal_title, u.name AS cancelled_by_name
       FROM fonio_calls f
       LEFT JOIN contacts c ON c.id = f.contact_id
       LEFT JOIN deals d ON d.id = f.deal_id
       LEFT JOIN users u ON u.id = f.cancelled_by
      WHERE f.workspace_id = $1
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT $2`, [wid, limit]
  );
  return rows;
}

// fonio's result for one call as a note: { outcome, call_id, activity_id }. outcome: noted; already (this call or this
// conversation has its note); no_match (no call of this workspace fits); gone (the call's contact and deal are deleted).
async function saveResult(pool, wid, r, content, now = new Date()) {
  if (r.conversationId) {
    const { rows: [seen] } = await pool.query(
      'SELECT id, note_activity_id FROM fonio_calls WHERE workspace_id = $1 AND conversation_id = $2', [wid, r.conversationId]
    );
    if (seen) return { outcome: 'already', call_id: seen.id, activity_id: seen.note_activity_id };
  }
  let call = null;
  if (r.crmCallId) {
    ({ rows: [call] } = await pool.query(
      `SELECT id, contact_id, deal_id, result_at, note_activity_id FROM fonio_calls
        WHERE id = $1 AND workspace_id = $2 AND status = 'sent'`, [r.crmCallId, wid]
    ));
  }
  if (!call && r.numbers.length) {
    ({ rows: [call] } = await pool.query(
      `SELECT id, contact_id, deal_id, result_at, note_activity_id FROM fonio_calls
        WHERE workspace_id = $1 AND status = 'sent' AND result_at IS NULL AND to_number = ANY($2::text[]) AND sent_at > $3
        ORDER BY sent_at DESC, id DESC LIMIT 1`, [wid, r.numbers, new Date(new Date(now).getTime() - RESULT_HOURS * 3600000)]
    ));
  }
  if (!call) return { outcome: 'no_match' };
  if (call.result_at) return { outcome: 'already', call_id: call.id, activity_id: call.note_activity_id };
  if (!call.contact_id && !call.deal_id) return { outcome: 'gone', call_id: call.id };

  // claim the call and write the note in ONE statement: both happen, or neither
  let created;
  try {
    ({ rows: [created] } = await pool.query(
      `WITH claim AS (
         UPDATE fonio_calls SET result_at = NOW(), conversation_id = $2, conversation_link = $3, updated_at = NOW()
          WHERE id = $1 AND result_at IS NULL RETURNING workspace_id, contact_id, deal_id
       )
       INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source)
       SELECT workspace_id, contact_id, deal_id, 'note', $4::text, NULL, 'fonio' FROM claim RETURNING id`,
      [call.id, r.conversationId, r.link, content]
    ));
  } catch (err) {
    if (err && err.code === '23505') return { outcome: 'already', call_id: call.id, activity_id: null };   // this conversation, delivered twice at once
    throw err;
  }
  if (!created) return { outcome: 'already', call_id: call.id, activity_id: null };   // a delivery running alongside won
  await pool.query('UPDATE fonio_calls SET note_activity_id = $1 WHERE id = $2', [created.id, call.id]);
  return { outcome: 'noted', call_id: call.id, activity_id: created.id };
}

// A conversation the CRM did not start (Part 15) — an incoming call, or an outgoing one no call above fits — kept in
// fonio_other_calls: { outcome, other_id, activity_id }. The person's number picks the contact (the one changed last
// when several share it); the note goes on the contact, and on its deal when it has exactly one. Without a contact
// the row keeps the transcript. outcome: noted; logged (no contact, no note); already (this conversation is kept);
// no_match (no number and nothing said: nothing worth a row).
async function saveOther(pool, conn, r, content) {
  const wid = conn.workspace_id;
  if (!r.numbers.length && !r.summary && !r.transcript && !r.conversationId) return { outcome: 'no_match' };
  if (r.conversationId) {
    const { rows: [seen] } = await pool.query(
      'SELECT id, note_activity_id FROM fonio_other_calls WHERE workspace_id = $1 AND conversation_id = $2', [wid, r.conversationId]
    );
    if (seen) return { outcome: 'already', other_id: seen.id, activity_id: seen.note_activity_id };
  }
  let contact = null, number = r.numbers[0] || null, dealId = null;
  if (r.numbers.length) {
    const { rows } = await pool.query(
      `SELECT id, phone FROM contacts WHERE workspace_id = $1 AND phone IS NOT NULL AND phone <> '' ORDER BY updated_at DESC, id DESC`, [wid]
    );
    for (const c of rows) {
      const n = fonio.toInternational(c.phone, conn.country_code);
      if (n && r.numbers.includes(n)) { contact = c; number = n; break; }
    }
  }
  if (contact) {
    const { rows: deals } = await pool.query('SELECT id FROM deals WHERE workspace_id = $1 AND contact_id = $2 ORDER BY id LIMIT 2', [wid, contact.id]);
    if (deals.length === 1) dealId = deals[0].id;
  }
  const direction = r.inbound ? 'inbound' : 'outbound';
  const summary = r.summary.slice(0, 4000) || null;
  let row;
  try {
    if (contact) {
      // the note and the row in ONE statement: both happen, or neither
      ({ rows: [row] } = await pool.query(
        `WITH note AS (
           INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source)
           VALUES ($1::int, $2::int, $3::int, 'note', $4::text, NULL, 'fonio') RETURNING id
         )
         INSERT INTO fonio_other_calls (workspace_id, direction, number, caller_name, contact_id, deal_id, conversation_id,
                                        conversation_link, duration, summary, note_activity_id)
         SELECT $1::int, $5::text, $6::text, $7::text, $2::int, $3::int, $8::text, $9::text, $10::text, $11::text, id FROM note
         RETURNING id, note_activity_id`,
        [wid, contact.id, dealId, content, direction, number, r.name || null, r.conversationId, r.link, r.duration || null, summary]
      ));
    } else {
      ({ rows: [row] } = await pool.query(
        `INSERT INTO fonio_other_calls (workspace_id, direction, number, caller_name, conversation_id, conversation_link,
                                        duration, summary, transcript)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, note_activity_id`,
        [wid, direction, number, r.name || null, r.conversationId, r.link, r.duration || null, summary, r.transcript.slice(0, 200000) || null]
      ));
    }
  } catch (err) {
    if (err && err.code === '23505') return { outcome: 'already', other_id: null, activity_id: null };   // this conversation, delivered twice at once
    throw err;
  }
  if (!contact) return { outcome: 'logged', other_id: row.id, activity_id: null };
  return { outcome: 'noted', other_id: row.id, activity_id: row.note_activity_id ?? null };
}

// JSON as jsonb can hold it: no NUL characters, and no string longer than 20,000 characters (a transcript is in the
// note already).
function forJsonb(value) {
  return JSON.stringify(value, (_k, v) => {
    if (typeof v !== 'string') return v;
    const s = v.includes('\u0000') ? v.split('\u0000').join('') : v;
    return s.length > 20000 ? `${s.slice(0, 20000)}… (cut)` : s;
  });
}
// One technical record written beside a call: best effort, an error is swallowed.
async function keepJson(pool, sql, id, ...values) {
  try { await pool.query(sql, [id, ...values.map(forJsonb)]); } catch { /* the call itself is unaffected */ }
}
// The Body fonio sent after a call, kept with the row it became (Part 18): kind 'call' (fonio_calls) or 'other'.
function keepResultBody(pool, kind, id, body) {
  if (!id || !body) return Promise.resolve();
  return keepJson(pool, `UPDATE ${kind === 'call' ? 'fonio_calls' : 'fonio_other_calls'} SET result_body = $2::jsonb WHERE id = $1`, id, body);
}

// One call's technical record for owners and admins (Part 18): the row as it is, with what was sent to fonio, what
// fonio answered and the Body fonio sent afterwards. null when it is not this workspace's. The kept transcript of an
// unconnected call is left out: it is in result_body.
async function callDetail(pool, wid, kind, id) {
  const { rows: [row] } = kind === 'call'
    ? await pool.query(
      `SELECT id, deal_id, contact_id, trigger, status, reason, raw_number, to_number, message, attempts, due_at, sent_at, result_at,
              conversation_id, conversation_link, note_activity_id, created_at, updated_at, request, response, result_body
         FROM fonio_calls WHERE id = $1 AND workspace_id = $2`, [id, wid])
    : await pool.query(
      `SELECT id, direction, number, caller_name, contact_id, deal_id, conversation_id, conversation_link, duration, summary,
              note_activity_id, created_at, result_body
         FROM fonio_other_calls WHERE id = $1 AND workspace_id = $2`, [id, wid]);
  if (!row) return null;
  const { request = null, response = null, result_body = null, ...record } = row;
  return { kind, record, request, response, result_body };
}

// The call log (Part 16): every call fonio made for the CRM (fonio_calls, status sent) and every conversation the CRM
// did not start (fonio_other_calls), newest first, with the contact and deal each is connected to. The transcript is
// not part of it: it is in the note, or waits in the row until a contact is connected.
async function listLog(pool, wid, { limit = 100 } = {}) {
  const [sent, other, waiting] = await Promise.all([
    pool.query(
      `SELECT f.id, f.sent_at AS at, f.to_number AS number, f.contact_id, c.name AS contact_name, f.deal_id, d.title AS deal_title,
              f.conversation_link AS link, f.result_at, f.note_activity_id
         FROM fonio_calls f LEFT JOIN contacts c ON c.id = f.contact_id LEFT JOIN deals d ON d.id = f.deal_id
        WHERE f.workspace_id = $1 AND f.status = 'sent'
        ORDER BY f.sent_at DESC, f.id DESC LIMIT $2`, [wid, limit]
    ),
    pool.query(
      `SELECT o.id, o.created_at AS at, o.direction, o.number, o.caller_name, o.contact_id, c.name AS contact_name, o.deal_id,
              d.title AS deal_title, o.conversation_link AS link, o.duration, o.summary, o.note_activity_id
         FROM fonio_other_calls o LEFT JOIN contacts c ON c.id = o.contact_id LEFT JOIN deals d ON d.id = o.deal_id
        WHERE o.workspace_id = $1
        ORDER BY o.created_at DESC, o.id DESC LIMIT $2`, [wid, limit]
    ),
    // the calls still to come (Part 24): the soonest first
    pool.query(
      `SELECT f.id, f.due_at AS at, f.to_number AS number, f.contact_id, c.name AS contact_name, f.deal_id, d.title AS deal_title
         FROM fonio_calls f LEFT JOIN contacts c ON c.id = f.contact_id LEFT JOIN deals d ON d.id = f.deal_id
        WHERE f.workspace_id = $1 AND f.status IN ('scheduled','sending')
        ORDER BY f.due_at, f.id LIMIT $2`, [wid, limit]
    ),
  ]);
  const entry = (r, by_crm) => ({
    key: `${by_crm ? 'call' : 'other'}:${r.id}`, id: r.id, by_crm, direction: by_crm ? 'outbound' : r.direction, at: r.at,
    number: r.number || null, caller_name: by_crm ? null : r.caller_name || null,
    contact_id: r.contact_id ?? null, contact_name: r.contact_name || null, deal_id: r.deal_id ?? null, deal_title: r.deal_title || null,
    duration: by_crm ? null : r.duration || null, summary: by_crm ? null : r.summary || null, link: r.link || null,
    result: by_crm ? !!r.result_at : true, noted: r.note_activity_id != null,
  });
  const planned = waiting.rows.map(r => ({ ...entry(r, true), planned: true }));
  return [...planned, ...[...sent.rows.map(r => entry(r, true)), ...other.rows.map(r => entry(r, false))]
    .sort((a, b) => new Date(b.at) - new Date(a.at) || (a.key < b.key ? 1 : -1)).slice(0, limit)];
}

// A kept conversation without a contact gets one (Part 16) — a contact just made from it, or an existing one — and
// its note, written from what the row kept: { ok, contact_id, deal_id, activity_id } or { error }. error: not_found
// (no such row here), no_contact (no such contact here), connected (it has a contact already). As in saveOther the
// note is also on the contact's deal when it has exactly one. noteOf(row) writes the note's text.
async function connectOther(pool, wid, id, contactId, noteOf) {
  const { rows: [row] } = await pool.query(
    `SELECT id, direction, contact_id, conversation_link, duration, summary, transcript FROM fonio_other_calls
      WHERE id = $1 AND workspace_id = $2`, [id, wid]
  );
  if (!row) return { error: 'not_found' };
  if (row.contact_id) return { error: 'connected' };
  const { rows: [contact] } = await pool.query('SELECT id FROM contacts WHERE id = $1 AND workspace_id = $2', [contactId, wid]);
  if (!contact) return { error: 'no_contact' };
  const { rows: deals } = await pool.query('SELECT id FROM deals WHERE workspace_id = $1 AND contact_id = $2 ORDER BY id LIMIT 2', [wid, contact.id]);
  const dealId = deals.length === 1 ? deals[0].id : null;
  // claim the row and write the note in ONE statement: two clicks at once make one note
  const { rows: [note] } = await pool.query(
    `WITH claim AS (
       UPDATE fonio_other_calls SET contact_id = $3::int, deal_id = $4::int, transcript = NULL
        WHERE id = $1 AND workspace_id = $2 AND contact_id IS NULL RETURNING workspace_id, contact_id, deal_id
     )
     INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, source)
     SELECT workspace_id, contact_id, deal_id, 'note', $5::text, NULL, 'fonio' FROM claim RETURNING id`,
    [id, wid, contact.id, dealId, noteOf(row)]
  );
  if (!note) return { error: 'connected' };
  await pool.query('UPDATE fonio_other_calls SET note_activity_id = $1 WHERE id = $2', [note.id, id]);
  return { ok: true, contact_id: contact.id, deal_id: dealId, activity_id: note.id };
}

module.exports = {
  saveOther, listLog, connectOther, keepResultBody, callDetail,
  RETRY_MINUTES, MAX_ATTEMPTS, STUCK_MINUTES, RESULT_HOURS, TRIGGERS, CONTACT_FIELDS,
  VALUE_SOURCES, MAX_VARIABLES, checkVariables,
  freeTimeValues, SLOT_NAMES,
  scheduleForDeal, callContext, plainKey, requestDate, sendCall, runDue, startWorker, cancelWaiting, cancelOne, listCalls, checkNumber, saveResult,
};
