// UNIT — utils/backup.js without a real database: a fake PGlite whose dumpDataDir hands back a
// known blob. Config parsing, names, the archive's entries, the one-at-a-time flag, the .part →
// rename discipline, listing and pruning, and the daily scheduler's decisions. The real database
// path is tests/integration/backup-restore.test.js.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { ROOT } = require('../helpers/load-route');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-backup-unit-'));
const DATA = path.join(TMP, 'data'), BACKUPS = path.join(TMP, 'backups');
fs.mkdirSync(path.join(DATA, 'files', 'contact-documents', '7', '55'), { recursive: true });
fs.writeFileSync(path.join(DATA, 'files', 'contact-documents', '7', '55', '1760000000000-Vertrag.pdf'), '%PDF-1.4 unit');
fs.writeFileSync(path.join(DATA, 'files', 'contact-documents', '7', '55', '.DS_Store'), 'junk');
fs.writeFileSync(path.join(DATA, 'secrets.json'), JSON.stringify({ sessionSecret: 'a'.repeat(64), fileKey: 'b'.repeat(64) }));
process.env.DATA_DIR = DATA; process.env.BACKUP_DIR = BACKUPS;
for (const k of ['DATABASE_URL', 'BACKUPS', 'BACKUP_KEEP']) delete process.env[k];
for (const f of ['embedded.js', 'utils/tar.js', 'utils/backup.js']) delete require.cache[path.join(ROOT, f)];
const backup = require(path.join(ROOT, 'utils', 'backup.js'));
const tar    = require(path.join(ROOT, 'utils', 'tar.js'));

