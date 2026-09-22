// DATABASE test of the Stage 1 migration on a REAL PostgreSQL database.
//
// Runs only when ALL of these hold — otherwise it skips with the reason:
//   TEST_DATABASE_URL         points at a database (it will be WIPED: DROP SCHEMA public)
//   its host is localhost / 127.0.0.1   (never a remote/production database)
//   ALLOW_DESTRUCTIVE_DB_TEST=1         explicit opt-in
// Example, local Homebrew PostgreSQL:
//   createdb crm_stage1 && ALLOW_DESTRUCTIVE_DB_TEST=1 TEST_DATABASE_URL=postgres://localhost/crm_stage1 npm run test:db && dropdb crm_stage1
//
// What it proves: a database built by the PRE-STAGE-1 db.js (tests/fixtures/
// db.pre-stage1.js), holding real rows, survives the CURRENT initDb() with
// every row intact, gains the new columns with their defaults, and initDb()
// can be run again without error.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { loadDb, ROOT } = require('../helpers/load-db');
const { skipUnless } = require('../helpers/skip');
const { ONBOARDING_STATUSES, CONTACT_ONBOARDING_COLUMNS, ENGINE_TABLES, ENGINE_INDEXES } = require('../helpers/schema-constants');

const DB_URL = process.env.TEST_DATABASE_URL;
const host = (() => { try { return new URL(DB_URL).hostname; } catch { return null; } })();
const reason = !DB_URL ? 'TEST_DATABASE_URL not set — point it at a throwaway LOCAL database to run the real-Postgres migration test'
  : !['localhost', '127.0.0.1', '::1'].includes(host) ? `refused: TEST_DATABASE_URL host "${host}" is not local — this test drops the public schema`
  : process.env.ALLOW_DESTRUCTIVE_DB_TEST !== '1' ? 'refused: set ALLOW_DESTRUCTIVE_DB_TEST=1 to confirm the database may be wiped'
  : null;
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'db.pre-stage1.js');
// DB_FILE — an alternative current db.js (a baseline run points it at a copy without a fix-up).
const CURRENT = process.env.DB_FILE ? path.resolve(ROOT, process.env.DB_FILE) : path.join(ROOT, 'db.js');

