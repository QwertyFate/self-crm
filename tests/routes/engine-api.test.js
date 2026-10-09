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
const notes = [];
const state = { emailTaken: null, docs: [], noteRows: [], noteQueries: [], engineNotes: [], deal: { id: 17, contact_id: 60 } };
const idem = new Map(); const k = (w, key) => `${w}:${key}`;
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /FROM api_keys WHERE key_hash = \$1/, reply: p => ({ rows: p[0] === HASH ? [{ id: 5, workspace_id: 7, scopes: [] }] : [] }) },
    { match: /^UPDATE api_keys SET last_used_at/,  reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /FROM contacts WHERE id=\$1 AND workspace_id=\$2/, reply: p => { const c = contacts.get(p[0]); return { rows: c && c.workspace_id === p[1] ? [c] : [] }; } },
    { match: /^UPDATE contacts SET /, reply: (p, sql) => {
        const id = p[p.length - 2], wid = p[p.length - 1]; const c = contacts.get(id);
        if (!c || c.workspace_id !== wid) return { rows: [] };
        // Apply every "column = $n" in the SET clause, whatever the order/count; honour the version bump.
        const setClause = sql.slice(sql.indexOf('SET') + 3, sql.indexOf('WHERE'));
        for (const m of setClause.matchAll(/(\w+) = \$(\d+)/g)) c[m[1]] = p[Number(m[2]) - 1];
        if (/akte_version = akte_version \+ 1/.test(setClause)) c.akte_version = (Number(c.akte_version) || 0) + 1;
        c.updated_at = '2026-09-17T10:00:00.000Z';
        return { rows: [c] }; } },
    { match: /^SELECT id FROM contacts WHERE workspace_id=\$1 AND email=\$2 AND id<>\$3/, reply: p => ({ rows: state.emailTaken === p[1] ? [{ id: 99 }] : [] }) },
    { match: /^INSERT INTO activities \(workspace_id, contact_id, type, content, created_by, source, deal_id\)/, reply: (p, sql) => {
        const row = { id: 900 + state.engineNotes.length, type: 'note', content: p[2], source: 'engine', deal_id: p[3], event_date: null, event_time: null, created_at: '2026-10-09T12:00:00.000Z' };
        state.engineNotes.push({ sql, params: p, row }); return { rows: [row] }; } },
    { match: /^INSERT INTO activities/, reply: (p, sql) => { notes.push({ sql, params: p }); return { rows: [{ id: notes.length }] }; } },
    { match: /^SELECT a\.id, a\.type, a\.content, a\.source, a\.deal_id, TO_CHAR\(a\.event_date/, reply: (p, sql) => {
        state.noteQueries.push({ sql, params: p });
        return { rows: state.noteRows.filter(a => a.contact_id === p[0] && a.workspace_id === p[1]).slice(0, p[p.length - 1]) }; } },
    { match: /^SELECT id FROM deals WHERE id=\$1 AND workspace_id=\$2 AND contact_id=\$3/, reply: p => ({ rows: state.deal && state.deal.id === p[0] && state.deal.contact_id === p[2] ? [state.deal] : [] }) },
    { match: /FROM contact_documents WHERE contact_id=\$1 AND workspace_id=\$2/, reply: p => ({ rows: state.docs.filter(d => d.contact_id === p[0] && d.workspace_id === p[1]) }) },
    { match: /^SELECT request_hash, response_status, response_body, expires_at FROM idempotency_keys/, reply: p => ({ rows: idem.has(k(p[0], p[1])) ? [idem.get(k(p[0], p[1]))] : [] }) },
    { match: /^INSERT INTO idempotency_keys/, reply: p => { if (idem.has(k(p[0], p[1]))) { const e = new Error('dup'); e.code = '23505'; throw e; } idem.set(k(p[0], p[1]), { request_hash: p[2], response_status: null, response_body: null, expires_at: new Date(Date.now() + 86_400_000) }); return { rowCount: 1 }; } },
    { match: /^UPDATE idempotency_keys SET response_status/, reply: p => { const r = idem.get(k(p[0], p[1])); if (r) { r.response_status = p[2]; r.response_body = JSON.parse(p[3]); } return { rowCount: 1 }; } },
    { match: /^DELETE FROM idempotency_keys/, reply: p => ({ rowCount: idem.delete(k(p[0], p[1])) ? 1 : 0 }) },
  ]);
  server = await serve({ '/api/kunden': loadRoute('engine-api.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); idem.clear(); notes.length = 0; state.emailTaken = null; state.docs = []; state.noteRows = []; state.noteQueries = []; state.engineNotes = []; state.deal = { id: 17, contact_id: 60 }; contacts.clear(); contacts.set(60, { ...ROW }); contacts.set(61, { ...ROW, id: 61, workspace_id: 8 }); });

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

describe('PATCH /api/kunden/:id/status — akte_version (briefing §5.4: the Engine\'s concurrency counter)', () => {
  const H = key => ({ ...AUTH, 'Idempotency-Key': key });

  test('set when present as a non-negative integer; untouched when absent', async () => {
    let r = await patch('/api/kunden/60/status', { onboarding_status: 'formular_versendet', akte_version: 3 }, H('a1'));
    assert.equal(r.status, 200); assert.equal(r.body.akte_version, 3);
    assert.match(updates()[0].sql, /akte_version = \$2/); assert.deepEqual(updates()[0].params, ['formular_versendet', 3, 60, 7]);
    r = await patch('/api/kunden/60/status', { onboarding_status: 'formular_ausgefuellt' }, H('a2'));
    assert.equal(r.body.akte_version, 3);
    assert.doesNotMatch(updates()[1].sql, /akte_version = \$/);
  });
  test('drive_ordner_id and akte_version together: both land in the SET clause in order', async () => {
    const r = await patch('/api/kunden/60/status', { onboarding_status: 'termin_gebucht', drive_ordner_id: 'F1', akte_version: 9 }, H('a3'));
    assert.equal(r.status, 200); assert.equal(r.body.drive_ordner_id, 'F1'); assert.equal(r.body.akte_version, 9);
    assert.deepEqual(updates()[0].params, ['termin_gebucht', 'F1', 9, 60, 7]);
  });
  test('a negative, fractional, string or null akte_version -> 422 ungueltige_daten, no UPDATE', async () => {
    for (const bad of [-1, 1.5, '3', null, {}]) {
      const r = await patch('/api/kunden/60/status', { onboarding_status: 'termin_gebucht', akte_version: bad }, H(`a-bad-${JSON.stringify(bad)}`));
      assert.equal(r.status, 422, String(bad)); assert.equal(r.body.fehler.code, 'ungueltige_daten');
    }
    assert.equal(updates().length, 0);
  });
});

describe('GET /api/kunden/openapi.json (briefing §8)', () => {
  test('with a key: the OpenAPI document as JSON, not cached; without: 401; the word is not treated as a customer id', async () => {
    const r = await fetch(server.base + '/api/kunden/openapi.json', { headers: AUTH });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/json/);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    const body = await r.json();
    assert.match(body.openapi, /^3\.1\./); assert.ok(body.paths['/api/kunden/{kunde_id}']);
    assert.equal(pool.some(/FROM contacts/), false, 'no customer lookup ran');
    assert.equal((await fetchJson('GET', '/api/kunden/openapi.json', {})).status, 401);
  });
});

describe('GET /api/kunden/:id/dokumente (briefing §5.2 list)', () => {
  test('the §5.2 view per document, newest first, with an absolute download_url on this CRM\'s origin; storage paths never leak', async () => {
    state.docs = [
      { id: 9, workspace_id: 7, contact_id: 60, typ: 'vertrag', file_name: 'Vertrag.pdf', file_type: 'application/pdf', file_size: 13, created_at: '2026-10-09T10:00:00.000Z', storage_path: '7/60/x.pdf' },
      { id: 11, workspace_id: 7, contact_id: 60, typ: 'aufnahme', file_name: 'call.m4a', file_type: '', file_size: 2048, created_at: '2026-10-09T11:00:00.000Z', storage_path: '7/60/y.m4a' },
      { id: 12, workspace_id: 7, contact_id: 62, typ: 'sonstiges', file_name: 'other.pdf', file_type: 'application/pdf', file_size: 1, created_at: '2026-10-09T12:00:00.000Z', storage_path: 'z' },
    ];
    const r = await fetchJson('GET', '/api/kunden/60/dokumente', AUTH);
    assert.equal(r.status, 200);
    assert.equal(r.body.dokumente.length, 2);
    assert.deepEqual(r.body.dokumente[0], { id: 9, typ: 'vertrag', dateiname: 'Vertrag.pdf', mimetype: 'application/pdf', groesse: 13, erstellt_am: '2026-10-09T10:00:00.000Z', download_url: `${server.base}/api/dokumente/9/download` });
    assert.equal(r.body.dokumente[1].mimetype, null, 'empty mimetype → null');
    assert.doesNotMatch(JSON.stringify(r.body), /storage_path|7\/60/);
    const q = pool.find(/FROM contact_documents WHERE contact_id=\$1 AND workspace_id=\$2/);
    assert.deepEqual(q.params, [60, 7]); assert.match(q.sql, /ORDER BY created_at DESC, id DESC/);
  });
  test('a customer without documents → empty list; another workspace\'s customer → 404; bad id → 400; no key → 401', async () => {
    assert.deepEqual((await fetchJson('GET', '/api/kunden/60/dokumente', AUTH)).body, { dokumente: [] });
    assert.equal((await fetchJson('GET', '/api/kunden/61/dokumente', AUTH)).status, 404);
    assert.equal((await fetchJson('GET', '/api/kunden/abc/dokumente', AUTH)).status, 400);
    assert.equal((await fetchJson('GET', '/api/kunden/60/dokumente', {})).status, 401);
  });
});

describe('PATCH /api/kunden/:id — master data the Engine identified: fill empty fields only, note on conflict (briefing §5.2)', () => {
  const H = key => ({ ...AUTH, 'Idempotency-Key': key });
  const contactUpdates = () => pool.filter(/^UPDATE contacts SET /);
  const view = () => contacts.get(60);
  // Fixture 60 has: company, name, email, phone, rechtsform 'GmbH', ust_id, handelsregisternummer 'HRB 1', quelle, street/plz/city set; webseite EMPTY.

  test('empty fields are filled, populated fields are left alone and reported as konflikte with one note; akte_version +1', async () => {
    const r = await patch('/api/kunden/60', { webseite: ' https://muster.de ', rechtsform: 'AG', adresse: { strasse: 'Neue Str. 2', ort: 'Dresden' } }, H('m1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.gesetzt, ['webseite']);
    assert.deepEqual(r.body.konflikte, [{ feld: 'rechtsform', crm: 'GmbH', engine: 'AG' }, { feld: 'strasse', crm: 'Musterstr. 1', engine: 'Neue Str. 2' }]);
    assert.equal(r.body.webseite, 'https://muster.de', 'trimmed and set');
    assert.equal(r.body.rechtsform, 'GmbH', 'CRM value stands'); assert.equal(r.body.adresse.strasse, 'Musterstr. 1');
    assert.equal(r.body.akte_version, 1, 'bumped from 0');
    assert.deepEqual(Object.keys(r.body), [...EXPECTED_KEYS, 'gesetzt', 'konflikte']);
    const up = contactUpdates(); assert.equal(up.length, 1);
    assert.match(up[0].sql, /^UPDATE contacts SET webseite = \$1, akte_version = akte_version \+ 1, updated_at = NOW\(\) WHERE id = \$2 AND workspace_id = \$3 RETURNING/);
    assert.deepEqual(up[0].params, ['https://muster.de', 60, 7]);
    assert.equal(notes.length, 1);
    assert.match(notes[0].sql, /INSERT INTO activities \(workspace_id, contact_id, type, content, created_by, source\) VALUES \(\$1,\$2,'note',\$3,NULL,'engine'\)/);
    assert.equal(notes[0].params[0], 7); assert.equal(notes[0].params[1], 60);
    // stored like a browser note: escaped, <br> for line breaks — the UI renders it unchanged
    assert.equal(notes[0].params[2], 'Upgrads Engine: abweichende Stammdaten erkannt – nicht überschrieben.<br>• Rechtsform: CRM „GmbH“ / Engine „AG“<br>• Straße: CRM „Musterstr. 1“ / Engine „Neue Str. 2“');
  });
  test('values equal to the CRM\'s (case, whitespace) are neither written nor conflicts; nothing is bumped', async () => {
    const r = await patch('/api/kunden/60', { firma: ' Muster GmbH ', email: 'ERIKA@muster.de', rechtsform: 'GmbH', adresse: { plz: '01067' } }, H('m2'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.gesetzt, []); assert.deepEqual(r.body.konflikte, []);
    assert.equal(r.body.akte_version, 0);
    assert.equal(contactUpdates().length, 0); assert.equal(notes.length, 0);
  });
  test('only conflicts: a note is written but the record (and akte_version) is untouched', async () => {
    const r = await patch('/api/kunden/60', { telefon: '+49 30 999' }, H('m3'));
    assert.deepEqual(r.body.konflikte, [{ feld: 'telefon', crm: '+49 30 1', engine: '+49 30 999' }]);
    assert.equal(contactUpdates().length, 0); assert.equal(notes.length, 1); assert.equal(r.body.akte_version, 0);
  });
  test('email: filled when empty and free (lower-cased); a taken email becomes a konflikt with grund email_vergeben and is not written', async () => {
    contacts.set(60, { ...ROW, email: null });
    state.emailTaken = 'taken@muster.de';
    let r = await patch('/api/kunden/60', { email: 'Taken@Muster.de' }, H('e1'));
    assert.deepEqual(r.body.konflikte, [{ feld: 'email', crm: null, engine: 'taken@muster.de', grund: 'email_vergeben' }]);
    assert.equal(r.body.email, null); assert.equal(contactUpdates().length, 0);
    const dup = pool.find(/^SELECT id FROM contacts WHERE workspace_id=\$1 AND email=\$2 AND id<>\$3/);
    assert.deepEqual(dup.params, [7, 'taken@muster.de', 60], 'scoped to the workspace, excluding the contact itself');
    assert.match(notes[0].params[2], /E-Mail: Engine „taken@muster.de“ – gehört bereits einem anderen Kontakt/);
    r = await patch('/api/kunden/60', { email: 'Frei@Muster.de' }, H('e2'));
    assert.deepEqual(r.body.gesetzt, ['email']); assert.equal(r.body.email, 'frei@muster.de');
  });
  test('null and empty strings mean "nothing to add" — the Engine can never clear a field', async () => {
    const r = await patch('/api/kunden/60', { webseite: '', quelle: null, adresse: null }, H('n1'));
    assert.equal(r.status, 422); assert.equal(r.body.fehler.code, 'keine_daten');
    const r2 = await patch('/api/kunden/60', { webseite: 'https://x.de', quelle: '', ust_id: null }, H('n2'));
    assert.equal(r2.status, 200); assert.deepEqual(r2.body.gesetzt, ['webseite']); assert.deepEqual(r2.body.konflikte, []);
  });
  test('422 ungueltige_daten for: unknown key, an Engine-owned or non-master field, a non-string, too long, a malformed adresse, an unknown adresse key', async () => {
    for (const body of [{ foo: 'x' }, { onboarding_status: 'x' }, { drive_ordner_id: 'x' }, { kontakt_typ: 'supplier' }, { kunde_id: 5 }, { firma: 12 }, { firma: { a: 1 } }, { webseite: 'x'.repeat(2049) }, { firma: 'x'.repeat(256) }, { adresse: 'Musterstr. 1' }, { adresse: ['a'] }, { adresse: { land: 'DE' } }, { akte_version: -1 }, { akte_version: '0' }]) {
      const r = await patch('/api/kunden/60', body, H('bad-' + JSON.stringify(body).slice(0, 40)));
      assert.equal(r.status, 422, JSON.stringify(body)); assert.equal(r.body.fehler.code, 'ungueltige_daten', JSON.stringify(body));
    }
    assert.match((await patch('/api/kunden/60', { foo: 'x' }, H('bad-foo2'))).body.fehler.nachricht, /foo/);
    assert.equal(contactUpdates().length, 0); assert.equal(notes.length, 0);
  });
  test('empty body → 422 keine_daten; without Idempotency-Key → 400; another workspace → 404; bad id → 400', async () => {
    assert.equal((await patch('/api/kunden/60', {}, H('k1'))).body.fehler.code, 'keine_daten');
    assert.equal((await patch('/api/kunden/60', { firma: 'X' }, AUTH)).body.fehler.code, 'idempotency_key_fehlt');
    assert.equal((await patch('/api/kunden/61', { firma: 'X' }, H('k2'))).status, 404);
    assert.equal((await patch('/api/kunden/abc', { firma: 'X' }, H('k3'))).status, 400);
    assert.equal(contactUpdates().length, 0);
  });
  test('akte_version precondition: matching → applied and bumped; stale → 409 akte_version_konflikt with no write and no note', async () => {
    contacts.set(60, { ...ROW, akte_version: 3 });
    let r = await patch('/api/kunden/60', { webseite: 'https://a.de', akte_version: 3 }, H('v1'));
    assert.equal(r.status, 200); assert.equal(r.body.akte_version, 4);
    r = await patch('/api/kunden/60', { quelle: 'Neu', akte_version: 3 }, H('v2'));
    assert.equal(r.status, 409); assert.equal(r.body.fehler.code, 'akte_version_konflikt'); assert.match(r.body.fehler.nachricht, /4/);
    assert.equal(contactUpdates().length, 1); assert.equal(notes.length, 0);
    assert.equal(view().quelle, 'Empfehlung');
  });
  test('replay: same key + body → identical answer, one UPDATE, one note', async () => {
    const a = await patch('/api/kunden/60', { webseite: 'https://a.de', rechtsform: 'AG' }, H('r1'));
    const b = await patch('/api/kunden/60', { webseite: 'https://a.de', rechtsform: 'AG' }, H('r1'));
    assert.deepEqual(b.body, a.body); assert.equal(b.headers.get('idempotent-replayed'), 'true');
    assert.equal(contactUpdates().length, 1); assert.equal(notes.length, 1);
  });
  test('the column list written is a fixed whitelist (no body key reaches the SQL as an identifier)', async () => {
    await patch('/api/kunden/60', { webseite: 'https://a.de' }, H('w1'));
    const src = fs.readFileSync(path.join(ROOT, 'routes', 'engine-api.js'), 'utf8');
    assert.match(src, /const col\s+= PATCH_FIELDS\[feld\] \|\| ADDRESS_FIELDS\[feld\];/);
    assert.doesNotMatch(contactUpdates()[0].sql, /\$\{|webseite = 'https/);
  });
});

describe('GET /api/kunden/:id/notizen (briefing §5.2 "sales call notes")', () => {
  const ROWS = [
    { id: 5, contact_id: 60, workspace_id: 7, type: 'call', content: 'Telefonat:<br>will nur Eigent&uuml;mer &amp; keine K&auml;ufersuche', source: 'user', deal_id: 17, event_date: '2026-08-14', event_time: '12:30:00', created_at: '2026-08-14T10:35:00.000Z', logged_by_name: 'Anna' },
    { id: 6, contact_id: 60, workspace_id: 7, type: 'note', content: 'Briefing fertig', source: 'engine', deal_id: null, event_date: null, event_time: null, created_at: '2026-10-01T10:00:00.000Z', logged_by_name: null },
  ];
  test('the notes and call logs of the customer, newest first as stored order, mapped to the German view', async () => {
    state.noteRows = ROWS;
    const r = await fetchJson('GET', '/api/kunden/60/notizen', AUTH);
    assert.equal(r.status, 200);
    assert.equal(r.body.notizen.length, 2);
    assert.deepEqual(r.body.notizen[0], { id: 5, typ: 'anruf', inhalt: 'Telefonat:\nwill nur Eigent&uuml;mer & keine K&auml;ufersuche', quelle: 'crm', autor: 'Anna', vertrag_id: 17, datum: '2026-08-14', uhrzeit: '12:30:00', erstellt_am: '2026-08-14T10:35:00.000Z' });
    assert.deepEqual(r.body.notizen[1], { id: 6, typ: 'notiz', inhalt: 'Briefing fertig', quelle: 'engine', autor: 'Upgrads Engine', vertrag_id: null, datum: null, uhrzeit: null, erstellt_am: '2026-10-01T10:00:00.000Z' });
    const q = state.noteQueries[0];
    assert.match(q.sql, /FROM activities a LEFT JOIN users u ON u\.id = a\.created_by/);
    assert.match(q.sql, /WHERE a\.contact_id = \$1 AND a\.workspace_id = \$2 AND a\.type IN \('note','call'\) ORDER BY a\.created_at DESC, a\.id DESC LIMIT \$3/);
    assert.deepEqual(q.params, [60, 7, 200]);
    assert.doesNotMatch(q.sql, /email|whatsapp/, 'communication is not a note');
  });
  test('filters: typ=anruf → type call, seit → created_at bound, limit → LIMIT; invalid values are 422', async () => {
    await fetchJson('GET', '/api/kunden/60/notizen?typ=anruf&seit=2026-01-01&limit=50', AUTH);
    const q = state.noteQueries[0];
    assert.match(q.sql, /AND a\.type = \$3 AND a\.created_at >= \$4 ORDER BY/);
    assert.deepEqual(q.params, [60, 7, 'call', '2026-01-01T00:00:00.000Z', 50]);
    for (const qs of ['typ=email', 'typ=x', 'seit=gestern', 'seit=2026-13-45', 'limit=0', 'limit=501', 'limit=abc']) {
      const r = await fetchJson('GET', `/api/kunden/60/notizen?${qs}`, AUTH);
      assert.equal(r.status, 422, qs); assert.equal(r.body.fehler.code, 'ungueltige_daten', qs);
    }
    assert.equal(state.noteQueries.length, 1, 'invalid filters never reach the database');
  });
  test('404 for another workspace\'s customer, 400 for a bad id, 401 without a key', async () => {
    assert.equal((await fetchJson('GET', '/api/kunden/61/notizen', AUTH)).status, 404);
    assert.equal((await fetchJson('GET', '/api/kunden/x/notizen', AUTH)).status, 400);
    assert.equal((await fetchJson('GET', '/api/kunden/60/notizen', {})).status, 401);
    assert.equal(state.noteQueries.length, 0);
  });
});

describe('GET /api/kunden/:id/kommunikation (briefing §5.2 "email correspondence" — hand-logged in this CRM)', () => {
  const ROWS = [
    { id: 8, contact_id: 60, workspace_id: 7, type: 'email', content: 'Angebot gesendet<br>Anhang: Expos&eacute;', source: 'user', deal_id: 17, event_date: '2026-09-02', event_time: null, created_at: '2026-09-02T09:00:00.000Z', logged_by_name: 'Anna' },
    { id: 9, contact_id: 60, workspace_id: 7, type: 'whatsapp', content: 'Termin best&auml;tigt &#39;Mo&#39;', source: 'user', deal_id: null, event_date: null, event_time: null, created_at: '2026-09-03T09:00:00.000Z', logged_by_name: 'Ben' },
  ];
  test('e-mails and WhatsApp messages, the honest view (betreff / richtung / absender null, erfasst_von), plus a hinweis naming the limitation', async () => {
    state.noteRows = ROWS;
    const r = await fetchJson('GET', '/api/kunden/60/kommunikation', AUTH);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['kommunikation', 'hinweis']);
    assert.match(r.body.hinweis, /kein Postfach/);
    assert.equal(r.body.kommunikation.length, 2);
    assert.deepEqual(r.body.kommunikation[0], { id: 8, typ: 'email', betreff: null, inhalt: 'Angebot gesendet\nAnhang: Expos&eacute;', richtung: null, absender: null, erfasst_von: 'Anna', vertrag_id: 17, datum: '2026-09-02', uhrzeit: null, zeitpunkt: '2026-09-02T09:00:00.000Z' });
    assert.equal(r.body.kommunikation[1].typ, 'whatsapp'); assert.equal(r.body.kommunikation[1].inhalt, "Termin best&auml;tigt 'Mo'");
    const q = state.noteQueries[0];
    assert.match(q.sql, /AND a\.type IN \('email','whatsapp'\) ORDER BY a\.created_at DESC, a\.id DESC LIMIT \$3/);
    assert.deepEqual(q.params, [60, 7, 200]);
  });
  test('typ=email / typ=whatsapp narrow; typ=notiz is 422; seit and limit as on /notizen', async () => {
    await fetchJson('GET', '/api/kunden/60/kommunikation?typ=whatsapp&seit=2026-09-01T00:00:00Z&limit=10', AUTH);
    const q = state.noteQueries[0];
    assert.match(q.sql, /AND a\.type = \$3 AND a\.created_at >= \$4/);
    assert.deepEqual(q.params, [60, 7, 'whatsapp', '2026-09-01T00:00:00.000Z', 10]);
    for (const qs of ['typ=notiz', 'typ=anruf', 'typ=sms', 'seit=morgen', 'limit=501']) {
      const r = await fetchJson('GET', `/api/kunden/60/kommunikation?${qs}`, AUTH);
      assert.equal(r.status, 422, qs); assert.equal(r.body.fehler.code, 'ungueltige_daten');
    }
    assert.equal(state.noteQueries.length, 1);
  });
  test('404 / 400 / 401 like every other read', async () => {
    assert.equal((await fetchJson('GET', '/api/kunden/61/kommunikation', AUTH)).status, 404);
    assert.equal((await fetchJson('GET', '/api/kunden/x/kommunikation', AUTH)).status, 400);
    assert.equal((await fetchJson('GET', '/api/kunden/60/kommunikation', {})).status, 401);
  });
});

describe('POST /api/kunden/:id/notizen (briefing §5.2 "engine result logs as a note")', () => {
  const H = key => ({ ...AUTH, 'Idempotency-Key': key });
  const post = (p, body, h) => fetchJson('POST', p, h, body);
  test('writes a note with source engine and no user, stored escaped with <br>, optionally bound to the customer\'s deal; 201 with the view', async () => {
    const r = await post('/api/kunden/60/notizen', { inhalt: 'Onboarding-Call ausgewertet.\nOffene Fragen: 3 <siehe Datei>', vertrag_id: 17 }, H('n1'));
    assert.equal(r.status, 201);
    assert.equal(state.engineNotes.length, 1);
    const ins = state.engineNotes[0];
    assert.match(ins.sql, /VALUES \(\$1,\$2,'note',\$3,NULL,'engine',\$4\)/);
    assert.deepEqual(ins.params, [7, 60, 'Onboarding-Call ausgewertet.<br>Offene Fragen: 3 &lt;siehe Datei&gt;', 17]);
    assert.deepEqual(r.body, { id: 900, typ: 'notiz', inhalt: 'Onboarding-Call ausgewertet.\nOffene Fragen: 3 <siehe Datei>', quelle: 'engine', autor: 'Upgrads Engine', vertrag_id: 17, datum: null, uhrzeit: null, erstellt_am: '2026-10-09T12:00:00.000Z' });
    assert.ok(pool.some(/^SELECT id FROM deals WHERE id=\$1 AND workspace_id=\$2 AND contact_id=\$3/), 'the deal link is verified');
  });
  test('without vertrag_id the note is unbound; a foreign deal, a non-integer deal, a missing / blank / too long inhalt, an unknown field → 422 and nothing written', async () => {
    const ok = await post('/api/kunden/60/notizen', { inhalt: 'nur Text' }, H('n2'));
    assert.equal(ok.status, 201); assert.equal(ok.body.vertrag_id, null);
    for (const body of [{ inhalt: 'x', vertrag_id: 99 }, { inhalt: 'x', vertrag_id: '17' }, { inhalt: 'x', vertrag_id: 1.5 }, {}, { inhalt: '   ' }, { inhalt: 42 }, { inhalt: 'x'.repeat(10001) }, { inhalt: 'x', typ: 'anruf' }, { inhalt: 'x', autor: 'Bot' }]) {
      const r = await post('/api/kunden/60/notizen', body, H('bad-' + JSON.stringify(body).slice(0, 30)));
      assert.equal(r.status, 422, JSON.stringify(body).slice(0, 60)); assert.equal(r.body.fehler.code, 'ungueltige_daten');
    }
    assert.equal(state.engineNotes.length, 1);
  });
  test('idempotent replay, Idempotency-Key required, 404 for another workspace\'s customer; never an outbound webhook', async () => {
    const a = await post('/api/kunden/60/notizen', { inhalt: 'einmal' }, H('n3'));
    const b = await post('/api/kunden/60/notizen', { inhalt: 'einmal' }, H('n3'));
    assert.deepEqual(b.body, a.body); assert.equal(b.headers.get('idempotent-replayed'), 'true'); assert.equal(state.engineNotes.length, 1);
    assert.equal((await post('/api/kunden/60/notizen', { inhalt: 'x' }, AUTH)).body.fehler.code, 'idempotency_key_fehlt');
    assert.equal((await post('/api/kunden/61/notizen', { inhalt: 'x' }, H('n4'))).status, 404);
    assert.equal(pool.some(/engine_deliveries|workspace_engine/), false);
  });
});

describe('error shape everywhere under /api/kunden (briefing §8: never HTTP 200 with an error body)', () => {
  test('an unknown sub-path answers JSON 404 nicht_gefunden, not the SPA page', async () => {
    const r = await fetchJson('GET', '/api/kunden/60/unbekannt', AUTH);
    assert.equal(r.status, 404); assert.equal(r.body.fehler.code, 'nicht_gefunden');
  });
  test('an unknown sub-path without a key is still 401 first (auth runs before routing)', async () => {
    const r = await fetchJson('GET', '/api/kunden/60/unbekannt', {});
    assert.equal(r.status, 401);
  });
  test('a database failure answers 500 with the fehler shape and no internals', async () => {
    const broken = createFakePool([
      { match: /FROM api_keys WHERE key_hash = \$1/, reply: () => ({ rows: [{ id: 5, workspace_id: 7, scopes: [] }] }) },
      { match: /^UPDATE api_keys SET last_used_at/,  reply: () => ({ rows: [] }) },
      { match: /FROM contacts/, reply: () => { throw new Error('connection refused: 10.0.0.5'); } },
    ]);
    const s = await serve({ '/api/kunden': loadRoute('engine-api.js', { pool: broken }) });
    try {
      const r = await fetch(s.base + '/api/kunden/60', { headers: AUTH });
      const body = await r.json();
      assert.equal(r.status, 500);
      assert.equal(body.fehler.code, 'serverfehler');
      assert.doesNotMatch(JSON.stringify(body), /10\.0\.0\.5|connection refused/);
    } finally { await s.close(); }
    // Re-bind the shared server's modules to the main fake pool (loadRoute swapped the db.js injection).
    server.close(); server = await serve({ '/api/kunden': loadRoute('engine-api.js', { pool }) });
  });
});

describe('server wiring', () => {
  test('server.js mounts the router at /api/kunden behind engineApiLimiter, before the SPA catch-all', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert.match(src, /const engineApiLimiter = rateLimit\(\{[\s\S]*?fehler[\s\S]*?zu_viele_anfragen/);
    const iLimit = src.indexOf("app.use('/api/kunden',        engineApiLimiter)");
    const iMount = src.indexOf("app.use('/api/kunden',        require('./routes/engine-api'))");
    const iSpa   = src.indexOf("app.get('*'");
    assert.ok(iLimit > 0, 'limiter applied to /api/kunden');
    assert.ok(iMount > iLimit, 'router mounted after the limiter');
    assert.ok(iSpa < 0 || iMount < iSpa, 'mounted before the SPA catch-all');
  });
});

describe('no outbound webhook from the engine API (loop prevention)', () => {
  test('the route never touches the webhook tables and never loads the webhook module', async () => {
    await patch('/api/kunden/60/status', { onboarding_status: 'onboarding_abgeschlossen' }, { ...AUTH, 'Idempotency-Key': 'w1' });
    assert.equal(pool.some(/engine_deliveries|workspace_engine/), false);
    const src = fs.readFileSync(path.join(ROOT, 'routes', 'engine-api.js'), 'utf8');
    assert.doesNotMatch(src, /require\(['"][^'"]*(engine-webhook|utils\/engine)['"]/);
    assert.doesNotMatch(src, /dispatchContractSigned|emitEngineEvent/);
  });
});
