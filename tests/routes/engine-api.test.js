// ROUTE tests for routes/engine-api.js — the real router behind the real
// engineAuth and runIdempotent, over real HTTP, against a fake pool.
// Fixture: workspace 7 owns contact 60; workspace 8 owns contact 61.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('fs');
const path    = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { idempotencyTable, apiKeyRules } = require('../helpers/fake-tables');
const { ONBOARDING_STATUSES } = require('../helpers/schema-constants');
const { loadRoute, serve, inject, ROOT } = require('../helpers/load-route');

const KEY = 'upg_live_fedcba9876543210';
const ROW = { id: 60, workspace_id: 7, name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact',
  onboarding_status: 'kein_onboarding', drive_ordner_id: null, akte_version: 0, rechtsform: 'GmbH', ust_id: 'DE123456789', handelsregisternummer: 'HRB 1', webseite: null, quelle: 'Empfehlung',
  strasse: 'Musterstr. 1', plz: '01067', ort: 'Dresden', created_at: '2026-09-01T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z' };
const EXPECTED_KEYS = ['kunde_id', 'firma', 'ansprechpartner', 'email', 'telefon', 'kontakt_typ', 'adresse', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'onboarding_status', 'drive_ordner_id', 'akte_version', 'erstellt_am', 'aktualisiert_am'];
const contacts = new Map();
const idem = idempotencyTable();
const keys = apiKeyRules(KEY);
let pool, server;

