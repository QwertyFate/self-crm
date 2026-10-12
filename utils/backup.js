/* ═══════════════════════════════════════════════════════════════════════════
   BACKUP — one archive holding everything the local build needs: the embedded
   database, the uploaded files and the generated secrets. Embedded mode only
   (with DATABASE_URL set there is no PGlite to snapshot; use pg_dump there).

   THE ARCHIVE  crm-backup-<date>[-<time>].tar.gz, written by utils/tar.js:
     manifest.json     format, versions, counts, what is inside
     pgdata.tar.gz     PGlite's own dump of the data directory (already gzip,
                       stored as-is), restorable with PGlite's loadDataDir
     secrets.json      session secret + document-link key (the archive is
                       therefore sensitive: whoever holds it can mint sessions)
     files/…           every uploaded file under data/files
   Database first, files second: a document row in the dump always has its
   file (the routes write the file before the INSERT).

   A CONSISTENT SNAPSHOT WHILE RUNNING  dumpDataDir() neither checkpoints nor
   takes PGlite's query mutex, and query() and runExclusive() share one mutex
   that is not reentrant (a CHECKPOINT inside runExclusive would deadlock —
   verified in the 0.5.8 bundle). So: CHECKPOINT through the app's own pool
   (max 1 — it queues behind every route statement and can never cut into a
   wire exchange), THEN dumpDataDir inside runExclusive so no statement runs
   during the directory walk. The CLI, with the server stopped, is the only
   client and checkpoints through db.query. A statement between the two only
   adds WAL, which the dump carries and Postgres replays on first boot.

   WHERE  <repo>/backups by default (BACKUP_DIR overrides) — beside data/,
   not inside it, so the file scan never archives archives and wiping data/
   does not take the backups along. A backup beside its data does not
   survive a lost disk: the console says so; download, or point BACKUP_DIR at
   a synced folder.

   THE DAILY ARCHIVE  startScheduler(): 10 s after boot and every hour, write
   crm-backup-<today>.tar.gz if it is missing, then keep the newest
   BACKUP_KEEP (14). One file per local calendar day while the app runs; a day
   the machine was off has none. BACKUPS=0 switches the timer off (the
   console buttons still work). Every tick is caught and logged — a backup
   failure must never take the CRM down.

   RESTORE  restoreArchive(): with the server stopped. Validates the whole
   archive first, compares the inner PG_VERSION with the current one, moves
   pgdata / files / secrets.json aside as *.before-restore-<stamp> (never
   deletes), extracts, loads the inner tar into a fresh pgdata through PGlite
   and proves recovery with one query; anything failing after the move puts
   the aside copies back. scripts/restore.js is the command-line wrapper.
   ═══════════════════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Readable, pipeline: pipelineCb } = require('stream');
const { pipeline } = require('stream/promises');
const tar      = require('./tar');
const embedded = require('../embedded');
const pkg      = require('../package.json');

class BackupError extends Error {
  constructor(code, message) { super(message); this.name = 'BackupError'; this.code = code; }
}

const ARCHIVE_RE = /^crm-backup-\d{4}-\d{2}-\d{2}(-\d{6})?\.tar\.gz$/;
const STALE_PART_MS = 60 * 60 * 1000;

// ── Config (read at call time, like utils/open-signup.js) ────────────────────
const isEmbedded = () => !process.env.DATABASE_URL;
function backupDir() { return path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups')); }
function keepCount() { const n = parseInt(process.env.BACKUP_KEEP, 10); return Number.isInteger(n) && n > 0 ? n : 14; }
function schedulerEnabled() {
  const v = String(process.env.BACKUPS ?? '').trim().toLowerCase();
  return isEmbedded() && !['0', 'false', 'no', 'off'].includes(v);
}

const pad2 = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const localTime = d => `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
function dailyName(now = new Date())  { return `crm-backup-${localDate(now)}.tar.gz`; }
function manualName(now = new Date()) { return `crm-backup-${localDate(now)}-${localTime(now)}.tar.gz`; }

// ── Snapshot ─────────────────────────────────────────────────────────────────
let busy = false;
const isBusy = () => busy;

async function snapshotDb({ db, pool = null, log = console }) {
  if (!db) throw new BackupError('NOT_EMBEDDED', 'No embedded database is running to snapshot');
  let checkpoint = true;
  try { await (pool ? pool.query('CHECKPOINT') : db.query('CHECKPOINT')); }
  catch (e) { checkpoint = false; log.warn(`backup: CHECKPOINT skipped (${e.message}) — the dump still carries pg_wal`); }
  const file = await db.runExclusive(() => db.dumpDataDir('gzip'));
  return { file, checkpoint };
}

// Every regular file under filesDir: sorted, "/"-joined relative names, dotfiles skipped,
// anything under `exclude` skipped (the backup folder, should someone point it in here).
async function scanFiles(filesDir, { exclude = [] } = {}) {
  const root = path.resolve(filesDir), skip = exclude.map(p => path.resolve(p));
  const entries = []; let bytes = 0;
  async function walk(dir, rel) {
    let dirents;
    try { dirents = await fs.promises.readdir(dir, { withFileTypes: true }); }
    catch (e) { if (e.code === 'ENOENT') return; throw e; }
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const d of dirents) {
      if (d.name.startsWith('.')) continue;
      const abs = path.join(dir, d.name), r = rel ? `${rel}/${d.name}` : d.name;
      if (skip.some(s => abs === s || abs.startsWith(s + path.sep))) continue;
      if (d.isDirectory()) { await walk(abs, r); continue; }
      if (!d.isFile()) continue;
      let st;
      try { st = await fs.promises.stat(abs); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      entries.push({ rel: r, abs, size: st.size, mtimeMs: st.mtimeMs }); bytes += st.size;
    }
  }
  await walk(root, '');
  return { entries, bytes };
}

const COUNTS_SQL = `SELECT (SELECT COUNT(*)::int FROM workspaces) AS workspaces, (SELECT COUNT(*)::int FROM users) AS users,
  (SELECT COUNT(*)::int FROM contacts) AS contacts, (SELECT COUNT(*)::int FROM deals) AS deals, (SELECT COUNT(*)::int FROM tasks) AS tasks,
  (SELECT COUNT(*)::int FROM contact_documents) AS "contactDocuments", (SELECT COUNT(*)::int FROM task_attachments) AS "taskAttachments"`;
async function readCounts({ db, pool = null }) {
  try { const r = await (pool ? pool.query(COUNTS_SQL) : db.query(COUNTS_SQL)); return r.rows[0] || null; }
  catch { return null; }
}

function pgliteVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules', '@electric-sql', 'pglite', 'package.json'), 'utf8')).version; }
  catch { return null; }
}

function buildManifest({ now, dump, checkpoint, files, counts, dataDir, secrets }) {
  return {
    format: 'crm-backup', formatVersion: 1, createdAt: now.toISOString(),
    app: { name: pkg.name, version: pkg.version }, node: process.version, pglite: pgliteVersion(), platform: process.platform,
    dataDir,
    pgdata: { entry: 'pgdata.tar.gz', bytes: dump.length, checkpoint },
    secrets: !!secrets,
    files: { count: files.entries.length, bytes: files.bytes },
    counts,
  };
}

// Builds an archive. Resolves once the snapshot, the file scan and the manifest are done — so a
// caller can still answer an error as JSON — and hands back the gzip stream to pipe wherever it
// goes. One archive at a time (BUSY otherwise); the flag clears when the stream closes.
async function createArchive({ db, pool = null, dataDir = embedded.DATA_DIR, now = new Date(), log = console } = {}) {
  if (!isEmbedded()) throw new BackupError('NOT_EMBEDDED', 'Backups are available only with the embedded database (no DATABASE_URL). With a Postgres server, use pg_dump.');
  if (busy) throw new BackupError('BUSY', 'A backup is already being written. Try again in a moment.');
  busy = true;
  const release = () => { busy = false; };
  try {
    const filesDir = path.join(dataDir, 'files'), secretsFile = path.join(dataDir, 'secrets.json');
    const { file, checkpoint } = await snapshotDb({ db, pool, log });
    const dump = Buffer.from(await file.arrayBuffer());
    const files = await scanFiles(filesDir, { exclude: [backupDir()] });
    const secrets = fs.existsSync(secretsFile) ? fs.readFileSync(secretsFile) : null;
    const counts = await readCounts({ db, pool });
    const manifest = buildManifest({ now, dump, checkpoint, files, counts, dataDir, secrets });
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    const t = now.getTime();
    async function* entries() {
      yield { name: 'manifest.json', size: manifestBuf.length, body: manifestBuf, mtime: t };
      yield { name: 'pgdata.tar.gz', size: dump.length, body: dump, mtime: t };
      if (secrets) yield { name: 'secrets.json', size: secrets.length, body: secrets, mode: 0o600, mtime: t };
      for (const f of files.entries) yield { name: `files/${f.rel}`, size: f.size, body: fs.createReadStream(f.abs), mtime: f.mtimeMs };
    }
    const gz = zlib.createGzip();
    pipelineCb(Readable.from(tar.tarEntries(entries())), gz, () => {});   // a source error destroys gz, which the consumer's pipeline sees
    gz.once('close', release);
    return { stream: gz, manifest, name: manualName(now) };
  } catch (e) { release(); throw e; }
}

// Writes an archive to destPath via a .part file in the same folder, fsync, rename. Never
// overwrites; a failure leaves neither the .part nor a half-written final file.
async function writeArchiveFile(opts, destPath) {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(destPath)) throw new BackupError('EXISTS', `${destPath} already exists`);
  const tmp = `${destPath}.${process.pid}.part`;
  const archive = await createArchive(opts);
  try {
    await pipeline(archive.stream, fs.createWriteStream(tmp, { flags: 'wx' }));
    const fh = await fs.promises.open(tmp, 'r+');
    try { await fh.sync(); } finally { await fh.close(); }
    if (fs.existsSync(destPath)) throw new BackupError('EXISTS', `${destPath} already exists`);
    await fs.promises.rename(tmp, destPath);
    const st = await fs.promises.stat(destPath);
    return { path: destPath, size: st.size, manifest: archive.manifest };
  } catch (e) {
    archive.stream.destroy();
    await fs.promises.unlink(tmp).catch(() => {});
    throw e;
  }
}

// An archive into the backups folder, then prune. The default name has one-second resolution;
// a clash moves to the next second rather than overwriting.
async function saveBackup({ db, pool = null, name, now = new Date(), dir = backupDir(), keep = keepCount(), log = console } = {}) {
  let when = now, dest = path.join(dir, name || manualName(when));
  while (!name && fs.existsSync(dest)) { when = new Date(when.getTime() + 1000); dest = path.join(dir, manualName(when)); }
  const r = await writeArchiveFile({ db, pool, now: when, log }, dest);
  const pruned = await prune({ dir, keep });
  log.log(`backup: wrote ${dest} (${r.size} bytes${pruned.length ? `, pruned ${pruned.join(', ')}` : ''})`);
  return { name: path.basename(dest), size: r.size, createdAt: when.toISOString(), path: dest, manifest: r.manifest, pruned };
}

// The archives in the folder, newest first — only names this module writes.
async function listBackups(dir = backupDir()) {
  let names;
  try { names = await fs.promises.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const name of names.filter(n => ARCHIVE_RE.test(n))) {
    try { const st = await fs.promises.stat(path.join(dir, name)); out.push({ name, size: st.size, createdAt: st.mtime.toISOString() }); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.name.localeCompare(a.name)));
}

// Keep the newest `keep` archives; also remove .part leftovers older than an hour. Returns the
// names removed. Only ever called after a successful write, so it never deletes the last copy
// to make room for one that failed.
async function prune({ dir = backupDir(), keep = keepCount(), now = Date.now() } = {}) {
  const removed = [];
  const archives = await listBackups(dir);
  for (const a of archives.slice(keep)) { await fs.promises.unlink(path.join(dir, a.name)).catch(() => {}); removed.push(a.name); }
  let names = [];
  try { names = await fs.promises.readdir(dir); } catch { names = []; }
  for (const n of names.filter(n => n.endsWith('.part'))) {
    try { const st = await fs.promises.stat(path.join(dir, n)); if (now - st.mtimeMs > STALE_PART_MS) { await fs.promises.unlink(path.join(dir, n)); removed.push(n); } }
    catch { /* gone already */ }
  }
  return removed;
}

