// UNIT test of initDb() — Onboarding Engine Stage 1 schema.
//
// db.js is evaluated with `pg` replaced by the recording fake pool, then
// initDb() is called. Every DDL statement it issues is captured and checked:
// the migration must be additive, complete, and must not remove anything that
// existed before. No database is involved.
//
// Env: DB_FILE — path to an alternative db.js (used for the baseline run).
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb, ROOT } = require('../helpers/load-db');

const STATUSES = ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];
const CONTACT_COLUMNS = ['onboarding_status', 'drive_ordner_id', 'akte_version', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'strasse', 'plz', 'ort'];
const NEW_TABLES = ['api_keys', 'engine_webhook', 'engine_webhook_deliveries', 'idempotency_keys'];
// Every table the schema created before Stage 1 — the regression guard.
const PREVIOUS_TABLES = ['workspaces', 'users', 'invite_codes', 'stages', 'custom_fields', 'contacts', 'pipelines', 'pipeline_stages', 'deal_fields', 'deals', 'activities', 'password_resets', 'platform_invites', 'platform_settings', 'notifications', 'task_fields', 'objects', 'object_contacts', 'object_fields', 'deal_objects', 'tasks', 'task_projects', 'task_lists', 'task_project_statuses', 'task_attachments', 'workspace_webhook', 'webhook_logs', 'user_workspaces', 'chat_messages', 'chat_reads', 'activity_comments'];

let sqls;   // every statement initDb() ran, whitespace-normalised
before(async () => {
  const file = process.env.DB_FILE || path.join(ROOT, 'db.js');
  const pool = createFakePool([
    { match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) },   // not a first run: skip the invite-code print
  ]);
  const { initDb } = loadDb(fs.readFileSync(file, 'utf8'), pool);
  await initDb();
  sqls = pool.log.map(e => e.sql);
});

const find    = re => sqls.find(s => re.test(s));
const findAll = re => sqls.filter(s => re.test(s));

