// Upgrads Engine settings (Integrations page): Engine URL, on/off, the pipeline
// stages that mean "contract signed", the webhook secret, the delivery log and
// a test event. Reads are open to every member; writes need owner or admin.
const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const net         = require('net');
const path        = require('path');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const engine      = require('../utils/engine');
const { hashKey } = require('../middleware/engine-auth');   // the same digest the Engine API's lookup uses

router.use(requireAuth);

const canManage  = role => role === 'owner' || role === 'admin';
const newSecret  = () => crypto.randomBytes(32).toString('hex');
const positiveInts = list => (Array.isArray(list) ? list : []).map(Number).filter(n => Number.isInteger(n) && n > 0);

function requireManage(req, res, next) {
  if (!canManage(req.userRole)) return res.status(403).json({ error: 'Owner or admin only' });
  next();
}

// The Engine URL is fetched by the server, so an owner must not be able to point
// it at the CRM host itself, the database, or a cloud metadata service.
// ENGINE_ALLOW_PRIVATE_URLS=1 lifts this for local development against a local Engine.
function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}
function isPrivateIPv6(ip) {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) {
    const tail = v.slice(7);
    return net.isIPv4(tail) ? isPrivateIPv4(tail) : true;
  }
  return /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}
function isPrivateHost(hostname) {
  if (process.env.ENGINE_ALLOW_PRIVATE_URLS === '1') return false;
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const kind = net.isIP(h);
  if (kind === 4) return isPrivateIPv4(h);
  if (kind === 6) return isPrivateIPv6(h);
  return false;
}

// Returns null when the URL is usable, otherwise the message for the client.
function urlProblem(u) {
  if (typeof u !== 'string' || u.length > 2048) return 'Engine URL must start with http:// or https://';
  let p;
  try { p = new URL(u); } catch { return 'Engine URL must start with http:// or https://'; }
  if ((p.protocol !== 'http:' && p.protocol !== 'https:') || !p.hostname) return 'Engine URL must start with http:// or https://';
  if (isPrivateHost(p.hostname)) return 'Engine URL must point to a public host, not a private or loopback address';
  return null;
}

// What the client sees. Members never receive the secret.
function view(row, withSecret) {
  return {
    engine_url:        row.engine_url || null,
    active:            row.active === true,
    trigger_stage_ids: positiveInts(row.trigger_stage_ids),
    webhook_secret:    withSecret ? row.webhook_secret : null,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
  };
}

async function loadRow(workspaceId) {
  const { rows: [row] } = await pool.query('SELECT * FROM workspace_engine WHERE workspace_id=$1', [workspaceId]);
  return row || null;
}

router.get('/settings', async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    let row = await loadRow(wid);
    if (!row) {
      // First visit: create the row, preselecting the stages Analytics already treats as "won".
      // Two first visits at once (two tabs) race on the UNIQUE workspace_id; the loser re-reads.
      const { rows: [ws] } = await pool.query('SELECT analytics_config FROM workspaces WHERE id=$1', [wid]);
      const seed = positiveInts(ws?.analytics_config?.won_stage_ids);
      const { rows: [created] } = await pool.query(
        `INSERT INTO workspace_engine (workspace_id, webhook_secret, trigger_stage_ids) VALUES ($1,$2,$3::jsonb)
         ON CONFLICT (workspace_id) DO NOTHING RETURNING *`,
        [wid, newSecret(), JSON.stringify(seed)]
      );
      row = created || await loadRow(wid);
      if (!row) return res.status(500).json({ error: 'Could not create the Engine settings' });
    }
    const { rows: stages } = await pool.query(
      `SELECT ps.id, ps.name, ps.color, ps.pipeline_id, p.name AS pipeline_name
       FROM pipeline_stages ps JOIN pipelines p ON p.id=ps.pipeline_id
       WHERE ps.workspace_id=$1 ORDER BY p.position, ps.position`, [wid]
    );
    res.json({
      engine: view(row, canManage(req.userRole)),
      stages,
      can_manage: canManage(req.userRole),
    });
  } catch (err) { next(err); }
});

