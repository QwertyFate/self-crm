/* ═══════════════════════════════════════════════════════════════════════════
   engineRequestLog — one row in engine_api_requests per call to the Engine API.

   Mounted in server.js on /api/kunden and /api/dokumente BEFORE the rate limiter,
   the gate and the routers, so a 429, a 503 and a 401 are logged like a 200.
   Records who (req.workspaceId / req.apiKeyId — set later by engineAuth, read at
   finish time), what (method + path without the query string), and how it went
   (status, the `fehler.code` of an error answer — peeked from res.json —, the
   duration). Never the body, never the key.

   It must never hurt the request: everything happens on `finish`, inside
   try/catch, and the INSERT is fire-and-forget. A logging failure is a console
   line, nothing more.
   ═══════════════════════════════════════════════════════════════════════════ */
const { pool } = require('../db');

const MAX_PATH = 300;

function engineRequestLog(req, res, next) {
  const started = process.hrtime.bigint();
  let fehlerCode = null;
  const origJson = res.json.bind(res);
  res.json = body => {
    try { if (body && body.fehler && typeof body.fehler.code === 'string') fehlerCode = body.fehler.code; } catch { /* never */ }
    return origJson(body);
  };
  res.on('finish', () => {
    try {
      const ms   = Number((process.hrtime.bigint() - started) / 1000000n);
      const path = String((req.baseUrl || '') + (req.path || '')).slice(0, MAX_PATH);
      pool.query(
        `INSERT INTO engine_api_requests (workspace_id, api_key_id, method, path, status, duration_ms, fehler_code, ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [req.workspaceId ?? null, req.apiKeyId ?? null, req.method, path, res.statusCode, ms, fehlerCode, req.ip || null]
      ).catch(e => console.error('engine request log:', e && e.message ? e.message : e));
    } catch (e) {
      console.error('engine request log:', e && e.message ? e.message : e);
    }
  });
  next();
}

// Rows older than `days` go; called by the admin monitor when it loads (cheap, rare).
async function pruneEngineRequestLog(days = 30) {
  const n = Number.isInteger(days) && days > 0 ? days : 30;
  const { rowCount } = await pool.query(`DELETE FROM engine_api_requests WHERE created_at < NOW() - make_interval(days => $1)`, [n]);
  return rowCount || 0;
}

module.exports = engineRequestLog;
module.exports.pruneEngineRequestLog = pruneEngineRequestLog;
module.exports.MAX_PATH = MAX_PATH;