before(async () => {
  pool = createFakePool([
    ...keys.rules,
    { match: /FROM contacts WHERE id=\$1 AND workspace_id=\$2/, reply: p => { const c = contacts.get(p[0]); return { rows: c && c.workspace_id === p[1] ? [c] : [] }; } },
    { match: /^UPDATE contacts SET onboarding_status = \$1/, reply: (p, sql) => {
        const id = p[p.length - 2], wid = p[p.length - 1]; const c = contacts.get(id);
        if (!c || c.workspace_id !== wid) return { rows: [] };
        c.onboarding_status = p[0]; if (/drive_ordner_id = \$2/.test(sql)) c.drive_ordner_id = p[1]; c.updated_at = '2026-09-17T10:00:00.000Z';
        return { rows: [c] }; } },
    ...idem.rules,
  ]);
  inject('utils/drive-sync.js', { getDriveSync: () => ({ syncContact: async () => ({ files: [] }) }) });   // the background Drive sync is covered in engine-api-drive-sync.test.js
  server = await serve({ '/api/kunden': loadRoute('engine-api.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); idem.table.clear(); contacts.clear(); contacts.set(60, { ...ROW }); contacts.set(61, { ...ROW, id: 61, workspace_id: 8 }); });

// One call helper: { key: true } adds the API key, { idem: 'k' } adds an Idempotency-Key.
const call = (method, p, body, { key = true, idem: ik } = {}) =>
  server.request(method, p, body, { ...(key ? { Authorization: `Bearer ${KEY}` } : {}), ...(ik ? { 'Idempotency-Key': ik } : {}) });
const updates = () => pool.filter(/^UPDATE contacts SET onboarding_status/);

describe('authentication', () => {
  test('both routes -> 401 nicht_authentifiziert without a key', async () => {
    const g = await call('GET', '/api/kunden/60', undefined, { key: false });
    const p = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'termin_gebucht' }, { key: false, idem: 'x' });
    assert.equal(g.status, 401, 'GET');
    assert.equal(p.status, 401, 'PATCH');
    assert.equal(g.body.fehler.code, 'nicht_authentifiziert');
    assert.equal(pool.some(/FROM contacts|UPDATE contacts/), false, 'no contact query without auth');
  });
});

describe('GET /api/kunden/:id', () => {
  test('own contact -> 200 with exactly the German key set, address grouped, nulls for empty columns', async () => {
    const r = await call('GET', '/api/kunden/60');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), EXPECTED_KEYS);
    assert.deepEqual(r.body.adresse, { strasse: 'Musterstr. 1', plz: '01067', ort: 'Dresden' });
    assert.equal(r.body.firma, 'Muster GmbH');
    assert.equal(r.body.ansprechpartner, 'Erika Muster');
    assert.equal(r.body.webseite, null);
    assert.equal(r.body.akte_version, 0);
    assert.deepEqual(pool.find(/FROM contacts WHERE id=\$1 AND workspace_id=\$2/).params, [60, 7]);
  });
  test("another workspace's contact -> 404 nicht_gefunden (the SQL is workspace-scoped)", async () => {
    const r = await call('GET', '/api/kunden/61');
    assert.equal(r.status, 404);
    assert.equal(r.body.fehler.code, 'nicht_gefunden');
    assert.match(pool.find(/FROM contacts/).sql, /WHERE id=\$1 AND workspace_id=\$2/);
  });
  test('non-numeric id -> 400 ungueltige_id, no query', async () => {
    const r = await call('GET', '/api/kunden/abc');
    assert.equal(r.status, 400);
    assert.equal(r.body.fehler.code, 'ungueltige_id');
    assert.equal(pool.some(/FROM contacts/), false);
  });
});

describe('PATCH /api/kunden/:id/status', () => {
  test('without Idempotency-Key -> 400 idempotency_key_fehlt, no UPDATE', async () => {
    const r = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'termin_gebucht' });
    assert.equal(r.status, 400);
    assert.equal(r.body.fehler.code, 'idempotency_key_fehlt');
    assert.equal(updates().length, 0);
  });
  test('unknown status -> 422 ungueltiger_status listing the seven values, no UPDATE', async () => {
    const r = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'bogus' }, { idem: 'k1' });
    assert.equal(r.status, 422);
    assert.equal(r.body.fehler.code, 'ungueltiger_status');
    for (const s of ONBOARDING_STATUSES) assert.ok(r.body.fehler.nachricht.includes(s), `message names ${s}`);
    assert.equal(updates().length, 0);
  });
  test('each of the seven statuses -> 200 with the updated view', async () => {
    for (const s of ONBOARDING_STATUSES) {
      const r = await call('PATCH', '/api/kunden/60/status', { onboarding_status: s }, { idem: `s-${s}` });
      assert.equal(r.status, 200, s);
      assert.equal(r.body.onboarding_status, s);
    }
    assert.equal(updates().length, ONBOARDING_STATUSES.length);
  });
  test('drive_ordner_id: set when present, untouched when absent, cleared with null, refused when too long', async () => {
    let r = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'termin_gebucht', drive_ordner_id: '1AbC' }, { idem: 'd1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.drive_ordner_id, '1AbC');
    const withDrive = updates().find(u => /drive_ordner_id = \$2/.test(u.sql));
    assert.ok(withDrive, 'UPDATE sets drive_ordner_id when the key is present');
    assert.deepEqual(withDrive.params, ['termin_gebucht', '1AbC', 60, 7]);

    r = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'call_erfolgt' }, { idem: 'd2' });
    assert.equal(r.body.drive_ordner_id, '1AbC', 'kept when the key is absent');
    const withoutDrive = updates().find(u => u.params[0] === 'call_erfolgt' && u.params.length === 3);
    assert.ok(withoutDrive, 'UPDATE without the key binds only status, id, workspace');
    assert.doesNotMatch(withoutDrive.sql, /drive_ordner_id = \$/, 'not in the SET clause');
    assert.deepEqual(withoutDrive.params, ['call_erfolgt', 60, 7]);

    r = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'call_erfolgt', drive_ordner_id: null }, { idem: 'd3' });
    assert.equal(r.body.drive_ordner_id, null, 'cleared with null');

    r = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'call_erfolgt', drive_ordner_id: 'x'.repeat(300) }, { idem: 'd4' });
    assert.equal(r.status, 422);
    assert.equal(r.body.fehler.code, 'ungueltige_daten');
    assert.equal(updates().length, 3, 'the refused request wrote nothing');
  });
  test('replay: same key + same body -> identical 200, Idempotent-Replayed, exactly one UPDATE', async () => {
    const first = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'briefing_fertig' }, { idem: 'r1' });
    const again = await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'briefing_fertig' }, { idem: 'r1' });
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, first.body);
    assert.equal(again.headers.get('idempotent-replayed'), 'true');
    assert.equal(updates().length, 1);
  });
  test("another workspace's contact -> 404, and the 404 is replayed too", async () => {
    const a = await call('PATCH', '/api/kunden/61/status', { onboarding_status: 'termin_gebucht' }, { idem: 'f1' });
    const b = await call('PATCH', '/api/kunden/61/status', { onboarding_status: 'termin_gebucht' }, { idem: 'f1' });
    assert.equal(a.status, 404);
    assert.equal(b.status, 404);
    assert.equal(b.headers.get('idempotent-replayed'), 'true');
    assert.equal(contacts.get(61).onboarding_status, 'kein_onboarding', 'foreign row untouched');
  });
});

describe('no outbound webhook from the engine API (loop prevention)', () => {
  test('the route source never requires the webhook engine or calls emitEngineEvent', () => {
    const src = fs.readFileSync(path.join(ROOT, 'routes', 'engine-api.js'), 'utf8');
    assert.doesNotMatch(src, /require\(['"][^'"]*engine-webhook/);
    assert.doesNotMatch(src, /emitEngineEvent/);
  });
  test('a status change issues no statement against the webhook tables', async () => {
    await call('PATCH', '/api/kunden/60/status', { onboarding_status: 'onboarding_abgeschlossen' }, { idem: 'w1' });
    assert.equal(pool.some(/engine_webhook/), false);
  });
});
