// ROUTE tests for PATCH /api/contacts/:id/onboarding-status — a CRM user sets
// the onboarding step by hand. Scoped to the workspace, validated against the
// seven statuses, pushed to the engine as onboarding.status_geaendert (never
// a 500 when the webhook table fails), and skipped entirely when unchanged.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve, inject } = require('../helpers/load-route');
const { ONBOARDING_STATUSES } = require('../helpers/schema-constants');

let pool, server, emits = [], notifies = [], emitThrows = false;
const contacts = new Map();
const seed = () => { contacts.clear();
  contacts.set(60, { id: 60, workspace_id: 7, name: 'Erika Muster', email: 'erika@x.de', company: 'Muster GmbH', onboarding_status: 'formular_versendet' });
  contacts.set(61, { id: 61, workspace_id: 8, name: 'Other', email: null, company: null, onboarding_status: 'kein_onboarding' }); };

before(async () => {
  pool = createFakePool([
    { match: /^SELECT onboarding_status FROM contacts WHERE id=\$1 AND workspace_id=\$2/, reply: p => { const c = contacts.get(p[0]); return { rows: c && c.workspace_id === p[1] ? [{ onboarding_status: c.onboarding_status }] : [] }; } },
    { match: /^UPDATE contacts SET onboarding_status=\$1, updated_at=NOW\(\) WHERE id=\$2 AND workspace_id=\$3/, reply: p => { const c = contacts.get(p[1]); if (!c || c.workspace_id !== p[2]) return { rows: [] }; c.onboarding_status = p[0]; return { rows: [c] }; } },
  ]);
  inject('utils/engine-webhook.js', { emitEngineEvent: async (...a) => { emits.push(a); if (emitThrows) throw new Error('webhook table down'); return { eventId: 'evt_test', deliveryIds: [1] }; } });
  server = await serve({ '/api/contacts': loadRoute('contacts.js', { pool, notify: (...a) => notifies.push(a) }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); emits = []; notifies = []; emitThrows = false; seed(); });
const patch = (id, body) => server.request('PATCH', `/api/contacts/${id}/onboarding-status`, body);

describe('validation', () => {
  test('non-numeric id -> 400, no query', async () => {
    assert.equal((await patch('abc', { onboarding_status: 'termin_gebucht' })).status, 400);
    assert.equal(pool.log.length, 0);
  });
  test('unknown or missing status -> 400 naming the seven values, no query', async () => {
    const r = await patch(60, { onboarding_status: 'bogus' });
    assert.equal(r.status, 400);
    for (const s of ONBOARDING_STATUSES) assert.ok(r.body.error.includes(s), s);
    assert.equal((await patch(60, {})).status, 400);
    assert.equal(pool.log.length, 0);
  });
  test("another workspace's contact -> 404, no UPDATE", async () => {
    assert.equal((await patch(61, { onboarding_status: 'termin_gebucht' })).status, 404);
    assert.equal(pool.some(/^UPDATE/), false);
    assert.equal(emits.length, 0);
  });
});

describe('own contact', () => {
  test('200 with the new and previous status; UPDATE scoped; one onboarding.status_geaendert event with vorher; notification', async () => {
    const r = await patch(60, { onboarding_status: 'termin_gebucht' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, onboarding_status: 'termin_gebucht', vorher: 'formular_versendet', event_id: 'evt_test', deliveries: 1 });
    assert.deepEqual(pool.find(/^UPDATE contacts SET onboarding_status=\$1/).params, ['termin_gebucht', 60, 7]);
    assert.equal(emits.length, 1);
    const [ws, event, { kundeId, daten }] = emits[0];
    assert.equal(ws, 7); assert.equal(event, 'onboarding.status_geaendert'); assert.equal(kundeId, 60);
    assert.equal(daten.onboarding_status, 'termin_gebucht'); assert.equal(daten.vorher, 'formular_versendet'); assert.equal(daten.quelle, 'manuell');
    assert.deepEqual(daten.kunde, { name: 'Erika Muster', email: 'erika@x.de', firma: 'Muster GmbH' });
    assert.equal(notifies.length, 1);
    assert.match(notifies[0][2].title, /Onboarding-Status geändert: Erika Muster/);
  });
  test('a webhook failure does not roll back the change: still 200 with deliveries 0', async () => {
    emitThrows = true;
    const r = await patch(60, { onboarding_status: 'call_erfolgt' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, onboarding_status: 'call_erfolgt', vorher: 'formular_versendet', event_id: null, deliveries: 0 });
    assert.equal(contacts.get(60).onboarding_status, 'call_erfolgt');
  });
  test('the same status again -> 200, nothing emitted, no notification', async () => {
    const r = await patch(60, { onboarding_status: 'formular_versendet' });
    assert.equal(r.status, 200);
    assert.equal(r.body.vorher, 'formular_versendet');
    assert.equal(emits.length, 0);
    assert.equal(notifies.length, 0);
  });
  test('back to kein_onboarding is allowed (it is one of the seven)', async () => {
    const r = await patch(60, { onboarding_status: 'kein_onboarding' });
    assert.equal(r.status, 200);
    assert.equal(emits[0][1], 'onboarding.status_geaendert');
  });
});
