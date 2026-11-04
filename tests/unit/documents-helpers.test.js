// UNIT tests for the document helpers shared by the Engine API, the webhooks and
// the CRM routes: utils/base-url.js and the document view in utils/kunde.js.
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { ROOT } = require('../helpers/load-route');
const baseUrl = require(path.join(ROOT, 'utils', 'base-url.js'));
const kunde   = require(path.join(ROOT, 'utils', 'kunde.js'));

const req = (host, protocol = 'http') => ({ protocol, get: h => (h === 'host' ? host : undefined) });
const saved = { APP_BASE_URL: process.env.APP_BASE_URL, BASE_URL: process.env.BASE_URL };
afterEach(() => { for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('baseUrl(req)', () => {
  test('from the request when nothing is configured: protocol + Host, no trailing slash', () => {
    delete process.env.APP_BASE_URL; delete process.env.BASE_URL;
    assert.equal(baseUrl(req('crm.upgrads.de', 'https')), 'https://crm.upgrads.de');
    assert.equal(baseUrl(req('127.0.0.1:3000')), 'http://127.0.0.1:3000');
  });
  test('APP_BASE_URL wins, then BASE_URL (the e-mail origin); trailing slashes are dropped; blanks are ignored', () => {
    process.env.APP_BASE_URL = 'https://crm.example/'; process.env.BASE_URL = 'https://mail.example';
    assert.equal(baseUrl(req('other')), 'https://crm.example');
    process.env.APP_BASE_URL = '   '; process.env.BASE_URL = 'https://mail.example//';
    assert.equal(baseUrl(req('other')), 'https://mail.example');
  });
  test('null without a request or a Host header (so callers send dokument_url: null instead of garbage)', () => {
    delete process.env.APP_BASE_URL; delete process.env.BASE_URL;
    assert.equal(baseUrl(null), null);
    assert.equal(baseUrl({}), null);
    assert.equal(baseUrl(req(undefined)), null);
  });
});

describe('documentUrl / dokumentView / DOCUMENT_TYPES', () => {
  const row = { id: '9', typ: 'vertrag', file_name: 'Vertrag.pdf', file_type: 'application/pdf', file_size: '13', created_at: '2026-10-09T10:00:00.000Z', storage_path: '7/55/x.pdf', workspace_id: 7 };
  test('the download URL is the Engine endpoint on the CRM origin, never the storage path', () => {
    assert.equal(kunde.documentUrl('https://crm.example/', 9), 'https://crm.example/api/dokumente/9/download');
    assert.equal(kunde.documentUrl(null, 9), null);
  });
  test('dokumentView: exactly the briefing\'s seven keys in order, numbers as numbers, unknown typ → sonstiges, empty mimetype → null', () => {
    const v = kunde.dokumentView(row, 'https://crm.example');
    assert.deepEqual(Object.keys(v), ['id', 'typ', 'dateiname', 'mimetype', 'groesse', 'erstellt_am', 'download_url']);
    assert.deepEqual(v, { id: 9, typ: 'vertrag', dateiname: 'Vertrag.pdf', mimetype: 'application/pdf', groesse: 13, erstellt_am: '2026-10-09T10:00:00.000Z', download_url: 'https://crm.example/api/dokumente/9/download' });
    assert.equal('storage_path' in v, false); assert.equal('workspace_id' in v, false);
    assert.equal(kunde.dokumentView({ ...row, typ: 'weird', file_type: '' }, null).typ, 'sonstiges');
    assert.equal(kunde.dokumentView({ ...row, file_type: '' }, null).mimetype, null);
    assert.equal(kunde.dokumentView(row, null).download_url, null);
  });
  test('the three document kinds', () => assert.deepEqual(kunde.DOCUMENT_TYPES, ['vertrag', 'aufnahme', 'sonstiges']));
});
