// INTEGRATION test of the Stage 1 migration on a REAL PostgreSQL database.
//
// Skips unless TEST_DATABASE_URL points at a throwaway database you are happy
// to have tables created in (never production). Example, local Homebrew PG:
//   createdb crm_stage1 && TEST_DATABASE_URL=postgres://localhost/crm_stage1 npm test && dropdb crm_stage1
//
// What it proves: a database built by the PREVIOUS db.js, holding real rows,
// survives the NEW initDb() with every row intact, gains the new columns with
// their defaults, and initDb() can be run again without error.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadDb, ROOT } = require('../helpers/load-db');

const URL = process.env.TEST_DATABASE_URL;
const skipOpts = URL ? {} : { skip: 'TEST_DATABASE_URL not set — point it at a throwaway database to run the real-Postgres migration test' };

describe('Stage 1 migration on a real database', skipOpts, () => {
  let pool, initDbNew;
  const STATUSES = ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];

  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: URL, ssl: false });
    // Start from a clean slate so the test is repeatable.
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

    // 1. Build the PREVIOUS schema (db.js as committed) and put real rows in it.
    const previous = execFileSync('git', ['show', 'HEAD:db.js'], { cwd: ROOT, encoding: 'utf8' });
    const { initDb: initDbOld } = loadDb(previous, pool);
    await initDbOld();
    await pool.query(`INSERT INTO workspaces (id, name) VALUES (7, 'W7')`);
    await pool.query(`INSERT INTO contacts (id, workspace_id, name, email, phone, company) VALUES (60, 7, 'Erika Muster', 'erika@example.de', '+49 30 1', 'Muster GmbH'), (61, 7, 'Max Beispiel', NULL, NULL, NULL)`);

    // 2. Run the NEW initDb() against that populated database.
    initDbNew = loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), pool).initDb;
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
    for (const c of ['onboarding_status', 'drive_ordner_id', 'akte_version', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'strasse', 'plz', 'ort']) assert.ok(cols.includes(c), c);
    const tables = (await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).rows.map(r => r.table_name);
    for (const t of ['api_keys', 'engine_webhook', 'engine_webhook_deliveries', 'idempotency_keys']) assert.ok(tables.includes(t), t);
    const cons = (await pool.query(`SELECT conname FROM pg_constraint WHERE conname='contacts_onboarding_status_check'`)).rows;
    assert.equal(cons.length, 1);
    const idx = (await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`)).rows.map(r => r.indexname);
    for (const i of ['idx_contacts_onboarding_status', 'idx_engine_webhook_deliveries_retry', 'idx_engine_webhook_deliveries_ws', 'idx_idempotency_keys_expires']) assert.ok(idx.includes(i), i);
  });

  test('the CHECK rejects an unknown status (23514) and accepts all seven', async () => {
    await assert.rejects(pool.query(`UPDATE contacts SET onboarding_status='bogus' WHERE id=60`), e => e.code === '23514');
    for (const s of STATUSES) await pool.query(`UPDATE contacts SET onboarding_status=$1 WHERE id=60`, [s]);
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

  test('a delivery row defaults to pending and refuses an unknown status', async () => {
    await pool.query(`INSERT INTO engine_webhook (id, workspace_id, url, secret) VALUES (1, 7, 'https://engine.test/hook', 's')`);
    await pool.query(`INSERT INTO engine_webhook_deliveries (webhook_id, workspace_id, event, payload) VALUES (1, 7, 'contact.updated', '{}')`);
    const { rows: [d] } = await pool.query('SELECT status, attempts FROM engine_webhook_deliveries');
    assert.deepEqual(d, { status: 'pending', attempts: 0 });
    await assert.rejects(pool.query(`UPDATE engine_webhook_deliveries SET status='lost'`), e => e.code === '23514');
  });
});
