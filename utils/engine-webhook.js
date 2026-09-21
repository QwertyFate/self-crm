/**
 * Outgoing webhooks to the UPGRADS Onboarding Engine.
 *
 *   emitEngineEvent(workspaceId, event, { kundeId, daten })
 *     -> one engine_webhook_deliveries row per subscribed, active webhook,
 *        then an immediate delivery attempt (not awaited by default).
 *   startEngineWebhookWorker()
 *     -> polls every 30 s, claims due rows atomically (FOR UPDATE SKIP LOCKED),
 *        retries with backoff, gives up after MAX_ATTEMPTS.
 *
 * Status words are the Stage 1 schema's: pending → delivered | failed → dead.
 * "delivered" is success; "dead" is gave-up.
 *
 * Signature: HMAC-SHA256 with the webhook's secret over the exact body bytes
 * sent, in `X-Upgrads-Signature: sha256=<hex>`. Computed at send time, because
 * JSONB may reorder keys between attempts and the receiver verifies what it
 * actually receives.
 *
 * Built as a factory with injectable dependencies (pool, fetch, clock,
 * randomness) so it can be tested without a database or network; the default
 * export is bound lazily to the real pool and global fetch.
 */
const crypto = require('crypto');

const STATUS          = { PENDING: 'pending', DELIVERED: 'delivered', FAILED: 'failed', DEAD: 'dead' };
const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720];   // after failure 1..6 → attempts at ~0, 1m, 6m, 36m, 2.6h, 8.6h, 20.6h
const MAX_ATTEMPTS    = 7;
const LEASE_MINUTES   = 5;                            // a claimed row becomes due again if its worker dies
const RESPONSE_BODY_LIMIT = 2000;

function signBody(secret, rawBody) {
  return crypto.createHmac('sha256', String(secret)).update(rawBody, 'utf8').digest('hex');
}

