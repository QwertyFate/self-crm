// UNIT test of initDb() — Onboarding Engine Stage 1 schema.
//
// db.js is evaluated with `pg` replaced by the recording fake pool, then
// initDb() is called. Every DDL statement it issues is captured and checked:
// the migration must be additive, complete, and must not remove anything that
// existed before. No database is involved.
//
// Env: DB_FILE — an alternative db.js. `npm run test:baseline` points it at
// tests/fixtures/db.pre-stage1.js (the schema before Stage 1), where the
// Stage 1 assertions must FAIL and the additive/regression guards still pass.
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb, ROOT } = require('../helpers/load-db');
const { ONBOARDING_STATUSES, CONTACT_ONBOARDING_COLUMNS, ENGINE_TABLES, PRE_STAGE1_TABLES, ENGINE_INDEXES } = require('../helpers/schema-constants');

let sqls;   // every statement initDb() ran, whitespace-normalised
before(async () => {
  const file = process.env.DB_FILE ? path.resolve(ROOT, process.env.DB_FILE) : path.join(ROOT, 'db.js');
  const pool = createFakePool([
    { match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) },   // not a first run: skip the invite-code print
  ]);
  const { initDb } = loadDb(fs.readFileSync(file, 'utf8'), pool);
  await initDb();
  sqls = pool.log.map(e => e.sql);
});

const find    = re => sqls.find(s => re.test(s));
const findAll = re => sqls.filter(s => re.test(s));
// Assert a statement exists, then return it — so a missing statement fails with a clear message, not a regex mismatch on ''.
const must = (re, what) => { const s = find(re); assert.ok(s, `${what} — no such statement`); return s; };

