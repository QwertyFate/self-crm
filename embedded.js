/* ═══════════════════════════════════════════════════════════════════════════
   EMBEDDED MODE — the CRM with no .env, no Postgres install, no Supabase.

   WHEN  DATABASE_URL is unset. Then everything the app needs lives under ONE
   folder, data/ (override: DATA_DIR), created on first boot:

     data/pgdata/        the database. Postgres itself, compiled to WebAssembly
                         (PGlite), running INSIDE this Node process and writing
                         ordinary Postgres data files here. Nothing to install.
     data/files/         uploaded files — task attachments and contact documents
                         (storage.js, local backend).
     data/secrets.json   generated once: the session-cookie secret and the key
                         that signs document download links. Deleting it logs
                         everyone out and voids open download links, nothing else.
     data/pgdata.lock    this process's pid while it runs — see ONE PROCESS.
   and, beside it, backups/ — daily archives of all of the above (utils/backup.js;
   BACKUP_DIR moves them). Outside data/ on purpose: wiping data/ must not take the
   backups along, and the backup never archives itself.

   HOW THE DATABASE IS REACHED  the routes keep using the `pg` pool from db.js,
   unchanged. start() boots PGlite, opens a tiny Postgres-wire-protocol server
   on 127.0.0.1 at a FREE port (pglite-socket), and tells the pool that port.
   So every query still travels through the real `pg` driver: the same type
   parsing (dates, bigints as strings, jsonb), the same error codes (23505),
   the same transactions as against hosted Postgres. db.js has the matching
   pool config; tests/unit/embedded-mode.test.js boots the whole thing for real.

   ONE CONNECTION  PGlite is a single-connection database and pglite-socket
   forwards wire messages one at a time, so two pg connections talking at once
   could interleave one statement's Parse/Bind with another's. db.js therefore
   caps the pool at max: 1 in this mode. The consequence for route code: while a
   transaction holds `client`, NOTHING may call pool.query — the pool would
   wait for its only client, forever. tests/unit/single-connection.test.js
   scans every file for that pattern.

   ONE PROCESS  two processes on one data/pgdata would corrupt it (PGlite does
   not lock the folder — measured 2026-10-09). The lock file refuses a second
   start while the recorded pid is alive; a stale lock from a crash is taken
   over. A graceful stop (SIGINT, SIGTERM, nodemon's SIGUSR2) closes the pool,
   the socket and PGlite, then removes the lock.

   NOT EMBEDDED  with DATABASE_URL set, start() is a no-op and the only thing
   this file still does is hand out a session secret when SESSION_SECRET is
   unset (generated and kept in data/secrets.json — better than a constant).
   ═══════════════════════════════════════════════════════════════════════════ */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const isEmbedded   = !process.env.DATABASE_URL;
const DATA_DIR     = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PGDATA_DIR   = path.join(DATA_DIR, 'pgdata');
const FILES_DIR    = path.join(DATA_DIR, 'files');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
const LOCK_FILE    = path.join(DATA_DIR, 'pgdata.lock');

// What server.js falls back to when the secrets file cannot be written (a read-only host
// without SESSION_SECRET) — the value the app used before embedded mode existed.
const LEGACY_SESSION_SECRET = 'change-me-in-production';

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

// ── Secrets ──────────────────────────────────────────────────────────────────
let cachedSecrets = null;

// { sessionSecret, fileKey } — read from data/secrets.json, generated on first use. A file
// missing one of the two keys keeps what it has and gains the other.
function secrets() {
  if (cachedSecrets) return cachedSecrets;
  let s = {};
  try { s = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')) || {}; } catch { s = {}; }
  const complete = typeof s.sessionSecret === 'string' && s.sessionSecret.length >= 32
                && typeof s.fileKey === 'string' && s.fileKey.length >= 32;
  if (!complete) {
    s = {
      sessionSecret: typeof s.sessionSecret === 'string' && s.sessionSecret.length >= 32 ? s.sessionSecret : crypto.randomBytes(32).toString('hex'),
      fileKey:       typeof s.fileKey === 'string' && s.fileKey.length >= 32 ? s.fileKey : crypto.randomBytes(32).toString('hex'),
      createdAt:     s.createdAt || new Date().toISOString(),
    };
    ensureDir(DATA_DIR);
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
  }
  cachedSecrets = s;
  return s;
}

// The session-cookie secret for server.js: SESSION_SECRET when set, else the generated one.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try { return secrets().sessionSecret; }
  catch (e) {
    console.warn(`Could not write ${SECRETS_FILE} (${e.message}); set SESSION_SECRET. Falling back to the built-in secret.`);
    return LEGACY_SESSION_SECRET;
  }
}

