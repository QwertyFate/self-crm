// UNIT: email_accounts (EMAIL_SYNC_CHANGES Part 1, 2026-10-22; on hold since 2026-10-27, so initDb() does NOT create it): one mailbox per person per
// workspace (UNIQUE workspace_id + user_id), the refresh token only ever sealed, no column for mail itself,
// guarded with IF NOT EXISTS and created after the Notetaker table it follows.
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

describe('email_accounts', () => {
  // On hold (2026-10-27): the table must not reach any database, production included, until email sync is built.
  test('initDb() does not create it, nor touch it in any other way', () => {
    assert.deepEqual(sqls.filter(s => /email_accounts/.test(s)), []);
  });
  test('the definition stays in db.js, commented out, after the Notetaker table: one row per person per workspace, the token sealed', () => {
    const src = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
    const open = src.indexOf('  /*\n  // Email (routes/mailbox.js'), close = src.indexOf('  */\n', open);
    assert.ok(open > 0 && close > open, 'a /* */ block');
    assert.ok(open > src.indexOf('CREATE TABLE IF NOT EXISTS notetaker_recordings'));
    const s = src.slice(open, close).replace(/\s+/g, ' ');
    assert.match(s, /CREATE TABLE IF NOT EXISTS email_accounts \(/);
    for (const col of ['id SERIAL PRIMARY KEY', 'workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE', 'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE',
      'provider TEXT NOT NULL', 'email_address TEXT NOT NULL', 'refresh_token_sealed TEXT NOT NULL', 'scopes TEXT', 'connected_at TIMESTAMPTZ DEFAULT NOW()', 'updated_at TIMESTAMPTZ DEFAULT NOW()', 'last_error TEXT', 'UNIQUE (workspace_id, user_id)']) {
      assert.ok(s.includes(col), col);
    }
    assert.doesNotMatch(s, /refresh_token TEXT|access_token|password/, 'never a plain secret column');
    assert.doesNotMatch(s, /subject|body|snippet/, 'the connection only, no mail');
  });
});
