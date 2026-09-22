// UNIT tests for utils/drive-sync.js — the sync itself against the recording
// fake pool and a fake Drive client: what is deleted, upserted and stamped,
// what happens when Google fails, which contacts the worker picks, and the
// worker's start/stop/overlap behaviour.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { ROOT } = require('../helpers/load-route');

const abs = path.join(ROOT, 'utils', 'drive-sync.js'); delete require.cache[abs];
const { createDriveSync } = require(abs);
const { DriveError } = require(path.join(ROOT, 'utils', 'google-drive.js'));

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123';
const RAW = [
  { id: 'a1', name: ' Vertrag.pdf ', mimeType: 'application/pdf', size: '10', modifiedTime: '2026-09-01T00:00:00Z' },
  { id: 'b2', name: 'Unterordner', mimeType: 'application/vnd.google-apps.folder' },
  { id: 'bad"id', name: 'x', mimeType: 'image/png' },          // skipped: unexpected characters
  { id: 'c3', name: '   ', mimeType: 'image/png' },            // skipped: empty name
];
let pool, contacts, stored, driveMode, listed, S;

beforeEach(() => {
  contacts = new Map([[60, { drive_ordner_id: ID, workspace_id: 7 }], [62, { drive_ordner_id: null, workspace_id: 7 }], [63, { drive_ordner_id: 'garbage', workspace_id: 7 }]]);
  stored = [{ file_id: 'old', name: 'Alt.pdf', mime_type: 'application/pdf', size: 1, modified_at: null, synced_at: 's' }];
  driveMode = 'ok'; listed = [];
  pool = createFakePool([
    { match: /^SELECT drive_ordner_id FROM contacts WHERE id=\$1 AND workspace_id=\$2/, reply: p => { const c = contacts.get(p[0]); return { rows: c && c.workspace_id === p[1] ? [{ drive_ordner_id: c.drive_ordner_id }] : [] }; } },
    { match: /^SELECT file_id, name, mime_type, size, modified_at, synced_at FROM contact_drive_files/, reply: () => ({ rows: stored }) },
    { match: /^SELECT id, workspace_id FROM contacts WHERE drive_ordner_id IS NOT NULL/, reply: () => ({ rows: [{ id: 60, workspace_id: 7 }, { id: 63, workspace_id: 7 }] }) },
  ]);
  const drive = { configured: true, async listFolder(id) { listed.push(id); if (driveMode === 'not_public') throw new DriveError('not_public', 404); if (driveMode === 'throw') throw new Error('boom'); return RAW; } };
  S = createDriveSync({ pool, drive, now: () => new Date('2026-09-22T09:00:00Z'), log: { log() {}, error() {} } });
});

