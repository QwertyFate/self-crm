// ROUTE tests: moving a deal into a trigger stage through the real deals.js
// handlers fires exactly one signed vertrag.unterschrieben POST; every other
// write leaves the Engine alone, and a broken Engine never breaks the CRM.
const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const SECRET = 'd'.repeat(64);
const state = { before: { stage_id: 2, contact_id: 9, title: 'Acme' }, settings: null, calls: [] };
const pool = {
  query: async (sql, params) => {
    state.calls.push({ sql, params });
    if (/SELECT stage_id, contact_id, title FROM deals/.test(sql)) return { rows: state.before ? [state.before] : [] };
    if (sql.startsWith('UPDATE deals'))                 return { rowCount: state.before ? 1 : 0, rows: [] };
    if (sql.startsWith('INSERT INTO deals'))            return { rows: [{ id: 55 }] };
    if (sql.includes('FROM workspace_engine'))          return { rows: state.settings ? [state.settings] : [] };
    if (sql.includes('FROM pipeline_stages'))           return { rows: [{ name: 'Contract Signed' }] };
    if (sql.includes('FROM contact_documents'))         return { rows: state.vertragDoc ? [state.vertragDoc] : [] };
    if (sql.includes('INSERT INTO engine_deliveries'))  return { rows: [{ id: 300 }] };
    if (sql.includes('UPDATE engine_deliveries'))       return { rowCount: 1, rows: [] };
    return { rows: [] };
  },
};

let server, engine, fetchCalls;
before(async () => {
  delete require.cache[path.join(ROOT, 'utils', 'engine.js')];
  // The acting user sits in UTC+14 so the "signed on" date provably follows req.userTimezone, not the server clock.
  server = await serve({ '/api/deals': loadRoute('deals.js', { pool, user: { id: 1, workspaceId: 7, role: 'owner', timezone: 'Pacific/Kiritimati' } }) });
  engine = require(path.join(ROOT, 'utils', 'engine.js'));      // same instance the route just loaded
});
after(async () => { await server.close(); });
beforeEach(() => {
  state.before = { stage_id: 2, contact_id: 9, title: 'Acme' };
  state.settings = { workspace_id: 7, engine_url: 'https://engine.example/hook', active: true, trigger_stage_ids: [5], webhook_secret: SECRET };
  state.calls.length = 0;
  fetchCalls = [];
  engine.configure({ timeoutMs: 50, fetch: async (url, init) => { fetchCalls.push({ url, init }); return { status: 200, text: async () => '' }; } });
});
afterEach(() => engine.resetConfig());

const sentPayload = () => JSON.parse(fetchCalls[0].init.body);