router.patch('/settings', requireManage, async (req, res, next) => {
  try {
    const { engine_url, active, trigger_stage_ids } = req.body || {};

    let url = typeof engine_url === 'string' ? engine_url.trim() : '';
    if (url) {
      const problem = urlProblem(url);
      if (problem) return res.status(400).json({ error: problem });
    }
    url = url || null;

    const isActive = active === true;
    if (isActive && !url) return res.status(400).json({ error: 'Set the Engine URL before activating' });

    if (trigger_stage_ids !== undefined && !Array.isArray(trigger_stage_ids)) {
      return res.status(400).json({ error: 'trigger_stage_ids must be an array of stage ids' });
    }
    let stagesJson = null;                                  // null → keep the stored list
    if (trigger_stage_ids !== undefined) {
      const wanted = positiveInts(trigger_stage_ids);
      let ids = [];
      if (wanted.length) {
        const { rows } = await pool.query(
          'SELECT id FROM pipeline_stages WHERE workspace_id=$1 AND id = ANY($2::int[])', [req.workspaceId, wanted]
        );
        ids = rows.map(r => Number(r.id));
      }
      stagesJson = JSON.stringify(ids);
    }

    const result = await pool.query(
      `UPDATE workspace_engine
       SET engine_url=$1, active=$2, trigger_stage_ids=COALESCE($3::jsonb, trigger_stage_ids), updated_at=NOW()
       WHERE workspace_id=$4 RETURNING *`,
      [url, isActive, stagesJson, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Open the Integrations page first' });
    res.json({ success: true, engine: view(result.rows[0], true) });
  } catch (err) { next(err); }
});

router.post('/settings/regenerate-secret', requireManage, async (req, res, next) => {
  try {
    const secret = newSecret();
    const result = await pool.query(
      'UPDATE workspace_engine SET webhook_secret=$1, updated_at=NOW() WHERE workspace_id=$2', [secret, req.workspaceId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Open the Integrations page first' });
    res.json({ webhook_secret: secret });
  } catch (err) { next(err); }
});

router.get('/deliveries', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.event, d.event_id, d.status, d.attempts, d.last_status_code, d.last_error,
              d.deal_id, d.contact_id, d.payload, d.created_at, d.delivered_at, d.next_attempt_at, d.last_attempt_at,
              dl.title AS deal_title, c.name AS contact_name
       FROM engine_deliveries d
       LEFT JOIN deals    dl ON dl.id = d.deal_id    AND dl.workspace_id = d.workspace_id
       LEFT JOIN contacts c  ON c.id  = d.contact_id AND c.workspace_id  = d.workspace_id
       WHERE d.workspace_id=$1
       ORDER BY d.created_at DESC LIMIT 50`,
      [req.workspaceId]
    );
    res.json({ deliveries: rows });
  } catch (err) { next(err); }
});

// Boot-time check for the sidebar: is the integration switched on, and may this
// user open the Onboarding monitor? Never creates the settings row (unlike
// GET /settings), so it is safe to call on every login.
router.get('/status', async (req, res, next) => {
  try {
    const row = await loadRow(req.workspaceId);
    res.json({ active: !!(row && row.active && row.engine_url), can_manage: canManage(req.userRole) });
  } catch (err) { next(err); }
});

// Onboarding monitor (owners and admins): every deal of the workspace with its
// customer's Engine status, whether the deal sits in a trigger stage, the trigger
// stage the "Start onboarding" button would move it to (the first trigger stage
// of the deal's own pipeline by position, or null when none is configured), and
// the latest `vertrag.unterschrieben` delivery for the deal. Read-only: the
// button itself goes through PATCH /api/deals/:id/stage, the existing trigger path.
router.get('/onboarding', requireManage, async (req, res, next) => {
  try {
    const wid = req.workspaceId;
    const row = await loadRow(wid);
    const triggerIds = positiveInts(row?.trigger_stage_ids);

    const firstTriggerByPipeline = new Map();   // pipeline_id → { id, name } of its first trigger stage
    if (triggerIds.length) {
      const { rows: stages } = await pool.query(
        `SELECT id, pipeline_id, name FROM pipeline_stages WHERE workspace_id=$1 AND id = ANY($2::int[]) ORDER BY pipeline_id, position, id`,
        [wid, triggerIds]
      );
      for (const s of stages) if (!firstTriggerByPipeline.has(Number(s.pipeline_id))) firstTriggerByPipeline.set(Number(s.pipeline_id), { id: Number(s.id), name: s.name });
    }

    const { rows } = await pool.query(
      `SELECT d.id AS deal_id, d.title AS deal_title, d.value AS deal_value, d.created_at AS deal_created_at,
              d.pipeline_id, p.name AS pipeline_name,
              d.stage_id, ps.name AS stage_name, ps.color AS stage_color,
              c.id AS contact_id, c.name AS contact_name, c.company AS contact_company,
              c.onboarding_status, c.drive_ordner_id, c.akte_version, c.updated_at AS status_since,
              ed.id AS delivery_id, ed.status AS delivery_status, ed.attempts AS delivery_attempts,
              ed.last_status_code AS delivery_status_code, ed.last_error AS delivery_error,
              ed.created_at AS delivery_created_at, ed.delivered_at AS delivery_delivered_at
       FROM deals d
       JOIN pipelines p ON p.id = d.pipeline_id AND p.workspace_id = d.workspace_id
       LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id AND ps.workspace_id = d.workspace_id
       LEFT JOIN contacts c ON c.id = d.contact_id AND c.workspace_id = d.workspace_id
       LEFT JOIN LATERAL (
         SELECT e.id, e.status, e.attempts, e.last_status_code, e.last_error, e.created_at, e.delivered_at
         FROM engine_deliveries e
         WHERE e.deal_id = d.id AND e.workspace_id = d.workspace_id AND e.event = 'vertrag.unterschrieben'
         ORDER BY e.created_at DESC LIMIT 1
       ) ed ON true
       WHERE d.workspace_id = $1
       ORDER BY c.updated_at DESC NULLS LAST, d.created_at DESC`,
      [wid]
    );

    const out = rows.map(r => ({
      deal_id:           Number(r.deal_id),
      deal_title:        r.deal_title,
      deal_value:        r.deal_value,
      deal_created_at:   r.deal_created_at,
      pipeline_id:       Number(r.pipeline_id),
      pipeline_name:     r.pipeline_name,
      stage_id:          r.stage_id == null ? null : Number(r.stage_id),
      stage_name:        r.stage_name,
      stage_color:       r.stage_color,
      contact_id:        r.contact_id == null ? null : Number(r.contact_id),
      contact_name:      r.contact_name,
      contact_company:   r.contact_company,
      onboarding_status: r.contact_id == null ? null : (r.onboarding_status || 'kein_onboarding'),
      drive_ordner_id:   r.drive_ordner_id || null,
      akte_version:      r.contact_id == null ? null : Number(r.akte_version) || 0,
      status_since:      r.status_since,
      in_trigger:        r.stage_id != null && triggerIds.includes(Number(r.stage_id)),
      trigger_stage_id:   firstTriggerByPipeline.get(Number(r.pipeline_id))?.id   ?? null,
      trigger_stage_name: firstTriggerByPipeline.get(Number(r.pipeline_id))?.name ?? null,
      delivery: r.delivery_id == null ? null : {
        id: Number(r.delivery_id), status: r.delivery_status, attempts: Number(r.delivery_attempts) || 0,
        last_status_code: r.delivery_status_code, last_error: r.delivery_error,
        created_at: r.delivery_created_at, delivered_at: r.delivery_delivered_at,
      },
    }));

    res.json({ active: !!(row && row.active && row.engine_url), trigger_stage_ids: triggerIds, rows: out });
  } catch (err) { next(err); }
});

// GET /api/engine/openapi.json — the Engine API's OpenAPI document for download from
// the API keys card (every member may read it; it holds no secrets). The Engine
// itself fetches the same file at GET /api/kunden/openapi.json with its key.
const OPENAPI_FILE = path.join(__dirname, '..', 'docs', 'openapi.json');
router.get('/openapi.json', (req, res) => {
  res.set('Content-Disposition', 'attachment; filename="upgrads-crm-engine-api.openapi.json"');
  res.type('application/json').sendFile(OPENAPI_FILE);
});

// ── API keys for the Engine's calls to /api/kunden (middleware/engine-auth.js) ──
// The plain key exists exactly once: in the 201 answer of POST. Only its SHA-256
// hash is stored (api_keys.key_hash, UNIQUE); key_prefix is for telling keys apart
// in the list. Revoking sets revoked_at — the lookup excludes those rows at once.
const KEY_COLS       = 'id, name, key_prefix, created_at, last_used_at, expires_at, revoked_at';
const KEY_PREFIX_LEN = 12;                       // "upg_live_" + 3 hex chars
const newApiKey      = () => 'upg_live_' + crypto.randomBytes(16).toString('hex');

router.get('/api-keys', requireManage, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${KEY_COLS} FROM api_keys WHERE workspace_id=$1 ORDER BY created_at DESC, id DESC`, [req.workspaceId]);
    res.json({ api_keys: rows });
  } catch (err) { next(err); }
});

router.post('/api-keys', requireManage, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
    if (!name) return res.status(400).json({ error: 'Give the key a name' });
    const key = newApiKey();
    const { rows: [row] } = await pool.query(
      `INSERT INTO api_keys (workspace_id, name, key_prefix, key_hash, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING ${KEY_COLS}`,
      [req.workspaceId, name, key.slice(0, KEY_PREFIX_LEN), hashKey(key), req.userId]
    );
    res.status(201).json({ ...row, key });     // the plain key, shown once
  } catch (err) { next(err); }
});

