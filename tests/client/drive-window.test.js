// CLIENT tests for the Drive files window (public/drive.html +
// public/js/drive-window.js): the pure helpers, the dictionary, the page's
// static wiring, and how the CRM opens the window.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns, sliceConst, read, sliceFn } = require('../helpers/client-fn');

const EXTRA = [sliceConst('public/js/drive-window.js', 'DW_I18N'), sliceConst('public/js/drive-window.js', 'DW_KIND_ICON'), sliceConst('public/js/drive-window.js', 'DW_ERROR_KEYS'),
  'const localStorage = { getItem: () => null };'].join('\n');
const F = loadFns('public/js/drive-window.js', ['dwLang', 'dwT', 'dwEsc', 'dwParams', 'dwFilterSort', 'dwFmtSize', 'dwFmtDate', 'dwTile', 'dwStatusText', 'dwPreviewSrc'], { extra: EXTRA });
const { en, de } = new Function(sliceConst('public/js/drive-window.js', 'DW_I18N') + '\nreturn DW_I18N;')();

describe('dictionary', () => {
  test('en and de have the same keys and only non-empty strings', () => {
    assert.deepEqual(Object.keys(en).filter(k => !(k in de)), []);
    assert.deepEqual(Object.keys(de).filter(k => !(k in en)), []);
    for (const d of [en, de]) for (const [k, v] of Object.entries(d)) assert.ok(typeof v === 'string' && v.trim(), k);
    assert.equal(F.dwT('sync'), 'Sync'); assert.equal(F.dwT('nope'), 'nope');
  });
});

describe('dwParams', () => {
  test('contact must be a positive integer, file a Drive id; anything else is null', () => {
    assert.deepEqual(F.dwParams('?contact=60&file=1AbC_-x'), { contact: 60, file: '1AbC_-x' });
    assert.deepEqual(F.dwParams('?contact=60'), { contact: 60, file: null });
    for (const s of ['', '?contact=abc', '?contact=-1', '?contact=1.5', '?contact=0']) assert.equal(F.dwParams(s).contact, null, s);
    assert.equal(F.dwParams('?contact=1&file=bad id').file, null);
    assert.equal(F.dwParams('?contact=1&file=<script>').file, null);
  });
});

describe('dwFilterSort', () => {
  const FILES = [
    { id: 'b', name: 'beta.pdf', kind: 'pdf', modified_at: '2026-09-01' },
    { id: 'f', name: 'Unterordner', kind: 'folder', is_folder: true, modified_at: '2026-01-01' },
    { id: 'a', name: 'Alpha.png', kind: 'image', modified_at: '2026-09-20' },
  ];
  test('folders first, then case-insensitive name order; date sort newest first; search; no mutation', () => {
    assert.deepEqual(F.dwFilterSort(FILES, '').map(f => f.id), ['f', 'a', 'b']);
    assert.deepEqual(F.dwFilterSort(FILES, '', { sort: 'date' }).map(f => f.id), ['f', 'a', 'b']);
    assert.deepEqual(F.dwFilterSort(FILES, 'ALPHA').map(f => f.id), ['a']);
    assert.deepEqual(F.dwFilterSort(FILES, 'zzz'), []);
    assert.deepEqual(FILES.map(f => f.id), ['b', 'f', 'a'], 'input untouched');
    assert.deepEqual(F.dwFilterSort(null, ''), []);
  });
});

