// EMBEDDED MODE — the real thing, end to end, on an empty temp folder:
//   PGlite (Postgres in WebAssembly) + pglite-socket + the REAL `pg` Pool built from the
//   config db.js produces when DATABASE_URL is unset + the REAL initDb().
//
// WHY A LIVE BOOT. Everything else in tests/ runs against a fake pool, which is exactly
// what would hide a database that cannot run this schema. This file is the proof that
// `npm install && npm run dev` on a machine with no Postgres, no Supabase and no .env
// gets a working database: every CREATE TABLE / ALTER TABLE in initDb(), the first-run
// invite code, transactions through pool.connect(), connect-pg-simple's session table,
// and the same types and error codes the routes see from hosted Postgres — because the
// bytes still travel through the `pg` driver. Also: secrets.json, the lock file, a
// restart on the same folder (persistence + idempotent initDb), and a clean stop.
//
// It needs no network and no external process; it takes a few seconds (two WASM boots).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { ROOT }   = require('../helpers/load-route');
const { loadDb } = require('../helpers/load-db');

const TMP     = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-embedded-test-'));
const PGDATA  = path.join(TMP, 'pgdata');
const SECRETS = path.join(TMP, 'secrets.json');
const LOCK    = path.join(TMP, 'pgdata.lock');
process.env.DATA_DIR = TMP;
delete process.env.DATABASE_URL;
delete process.env.SESSION_SECRET;
process.env.OPEN_SIGNUP = 'false';   // the first-run invite box this file checks is printed only when codes are required (utils/open-signup.js)

const EMBEDDED_JS = path.join(ROOT, 'embedded.js');
function freshEmbedded() { delete require.cache[EMBEDDED_JS]; return require(EMBEDDED_JS); }

// db.js evaluated with the REAL pg Pool, its config captured.
function loadDbWithRealPg() {
  const { Pool } = require('pg');
  let config = null;
  const mod = loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), cfg => { config = cfg; return new Pool(cfg); });
  return { ...mod, config };
}

// initDb() prints the first-run invite box; capture it instead of spraying the test output.
async function quietly(fn) {
  const lines = []; const orig = console.log; console.log = (...a) => lines.push(a.join(' '));
  try { await fn(); } finally { console.log = orig; }
  return lines;
}

