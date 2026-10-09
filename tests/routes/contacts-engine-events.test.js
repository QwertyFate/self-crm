// ROUTE tests: the kunde.angelegt / kunde.aktualisiert webhooks (briefing §5.1)
// fired by the real contacts.js handlers (POST, PUT) and the real inbound lead
// webhook (integrations.js POST /receive/:key), through the real utils/engine.js
// on a fake pool with a stubbed fetch. Suppliers, unchanged master data, an
// inactive integration and a broken Engine all leave the CRM response alone.
const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const SECRET = 'f'.repeat(64);
const ACTIVE = { workspace_id: 7, engine_url: 'https://engine.example/hook', active: true, trigger_stage_ids: [5], webhook_secret: SECRET };
const CONTACT = { id: 55, workspace_id: 7, name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact',
  onboarding_status: 'kein_onboarding', drive_ordner_id: null, akte_version: 0, rechtsform: null, ust_id: null, handelsregisternummer: null, webseite: null, quelle: 'Webformular',
  strasse: null, plz: null, ort: null, created_at: '2026-10-09T08:00:00.000Z', updated_at: '2026-10-09T09:00:00.000Z' };
const WEBHOOK = { id: 1, workspace_id: 7, webhook_key: 'k1', field_map: { name: 'name', email: 'email', phone: 'phone', company: 'company' }, create_deal: false, pipeline_id: null, stage_id: null, default_assignee_id: null, active: true };

const state = { settings: null, before: null, existing: null, contacts: new Map(), calls: [] };
const pool = {
  query: async (sql, params) => {
    state.calls.push({ sql, params });
    if (sql.includes('FROM workspace_engine'))                                                              return { rows: state.settings ? [state.settings] : [] };
    if (/^SELECT name, email, phone, company, contact_type FROM contacts WHERE id=\$1 AND workspace_id=\$2/.test(sql)) return { rows: state.before ? [state.before] : [] };
    if (/^SELECT id, workspace_id, name, email, phone, company, contact_type,/.test(sql)) {                     // the dispatcher's lookup (utils/kunde.js COLUMNS)
      const c = state.contacts.get(Number(params[0])); return { rows: c && c.workspace_id === params[1] ? [c] : [] };
    }
    if (/^SELECT id FROM contacts WHERE workspace_id=\$1 AND email=\$2/.test(sql))                             return { rows: [] };            // POST duplicate check
    if (/^SELECT id, name, email, phone, company, contact_type FROM contacts WHERE workspace_id=\$1 AND email=\$2/.test(sql)) return { rows: state.existing ? [state.existing] : [] };
    if (sql.startsWith('INSERT INTO contacts'))                                                              return { rows: [{ id: 55, name: params[1] }] };
    if (sql.startsWith('UPDATE contacts'))                                                                   return { rowCount: 1, rows: [{ id: state.existing?.id ?? 60, name: params[0] }] };
    if (sql.includes('FROM workspace_webhook WHERE webhook_key'))                                            return { rows: [WEBHOOK] };
    if (sql.includes('INSERT INTO engine_deliveries'))                                                       return { rows: [{ id: 300 }] };
    if (sql.includes('UPDATE engine_deliveries'))                                                            return { rowCount: 1, rows: [] };
    return { rows: [], rowCount: 0 };
  },
};

let contacts, integrations, engine, fetchCalls;
before(async () => {
  delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
  contacts     = await serve({ '/api/contacts': loadRoute('contacts.js', { pool }) });
  integrations = await serve({ '/api/integrations': loadRoute('integrations.js', { pool }) });
  engine = require(path.join(ROOT, 'utils', 'engine.js'));      // the instance both routes just loaded
});
after(async () => { await contacts.close(); await integrations.close(); });
beforeEach(() => {
  state.settings = { ...ACTIVE }; state.before = null; state.existing = null; state.calls.length = 0;
  state.contacts.clear(); state.contacts.set(55, { ...CONTACT });
  fetchCalls = [];
  engine.configure({ timeoutMs: 50, fetch: async (url, init) => { fetchCalls.push({ url, init }); return { status: 200, text: async () => '' }; } });
});
afterEach(() => engine.resetConfig());

const sent      = () => fetchCalls.map(c => JSON.parse(c.init.body));
const logRows   = () => state.calls.filter(c => c.sql.includes('INSERT INTO engine_deliveries'));
const STAMMDATEN_KEYS = ['firma', 'ansprechpartner', 'email', 'telefon', 'kontakt_typ', 'adresse', 'rechtsform', 'ust_id', 'handelsregisternummer', 'webseite', 'quelle'];

