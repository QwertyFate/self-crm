// ROUTE tests — /api/admin/backup (routes/admin-backup.js) with utils/backup.js and embedded.js
// replaced by fakes: the gate, the hosted-mode 503, the download's headers and bytes, busy → 409,
// a failing snapshot → 500 JSON with the server still alive, the list shape, and "save now".
process.env.OPEN_ADMIN = 'false';   // the SECRET-gated console; open admin has its own test
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const { loadRoute, serve, inject } = require('../helpers/load-route');
const { createFakePool } = require('../helpers/fake-pool');

process.env.ADMIN_SECRET = 'top-secret';
const H = { 'X-Admin-Secret': 'top-secret' };
const PG_DUMP_MSG = 'Backups are available only with the embedded database (no DATABASE_URL). With a Postgres server, use pg_dump.';

const state = { embedded: true, busy: false, createThrows: null, saved: [] };
const busyErr = () => Object.assign(new Error('A backup is already being written. Try again in a moment.'), { code: 'BUSY' });
const fakeBackup = {
  isEmbedded: () => state.embedded, backupDir: () => '/srv/crm/backups', keepCount: () => 14, schedulerEnabled: () => true, isBusy: () => state.busy,
  schedulerStatus: () => ({ enabled: true, running: false, lastRunAt: null, lastSaved: null, lastError: null }),
  listBackups: async () => [{ name: 'crm-backup-2026-10-12.tar.gz', size: 1234, createdAt: '2026-10-12T09:00:00.000Z' }],
  saveBackup: async opts => { if (state.busy) throw busyErr(); state.saved.push(opts); return { name: 'crm-backup-2026-10-12-100000.tar.gz', size: 2048, createdAt: '2026-10-12T10:00:00.000Z', path: '/srv/crm/backups/x', manifest: {}, pruned: ['crm-backup-2026-09-01.tar.gz'] }; },
  createArchive: async () => { if (state.busy) throw busyErr(); if (state.createThrows) throw state.createThrows; return { stream: Readable.from([Buffer.from('GZBYTES')]), manifest: {}, name: 'crm-backup-2026-10-12-100000.tar.gz' }; },
};
const fakeDb = { fake: 'pglite' };
const pool = createFakePool([]);
let server;
before(async () => {
  inject('utils/backup.js', fakeBackup);
  inject('embedded.js', { getDb: () => fakeDb });
  server = await serve({ '/api/admin': loadRoute('admin-backup.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { state.embedded = true; state.busy = false; state.createThrows = null; state.saved.length = 0; pool.reset(); });

const ENDPOINTS = [['GET', '/api/admin/backup'], ['GET', '/api/admin/backup/list'], ['POST', '/api/admin/backup/now']];

describe('the gate', () => {
  test('every endpoint is 401 without the admin secret, and nothing runs', async () => {
    for (const [m, p] of ENDPOINTS) { const r = await server.request(m, p, m === 'POST' ? {} : undefined); assert.equal(r.status, 401, `${m} ${p}`); }
    assert.equal(state.saved.length, 0); assert.equal(pool.log.length, 0);
  });
  test('hosted mode (a Postgres server): every endpoint is 503 with the pg_dump sentence', async () => {
    state.embedded = false;
    for (const [m, p] of ENDPOINTS) { const r = await server.request(m, p, m === 'POST' ? {} : undefined, H); assert.equal(r.status, 503, `${m} ${p}`); assert.equal(r.body.error, PG_DUMP_MSG); }
  });
});

describe('GET /backup — the download', () => {
  test('streams the archive as an attachment, uncacheable', async () => {
    const res = await fetch(`${server.base}/api/admin/backup`, { headers: H });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/gzip');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="crm-backup-2026-10-12-100000.tar.gz"');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'GZBYTES');
  });
  test('while another backup is being written → 409 JSON', async () => {
    state.busy = true;
    const r = await server.request('GET', '/api/admin/backup', undefined, H);
    assert.equal(r.status, 409); assert.match(r.body.error, /already being written/);
  });
  test('a failing snapshot → 500 JSON, and the server keeps answering', async () => {
    state.createThrows = new Error('wasm says no');
    const r = await server.request('GET', '/api/admin/backup', undefined, H);
    assert.equal(r.status, 500); assert.equal(r.body.error, 'Internal server error');
    state.createThrows = null;
    assert.equal((await server.request('GET', '/api/admin/backup/list', undefined, H)).status, 200);
  });
});

describe('GET /backup/list and POST /backup/now', () => {
  test('the list carries folder, retention, scheduler state and the archives', async () => {
    const r = await server.request('GET', '/api/admin/backup/list', undefined, H);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { dir: '/srv/crm/backups', keep: 14, schedulerEnabled: true, busy: false, scheduler: { enabled: true, running: false, lastRunAt: null, lastSaved: null, lastError: null }, backups: [{ name: 'crm-backup-2026-10-12.tar.gz', size: 1234, createdAt: '2026-10-12T09:00:00.000Z' }] });
  });
  test('save now writes through utils/backup.js with the live database and the pool, answers name/size/pruned', async () => {
    const r = await server.request('POST', '/api/admin/backup/now', {}, H);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, backup: { name: 'crm-backup-2026-10-12-100000.tar.gz', size: 2048, createdAt: '2026-10-12T10:00:00.000Z' }, pruned: ['crm-backup-2026-09-01.tar.gz'] });
    assert.equal(state.saved.length, 1); assert.equal(state.saved[0].db, fakeDb); assert.equal(state.saved[0].pool, pool);
  });
  test('save now while busy → 409', async () => {
    state.busy = true;
    const r = await server.request('POST', '/api/admin/backup/now', {}, H);
    assert.equal(r.status, 409); assert.equal(state.saved.length, 0);
  });
});
