// Upgrads Engine — outgoing webhook (Developer Briefing §5.1).
//
// When a deal moves into one of the workspace's trigger stages, the deals route
// calls `dispatchContractSigned` (fire-and-forget). This module looks up the
// workspace's Engine settings, builds the `vertrag.unterschrieben` payload,
// records a row in `engine_deliveries`, and POSTs the payload signed with the
// workspace's webhook secret — one immediate attempt. A transient failure
// leaves the row `pending` with `next_attempt_at`; the retry worker
// (`startRetryWorker`, started by server.js) re-drives due rows on the
// briefing's schedule, so retries survive a restart. Every attempt updates the
// row, which the Integrations page and the Onboarding monitor show.
//
// Signature (briefing: "HMAC-SHA256 over the raw request body using a shared
// secret. Header: X-Upgrads-Signature"):
//   X-Upgrads-Signature: <lower-case hex HMAC-SHA256(secret, raw body)>
// Nothing but the body bytes go into the MAC and there is no prefix. The raw
// body is the exact string sent (`raw_body` in the log); it is never rebuilt
// from the JSONB column, because Postgres reorders object keys. Replay
// protection is the Engine's idempotency on `event_id` (briefing §5.1).
//
// Envelope (briefing example), identical for every event:
//   { event, event_id, zeitpunkt, kunde_id, daten: { … } }
//
// Delivery states (engine_deliveries.status):
//   pending  not delivered yet; `next_attempt_at` says when the worker tries again
//            (NULL = the immediate attempt is still running; claimable after the lease)
//   success  delivered (2xx)
//   failed   given up: non-retryable answer, schedule exhausted, or nothing to send
const crypto   = require('crypto');
const { pool } = require('../db');
const { COLUMNS: KUNDE_COLUMNS, stammdaten, dokumentView, documentUrl } = require('./kunde');

const EVENT_CONTRACT_SIGNED = 'vertrag.unterschrieben';
const EVENT_CONTACT_CREATED = 'kunde.angelegt';
const EVENT_CONTACT_UPDATED = 'kunde.aktualisiert';
const EVENT_DOCUMENT_ADDED  = 'dokument.hinzugefuegt';
const EVENT_TEST            = 'test.ping';
const USER_AGENT            = 'Upgrads-CRM/1.0';
const DEFAULT_TZ            = 'Europe/Berlin';
const ISO_DATE              = /^\d{4}-\d{2}-\d{2}$/;
const NO_CONTACT_ERROR      = 'Not sent: the deal has no contact, so kunde_id is missing. Link a contact and move the deal into the trigger stage again.';
const INACTIVE_ERROR        = 'Retry postponed: the Engine integration is switched off or has no URL. It resumes once the card is active again.';

// Retry schedule (briefing §5.1: "at least five attempts with increasing intervals,
// extending to approximately 24 hours"). Delay after failure n, in seconds:
// +1 min, +5 min, +30 min, +2 h, +6 h, +16 h → 7 attempts, the last ≈ 24.6 h after the first.
const RETRY_DELAYS_SEC = [60, 300, 1800, 7200, 21600, 57600];
const MAX_ATTEMPTS     = RETRY_DELAYS_SEC.length + 1;
const LEASE_SEC        = 300;      // a claimed row becomes due again if its worker dies mid-attempt
const POSTPONE_SEC     = 3600;     // integration switched off: look again in an hour

// ── Configuration (overridable in tests) ────────────────────────────────────
const DEFAULTS = { fetch: null, timeoutMs: 10000 };
const cfg = { ...DEFAULTS };
function configure(patch)  { Object.assign(cfg, patch); }
function resetConfig()     { Object.assign(cfg, DEFAULTS); }

// Every dispatch/delivery promise is tracked so tests (and a graceful shutdown)
// can wait for fire-and-forget work with `drain()`.
const inflight = new Set();
function track(promise) {
  inflight.add(promise);
  promise.then(() => inflight.delete(promise), () => inflight.delete(promise));
  return promise;
}
function drain() { return Promise.allSettled([...inflight]); }

// ── Signing ─────────────────────────────────────────────────────────────────
function sign(secret, rawBody) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  return crypto.createHmac('sha256', String(secret)).update(body).digest('hex');
}