// The HMAC key behind signed document links (storage.js, local backend).
function fileKey() { return secrets().fileKey; }

// ── Lock file ────────────────────────────────────────────────────────────────
function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }   // exists, owned by someone else
}

function acquireLock() {
  ensureDir(DATA_DIR);
  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); } catch { existing = null; }
  const pid = existing && Number(existing.pid);
  if (pid && pid !== process.pid && isAlive(pid)) {
    throw new Error(
      `Another CRM process (pid ${pid}, started ${existing.startedAt || 'unknown'}) is already using ${PGDATA_DIR}. ` +
      `Stop it first — two processes on one embedded database would corrupt it. (lsof -i :${process.env.PORT || 4001} finds it.)`
    );
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
}

function releaseLock() {
  try {
    const existing = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    if (Number(existing.pid) === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch { /* not ours or already gone */ }
}

// ── PGlite + socket ──────────────────────────────────────────────────────────
let db = null, server = null, starting = null, stopping = null;

// The PGlite class, required on first use only (the WASM is several MB). Shared with
// utils/backup.js and scripts/restore.js so there is one place that names the package.
function loadPGlite() { return require('@electric-sql/pglite').PGlite; }

// The running PGlite instance (null before start() / after stop()). utils/backup.js snapshots
// through it; nothing else should bypass the pool.
function getDb() { return db; }

// Boots the embedded database and points `pool` at it. Resolves { port, dataDir } in embedded
// mode, null otherwise. Idempotent: a second call returns the same promise. Must run BEFORE the
// first query (server.js calls it ahead of initDb()).
function start(pool) {
  if (!isEmbedded) return Promise.resolve(null);
  if (starting) return starting;
  starting = (async () => {
    ensureDir(PGDATA_DIR);
    ensureDir(FILES_DIR);
    acquireLock();
    // Required lazily so that merely loading this file (tests, hosted mode) never pays for the WASM.
    const PGlite = loadPGlite();
    const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
    db = await PGlite.create({ dataDir: PGDATA_DIR });
    server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 4 });
    await server.start();
    const port = Number(server.getServerConn().split(':').pop());
    // pg-pool copies its config into pool.options and reads host/port from there each time it
    // opens a client (node_modules/pg-pool/index.js: `new this.Client(this.options)`). Nothing
    // has connected yet, so setting the real port here is all the pool needs.
    pool.options.host = '127.0.0.1';
    pool.options.port = port;
    installShutdown(pool);
    return { port, dataDir: PGDATA_DIR };
  })();
  return starting;
}

// Closes the pool, the socket server and PGlite, and releases the lock. Safe to call twice.
function stop(pool) {
  if (stopping) return stopping;
  stopping = (async () => {
    const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
    try { if (pool && !pool.ended) await withTimeout(pool.end(), 3000); } catch { /* already ending */ }
    try { if (server) await server.stop(); } catch { /* already stopped */ }
    try { if (db && !db.closed) await db.close(); } catch { /* already closed */ }
    server = null; db = null;
    releaseLock();
  })();
  return stopping;
}

let shutdownInstalled = false;
function installShutdown(pool) {
  if (shutdownInstalled) return;
  shutdownInstalled = true;
  // nodemon restarts by sending SIGUSR2 and waits for the process to exit; Ctrl+C is SIGINT;
  // launchd/Docker send SIGTERM. All three: flush and close the database, then leave.
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGUSR2']) {
    process.once(sig, () => {
      console.log(`${sig}: closing the embedded database…`);
      stop(pool).finally(() => process.exit(0));
    });
  }
  process.on('exit', releaseLock);
}

module.exports = {
  isEmbedded, DATA_DIR, PGDATA_DIR, FILES_DIR, SECRETS_FILE, LOCK_FILE, LEGACY_SESSION_SECRET,
  secrets, sessionSecret, fileKey, start, stop, getDb, loadPGlite,
  // the lock, for scripts/backup.js and scripts/restore.js (they must refuse while the app runs) and for tests
  _acquireLock: acquireLock, _releaseLock: releaseLock, _isAlive: isAlive,
};