const quiet = { log() {}, warn() {}, error() {} };
const fakeDb = (over = {}) => ({
  query: async () => ({ rows: [{ workspaces: 1, users: 2, contacts: 3, deals: 0, tasks: 0, contactDocuments: 1, taskAttachments: 0 }] }),
  runExclusive: fn => fn(),
  dumpDataDir: async () => new File([Buffer.from('fake-pgdata-tar-gz')], 'pgdata.tar.gz', { type: 'application/x-gzip' }),
  ...over,
});
async function entriesOf(file) {
  const out = [];
  for await (const e of tar.readTar(fs.createReadStream(file).pipe(zlib.createGunzip()))) out.push({ name: e.name, body: await tar.collect(e.body) });
  return out;
}
const env = vars => { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
after(() => { backup.stopScheduler(); fs.rmSync(TMP, { recursive: true, force: true }); });
beforeEach(() => { fs.rmSync(BACKUPS, { recursive: true, force: true }); env({ BACKUPS: undefined, BACKUP_KEEP: undefined, DATABASE_URL: undefined }); });

describe('config', () => {
  test('folder, retention and the daily switch read the environment at call time', () => {
    assert.equal(backup.backupDir(), BACKUPS);
    assert.equal(backup.keepCount(), 14);
    env({ BACKUP_KEEP: '3' }); assert.equal(backup.keepCount(), 3);
    for (const bad of ['0', '-2', 'many', '']) { env({ BACKUP_KEEP: bad }); assert.equal(backup.keepCount(), 14, JSON.stringify(bad)); }
    env({ BACKUP_KEEP: undefined });
    assert.equal(backup.schedulerEnabled(), true);
    for (const off of ['0', 'false', 'no', 'off', ' OFF ']) { env({ BACKUPS: off }); assert.equal(backup.schedulerEnabled(), false, off); }
    env({ BACKUPS: undefined, DATABASE_URL: 'postgres://x' }); assert.equal(backup.schedulerEnabled(), false, 'hosted: nothing to snapshot');
    assert.equal(backup.isEmbedded(), false);
  });
  test('names use the LOCAL calendar day', () => {
    const d = new Date(2026, 9, 12, 23, 59, 7);   // 12 Oct 2026, local
    assert.equal(backup.dailyName(d), 'crm-backup-2026-10-12.tar.gz');
    assert.equal(backup.manualName(d), 'crm-backup-2026-10-12-235907.tar.gz');
    assert.match('crm-backup-2026-10-12.tar.gz', backup.ARCHIVE_RE); assert.match('crm-backup-2026-10-12-235907.tar.gz', backup.ARCHIVE_RE);
    assert.doesNotMatch('crm-backup-2026-10-12.tar.gz.123.part', backup.ARCHIVE_RE); assert.doesNotMatch('other.tar.gz', backup.ARCHIVE_RE);
  });
});

describe('the archive', () => {
  test('saveBackup writes manifest, the PGlite dump as-is, secrets and every upload (dotfiles skipped), then lists it', async () => {
    const now = new Date(2026, 9, 12, 10, 0, 0);
    const r = await backup.saveBackup({ db: fakeDb(), now, log: quiet });
    assert.equal(r.name, 'crm-backup-2026-10-12-100000.tar.gz');
    assert.ok(fs.existsSync(r.path)); assert.equal(fs.readdirSync(BACKUPS).some(n => n.endsWith('.part')), false);
    const head = fs.readFileSync(r.path).subarray(0, 2); assert.deepEqual([...head], [0x1f, 0x8b]);
    const entries = await entriesOf(r.path);
    assert.deepEqual(entries.map(e => e.name), ['manifest.json', 'pgdata.tar.gz', 'secrets.json', 'files/contact-documents/7/55/1760000000000-Vertrag.pdf']);
    assert.equal(entries[1].body.toString(), 'fake-pgdata-tar-gz');
    assert.equal(entries[2].body.toString(), fs.readFileSync(path.join(DATA, 'secrets.json'), 'utf8'));
    assert.equal(entries[3].body.toString(), '%PDF-1.4 unit');
    const m = JSON.parse(entries[0].body.toString());
    assert.equal(m.format, 'crm-backup'); assert.equal(m.formatVersion, 1); assert.equal(m.createdAt, now.toISOString());
    assert.equal(m.pgdata.bytes, 'fake-pgdata-tar-gz'.length); assert.equal(m.pgdata.checkpoint, true); assert.equal(m.secrets, true);
    assert.deepEqual(m.files, { count: 1, bytes: '%PDF-1.4 unit'.length }); assert.equal(m.counts.contacts, 3);
    assert.deepEqual(r.manifest, m);
    const listed = await backup.listBackups();
    assert.equal(listed.length, 1); assert.equal(listed[0].name, r.name); assert.equal(listed[0].size, fs.statSync(r.path).size);
  });
  test('a failed CHECKPOINT is only a warning, recorded in the manifest', async () => {
    const warned = [];
    const r = await backup.saveBackup({ db: fakeDb({ query: async sql => { if (/CHECKPOINT/.test(sql)) throw new Error('nope'); return { rows: [] }; } }), log: { ...quiet, warn: m => warned.push(m) } });
    assert.equal(r.manifest.pgdata.checkpoint, false); assert.equal(r.manifest.counts, null);
    assert.match(warned[0], /CHECKPOINT skipped/);
  });
  test('a second save in the same second takes the next second instead of overwriting', async () => {
    const now = new Date(2026, 9, 12, 10, 0, 0);
    const a = await backup.saveBackup({ db: fakeDb(), now, log: quiet });
    const b = await backup.saveBackup({ db: fakeDb(), now, log: quiet });
    assert.equal(a.name, 'crm-backup-2026-10-12-100000.tar.gz'); assert.equal(b.name, 'crm-backup-2026-10-12-100001.tar.gz');
  });
  test('one archive at a time: BUSY while a stream is open, free again once it closes', async () => {
    const a = await backup.createArchive({ db: fakeDb(), dataDir: DATA, log: quiet });
    assert.equal(backup.isBusy(), true);
    await assert.rejects(backup.createArchive({ db: fakeDb(), dataDir: DATA, log: quiet }), e => e.code === 'BUSY');
    await pipeline(a.stream, fs.createWriteStream(path.join(TMP, 'drain.tar.gz')));
    await new Promise(r => setImmediate(r));
    assert.equal(backup.isBusy(), false);
  });
  test('hosted mode → NOT_EMBEDDED; a failing dump → rejects, flag released, nothing written', async () => {
    env({ DATABASE_URL: 'postgres://x' });
    await assert.rejects(backup.createArchive({ db: fakeDb(), dataDir: DATA }), e => e.code === 'NOT_EMBEDDED');
    env({ DATABASE_URL: undefined });
    await assert.rejects(backup.saveBackup({ db: fakeDb({ dumpDataDir: async () => { throw new Error('wasm says no'); } }), log: quiet }), /wasm says no/);
    assert.equal(backup.isBusy(), false);
    assert.equal(fs.existsSync(BACKUPS) ? fs.readdirSync(BACKUPS).length : 0, 0, 'no .part, no final file');
  });
  test('a file that vanishes between the scan and the stream fails the archive loudly, flag released', async () => {
    const ghost = path.join(DATA, 'files', 'contact-documents', '7', '55', '1760000000001-ghost.pdf');
    fs.writeFileSync(ghost, 'boo');
    const a = await backup.createArchive({ db: fakeDb(), dataDir: DATA, log: quiet });
    fs.unlinkSync(ghost);
    await assert.rejects(pipeline(a.stream, fs.createWriteStream(path.join(TMP, 'ghost.tar.gz'))), /ENOENT/);
    await new Promise(r => setImmediate(r));
    assert.equal(backup.isBusy(), false);
  });
});

describe('listing and pruning', () => {
  const touch = (name, when) => { fs.mkdirSync(BACKUPS, { recursive: true }); const p = path.join(BACKUPS, name); fs.writeFileSync(p, 'x'); fs.utimesSync(p, when, when); return p; };
  test('listBackups: only this module\'s names, newest first by time; foreign files and .part are ignored', async () => {
    touch('crm-backup-2026-10-01.tar.gz', new Date(2026, 9, 1, 3));
    touch('crm-backup-2026-10-03-120000.tar.gz', new Date(2026, 9, 3, 12));
    touch('crm-backup-2026-10-02.tar.gz', new Date(2026, 9, 2, 3));
    touch('crm-backup-2026-10-04.tar.gz.123.part', new Date(2026, 9, 4));
    touch('notes.txt', new Date(2026, 9, 5)); touch('.DS_Store', new Date(2026, 9, 5));
    assert.deepEqual((await backup.listBackups()).map(b => b.name), ['crm-backup-2026-10-03-120000.tar.gz', 'crm-backup-2026-10-02.tar.gz', 'crm-backup-2026-10-01.tar.gz']);
    assert.deepEqual(await backup.listBackups(path.join(TMP, 'nowhere')), []);
  });
  test('prune keeps the newest N and removes stale .part files, never fresh ones', async () => {
    for (let d = 1; d <= 5; d++) touch(`crm-backup-2026-10-0${d}.tar.gz`, new Date(2026, 9, d, 3));
    touch('crm-backup-2026-10-09.tar.gz.111.part', new Date(2026, 9, 9));
    const fresh = touch('crm-backup-2026-10-10.tar.gz.222.part', new Date());
    const removed = await backup.prune({ keep: 2 });
    assert.deepEqual(removed.sort(), ['crm-backup-2026-10-01.tar.gz', 'crm-backup-2026-10-02.tar.gz', 'crm-backup-2026-10-03.tar.gz', 'crm-backup-2026-10-09.tar.gz.111.part']);
    assert.deepEqual((await backup.listBackups()).map(b => b.name), ['crm-backup-2026-10-05.tar.gz', 'crm-backup-2026-10-04.tar.gz']);
    assert.ok(fs.existsSync(fresh), 'a .part younger than an hour may still be being written');
  });
  test('saveBackup prunes AFTER writing, with BACKUP_KEEP', async () => {
    env({ BACKUP_KEEP: '2' });
    for (let d = 1; d <= 3; d++) touch(`crm-backup-2026-09-0${d}.tar.gz`, new Date(2026, 8, d));
    const r = await backup.saveBackup({ db: fakeDb(), log: quiet });
    assert.deepEqual(r.pruned.sort(), ['crm-backup-2026-09-01.tar.gz', 'crm-backup-2026-09-02.tar.gz']);
    assert.deepEqual((await backup.listBackups()).map(b => b.name), [r.name, 'crm-backup-2026-09-03.tar.gz']);
  });
});

describe('the daily scheduler', () => {
  test('writes today\'s archive once, never twice, and is idempotent to start', async () => {
    let calls = 0; const getDb = () => { calls++; return fakeDb(); };
    const now = () => new Date(2026, 9, 12, 9, 30, 0);
    const s = backup.startScheduler({ getDb, firstDelayMs: 1e9, intervalMs: 1e9, now, log: quiet });
    assert.equal(backup.startScheduler({ getDb }), s, 'a second start is the same scheduler');
    const r = await s.tick();
    assert.equal(r.name, 'crm-backup-2026-10-12.tar.gz'); assert.equal(calls, 1);
    const st = fs.statSync(path.join(BACKUPS, r.name)).mtimeMs;
    assert.equal(await s.tick(), null); assert.equal(calls, 1, 'today exists: the database is not even asked for');
    assert.equal(fs.statSync(path.join(BACKUPS, r.name)).mtimeMs, st);
    assert.equal(backup.schedulerStatus().lastSaved.name, r.name); assert.equal(backup.schedulerStatus().enabled, true);
    s.stop();
    assert.equal(backup.schedulerStatus().lastSaved, null, 'stopped: a fresh status');
  });
  test('BACKUPS=0 → the tick does nothing; a failing save is logged and remembered, never thrown', async () => {
    env({ BACKUPS: '0' });
    const s = backup.startScheduler({ getDb: () => fakeDb(), firstDelayMs: 1e9, intervalMs: 1e9, log: quiet });
    assert.equal(await s.tick(), null); assert.equal(fs.existsSync(BACKUPS), false);
    env({ BACKUPS: undefined });
    const errors = [];
    s.stop();
    const s2 = backup.startScheduler({ getDb: () => fakeDb({ dumpDataDir: async () => { throw new Error('disk full'); } }), firstDelayMs: 1e9, intervalMs: 1e9, log: { ...quiet, error: (...a) => errors.push(a.join(' ')) } });
    assert.equal(await s2.tick(), null);
    assert.match(backup.schedulerStatus().lastError.message, /disk full/); assert.match(errors[0], /backup scheduler: disk full/);
    s2.stop();
  });
});
