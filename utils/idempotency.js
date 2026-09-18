/**
 * Request idempotency for engine write endpoints.
 *
 *   router.post('/x', engineAuth, (req, res, next) => runIdempotent(req, res, handler).catch(next));
 *
 * The caller sends an `Idempotency-Key` header. The first request with a key
 * reserves it, runs `handler`, and stores the status + body the handler sent.
 * A retry with the same key and the same payload gets the stored response back
 * (header `Idempotent-Replayed: true`) without running the handler again. The
 * same key with a different payload is a client error (422). A key whose first
 * request is still running is 409. Rows expire after 24 h (table default).
 *
 * `handler(req, res)` writes its response the normal way — res.status(..).json(..)
 * — those calls are captured. It may instead return { status, body }.
 * If the handler throws, the reservation is released so the client can retry.
 *
 * Must run after engineAuth: the key is scoped to req.workspaceId.
 */
const crypto   = require('crypto');
const { pool } = require('../db');

const MAX_KEY_LENGTH = 255;
const err = (code, nachricht) => ({ fehler: { code, nachricht } });
const IN_PROGRESS = err('anfrage_in_bearbeitung', 'Eine Anfrage mit diesem Idempotency-Key wird gerade verarbeitet.');

// Deterministic JSON: object keys sorted recursively, so {a,b} and {b,a} hash alike.
function stableJson(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
}

function requestHash(req) {
  const line = `${req.method} ${req.originalUrl || req.url} ${stableJson(req.body ?? null)}`;
  return crypto.createHash('sha256').update(line, 'utf8').digest('hex');
}

async function runIdempotent(req, res, fn) {
  if (!req.workspaceId) return res.status(401).json(err('nicht_authentifiziert', 'API-Schlüssel fehlt oder ist ungültig.'));

  const key = req.get('idempotency-key');
  if (typeof key !== 'string' || !key.trim()) {
    return res.status(400).json(err('idempotency_key_fehlt', 'Header Idempotency-Key ist erforderlich.'));
  }
  if (key.length > MAX_KEY_LENGTH) {
    return res.status(400).json(err('idempotency_key_ungueltig', `Idempotency-Key darf höchstens ${MAX_KEY_LENGTH} Zeichen lang sein.`));
  }

  const wid  = req.workspaceId;
  const hash = requestHash(req);

  // ---- 1. Is this key known?
  const { rows: [existing] } = await pool.query(
    'SELECT request_hash, response_status, response_body, expires_at FROM idempotency_keys WHERE workspace_id=$1 AND key=$2',
    [wid, key]
  );
  if (existing) {
    if (new Date(existing.expires_at) <= new Date()) {
      await pool.query('DELETE FROM idempotency_keys WHERE workspace_id=$1 AND key=$2', [wid, key]);   // stale: start over
    } else if (existing.request_hash !== hash) {
      return res.status(422).json(err('idempotency_key_konflikt', 'Idempotency-Key wurde bereits mit anderen Daten verwendet.'));
    } else if (existing.response_status == null) {
      return res.status(409).json(IN_PROGRESS);
    } else {
      res.set('Idempotent-Replayed', 'true');
      return res.status(existing.response_status).json(existing.response_body);
    }
  }

  // ---- 2. Reserve the key. UNIQUE (workspace_id, key) settles a race between twins.
  try {
    await pool.query('INSERT INTO idempotency_keys (workspace_id, key, request_hash) VALUES ($1,$2,$3)', [wid, key, hash]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json(IN_PROGRESS);
    throw e;
  }

  // ---- 3. Run the handler, capturing what it sends.
  const captured = { status: 200, body: null, sent: false };
  const origStatus = res.status.bind(res);
  const origJson   = res.json.bind(res);
  res.status = code => { captured.status = code; return origStatus(code); };
  res.json   = body => { captured.body = body; captured.sent = true; return origJson(body); };
  try {
    const ret = await fn(req, res);
    if (!captured.sent && ret && typeof ret === 'object' && 'status' in ret) res.status(ret.status).json(ret.body ?? null);
  } catch (e) {
    await pool.query('DELETE FROM idempotency_keys WHERE workspace_id=$1 AND key=$2', [wid, key]).catch(() => {});
    throw e;
  } finally {
    res.status = origStatus;
    res.json   = origJson;
  }

  // ---- 4. Persist the outcome (2xx and 4xx alike — a replay must answer the same).
  if (captured.sent) {
    await pool.query(
      'UPDATE idempotency_keys SET response_status=$3, response_body=$4 WHERE workspace_id=$1 AND key=$2',
      [wid, key, captured.status, JSON.stringify(captured.body ?? null)]
    ).catch(e => console.error('idempotency_keys update failed:', e.message));   // response is already out; never turn this into a 500
  } else {
    await pool.query('DELETE FROM idempotency_keys WHERE workspace_id=$1 AND key=$2', [wid, key]).catch(() => {});
  }
}

module.exports = { runIdempotent, requestHash, stableJson, MAX_KEY_LENGTH };
