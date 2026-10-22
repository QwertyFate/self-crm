// ROUTE tests for the landing page's request form (routes/landing.js, LOGIN_LANDING_CHANGES Part 42, 2026-10-21).
// PUBLIC. POST /api/landing/ask turns a visitor's request into a lead in the Upgrads team's own workspace by posting it
// to that workspace's inbound webhook (LANDING_LEAD_URL, copied from Integrations → Webhook): the same path every
// website form takes, so the field map, the contact matched by email, the deal and the delivery log all apply.
// GET /api/landing/status says whether that is set up ({ ready }), so the page never promises what it cannot do.
// Pinned: not set up → 503 and the page mails instead; a name and an email are required; a filled hidden field (a bot)
// is answered as a success and sent nowhere; what is sent (trimmed, capped, empty fields left out, the source and the
// language); the receiver's refusal or silence is a 502; server.js mounts it with its own limit before the catch-all.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const HOOK = 'https://crm.example.de/api/integrations/receive/abc123';
let srv, sent, answer;
const realFetch = globalThis.fetch;
before(async () => { srv = await serve({ '/api/landing': loadRoute('landing.js', { pool: { query: async () => { throw new Error('no database here'); } } }) }); });
after(async () => { globalThis.fetch = realFetch; await srv.close(); delete process.env.LANDING_LEAD_URL; });
beforeEach(() => {
  delete process.env.LANDING_LEAD_URL; sent = []; answer = { status: 200, body: { success: true, contact_id: 7, deal_id: 9 } };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    sent.push({ url: u, init, body: JSON.parse(init.body) });
    if (answer.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  };
});
const ask = body => srv.request('POST', '/api/landing/ask', body);
const OK = { name: '  Anna   Weiß ', email: 'Anna@Example.de ', company: 'Weiß Immobilien', phone: '', message: '  Mehr Zeit fürs Verkaufen.  ', lang: 'de', website: '' };

describe('whether the form can deliver', () => {
  test('GET /status: not ready without LANDING_LEAD_URL, ready with an http(s) address', async () => {
    assert.deepEqual((await srv.request('GET', '/api/landing/status')).body, { ready: false });
    process.env.LANDING_LEAD_URL = HOOK;
    assert.deepEqual((await srv.request('GET', '/api/landing/status')).body, { ready: true });
    process.env.LANDING_LEAD_URL = 'ftp://nope';
    assert.deepEqual((await srv.request('GET', '/api/landing/status')).body, { ready: false });
  });
  test('not set up: 503 not_configured, nothing sent (the page mails instead)', async () => {
    const r = await ask(OK);
    assert.equal(r.status, 503); assert.deepEqual(r.body, { error: 'not_configured' });
    assert.equal(sent.length, 0);
  });
});

describe('a request', () => {
  test('lands on the inbound webhook: trimmed, the email lowercased, empty fields left out, the source and the language added', async () => {
    process.env.LANDING_LEAD_URL = HOOK;
    const r = await ask(OK);
    assert.equal(r.status, 200); assert.deepEqual(r.body, { success: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, HOOK); assert.equal(sent[0].init.method, 'POST');
    assert.equal(sent[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(sent[0].body, { name: 'Anna Weiß', email: 'anna@example.de', company: 'Weiß Immobilien', message: 'Mehr Zeit fürs Verkaufen.', source: 'Landingpage', language: 'de' });
  });
  test('a name and a real-looking email are required; long fields are capped', async () => {
    process.env.LANDING_LEAD_URL = HOOK;
    assert.equal((await ask({ ...OK, name: 'A' })).status, 400);
    assert.equal((await ask({ ...OK, email: 'not-an-email' })).status, 400);
    assert.equal((await ask({})).status, 400);
    assert.equal(sent.length, 0);
    await ask({ ...OK, name: 'N'.repeat(300), company: 'C'.repeat(300), phone: '1'.repeat(80), message: 'M'.repeat(5000), lang: 'en' });
    const b = sent[0].body;
    assert.equal(b.name.length, 120); assert.equal(b.company.length, 120); assert.equal(b.phone.length, 40); assert.equal(b.message.length, 1000); assert.equal(b.language, 'en');
  });
  test('a filled hidden field (a bot) is answered as a success and sent nowhere', async () => {
    process.env.LANDING_LEAD_URL = HOOK;
    const r = await ask({ ...OK, website: 'http://spam.example' });
    assert.equal(r.status, 200); assert.deepEqual(r.body, { success: true });
    assert.equal(sent.length, 0);
  });
  test('the receiver refusing (404, 422) or not answering is a 502, so the page can mail instead', async () => {
    process.env.LANDING_LEAD_URL = HOOK;
    answer = { status: 404, body: { error: 'Webhook not found or inactive' } };
    assert.deepEqual((await ask(OK)).body, { error: 'not_received' });
    answer = { status: 422, body: { error: 'No name or email' } };
    assert.equal((await ask(OK)).status, 502);
    answer = { throw: true };
    assert.equal((await ask(OK)).status, 502);
  });
});

describe('the wiring', () => {
  test('server.js: a limit of five requests per quarter hour per address on /ask, the public router, both before the catch-all; .env.example names the setting', () => {
    const s = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert.match(s, /const landingAskLimiter = rateLimit\(\{\s*windowMs: 15 \* 60 \* 1000, max: 5,/);
    const lim = s.indexOf("app.use('/api/landing/ask', landingAskLimiter);"), mount = s.indexOf("app.use('/api/landing',       require('./routes/landing'));"), all = s.indexOf("app.get('*'");
    assert.ok(lim > 0 && mount > lim && all > mount);
    const r = fs.readFileSync(path.join(ROOT, 'routes', 'landing.js'), 'utf8');
    assert.doesNotMatch(r, /requireAuth|middleware\/auth/, 'public on purpose');
    assert.match(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8'), /^# ?LANDING_LEAD_URL=$/m);
  });
});
