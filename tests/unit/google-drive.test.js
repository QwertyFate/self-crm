// UNIT tests for utils/google-drive.js — folder-id parsing, the file shape
// with its preview/open URLs (from Google's shape and from our table row),
// and the API-key client with a fake fetch (pagination, cache, errors).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('../helpers/load-route');

const abs = path.join(ROOT, 'utils', 'google-drive.js'); delete require.cache[abs];
const D = require(abs);
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123';

describe('parseDriveFolderId', () => {
  test('bare id and every folder link shape Drive hands out', () => {
    for (const s of [ID, `  ${ID} `, `https://drive.google.com/drive/folders/${ID}`, `https://drive.google.com/drive/folders/${ID}?usp=sharing`,
      `https://drive.google.com/drive/u/0/folders/${ID}`, `https://drive.google.com/open?id=${ID}`, `https://drive.google.com/drive/folderview?id=${ID}&usp=x`]) {
      assert.equal(D.parseDriveFolderId(s), ID, s);
    }
  });
  test('anything else is null', () => {
    for (const s of ['', '   ', null, undefined, 42, 'short', 'javascript:alert(1)', `http://drive.google.com/drive/folders/${ID}`,
      `https://evil.example/drive/folders/${ID}`, 'https://drive.google.com/file/d/xyz/view', 'https://drive.google.com/open?id=bad id']) {
      assert.equal(D.parseDriveFolderId(s), null, String(s));
    }
  });
  test('folderUrl / embedUrl are built from the id only', () => {
    assert.equal(D.folderUrl(ID), `https://drive.google.com/drive/folders/${ID}`);
    assert.equal(D.embedUrl(ID), `https://drive.google.com/embeddedfolderview?id=${ID}#list`);
  });
});