describe('dwTile / status / preview source', () => {
  test('the tile escapes the name, carries only the validated id, and marks selection', () => {
    const html = F.dwTile({ id: 'f1', name: `Ang"ebot <b>1</b>.pdf`, kind: 'pdf', size: 1536 }, true);
    assert.ok(html.includes('Ang&quot;ebot &lt;b&gt;1&lt;/b&gt;.pdf'));
    assert.equal(html.includes('<b>1</b>'), false);
    assert.match(html, /class="dw-tile selected" role="option" tabindex="0" aria-selected="true" data-id="f1"/);
    assert.equal(html.includes('onclick'), false, 'no inline JS');
    for (const s of ['1.5 KB', 'dw-tile-meta', 'title=']) assert.equal(html.includes(s), false, `the whole name only, no ${s}`);
    assert.match(F.dwTile({ id: 'x"y', name: 'n', kind: 'file' }, false), /data-id=""/, 'bad id -> empty data attribute');
  });
  test('status: error keys win, then key missing, then last sync, then never', () => {
    assert.equal(F.dwStatusText({ sync_error: 'not_public' }), en.not_public);
    assert.equal(F.dwStatusText({ sync_error: 'weird' }), en.upstream);
    assert.equal(F.dwStatusText({ configured: false }), en.not_configured);
    assert.match(F.dwStatusText({ configured: true, synced_at: '2026-09-22T09:00:00Z' }), /^Synced /);
    assert.equal(F.dwStatusText({ configured: true }), en.not_synced);
  });
  test('the iframe source is Google\'s preview page only', () => {
    assert.equal(F.dwPreviewSrc({ previewable: true, preview_url: 'https://drive.google.com/file/d/x/preview' }), 'https://drive.google.com/file/d/x/preview');
    assert.equal(F.dwPreviewSrc({ previewable: true, preview_url: 'https://docs.google.com/document/d/x/preview' }), 'https://docs.google.com/document/d/x/preview');
    assert.equal(F.dwPreviewSrc({ previewable: true, preview_url: 'https://evil.example/x' }), null);
    assert.equal(F.dwPreviewSrc({ previewable: false, preview_url: 'https://drive.google.com/file/d/x/preview' }), null);
    assert.equal(F.dwPreviewSrc(null), null);
  });
});

describe('wiring', () => {
  const page = read('public/drive.html'), drive = read('public/js/drive.js');
  test('drive.html uses the CRM stylesheet and the window script, has every id the script touches, and no inline script', () => {
    assert.match(page, /<link rel="stylesheet" href="style\.css" \/>/);
    assert.match(page, /<script src="js\/drive-window\.js" defer><\/script>/);
    assert.equal((page.match(/<script(?![^>]*src=)/g) || []).length, 0, 'no inline script');
    for (const id of ['dw-title', 'dw-status', 'dw-search', 'dw-sync', 'dw-open-drive', 'dw-view-icons', 'dw-view-list', 'dw-grid', 'dw-empty', 'dw-empty-title', 'dw-empty-hint', 'dw-empty-link', 'dw-preview-name', 'dw-preview-meta', 'dw-preview-open', 'dw-preview-close', 'dw-preview-hint', 'dw-frame']) {
      assert.ok(page.includes(`id="${id}"`), id);
    }
    assert.match(page, /<iframe id="dw-frame"[^>]*class="dw-frame hidden"/, 'the preview frame starts empty and hidden');
  });
  test('the CRM opens the files window from validated ids (Files window button); row Preview uses the in-page popup instead; the old popups are gone', () => {
    const open = sliceFn(drive, 'openDriveWindow', 'drive.js');
    assert.match(open, /if \(!Number\.isInteger\(cid\) \|\| cid <= 0\) return;/);
    assert.match(open, /\/\^\[A-Za-z0-9_-\]\+\$\/\.test\(String\(fileId\)\)/);
    assert.match(open, /`\/drive\.html\?contact=\$\{cid\}\$\{fid \? `&file=\$\{fid\}` : ''\}`/);
    assert.match(open, /window\.open\(url, `crm-drive-\$\{cid\}`, 'popup=yes/);
    assert.match(sliceFn(drive, 'driveSectionHtml', 'drive.js'), /onclick="openDriveWindow\(this\.dataset\.contact\)"/);
    assert.equal(sliceFn(drive, 'openDrivePreview', 'drive.js').includes('openDriveWindow'), false, 'Preview does not open a window');
    assert.equal(drive.includes('openDriveFolderPopup'), false);
    assert.equal(drive.includes('embeddedfolderview?id=${id}#list'), true, 'embed URL helper kept for the API response');
  });
  test('the production CSP still frames drive.google.com and docs.google.com (the preview iframe inside the window)', () => {
    assert.match(read('server.js'), /frameSrc:\s*\["https:\/\/docs\.google\.com", "https:\/\/drive\.google\.com"\]/);
  });
});
