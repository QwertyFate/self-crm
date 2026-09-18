// ROUTE tests for POST /api/contacts/:id/onboarding/start. The webhook engine
// is swapped for a recording stub (we test the *call*, Stage 2b tests delivery).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve, inject } = require('../helpers/load-route');

const emits = []; let emitThrows = false; const notifies = [];
const contacts = new Map();
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /^UPDATE contacts SET onboarding_status = 'formular_versendet'/, reply: p => { const c = contacts.get(p[0]); if (!c || c.workspace_id !== p[1]) return { rows: [] }; c.onboarding_status = 'formular_versendet'; return { rows: [c] }; } },
  ]);
  inject('utils/engine-webhook.js', { emitEngineEvent: async (...a) => { emits.push(a); if (emitThrows) throw new Error('webhook table down'); return { eventId: 'evt_test', deliveryIds: [1, 2] }; } });
  server = await serve({ '/api/contacts': loadRoute('contacts.js', { pool, notify: (...a) => notifies.push(a) }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); emits.length = 0; notifies.length = 0; emitThrows = false; contacts.clear();
  contacts.set(60, { id: 60, workspace_id: 7, name: 'Erika Muster', email: 'erika@muster.de', company: 'Muster GmbH', onboarding_status: 'kein_onboarding' });
  contacts.set(61, { id: 61, workspace_id: 8, name: 'Fremd', email: null, company: null, onboarding_status: 'kein_onboarding' }); });

const start = id => server.request('POST', `/api/contacts/${id}/onboarding/start`, {});

test('own contact -> 201, status set to formular_versendet, vertrag.unterschrieben emitted with fallback contract data, notification sent', async () => {
  const r = await start(60);
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { success: true, onboarding_status: 'formular_versendet', event_id: 'evt_test', deliveries: 2 });
  assert.deepEqual(pool.find(/^UPDATE contacts SET onboarding_status/).params, [60, 7]);
  assert.equal(emits.length, 1);
  const [wid, event, opts] = emits[0];
  assert.equal(wid, 7); assert.equal(event, 'vertrag.unterschrieben'); assert.equal(opts.kundeId, 60);
  assert.match(opts.daten.vertrag_id, /^manuell_60_\d{13}$/);
  assert.equal(opts.daten.quelle, 'manuell'); assert.equal(opts.daten.ausgeloest_von, 1); assert.equal(opts.daten.onboarding_status, 'formular_versendet');
  assert.deepEqual(opts.daten.kunde, { name: 'Erika Muster', email: 'erika@muster.de', firma: 'Muster GmbH' });
  assert.equal(notifies.length, 1); assert.match(notifies[0][2].title, /Onboarding gestartet: Erika Muster/);
});

test("another workspace's contact -> 404, nothing emitted", async () => {
  const r = await start(61);
  assert.equal(r.status, 404); assert.equal(emits.length, 0); assert.equal(contacts.get(61).onboarding_status, 'kein_onboarding');
});

test('non-numeric id -> 400, no query, nothing emitted', async () => {
  const r = await start('abc');
  assert.equal(r.status, 400); assert.equal(pool.log.length, 0); assert.equal(emits.length, 0);
});

test('a webhook failure does not roll back the status change: still 201 with deliveries 0', async () => {
  emitThrows = true;
  const r = await start(60);
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { success: true, onboarding_status: 'formular_versendet', event_id: null, deliveries: 0 });
  assert.equal(contacts.get(60).onboarding_status, 'formular_versendet');
});
