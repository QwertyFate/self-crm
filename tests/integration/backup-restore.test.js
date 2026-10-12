// INTEGRATION — the proof for the backup feature: a real embedded database (PGlite + the real
// `pg` pool from db.js + the real initDb) on temp folder A gets rows, a document file and
// secrets; a backup archive is written while 20 queries are in flight; the archive is restored
// into temp folder B; B is booted and holds the same rows, the same file bytes and the same
// secrets. Also: the daily scheduler on a real database, pruning, and the restore refusals.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const zlib = require('zlib');
const { ROOT }   = require('../helpers/load-route');
const { loadDb } = require('../helpers/load-db');

const A = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-bk-a-'));
const B = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-bk-b-'));
const BACKUPS = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-bk-out-'));
for (const k of ['DATABASE_URL', 'SESSION_SECRET', 'BACKUPS', 'BACKUP_KEEP']) delete process.env[k];
process.env.OPEN_SIGNUP = 'false';
process.env.BACKUP_DIR = BACKUPS;

function fresh(dataDir) {
  process.env.DATA_DIR = dataDir;
  for (const f of ['embedded.js', 'utils/backup.js', 'utils/tar.js']) delete require.cache[path.join(ROOT, f)];
  const embedded = require(path.join(ROOT, 'embedded.js'));
  const backup   = require(path.join(ROOT, 'utils', 'backup.js'));
  return { embedded, backup };
}
function loadDbWithRealPg() {
  const { Pool } = require('pg');
  return loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), cfg => new Pool(cfg));
}
async function quietly(fn) { const o = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = o; } }
const quiet = { log() {}, warn() {}, error() {} };
const tar = () => require(path.join(ROOT, 'utils', 'tar.js'));

const PDF = Buffer.from('%PDF-1.4\n% Vertrag Müller, integration test\n');
const DOC_REL = 'files/contact-documents/1/1/1760000000000-Vertrag_Mueller.pdf';
let a, dbA, saved, secretsA;

describe('A: a real database with data', () => {
  before(async () => { a = fresh(A); dbA = loadDbWithRealPg(); await a.embedded.start(dbA.pool); await quietly(() => dbA.initDb()); });
  test('rows, a document file and secrets exist', async () => {
    await dbA.pool.query(`INSERT INTO workspaces (name) VALUES ('Backup GmbH')`);
    await dbA.pool.query(`INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES (1, 'Ada', 'ada@bk.test', 'h', 'owner')`);
    await dbA.pool.query(`INSERT INTO contacts (workspace_id, name, email, company) VALUES (1, 'Max Mustermann', 'max@bk.test', 'Muster AG')`);
    fs.mkdirSync(path.join(A, path.dirname(DOC_REL)), { recursive: true });
    fs.writeFileSync(path.join(A, DOC_REL), PDF);
    a.embedded.secrets();                                                                  // what server.js does at load: creates data/secrets.json
    secretsA = fs.readFileSync(a.embedded.SECRETS_FILE, 'utf8');
    assert.match(JSON.parse(secretsA).fileKey, /^[0-9a-f]{64}$/);
  });
  test('the snapshot completes while 20 queries are in flight — no deadlock, no interleaving', async () => {
    const inflight = Array.from({ length: 20 }, (_, i) => dbA.pool.query('SELECT pg_sleep(0.005), $1::int AS i', [i]));
    const snap = a.backup.snapshotDb({ db: a.embedded.getDb(), pool: dbA.pool, log: quiet });
    const [results, s] = await Promise.all([Promise.all(inflight), snap]);
    assert.deepEqual(results.map(r => r.rows[0].i), Array.from({ length: 20 }, (_, i) => i));
    assert.equal(s.checkpoint, true); assert.ok(s.file.size > 1000); assert.equal(s.file.name, 'pgdata.tar.gz');
    // the dump is itself a gzip tar whose entries PGlite names with a leading slash
    const names = [];
    for await (const e of tar().readTar(require('stream').Readable.from([Buffer.from(await s.file.arrayBuffer())]).pipe(zlib.createGunzip()), { allowLeadingSlash: true })) names.push(e.name);
    assert.ok(names.includes('PG_VERSION'), names.slice(0, 5).join(','));
  });
  test('saveBackup writes a gzip archive with the four kinds of entries and real counts', async () => {
    saved = await a.backup.saveBackup({ db: a.embedded.getDb(), pool: dbA.pool, log: quiet });
    assert.match(saved.name, a.backup.ARCHIVE_RE);
    assert.deepEqual([...fs.readFileSync(saved.path).subarray(0, 2)], [0x1f, 0x8b]);
    const names = [];
    for await (const e of tar().readTar(fs.createReadStream(saved.path).pipe(zlib.createGunzip()))) names.push(e.name);
    assert.deepEqual(names, ['manifest.json', 'pgdata.tar.gz', 'secrets.json', DOC_REL]);
    assert.equal(saved.manifest.counts.workspaces, 1); assert.equal(saved.manifest.counts.contacts, 1); assert.equal(saved.manifest.counts.users, 1);
    assert.equal(saved.manifest.pgdata.checkpoint, true); assert.equal(saved.manifest.files.count, 1);
  });
  test('the daily scheduler writes today\'s archive once on a real database, and prune keeps the newest', async () => {
    const now = () => new Date(2026, 9, 12, 9, 0, 0);
    const s = a.backup.startScheduler({ getDb: a.embedded.getDb, pool: dbA.pool, firstDelayMs: 1e9, intervalMs: 1e9, now, log: quiet });
    const r = await s.tick();
    assert.equal(r.name, 'crm-backup-2026-10-12.tar.gz');
    const mtime = fs.statSync(r.path).mtimeMs;
    assert.equal(await s.tick(), null); assert.equal(fs.statSync(r.path).mtimeMs, mtime);
    s.stop();
    for (let d = 1; d <= 3; d++) { const p = path.join(BACKUPS, `crm-backup-2026-09-0${d}.tar.gz`); fs.writeFileSync(p, 'old'); fs.utimesSync(p, new Date(2026, 8, d), new Date(2026, 8, d)); }
    const removed = await a.backup.prune({ keep: 2 });
    assert.deepEqual(removed.sort(), ['crm-backup-2026-09-01.tar.gz', 'crm-backup-2026-09-02.tar.gz', 'crm-backup-2026-09-03.tar.gz']);
    assert.deepEqual((await a.backup.listBackups()).map(b => b.name).sort(), [r.name, saved.name].sort());
  });
  test('A stops cleanly', async () => { await a.embedded.stop(dbA.pool); assert.equal(fs.existsSync(a.embedded.LOCK_FILE), false); });
});

