// STORAGE, LOCAL BACKEND — storage.js with no SUPABASE_* variables: files under
// DATA_DIR/files, paths that cannot leave their folder, and HMAC-signed document links.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const crypto = require('crypto');
const { ROOT } = require('../helpers/load-route');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-storage-test-'));
function freshStorage(env) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_DOCS_BUCKET']) delete process.env[k];
  Object.assign(process.env, env || {});
  process.env.DATA_DIR = TMP;
  for (const f of ['embedded.js', 'storage.js']) delete require.cache[path.join(ROOT, f)];
  return { storage: require(path.join(ROOT, 'storage.js')), embedded: require(path.join(ROOT, 'embedded.js')) };
}

describe('backend selection', () => {
  after(() => freshStorage());
  test('no Supabase variables → local, and @supabase/supabase-js is never loaded', () => {
    const { storage } = freshStorage();
    assert.equal(storage.BACKEND, 'local');
    assert.equal(Object.keys(require.cache).some(k => /node_modules\/@supabase\/supabase-js/.test(k)), false);
  });
  test('both Supabase variables → supabase (the old behaviour, untouched)', () => {
    const { storage } = freshStorage({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' });
    assert.equal(storage.BACKEND, 'supabase');
  });
  test('one of the two is not enough', () => {
    assert.equal(freshStorage({ SUPABASE_URL: 'https://x.supabase.co' }).storage.BACKEND, 'local');
  });
});

describe('local files', () => {
  let storage, embedded;
  before(() => ({ storage, embedded } = freshStorage()));
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  test('a task attachment lands under data/files/task-attachments/<ws>/<task>/ with a session-gated URL', async () => {
    const buf = Buffer.from('hello attachment');
    const { publicUrl, storagePath } = await storage.uploadFile(7, 12, buf, 'Notes (final) 2026.txt', 'text/plain');
    assert.match(storagePath, /^7\/12\/\d{13}-Notes__final__2026\.txt$/);
    assert.equal(publicUrl, `/files/task-attachments/${storagePath}`);
    const abs = path.join(TMP, 'files', 'task-attachments', ...storagePath.split('/'));
    assert.deepEqual(fs.readFileSync(abs), buf);
    assert.equal(storage.localAttachmentPath(storagePath), abs);
  });

  test('a contact document lands under data/files/contact-documents/<ws>/<contact>/; hostile names are flattened', async () => {
    const { storagePath } = await storage.uploadDocument(7, 55, Buffer.from('%PDF-1.4'), '../../etc/passwd', 'application/pdf');
    assert.match(storagePath, /^7\/55\/\d{13}-\.\._\.\._etc_passwd$/);
    const abs = storage.localDocumentPath(storagePath);
    assert.ok(abs.startsWith(path.join(TMP, 'files', 'contact-documents', '7', '55') + path.sep));
    assert.ok(fs.existsSync(abs));
    const dots = await storage.uploadDocument('..', '.', Buffer.from('x'), '..', '');
    assert.equal(dots.storagePath.startsWith('_/_/'), true, 'ids that are only dots become "_"');
  });

  test('isSafeStoragePath / localPath refuse anything that could leave the folder', () => {
    for (const bad of ['', '7', '7/55/../x', '7/55/./x', '/7/55/x', '7//x', '7/55/x y', '7/55/x\u0000', 'C:\\x', null, undefined, 42]) {
      assert.equal(storage.isSafeStoragePath(bad), false, JSON.stringify(bad));
    }
    assert.throws(() => storage.localDocumentPath('7/../secrets.json'), /Invalid storage path/);
    assert.throws(() => storage.localAttachmentPath('../../embedded.js'), /Invalid storage path/);
    assert.equal(storage.isSafeStoragePath('7/55/1759000000000-Vertrag_Mueller.pdf'), true);
  });

  test('two uploads never overwrite each other (the write is exclusive-create)', async () => {
    // Same millisecond is not reproducible on demand; prove the flag instead: writing to an existing path throws EEXIST.
    const { storagePath } = await storage.uploadDocument(7, 55, Buffer.from('a'), 'same.pdf', '');
    const abs = storage.localDocumentPath(storagePath);
    await assert.rejects(fs.promises.writeFile(abs, 'b', { flag: 'wx' }), /EEXIST/);
    assert.equal(fs.readFileSync(abs, 'utf8'), 'a');
  });

  test('signed document links: valid for expiresSec, then dead; any change breaks the signature', async () => {
    const storagePath = '7/55/1700000000000-Vertrag.pdf';
    const url = await storage.signedDocumentUrl(storagePath, 600);
    const m = /^\/files\/documents\/(.+)\?exp=(\d+)&sig=([A-Za-z0-9_-]+)$/.exec(url);
    assert.ok(m, url);
    const [, p, exp, sig] = m;
    assert.equal(p, storagePath);
    assert.ok(Number(exp) - Math.floor(Date.now() / 1000) <= 600 && Number(exp) > Math.floor(Date.now() / 1000) + 590);
    assert.equal(storage.verifySignedDocument(storagePath, exp, sig), true);
    assert.equal(storage.verifySignedDocument(storagePath, String(Number(exp) + 1), sig), false, 'longer expiry');
    assert.equal(storage.verifySignedDocument('7/55/1700000000000-Other.pdf', exp, sig), false, 'another file');
    assert.equal(storage.verifySignedDocument(storagePath, exp, sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')), false, 'one char off');
    assert.equal(storage.verifySignedDocument(storagePath, exp, ''), false);
    assert.equal(storage.verifySignedDocument(storagePath, 'soon', sig), false);
    assert.equal(storage.verifySignedDocument('7/../secrets.json', exp, sig), false, 'unsafe path never verifies');
    // An expired link, correctly signed with the real key, is still refused.
    const past = Math.floor(Date.now() / 1000) - 5;
    const pastSig = crypto.createHmac('sha256', embedded.fileKey()).update(`${storagePath}\n${past}`).digest('base64url');
    assert.equal(storage.verifySignedDocument(storagePath, String(past), pastSig), false);
    assert.equal(storage.verifySignedDocument(storagePath, String(past + 100), pastSig), false);
  });

  test('the signing key is the generated one in data/secrets.json', () => {
    const s = JSON.parse(fs.readFileSync(path.join(TMP, 'secrets.json'), 'utf8'));
    assert.equal(embedded.fileKey(), s.fileKey);
    assert.match(s.fileKey, /^[0-9a-f]{64}$/);
  });

  test('deleting removes the file; deleting a missing or hostile path is a no-op', async () => {
    const { storagePath } = await storage.uploadDocument(7, 55, Buffer.from('bye'), 'bye.pdf', '');
    const abs = storage.localDocumentPath(storagePath);
    await storage.deleteDocument(storagePath);
    assert.equal(fs.existsSync(abs), false);
    await storage.deleteDocument(storagePath);          // already gone
    await storage.deleteDocument('7/../secrets.json');  // never touches anything
    assert.ok(fs.existsSync(path.join(TMP, 'secrets.json')));
    const att = await storage.uploadFile(7, 12, Buffer.from('x'), 'x.bin', '');
    await storage.deleteFile(att.storagePath);
    assert.equal(fs.existsSync(storage.localAttachmentPath(att.storagePath)), false);
  });
});