// Reference verifier: what the Engine side must do. Exercised by the tests
// together with the snippet quoted in ENGINE_INTEGRATION.md §3.
function verify(secret, rawBody, signature) {
  const expected = Buffer.from(sign(secret, rawBody));
  const given    = Buffer.from(String(signature || '').trim().toLowerCase());
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

// ── Payload helpers ─────────────────────────────────────────────────────────
// Calendar date (YYYY-MM-DD) of `date` in `timeZone`; an unknown zone falls back
// to the default zone, which is what the rest of the app assumes for legacy rows.
function dateInZone(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  for (const tz of [timeZone, DEFAULT_TZ]) {
    if (!tz) continue;
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
    catch { /* unknown zone → next candidate */ }
  }
  return d.toISOString().slice(0, 10);
}

// Contract details the workspace may keep in deal custom fields. A deal field whose
// key is `unterschrieben_am` (ISO date) or `laufzeit_monate` (positive integer) is
// forwarded to the Engine; anything else is null — no guessing (briefing §4).
function contractDetails(customData) {
  const cd = customData && typeof customData === 'object' && !Array.isArray(customData) ? customData : {};
  const am = typeof cd.unterschrieben_am === 'string' && ISO_DATE.test(cd.unterschrieben_am.trim()) ? cd.unterschrieben_am.trim() : null;
  const m  = typeof cd.laufzeit_monate === 'boolean' ? NaN : Number(cd.laufzeit_monate);
  return { unterschrieben_am: am, laufzeit_monate: Number.isInteger(m) && m > 0 ? m : null };
}

// The one envelope every event uses (briefing §5.1 example). Key order is the contract.
function buildEnvelope(event, { eventId, zeitpunkt, contactId, daten }) {
  return { event, event_id: eventId, zeitpunkt, kunde_id: contactId ?? null, daten };
}

function buildContractSignedPayload({ eventId, zeitpunkt, contactId, dealId, title, unterschriebenAm = null, laufzeitMonate = null, dokumentUrl = null }) {
  return buildEnvelope(EVENT_CONTRACT_SIGNED, {
    eventId, zeitpunkt, contactId,
    daten: {
      vertrag_id:        dealId,
      produkt:           title ?? '',
      unterschrieben_am: unterschriebenAm ?? null,
      laufzeit_monate:   laufzeitMonate ?? null,
      dokument_url:      dokumentUrl ?? null,
    },
  });
}

// kunde.angelegt carries the master data as the Engine API would answer it, plus
// when the record was created; kunde.aktualisiert adds `geaendert` — the view's
// field names whose value changed — so the Engine can update just those.
function buildContactPayload(event, c, { eventId, zeitpunkt, changed = [] }) {
  const daten = event === EVENT_CONTACT_UPDATED
    ? { ...stammdaten(c), geaendert: [...changed], aktualisiert_am: c.updated_at ?? null }
    : { ...stammdaten(c), erstellt_am: c.created_at ?? null };
  return buildEnvelope(event, { eventId, zeitpunkt, contactId: c.id, daten });
}

function buildTestPayload({ eventId, zeitpunkt, workspaceId }) {
  return buildEnvelope(EVENT_TEST, { eventId, zeitpunkt, contactId: null, daten: { workspace_id: workspaceId } });
}

function stageNum(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isTriggerStage(settings, stageId) {
  const id = stageNum(stageId);
  if (!id || !settings) return false;
  return (settings.trigger_stage_ids || []).map(Number).includes(id);
}

// ── Storage helpers ─────────────────────────────────────────────────────────
async function getSettings(workspaceId) {
  const { rows: [row] } = await pool.query('SELECT * FROM workspace_engine WHERE workspace_id=$1', [workspaceId]);
  return row || null;
}

// The row starts `pending` with next_attempt_at NULL: the immediate attempt owns it.
// Should the process die before the first UPDATE, the worker claims it after the lease.
async function createDelivery({ workspaceId, event, eventId, dealId, contactId, url, rawBody }) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO engine_deliveries (workspace_id, event, event_id, deal_id, contact_id, url, payload, raw_body)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
    [workspaceId, event, eventId, dealId ?? null, contactId ?? null, url, rawBody, rawBody]
  );
  return row.id;
}