// ── The daily archive ────────────────────────────────────────────────────────
let sched = null;

function startScheduler({ getDb, pool = null, intervalMs = 60 * 60 * 1000, firstDelayMs = 10 * 1000, now = () => new Date(), log = console } = {}) {
  if (sched) return sched;
  const status = { running: false, lastRunAt: null, lastSaved: null, lastError: null };
  let running = false;
  async function tick() {
    if (running) return null;
    running = true; status.running = true;
    try {
      if (!schedulerEnabled()) return null;
      const today = now(), name = dailyName(today);
      if (fs.existsSync(path.join(backupDir(), name))) return null;
      const db = getDb();
      if (!db) return null;
      const r = await saveBackup({ db, pool, name, now: today, log });
      status.lastSaved = { name: r.name, size: r.size, createdAt: r.createdAt };
      status.lastError = null;
      return r;
    } catch (e) {
      status.lastError = { at: new Date().toISOString(), message: e.message };
      if (e.code === 'BUSY') log.log('backup scheduler: a backup is already running — next check in an hour');
      else log.error('backup scheduler:', e.message);
      return null;
    } finally {
      running = false; status.running = false; status.lastRunAt = new Date().toISOString();
    }
  }
  const first = setTimeout(tick, firstDelayMs); if (first.unref) first.unref();
  const timer = setInterval(tick, intervalMs);  if (timer.unref) timer.unref();
  sched = { tick, status, stop() { clearTimeout(first); clearInterval(timer); if (sched === this) sched = null; } };
  return sched;
}
function stopScheduler() { if (sched) sched.stop(); }
function schedulerStatus() {
  const base = { enabled: schedulerEnabled(), running: false, lastRunAt: null, lastSaved: null, lastError: null };
  return sched ? { ...base, ...sched.status, enabled: schedulerEnabled() } : base;
}

