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
   field never overwrites a built-in key.

   Every function takes the pool, so the routes' pool (and a test's fake)
   is the one used.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const calcom = require('./calcom');   // openKey: the fonio key is sealed like the Cal.com key
const fonio  = require('./fonio');

const RETRY_MINUTES = 5;
const MAX_ATTEMPTS  = 3;
const STUCK_MINUTES = 2;
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

async function callContext(pool, call) {
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
  for (const [k, v] of Object.entries(contact.custom_data || {})) put(label('contact', k), v);
  if (deal) for (const [k, v] of Object.entries(deal.custom_data || {})) put(`deal_${label('deal', k)}`, v);
  return { contact, deal: deal || null, context: ctx };
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
    const ctx = await callContext(pool, call);
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

module.exports = {
  RETRY_MINUTES, MAX_ATTEMPTS, STUCK_MINUTES, TRIGGERS, CONTACT_FIELDS,
  scheduleForDeal, callContext, sendCall, runDue, startWorker, cancelWaiting, cancelOne, listCalls, checkNumber,
};