describe('the whole migration is additive', () => {
  test('no destructive statement anywhere', () => {
    const destructive = sqls.filter(s => /\b(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|ALTER COLUMN \w+ TYPE)\b/i.test(s));
    assert.deepEqual(destructive, []);
  });
  test('the only DROPs are the CONSTRAINT IF EXISTS re-declarations', () => {
    const drops = sqls.filter(s => /\bDROP\b/i.test(s));
    for (const s of drops) assert.match(s, /DROP CONSTRAINT IF EXISTS/i, s);
  });
  test('every CREATE TABLE / CREATE INDEX / ADD COLUMN is guarded with IF NOT EXISTS', () => {
    for (const s of findAll(/CREATE TABLE/i))  assert.match(s, /CREATE TABLE IF NOT EXISTS/i, s.slice(0, 60));
    for (const s of findAll(/CREATE INDEX/i))  assert.match(s, /CREATE INDEX IF NOT EXISTS/i, s.slice(0, 60));
    for (const s of findAll(/ADD COLUMN/i))    assert.match(s, /ADD COLUMN IF NOT EXISTS/i, s.slice(0, 60));
  });
  test('every table that existed before Stage 1 is still created (nothing removed)', () => {
    const created = new Set(sqls.flatMap(s => [...s.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map(m => m[1])));
    for (const t of PREVIOUS_TABLES) assert.ok(created.has(t), `table ${t} missing`);
  });
});

describe('contacts: the eleven new columns', () => {
  test('each column is added with ADD COLUMN IF NOT EXISTS under its German name', () => {
    for (const col of CONTACT_COLUMNS) {
      assert.ok(find(new RegExp(`^ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ${col} `)), `column ${col}`);
    }
  });
  test('onboarding_status is TEXT NOT NULL with the default kein_onboarding', () => {
    assert.match(find(/ADD COLUMN IF NOT EXISTS onboarding_status /) || '', /onboarding_status TEXT NOT NULL DEFAULT 'kein_onboarding'/);
  });
  test('akte_version is an INTEGER counter starting at 0; plz is TEXT (leading zeros)', () => {
    assert.match(find(/ADD COLUMN IF NOT EXISTS akte_version /) || '', /akte_version INTEGER NOT NULL DEFAULT 0/);
    assert.match(find(/ADD COLUMN IF NOT EXISTS plz /) || '', /plz TEXT$/);
  });
  test('the CHECK constraint lists exactly the seven statuses in order, and is re-declared safely', () => {
    const add = find(/ADD CONSTRAINT contacts_onboarding_status_check/) || '';
    const listed = [...add.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    assert.deepEqual(listed, STATUSES);
    const iDrop = sqls.findIndex(s => /DROP CONSTRAINT IF EXISTS contacts_onboarding_status_check/.test(s));
    const iAdd  = sqls.findIndex(s => /ADD CONSTRAINT contacts_onboarding_status_check/.test(s));
    assert.ok(iDrop >= 0 && iAdd === iDrop + 1, 'DROP IF EXISTS immediately precedes ADD');
  });
  test('the status index exists', () => {
    assert.ok(find(/CREATE INDEX IF NOT EXISTS idx_contacts_onboarding_status ON contacts \(workspace_id, onboarding_status\)/));
  });
});

describe('the four engine tables', () => {
  test('each is created and belongs to a workspace with ON DELETE CASCADE', () => {
    for (const t of NEW_TABLES) {
      const s = find(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\(`));
      assert.ok(s, `table ${t}`);
      assert.match(s, /workspace_id INTEGER NOT NULL REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    }
  });
  test('api_keys stores a unique hash and a display prefix, never the plain key', () => {
    const s = find(/CREATE TABLE IF NOT EXISTS api_keys/);
    assert.match(s, /key_hash TEXT NOT NULL UNIQUE/);
    assert.match(s, /key_prefix TEXT NOT NULL/);
    assert.doesNotMatch(s, /\bkey TEXT\b|plain/);
    for (const c of ['scopes JSONB', 'last_used_at', 'expires_at', 'revoked_at']) assert.ok(s.includes(c), c);
  });
  test('engine_webhook has url, signing secret, subscribed events and an active flag', () => {
    const s = find(/CREATE TABLE IF NOT EXISTS engine_webhook \(/);
    for (const c of ['url TEXT NOT NULL', 'secret TEXT NOT NULL', "events JSONB NOT NULL DEFAULT '[]'", 'active BOOLEAN NOT NULL DEFAULT true']) assert.ok(s.includes(c), c);
  });
  test('engine_webhook_deliveries has the retry fields and a status CHECK', () => {
    const s = find(/CREATE TABLE IF NOT EXISTS engine_webhook_deliveries/);
    assert.match(s, /webhook_id INTEGER NOT NULL REFERENCES engine_webhook\(id\) ON DELETE CASCADE/);
    assert.match(s, /status TEXT NOT NULL DEFAULT 'pending' CHECK\(status IN \('pending','delivered','failed','dead'\)\)/);
    for (const c of ['attempts INTEGER NOT NULL DEFAULT 0', 'next_attempt_at', 'last_attempt_at', 'response_status', 'response_body', 'error TEXT', 'delivered_at']) assert.ok(s.includes(c), c);
  });
  test('idempotency_keys is unique per (workspace, key) and expires after 24 hours by default', () => {
    const s = find(/CREATE TABLE IF NOT EXISTS idempotency_keys/);
    assert.match(s, /UNIQUE \(workspace_id, key\)/);
    assert.match(s, /expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\) \+ INTERVAL '24 hours'/);
    assert.match(s, /request_hash TEXT NOT NULL/);
  });
  test('the retry, log and cleanup indexes exist', () => {
    assert.ok(find(/idx_engine_webhook_deliveries_retry ON engine_webhook_deliveries \(status, next_attempt_at\)/));
    assert.ok(find(/idx_engine_webhook_deliveries_ws ON engine_webhook_deliveries \(workspace_id, created_at DESC\)/));
    assert.ok(find(/idx_idempotency_keys_expires ON idempotency_keys \(expires_at\)/));
  });
});