describe('Stage 1 migration on a real database', skipUnless(!reason, reason), () => {
  let pool, initDbNew;

  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DB_URL, ssl: false });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    // 1. Build the PREVIOUS schema (before Stage 1) and put real rows in it.
    const previous = fs.readFileSync(FIXTURE, 'utf8');
    assert.doesNotMatch(previous, /onboarding_status/, 'the fixture really predates Stage 1');
    const { initDb: initDbOld } = loadDb(previous, pool);
    await initDbOld();
    const before = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='contacts'`)).rows.map(r => r.column_name);
    assert.equal(before.includes('onboarding_status'), false, 'previous schema has no onboarding_status');
    await pool.query(`INSERT INTO workspaces (id, name) VALUES (7, 'W7')`);
    await pool.query(`INSERT INTO contacts (id, workspace_id, name, email, phone, company) VALUES (60, 7, 'Erika Muster', 'erika@example.de', '+49 30 1', 'Muster GmbH'), (61, 7, 'Max Beispiel', NULL, NULL, NULL)`);

    // 2. Run the CURRENT initDb() against that populated database.
    initDbNew = loadDb(fs.readFileSync(CURRENT, 'utf8'), pool).initDb;
    await initDbNew();
  });
  after(async () => { if (pool) await pool.end(); });

  test('existing rows survive with every original value; new columns hold their defaults', async () => {
    const { rows } = await pool.query('SELECT id, name, email, phone, company, onboarding_status, akte_version, drive_ordner_id, rechtsform, plz, ort FROM contacts ORDER BY id');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { id: 60, name: 'Erika Muster', email: 'erika@example.de', phone: '+49 30 1', company: 'Muster GmbH', onboarding_status: 'kein_onboarding', akte_version: 0, drive_ordner_id: null, rechtsform: null, plz: null, ort: null });
    assert.equal(rows[1].onboarding_status, 'kein_onboarding');
  });

  test('initDb() is idempotent: a second run succeeds', async () => {
    await assert.doesNotReject(() => initDbNew());
  });

  test('the eleven contact columns, four tables, CHECK constraint and four indexes exist', async () => {
    const cols = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='contacts'`)).rows.map(r => r.column_name);
    for (const c of CONTACT_ONBOARDING_COLUMNS) assert.ok(cols.includes(c), c);
    const tables = (await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).rows.map(r => r.table_name);
    for (const t of ENGINE_TABLES) assert.ok(tables.includes(t), t);
    assert.equal((await pool.query(`SELECT conname FROM pg_constraint WHERE conname='contacts_onboarding_status_check'`)).rows.length, 1);
    const idx = (await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`)).rows.map(r => r.indexname);
    for (const i of ENGINE_INDEXES) assert.ok(idx.includes(i), i);
  });

  test('the CHECK rejects an unknown status (23514) and accepts all seven', async () => {
    await assert.rejects(pool.query(`UPDATE contacts SET onboarding_status='bogus' WHERE id=60`), e => e.code === '23514');
    for (const s of ONBOARDING_STATUSES) await pool.query(`UPDATE contacts SET onboarding_status=$1 WHERE id=60`, [s]);
    const { rows: [r] } = await pool.query('SELECT onboarding_status FROM contacts WHERE id=60');
    assert.equal(r.onboarding_status, 'onboarding_abgeschlossen');
  });

  test('uniqueness: api_keys.key_hash and idempotency_keys (workspace_id, key) reject duplicates (23505)', async () => {
    await pool.query(`INSERT INTO api_keys (workspace_id, name, key_prefix, key_hash) VALUES (7, 'engine', 'upg_abcd', 'h1')`);
    await assert.rejects(pool.query(`INSERT INTO api_keys (workspace_id, name, key_prefix, key_hash) VALUES (7, 'again', 'upg_abcd', 'h1')`), e => e.code === '23505');
    await pool.query(`INSERT INTO idempotency_keys (workspace_id, key, request_hash) VALUES (7, 'k1', 'r')`);
    await assert.rejects(pool.query(`INSERT INTO idempotency_keys (workspace_id, key, request_hash) VALUES (7, 'k1', 'r')`), e => e.code === '23505');
    const { rows: [row] } = await pool.query(`SELECT expires_at > NOW() + INTERVAL '23 hours' AS later FROM idempotency_keys WHERE key='k1'`);
    assert.equal(row.later, true);
  });

  test('contact_drive_files: one row per (contact, file); rows vanish with their contact', async () => {
    await pool.query(`INSERT INTO contact_drive_files (workspace_id, contact_id, file_id, name, mime_type) VALUES (7, 61, 'f1', 'Vertrag.pdf', 'application/pdf')`);
    await assert.rejects(pool.query(`INSERT INTO contact_drive_files (workspace_id, contact_id, file_id, name) VALUES (7, 61, 'f1', 'again')`), e => e.code === '23505');
    const cols = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='contacts'`)).rows.map(r => r.column_name);
    for (const c of ['drive_synced_at', 'drive_sync_error', 'drive_file_count']) assert.ok(cols.includes(c), c);
    await pool.query('DELETE FROM contacts WHERE id=61');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM contact_drive_files WHERE contact_id=61')).rows[0].n, 0, 'CASCADE');
  });

  test('a delivery row defaults to pending and refuses an unknown status', async () => {
    await pool.query(`INSERT INTO engine_webhook (id, workspace_id, url, secret) VALUES (1, 7, 'https://engine.test/hook', 's')`);
    await pool.query(`INSERT INTO engine_webhook_deliveries (webhook_id, workspace_id, event, payload) VALUES (1, 7, 'contact.updated', '{}')`);
    const { rows: [d] } = await pool.query('SELECT status, attempts FROM engine_webhook_deliveries');
    assert.deepEqual(d, { status: 'pending', attempts: 0 });
    await assert.rejects(pool.query(`UPDATE engine_webhook_deliveries SET status='lost'`), e => e.code === '23514');
  });
});