describe('the whole migration is additive', () => {
  test('no table or column is dropped, truncated or retyped', () => {
    const destructive = sqls.filter(s => /^(DROP TABLE|TRUNCATE)\b/i.test(s) || /^ALTER TABLE \w+ (DROP COLUMN|ALTER COLUMN \w+ TYPE)\b/i.test(s));
    assert.deepEqual(destructive, []);
  });
  test('the only DROPs are the CONSTRAINT IF EXISTS re-declarations', () => {
    for (const s of sqls.filter(s => /\bDROP\b/i.test(s))) assert.match(s, /DROP CONSTRAINT IF EXISTS/i, s.slice(0, 80));
  });
  test('every CREATE TABLE / CREATE INDEX / ADD COLUMN is guarded with IF NOT EXISTS', () => {
    for (const s of findAll(/CREATE TABLE/i))  assert.match(s, /CREATE TABLE IF NOT EXISTS/i, s.slice(0, 60));
    for (const s of findAll(/CREATE INDEX/i))  assert.match(s, /CREATE INDEX IF NOT EXISTS/i, s.slice(0, 60));
    for (const s of findAll(/ADD COLUMN/i))    assert.match(s, /ADD COLUMN IF NOT EXISTS/i, s.slice(0, 60));
  });
  test('every table that existed before Stage 1 is still created (nothing removed)', () => {
    const created = new Set(sqls.flatMap(s => [...s.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map(m => m[1])));
    for (const t of PRE_STAGE1_TABLES) assert.ok(created.has(t), `table ${t} missing`);
  });
});

describe('contacts: the eleven new columns', () => {
  test('each column is added with ADD COLUMN IF NOT EXISTS under its German name', () => {
    for (const col of CONTACT_ONBOARDING_COLUMNS) must(new RegExp(`^ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ${col} `), `column ${col}`);
  });
  test('onboarding_status is TEXT NOT NULL with the default kein_onboarding', () => {
    assert.match(must(/ADD COLUMN IF NOT EXISTS onboarding_status /, 'onboarding_status'), /onboarding_status TEXT NOT NULL DEFAULT 'kein_onboarding'/);
  });
  test('akte_version is an INTEGER counter starting at 0; plz is TEXT (leading zeros)', () => {
    assert.match(must(/ADD COLUMN IF NOT EXISTS akte_version /, 'akte_version'), /akte_version INTEGER NOT NULL DEFAULT 0/);
    assert.match(must(/ADD COLUMN IF NOT EXISTS plz /, 'plz'), /\bplz TEXT\b/);
  });
  test('the CHECK constraint lists exactly the seven statuses in order, and is re-declared safely', () => {
    const add = must(/ADD CONSTRAINT contacts_onboarding_status_check/, 'CHECK constraint');
    assert.deepEqual([...add.matchAll(/'([a-z_]+)'/g)].map(m => m[1]), ONBOARDING_STATUSES);
    const iDrop = sqls.findIndex(s => /DROP CONSTRAINT IF EXISTS contacts_onboarding_status_check/.test(s));
    const iAdd  = sqls.findIndex(s => /ADD CONSTRAINT contacts_onboarding_status_check/.test(s));
    assert.ok(iDrop >= 0, 'DROP CONSTRAINT IF EXISTS present');
    assert.ok(iDrop < iAdd, 'DROP IF EXISTS runs before ADD');
  });
  test('the status index exists', () => {
    must(/CREATE INDEX IF NOT EXISTS idx_contacts_onboarding_status ON contacts \(workspace_id, onboarding_status\)/, 'status index');
  });
});

describe('the four engine tables', () => {
  test('each is created and belongs to a workspace with ON DELETE CASCADE', () => {
    for (const t of ENGINE_TABLES) {
      const s = must(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\(`), `table ${t}`);
      assert.match(s, /workspace_id INTEGER NOT NULL REFERENCES workspaces\(id\) ON DELETE CASCADE/, t);
    }
  });
  test('api_keys stores a unique hash and a display prefix, never the plain key', () => {
    const s = must(/CREATE TABLE IF NOT EXISTS api_keys/, 'api_keys');
    assert.match(s, /key_hash TEXT NOT NULL UNIQUE/);
    assert.match(s, /key_prefix TEXT NOT NULL/);
    assert.doesNotMatch(s, /\bkey TEXT\b|plain/);
    for (const c of ['scopes JSONB', 'last_used_at', 'expires_at', 'revoked_at']) assert.ok(s.includes(c), c);
  });
  test('engine_webhook has url, signing secret, subscribed events and an active flag', () => {
    const s = must(/CREATE TABLE IF NOT EXISTS engine_webhook \(/, 'engine_webhook');
    for (const c of ['url TEXT NOT NULL', 'secret TEXT NOT NULL', "events JSONB NOT NULL DEFAULT '[]'", 'active BOOLEAN NOT NULL DEFAULT true']) assert.ok(s.includes(c), c);
  });
  test('engine_webhook_deliveries has the retry fields and a status CHECK', () => {
    const s = must(/CREATE TABLE IF NOT EXISTS engine_webhook_deliveries/, 'engine_webhook_deliveries');
    assert.match(s, /webhook_id INTEGER NOT NULL REFERENCES engine_webhook\(id\) ON DELETE CASCADE/);
    assert.match(s, /status TEXT NOT NULL DEFAULT 'pending' CHECK\(status IN \('pending','delivered','failed','dead'\)\)/);
    for (const c of ['attempts INTEGER NOT NULL DEFAULT 0', 'next_attempt_at', 'last_attempt_at', 'response_status', 'response_body', 'error TEXT', 'delivered_at']) assert.ok(s.includes(c), c);
  });
  test('idempotency_keys is unique per (workspace, key) and expires after 24 hours by default', () => {
    const s = must(/CREATE TABLE IF NOT EXISTS idempotency_keys/, 'idempotency_keys');
    assert.match(s, /UNIQUE \(workspace_id, key\)/);
    assert.match(s, /expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\) \+ INTERVAL '24 hours'/);
    assert.match(s, /request_hash TEXT NOT NULL/);
  });
  test('the retry, log and cleanup indexes exist', () => {
    for (const i of ENGINE_INDEXES.filter(i => i !== 'idx_contacts_onboarding_status')) must(new RegExp(`CREATE INDEX IF NOT EXISTS ${i} ON`), i);
  });
});

describe('workspaces: onboarding trigger stages (Part 42)', () => {
  test('the JSONB id list is added additively with an empty default', () => {
    must(/^ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_trigger_stage_ids JSONB NOT NULL DEFAULT '\[\]'/, 'onboarding_trigger_stage_ids');
  });
});

// A database first started from the old outgoingendpoints/apiEndpoints branches
// has an engine_webhook with an `api_key` column and no `events`; CREATE TABLE
// IF NOT EXISTS would keep it and every engine query would fail with 42703.
describe('engine_webhook legacy fix-up (old-branch table shape)', () => {
  const PROBE = /^SELECT 1 FROM information_schema\.columns WHERE table_schema = 'public' AND table_name = 'engine_webhook' AND column_name = 'api_key'/;

  test('the probe runs before the CREATE; on a normal database nothing is copied or dropped', () => {
    const iProbe  = sqls.findIndex(s => PROBE.test(s));
    const iCreate = sqls.findIndex(s => /^CREATE TABLE IF NOT EXISTS engine_webhook \(/.test(s));
    assert.ok(iProbe >= 0, 'probe present');
    assert.ok(iProbe < iCreate, 'probe before CREATE TABLE engine_webhook');
    assert.equal(sqls.some(s => /legacy|DROP TABLE/i.test(s)), false, 'no fix-up statements on a normal database');
  });

  test('old shape found -> copy to engine_webhook_legacy, drop deliveries and the old table, then create both anew, in that order', async () => {
    const file = process.env.DB_FILE ? path.resolve(ROOT, process.env.DB_FILE) : path.join(ROOT, 'db.js');
    const pool = createFakePool([
      { match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) },
      { match: PROBE,                   reply: () => ({ rows: [{ '?column?': 1 }] }) },   // the database has the old table
    ]);
    const { initDb } = loadDb(fs.readFileSync(file, 'utf8'), pool);
    await initDb();
    const log = pool.log.map(e => e.sql);
    const order = [
      /^CREATE TABLE IF NOT EXISTS engine_webhook_legacy AS SELECT \* FROM engine_webhook$/,
      /^DROP TABLE IF EXISTS engine_webhook_deliveries$/,
      /^DROP TABLE engine_webhook$/,
      /^CREATE TABLE IF NOT EXISTS engine_webhook \(/,
      /^CREATE TABLE IF NOT EXISTS engine_webhook_deliveries \(/,
    ].map(re => log.findIndex(s => re.test(s)));
    assert.ok(order.every(i => i >= 0), `every fix-up statement present (indexes ${order})`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'copy → drop deliveries → drop old → create → create deliveries');
    assert.deepEqual(log.filter(s => /^DROP TABLE/.test(s)), ['DROP TABLE IF EXISTS engine_webhook_deliveries', 'DROP TABLE engine_webhook'], 'nothing else is dropped');
    assert.equal(log.filter(s => /legacy/.test(s)).length, 1, 'the legacy copy is the only statement naming it');
  });
});