// A delivery that must not go out (no kunde_id): logged as failed with the reason,
// zero attempts, so the Integrations page and the Onboarding monitor show why.
async function markNotSent(deliveryId, error) {
  await pool.query(
    `UPDATE engine_deliveries SET attempts=0, last_status_code=NULL, last_error=$1, status='failed', delivered_at=NULL, next_attempt_at=NULL WHERE id=$2`,
    [error, deliveryId]
  );
  return { id: deliveryId, ok: false, status: null, error, attempts: 0, delivery_status: 'failed', next_attempt_at: null };
}

// ── One attempt, and how its outcome is recorded ────────────────────────────
function isRetryableStatus(status) {
  return status >= 500 || status === 408 || status === 429;
}

// Seconds until the next automatic attempt after `attemptsDone` failed attempts; null = give up.
function retryDelaySec(attemptsDone) {
  if (!Number.isInteger(attemptsDone) || attemptsDone < 1 || attemptsDone >= MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_SEC[attemptsDone - 1] ?? null;
}

async function attemptOnce({ url, secret, rawBody, event }) {
  const headers = {
    'Content-Type':        'application/json',
    'User-Agent':          USER_AGENT,
    'X-Upgrads-Event':     event,
    'X-Upgrads-Signature': sign(secret, rawBody),
  };
  // The abort timer is deliberately NOT unref'd: an in-flight request must be
  // able to time out even when nothing else keeps the event loop alive.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const fetchImpl = cfg.fetch || globalThis.fetch;
    const res = await fetchImpl(url, { method: 'POST', headers, body: rawBody, signal: controller.signal, redirect: 'manual' });
    const status = Number(res.status);
    const ok = status >= 200 && status < 300;
    if (ok) return { ok: true, status, error: null, retryable: false };
    let text = '';
    try { text = String(await res.text()); } catch { /* body unreadable */ }
    text = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    return { ok: false, status, error: `HTTP ${status}${text ? ' ' + text : ''}`, retryable: isRetryableStatus(status) };
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? `timeout after ${cfg.timeoutMs} ms` : (e && e.message) || String(e);
    return { ok: false, status: null, error: msg, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

// Writes the outcome of attempt number `attemptNo` and decides what happens next:
// success → success; retryable and attempts left (and `retry` allowed) → pending with
// next_attempt_at on the schedule; otherwise failed. Never throws for an HTTP outcome.
async function recordAttempt(deliveryId, attemptNo, outcome, { retry = true } = {}) {
  const delaySec  = retry && !outcome.ok && outcome.retryable ? retryDelaySec(attemptNo) : null;
  const willRetry = delaySec != null;
  const status    = outcome.ok ? 'success' : (willRetry ? 'pending' : 'failed');
  const nextAt    = willRetry ? new Date(Date.now() + delaySec * 1000) : null;
  await pool.query(
    `UPDATE engine_deliveries
     SET attempts=$1, last_status_code=$2, last_error=$3, status=$4,
         delivered_at=CASE WHEN $5::boolean THEN NOW() ELSE NULL END,
         next_attempt_at=$6, last_attempt_at=NOW()
     WHERE id=$7`,
    [attemptNo, outcome.status, outcome.error, status, outcome.ok, nextAt, deliveryId]
  );
  return { id: deliveryId, ok: outcome.ok, status: outcome.status, error: outcome.error, attempts: attemptNo, delivery_status: status, next_attempt_at: nextAt };
}

// One attempt for a delivery row, recorded. `attemptsSoFar` numbers it; `retry: false`
// (test pings) never leaves the row pending.
function deliver(deliveryId, { url, secret, rawBody, event }, { attemptsSoFar = 0, retry = true } = {}) {
  const run = (async () => {
    const outcome = await attemptOnce({ url, secret, rawBody, event });
    return recordAttempt(deliveryId, (Number(attemptsSoFar) || 0) + 1, outcome, { retry });
  })();
  return track(run);
}

// ── Retry worker ────────────────────────────────────────────────────────────
// Atomically takes up to `limit` due rows: pending, and either scheduled for now or
// earlier, or left with next_attempt_at NULL for longer than the lease (an immediate
// attempt that never recorded — the process died). FOR UPDATE SKIP LOCKED keeps two
// workers (or a worker and the API) off the same row; the lease bump makes an
// orphaned claim due again on its own. Current URL/secret/active come from the
// workspace card, so a rotated secret or a changed URL applies to retries.
async function claimDue(limit = 20) {
  const { rows } = await pool.query(
    `WITH due AS (
       SELECT id FROM engine_deliveries
        WHERE status = 'pending'
          AND COALESCE(next_attempt_at, created_at + make_interval(secs => $2)) <= NOW()
        ORDER BY next_attempt_at NULLS FIRST, id
        LIMIT $1
        FOR UPDATE SKIP LOCKED)
     UPDATE engine_deliveries d
        SET next_attempt_at = NOW() + make_interval(secs => $2)
       FROM due
      WHERE d.id = due.id
     RETURNING d.id, d.workspace_id, d.event, d.raw_body, d.attempts,
               (SELECT w.engine_url     FROM workspace_engine w WHERE w.workspace_id = d.workspace_id) AS url,
               (SELECT w.webhook_secret FROM workspace_engine w WHERE w.workspace_id = d.workspace_id) AS secret,
               (SELECT w.active         FROM workspace_engine w WHERE w.workspace_id = d.workspace_id) AS active`,
    [limit, LEASE_SEC]
  );
  return rows;
}

async function processClaimed(row) {
  if (!row.active || !row.url) {
    await pool.query(
      `UPDATE engine_deliveries SET last_error=$1, next_attempt_at = NOW() + make_interval(secs => $2) WHERE id=$3`,
      [INACTIVE_ERROR, POSTPONE_SEC, row.id]
    );
    return { id: row.id, ok: false, postponed: true, attempts: Number(row.attempts) || 0, delivery_status: 'pending' };
  }
  const outcome = await attemptOnce({ url: row.url, secret: row.secret, rawBody: row.raw_body, event: row.event });
  return recordAttempt(row.id, (Number(row.attempts) || 0) + 1, outcome);
}

// One worker pass: claim, then attempt each claimed row in turn. Returns the results.
async function runDue({ limit = 20 } = {}) {
  const rows = await claimDue(limit);
  const results = [];
  for (const row of rows) results.push(await processClaimed(row));
  return results;
}

let worker = null;
// Started once by server.js after initDb(). Ticks immediately (catching up on
// anything left from before a restart), then every `intervalMs`. A tick that is
// still running is not overlapped. The timer is unref'd so it never keeps a
// shutting-down process alive.
function startRetryWorker({ intervalMs = 30_000, limit = 20, log = console } = {}) {
  if (worker) return worker;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await runDue({ limit }); }
    catch (e) { log.error('engine retry worker:', e && e.message ? e.message : e); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  worker = { tick, stop() { clearInterval(timer); worker = null; } };
  tick();
  return worker;
}
function stopRetryWorker() { if (worker) worker.stop(); }

// Manual retry (Integrations → Sent events → Retry). Takes the row out of the
// worker's reach for the lease, then one counted attempt now; a transient failure
// re-enters the automatic schedule while attempts remain, otherwise stays failed.
async function retryDelivery({ id, event, raw_body, attempts }, { engine_url, webhook_secret }) {
  await pool.query(
    `UPDATE engine_deliveries SET status='pending', next_attempt_at = NOW() + make_interval(secs => $1) WHERE id=$2`,
    [LEASE_SEC, id]
  );
  return deliver(id, { url: engine_url, secret: webhook_secret, rawBody: raw_body, event }, { attemptsSoFar: Number(attempts) || 0 });
}

// ── Entry points ────────────────────────────────────────────────────────────
// Called by routes/deals.js after a stage write. Resolves to null when nothing
// was sent (integration off, no URL, stage not a trigger), otherwise to the
// result of the immediate attempt. Callers do not await it. `timezone` is the
// acting user's zone (req.userTimezone): `unterschrieben_am` is the date they saw.
// `baseUrl` (utils/base-url.js) makes `dokument_url` absolute when the customer
// has a contract document (typ 'vertrag'; the one on this deal preferred).
function dispatchContractSigned({ workspaceId, dealId, contactId, title, stageId, timezone, baseUrl = null }) {
  const run = (async () => {
    const settings = await getSettings(workspaceId);
    if (!settings || !settings.active || !settings.engine_url || !isTriggerStage(settings, stageId)) return null;

    const now       = new Date();
    const eventId   = crypto.randomUUID();
    const zeitpunkt = now.toISOString();
    const kundeId   = contactId == null ? null : Number(contactId);
    const vertragId = Number(dealId);

    const { rows: [deal] } = await pool.query('SELECT custom_data FROM deals WHERE id=$1 AND workspace_id=$2', [vertragId, workspaceId]);
    const details = contractDetails(deal ? deal.custom_data : null);

    // The signed contract, if the team has uploaded one: the newest 'vertrag' document
    // of this customer, preferring one linked to this very deal.
    let dokumentUrl = null;
    if (kundeId != null && baseUrl) {
      const { rows: [doc] } = await pool.query(
        `SELECT id FROM contact_documents WHERE workspace_id=$1 AND contact_id=$2 AND typ='vertrag'
          ORDER BY (deal_id = $3) DESC NULLS LAST, created_at DESC LIMIT 1`,
        [workspaceId, kundeId, vertragId]
      );
      if (doc) dokumentUrl = documentUrl(baseUrl, doc.id);
    }

    const payload = buildContractSignedPayload({
      eventId, zeitpunkt, contactId: kundeId, dealId: vertragId, title,
      unterschriebenAm: details.unterschrieben_am || dateInZone(now, timezone),
      laufzeitMonate:   details.laufzeit_monate,
      dokumentUrl,
    });
    const rawBody = JSON.stringify(payload);
    const id = await createDelivery({
      workspaceId, event: EVENT_CONTRACT_SIGNED, eventId, dealId: vertragId, contactId: kundeId,
      url: settings.engine_url, rawBody,
    });

    // kunde_id is the key of the record the Engine works on (briefing §2 step 1).
    // Without a contact there is nothing to onboard: log it, do not send it.
    if (kundeId == null) return markNotSent(id, NO_CONTACT_ERROR);

    return deliver(id, { url: settings.engine_url, secret: settings.webhook_secret, rawBody, event: EVENT_CONTRACT_SIGNED });
  })();
  return track(run);
}

// Called by routes/contacts.js and the inbound lead webhook after a contact write.
// kunde.angelegt: a new client record. kunde.aktualisiert: master data changed —
// `changed` is the list from utils/kunde.js masterDataChanges(); an empty list
// sends nothing. Suppliers are not clients and never produce an event. There is
// no trigger-stage condition here: the integration only has to be active.
// Engine-originated writes (routes/engine-api.js) never reach this module.
function dispatchContactEvent({ workspaceId, contactId, event, changed = [] }) {
  const run = (async () => {
    if (event !== EVENT_CONTACT_CREATED && event !== EVENT_CONTACT_UPDATED) return null;
    if (event === EVENT_CONTACT_UPDATED && !(Array.isArray(changed) && changed.length)) return null;
    const id = Number(contactId);
    if (!Number.isInteger(id) || id <= 0) return null;

    const settings = await getSettings(workspaceId);
    if (!settings || !settings.active || !settings.engine_url) return null;

    const { rows: [c] } = await pool.query(`SELECT ${KUNDE_COLUMNS} FROM contacts WHERE id=$1 AND workspace_id=$2`, [id, workspaceId]);
    if (!c || (c.contact_type || 'contact') !== 'contact') return null;

    const eventId   = crypto.randomUUID();
    const zeitpunkt = new Date().toISOString();
    const rawBody   = JSON.stringify(buildContactPayload(event, c, { eventId, zeitpunkt, changed }));
    const deliveryId = await createDelivery({ workspaceId, event, eventId, dealId: null, contactId: id, url: settings.engine_url, rawBody });
    return deliver(deliveryId, { url: settings.engine_url, secret: settings.webhook_secret, rawBody, event });
  })();
  return track(run);
}
const dispatchContactCreated = ({ workspaceId, contactId })          => dispatchContactEvent({ workspaceId, contactId, event: EVENT_CONTACT_CREATED });
const dispatchContactUpdated = ({ workspaceId, contactId, changed }) => dispatchContactEvent({ workspaceId, contactId, event: EVENT_CONTACT_UPDATED, changed });

// Called by routes/contact-documents.js after an upload (briefing §5.1
// dokument.hinzugefuegt: "evaluate it, e.g. contract or recording"). `daten` is the
// §5.2 document view plus `vertrag_id` when the file is linked to a deal; the Engine
// fetches the bytes through `download_url` with its API key. Documents on suppliers
// never fire.
function dispatchDocumentAdded({ workspaceId, documentId, baseUrl = null }) {
  const run = (async () => {
    const id = Number(documentId);
    if (!Number.isInteger(id) || id <= 0) return null;
    const settings = await getSettings(workspaceId);
    if (!settings || !settings.active || !settings.engine_url) return null;

    const { rows: [d] } = await pool.query(
      `SELECT d.id, d.contact_id, d.deal_id, d.typ, d.file_name, d.file_type, d.file_size, d.created_at, c.contact_type
         FROM contact_documents d
         JOIN contacts c ON c.id = d.contact_id AND c.workspace_id = d.workspace_id
        WHERE d.id=$1 AND d.workspace_id=$2`,
      [id, workspaceId]
    );
    if (!d || (d.contact_type || 'contact') !== 'contact') return null;

    const eventId   = crypto.randomUUID();
    const zeitpunkt = new Date().toISOString();
    const contactId = Number(d.contact_id);
    const dealId    = d.deal_id == null ? null : Number(d.deal_id);
    const daten     = { ...dokumentView(d, baseUrl), vertrag_id: dealId };
    const rawBody   = JSON.stringify(buildEnvelope(EVENT_DOCUMENT_ADDED, { eventId, zeitpunkt, contactId, daten }));
    const deliveryId = await createDelivery({ workspaceId, event: EVENT_DOCUMENT_ADDED, eventId, dealId, contactId, url: settings.engine_url, rawBody });
    return deliver(deliveryId, { url: settings.engine_url, secret: settings.webhook_secret, rawBody, event: EVENT_DOCUMENT_ADDED });
  })();
  return track(run);
}

// "Send test event" on the Integrations page: one attempt, awaited by the route,
// never re-driven by the worker.
async function sendTestEvent(workspaceId) {
  const settings = await getSettings(workspaceId);
  if (!settings || !settings.engine_url) throw new Error('Engine URL not set');
  const eventId   = crypto.randomUUID();
  const zeitpunkt = new Date().toISOString();
  const rawBody   = JSON.stringify(buildTestPayload({ eventId, zeitpunkt, workspaceId }));
  const id = await createDelivery({ workspaceId, event: EVENT_TEST, eventId, dealId: null, contactId: null, url: settings.engine_url, rawBody });
  return deliver(id, { url: settings.engine_url, secret: settings.webhook_secret, rawBody, event: EVENT_TEST }, { retry: false });
}

module.exports = {
  EVENT_CONTRACT_SIGNED, EVENT_CONTACT_CREATED, EVENT_CONTACT_UPDATED, EVENT_DOCUMENT_ADDED, EVENT_TEST, NO_CONTACT_ERROR, INACTIVE_ERROR, DEFAULT_TZ,
  RETRY_DELAYS_SEC, MAX_ATTEMPTS, LEASE_SEC, POSTPONE_SEC,
  sign, verify, dateInZone, contractDetails, buildEnvelope, buildContractSignedPayload, buildContactPayload, buildTestPayload, isTriggerStage, stageNum, retryDelaySec,
  getSettings, dispatchContractSigned, dispatchContactEvent, dispatchContactCreated, dispatchContactUpdated, dispatchDocumentAdded, sendTestEvent, deliver, recordAttempt,
  claimDue, runDue, startRetryWorker, stopRetryWorker, retryDelivery,
  configure, resetConfig, drain,
};