describe('restore into B', () => {
  test('refuses while a CRM process holds B\'s lock; refuses a Postgres version mismatch unless forced', async () => {
    fs.mkdirSync(path.join(B, 'pgdata'), { recursive: true });
    fs.writeFileSync(path.join(B, 'pgdata', 'PG_VERSION'), '99\n');                       // junk database of another version
    fs.writeFileSync(path.join(B, 'secrets.json'), '{"sessionSecret":"junk","fileKey":"junk"}');
    fs.writeFileSync(path.join(B, 'pgdata.lock'), JSON.stringify({ pid: process.ppid }));
    await assert.rejects(a.backup.restoreArchive(saved.path, { dataDir: B, log: quiet }), e => e.code === 'SERVER_RUNNING');
    fs.unlinkSync(path.join(B, 'pgdata.lock'));
    await assert.rejects(a.backup.restoreArchive(saved.path, { dataDir: B, log: quiet }), e => e.code === 'PG_VERSION_MISMATCH');
    assert.equal(fs.readFileSync(path.join(B, 'pgdata', 'PG_VERSION'), 'utf8'), '99\n', 'nothing moved on a refusal');
    await assert.rejects(a.backup.restoreArchive(path.join(B, 'nope.tar.gz'), { dataDir: B }), e => e.code === 'NO_SUCH_FILE');
  });
  test('forced: the junk is moved aside with a stamp, files and secrets land, the inner tar is loaded', async () => {
    const r = await a.backup.restoreArchive(saved.path, { dataDir: B, force: true, log: quiet, now: new Date(2026, 9, 12, 12, 0, 0) });
    assert.equal(r.workspaces, 1); assert.equal(r.files, 2, 'secrets.json + the document');
    assert.deepEqual(r.movedAside.map(m => path.basename(m.to)), ['pgdata.before-restore-2026-10-12-120000', 'secrets.json.before-restore-2026-10-12-120000']);
    assert.equal(fs.readFileSync(path.join(B, 'pgdata.before-restore-2026-10-12-120000', 'PG_VERSION'), 'utf8'), '99\n');
    assert.deepEqual(fs.readFileSync(path.join(B, DOC_REL)), PDF);
    assert.equal(fs.readFileSync(path.join(B, 'secrets.json'), 'utf8'), secretsA);
    assert.ok(fs.existsSync(path.join(B, 'pgdata', 'PG_VERSION')));
    const prov = JSON.parse(fs.readFileSync(path.join(B, 'restored-from.json'), 'utf8'));
    assert.equal(prov.manifest.format, 'crm-backup'); assert.equal(prov.archive, saved.path);
    assert.equal(fs.existsSync(path.join(B, 'pgdata.lock')), false, 'the restore lock is released');
  });
  test('B boots as a normal embedded database and holds A\'s data', async () => {
    const b = fresh(B); const dbB = loadDbWithRealPg();
    await b.embedded.start(dbB.pool);
    try {
      await quietly(() => dbB.initDb());                                                // idempotent on a restored cluster
      const { rows } = await dbB.pool.query(`SELECT c.name, c.company, w.name AS ws FROM contacts c JOIN workspaces w ON w.id = c.workspace_id`);
      assert.deepEqual(rows, [{ name: 'Max Mustermann', company: 'Muster AG', ws: 'Backup GmbH' }]);
      const { rows: [{ n }] } = await dbB.pool.query('SELECT COUNT(*)::int AS n FROM users');
      assert.equal(n, 1);
      assert.equal(b.embedded.secrets().fileKey, JSON.parse(secretsA).fileKey, 'the restored secrets are what embedded.js reads');
      await dbB.pool.query(`INSERT INTO contacts (workspace_id, name) VALUES (1, 'After restore')`);   // and it is writable
    } finally { await b.embedded.stop(dbB.pool); }
  });
});

after(() => { for (const d of [A, B, BACKUPS]) fs.rmSync(d, { recursive: true, force: true }); });