// ── Restore ──────────────────────────────────────────────────────────────────
async function readPgVersion(dump) {
  try {
    for await (const e of tar.readTar(Readable.from([dump]).pipe(zlib.createGunzip()), { allowLeadingSlash: true })) {
      if (e.name === 'PG_VERSION') return (await tar.collect(e.body)).toString('utf8').trim();
    }
  } catch { /* not readable: PGlite will say so on load */ }
  return null;
}

// The same lock the server holds (data/pgdata.lock): a live pid means the CRM is running.
function takeLock(dataDir) {
  const lockFile = path.join(dataDir, 'pgdata.lock');
  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch { existing = null; }
  const pid = existing && Number(existing.pid);
  if (pid && pid !== process.pid && embedded._isAlive(pid)) {
    throw new BackupError('SERVER_RUNNING', `The CRM is running (pid ${pid}). Stop it first — a restore replaces the database it has open.`);
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), restore: true }) + '\n');
  return () => { try { if (Number(JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid) === process.pid) fs.unlinkSync(lockFile); } catch { /* gone */ } };
}

async function restoreArchive(archivePath, { dataDir = embedded.DATA_DIR, force = false, log = console, now = new Date() } = {}) {
  const abs = path.resolve(archivePath);
  if (!fs.existsSync(abs)) throw new BackupError('NO_SUCH_FILE', `${abs} does not exist`);
  const releaseLock = takeLock(dataDir);
  try {
    // Pass 1 — validate everything before a single byte is written.
    let manifest = null, dump = null; const extracted = [];
    for await (const e of tar.readTar(fs.createReadStream(abs).pipe(zlib.createGunzip()))) {
      if (e.name === 'manifest.json') {
        try { manifest = JSON.parse((await tar.collect(e.body)).toString('utf8')); } catch { throw new BackupError('BAD_ARCHIVE', 'manifest.json is not valid JSON'); }
        if (manifest.format !== 'crm-backup') throw new BackupError('BAD_ARCHIVE', 'not a CRM backup (manifest.format)');
      } else if (e.name === 'pgdata.tar.gz') dump = await tar.collect(e.body);
      else if (e.name === 'secrets.json' || e.name.startsWith('files/')) extracted.push(e.name);
      else throw new BackupError('BAD_ARCHIVE', `unexpected entry in archive: ${e.name}`);
    }
    if (!manifest || !dump) throw new BackupError('BAD_ARCHIVE', 'archive is missing manifest.json or pgdata.tar.gz');
    const innerVersion = await readPgVersion(dump);
    const currentVersionFile = path.join(dataDir, 'pgdata', 'PG_VERSION');
    if (innerVersion && fs.existsSync(currentVersionFile)) {
      const current = fs.readFileSync(currentVersionFile, 'utf8').trim();
      if (current !== innerVersion && !force) {
        throw new BackupError('PG_VERSION_MISMATCH', `The archive holds a Postgres ${innerVersion} database, this installation runs ${current}. Pass --force to restore anyway (PGlite must be able to open it).`);
      }
    }

    // Move aside — never delete.
    const stamp = `${localDate(now)}-${localTime(now)}`;
    const movedAside = [];
    for (const name of ['pgdata', 'files', 'secrets.json']) {
      const p = path.join(dataDir, name);
      if (fs.existsSync(p)) { const to = `${p}.before-restore-${stamp}`; fs.renameSync(p, to); movedAside.push({ from: p, to }); }
    }
    try {
      // Pass 2 — files and secrets.
      const r = await tar.extractTar(fs.createReadStream(abs).pipe(zlib.createGunzip()), dataDir, { filter: e => e.name === 'secrets.json' || e.name.startsWith('files/') });
      const secretsFile = path.join(dataDir, 'secrets.json');
      if (fs.existsSync(secretsFile)) { try { fs.chmodSync(secretsFile, 0o600); } catch { /* best effort (Windows) */ } }
      fs.writeFileSync(path.join(dataDir, 'restored-from.json'), JSON.stringify({ archive: abs, restoredAt: now.toISOString(), manifest }, null, 2) + '\n');
      // The database: a fresh pgdata, PGlite extracts the inner tar into it and recovers.
      const pgdataDir = path.join(dataDir, 'pgdata');
      fs.mkdirSync(pgdataDir, { recursive: true });
      const PGlite = embedded.loadPGlite();
      const db = await PGlite.create({ dataDir: pgdataDir, loadDataDir: new File([dump], 'pgdata.tar.gz', { type: 'application/x-gzip' }) });
      let workspaces = null;
      try { const q = await db.query('SELECT COUNT(*)::int AS n FROM workspaces'); workspaces = q.rows[0]?.n ?? null; }
      finally { await db.close(); }
      log.log(`restore: ${abs} → ${dataDir} (${r.files} files, ${workspaces ?? '?'} workspaces)`);
      return { manifest, movedAside, files: r.files, bytes: r.bytes, workspaces, extracted };
    } catch (e) {
      for (const name of ['pgdata', 'files', 'secrets.json', 'restored-from.json']) fs.rmSync(path.join(dataDir, name), { recursive: true, force: true });
      const back = [];
      for (const m of movedAside) { try { fs.renameSync(m.to, m.from); back.push(m.from); } catch { /* report below */ } }
      e.message += back.length === movedAside.length
        ? ' — the previous data was put back.'
        : ` — put the previous data back by hand: ${movedAside.map(m => m.to).join(', ')}`;
      throw e;
    }
  } finally { releaseLock(); }
}

module.exports = {
  BackupError, ARCHIVE_RE, isEmbedded, backupDir, keepCount, schedulerEnabled, dailyName, manualName, isBusy,
  snapshotDb, scanFiles, readCounts, buildManifest, createArchive, writeArchiveFile, saveBackup, listBackups, prune,
  startScheduler, stopScheduler, schedulerStatus, restoreArchive,
};