describe('embedded mode: a real boot on an empty folder', () => {
  let embedded, db, info;
  before(() => { embedded = freshEmbedded(); db = loadDbWithRealPg(); });
  after(async () => { try { await embedded.stop(db.pool); } catch {} fs.rmSync(TMP, { recursive: true, force: true }); });

  test('db.js builds a single-connection loopback pool when DATABASE_URL is unset', () => {
    assert.equal(embedded.isEmbedded, true);
    const { host, port, ssl, max, user, database } = db.config;
    assert.deepEqual({ host, port, ssl, max, user, database }, { host: '127.0.0.1', port: 0, ssl: false, max: 1, user: 'postgres', database: 'postgres' });
    assert.equal('connectionString' in db.config, false);
  });

  test('start() boots PGlite under data/pgdata, opens a free loopback port and hands it to the pool', async () => {
    info = await embedded.start(db.pool);
    assert.ok(Number.isInteger(info.port) && info.port > 0, `port ${info.port}`);
    assert.equal(info.dataDir, PGDATA);
    assert.equal(db.pool.options.port, info.port, 'pg-pool reads pool.options when it opens a client');
    assert.equal(db.pool.options.host, '127.0.0.1');
    assert.ok(fs.existsSync(path.join(PGDATA, 'PG_VERSION')), 'a real Postgres data directory');
    assert.equal(await embedded.start(db.pool), info, 'a second start() is the same boot');
  });

  test('the real initDb() runs the whole schema and prints the first-run platform invite code', async () => {
    const lines = await quietly(() => db.initDb());
    const { rows } = await db.pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    const names = rows.map(r => r.table_name);
    for (const t of ['workspaces', 'users', 'user_workspaces', 'platform_invites', 'contacts', 'deals', 'pipelines', 'pipeline_stages', 'tasks', 'task_attachments', 'contact_documents', 'chat_messages']) {
      assert.ok(names.includes(t), `table ${t}`);
    }
    assert.ok(names.length >= 30, `${names.length} tables`);
    const { rows: inv } = await db.pool.query('SELECT code, used FROM platform_invites');
    assert.equal(inv.length, 1);
    assert.match(inv[0].code, /^[0-9a-f]{32}$/);
    assert.ok(lines.some(l => l.includes(inv[0].code)), 'the code is printed so the first person can sign up');
  });

  test('values and errors arrive exactly as from hosted Postgres — the pg driver parses the wire', async () => {
    const { rows: [r] } = await db.pool.query(`SELECT COUNT(*) AS big, NOW() AS ts, '{"a":1}'::jsonb AS j, DATE '2026-10-09' AS d, 1::int AS i, 1.5::numeric AS num`);
    assert.equal(typeof r.big, 'string', 'int8 is a string (why the code casts ::int)');
    assert.ok(r.ts instanceof Date, 'timestamptz is a Date');
    assert.deepEqual(r.j, { a: 1 }, 'jsonb is parsed');
    assert.ok(r.d instanceof Date, 'date is a Date');
    assert.equal(typeof r.i, 'number'); assert.equal(typeof r.num, 'string');
    await db.pool.query(`INSERT INTO workspaces (name) VALUES ('Probe')`);
    await db.pool.query(`INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES (1, 'A', 'a@x', 'h', 'owner')`);
    await assert.rejects(
      db.pool.query(`INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES (1, 'A', 'a@x', 'h', 'owner')`),
      e => e.code === '23505' && e.constraint === 'users_workspace_id_email_key',
      'unique violations carry code 23505 — seven places in routes/ depend on it'
    );
  });

  test('a transaction through pool.connect() + seedDefaultPipeline, then parallel queries queue through the one connection', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await db.seedDefaultPipeline(1, client);
      await client.query(`INSERT INTO user_workspaces (user_id, workspace_id, role) SELECT id, 1, 'owner' FROM users WHERE workspace_id=1 ON CONFLICT DO NOTHING`);
      await client.query('COMMIT');
    } finally { client.release(); }
    const { rows: [{ n }] } = await db.pool.query('SELECT COUNT(*)::int AS n FROM pipeline_stages WHERE workspace_id=1');
    assert.equal(n, 6, 'the default pipeline');
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => db.pool.query('SELECT $1::int AS i', [i])));
    assert.deepEqual(results.map(r => r.rows[0].i), Array.from({ length: 12 }, (_, i) => i));
    const { rows: [adv] } = await db.pool.query(
      `SELECT COUNT(*) FILTER (WHERE position > 2)::int AS late, (SELECT COUNT(*)::int FROM generate_series(1,3)) AS gs,
              NOW() - INTERVAL '1 day' < NOW() AS past FROM pipeline_stages`
    );
    assert.deepEqual(adv, { late: 3, gs: 3, past: true });
  });

  test("connect-pg-simple's session table (server.js createTableIfMissing) is accepted", async () => {
    await db.pool.query(fs.readFileSync(path.join(ROOT, 'node_modules', 'connect-pg-simple', 'table.sql'), 'utf8'));
    const { rows } = await db.pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name='session'`);
    assert.equal(rows.length, 1);
  });

  test('secrets.json is generated once, mode 0600, reused on reload; SESSION_SECRET still wins when set', () => {
    const s = embedded.secrets();
    assert.match(s.sessionSecret, /^[0-9a-f]{64}$/); assert.match(s.fileKey, /^[0-9a-f]{64}$/);
    assert.ok(fs.existsSync(SECRETS));
    if (process.platform !== 'win32') assert.equal(fs.statSync(SECRETS).mode & 0o777, 0o600);
    assert.equal(freshEmbedded().secrets().sessionSecret, s.sessionSecret, 'a fresh module reads the same file');
    assert.equal(embedded.sessionSecret(), s.sessionSecret);
    assert.notEqual(embedded.sessionSecret(), embedded.LEGACY_SESSION_SECRET);
    process.env.SESSION_SECRET = 'from-env';
    try { assert.equal(embedded.sessionSecret(), 'from-env'); } finally { delete process.env.SESSION_SECRET; }
  });

  test('the lock file names this process; a second instance is refused while that pid is alive', async () => {
    assert.equal(JSON.parse(fs.readFileSync(LOCK, 'utf8')).pid, process.pid);
    // Pretend the running instance is another live process: the test runner's parent.
    fs.writeFileSync(LOCK, JSON.stringify({ pid: process.ppid, startedAt: 'earlier' }));
    try {
      await assert.rejects(freshEmbedded().start({ options: {} }), /Another CRM process \(pid \d+/);
      await db.pool.query('SELECT 1');   // and the first instance is untouched
    } finally {
      fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid }));
    }
  });

  test('restart on the same folder: a stale lock is taken over, data persisted, initDb idempotent, stop() releases the lock', async () => {
    await embedded.stop(db.pool);
    assert.equal(fs.existsSync(LOCK), false, 'stop() removes the lock');
    let dead = 99999; while (embedded._isAlive(dead)) dead--;
    fs.writeFileSync(LOCK, JSON.stringify({ pid: dead, startedAt: 'a crash ago' }));

    embedded = freshEmbedded(); db = loadDbWithRealPg();
    const info2 = await embedded.start(db.pool);
    assert.ok(info2.port > 0);
    const lines = await quietly(() => db.initDb());
    assert.equal(lines.some(l => /First-run platform invite code/.test(l)), false, 'no second invite: a workspace exists');
    const { rows: [c] } = await db.pool.query(
      'SELECT (SELECT COUNT(*)::int FROM workspaces) AS ws, (SELECT COUNT(*)::int FROM platform_invites) AS inv, (SELECT COUNT(*)::int FROM pipeline_stages) AS st'
    );
    assert.deepEqual(c, { ws: 1, inv: 1, st: 6 }, 'everything written before the restart is still there');
    await embedded.stop(db.pool);
    assert.equal(fs.existsSync(LOCK), false);
  });
});
