// CLIENT tests for the Drive file UI inside the CRM (public/js/drive.js): the
// pure helpers, the row markup's escaping rules, the status line, the section
// markup, and the wiring into the contact detail and the deal contact panel.
// The files window itself is covered in drive-window.test.js.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadFns, read, sliceFn } = require('../helpers/client-fn');

const STUBS = "\nfunction t(k) { return k; }\nfunction esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }";
const F = loadFns('public/js/drive.js', ['parseDriveFolderId', 'driveFolderUrl', 'driveEmbedUrl', 'driveKindIcon', 'driveFmtSize', 'driveStatusText', 'driveFileRow', 'driveSectionHtml'],
  { extra: "const DRIVE_FOLDER_ID_RE = /^[A-Za-z0-9_-]{10,}$/; const DRIVE_KIND_ICON = { folder: 'F', image: 'I', pdf: 'P', file: 'X' }; const DRIVE_ERROR_KEYS = { not_public: 'drive_not_public', timeout: 'drive_timeout', upstream: 'drive_upstream', not_configured: 'drive_not_configured' };" + STUBS });
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123';

describe('pure helpers', () => {
  test('parseDriveFolderId mirrors the server rules; URLs from the id only', () => {
    assert.equal(F.parseDriveFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`), ID);
    assert.equal(F.parseDriveFolderId(`https://drive.google.com/open?id=${ID}`), ID);
    assert.equal(F.parseDriveFolderId(ID), ID);
    assert.equal(F.parseDriveFolderId('https://evil.example/folders/' + ID), null);
    assert.equal(F.parseDriveFolderId('javascript:alert(1)'), null);
    assert.equal(F.driveFolderUrl(ID), `https://drive.google.com/drive/folders/${ID}`);
    assert.equal(F.driveEmbedUrl(ID), `https://drive.google.com/embeddedfolderview?id=${ID}#list`);
  });
  test('sizes and icons', () => {
    assert.equal(F.driveFmtSize(null), ''); assert.equal(F.driveFmtSize(512), '512 B'); assert.equal(F.driveFmtSize(1536), '1.5 KB'); assert.equal(F.driveFmtSize('2097152'), '2.0 MB');
    assert.equal(F.driveKindIcon('pdf'), 'P'); assert.equal(F.driveKindIcon('unknown'), 'X');
  });
  test('status line: error keys win, then "key missing", then last sync, then never', () => {
    assert.equal(F.driveStatusText({ sync_error: 'not_public', configured: true }), 'drive_not_public');
    assert.equal(F.driveStatusText({ sync_error: 'weird', configured: true }), 'drive_upstream');
    assert.equal(F.driveStatusText({ configured: false, synced_at: 't' }), 'drive_not_configured');
    assert.equal(F.driveStatusText({ configured: true, synced_at: '2026-09-22' }), 'drive_synced_at 2026-09-22');
    assert.equal(F.driveStatusText({ configured: true, synced_at: null }), 'drive_never_synced');
  });
});

describe('driveFileRow', () => {
  const row = F.driveFileRow({ id: 'f1', name: `Ang"ebot <b>1</b>.pdf`, kind: 'pdf', size: 10, modified_at: '2026-09-01', previewable: true, preview_url: 'https://drive.google.com/file/d/f1/preview', open_url: 'https://drive.google.com/file/d/f1/view' }, 60);
  test('the whole name, escaped, never inside an inline JavaScript string; Preview carries url + name as data attributes; no size or date', () => {
    assert.ok(row.includes('<span class="drive-file-name">Ang&quot;ebot &lt;b&gt;1&lt;/b&gt;.pdf</span>'), 'escaped full name, no title/ellipsis');
    assert.equal(row.includes('<b>1</b>'), false);
    assert.match(row, /data-preview="https:\/\/drive\.google\.com\/file\/d\/f1\/preview" data-open="https:\/\/drive\.google\.com\/file\/d\/f1\/view" data-name="Ang&quot;ebot &lt;b&gt;1&lt;\/b&gt;\.pdf" onclick="openDrivePreview\(this\)"/);
    assert.doesNotMatch(row, /onclick="[^"]*Ang/, 'name not in an onclick');
    assert.match(row, /<a class="btn btn-sm btn-ghost" href="https:\/\/drive\.google\.com\/file\/d\/f1\/view" target="_blank" rel="noopener">drive_open<\/a>/);
    for (const s of ['drive-file-size', 'drive-file-date', '10 B', '2026']) assert.equal(row.includes(s), false, `no ${s}`);
  });
  test('a non-previewable file (folder, zip) gets only the Open link', () => {
    const r = F.driveFileRow({ id: 'z', name: 'a.zip', kind: 'file', previewable: false, preview_url: null, open_url: 'https://drive.google.com/file/d/z/view' }, 60);
    assert.equal(r.includes('openDrivePreview'), false);
    assert.ok(r.includes('drive_open'));
  });
});

