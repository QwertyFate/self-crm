// ROUTE test: when the engine sets drive_ordner_id through
// PATCH /api/kunden/:id/status, the CRM kicks a background Drive sync for that
// contact — without waiting for Google and without changing the response.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { idempotencyTable, apiKeyRules } = require('../helpers/fake-tables');
const { loadRoute, serve, inject } = require('../helpers/load-route');

const KEY = 'upg_live_fedcba9876543210';
const ROW = { id: 60, workspace_id: 7, name: 'Erika', email: null, phone: null, company: null, contact_type: 'contact', onboarding_status: 'kein_onboarding', drive_ordner_id: null, akte_version: 0,
  rechtsform: null, ust_id: null, handelsregisternummer: null, webseite: null, quelle: null, strasse: null, plz: null, ort: null, created_at: 't', updated_at: 't' };
const idem = idempotencyTable(), keys = apiKeyRules(KEY);
let pool, server, syncCalls = [], resolveSync;

before(async () => {
  pool = createFakePool([
    ...keys.rules,
    { match: /^UPDATE contacts SET onboarding_status = \$1/, reply: (p, sql) => { const c = { ...ROW, onboarding_status: p[0] }; if (/drive_ordner_id = \$2/.test(sql)) c.drive_ordner_id = p[1]; return { rows: [c] }; } },
    ...idem.rules,
  ]);
  inject('utils/drive-sync.js', { getDriveSync: () => ({ syncContact: (ws, id) => { syncCalls.push([ws, id]); return new Promise(r => { resolveSync = r; }); } }) });
  server = await serve({ '/api/kunden': loadRoute('engine-api.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); idem.table.clear(); syncCalls = []; });
const patch = (body, ik) => server.request('PATCH', '/api/kunden/60/status', body, { Authorization: `Bearer ${KEY}`, 'Idempotency-Key': ik });

test('a status change WITHOUT drive_ordner_id triggers no sync', async () => {
  const r = await patch({ onboarding_status: 'termin_gebucht' }, 'k1');
  assert.equal(r.status, 200);
  assert.equal(syncCalls.length, 0);
});

test('a status change WITH drive_ordner_id answers immediately (sync still pending) and kicks exactly one sync for that contact', async () => {
  const r = await patch({ onboarding_status: 'termin_gebucht', drive_ordner_id: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz' }, 'k2');
  assert.equal(r.status, 200, 'the engine did not wait for Google');
  assert.equal(r.body.drive_ordner_id, 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz', 'response unchanged: the raw value the engine sent');
  assert.deepEqual(syncCalls, [[7, 60]]);
  resolveSync({ files: [] });
});
