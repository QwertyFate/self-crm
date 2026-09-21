/**
 * In-memory models of tables that several tests need, expressed as fake-pool
 * rules. Each factory returns fresh state, so call it per file (or per test).
 */
const crypto = require('crypto');

/**
 * idempotency_keys — keyed by "workspace:key", with the UNIQUE constraint
 * (a second INSERT throws 23505) and the four statements utils/idempotency.js
 * issues. `table` is exposed so a test can seed an in-flight or expired row.
 */
function idempotencyTable() {
  const table = new Map();
  const key = (wid, k) => `${wid}:${k}`;
  const rules = [
    { match: /^SELECT request_hash, response_status, response_body, expires_at FROM idempotency_keys/,
      reply: p => ({ rows: table.has(key(p[0], p[1])) ? [table.get(key(p[0], p[1]))] : [] }) },
    { match: /^INSERT INTO idempotency_keys/,
      reply: p => {
        if (table.has(key(p[0], p[1]))) { const e = new Error('duplicate key'); e.code = '23505'; throw e; }
        table.set(key(p[0], p[1]), { request_hash: p[2], response_status: null, response_body: null, expires_at: new Date(Date.now() + 86_400_000) });
        return { rows: [], rowCount: 1 };
      } },
    { match: /^UPDATE idempotency_keys SET response_status/,
      reply: p => { const r = table.get(key(p[0], p[1])); if (r) { r.response_status = p[2]; r.response_body = JSON.parse(p[3]); } return { rows: [], rowCount: r ? 1 : 0 }; } },
    { match: /^DELETE FROM idempotency_keys/,
      reply: p => ({ rows: [], rowCount: table.delete(key(p[0], p[1])) ? 1 : 0 }) },
  ];
  return { table, rules, key };
}

/**
 * api_keys — one valid key. The lookup rule answers only for the SHA-256 of
 * KEY (the middleware never binds the plain key); the usage-stamp UPDATE
 * succeeds. `row` is the object returned for a hit and may be mutated by a
 * test (e.g. `row.scopes = null`). Put your own rule BEFORE these to override
 * one of them (first match wins).
 */
function apiKeyRules(KEY, row = { id: 5, workspace_id: 7, scopes: [] }) {
  const hash = crypto.createHash('sha256').update(KEY).digest('hex');
  const rules = [
    { match: /FROM api_keys WHERE key_hash = \$1/, reply: p => ({ rows: p[0] === hash ? [row] : [] }) },
    { match: /^UPDATE api_keys SET last_used_at/,  reply: () => ({ rows: [], rowCount: 1 }) },
  ];
  return { hash, rules, row };
}

module.exports = { idempotencyTable, apiKeyRules };