describe('driveSectionHtml', () => {
  test('with a folder: prefilled link, Save, Open, Files window, status line + Sync, and the list container', () => {
    const html = F.driveSectionHtml(60, `https://drive.google.com/drive/folders/${ID}?usp=sharing`, 'detail');
    assert.match(html, new RegExp(`id="drive-folder-detail-60" value="https://drive\\.google\\.com/drive/folders/${ID}"`));
    assert.match(html, /onclick="saveDriveFolder\(60, 'detail'\)"/);
    assert.match(html, /data-contact="60" onclick="openDriveWindow\(this\.dataset\.contact\)">drive_files_window</);
    assert.match(html, /id="drive-status-detail-60"/);
    assert.match(html, /id="drive-sync-detail-60" onclick="syncDriveFiles\(60, 'detail'\)"/);
    assert.match(html, /id="drive-files-detail-60"/);
    assert.equal(html.includes('<iframe'), false);
    assert.equal(html.includes('data-embed'), false, 'no embedded-view popup any more');
  });
  test('without a folder: the hint only — no list, no Sync, no links', () => {
    const html = F.driveSectionHtml(60, null, 'deal');
    assert.ok(html.includes('drive_no_folder'));
    for (const s of ['drive-files-deal-60', 'drive-sync-deal-60', 'drive_open_folder', 'openDriveWindow']) assert.equal(html.includes(s), false, s);
  });
  test('an untrusted stored value is treated as none (nothing reaches src/href)', () => {
    const html = F.driveSectionHtml(60, 'https://evil.example/"><script>', 'detail');
    assert.equal(html.includes('evil.example'), false);
    assert.equal(html.includes('drive-files-detail-60'), false);
  });
});

describe('wiring', () => {
  const html = read('public/index.html'), modals = read('public/js/modals.js'), drive = read('public/js/drive.js');
  test('drive.js is loaded after contacts.js and before onboarding.js', () => {
    const c = html.indexOf('<script src="js/contacts.js">'), d = html.indexOf('<script src="js/drive.js">'), o = html.indexOf('<script src="js/onboarding.js">');
    assert.ok(c > 0 && d > c && o > d);
  });
  test('the contact detail and the deal contact panel render the section and load the stored list', () => {
    assert.match(sliceFn(modals, 'buildDetailHTML', 'modals.js'), /driveSectionHtml\(id, c\.drive_ordner_id, 'detail'\)/);
    assert.match(sliceFn(modals, 'openDetail', 'modals.js'), /loadDriveFiles\(id, 'detail'\)/);
    const panel = sliceFn(modals, 'renderContactPanelReadOnly', 'modals.js');
    assert.match(panel, /driveSectionHtml\(full\.id, full\.drive_ordner_id, 'deal'\)/);
    assert.match(panel, /loadDriveFiles\(full\.id, 'deal'\)/);
  });
  test('load and sync call the two endpoints and pass the contact id into every row', () => {
    assert.match(sliceFn(drive, 'loadDriveFiles', 'drive.js'), /api\.get\(`\/api\/contacts\/\$\{contactId\}\/drive-files`\)/);
    assert.match(sliceFn(drive, 'syncDriveFiles', 'drive.js'), /api\.post\(`\/api\/contacts\/\$\{contactId\}\/drive-sync`, \{\}\)/);
    assert.match(sliceFn(drive, 'renderDriveFiles', 'drive.js'), /files\.map\(f => driveFileRow\(f, contactId\)\)/);
  });
  test('Preview opens the in-page popup (an iframe of Google\'s viewer), not a window; Close unloads the viewer', () => {
    const open = sliceFn(drive, 'openDrivePreview', 'drive.js');
    assert.match(open, /btn\?\.dataset\?\.preview/);
    assert.match(open, /DRIVE_PREVIEW_URL_RE\.test\(url\)/);
    assert.match(open, /getElementById\('drive-preview-modal'\)/);
    assert.match(open, /frame\.src = url/);
    assert.equal(open.includes('window.open'), false);
    assert.match(sliceFn(drive, 'closeDrivePreview', 'drive.js'), /frame\.removeAttribute\('src'\)/);
    assert.match(drive, /const DRIVE_PREVIEW_URL_RE = \/\^https:\\\/\\\/\(drive\|docs\)\\\.google\\\.com\\\/\//);
    const modal = html.slice(html.indexOf('id="drive-preview-modal"'), html.indexOf('id="import-modal"'));
    assert.match(modal, /<iframe id="drive-preview-frame" class="drive-preview-frame"/);
    assert.match(modal, /id="drive-preview-title"/);
    assert.match(modal, /id="drive-preview-open"[^>]*target="_blank" rel="noopener"/);
    assert.match(modal, /onclick="closeDrivePreview\(\)"/);
    assert.equal(/<iframe[^>]*src=/.test(modal), false, 'the frame starts empty');
  });
  test('saving a folder PATCHes the scoped endpoint and re-renders the calling context', () => {
    const fn = sliceFn(drive, 'saveDriveFolder', 'drive.js');
    assert.match(fn, /api\.patch\(`\/api\/contacts\/\$\{contactId\}\/drive-folder`, \{ drive_ordner_id: raw \|\| null \}\)/);
    assert.match(fn, /ctx === 'deal'\) await renderContactPanelReadOnly\(\{ id: contactId \}\)/);
  });
});
