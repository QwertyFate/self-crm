// ROUTE tests for routes/engine-api.js — the real router behind the real
// engineAuth and runIdempotent, over real HTTP, against a fake pool.
// Fixture: workspace 7 owns contact 60; workspace 8 owns contact 61.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const KEY  = 'upg_live_fedcba9876543210';
const HASH = crypto.createHash('sha256').update(KEY).digest('hex');
const ROW = { id: 60, workspace_id: 7, name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact',
  onboarding_status: 'kein_onboarding', drive_ordner_id: null, akte_version: 0, rechtsform: 'GmbH', ust_id: 'DE123456789', handelsregisternummer: 'HRB 1', webseite: null, quelle: 'Empfehlung',
  strasse: 'Musterstr. 1', plz: '01067', ort: 'Dresden', created_at: '2026-09-01T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z' };
const contacts = new Map();
const idem = new Map(); const k = (w, key) => `${w}:${key}`;
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /FROM api_keys WHERE key_hash = \$1/, reply: p => ({ rows: p[0] === HASH ? [{ id: 5, workspace_id: 7, scopes: [] }] : [] }) },
    { match: /^UPDATE api_keys SET last_used_at/,  reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /FROM contacts WHERE id=\$1 AND workspace_id=\$2/, reply: p => { const c = contacts.get(p[0]); return { rows: c && c.workspace_id === p[1] ? [c] : [] }; } },
    { match: /^UPDATE contacts SET onboarding_status = \$1/, reply: (p, sql) => {
        const id = p[p.length - 2], wid = p[p.length - 1]; const c = contacts.get(id);
        if (!c || c.workspace_id !== wid) return { rows: [] };
        c.onboarding_status = p[0]; if (/drive_ordner_id = \$2/.test(sql)) c.drive_ordner_id = p[1]; c.updated_at = '2026-09-17T10:00:00.000Z';
        return { rows: [c] }; } },
    { match: /^SELECT request_hash, response_status, response_body, expires_at FROM idempotency_keys/, reply: p => ({ rows: idem.has(k(p[0], p[1])) ? [idem.get(k(p[0], p[1]))] : [] }) },
    { match: /^INSERT INTO idempotency_keys/, reply: p => { if (idem.has(k(p[0], p[1]))) { const e = new Error('dup'); e.code = '23505'; throw e; } idem.set(k(p[0], p[1]), { request_hash: p[2], response_status: null, response_body: null, expires_at: new Date(Date.now() + 86_400_000) }); return { rowCount: 1 }; } },
    { match: /^UPDATE idempotency_keys SET response_status/, reply: p => { const r = idem.get(k(p[0], p[1])); if (r) { r.response_status = p[2]; r.response_body = JSON.parse(p[3]); } return { rowCount: 1 }; } },
    { match: /^DELETE FROM idempotency_keys/, reply: p => ({ rowCount: idem.delete(k(p[0], p[1])) ? 1 : 0 }) },
  ]);
  server = await serve({ '/api/kunden': loadRoute('engine-api.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); idem.clear(); contacts.clear(); contacts.set(60, { ...ROW }); contacts.set(61, { ...ROW, id: 61, workspace_id: 8 }); });

const AUTH = { Authorization: `Bearer ${KEY}` };
const patch = (p, body, h) => fetchJson('PATCH', p, h, body);
async function fetchJson(method, p, headers, body) {
  const r = await fetch(server.base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, body: json, headers: r.headers };
}
const EXPECTED_KEYS = ['kunde_id', 'firma', 'ansprechpartner', 'email', 'telefon', 'kontakt_typ', 'adresse', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'onboarding_status', 'drive_ordner_id', 'akte_version', 'erstellt_am', 'aktualisiert_am'];
const updates = () => pool.filter(/^UPDATE contacts SET onboarding_status/);

describe('authentication', () => {
  test('both routes -> 401 nicht_authentifiziert without a key', async () => {
    for (const r of [await fetchJson('GET', '/api/kunden/60', {}), await fetchJson('PATCH', '/api/kunden/60/status', { 'Idempotency-Key': 'x' }, { onboarding_status: 'termin_gebucht' })]) {
      assert.equal(r.status, 401); assert.equal(r.body.fehler.code, 'nicht_authentifiziert');
    }
    assert.equal(pool.some(/FROM contacts|UPDATE contacts/), false);
  });
});

describe('GET /api/kunden/:id', () => {
  test('own contact -> 200 with exactly the German key set, address grouped, nulls for empty columns', async () => {
    const r = await fetchJson('GET', '/api/kunden/60', AUTH);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), EXPECTED_KEYS);
    assert.deepEqual(r.body.adresse, { strasse: 'Musterstr. 1', plz: '01067', ort: 'Dresden' });
    assert.equal(r.body.firma, 'Muster GmbH'); assert.equal(r.body.ansprechpartner, 'Erika Muster'); assert.equal(r.body.webseite, null); assert.equal(r.body.akte_version, 0);
    assert.deepEqual(pool.find(/FROM contacts WHERE id=\$1 AND workspace_id=\$2/).params, [60, 7]);
  });
  test("another workspace's contact -> 404 nicht_gefunden (the SQL is workspace-scoped)", async () => {
    const r = await fetchJson('GET', '/api/kunden/61', AUTH);
    assert.equal(r.status, 404); assert.equal(r.body.fehler.code, 'nicht_gefunden');
    assert.match(pool.find(/FROM contacts/).sql, /WHERE id=\$1 AND workspace_id=\$2/);
  });
  test('non-numeric id -> 400 ungueltige_id, no query', async () => {
    const r = await fetchJson('GET', '/api/kunden/abc', AUTH);
    assert.equal(r.status, 400); assert.equal(r.body.fehler.code, 'ungueltige_id');
    assert.equal(pool.some(/FROM contacts/), false);
  });
});

describe('PATCH /api/kunden/:id/status', () => {
  const H = key => ({ ...AUTH, 'Idempotency-Key': key });

  test('without Idempotency-Key -> 400 idempotency_key_fehlt, no UPDATE', async () => {
    const r = await patch('/api/kunden/60/status', { onboarding_status: 'termin_gebucht' }, AUTH);
    assert.equal(r.status, 400); assert.equal(r.body.fehler.code, 'idempotency_key_fehlt'); assert.equal(updates().length, 0);
  });
  test('unknown status -> 422 ungueltiger_status listing the seven values, no UPDATE', async () => {
    const r = await patch('/api/kunden/60/status', { onboarding_status: 'bogus' }, H('k1'));
    assert.equal(r.status, 422); assert.equal(r.body.fehler.code, 'ungueltiger_status');
    for (const s of ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen']) assert.ok(r.body.fehler.nachricht.includes(s), s);
    assert.equal(updates().length, 0);
  });
  test('each of the seven statuses -> 200 with the updated view', async () => {
    const all = ['kein_onboarding', 'formular_versendet', 'formular_ausgefuellt', 'termin_gebucht', 'call_erfolgt', 'briefing_fertig', 'onboarding_abgeschlossen'];
    for (const s of all) { const r = await patch('/api/kunden/60/status', { onboarding_status: s }, H(`s-${s}`)); assert.equal(r.status, 200, s); assert.equal(r.body.onboarding_status, s); }
    assert.equal(updates().length, 7);
  });
  test('drive_ordner_id: set when present, untouched when absent, cleared with null, refused when too long', async () => {
    let r = await patch('/api/kunden/60/status', { onboarding_status: 'termin_gebucht', drive_ordner_id: '1AbC' }, H('d1'));
    assert.equal(r.status, 200); assert.equal(r.body.drive_ordner_id, '1AbC');
    assert.match(updates()[0].sql, /drive_ordner_id = \$2/); assert.deepEqual(updates()[0].params, ['termin_gebucht', '1AbC', 60, 7]);
    r = await patch('/api/kunden/60/status', { onboarding_status: 'call_erfolgt' }, H('d2'));
    assert.equal(r.body.drive_ordner_id, '1AbC');                               // kept
    assert.doesNotMatch(updates()[1].sql, /drive_ordner_id = \$/);   // not in the SET clause (RETURNING lists the column) assert.deepEqual(updates()[1].params, ['call_erfolgt', 60, 7]);
    r = await patch('/api/kunden/60/status', { onboarding_status: 'call_erfolgt', drive_ordner_id: null }, H('d3'));
    assert.equal(r.body.drive_ordner_id, null);                                 // cleared
    r = await patch('/api/kunden/60/status', { onboarding_status: 'call_erfolgt', drive_ordner_id: 'x'.repeat(300) }, H('d4'));
    assert.equal(r.status, 422); assert.equal(r.body.fehler.code, 'ungueltige_daten'); assert.equal(updates().length, 3);
  });
  test('replay: same key + same body -> identical 200, Idempotent-Replayed, exactly one UPDATE', async () => {
    const first = await patch('/api/kunden/60/status', { onboarding_status: 'briefing_fertig' }, H('r1'));
    const again = await patch('/api/kunden/60/status', { onboarding_status: 'briefing_fertig' }, H('r1'));
    assert.equal(again.status, 200); assert.deepEqual(again.body, first.body); assert.equal(again.headers.get('idempotent-replayed'), 'true');
    assert.equal(updates().length, 1);
  });
  test("another workspace's contact -> 404, and the 404 is replayed too", async () => {
    const a = await patch('/api/kunden/61/status', { onboarding_status: 'termin_gebucht' }, H('f1'));
    const b = await patch('/api/kunden/61/status', { onboarding_status: 'termin_gebucht' }, H('f1'));
    assert.equal(a.status, 404); assert.equal(b.status, 404); assert.equal(b.headers.get('idempotent-replayed'), 'true');
    assert.equal(contacts.get(61).onboarding_status, 'kein_onboarding');
  });
});

describe('no outbound webhook from the engine API (loop prevention)', () => {
  test('the route never touches the webhook tables and never loads utils/engine-webhook.js', async () => {
    await patch('/api/kunden/60/status', { onboarding_status: 'onboarding_abgeschlossen' }, { ...AUTH, 'Idempotency-Key': 'w1' });
    assert.equal(pool.some(/engine_webhook/), false);
    assert.equal(require.cache[path.join(ROOT, 'utils', 'engine-webhook.js')], undefined);
    const src = fs.readFileSync(path.join(ROOT, 'routes', 'engine-api.js'), 'utf8');
    assert.doesNotMatch(src, /require\(['"][^'"]*engine-webhook/);
    assert.doesNotMatch(src, /emitEngineEvent/);
  });
});
