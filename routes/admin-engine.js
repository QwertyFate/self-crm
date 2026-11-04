/* ═══════════════════════════════════════════════════════════════════════════
   /api/admin/engine — the platform console's window onto the Upgrads Engine
   integration, across EVERY workspace (cross-tenant by design, like the rest of
   /api/admin). Gated by requireAdmin (middleware/admin-auth.js).

     GET   /engine/controls      the two switches (utils/engine-controls.js)
     PATCH /engine/controls      { api_enabled?, webhooks_enabled? }
     GET   /engine/summary       counts for the tiles (+ prunes the request log)
     GET   /engine/workspaces    every workspace with its Engine setup, for the filter
     GET   /engine/requests      the Engine's calls INTO the CRM (engine_api_requests)
     GET   /engine/deliveries    the CRM's webhooks OUT to the Engine (engine_deliveries)

   Read-only apart from the switches: retrying a delivery stays a workspace
   owner's action (Integrations → Sent events), and nothing here can read a
   request body or an API key.
   ═══════════════════════════════════════════════════════════════════════════ */
const express      = require('express');
const router       = express.Router();
const { pool }     = require('../db');
const requireAdmin = require('../middleware/admin-auth');
const controls     = require('../utils/engine-controls');
const { pruneEngineRequestLog } = require('../middleware/engine-request-log');

router.use('/engine', requireAdmin);

const DEFAULT_LIMIT = 200, MAX_LIMIT = 500;
const DELIVERY_STATUSES = ['pending', 'success', 'failed'];

// ?limit= → 1..500 (default 200) or null when invalid; ?workspace_id= → positive int or null
function parseLimit(v) {
  if (v === undefined) return DEFAULT_LIMIT;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LIMIT ? n : null;
}
function parseWorkspace(v) {
  if (v === undefined || v === '') return { id: null };
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? { id: n } : { error: 'workspace_id must be a positive integer' };
}

router.get('/engine/controls', async (req, res, next) => {
  try { res.json(await controls.readControls({ fresh: true })); } catch (e) { next(e); }
});

router.patch('/engine/controls', async (req, res, next) => {
  try {
    const problem = controls.validatePatch(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const next_ = await controls.writeControls(req.body);
    res.json({ success: true, ...next_ });
  } catch (e) { next(e); }
});

router.get('/engine/summary', async (req, res, next) => {
  try {
    let pruned = 0;
    try { pruned = await pruneEngineRequestLog(30); } catch (e) { console.error('engine request log prune:', e.message); }
    const { rows: [r] } = await pool.query(`
      SELECT COUNT(*)::int                                                           AS requests_24h,
             COUNT(*) FILTER (WHERE status >= 400 AND status < 500)::int               AS requests_24h_4xx,
             COUNT(*) FILTER (WHERE status >= 500)::int                                AS requests_24h_5xx,
             COUNT(DISTINCT workspace_id) FILTER (WHERE workspace_id IS NOT NULL)::int AS workspaces_24h,
             MAX(created_at)                                                           AS last_request_at,
             COALESCE(AVG(duration_ms) FILTER (WHERE status < 500), 0)::int            AS avg_ms_24h
        FROM engine_api_requests WHERE created_at >= NOW() - INTERVAL '24 hours'`);
    const { rows: [d] } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE status = 'pending')::int                                                     AS pending,
             COUNT(*) FILTER (WHERE status = 'failed'  AND created_at >= NOW() - INTERVAL '24 hours')::int       AS failed_24h,
             COUNT(*) FILTER (WHERE status = 'success' AND delivered_at >= NOW() - INTERVAL '24 hours')::int     AS delivered_24h,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int                              AS sent_24h,
             MAX(created_at)                                                                                      AS last_event_at
        FROM engine_deliveries`);
    const { rows: [w] } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE active AND engine_url IS NOT NULL)::int AS active_workspaces,
             (SELECT COUNT(*)::int FROM api_keys WHERE revoked_at IS NULL)  AS live_keys
        FROM workspace_engine`);
    res.json({ controls: await controls.readControls({ fresh: true }), requests: r, deliveries: d, setup: w, pruned });
  } catch (e) { next(e); }
});

