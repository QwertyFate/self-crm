// ROUTE tests for the Drive endpoints in routes/contacts.js:
//   PATCH /:id/drive-folder  — store a pasted link/id as the bare id, then sync
//   GET   /:id/drive-files   — the stored list (never calls Google)
//   POST  /:id/drive-sync    — re-read the folder now
// The sync engine (utils/drive-sync.js) is replaced by a recorder so the tests
// prove what the routes do with it, not what it does with Google.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve, inject, ROOT } = require('../helpers/load-route');

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123';
const drive = require(path.join(ROOT, 'utils', 'google-drive.js'));
const FILE = drive.describeFile({ id: 'f1', name: 'Vertrag.pdf', mimeType: 'application/pdf', size: '10', modifiedTime: '2026-09-01T00:00:00Z' });
let pool, server, syncCalls = [], syncResult;
const contacts = new Map();
const seed = () => { contacts.clear();
  contacts.set(60, { id: 60, workspace_id: 7, drive_ordner_id: ID, drive_synced_at: '2026-09-20T10:00:00Z', drive_sync_error: null, drive_file_count: 1 });
  contacts.set(62, { id: 62, workspace_id: 7, drive_ordner_id: null, drive_synced_at: null, drive_sync_error: null, drive_file_count: 0 });
  contacts.set(63, { id: 63, workspace_id: 7, drive_ordner_id: `https://drive.google.com/drive/folders/${ID}?usp=sharing`, drive_synced_at: null, drive_sync_error: 'not_public', drive_file_count: 0 });   // stored by the engine as a full link
  contacts.set(61, { id: 61, workspace_id: 8, drive_ordner_id: ID, drive_synced_at: null, drive_sync_error: null, drive_file_count: 0 }); };

before(async () => {
  pool = createFakePool([
    { match: /^UPDATE contacts SET drive_ordner_id=\$1, updated_at=NOW\(\) WHERE id=\$2 AND workspace_id=\$3/, reply: p => { const c = contacts.get(p[1]); if (!c || c.workspace_id !== p[2]) return { rows: [], rowCount: 0 }; c.drive_ordner_id = p[0]; return { rows: [], rowCount: 1 }; } },
    { match: /^SELECT drive_ordner_id, drive_synced_at, drive_sync_error, drive_file_count FROM contacts WHERE id=\$1 AND workspace_id=\$2/, reply: p => { const c = contacts.get(p[0]); return { rows: c && c.workspace_id === p[1] ? [c] : [] }; } },
  ]);
  inject('utils/drive-sync.js', { getDriveSync: () => ({
    async syncContact(ws, id) { syncCalls.push([ws, id]); return syncResult(ws, id); },
    async listFiles(ws, id) { return id === 60 ? [FILE] : []; },
  }) });
  server = await serve({ '/api/contacts': loadRoute('contacts.js', { pool }) });
});
after(() => { server.close(); delete process.env.GOOGLE_API_KEY; });
beforeEach(() => {
  pool.reset(); syncCalls = []; seed(); process.env.GOOGLE_API_KEY = 'test-key';
  syncResult = (ws, id) => ({ folder_id: ID, synced_at: '2026-09-22T09:00:00Z', sync_error: null, files: id === 60 ? [FILE] : [] });
});
const req = (m, p, b) => server.request(m, p, b);