describe('syncContact', () => {
  test('unknown contact -> { error: not_found }, nothing written', async () => {
    assert.deepEqual(await S.syncContact(8, 60), { error: 'not_found' });
    assert.equal(pool.writes().length, 0);
  });
  test('no folder (or an unparsable stored value) -> rows deleted, count 0, no Google call', async () => {
    for (const id of [62, 63]) {
      const r = await S.syncContact(7, id);
      assert.deepEqual(r.files, []); assert.equal(r.sync_error, null);
      assert.deepEqual(pool.find(/^DELETE FROM contact_drive_files WHERE contact_id=\$1 AND workspace_id=\$2$/).params, [id, 7]);
      assert.deepEqual(pool.find(/^UPDATE contacts SET drive_file_count=0/).params, [id, 7]);
      pool.reset();
    }
    assert.equal(listed.length, 0);
  });
  test('success: vanished rows deleted, one multi-row upsert with matching placeholders, contact stamped, all in one transaction', async () => {
    const r = await S.syncContact(7, 60);
    assert.deepEqual(listed, [ID]);
    const del = pool.find(/^DELETE FROM contact_drive_files WHERE contact_id=\$1 AND workspace_id=\$2 AND NOT \(file_id = ANY\(\$3::text\[\]\)\)/);
    assert.deepEqual(del.params, [60, 7, ['a1', 'b2']], 'only the two valid files survive');
    const ins = pool.find(/^INSERT INTO contact_drive_files/);
    assert.match(ins.sql, /ON CONFLICT \(contact_id, file_id\) DO UPDATE SET name=EXCLUDED\.name/);
    assert.equal((ins.sql.match(/\$\d+/g) || []).length, ins.params.length, 'placeholders = bound values');
    assert.deepEqual(ins.params, [7, 60, 'a1', 'Vertrag.pdf', 'application/pdf', 10, '2026-09-01T00:00:00Z', 7, 60, 'b2', 'Unterordner', 'application/vnd.google-apps.folder', null, null]);
    assert.deepEqual(pool.find(/^UPDATE contacts SET drive_file_count=\$1/).params, [2, 60, 7]);
    const order = ['BEGIN', 'DELETE FROM contact_drive_files', 'INSERT INTO contact_drive_files', 'UPDATE contacts SET drive_file_count', 'COMMIT'].map(s => pool.log.findIndex(e => e.sql.startsWith(s)));
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in order');
    assert.equal(pool.some(/^ROLLBACK/), false);
    assert.equal(r.sync_error, null); assert.equal(r.folder_id, ID);
    assert.deepEqual(r.files.map(f => [f.name, f.kind]), [['Alt.pdf', 'pdf']], 'returned from the table');
  });
  test('Google failure: rows are kept, the error code is stored, the stored rows are returned', async () => {
    driveMode = 'not_public';
    const r = await S.syncContact(7, 60);
    assert.equal(r.sync_error, 'not_public');
    assert.deepEqual(pool.find(/^UPDATE contacts SET drive_synced_at=NOW\(\), drive_sync_error=\$1/).params, ['not_public', 60, 7]);
    assert.equal(pool.some(/^DELETE/), false); assert.equal(pool.some(/^INSERT/), false);
    assert.equal(r.files.length, 1);
    driveMode = 'throw';
    assert.equal((await S.syncContact(7, 60)).sync_error, 'upstream', 'an unexpected error is reported as upstream');
  });
  test('an empty folder deletes every row and stores count 0 without an INSERT', async () => {
    const drive = { configured: true, async listFolder() { return []; } };
    const T = createDriveSync({ pool, drive, log: { log() {}, error() {} } });
    await T.syncContact(7, 60);
    assert.deepEqual(pool.find(/^DELETE FROM contact_drive_files/).params, [60, 7, []]);
    assert.equal(pool.some(/^INSERT/), false);
    assert.deepEqual(pool.find(/^UPDATE contacts SET drive_file_count=\$1/).params, [0, 60, 7]);
  });
});

describe('syncDue / startWorker', () => {
  test('picks contacts whose last attempt is older than the cutoff, never-synced first, and syncs them one after another', async () => {
    const s = await S.syncDue({ olderThanMs: 60 * 60_000, limit: 25 });
    const q = pool.find(/^SELECT id, workspace_id FROM contacts WHERE drive_ordner_id IS NOT NULL/);
    assert.match(q.sql, /drive_synced_at IS NULL OR drive_synced_at < \$1/);
    assert.match(q.sql, /ORDER BY drive_synced_at NULLS FIRST LIMIT \$2/);
    assert.equal(q.params[0].toISOString(), '2026-09-22T08:00:00.000Z'); assert.equal(q.params[1], 25);
    assert.deepEqual(s, { checked: 2, synced: 2, failed: 0 }, 'contact 63 (garbage folder) counts as synced-to-empty');
    assert.deepEqual(listed, [ID]);
  });
  test('not configured -> nothing is queried; the worker stays idle', async () => {
    const T = createDriveSync({ pool, drive: { configured: false, listFolder: async () => [] }, log: { log() {}, error() {} } });
    assert.deepEqual(await T.syncDue(), { checked: 0, synced: 0, failed: 0 });
    assert.equal(pool.log.length, 0);
    const w = T.startWorker({ initialDelayMs: 1, intervalMs: 1000 });
    assert.deepEqual(await w.tick(), { checked: 0, synced: 0, failed: 0 }); w.stop();
  });
  test('the worker ticks, refuses to overlap, and stops', async () => {
    let resolveFirst; const slowDrive = { configured: true, listFolder: () => new Promise(res => { resolveFirst = () => res(RAW); }) };
    const T = createDriveSync({ pool, drive: slowDrive, log: { log() {}, error() {} } });
    const w = T.startWorker({ initialDelayMs: 100_000, intervalMs: 100_000 });
    const first = w.tick();                                   // runs until we resolve Google
    await new Promise(r => setTimeout(r, 5));
    assert.equal(await w.tick(), null, 'second tick skipped while the first runs');
    resolveFirst();
    const s = await first;
    assert.equal(s.checked, 2);
    w.stop();
  });
});