describe('describeFile', () => {
  const g = (mimeType, extra = {}) => D.describeFile({ id: 'f1', name: 'x', mimeType, size: '2048', modifiedTime: 't', ...extra });
  test("images, PDFs and Office files preview in Google's viewer; open goes to the file", () => {
    for (const [mime, kind] of [['image/png', 'image'], ['application/pdf', 'pdf'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc'], ['application/vnd.ms-excel', 'sheet']]) {
      const f = g(mime);
      assert.equal(f.kind, kind, mime);
      assert.equal(f.previewable, true);
      assert.equal(f.preview_url, 'https://drive.google.com/file/d/f1/preview');
      assert.equal(f.open_url, 'https://drive.google.com/file/d/f1/view');
      assert.equal(f.size, 2048);
    }
  });
  test('Google Docs types preview and open on docs.google.com', () => {
    const f = g('application/vnd.google-apps.document');
    assert.equal(f.kind, 'gdoc');
    assert.equal(f.preview_url, 'https://docs.google.com/document/d/f1/preview');
    assert.equal(f.open_url, 'https://docs.google.com/document/d/f1/edit');
  });
  test('folders open in Drive and have no preview; unknown types open only', () => {
    const folder = g(D.FOLDER_MIME);
    assert.deepEqual([folder.is_folder, folder.previewable, folder.preview_url, folder.open_url], [true, false, null, 'https://drive.google.com/drive/folders/f1']);
    const zip = g('application/zip');
    assert.deepEqual([zip.kind, zip.previewable, zip.open_url], ['file', false, 'https://drive.google.com/file/d/f1/view']);
  });
  test('our table row shape (file_id, mime_type, modified_at) gives the same result', () => {
    const row = D.describeFile({ file_id: 'f1', name: 'x', mime_type: 'application/pdf', size: 2048, modified_at: 't' });
    assert.deepEqual(row, g('application/pdf'));
  });
  test('an id with unexpected characters produces no URLs at all; nothing Google sends as a link is used', () => {
    const f = D.describeFile({ id: 'f1"><script>', name: 'n', mimeType: 'image/png', webViewLink: 'https://evil.example' });
    assert.deepEqual([f.id, f.preview_url, f.open_url, f.previewable], [null, null, null, false]);
    assert.equal(JSON.stringify(f).includes('evil'), false);
  });
});

describe('createDriveClient', () => {
  const FILES = [{ id: 'a1', name: 'Vertrag.pdf', mimeType: 'application/pdf', size: '10' }, { id: 'b2', name: 'sub', mimeType: D.FOLDER_MIME }];
  function fakeFetch(seq) { const calls = []; const fn = async (url, opts) => { calls.push({ url, opts }); const r = seq.shift(); if (r instanceof Error) throw r; return r; }; fn.calls = calls; return fn; }
  const ok = (files, nextPageToken) => ({ ok: true, status: 200, json: async () => ({ files, ...(nextPageToken ? { nextPageToken } : {}) }) });

  test('not configured -> drive_not_configured before any request', async () => {
    const fetch = fakeFetch([]);
    const c = D.createDriveClient({ apiKey: '', fetch });
    assert.equal(c.configured, false);
    await assert.rejects(c.listFolder(ID), e => e.code === 'not_configured');
    assert.equal(fetch.calls.length, 0);
  });
  test('the request carries the folder query, the field list, the key and a timeout signal; raw files come back', async () => {
    const fetch = fakeFetch([ok(FILES)]);
    const c = D.createDriveClient({ apiKey: 'K-1', fetch });
    const files = await c.listFolder(ID);
    const { url, opts } = fetch.calls[0];
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, 'https://www.googleapis.com/drive/v3/files');
    assert.equal(u.searchParams.get('q'), `'${ID}' in parents and trashed=false`);
    assert.equal(u.searchParams.get('key'), 'K-1');
    assert.equal(u.searchParams.get('fields'), 'nextPageToken,files(id,name,mimeType,size,modifiedTime)');
    assert.equal(u.searchParams.get('pageSize'), '200');
    assert.ok(opts.signal instanceof AbortSignal, 'timeout signal');
    assert.deepEqual(files, FILES);
  });
  test('pages are followed through nextPageToken and joined; the token goes on the next request only', async () => {
    const fetch = fakeFetch([ok([FILES[0]], 'tok-2'), ok([FILES[1]])]);
    const c = D.createDriveClient({ apiKey: 'K', fetch });
    const files = await c.listFolder(ID);
    assert.deepEqual(files.map(f => f.id), ['a1', 'b2']);
    assert.equal(new URL(fetch.calls[0].url).searchParams.get('pageToken'), null);
    assert.equal(new URL(fetch.calls[1].url).searchParams.get('pageToken'), 'tok-2');
  });
  test('paging stops at maxPages', async () => {
    const fetch = fakeFetch([ok([FILES[0]], 't1'), ok([FILES[0]], 't2'), ok([FILES[0]], 't3')]);
    const c = D.createDriveClient({ apiKey: 'K', fetch, maxPages: 2 });
    assert.equal((await c.listFolder(ID)).length, 2);
    assert.equal(fetch.calls.length, 2);
  });
  test('a second call within the TTL is served from cache; after the TTL it fetches again', async () => {
    let t = 1_000; const fetch = fakeFetch([ok(FILES), ok([])]);
    const c = D.createDriveClient({ apiKey: 'K', fetch, now: () => t, ttlMs: 60_000 });
    await c.listFolder(ID); await c.listFolder(ID);
    assert.equal(fetch.calls.length, 1, 'cached');
    t += 60_001;
    assert.deepEqual(await c.listFolder(ID), []);
    assert.equal(fetch.calls.length, 2);
  });
  test('404 -> not_public, other non-2xx -> upstream with the status, timeout -> timeout, network error -> upstream', async () => {
    const c = D.createDriveClient({ apiKey: 'K', fetch: fakeFetch([{ ok: false, status: 404 }, { ok: false, status: 403 }, Object.assign(new Error('t'), { name: 'TimeoutError' }), new Error('ECONNRESET')]) });
    await assert.rejects(c.listFolder(ID), e => e.code === 'not_public' && e.status === 404);
    await assert.rejects(c.listFolder(ID), e => e.code === 'upstream' && e.status === 403);
    await assert.rejects(c.listFolder(ID), e => e.code === 'timeout');
    await assert.rejects(c.listFolder(ID), e => e.code === 'upstream');
  });
  test('an invalid folder id never reaches the network', async () => {
    const fetch = fakeFetch([]);
    const c = D.createDriveClient({ apiKey: 'K', fetch });
    await assert.rejects(c.listFolder("x' or 1=1"), e => e.code === 'invalid_folder');
    assert.equal(fetch.calls.length, 0);
  });
});
