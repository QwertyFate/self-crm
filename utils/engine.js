// Upgrads Engine — outgoing webhook.
//
// When a deal moves into one of the workspace's trigger stages, the deals route
// calls `dispatchContractSigned` (fire-and-forget). This module looks up the
// workspace's Engine settings, builds the `vertrag.unterschrieben` payload,
// records a row in `engine_deliveries`, and POSTs the payload signed with the
// workspace's webhook secret. Failed attempts are retried in-process with a
// short backoff; every attempt updates the delivery row so the Integrations
// page can show what happened.
//
// Signature (what the Engine verifies):
//   X-Upgrads-Timestamp: <unix seconds, fresh per attempt>
//   X-Upgrads-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
// The raw body is the exact string sent (`raw_body` in the log); it is never
// rebuilt from the JSONB column, because Postgres reorders object keys.
const crypto   = require('crypto');
const { pool } = require('../db');

const EVENT_CONTRACT_SIGNED = 'vertrag.unterschrieben';
const EVENT_TEST            = 'test.ping';
const USER_AGENT            = 'Upgrads-CRM/1.0';

// ── Configuration (overridable in tests) ────────────────────────────────────
function defaultWait(ms) {
  return new Promise(resolve => { const t = setTimeout(resolve, ms); if (typeof t.unref === 'function') t.unref(); });
}
const DEFAULTS = { fetch: null, delays: [0, 5000, 30000], timeoutMs: 10000, wait: defaultWait };
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
function sign(secret, timestamp, rawBody) {
  return 'sha256=' + crypto.createHmac('sha256', String(secret)).update(`${timestamp}.${rawBody}`).digest('hex');
}

// Reference verifier: what the Engine side must do. Used by the tests and quoted in ENGINE_INTEGRATION.md.
function verify(secret, timestamp, rawBody, signature, { toleranceSec = 300, now = () => Date.now() } = {}) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad timestamp' };
  if (Math.abs(now() / 1000 - ts) > toleranceSec) return { ok: false, reason: 'timestamp outside tolerance' };
  const expected = Buffer.from(sign(secret, timestamp, rawBody));
  const given    = Buffer.from(String(signature || ''));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, reason: 'signature mismatch' };
  return { ok: true };
}

// ── Payloads and trigger check ──────────────────────────────────────────────
function buildContractSignedPayload({ eventId, timestamp, contactId, dealId, title, stageName }) {
  return {
    event:      EVENT_CONTRACT_SIGNED,
    event_id:   eventId,
    timestamp,
    kunde_id:   contactId ?? null,
    vertrag_id: dealId,
    produkt:    title ?? '',
    stage:      stageName ?? '',
  };
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

async function createDelivery({ workspaceId, event, eventId, dealId, contactId, url, rawBody }) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO engine_deliveries (workspace_id, event, event_id, deal_id, contact_id, url, payload, raw_body)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
    [workspaceId, event, eventId, dealId ?? null, contactId ?? null, url, rawBody, rawBody]
  );
  return row.id;
}

// ── Delivery with retry ─────────────────────────────────────────────────────
function isRetryableStatus(status) {
  return status >= 500 || status === 408 || status === 429;
}

async function attemptOnce({ url, secret, rawBody, event }) {
  const ts = Math.floor(Date.now() / 1000);
  const headers = {
    'Content-Type':        'application/json',
    'User-Agent':          USER_AGENT,
    'X-Upgrads-Event':     event,
    'X-Upgrads-Timestamp': String(ts),
    'X-Upgrads-Signature': sign(secret, ts, rawBody),
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

// Sends one delivery row, retrying on transient failures. Never throws for a
// failed HTTP attempt; only a failing database write rejects the promise.
function deliver(deliveryId, { url, secret, rawBody, event }, { maxAttempts = 3 } = {}) {
  const run = (async () => {
    let last = { ok: false, status: null, error: 'not attempted', retryable: false };
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      const delay = cfg.delays[attempt - 1] || 0;
      if (attempt > 1 && delay > 0) await cfg.wait(delay);
      last = await attemptOnce({ url, secret, rawBody, event });
      const willRetry = !last.ok && last.retryable && attempt < maxAttempts;
      const status    = last.ok ? 'success' : (willRetry ? 'pending' : 'failed');
      const nextAt    = willRetry ? new Date(Date.now() + (cfg.delays[attempt] || 0)) : null;
      await pool.query(
        `UPDATE engine_deliveries
         SET attempts=$1, last_status_code=$2, last_error=$3, status=$4,
             delivered_at=CASE WHEN $5::boolean THEN NOW() ELSE NULL END,
             next_attempt_at=$6
         WHERE id=$7`,
        [attempt, last.status, last.error, status, last.ok, nextAt, deliveryId]
      );
      if (!willRetry) break;
    }
    return { id: deliveryId, ok: last.ok, status: last.status, error: last.error, attempts: attempt };
  })();
  return track(run);
}

// ── Entry points ────────────────────────────────────────────────────────────
// Called by routes/deals.js after a stage write. Resolves to null when nothing
// was sent (integration off, no URL, stage not a trigger), otherwise to the
// delivery result. Callers do not await it.
function dispatchContractSigned({ workspaceId, dealId, contactId, title, stageId }) {
  const run = (async () => {
    const settings = await getSettings(workspaceId);
    if (!settings || !settings.active || !settings.engine_url || !isTriggerStage(settings, stageId)) return null;

    const { rows: [stage] } = await pool.query(
      'SELECT name FROM pipeline_stages WHERE id=$1 AND workspace_id=$2', [stageNum(stageId), workspaceId]
    );
    const eventId   = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const payload   = buildContractSignedPayload({
      eventId, timestamp,
      contactId: contactId == null ? null : Number(contactId),
      dealId: Number(dealId), title, stageName: stage ? stage.name : '',
    });
    const rawBody = JSON.stringify(payload);
    const id = await createDelivery({
      workspaceId, event: EVENT_CONTRACT_SIGNED, eventId,
      dealId: Number(dealId), contactId: contactId == null ? null : Number(contactId),
      url: settings.engine_url, rawBody,
    });
    return deliver(id, { url: settings.engine_url, secret: settings.webhook_secret, rawBody, event: EVENT_CONTRACT_SIGNED });
  })();
  return track(run);
}

// "Send test event" on the Integrations page: one attempt, awaited by the route.
async function sendTestEvent(workspaceId) {
  const settings = await getSettings(workspaceId);
  if (!settings || !settings.engine_url) throw new Error('Engine URL not set');
  const eventId   = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const rawBody   = JSON.stringify({ event: EVENT_TEST, event_id: eventId, timestamp, workspace_id: workspaceId });
  const id = await createDelivery({ workspaceId, event: EVENT_TEST, eventId, dealId: null, contactId: null, url: settings.engine_url, rawBody });
  return deliver(id, { url: settings.engine_url, secret: settings.webhook_secret, rawBody, event: EVENT_TEST }, { maxAttempts: 1 });
}

module.exports = {
  EVENT_CONTRACT_SIGNED, EVENT_TEST,
  sign, verify, buildContractSignedPayload, isTriggerStage, stageNum,
  getSettings, dispatchContractSigned, sendTestEvent, deliver,
  configure, resetConfig, drain,
};
