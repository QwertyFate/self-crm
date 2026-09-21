/**
 * Onboarding Engine settings — the CRM-side management routes behind the
 * Integrations page: the outgoing webhook (one per workspace in the UI),
 * its deliveries, and API keys. Session-authenticated, owner-only.
 *
 * Secrets are shown once: the webhook secret on create/rotate, the API key on
 * create. The API key is stored only as a SHA-256 hash (api_keys.key_hash).
 */
const express     = require('express');
const crypto      = require('crypto');
const router      = express.Router();
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const { emitEngineEvent, attemptDeliveries } = require('../utils/engine-webhook');

router.use(requireAuth);
router.use((req, res, next) => (req.userRole === 'owner' ? next() : res.status(403).json({ error: 'Owner only' })));

// onboarding.status_geaendert: a CRM user changed the status by hand (routes/contacts.js).
const AVAILABLE_EVENTS = ['vertrag.unterschrieben', 'onboarding.status_geaendert', 'test.ereignis'];
const WEBHOOK_COLS = 'id, url, events, description, active, RIGHT(secret, 4) AS secret_hint, created_at, updated_at';
const newSecret = () => crypto.randomBytes(32).toString('hex');
const hint = s => (s ? s.slice(-4) : null);

function validateWebhookBody(body) {
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2048) return { error: 'url must be an http(s) URL' };
  const events = Array.isArray(body.events) ? body.events : [];
  if (!events.every(e => e === '*' || AVAILABLE_EVENTS.includes(e))) return { error: `events may only contain * or ${AVAILABLE_EVENTS.join(', ')}` };
  const description = body.description == null ? null : String(body.description).slice(0, 500);
  const active = body.active === undefined ? true : !!body.active;
  return { url, events, description, active };
}

// ---- Webhook ---------------------------------------------------------------
router.get('/webhook', async (req, res, next) => {
  try {
    const { rows: [w] } = await pool.query(`SELECT ${WEBHOOK_COLS} FROM engine_webhook WHERE workspace_id=$1 ORDER BY id LIMIT 1`, [req.workspaceId]);
    res.json({ webhook: w || null, available_events: AVAILABLE_EVENTS });
  } catch (e) { next(e); }
});

router.put('/webhook', async (req, res, next) => {
  try {
    const v = validateWebhookBody(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    const { rows: [existing] } = await pool.query('SELECT id FROM engine_webhook WHERE workspace_id=$1 ORDER BY id LIMIT 1', [req.workspaceId]);
    if (existing) {
      const { rows: [w] } = await pool.query(
        `UPDATE engine_webhook SET url=$1, events=$2::jsonb, description=$3, active=$4, updated_at=NOW()
          WHERE id=$5 AND workspace_id=$6 RETURNING ${WEBHOOK_COLS}`,
        [v.url, JSON.stringify(v.events), v.description, v.active, existing.id, req.workspaceId]
      );
      return res.json({ webhook: w });
    }
    const secret = newSecret();
    const { rows: [w] } = await pool.query(
      `INSERT INTO engine_webhook (workspace_id, url, secret, events, description, active, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING ${WEBHOOK_COLS}`,
      [req.workspaceId, v.url, secret, JSON.stringify(v.events), v.description, v.active, req.userId]
    );
    res.status(201).json({ webhook: w, secret });   // shown once
  } catch (e) { next(e); }
});

router.post('/webhook/rotate-secret', async (req, res, next) => {
  try {
    const secret = newSecret();
    const { rows: [w] } = await pool.query(
      `UPDATE engine_webhook SET secret=$1, updated_at=NOW()
        WHERE id = (SELECT id FROM engine_webhook WHERE workspace_id=$2 ORDER BY id LIMIT 1) AND workspace_id=$2
        RETURNING ${WEBHOOK_COLS}`,
      [secret, req.workspaceId]
    );
    if (!w) return res.status(404).json({ error: 'No webhook configured' });
    res.json({ webhook: w, secret });   // shown once
  } catch (e) { next(e); }
});

router.post('/webhook/test', async (req, res, next) => {
  try {
    const r = await emitEngineEvent(req.workspaceId, 'test.ereignis', { daten: { ausgeloest_von: req.userId, zeitpunkt: new Date().toISOString() } }, { sync: true });
    if (!r.deliveryIds.length) return res.status(400).json({ error: 'No active webhook subscribed to test.ereignis (or *)' });
    const { rows } = await pool.query(
      'SELECT id, status, response_status, error FROM engine_webhook_deliveries WHERE workspace_id=$1 AND id = ANY($2::int[]) ORDER BY id',
      [req.workspaceId, r.deliveryIds]
    );
    res.json({ event_id: r.eventId, deliveries: rows });
  } catch (e) { next(e); }
});

router.get('/webhook/deliveries', async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { rows } = await pool.query(
      `SELECT id, event, status, attempts, response_status, error, created_at, last_attempt_at, delivered_at
         FROM engine_webhook_deliveries WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [req.workspaceId, limit]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/webhook/deliveries/:id/retry', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    const id = Number(req.params.id);
    // A dead row gets one more chance; clamping attempts keeps the backoff table valid.
    const { rowCount } = await pool.query(
      `UPDATE engine_webhook_deliveries SET status='failed', next_attempt_at=NOW(), attempts=LEAST(attempts, 6)
        WHERE id=$1 AND workspace_id=$2 AND status IN ('failed','dead')`,
      [id, req.workspaceId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Delivery not found or not retryable' });
    const [outcome] = await attemptDeliveries([id]);
    res.json({ id, status: outcome?.status ?? 'pending', response_status: outcome?.responseStatus ?? null, error: outcome?.error ?? null });
  } catch (e) { next(e); }
});

// ---- API keys --------------------------------------------------------------
const KEY_COLS = 'id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at';

router.get('/api-keys', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${KEY_COLS} FROM api_keys WHERE workspace_id=$1 ORDER BY created_at DESC`, [req.workspaceId]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/api-keys', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
    if (!name) return res.status(400).json({ error: 'Name required' });
    const key      = 'upg_live_' + crypto.randomBytes(16).toString('hex');
    const key_hash = crypto.createHash('sha256').update(key, 'utf8').digest('hex');
    const { rows: [row] } = await pool.query(
      `INSERT INTO api_keys (workspace_id, name, key_prefix, key_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING ${KEY_COLS}`,
      [req.workspaceId, name, key.slice(0, 12), key_hash, req.userId]
    );
    res.status(201).json({ ...row, key });   // the plain key, shown once
  } catch (e) { next(e); }
});

router.delete('/api-keys/:id', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Invalid id' });
    const { rowCount } = await pool.query(
      'UPDATE api_keys SET revoked_at=NOW() WHERE id=$1 AND workspace_id=$2 AND revoked_at IS NULL',
      [Number(req.params.id), req.workspaceId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.AVAILABLE_EVENTS = AVAILABLE_EVENTS;
module.exports.hint = hint;
