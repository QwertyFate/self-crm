// CLIENT (static + pure-function) tests for the Documents tab on the contact
// detail (public/js/detail-views.js): the tab, the panel markup, the multipart
// upload, delete with confirm, the dictionary in both languages, and dvFileSize.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const { read, sliceFn, sliceConst, loadFns } = require('../helpers/client-fn');
const { ROOT } = require('../helpers/load-route');

const dv   = read('public/js/detail-views.js');
const dict = new Function(sliceConst('public/js/core.js', 'TRANSLATIONS').replace(/^[^{]*/, 'return '))();
const openContact = sliceFn(dv, 'openContactDetail', 'detail-views.js');
const F = loadFns('public/js/detail-views.js', ['dvFileSize'], {});

describe('files parse', () => {
  test('node --check detail-views.js and core.js', () => {
    for (const f of ['public/js/detail-views.js', 'public/js/core.js']) execFileSync(process.execPath, ['--check', path.join(ROOT, f)]);
  });
});

describe('the Documents tab', () => {
  test('documents are loaded with the contact and kept in state; the tab, its count and its panel are wired', () => {
    assert.match(openContact, /api\.get\(`\/api\/contacts\/\$\{id\}\/documents`\)\]\)/, 'loaded in the same Promise.all as deals and tasks');
    assert.match(openContact, /docs: Array\.isArray\(contactDocs\) \? contactDocs : \[\]/);
    assert.match(openContact, /documents: S\.docs\.length/);
    assert.match(openContact, /documents: t\('dv_tab_documents'\)/);
    assert.match(openContact, /documents: documentsPanel/);
    assert.match(openContact, /S\.tab === 'documents' \? '' : 'ct-panel'/, 'full-bleed like deals and tasks');
  });
  test('the panel: type select over the three server kinds, hidden file input, upload button, per-document row with download link, size, date, type badge and delete', () => {
    assert.match(dv, /const DV_DOC_TYPES = \['vertrag', 'aufnahme', 'sonstiges'\];/);
    assert.match(openContact, /<select class="select select-sm" id="ct-doctype" aria-label="\$\{esc\(t\('dv_doc_type_aria'\)\)\}">\$\{DV_DOC_TYPES\.map/);
    assert.match(openContact, /<input type="file" id="ct-docfile" class="hidden"/);
    assert.match(openContact, /data-act="doc-upload"/);
    assert.match(openContact, /href="\/api\/contacts\/\$\{id\}\/documents\/\$\{Number\(d\.id\)\}\/download" target="_blank" rel="noopener"/);
    assert.match(openContact, /dvFileSize\(d\.file_size\)/); assert.match(openContact, /fmtDate\(d\.created_at\)/);
    assert.match(openContact, /t\('dv_doc_type_' \+ typ\)/);
    assert.match(openContact, /data-act="doc-del" data-id="\$\{Number\(d\.id\)\}"/);
    assert.match(openContact, /dvEmpty\('paperclip', t\('dv_no_docs'\), t\('dv_docs_hint'\)/);
    assert.match(openContact, /dvPlural\(ds\.length, 'dv_one_doc', 'n_docs'\)/);
  });
  test('upload: client-side 10 MB guard, multipart POST with file + typ via fetch (not the JSON helper), refresh and toast; errors surface', () => {
    const up = openContact.slice(openContact.indexOf('async function uploadDocument'), openContact.indexOf('function sideCards'));
    assert.match(up, /file\.size > 10 \* 1024 \* 1024\) return ui\.toast\(t\('dv_doc_too_large'\)\)/);
    assert.match(up, /new FormData\(\); fd\.append\('file', file\); fd\.append\('typ', host\.querySelector\('#ct-doctype'\)\?\.value \|\| 'sonstiges'\)/);
    assert.match(up, /fetch\(`\/api\/contacts\/\$\{id\}\/documents`, \{ method: 'POST', body: fd \}\)/);
    assert.match(up, /ui\.toast\(res\?\.error \|\| tf\('core_server_error', \{ status \}\)\)/);
    assert.match(up, /ui\.toast\(t\('dv_doc_uploaded'\)\)/);
    assert.match(openContact, /on\(host, 'change', '#ct-docfile', \(e, el\) => \{ const f = el\.files && el\.files\[0\]; el\.value = ''; uploadDocument\(f\); \}\)/);
    assert.match(openContact, /'doc-upload': \(\) => host\.querySelector\('#ct-docfile'\)\?\.click\(\)/);
  });
  test('delete: danger confirm, DELETE route, local removal and toast', () => {
    const del = openContact.slice(openContact.indexOf("'doc-del':"), openContact.indexOf("'doc-del':") + 600);
    assert.match(del, /ui\.confirm\(\{ title: t\('dv_doc_delete_q'\), message: t\('dv_doc_delete_msg'\), confirmLabel: t\('btn_delete'\), danger: true \}\)/);
    assert.match(del, /api\.del\(`\/api\/contacts\/\$\{id\}\/documents\/\$\{\+el\.dataset\.id\}`\)/);
    assert.match(del, /S\.docs = S\.docs\.filter\(d => d\.id !== \+el\.dataset\.id\)/);
    assert.match(del, /ui\.toast\(t\('dv_doc_deleted'\)\)/);
  });
  test('every key exists in both dictionaries, including the run-time built type labels and the plural pair', () => {
    for (const k of ['dv_tab_documents', 'dv_doc_upload', 'dv_doc_uploading', 'dv_doc_download', 'dv_doc_type_aria', 'dv_doc_type_vertrag', 'dv_doc_type_aufnahme', 'dv_doc_type_sonstiges', 'dv_no_docs', 'dv_docs_hint', 'dv_one_doc', 'n_docs', 'dv_doc_uploaded', 'dv_doc_too_large', 'dv_doc_delete_q', 'dv_doc_delete_msg', 'dv_doc_deleted']) {
      assert.ok(k in dict.en, `en.${k}`); assert.ok(k in dict.de, `de.${k}`);
    }
    assert.match(dict.en.n_docs, /\{n\}/); assert.match(dict.de.n_docs, /\{n\}/);
    assert.equal(dict.de.dv_doc_type_vertrag, 'Vertrag'); assert.equal(dict.de.dv_doc_type_aufnahme, 'Aufnahme');
  });
});

describe('dvFileSize', () => {
  test('bytes, KB with one decimal under 10 KB, MB with one decimal', () => {
    assert.equal(F.dvFileSize(0), '0 B'); assert.equal(F.dvFileSize(13), '13 B'); assert.equal(F.dvFileSize(1023), '1023 B');
    assert.equal(F.dvFileSize(1536), '1.5 KB'); assert.equal(F.dvFileSize(20480), '20 KB');
    assert.equal(F.dvFileSize(10 * 1024 * 1024), '10.0 MB'); assert.equal(F.dvFileSize('2621440'), '2.5 MB');
    assert.equal(F.dvFileSize(null), '0 B');
  });
});
