// UNIT tests for utils/kunde.js — the Engine's view of a contact, shared by the
// Engine API and the kunde.* webhooks, and the "master data changed" decision.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { ROOT } = require('../helpers/load-route');
const kunde = require(path.join(ROOT, 'utils', 'kunde.js'));

const ROW = { id: 60, workspace_id: 7, name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact',
  onboarding_status: 'termin_gebucht', drive_ordner_id: '1AbC', akte_version: 3, rechtsform: 'GmbH', ust_id: 'DE123456789', handelsregisternummer: 'HRB 1', webseite: null, quelle: 'Empfehlung',
  strasse: 'Musterstr. 1', plz: '01067', ort: 'Dresden', created_at: '2026-09-01T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z' };

describe('stammdaten / kundeView', () => {
  test('stammdaten: the eleven master-data keys in order, address grouped, nulls never undefined', () => {
    const s = kunde.stammdaten(ROW);
    assert.deepEqual(Object.keys(s), ['firma', 'ansprechpartner', 'email', 'telefon', 'kontakt_typ', 'adresse', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle']);
    assert.deepEqual(s.adresse, { strasse: 'Musterstr. 1', plz: '01067', ort: 'Dresden' });
    assert.equal(s.firma, 'Muster GmbH'); assert.equal(s.ansprechpartner, 'Erika Muster'); assert.equal(s.webseite, null);
    const empty = kunde.stammdaten({ id: 1 });
    assert.doesNotMatch(JSON.stringify(empty), /undefined/);
    assert.deepEqual(empty.adresse, { strasse: null, plz: null, ort: null });
  });
  test('kundeView: kunde_id + master data + the Engine\'s fields + timestamps, exactly the Engine API\'s key order', () => {
    const v = kunde.kundeView(ROW);
    assert.deepEqual(Object.keys(v), ['kunde_id', 'firma', 'ansprechpartner', 'email', 'telefon', 'kontakt_typ', 'adresse', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'onboarding_status', 'drive_ordner_id', 'akte_version', 'erstellt_am', 'aktualisiert_am']);
    assert.equal(v.kunde_id, 60); assert.equal(v.onboarding_status, 'termin_gebucht'); assert.equal(v.akte_version, 3);
    const d = kunde.kundeView({ id: 2 });
    assert.equal(d.onboarding_status, 'kein_onboarding'); assert.equal(d.akte_version, 0); assert.equal(d.drive_ordner_id, null); assert.equal(d.erstellt_am, null);
  });
  test('COLUMNS lists every column the view reads and nothing the Engine must not see', () => {
    for (const c of ['id', 'workspace_id', 'name', 'email', 'phone', 'company', 'contact_type', 'onboarding_status', 'drive_ordner_id', 'akte_version', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle', 'strasse', 'plz', 'ort', 'created_at', 'updated_at']) {
      assert.match(kunde.COLUMNS, new RegExp(`\\b${c}\\b`), c);
    }
    assert.doesNotMatch(kunde.COLUMNS, /custom_data|assigned_to|stage_id/);
  });
  test('the Engine API route uses the shared view (no second copy)', () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'routes', 'engine-api.js'), 'utf8');
    assert.match(src, /require\('\.\.\/utils\/kunde'\)/);
    assert.doesNotMatch(src, /function kundeView/);
  });
});

describe('normalize (shared by masterDataChanges and the Engine API\'s fill-empty-only comparison)', () => {
  test('trims, treats null/undefined as empty, lower-cases email only', () => {
    assert.equal(kunde.normalize('name', '  Erika '), 'Erika');
    assert.equal(kunde.normalize('name', null), ''); assert.equal(kunde.normalize('name', undefined), '');
    assert.equal(kunde.normalize('email', ' Erika@Muster.DE '), 'erika@muster.de');
    assert.equal(kunde.normalize('company', 'Muster GmbH'), 'Muster GmbH', 'case preserved outside email');
  });
});

describe('notes: activityText / activityHtml / notizView', () => {
  test('activityText turns the CRM\'s stored HTML (escaped, <br>) back into plain text', () => {
    assert.equal(kunde.activityText('Zeile 1<br>Zeile 2<br/>Zeile 3'), 'Zeile 1\nZeile 2\nZeile 3');
    assert.equal(kunde.activityText('A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;&nbsp;F'), 'A & B <C> "D" \'E\' F');
    assert.equal(kunde.activityText('<p>eins</p><div>zwei</div><b>drei</b>'), 'eins\nzwei\ndrei');
    assert.equal(kunde.activityText('  x<br><br><br><br>y  '), 'x\n\ny');
    assert.equal(kunde.activityText(null), '');
  });
  test('activityHtml stores plain text the way the browser does (escaped, <br>), so the UI renders Engine notes like any other', () => {
    assert.equal(kunde.activityHtml('Ergebnis: <script>alert(1)</script>\n"ok" & fertig\r\n'), 'Ergebnis: &lt;script&gt;alert(1)&lt;/script&gt;<br>&quot;ok&quot; &amp; fertig');
    assert.equal(kunde.activityText(kunde.activityHtml('a <b> & "c"\n\nd')), 'a <b> & "c"\n\nd', 'round trip');
    assert.equal(kunde.activityHtml(''), '');
  });
  test('notizView: German keys, typ notiz/anruf, quelle crm/engine, autor from the user or "Upgrads Engine", vertrag_id, datum, uhrzeit', () => {
    const user = kunde.notizView({ id: '5', type: 'call', content: 'Telefonat<br>gut', source: 'user', deal_id: '17', event_date: '2026-10-09', event_time: '14:30:00', created_at: '2026-10-09T13:00:00.000Z', logged_by_name: 'Anna' });
    assert.deepEqual(user, { id: 5, typ: 'anruf', inhalt: 'Telefonat\ngut', quelle: 'crm', autor: 'Anna', vertrag_id: 17, datum: '2026-10-09', uhrzeit: '14:30:00', erstellt_am: '2026-10-09T13:00:00.000Z' });
    const eng = kunde.notizView({ id: 6, type: 'note', content: 'Briefing fertig', source: 'engine', deal_id: null, event_date: null, event_time: null, created_at: 'c', logged_by_name: null });
    assert.equal(eng.typ, 'notiz'); assert.equal(eng.quelle, 'engine'); assert.equal(eng.autor, 'Upgrads Engine'); assert.equal(eng.vertrag_id, null); assert.equal(eng.datum, null);
    assert.equal(kunde.notizView({ id: 7, type: 'whatsapp', content: 'x', source: 'user' }).typ, 'notiz', 'unknown type falls back to notiz');
    assert.equal(kunde.ENGINE_AUTHOR, 'Upgrads Engine');
    assert.deepEqual(kunde.NOTE_TYPES, { note: 'notiz', call: 'anruf' });
  });
});

