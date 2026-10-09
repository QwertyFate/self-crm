// UNIT test of initDb() — Onboarding Engine schema (briefing §5.3, §5.4, §8).
//
// db.js is evaluated with `pg` replaced by the recording fake pool, then
// initDb() is called. Every DDL statement it issues is captured and checked:
// the migration must be additive, complete, and must not remove anything that
// existed before. No database is involved.
//
// Env: DB_FILE — path to an alternative db.js (used for a baseline run).
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb, ROOT } = require('../helpers/load-db');

const STATUSES = ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];
const CONTACT_COLUMNS = ['onboarding_status', 'drive_ordner_id', 'akte_version', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'strasse', 'plz', 'ort'];
const NEW_TABLES = ['api_keys', 'idempotency_keys'];
// Every table the schema created before this step — the regression guard.
const PREVIOUS_TABLES = ['workspaces', 'users', 'invite_codes', 'stages', 'custom_fields', 'contacts', 'pipelines', 'pipeline_stages', 'deal_fields', 'deals', 'activities', 'password_resets', 'platform_invites', 'platform_settings', 'notifications', 'task_fields', 'objects', 'object_contacts', 'object_fields', 'deal_objects', 'tasks', 'task_projects', 'task_lists', 'task_project_statuses', 'task_attachments', 'workspace_webhook', 'webhook_logs', 'user_workspaces', 'chat_messages', 'chat_reads', 'activity_comments', 'workspace_engine', 'engine_deliveries'];

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
    // Case-sensitive on purpose: the base SCHEMA carries a prose comment ("drop them with a
    // migration") that is not a statement. Every real keyword in db.js is uppercase.
    const drops = sqls.filter(s => /\bDROP\b/.test(s));
    for (const s of drops) assert.match(s, /DROP CONSTRAINT IF EXISTS/, s);
  });
  test('every CREATE TABLE / CREATE INDEX / ADD COLUMN is guarded with IF NOT EXISTS', () => {
    for (const s of findAll(/CREATE TABLE/i))  assert.match(s, /CREATE TABLE IF NOT EXISTS/i, s.slice(0, 60));
    for (const s of findAll(/CREATE INDEX/i))  assert.match(s, /CREATE INDEX IF NOT EXISTS/i, s.slice(0, 60));
    for (const s of findAll(/ADD COLUMN/i))    assert.match(s, /ADD COLUMN IF NOT EXISTS/i, s.slice(0, 60));
  });
  test('every table that existed before is still created (nothing removed)', () => {
    const created = new Set(sqls.flatMap(s => [...s.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/gi)].map(m => m[1])));
    for (const t of PREVIOUS_TABLES) assert.ok(created.has(t), `table ${t} missing`);
  });
  test('the engine block runs before the first-run invite bootstrap', () => {
    const iLast  = sqls.findIndex(s => /CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires/.test(s));
    const iCount = sqls.findIndex(s => /COUNT\(\*\)::int AS n FROM workspaces/.test(s));
    assert.ok(iLast >= 0 && iCount > iLast, 'schema statements must precede the bootstrap query');
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
  test('the CHECK is added after every column exists (constraint validates on a populated table)', () => {
    const iAdd  = sqls.findIndex(s => /ADD CONSTRAINT contacts_onboarding_status_check/.test(s));
    const iCol  = sqls.findIndex(s => /ADD COLUMN IF NOT EXISTS onboarding_status /.test(s));
    assert.ok(iCol >= 0 && iAdd > iCol);
  });
  test('the status index exists', () => {
    assert.ok(find(/CREATE INDEX IF NOT EXISTS idx_contacts_onboarding_status ON contacts \(workspace_id, onboarding_status\)/));
  });
});

describe('engine_deliveries: retry worker additions (Part 11)', () => {
  test('last_attempt_at is added additively, after the table exists', () => {
    const iTable = sqls.findIndex(s => /CREATE TABLE IF NOT EXISTS engine_deliveries/.test(s));
    const iCol   = sqls.findIndex(s => /^ALTER TABLE engine_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ$/.test(s));
    assert.ok(iTable >= 0 && iCol > iTable);
  });
  test('the due index is partial over pending rows, keyed by next_attempt_at', () => {
    assert.ok(find(/^CREATE INDEX IF NOT EXISTS engine_deliveries_due_idx ON engine_deliveries \(next_attempt_at\) WHERE status = 'pending'$/));
  });
  test('the status CHECK still lists pending, success, failed — no new state was introduced', () => {
    const s = find(/CREATE TABLE IF NOT EXISTS engine_deliveries/);
    assert.match(s, /CHECK\(status IN \('pending','success','failed'\)\)/);
    assert.equal(find(/engine_deliveries_status_check/), undefined);
  });
});

