// ROUTE tests for /files (routes/files.js) with the REAL local storage backend on a temp
// DATA_DIR and a fake pool for the two row lookups. Real HTTP, real bytes back.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const http = require('http');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');
const { createFakePool } = require('../helpers/fake-pool');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-files-route-'));
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) delete process.env[k];
process.env.DATA_DIR = TMP;
for (const f of ['embedded.js', 'storage.js']) delete require.cache[path.join(ROOT, f)];
const storage = require(path.join(ROOT, 'storage.js'));

const docs = new Map(), atts = new Map();
const pool = createFakePool([
  { match: /^SELECT file_name, file_type FROM contact_documents WHERE storage_path=\$1$/, reply: p => ({ rows: docs.has(p[0]) ? [docs.get(p[0])] : [] }) },
  { match: /^SELECT file_name, file_type FROM task_attachments WHERE storage_path=\$1 AND workspace_id=\$2$/,
    reply: p => ({ rows: atts.has(p[0]) && atts.get(p[0]).workspace_id === p[1] ? [atts.get(p[0])] : [] }) },
]);

// Raw http.request: it sends the path VERBATIM. fetch() would collapse "%2e%2e" and ".." before
// the request leaves, so a traversal test through it never reaches the route.
function raw(base, urlPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    http.get({ host: u.hostname, port: u.port, path: urlPath }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(res.headers), body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

describe('GET /files/documents/* — signed, sessionless', () => {
  let s, storagePath, url;
  const pdf = Buffer.from('%PDF-1.4 Vertrag');
  before(async () => {
    s = await serve({ '/files': loadRoute('files.js', { pool, user: { id: 1, workspaceId: 7, role: 'member' } }) });
    ({ storagePath } = await storage.uploadDocument(7, 55, pdf, 'Vertrag Müller.pdf', 'application/pdf'));
    docs.set(storagePath, { file_name: 'Vertrag Müller.pdf', file_type: 'application/pdf' });
    url = await storage.signedDocumentUrl(storagePath, 600);
  });
  after(async () => { await s.close(); });

  test('a valid link streams the bytes with the stored name and type, uncacheable', async () => {
    const r = await raw(s.base, url);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, pdf);
    assert.match(r.headers.get('content-type'), /^application\/pdf/);
    assert.equal(r.headers.get('content-disposition'), `inline; filename="Vertrag M_ller.pdf"; filename*=UTF-8''Vertrag%20M%C3%BCller.pdf`);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    const q = pool.find(/FROM contact_documents/); assert.deepEqual(q.params, [storagePath]);
  });
  test('a tampered signature, a stretched expiry or no signature → 403, and the row is never looked up', async () => {
    pool.reset();
    const [p, qs] = url.split('?');
    const params = new URLSearchParams(qs);
    const exp = params.get('exp'), sig = params.get('sig');
    assert.equal((await raw(s.base, `${p}?exp=${exp}&sig=${sig.slice(0, -2)}xx`)).status, 403);
    assert.equal((await raw(s.base, `${p}?exp=${Number(exp) + 3600}&sig=${sig}`)).status, 403);
    assert.equal((await raw(s.base, `${p}?exp=${exp}`)).status, 403);
    assert.equal((await raw(s.base, p)).status, 403);
    assert.equal(pool.some(/FROM contact_documents/), false);
  });
  test('a correctly signed link to a path with no row → 404; a row whose file is gone → 404', async () => {
    const ghost = await storage.signedDocumentUrl('7/55/1700000000000-nothing.pdf', 60);
    assert.equal((await raw(s.base, ghost)).status, 404);
    docs.set('7/55/1700000000001-gone.pdf', { file_name: 'gone.pdf', file_type: 'application/pdf' });
    assert.equal((await raw(s.base, await storage.signedDocumentUrl('7/55/1700000000001-gone.pdf', 60))).status, 404);
  });
  test('a traversal in the path — encoded or not — → 404, never a file, before any signature or row check', async () => {
    pool.reset();
    for (const p of ['/files/documents/7/%2e%2e/secrets.json', '/files/documents/7/../secrets.json', '/files/documents/../../secrets.json', '/files/documents/secrets.json', '/files/documents/7/55/x/y']) {
      const r = await raw(s.base, `${p}?exp=9999999999&sig=x`);
      assert.equal(r.status, 404, p);
      assert.doesNotMatch(r.body.toString(), /sessionSecret/);
    }
    assert.equal(pool.some(/FROM contact_documents/), false);
  });
});

describe('GET /files/task-attachments/* — session + same workspace', () => {
  let s7, s8, storagePath, publicUrl;
  const txt = Buffer.from('meeting notes');
  before(async () => {
    s7 = await serve({ '/files': loadRoute('files.js', { pool, user: { id: 1, workspaceId: 7, role: 'member' } }) });
    s8 = await serve({ '/files': loadRoute('files.js', { pool, user: { id: 2, workspaceId: 8, role: 'owner' } }) });
    ({ publicUrl, storagePath } = await storage.uploadFile(7, 12, txt, 'notes.txt', 'text/plain'));
    atts.set(storagePath, { workspace_id: 7, file_name: 'notes.txt', file_type: 'text/plain' });
  });
  after(async () => { await s7.close(); await s8.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

  test('the uploader\'s workspace gets the file', async () => {
    const r = await raw(s7.base, publicUrl);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, txt);
    assert.match(r.headers.get('content-type'), /^text\/plain/);
    assert.equal(r.headers.get('content-disposition'), `inline; filename="notes.txt"; filename*=UTF-8''notes.txt`);
    assert.deepEqual(pool.find(/FROM task_attachments/).params, [storagePath, 7]);
  });
  test('another workspace gets 404 before any lookup — the path prefix is the first check', async () => {
    pool.reset();
    assert.equal((await raw(s8.base, publicUrl)).status, 404);
    assert.equal(pool.some(/FROM task_attachments/), false);
  });
  test('a path the row does not know → 404; a traversal → 404', async () => {
    assert.equal((await raw(s7.base, '/files/task-attachments/7/12/1700000000000-unknown.bin')).status, 404);
    assert.equal((await raw(s7.base, '/files/task-attachments/7/%2e%2e/%2e%2e/secrets.json')).status, 404);
  });
});
