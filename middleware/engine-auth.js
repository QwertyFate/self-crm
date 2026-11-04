/**
 * Engine API authentication.
 *
 * The caller presents an API key (`Authorization: Bearer <key>`, or the
 * `X-API-Key` header). Only the SHA-256 hash of a key is stored (api_keys.key_hash),
 * so the lookup hashes the presented key and lets the database match digests —
 * no secret is compared in application code, and a leaked table cannot be used
 * to call the API. A key must not be revoked and must not be expired.
 *
 * On success: req.workspaceId, req.apiKeyId, req.apiScopes, req.apiAuth = true.
 * On failure: 401 with the engine's German error shape. One message for
 * "missing", "unknown", "revoked" and "expired" so nothing is enumerable.
 */
const crypto   = require('crypto');
const { pool } = require('../db');

const UNAUTHORIZED = { fehler: { code: 'nicht_authentifiziert', nachricht: 'API-Schlüssel fehlt oder ist ungültig.' } };

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');
}

function presentedKey(req) {
  const auth = req.get('authorization');
  if (typeof auth === 'string') {
    const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    if (m) return m[1];
  }
  const x = req.get('x-api-key');
  return typeof x === 'string' && x.trim() ? x.trim() : null;
}

function reject(res) {
  res.set('WWW-Authenticate', 'Bearer');
  return res.status(401).json(UNAUTHORIZED);
}

async function engineAuth(req, res, next) {
  try {
    const key = presentedKey(req);
    if (!key) return reject(res);

    const { rows: [row] } = await pool.query(
      `SELECT id, workspace_id, scopes
         FROM api_keys
        WHERE key_hash = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [hashKey(key)]
    );
    if (!row) return reject(res);

    req.workspaceId = row.workspace_id;
    req.apiKeyId    = row.id;
    req.apiScopes   = Array.isArray(row.scopes) ? row.scopes : [];
    req.apiAuth     = true;

    // Usage stamp: fire-and-forget, throttled to once a minute per key so a
    // busy integration does not turn every read into a write. Never blocks
    // or fails the request.
    pool.query(
      `UPDATE api_keys SET last_used_at = NOW()
        WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '1 minute')`,
      [row.id]
    ).catch(e => console.error('api_keys.last_used_at update failed:', e.message));

    next();
  } catch (e) {
    next(e);
  }
}

module.exports = engineAuth;
module.exports.hashKey = hashKey;
module.exports.UNAUTHORIZED = UNAUTHORIZED;