describe('POST /api/contacts → kunde.angelegt', () => {
  test('a new contact: 201 and one signed event carrying the master data and erstellt_am; delivery logged against the contact, no deal', async () => {
    const r = await contacts.request('POST', '/api/contacts', { name: 'Erika Muster', email: 'Erika@Muster.de', phone: '+49 30 1', company: 'Muster GmbH' });
    assert.equal(r.status, 201); assert.deepEqual(r.body, { id: 55 });
    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    const [p] = sent();
    assert.deepEqual(Object.keys(p), ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    assert.equal(p.event, 'kunde.angelegt');
    assert.equal(p.kunde_id, 55);
    assert.deepEqual(Object.keys(p.daten), [...STAMMDATEN_KEYS, 'erstellt_am']);
    assert.equal(p.daten.firma, 'Muster GmbH'); assert.equal(p.daten.ansprechpartner, 'Erika Muster'); assert.equal(p.daten.quelle, 'Webformular');
    assert.deepEqual(p.daten.adresse, { strasse: null, plz: null, ort: null });
    assert.equal(p.daten.erstellt_am, '2026-10-09T08:00:00.000Z');
    assert.equal('geaendert' in p.daten, false);
    const h = fetchCalls[0].init.headers;
    assert.equal(h['X-Upgrads-Event'], 'kunde.angelegt');
    assert.deepEqual(engine.verify(SECRET, fetchCalls[0].init.body, h['X-Upgrads-Signature']), { ok: true });
    const log = logRows();
    assert.equal(log.length, 1);
    assert.equal(log[0].params[1], 'kunde.angelegt'); assert.equal(log[0].params[3], null, 'deal_id'); assert.equal(log[0].params[4], 55, 'contact_id');
    const lookup = state.calls.find(c => /^SELECT id, workspace_id, name, email/.test(c.sql));
    assert.deepEqual(lookup.params, [55, 7], 'the dispatcher reads the contact scoped to the workspace');
  });
  test('a supplier: 201, no event, nothing logged', async () => {
    state.contacts.set(55, { ...CONTACT, contact_type: 'supplier' });
    const r = await contacts.request('POST', '/api/contacts', { name: 'Lieferant', contact_type: 'supplier' });
    assert.equal(r.status, 201);
    await engine.drain();
    assert.equal(fetchCalls.length, 0); assert.equal(logRows().length, 0);
  });
  test('integration off, or no settings row: 201 and silence', async () => {
    state.settings = { ...ACTIVE, active: false };
    assert.equal((await contacts.request('POST', '/api/contacts', { name: 'A' })).status, 201);
    state.settings = null;
    assert.equal((await contacts.request('POST', '/api/contacts', { name: 'B' })).status, 201);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('a broken Engine never changes the 201; the delivery waits for the retry worker', async () => {
    engine.configure({ fetch: async () => { throw new Error('connect ECONNREFUSED'); } });
    const r = await contacts.request('POST', '/api/contacts', { name: 'Erika Muster' });
    assert.equal(r.status, 201);
    await engine.drain();
    const last = state.calls.filter(c => c.sql.includes('UPDATE engine_deliveries')).at(-1);
    assert.equal(last.params[3], 'pending');
  });
});

describe('PUT /api/contacts/:id → kunde.aktualisiert', () => {
  const BEFORE = { name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact' };
  beforeEach(() => { state.before = { ...BEFORE }; });

  test('changed email and phone: 200 and one event with geaendert = [email, telefon] and aktualisiert_am', async () => {
    const r = await contacts.request('PUT', '/api/contacts/55', { ...BEFORE, email: 'neu@muster.de', phone: '+49 30 2', assigned_to: 3 });
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    const [p] = sent();
    assert.equal(p.event, 'kunde.aktualisiert'); assert.equal(p.kunde_id, 55);
    assert.deepEqual(Object.keys(p.daten), [...STAMMDATEN_KEYS, 'geaendert', 'aktualisiert_am']);
    assert.deepEqual(p.daten.geaendert, ['email', 'telefon']);
    assert.equal(p.daten.aktualisiert_am, '2026-10-09T09:00:00.000Z');
    assert.equal(fetchCalls[0].init.headers['X-Upgrads-Event'], 'kunde.aktualisiert');
    assert.equal(logRows()[0].params[1], 'kunde.aktualisiert');
  });
  test('akte_version is bumped by one on a master-data change and by zero otherwise (briefing §5.4: concurrent changes are detectable)', async () => {
    await contacts.request('PUT', '/api/contacts/55', { ...BEFORE, company: 'Muster AG' });
    let upd = state.calls.find(c => c.sql.startsWith('UPDATE contacts'));
    assert.match(upd.sql, /akte_version=akte_version\+\$10::int/);
    assert.equal(upd.params[9], 1);
    state.calls.length = 0;
    await contacts.request('PUT', '/api/contacts/55', { ...BEFORE, assigned_to: 4 });
    upd = state.calls.find(c => c.sql.startsWith('UPDATE contacts'));
    assert.equal(upd.params[9], 0);
    await engine.drain();
  });
  test('the pre-read is scoped and comes before the UPDATE; an unknown contact is 404 with no UPDATE and no event', async () => {
    await contacts.request('PUT', '/api/contacts/55', { ...BEFORE, company: 'X' });
    await engine.drain();
    const pre = state.calls.findIndex(c => /^SELECT name, email, phone, company, contact_type FROM contacts/.test(c.sql));
    const upd = state.calls.findIndex(c => c.sql.startsWith('UPDATE contacts'));
    assert.ok(pre >= 0 && pre < upd);
    assert.deepEqual(state.calls[pre].params, ['55', 7]);
    state.calls.length = 0; fetchCalls.length = 0; state.before = null;
    const r = await contacts.request('PUT', '/api/contacts/99', { ...BEFORE });
    assert.equal(r.status, 404);
    assert.equal(state.calls.some(c => c.sql.startsWith('UPDATE contacts')), false);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('only assigned_to / custom_data changed, or email case / whitespace: no event', async () => {
    assert.equal((await contacts.request('PUT', '/api/contacts/55', { ...BEFORE, assigned_to: 9, custom_data: { x: 1 } })).status, 200);
    assert.equal((await contacts.request('PUT', '/api/contacts/55', { ...BEFORE, name: ' Erika Muster ', email: 'ERIKA@muster.de' })).status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 0); assert.equal(logRows().length, 0);
  });
  test('contact_type omitted keeps the type (COALESCE) and is not a change', async () => {
    const body = { ...BEFORE }; delete body.contact_type;
    await contacts.request('PUT', '/api/contacts/55', body);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('a supplier that becomes a contact is NEW to the Engine: kunde.angelegt, not aktualisiert', async () => {
    state.before = { ...BEFORE, contact_type: 'supplier' };
    await contacts.request('PUT', '/api/contacts/55', { ...BEFORE, contact_type: 'contact' });
    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    assert.equal(sent()[0].event, 'kunde.angelegt');
  });
  test('a supplier whose data changes stays silent (not a client)', async () => {
    state.before = { ...BEFORE, contact_type: 'supplier' }; state.contacts.set(55, { ...CONTACT, contact_type: 'supplier' });
    await contacts.request('PUT', '/api/contacts/55', { ...BEFORE, contact_type: 'supplier', company: 'Neu' });
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
});

describe('POST /api/integrations/receive/:key (a lead comes in)', () => {
  test('unknown email: the contact is inserted and kunde.angelegt goes out', async () => {
    const r = await integrations.request('POST', '/api/integrations/receive/k1', { name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH' });
    assert.equal(r.status, 200); assert.equal(r.body.contact_id, 55);
    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    assert.equal(sent()[0].event, 'kunde.angelegt'); assert.equal(sent()[0].kunde_id, 55);
  });
  test('no email at all: still a new contact → kunde.angelegt', async () => {
    await integrations.request('POST', '/api/integrations/receive/k1', { name: 'Nur Name' });
    await engine.drain();
    assert.equal(fetchCalls.length, 1); assert.equal(sent()[0].event, 'kunde.angelegt');
  });
  test('known email with a new phone: the existing row is updated and kunde.aktualisiert names telefon', async () => {
    state.existing = { id: 60, name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact' };
    state.contacts.set(60, { ...CONTACT, id: 60 });
    const r = await integrations.request('POST', '/api/integrations/receive/k1', { name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 2', company: 'Muster GmbH' });
    assert.equal(r.status, 200); assert.equal(r.body.contact_id, 60);
    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    const [p] = sent();
    assert.equal(p.event, 'kunde.aktualisiert'); assert.equal(p.kunde_id, 60);
    assert.deepEqual(p.daten.geaendert, ['telefon']);
    const sel = state.calls.find(c => /FROM contacts WHERE workspace_id=\$1 AND email=\$2/.test(c.sql));
    assert.match(sel.sql, /^SELECT id, name, email, phone, company, contact_type FROM contacts/, 'the lookup now reads the master data it compares against');
    const upd = state.calls.find(c => c.sql.startsWith('UPDATE contacts'));
    assert.match(upd.sql, /akte_version=akte_version\+\$7::int/); assert.equal(upd.params[6], 1, 'a changed lead bumps akte_version');
  });
  test('known email, same data: no event', async () => {
    state.existing = { id: 60, name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH', contact_type: 'contact' };
    state.contacts.set(60, { ...CONTACT, id: 60 });
    await integrations.request('POST', '/api/integrations/receive/k1', { name: 'Erika Muster', email: 'erika@muster.de', phone: '+49 30 1', company: 'Muster GmbH' });
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
    assert.equal(state.calls.find(c => c.sql.startsWith('UPDATE contacts')).params[6], 0, 'an unchanged lead does not bump akte_version');
  });
  test('known email that is a supplier: updated in the CRM, nothing to the Engine', async () => {
    state.existing = { id: 60, name: 'Lieferant', email: 'l@x.de', phone: null, company: null, contact_type: 'supplier' };
    state.contacts.set(60, { ...CONTACT, id: 60, contact_type: 'supplier' });
    await integrations.request('POST', '/api/integrations/receive/k1', { name: 'Lieferant', email: 'l@x.de', phone: '+1' });
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('the inbound webhook is still public and the Engine side never touches the lead response', async () => {
    engine.configure({ fetch: async () => { throw new Error('down'); } });
    const r = await integrations.request('POST', '/api/integrations/receive/k1', { name: 'A', email: 'a@b.de' });
    assert.equal(r.status, 200); assert.equal(r.body.success, true);
    await engine.drain();
  });
});