describe('contact_documents (Part 15: contracts and recordings on a customer)', () => {
  test('created after contacts and deals, scoped to the workspace, cascading from the contact, keeping the file when the deal goes', () => {
    const s = find(/CREATE TABLE IF NOT EXISTS contact_documents/);
    assert.ok(s, 'table');
    assert.match(s, /workspace_id INTEGER NOT NULL REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(s, /contact_id INTEGER NOT NULL REFERENCES contacts\(id\) ON DELETE CASCADE/);
    assert.match(s, /deal_id INTEGER REFERENCES deals\(id\) ON DELETE SET NULL/);
    assert.match(s, /uploaded_by INTEGER REFERENCES users\(id\) ON DELETE SET NULL/);
    for (const c of ['file_name TEXT NOT NULL', 'file_size INTEGER NOT NULL', "file_type TEXT NOT NULL DEFAULT ''", 'storage_path TEXT NOT NULL', 'created_at TIMESTAMPTZ DEFAULT NOW()']) assert.ok(s.includes(c), c);
    assert.doesNotMatch(s, /file_url|public/, 'no public URL column: documents are reached through signed links only');
    const iDocs = sqls.findIndex(x => /CREATE TABLE IF NOT EXISTS contact_documents/.test(x));
    const iContacts = sqls.findIndex(x => /CREATE TABLE IF NOT EXISTS contacts \(/.test(x));
    const iDeals = sqls.findIndex(x => /CREATE TABLE IF NOT EXISTS deals \(/.test(x));
    assert.ok(iDocs > iContacts && iDocs > iDeals);
  });
  test('typ is one of the three briefing kinds, defaulting to sonstiges', () => {
    const s = find(/CREATE TABLE IF NOT EXISTS contact_documents/);
    assert.match(s, /typ TEXT NOT NULL DEFAULT 'sonstiges' CHECK\(typ IN \('vertrag','aufnahme','sonstiges'\)\)/);
  });
  test('the per-contact listing index exists', () => {
    assert.ok(find(/CREATE INDEX IF NOT EXISTS contact_documents_contact_idx ON contact_documents \(workspace_id, contact_id, created_at DESC\)/));
  });
});

describe('activities.source (Part 16: who wrote a note — a user or the Engine)', () => {
  test('added additively with default user; the CHECK is re-declared DROP-then-ADD and lists user, engine', () => {
    assert.ok(find(/^ALTER TABLE activities ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user'$/));
    const iDrop = sqls.findIndex(s => /DROP CONSTRAINT IF EXISTS activities_source_check/.test(s));
    const iAdd  = sqls.findIndex(s => /ADD CONSTRAINT activities_source_check CHECK\(source IN \('user','engine'\)\)/.test(s));
    assert.ok(iDrop >= 0 && iAdd === iDrop + 1);
    const iCol = sqls.findIndex(s => /ADD COLUMN IF NOT EXISTS source /.test(s));
    assert.ok(iCol < iDrop, 'column exists before the constraint');
  });
});

describe('the two engine API tables', () => {
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
    for (const c of ['scopes JSONB', 'last_used_at', 'expires_at', 'revoked_at', 'created_by INTEGER REFERENCES users(id) ON DELETE SET NULL']) assert.ok(s.includes(c), c);
  });
  test('idempotency_keys is unique per (workspace, key) and expires after 24 hours by default', () => {
    const s = find(/CREATE TABLE IF NOT EXISTS idempotency_keys/);
    assert.match(s, /UNIQUE \(workspace_id, key\)/);
    assert.match(s, /expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\) \+ INTERVAL '24 hours'/);
    assert.match(s, /request_hash TEXT NOT NULL/);
    assert.match(s, /response_status INTEGER/);
    assert.match(s, /response_body JSONB/);
  });
  test('the cleanup index on idempotency_keys.expires_at exists', () => {
    assert.ok(find(/idx_idempotency_keys_expires ON idempotency_keys \(expires_at\)/));
  });
});