router.get('/engine/workspaces', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.id, w.name,
             COALESCE(e.active, false) AS engine_active, (e.engine_url IS NOT NULL) AS engine_url_set,
             (SELECT COUNT(*)::int FROM api_keys k WHERE k.workspace_id = w.id AND k.revoked_at IS NULL) AS live_keys,
             (SELECT MAX(created_at) FROM engine_api_requests r WHERE r.workspace_id = w.id)              AS last_request_at,
             (SELECT MAX(created_at) FROM engine_deliveries d  WHERE d.workspace_id = w.id)              AS last_event_at
        FROM workspaces w
        LEFT JOIN workspace_engine e ON e.workspace_id = w.id
       ORDER BY w.name, w.id`);
    res.json({ workspaces: rows });
  } catch (e) { next(e); }
});

// ?workspace_id=&status=all|errors|ok&limit=
router.get('/engine/requests', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    if (limit === null) return res.status(400).json({ error: `limit must be 1..${MAX_LIMIT}` });
    const ws = parseWorkspace(req.query.workspace_id);
    if (ws.error) return res.status(400).json({ error: ws.error });
    const status = req.query.status === undefined ? 'all' : String(req.query.status);
    if (!['all', 'errors', 'ok'].includes(status)) return res.status(400).json({ error: 'status must be all, errors or ok' });
    const params = [];
    const where = [];
    if (ws.id)              { params.push(ws.id); where.push(`r.workspace_id = $${params.length}`); }
    if (status === 'errors') where.push('r.status >= 400');
    if (status === 'ok')     where.push('r.status < 400');
    params.push(limit);
    const { rows } = await pool.query(`
      SELECT r.id, r.workspace_id, w.name AS workspace_name, r.api_key_id, k.name AS key_name, k.key_prefix,
             r.method, r.path, r.status, r.duration_ms, r.fehler_code, r.ip, r.created_at
        FROM engine_api_requests r
        LEFT JOIN workspaces w ON w.id = r.workspace_id
        LEFT JOIN api_keys   k ON k.id = r.api_key_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $${params.length}`, params);
    res.json({ requests: rows });
  } catch (e) { next(e); }
});

// ?workspace_id=&status=all|pending|success|failed&limit=
router.get('/engine/deliveries', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    if (limit === null) return res.status(400).json({ error: `limit must be 1..${MAX_LIMIT}` });
    const ws = parseWorkspace(req.query.workspace_id);
    if (ws.error) return res.status(400).json({ error: ws.error });
    const status = req.query.status === undefined ? 'all' : String(req.query.status);
    if (status !== 'all' && !DELIVERY_STATUSES.includes(status)) return res.status(400).json({ error: `status must be all, ${DELIVERY_STATUSES.join(', ')}` });
    const params = [];
    const where = [];
    if (ws.id)           { params.push(ws.id);  where.push(`d.workspace_id = $${params.length}`); }
    if (status !== 'all') { params.push(status); where.push(`d.status = $${params.length}`); }
    params.push(limit);
    const { rows } = await pool.query(`
      SELECT d.id, d.workspace_id, w.name AS workspace_name, d.event, d.event_id, d.status, d.attempts,
             d.last_status_code, d.last_error, d.next_attempt_at, d.last_attempt_at, d.delivered_at, d.created_at,
             d.url, d.deal_id, dl.title AS deal_title, d.contact_id, c.name AS contact_name, d.payload
        FROM engine_deliveries d
        LEFT JOIN workspaces w  ON w.id  = d.workspace_id
        LEFT JOIN deals      dl ON dl.id = d.deal_id    AND dl.workspace_id = d.workspace_id
        LEFT JOIN contacts   c  ON c.id  = d.contact_id AND c.workspace_id  = d.workspace_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT $${params.length}`, params);
    res.json({ deliveries: rows });
  } catch (e) { next(e); }
});

module.exports = router;