// The engine_webhook table as the old outgoingendpoints / apiEndpoints branches
// created it (git show outgoingendpoints:db.js, lines 371–386, verbatim). A
// database first started from one of those branches still has this table;
// CREATE TABLE IF NOT EXISTS in the current db.js would keep it and every
// engine query would fail with 42703 (column "events" does not exist).
const LEGACY_ENGINE_WEBHOOK = `
    CREATE TABLE IF NOT EXISTS engine_webhook (
      id           SERIAL PRIMARY KEY,
      workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      active       BOOLEAN NOT NULL DEFAULT false,
      event        TEXT NOT NULL DEFAULT 'vertrag.unterschrieben',
      target_url   TEXT,
      secret       TEXT,
      api_key      TEXT NOT NULL UNIQUE,
      pipeline_id  INTEGER REFERENCES pipelines(id) ON DELETE SET NULL,
      stage_ids    JSONB NOT NULL DEFAULT '[]',
      payload_map  JSONB NOT NULL DEFAULT '{"kunde_id":"contact.id","vertrag_id":"deal.id","produkt":"object.name"}',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    )`;
// The subscriber lookup from utils/engine-webhook.js emitEngineEvent — the statement that failed in production.
const SUBSCRIBER_QUERY = `SELECT id FROM engine_webhook
        WHERE workspace_id = $1 AND active = true
          AND (events = '[]'::jsonb OR events ? $2 OR events ? '*')`;

describe('legacy engine_webhook from the outgoingendpoints branch', skipUnless(!reason, reason), () => {
  let pool, initDbNew;
  const columns = async t => (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t])).rows.map(r => r.column_name);

  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DB_URL, ssl: false });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await loadDb(fs.readFileSync(FIXTURE, 'utf8'), pool).initDb();          // pre-Stage-1 schema …
    await pool.query(`INSERT INTO workspaces (id, name) VALUES (7, 'W7')`);
    await pool.query(LEGACY_ENGINE_WEBHOOK);                                   // … plus the old-branch table with a row
    await pool.query(`INSERT INTO engine_webhook (workspace_id, active, target_url, secret, api_key) VALUES (7, true, 'https://old.example/hook', 'old-secret', 'old-key')`);
    initDbNew = loadDb(fs.readFileSync(CURRENT, 'utf8'), pool).initDb;
    await initDbNew();                                                         // the current migration over that database
  });
  after(async () => { if (pool) await pool.end(); });

  test('engine_webhook now has the current shape and none of the old columns', async () => {
    const cols = await columns('engine_webhook');
    for (const c of ['url', 'secret', 'events', 'description', 'active', 'created_by']) assert.ok(cols.includes(c), c);
    for (const c of ['api_key', 'target_url', 'event', 'stage_ids', 'payload_map']) assert.equal(cols.includes(c), false, `old column ${c} gone`);
  });
  test('the old rows are kept in engine_webhook_legacy', async () => {
    const { rows } = await pool.query('SELECT workspace_id, api_key, target_url, event FROM engine_webhook_legacy');
    assert.deepEqual(rows, [{ workspace_id: 7, api_key: 'old-key', target_url: 'https://old.example/hook', event: 'vertrag.unterschrieben' }]);
  });
  test('engine_webhook_deliveries references the NEW table', async () => {
    const { rows } = await pool.query(`SELECT 1 FROM pg_constraint WHERE contype='f' AND conrelid='engine_webhook_deliveries'::regclass AND confrelid='engine_webhook'::regclass`);
    assert.equal(rows.length, 1);
  });
  test('the subscriber query that failed in production runs, and a delivery can be recorded', async () => {
    await pool.query(`INSERT INTO engine_webhook (id, workspace_id, url, secret, events) VALUES (1, 7, 'https://engine.test/hook', 's', '["*"]')`);
    const { rows } = await pool.query(SUBSCRIBER_QUERY, [7, 'test.ereignis']);
    assert.deepEqual(rows, [{ id: 1 }]);
    await pool.query(`INSERT INTO engine_webhook_deliveries (webhook_id, workspace_id, event, payload) VALUES (1, 7, 'test.ereignis', '{}')`);
  });
  test('a second initDb() succeeds and leaves the legacy copy and the new table alone', async () => {
    await assert.doesNotReject(() => initDbNew());
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM engine_webhook_legacy')).rows[0].n, 1);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM engine_webhook')).rows[0].n, 1, 'the webhook inserted above survives');
    assert.equal((await columns('engine_webhook')).includes('api_key'), false);
  });
});