describe('PATCH /api/deals/:id/stage', () => {
  test('into a trigger stage: 200 and one signed event in the briefing envelope (kunde_id, daten.vertrag_id / produkt / unterschrieben_am)', async () => {
    const r = await server.request('PATCH', '/api/deals/1/stage', { stage_id: '5' });
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    const p = sentPayload();
    assert.deepEqual(Object.keys(p), ['event', 'event_id', 'zeitpunkt', 'kunde_id', 'daten']);
    assert.equal(p.event, 'vertrag.unterschrieben');
    assert.equal(p.kunde_id, 9);
    assert.equal(p.daten.vertrag_id, 1);
    assert.equal(p.daten.produkt, 'Acme');
    assert.equal(p.daten.unterschrieben_am, engine.dateInZone(new Date(), 'Pacific/Kiritimati'), 'dated in the acting user\'s zone (req.userTimezone)');
    assert.equal('stage' in p, false);
    const h = fetchCalls[0].init.headers;
    assert.equal('X-Upgrads-Timestamp' in h, false);
    assert.deepEqual(engine.verify(SECRET, fetchCalls[0].init.body, h['X-Upgrads-Signature']), { ok: true });
  });
  test('dokument_url: null without a contract document; the absolute Engine download URL on this CRM\'s origin when one exists', async () => {
    await server.request('PATCH', '/api/deals/1/stage', { stage_id: '5' });
    await engine.drain();
    assert.equal(sentPayload().daten.dokument_url, null);
    fetchCalls.length = 0; state.vertragDoc = { id: 9 };
    await server.request('PATCH', '/api/deals/1/stage', { stage_id: '5' });
    await engine.drain();
    assert.equal(sentPayload().daten.dokument_url, `${server.base}/api/dokumente/9/download`, 'built from the request host (utils/base-url.js)');
    state.vertragDoc = null;
  });
  test('the pre-read is scoped to the workspace and happens before the UPDATE', async () => {
    await server.request('PATCH', '/api/deals/1/stage', { stage_id: 5 });
    await engine.drain();
    const pre = state.calls.findIndex(c => /SELECT stage_id, contact_id, title FROM deals/.test(c.sql));
    const upd = state.calls.findIndex(c => c.sql.startsWith('UPDATE deals'));
    assert.ok(pre >= 0 && pre < upd, 'SELECT runs before UPDATE');
    assert.match(state.calls[pre].sql, /workspace_id\s*=\s*\$2/);
    assert.deepEqual(state.calls[pre].params, ['1', 7]);
    assert.ok(!state.calls.some(c => /SELECT title FROM deals WHERE id=\$1'?$/.test(c.sql.trim())), 'the old unscoped title lookup is gone');
  });
  test('same stage again: no event', async () => {
    state.before.stage_id = 5;
    const r = await server.request('PATCH', '/api/deals/1/stage', { stage_id: '5' });
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
    assert.equal(state.calls.filter(c => c.sql.includes('engine_deliveries')).length, 0, 'nothing logged');
  });
  test('into a non-trigger stage: no event', async () => {
    const r = await server.request('PATCH', '/api/deals/1/stage', { stage_id: 3 });
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('clearing the stage: no event', async () => {
    const r = await server.request('PATCH', '/api/deals/1/stage', { stage_id: null });
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('unknown deal: 404, no UPDATE, no event', async () => {
    state.before = null;
    const r = await server.request('PATCH', '/api/deals/99/stage', { stage_id: 5 });
    assert.equal(r.status, 404);
    await engine.drain();
    assert.equal(state.calls.filter(c => c.sql.startsWith('UPDATE deals')).length, 0);
    assert.equal(fetchCalls.length, 0);
  });
  test('integration inactive: 200, no event', async () => {
    state.settings.active = false;
    const r = await server.request('PATCH', '/api/deals/1/stage', { stage_id: 5 });
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('a rejecting fetch never changes the response; the delivery stays pending for the retry worker', async () => {
    engine.configure({ fetch: async () => { throw new Error('connect ECONNREFUSED'); } });
    const r = await server.request('PATCH', '/api/deals/1/stage', { stage_id: 5 });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true });
    await engine.drain();
    const last = state.calls.filter(c => c.sql.includes('UPDATE engine_deliveries')).at(-1);
    assert.equal(last.params[3], 'pending');
    assert.ok(last.params[5] instanceof Date, 'next attempt scheduled');
    assert.match(last.params[2], /ECONNREFUSED/);
  });
});

describe('PUT /api/deals/:id', () => {
  const body = { title: 'Acme renewal', contact_id: '12', pipeline_id: 1, stage_id: '5', value: 100 };
  test('into a trigger stage fires with the NEW title and contact', async () => {
    const r = await server.request('PUT', '/api/deals/1', body);
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    const p = sentPayload();
    assert.equal(p.daten.produkt, 'Acme renewal');
    assert.equal(p.kunde_id, 12);
    assert.equal(p.daten.vertrag_id, 1);
  });
  test('into a trigger stage WITHOUT a contact: 200, nothing sent, the delivery is logged as failed with the kunde_id reason', async () => {
    const r = await server.request('PUT', '/api/deals/1', { ...body, contact_id: null });
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
    const log = state.calls.filter(c => c.sql.includes('engine_deliveries'));
    assert.equal(log.length, 2, 'INSERT + UPDATE');
    assert.match(log[1].sql, /status='failed'/);
    assert.match(log[1].params[0], /kunde_id/);
  });
  test('saving the modal without changing the stage: no event', async () => {
    state.before.stage_id = 5;
    const r = await server.request('PUT', '/api/deals/1', body);
    assert.equal(r.status, 200);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
  test('unknown deal: 404 and no UPDATE', async () => {
    state.before = null;
    const r = await server.request('PUT', '/api/deals/1', body);
    assert.equal(r.status, 404);
    assert.equal(state.calls.filter(c => c.sql.startsWith('UPDATE deals')).length, 0);
  });
  test('missing title is still a 400 before anything else', async () => {
    const r = await server.request('PUT', '/api/deals/1', { ...body, title: '' });
    assert.equal(r.status, 400);
    assert.equal(state.calls.length, 0);
  });
});

describe('POST /api/deals', () => {
  test('created directly in a trigger stage fires with the new id', async () => {
    const r = await server.request('POST', '/api/deals', { title: 'New signed', pipeline_id: 1, stage_id: 5, contact_id: 9 });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { id: 55 });
    await engine.drain();
    assert.equal(fetchCalls.length, 1);
    assert.equal(sentPayload().daten.vertrag_id, 55);
    assert.equal(sentPayload().daten.produkt, 'New signed');
  });
  test('created in another stage: no event', async () => {
    const r = await server.request('POST', '/api/deals', { title: 'Lead', pipeline_id: 1, stage_id: 1 });
    assert.equal(r.status, 201);
    await engine.drain();
    assert.equal(fetchCalls.length, 0);
  });
});