function createEngineWebhookEngine({
  pool,
  fetch = (...a) => globalThis.fetch(...a),
  now = () => new Date(),
  random = n => crypto.randomBytes(n),
  timeoutMs = 10_000,
  log = console,
} = {}) {
  if (!pool) throw new Error('engine-webhook: pool is required');

  const newEventId = () => 'evt_' + random(16).toString('hex');

  // ---- Atomic claim. Two workers (or worker + immediate dispatch) never take
  // the same row; the lease bump makes an orphaned row due again on its own.
  async function claimDue({ limit = 20, ids = null } = {}) {
    const params = [limit];
    let idFilter = '';
    if (Array.isArray(ids)) { params.push(ids); idFilter = ' AND id = ANY($2::int[])'; }
    const { rows } = await pool.query(
      `WITH due AS (
         SELECT id FROM engine_webhook_deliveries
          WHERE status IN ('pending','failed') AND next_attempt_at <= NOW()${idFilter}
          ORDER BY next_attempt_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED)
       UPDATE engine_webhook_deliveries d
          SET attempts = d.attempts + 1,
              last_attempt_at = NOW(),
              next_attempt_at = NOW() + INTERVAL '${LEASE_MINUTES} minutes'
         FROM due
        WHERE d.id = due.id
       RETURNING d.id, d.webhook_id, d.workspace_id, d.event, d.payload, d.attempts,
                 (SELECT w.url    FROM engine_webhook w WHERE w.id = d.webhook_id) AS url,
                 (SELECT w.secret FROM engine_webhook w WHERE w.id = d.webhook_id) AS secret,
                 (SELECT w.active FROM engine_webhook w WHERE w.id = d.webhook_id) AS active`,
      params
    );
    return rows;
  }

  // attempts has already been incremented by the claim.
  function retryDelayMinutes(attempts) {
    if (attempts >= MAX_ATTEMPTS) return null;
    return BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  }

  async function finish(id, o) {
    if (o.status === STATUS.DELIVERED) {
      await pool.query(
        `UPDATE engine_webhook_deliveries
            SET status='delivered', response_status=$2, response_body=$3, error=NULL, delivered_at=NOW(), next_attempt_at=NULL
          WHERE id=$1`,
        [id, o.responseStatus ?? null, o.responseBody ?? null]
      );
    } else if (o.status === STATUS.FAILED) {
      await pool.query(
        `UPDATE engine_webhook_deliveries
            SET status='failed', response_status=$2, response_body=$3, error=$4,
                next_attempt_at = NOW() + ($5::int * INTERVAL '1 minute')
          WHERE id=$1`,
        [id, o.responseStatus ?? null, o.responseBody ?? null, o.error ?? null, o.retryInMinutes]
      );
    } else {
      await pool.query(
        `UPDATE engine_webhook_deliveries
            SET status='dead', response_status=$2, response_body=$3, error=$4, next_attempt_at=NULL
          WHERE id=$1`,
        [id, o.responseStatus ?? null, o.responseBody ?? null, o.error ?? null]
      );
    }
    return { id, ...o };
  }

  async function attemptDelivery(row) {
    if (!row.url || row.active === false) {
      return finish(row.id, { status: STATUS.DEAD, error: 'Webhook inaktiv' });
    }
    const body = JSON.stringify(row.payload);
    const headers = {
      'Content-Type':        'application/json',
      'User-Agent':          'UPGRADS-CRM-Webhook/1',
      'X-Upgrads-Signature': `sha256=${signBody(row.secret, body)}`,
      'X-Upgrads-Event':     row.event,
      'X-Upgrads-Event-Id':  row.payload?.event_id || '',
      'X-Upgrads-Delivery':  String(row.id),
      'X-Upgrads-Timestamp': String(Math.floor(now().getTime() / 1000)),
    };

    let outcome;
    try {
      const res  = await fetch(row.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
      const text = String(await res.text().catch(() => '')).slice(0, RESPONSE_BODY_LIMIT);
      outcome = res.ok
        ? { status: STATUS.DELIVERED, responseStatus: res.status, responseBody: text }
        : { status: null, responseStatus: res.status, responseBody: text, error: `HTTP ${res.status}` };
    } catch (e) {
      const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      outcome = { status: null, error: timedOut ? `Timeout nach ${timeoutMs} ms` : (e && e.message) || String(e) };
    }

    if (outcome.status !== STATUS.DELIVERED) {
      const delay = retryDelayMinutes(row.attempts);
      outcome.status = delay === null ? STATUS.DEAD : STATUS.FAILED;
      outcome.retryInMinutes = delay;
    }
    return finish(row.id, outcome);
  }

  async function attemptDeliveries(ids) {
    if (!ids.length) return [];
    const rows = await claimDue({ limit: ids.length, ids });
    const results = [];
    for (const r of rows) results.push(await attemptDelivery(r));
    return results;
  }

  async function emitEngineEvent(workspaceId, event, { kundeId = null, daten = {} } = {}, { sync = false } = {}) {
    if (!workspaceId || !event) throw new Error('emitEngineEvent: workspaceId und event sind erforderlich');
    const eventId = newEventId();
    const payload = {
      event_id:     eventId,
      event,
      workspace_id: workspaceId,
      kunde_id:     kundeId ?? null,
      daten:        daten ?? {},
      zeitpunkt:    now().toISOString(),
    };

    // '[]' (no filter) means every event; '*' is an explicit wildcard.
    const { rows: hooks } = await pool.query(
      `SELECT id FROM engine_webhook
        WHERE workspace_id = $1 AND active = true
          AND (events = '[]'::jsonb OR events ? $2 OR events ? '*')`,
      [workspaceId, event]
    );
    if (!hooks.length) return { eventId, deliveryIds: [] };

    const { rows } = await pool.query(
      `INSERT INTO engine_webhook_deliveries (webhook_id, workspace_id, event, payload, contact_id)
       SELECT w, $2, $3, $4::jsonb, $5 FROM unnest($1::int[]) AS w
       RETURNING id`,
      [hooks.map(h => h.id), workspaceId, event, JSON.stringify(payload), kundeId ?? null]
    );
    const deliveryIds = rows.map(r => r.id);

    // Immediate attempt. Not awaited by default: the caller's request must not
    // wait on a third-party endpoint. Failures are recorded on the row and
    // picked up by the worker.
    const dispatch = attemptDeliveries(deliveryIds).catch(e => log.error('engine webhook dispatch failed:', e.message));
    if (sync) await dispatch;
    return { eventId, deliveryIds };
  }

  // ---- Worker
  let timer = null;
  let running = false;

  async function runWorkerOnce({ batch = 20 } = {}) {
    if (running) return { skipped: true };
    running = true;
    try {
      const rows = await claimDue({ limit: batch });
      const summary = { claimed: rows.length, delivered: 0, failed: 0, dead: 0 };
      for (const r of rows) {
        const o = await attemptDelivery(r);
        summary[o.status] = (summary[o.status] || 0) + 1;
      }
      if (rows.length) log.log(`engine webhooks: ${JSON.stringify(summary)}`);
      return summary;
    } catch (e) {
      log.error('engine webhook worker error:', e.message);
      return { error: e.message };
    } finally {
      running = false;
    }
  }

  function stop() { if (timer) clearInterval(timer); timer = null; }

  function startEngineWebhookWorker({ intervalMs = 30_000, batch = 20 } = {}) {
    if (!timer) {
      timer = setInterval(() => { runWorkerOnce({ batch }); }, intervalMs);
      if (typeof timer.unref === 'function') timer.unref();   // never keeps the process alive on its own
    }
    return { stop, runWorkerOnce };
  }

  return { emitEngineEvent, startEngineWebhookWorker, runWorkerOnce, attemptDelivery, attemptDeliveries, claimDue, stop, isRunning: () => running };
}

// Default engine, bound lazily so requiring this module never opens a DB connection.
let defaultEngine = null;
function getDefault() {
  if (!defaultEngine) defaultEngine = createEngineWebhookEngine({ pool: require('../db').pool });
  return defaultEngine;
}

module.exports = {
  emitEngineEvent:          (...a) => getDefault().emitEngineEvent(...a),
  startEngineWebhookWorker: (...a) => getDefault().startEngineWebhookWorker(...a),
  runWorkerOnce:            (...a) => getDefault().runWorkerOnce(...a),
  attemptDeliveries:        (...a) => getDefault().attemptDeliveries(...a),   // manual retry from the settings UI
  createEngineWebhookEngine,
  signBody,
  STATUS, BACKOFF_MINUTES, MAX_ATTEMPTS, LEASE_MINUTES,
};
