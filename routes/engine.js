// Upgrads Engine settings (Integrations page): Engine URL, on/off, the pipeline
// stages that mean "contract signed", the webhook secret, the delivery log and
// a test event. Reads are open to every member; writes need owner or admin.
const express     = require('express');
const router      = express.Router();
const crypto      = require('crypto');
const net         = require('net');
const { pool }    = require('../db');
const requireAuth = require('../middleware/auth');
const engine      = require('../utils/engine');

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
              d.deal_id, d.contact_id, d.payload, d.created_at, d.delivered_at, d.next_attempt_at,
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

router.post('/test-event', requireManage, async (req, res, next) => {
  try {
    const row = await loadRow(req.workspaceId);
    if (!row || !row.engine_url) return res.status(400).json({ error: 'Set the Engine URL first' });
    const d = await engine.sendTestEvent(req.workspaceId);
    res.json({ delivery: { id: d.id, status: d.ok ? 'success' : 'failed', attempts: d.attempts, last_status_code: d.status, last_error: d.error } });
  } catch (err) { next(err); }
});

module.exports = router;