describe('PATCH /:id/drive-folder', () => {
  test('junk / javascript: / non-numeric id -> 400 with no query and no sync', async () => {
    assert.equal((await req('PATCH', '/api/contacts/60/drive-folder', { drive_ordner_id: 'https://evil.example/x' })).status, 400);
    assert.equal((await req('PATCH', '/api/contacts/60/drive-folder', { drive_ordner_id: 'javascript:alert(1)' })).status, 400);
    assert.equal((await req('PATCH', '/api/contacts/abc/drive-folder', { drive_ordner_id: ID })).status, 400);
    assert.equal(pool.log.length, 0); assert.equal(syncCalls.length, 0);
  });
  test("another workspace's contact -> 404, nothing synced", async () => {
    assert.equal((await req('PATCH', '/api/contacts/61/drive-folder', { drive_ordner_id: ID })).status, 404);
    assert.deepEqual(pool.find(/^UPDATE contacts SET drive_ordner_id/).params, [ID, 61, 7]);
    assert.equal(syncCalls.length, 0);
  });
  test('a full link is stored as the bare id and the folder is synced right away; the response carries the sync summary', async () => {
    const r = await req('PATCH', '/api/contacts/62/drive-folder', { drive_ordner_id: `https://drive.google.com/drive/folders/${ID}?usp=sharing` });
    assert.equal(r.status, 200);
    assert.deepEqual(pool.find(/^UPDATE contacts SET drive_ordner_id/).params, [ID, 62, 7]);
    assert.deepEqual(syncCalls, [[7, 62]]);
    assert.deepEqual(r.body, { success: true, drive_ordner_id: ID, folder_url: `https://drive.google.com/drive/folders/${ID}`, sync: { synced_at: '2026-09-22T09:00:00Z', sync_error: null, count: 0 } });
  });
  test('a Drive failure during that sync still saves the folder: 200 with sync_error', async () => {
    syncResult = () => ({ folder_id: ID, synced_at: 't', sync_error: 'not_public', files: [] });
    const r = await req('PATCH', '/api/contacts/62/drive-folder', { drive_ordner_id: ID });
    assert.equal(r.status, 200);
    assert.equal(r.body.sync.sync_error, 'not_public');
  });
  test('clearing removes the rows through the sync even without a key; setting without a key stores but does not sync', async () => {
    delete process.env.GOOGLE_API_KEY;
    const cleared = await req('PATCH', '/api/contacts/60/drive-folder', { drive_ordner_id: '' });
    assert.deepEqual(cleared.body.drive_ordner_id, null);
    assert.deepEqual(syncCalls, [[7, 60]], 'clear -> sync (which deletes the rows)');
    const set = await req('PATCH', '/api/contacts/62/drive-folder', { drive_ordner_id: ID });
    assert.equal(set.status, 200);
    assert.equal(set.body.sync, null);
    assert.equal(syncCalls.length, 1, 'no Google call without a key');
  });
});

describe('GET /:id/drive-files', () => {
  test("another workspace's contact -> 404; no folder -> empty shape", async () => {
    assert.equal((await req('GET', '/api/contacts/61/drive-files')).status, 404);
    const r = await req('GET', '/api/contacts/62/drive-files');
    assert.deepEqual(r.body, { folder_id: null, folder_url: null, embed_url: null, synced_at: null, sync_error: null, configured: true, files: [] });
  });
  test('the stored list is returned without touching Google; a stored full link is normalised; the stored error is reported', async () => {
    const a = await req('GET', '/api/contacts/60/drive-files');
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, { folder_id: ID, folder_url: `https://drive.google.com/drive/folders/${ID}`, embed_url: `https://drive.google.com/embeddedfolderview?id=${ID}#list`, synced_at: '2026-09-20T10:00:00Z', sync_error: null, configured: true, files: [FILE] });
    const b = await req('GET', '/api/contacts/63/drive-files');
    assert.equal(b.body.folder_id, ID); assert.equal(b.body.sync_error, 'not_public'); assert.deepEqual(b.body.files, []);
    assert.equal(syncCalls.length, 0);
  });
  test('without a key the list is still served and configured is false', async () => {
    delete process.env.GOOGLE_API_KEY;
    const r = await req('GET', '/api/contacts/60/drive-files');
    assert.equal(r.status, 200); assert.equal(r.body.configured, false); assert.equal(r.body.files.length, 1);
  });
});

describe('POST /:id/drive-sync', () => {
  test('no key -> 503 drive_not_configured, no sync; foreign -> 404; bad id -> 400', async () => {
    delete process.env.GOOGLE_API_KEY;
    const r = await req('POST', '/api/contacts/60/drive-sync', {});
    assert.equal(r.status, 503); assert.equal(r.body.error, 'drive_not_configured');
    process.env.GOOGLE_API_KEY = 'k';
    assert.equal((await req('POST', '/api/contacts/61/drive-sync', {})).status, 404);
    assert.equal((await req('POST', '/api/contacts/x/drive-sync', {})).status, 400);
    assert.equal(syncCalls.length, 0);
  });
  test('syncs now and answers in the GET shape; a Drive failure is 200 with sync_error and the cached rows', async () => {
    const ok = await req('POST', '/api/contacts/60/drive-sync', {});
    assert.equal(ok.status, 200);
    assert.deepEqual(syncCalls, [[7, 60]]);
    assert.deepEqual(ok.body, { folder_id: ID, folder_url: `https://drive.google.com/drive/folders/${ID}`, embed_url: `https://drive.google.com/embeddedfolderview?id=${ID}#list`, synced_at: '2026-09-22T09:00:00Z', sync_error: null, configured: true, files: [FILE] });
    syncResult = () => ({ folder_id: ID, synced_at: 't', sync_error: 'timeout', files: [FILE] });
    const failed = await req('POST', '/api/contacts/60/drive-sync', {});
    assert.equal(failed.status, 200); assert.equal(failed.body.sync_error, 'timeout'); assert.equal(failed.body.files.length, 1);
  });
});
