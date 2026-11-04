// UNIT: initDb() creates workspace_calcom (Cal.com integration, piece 2, 2026-10-13):
// one row per workspace (UNIQUE workspace_id), the key sealed, the receive token
// unique, both guarded with IF NOT EXISTS, placed with the other integration tables.
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb, ROOT } = require('../helpers/load-db');

let sqls;
before(async () => {
  const pool = createFakePool([{ match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) }]);
  const { initDb } = loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), pool);
  await initDb();
  sqls = pool.log.map(e => e.sql);
});

describe('workspace_calcom', () => {
  test('created once, guarded, one row per workspace, the token unique, the key column named for what it holds', () => {
    const hits = sqls.filter(s => /CREATE TABLE IF NOT EXISTS workspace_calcom \(/.test(s));
    assert.equal(hits.length, 1);
    const s = hits[0];
    assert.match(s, /workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(s, /api_key_sealed TEXT NOT NULL/); assert.doesNotMatch(s, /api_key TEXT/, 'never a plain key column');
    for (const col of ['cal_user_id INTEGER', 'cal_username TEXT', 'cal_email TEXT', 'cal_name TEXT', 'cal_timezone TEXT', "event_types JSONB NOT NULL DEFAULT '[]'", 'event_type_id INTEGER', 'receive_token TEXT NOT NULL UNIQUE', 'webhook_secret TEXT NOT NULL', 'webhook_id TEXT', 'connected_by INTEGER REFERENCES users(id) ON DELETE SET NULL', 'connected_at TIMESTAMPTZ DEFAULT NOW()', 'updated_at TIMESTAMPTZ DEFAULT NOW()', 'last_error TEXT']) assert.ok(s.includes(col), col);
  });
  test('it sits with the integration tables: after workspace_webhook, before user_workspaces', () => {
    const i = sqls.findIndex(s => /CREATE TABLE IF NOT EXISTS workspace_calcom/.test(s));
    const w = sqls.findIndex(s => /CREATE TABLE IF NOT EXISTS workspace_webhook/.test(s));
    const u = sqls.findIndex(s => /CREATE TABLE IF NOT EXISTS user_workspaces/.test(s));
    assert.ok(w < i && i < u, `${w} < ${i} < ${u}`);
  });
});