router.delete('/api-keys/:id', requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid key id' });
    const { rowCount } = await pool.query(
      'UPDATE api_keys SET revoked_at=NOW() WHERE id=$1 AND workspace_id=$2 AND revoked_at IS NULL', [id, req.workspaceId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/test-event', requireManage, async (req, res, next) => {
  try {
    const row = await loadRow(req.workspaceId);
    if (!row || !row.engine_url) return res.status(400).json({ error: 'Set the Engine URL first' });
    const d = await engine.sendTestEvent(req.workspaceId);
    res.json({ delivery: deliverySummary(d) });
  } catch (err) { next(err); }
});

function deliverySummary(d) {
  return { id: d.id, status: d.delivery_status, attempts: d.attempts, last_status_code: d.status, last_error: d.error, next_attempt_at: d.next_attempt_at ?? null };
}

// Manual retry of one delivery (Sent events → Retry). One counted attempt now; a
// transient failure re-enters the automatic schedule while attempts remain. A
// delivered row, a test ping handled elsewhere, or a contract event without a
// kunde_id (nothing to send) cannot be retried.
router.post('/deliveries/:id/retry', requireManage, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid delivery id' });
    const { rows: [d] } = await pool.query(
      'SELECT id, event, status, attempts, raw_body, payload FROM engine_deliveries WHERE id=$1 AND workspace_id=$2', [id, req.workspaceId]
    );
    if (!d) return res.status(404).json({ error: 'Not found' });
    if (d.status === 'success') return res.status(409).json({ error: 'This event was already delivered' });
    if (d.event === engine.EVENT_CONTRACT_SIGNED && (!d.payload || d.payload.kunde_id == null)) {
      return res.status(409).json({ error: 'This event has no contact (kunde_id) and cannot be sent. Link a contact and move the deal into the trigger stage again.' });
    }
    const row = await loadRow(req.workspaceId);
    if (!row || !row.engine_url) return res.status(400).json({ error: 'Set the Engine URL first' });
    const r = await engine.retryDelivery(d, row);
    res.json({ delivery: deliverySummary(r) });
  } catch (err) { next(err); }
});

module.exports = router;