describe('communication: kommunikationView', () => {
  test('the briefing\'s fields, with the ones the CRM cannot know honestly null and erfasst_von for who logged it', () => {
    const v = kunde.kommunikationView({ id: '8', type: 'email', content: 'Angebot gesendet<br>Anhang: PDF', source: 'user', deal_id: 17, event_date: '2026-09-02', event_time: null, created_at: '2026-09-02T09:00:00.000Z', logged_by_name: 'Anna' });
    assert.deepEqual(Object.keys(v), ['id', 'typ', 'betreff', 'inhalt', 'richtung', 'absender', 'erfasst_von', 'vertrag_id', 'datum', 'uhrzeit', 'zeitpunkt']);
    assert.deepEqual(v, { id: 8, typ: 'email', betreff: null, inhalt: 'Angebot gesendet\nAnhang: PDF', richtung: null, absender: null, erfasst_von: 'Anna', vertrag_id: 17, datum: '2026-09-02', uhrzeit: null, zeitpunkt: '2026-09-02T09:00:00.000Z' });
    assert.equal(kunde.kommunikationView({ id: 9, type: 'whatsapp', content: 'ok', source: 'user' }).typ, 'whatsapp');
    assert.equal(kunde.kommunikationView({ id: 9, type: 'note', content: 'ok', source: 'user' }).typ, 'email', 'unknown falls back to email');
    assert.equal(kunde.kommunikationView({ id: 9, type: 'email', content: 'x', source: 'engine' }).erfasst_von, 'Upgrads Engine');
    assert.deepEqual(kunde.COMMUNICATION_TYPES, ['email', 'whatsapp']);
  });
});

describe('masterDataChanges (what makes a write a kunde.aktualisiert)', () => {
  const before = { name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact' };
  test('identical rows → []', () => assert.deepEqual(kunde.masterDataChanges(before, { ...before }), []));
  test('each master column reports under its German name', () => {
    assert.deepEqual(kunde.masterDataChanges(before, { ...before, name: 'Erik Muster' }), ['ansprechpartner']);
    assert.deepEqual(kunde.masterDataChanges(before, { ...before, email: 'neu@muster.de' }), ['email']);
    assert.deepEqual(kunde.masterDataChanges(before, { ...before, phone: null }), ['telefon']);
    assert.deepEqual(kunde.masterDataChanges(before, { ...before, company: 'Muster AG' }), ['firma']);
    assert.deepEqual(kunde.masterDataChanges(before, { ...before, contact_type: 'supplier' }), ['kontakt_typ']);
    assert.deepEqual(kunde.masterDataChanges(before, { ...before, name: 'X', company: 'Y' }), ['ansprechpartner', 'firma']);
  });
  test('whitespace, empty-vs-null and email case are not changes', () => {
    assert.deepEqual(kunde.masterDataChanges(before, { ...before, name: '  Erika Muster ', email: 'ERIKA@Muster.de' }), []);
    assert.deepEqual(kunde.masterDataChanges({ ...before, phone: null }, { ...before, phone: '' }), []);
    assert.deepEqual(kunde.masterDataChanges({ ...before, phone: undefined }, { ...before, phone: null }), []);
  });
  test('only columns present in both objects are compared (a subset write compares the subset)', () => {
    assert.deepEqual(kunde.masterDataChanges({ ...before, rechtsform: 'GmbH' }, { name: 'Erika Muster', phone: '+49 30 2', company: 'Muster GmbH' }), ['telefon']);
    assert.deepEqual(kunde.masterDataChanges(before, { assigned_to: 9, custom_data: { a: 1 } }), [], 'non-master columns never count');
    assert.deepEqual(kunde.masterDataChanges(null, before), []); assert.deepEqual(kunde.masterDataChanges(before, undefined), []);
  });
  test('the three address columns collapse into one "adresse"', () => {
    const b = { ...before, strasse: 'A 1', plz: '01067', ort: 'Dresden' };
    assert.deepEqual(kunde.masterDataChanges(b, { ...b, strasse: 'B 2', ort: 'Berlin' }), ['adresse']);
    assert.deepEqual(kunde.masterDataChanges(b, { ...b, plz: '01068', name: 'N' }), ['ansprechpartner', 'adresse']);
  });
  test('the German-column fields report under their own names', () => {
    const b = { ...before, rechtsform: 'GmbH', ust_id: 'DE1', handelsregisternummer: 'HRB 1', webseite: null, quelle: 'Empfehlung' };
    assert.deepEqual(kunde.masterDataChanges(b, { ...b, rechtsform: 'AG', ust_id: 'DE2', handelsregisternummer: 'HRB 2', webseite: 'https://m.de', quelle: 'Web' }),
      ['rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle']);
  });
});
