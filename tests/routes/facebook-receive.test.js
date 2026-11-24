// ROUTE tests for /api/integrations/facebook/receive (FACEBOOK_CHANGES Part 3, 2026-11-24): the public address where
// Facebook says "a lead arrived" (routes/facebook-receive.js), through to the contact the lead webhook makes of it.
//
// The real route runs on a throwaway server built the way server.js builds this path — express.raw first, so the
// signature is checked over the bytes that were sent. Behind it run the real utils/facebook.js, the real
// utils/facebook-leads.js and the real delivery of a lead webhook (routes/integrations.js takeDelivery). The database
// is a stand-in that knows their statements and keeps rows; Facebook is a stand-in too (global fetch is replaced for
// Facebook's addresses only). Nothing leaves the machine.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { loadRoute } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');
const { sealKey } = require('../../utils/calcom');
const fb = require('../../utils/facebook');

const realFetch = globalThis.fetch, realNow = Date.now, saved = {};
const ENV = ['META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'META_SCOPES'];
const flat = sql => String(sql).replace(/\s+/g, ' ').trim();
const state = { leads: new Map(), pages: [], hooks: [], contacts: [], logs: [], sql: [], asked: [], facebook: null, brokenDb: false, slow: 0 };
const pool = { query: async (sql, p) => {
  const t = flat(sql);
  state.sql.push({ sql: t, params: p });
  if (state.brokenDb) throw new Error('the database is away');
  // utils/facebook-leads.js
  if (t.startsWith('INSERT INTO facebook_leads (leadgen_id, page_id, form_id) VALUES ($1, $2, $3) ON CONFLICT (leadgen_id) DO UPDATE')) {
    const old = state.leads.get(p[0]);
    if (!old) { state.leads.set(p[0], { page_id: p[1], form_id: p[2], status: 'working', tries: 1 }); return { rows: [{ leadgen_id: p[0] }] }; }
    if (old.status === 'failed') { old.status = 'working'; old.tries++; return { rows: [{ leadgen_id: p[0] }] }; }
    return { rows: [] };
  }
  if (t === 'SELECT status FROM facebook_leads WHERE leadgen_id = $1') return { rows: state.leads.has(p[0]) ? [{ status: state.leads.get(p[0]).status }] : [] };
  if (t === 'SELECT page_id, page_name, workspace_id, webhook_id, token FROM facebook_pages WHERE page_id = $1') return { rows: state.pages.filter(g => g.page_id === p[0]) };
  if (t === 'SELECT * FROM workspace_webhook WHERE id = $1 AND workspace_id = $2') return { rows: state.hooks.filter(h => h.id === p[0] && h.workspace_id === p[1]) };
  if (t.startsWith('UPDATE facebook_leads SET status = $2, reason = $3, detail = $4, workspace_id = $5, webhook_id = $6, contact_id = $7, deal_id = $8, updated_at = NOW() WHERE leadgen_id = $1')) {
    Object.assign(state.leads.get(p[0]), { status: p[1], reason: p[2], detail: p[3], workspace_id: p[4], webhook_id: p[5], contact_id: p[6], deal_id: p[7] }); return { rows: [], rowCount: 1 };
  }
  // routes/integrations.js takeDelivery
  if (t === 'UPDATE workspace_webhook SET sample=$2::jsonb, sample_at=NOW(), test_until=NULL WHERE id=$1 AND test_until > NOW() RETURNING id') {
    const h = state.hooks.find(x => x.id === p[0] && x.test_until && new Date(x.test_until).getTime() > realNow());
    if (!h) return { rows: [] };
    Object.assign(h, { sample: JSON.parse(p[1]), test_until: null }); return { rows: [{ id: h.id }] };
  }
  if (t === 'SELECT id, name, email, phone, company, contact_type FROM contacts WHERE workspace_id=$1 AND email=$2') return { rows: state.contacts.filter(c => c.workspace_id === p[0] && c.email === p[1]) };
  if (t.startsWith('INSERT INTO contacts (workspace_id, name, email, phone, company, contact_type, custom_data, assigned_to)')) {
    const c = { id: 500 + state.contacts.length, workspace_id: p[0], name: p[1], email: p[2], phone: p[3], company: p[4], custom_data: JSON.parse(p[5]), assigned_to: p[6] };
    state.contacts.push(c); return { rows: [{ id: c.id, name: c.name }] };
  }
  if (t.startsWith('UPDATE contacts SET name=$1, phone=$2, company=$3, custom_data=custom_data || $4::jsonb')) { const c = state.contacts.find(x => x.id === p[4] && x.workspace_id === p[5]); Object.assign(c, { name: p[0], phone: p[1], company: p[2] }); return { rows: [{ id: c.id, name: c.name }] }; }
  if (t.startsWith('INSERT INTO webhook_logs (workspace_id, webhook_id, status, payload, captured')) { state.logs.push({ workspace_id: p[0], webhook_id: p[1], status: /VALUES \(\$1,\$2,'(\w+)'/.exec(t)[1], payload: JSON.parse(p[2]), captured: JSON.parse(p[3]) }); return { rows: [] }; }
  throw new Error(`a statement nobody expected: ${t}`);   // the Engine's own questions end here, as for a workspace without the Engine
} };

// Facebook: one lead per id, asked by the path; state.facebook(u) may answer otherwise.
const fbAnswer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const LEAD = id => ({ id, created_time: '2026-11-24T09:00:00+0000', field_data: [{ name: 'email', values: [`lead${id}@example.de`] }, { name: 'full_name', values: [`Lead ${id}`] }, { name: 'budget', values: ['300.000', '400.000'] }], form_id: '12', campaign_name: 'Herbst <b>' });
let clockAhead = 0;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.hostname !== 'graph.facebook.com') return realFetch(url, init);
  state.asked.push(u);
  clockAhead += state.slow;
  const special = state.facebook && state.facebook(u);
  if (special instanceof Error) throw special;
  return special || fbAnswer(LEAD(u.pathname.split('/').pop()));
};

let srv;
const sign = (raw, secret = 's3cret') => 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
const message = (...ids) => JSON.stringify({ object: 'page', entry: [{ id: '100', time: 1, changes: ids.map(id => ({ field: 'leadgen', value: typeof id === 'object' ? id : { leadgen_id: id, page_id: '100', form_id: '12', created_time: 1 } })) }] });
async function serveLikeServer(raw = true) {
  const app = express();
  if (raw) app.use('/api/integrations/facebook/receive', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json());
  app.use('/api/integrations/facebook', loadRoute('facebook-receive.js', { pool }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/integrations/facebook/receive`;
  return {
    async post(raw, headers) { const res = await realFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers || { 'X-Hub-Signature-256': sign(raw) }) }, body: raw }); let json = null; try { json = await res.json(); } catch {} return { status: res.status, body: json }; },
    async get(query) { const res = await realFetch(`${base}?${query}`); return { status: res.status, text: await res.text(), type: res.headers.get('content-type') || '' }; },
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

before(async () => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  Date.now = () => realNow() + clockAhead;
  srv = await serveLikeServer();
});
after(async () => { await srv.close(); globalThis.fetch = realFetch; Date.now = realNow; for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => {
  Object.assign(process.env, { META_APP_ID: '1234567890', META_APP_SECRET: 's3cret' });
  clockAhead = 0;
  Object.assign(state, { leads: new Map(), contacts: [], logs: [], sql: [], asked: [], facebook: null, brokenDb: false, slow: 0,
    pages: [{ page_id: '100', page_name: 'Müller Immobilien', workspace_id: 7, webhook_id: 70, token: sealKey('PAGE-TOKEN-100') }],
    hooks: [{ id: 70, workspace_id: 7, webhook_key: 'k70', name: 'Facebook', active: true, test_until: null, create_deal: false, default_assignee_id: 3,
      field_map: { name: 'field_data[name=full_name].values', email: 'field_data[name=email].values', budget: 'field_data[name=budget].values', kampagne: 'campaign_name', seite: 'page_name' } }] });
});

describe('Facebook asks once whether this is the right server', () => {
  const ask = (over = {}) => srv.get(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': fb.verifyToken(), 'hub.challenge': '1158201444', ...over }).toString());
  test('with the word made from the app\'s secret: the challenge comes back, as plain text', async () => {
    const r = await ask();
    assert.deepEqual([r.status, r.text], [200, '1158201444']);
    assert.match(r.type, /^text\/plain/);
    assert.equal(state.sql.length, 0, 'the database is not asked');
  });
  test('everything else is refused, and nothing of the request comes back', async () => {
    for (const over of [{ 'hub.verify_token': 'guess' }, { 'hub.verify_token': '' }, { 'hub.mode': 'unsubscribe' }, { 'hub.challenge': '<script>alert(1)</script>' }, { 'hub.challenge': '' }, { 'hub.challenge': 'x'.repeat(201) }]) {
      const r = await ask(over);
      assert.deepEqual([r.status, r.text], [403, 'Forbidden'], JSON.stringify(over));
      assert.match(r.type, /^text\/plain/);
    }
    assert.equal((await srv.get('hub.mode=subscribe&hub.challenge=5')).status, 403, 'no word at all');
    const list = await srv.get(`hub.mode=subscribe&hub.challenge[]=5&hub.verify_token=${fb.verifyToken()}`);
    assert.deepEqual([list.status, list.text], [403, 'Forbidden'], 'a challenge that is a list is none');
    assert.equal((await srv.get(`hub.mode=subscribe&hub.challenge=5&hub.challenge=6&hub.verify_token=${fb.verifyToken()}`)).status, 403, 'a challenge named twice is none');
    process.env.META_APP_SECRET = '';
    assert.equal((await ask({ 'hub.verify_token': 'b916f8255e0b872d05103bb6fbc636ca0e5242b6' })).status, 403, 'without an app no word counts');
  });
});

describe('a message counts only when Facebook signed it', () => {
  test('without a signature, with a wrong one, or signed over other bytes: refused, and nothing is read', async () => {
    const raw = message('900');
    for (const headers of [{}, { 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) }, { 'X-Hub-Signature-256': sign(raw, 'guess') }, { 'X-Hub-Signature-256': sign(raw + ' ') }, { 'X-Hub-Signature': sign(raw) }]) {
      const r = await srv.post(raw, headers);
      assert.deepEqual([r.status, r.body], [401, { error: 'Bad signature' }], JSON.stringify(headers));
    }
    assert.deepEqual([state.sql.length, state.asked.length, state.contacts.length], [0, 0, 0]);
  });
  test('the signature is checked over the bytes as they were sent: that is why server.js keeps them', async () => {
    const raw = message('900').replace('{"object"', '{ "object"');   // the same JSON, other bytes
    assert.equal((await srv.post(raw)).status, 200);
    const plain = await serveLikeServer(false);
    try { assert.equal((await plain.post(raw)).status, 401, 'read by express.json() first, the bytes are gone'); } finally { await plain.close(); }
    const s = read('server.js');
    const iRaw = s.indexOf("app.use('/api/integrations/facebook/receive', express.raw({ type: '*/*', limit: '1mb' }));"), iJson = s.indexOf('app.use(express.json());');
    const iLimit = s.indexOf("app.use('/api/integrations/facebook/receive', webhookIpLimiter);"), iRoute = s.indexOf("app.use('/api/integrations/facebook', require('./routes/facebook-receive'));"), iRest = s.indexOf("app.use('/api/integrations',  integrations);");
    assert.ok(iRaw > 0 && iRaw < iJson, 'raw before json');
    assert.ok(iLimit > iJson && iLimit < iRoute && iRoute < iRest, 'limited per IP, and mounted ahead of the other integrations');
  });
  test('without a Facebook app on this server there is no such address', async () => {
    process.env.META_APP_ID = '';
    const raw = message('900');
    assert.deepEqual([(await srv.post(raw)).status, state.sql.length], [404, 0]);
  });
});

describe('a lead arrives', () => {
  test('it is fetched with the Page\'s token and becomes a contact by the lead webhook\'s own mapping', async () => {
    const r = await srv.post(message('900'));
    assert.deepEqual([r.status, r.body], [200, { success: true }]);
    assert.equal(state.asked.length, 1);
    assert.deepEqual([state.asked[0].pathname, state.asked[0].searchParams.get('access_token')], ['/v26.0/900', 'PAGE-TOKEN-100']);
    assert.deepEqual(state.contacts, [{ id: 500, workspace_id: 7, name: 'Lead 900', email: 'lead900@example.de', phone: null, company: null, custom_data: { budget: '300.000, 400.000', kampagne: 'Herbst <b>', seite: 'Müller Immobilien' }, assigned_to: 3 }]);
    assert.deepEqual(state.leads.get('900'), { page_id: '100', form_id: '12', status: 'done', tries: 1, reason: null, detail: null, workspace_id: 7, webhook_id: 70, contact_id: 500, deal_id: null });
    assert.equal(state.logs.length, 1, 'in the lead webhook\'s own log, like every delivery');
    assert.deepEqual([state.logs[0].status, state.logs[0].webhook_id, state.logs[0].payload.id, state.logs[0].payload.page_id, state.logs[0].captured.email], ['success', 70, '900', '100', 'lead900@example.de']);
    assert.doesNotMatch(JSON.stringify([state.logs, state.contacts, r.body]), /PAGE-TOKEN-100|s3cret/, 'no token is kept with the lead');
  });
  test('announced again, it is taken once', async () => {
    await srv.post(message('900'));
    const r = await srv.post(message('900'));
    assert.deepEqual([r.status, state.asked.length, state.contacts.length, state.logs.length], [200, 1, 1, 1]);
  });
  test('several leads in one message: each its own contact; a known email is the same contact', async () => {
    assert.equal((await srv.post(message('900', '901', '900'))).status, 200);
    assert.deepEqual(state.contacts.map(c => c.email), ['lead900@example.de', 'lead901@example.de']);
    state.facebook = () => fbAnswer({ ...LEAD('902'), field_data: [{ name: 'email', values: ['LEAD900@example.de'] }, { name: 'full_name', values: ['Lead Neunhundert'] }] });
    assert.equal((await srv.post(message('902'))).status, 200);
    assert.deepEqual([state.contacts.length, state.contacts[0].name, state.leads.get('902').contact_id], [2, 'Lead Neunhundert', 500]);
  });
  test('while the lead webhook listens for its test delivery, the lead is kept as its sample and makes no contact', async () => {
    Object.assign(state.hooks[0], { active: false, test_until: new Date(realNow() + 60000).toISOString() });
    assert.equal((await srv.post(message('900'))).status, 200);
    assert.deepEqual([state.contacts.length, state.leads.get('900').status, state.logs[0].status], [0, 'test', 'test']);
    assert.deepEqual(state.hooks[0].sample.field_data[0], { name: 'email', values: ['lead900@example.de'] }, 'the mapping can be chosen from a real lead');
    assert.equal(state.hooks[0].sample.page_name, 'Müller Immobilien');
    assert.equal((await srv.post(message('901'))).status, 200, 'one lead ends the listening');
    assert.deepEqual([state.leads.get('901').status, state.leads.get('901').reason, state.contacts.length], ['skipped', 'off', 0]);
  });
});

describe('a lead nothing comes of is confirmed all the same, with the reason kept', () => {
  test('a Page given to no workspace; a webhook switched off; a mapping that finds neither name nor email; a lead Facebook does not hand out', async () => {
    assert.equal((await srv.post(message({ leadgen_id: '900', page_id: '999' }))).status, 200);
    assert.deepEqual([state.leads.get('900').status, state.leads.get('900').reason, state.asked.length], ['skipped', 'no_page', 0]);
    state.hooks[0].active = false;
    assert.equal((await srv.post(message('901'))).status, 200);
    assert.deepEqual([state.leads.get('901').reason, state.asked.length], ['off', 0]);
    Object.assign(state.hooks[0], { active: true, field_map: { name: 'nowhere', email: 'nothing' } });
    assert.equal((await srv.post(message('902'))).status, 200);
    assert.deepEqual([state.leads.get('902').reason, state.logs.at(-1).status, state.contacts.length], ['unmapped', 'error', 0]);
    state.facebook = () => fbAnswer({ error: { message: 'Unsupported get request. Object with ID \'444444444444\' does not exist', code: 100 } }, 400);
    assert.equal((await srv.post(message('444444444444'))).status, 200, 'the test button of Meta\'s dashboard sends a lead that does not exist');
    assert.deepEqual([state.leads.get('444444444444').reason, state.leads.get('444444444444').detail], ['rejected', 'Unsupported get request. Object with ID \'444444444444\' does not exist']);
  });
  test('a signed message that is about no lead is confirmed, and nothing is asked', async () => {
    for (const raw of [JSON.stringify({ object: 'user', entry: [] }), JSON.stringify({ object: 'page', entry: [{ id: '100', changes: [{ field: 'feed', value: {} }] }] }), 'not json', '']) {
      const r = await srv.post(raw);
      assert.deepEqual([r.status, r.body], [200, { success: true }], raw);
    }
    assert.deepEqual([state.sql.length, state.asked.length], [0, 0]);
  });
});

describe('a lead that could not be taken yet is not confirmed: Facebook sends it again', () => {
  test('Facebook away: 503 — and the next sending makes the contact, once', async () => {
    state.facebook = () => new Error('no route to host');
    const r = await srv.post(message('900'));
    assert.deepEqual([r.status, r.body], [503, { error: 'Not every lead could be taken yet.' }]);
    assert.deepEqual([state.leads.get('900').status, state.leads.get('900').reason, state.contacts.length], ['failed', 'unreachable', 0]);
    state.facebook = null;
    assert.equal((await srv.post(message('900'))).status, 200);
    assert.deepEqual([state.leads.get('900').status, state.leads.get('900').tries, state.contacts.length], ['done', 2, 1]);
  });
  test('one of two fails: the other is a contact already, and is not made again by the next sending', async () => {
    state.facebook = u => (u.pathname.endsWith('/901') ? fbAnswer({ error: { message: 'Please retry your request later.', code: 2, is_transient: true } }, 400) : null);
    assert.equal((await srv.post(message('900', '901'))).status, 503);
    assert.deepEqual([state.leads.get('900').status, state.leads.get('901').status, state.leads.get('901').reason, state.contacts.length], ['done', 'failed', 'facebook', 1]);
    state.facebook = null;
    assert.equal((await srv.post(message('900', '901'))).status, 200);
    assert.deepEqual(state.contacts.map(c => c.email), ['lead900@example.de', 'lead901@example.de']);
    assert.equal(state.asked.filter(u => u.pathname.endsWith('/900')).length, 1, 'the lead that was taken is not fetched again');
    // the failing one first: the leads after it are still taken
    state.facebook = u => (u.pathname.endsWith('/911') ? new Error('no route to host') : null);
    assert.equal((await srv.post(message('911', '910'))).status, 503);
    assert.deepEqual([state.leads.get('911').status, state.leads.get('910').status, state.contacts.some(c => c.email === 'lead910@example.de')], ['failed', 'done', true]);
  });
  test('the database away: 503, and nothing is said about why', async () => {
    state.brokenDb = true;
    const r = await srv.post(message('900'));
    assert.deepEqual([r.status, r.body], [503, { error: 'Not every lead could be taken yet.' }]);
    assert.equal(state.asked.length, 0);
  });
  test('time runs out in a long message: the leads not yet looked at are left for the next sending', async () => {
    state.slow = 8000;   // each question to Facebook takes eight seconds of the clock
    assert.equal((await srv.post(message('900', '901', '902', '903'))).status, 503);
    assert.deepEqual([...state.leads.keys()], ['900', '901'], 'after fifteen seconds no further lead is begun');
    assert.deepEqual([state.leads.get('900').status, state.leads.get('901').status], ['done', 'done']);
    state.slow = 0; clockAhead = 0;
    assert.equal((await srv.post(message('900', '901', '902', '903'))).status, 200);
    assert.equal(state.contacts.length, 4);
  });
});

describe('the lead webhook\'s delivery, as it is handed a lead (routes/integrations.js takeDelivery)', () => {
  const takeDelivery = (...args) => loadRoute('integrations.js', { pool }).takeDelivery(...args);
  const HOOK = () => ({ id: 70, workspace_id: 7, active: true, test_until: null, create_deal: false, default_assignee_id: null, field_map: { name: 'full_name', email: 'email' } });
  test('a lead: the contact\'s id, and no deal where the webhook makes none', async () => {
    assert.deepEqual(await takeDelivery(HOOK(), { full_name: 'Ada', email: 'Ada@Example.de' }), { kind: 'lead', contactId: 500, dealId: null });
    assert.deepEqual([state.contacts[0].email, state.logs[0].status], ['ada@example.de', 'success']);
    assert.deepEqual(await takeDelivery(HOOK(), Buffer.from('{"full_name":"Bo"}')), { kind: 'lead', contactId: 501, dealId: null }, 'bytes are read as the public address reads them');
  });
  test('switched off: nothing happens — not even a log', async () => {
    assert.deepEqual(await takeDelivery({ ...HOOK(), active: false }, { full_name: 'Ada' }), { kind: 'off' });
    assert.deepEqual([state.sql.length, state.contacts.length, state.logs.length], [0, 0, 0]);
    assert.deepEqual(await takeDelivery({ ...HOOK(), active: false, test_until: new Date(realNow() - 1000).toISOString() }, { full_name: 'Ada' }), { kind: 'off' }, 'the listening is over');
    assert.equal(state.sql.length, 0);
  });
  test('listening: kept as the sample, also while switched off; a listening another delivery ended is none', async () => {
    Object.assign(state.hooks[0], { active: false, test_until: new Date(realNow() + 60000).toISOString() });
    assert.deepEqual(await takeDelivery({ ...state.hooks[0] }, { full_name: 'Ada' }), { kind: 'test' });
    assert.deepEqual([state.hooks[0].sample, state.logs[0].status, state.contacts.length], [{ full_name: 'Ada' }, 'test', 0]);
    state.hooks[0].test_until = new Date(realNow() + 60000).toISOString();
    assert.deepEqual(await takeDelivery({ ...state.hooks[0] }, Buffer.from('{"full_name":"Bytes"}')), { kind: 'test' });
    assert.deepEqual(state.hooks[0].sample, { full_name: 'Bytes' }, 'bytes are read before they are kept as the sample');
    const stale = { ...HOOK(), test_until: new Date(realNow() + 60000).toISOString() };   // the row as it was read; the database has ended the listening since
    assert.deepEqual(await takeDelivery({ ...stale, active: false }, { full_name: 'Bo' }), { kind: 'off' });
    assert.deepEqual((await takeDelivery(stale, { full_name: 'Bo' })).kind, 'lead', 'switched on, it is a lead like any other');
  });
  test('neither a name nor an email: said so, and logged with what was looked for', async () => {
    assert.deepEqual(await takeDelivery(HOOK(), { vorname: 'Ada' }), { kind: 'unmapped' });
    assert.deepEqual([state.logs[0].status, state.logs[0].captured, state.contacts.length], ['error', { field_map_keys: ['name', 'email'], payload_keys: ['vorname'] }, 0]);
  });
});

describe('how it is built', () => {
  const code = read('routes/facebook-receive.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('public, and only the signature opens it: no login, no session, no key in the address', () => {
    assert.doesNotMatch(code, /requireAuth|requireAdmin|req\.session|req\.params/);
    assert.deepEqual([...code.matchAll(/router\.(get|post|put|delete|use)\('([^']+)'/g)].map(m => `${m[1]} ${m[2]}`), ['get /receive', 'post /receive']);
    assert.ok(code.indexOf('facebook.signatureMatches(') < code.indexOf('facebook.leadEvents('), 'nothing is read before the signature is checked');
    assert.match(code, /const BUDGET_MS = 15000;/);
  });
  test('the lead webhook\'s delivery is the one its public address uses', () => {
    assert.match(code, /leads\.take\(pool, ev, \{ deliver: integrations\.takeDelivery \}\)/);
    const integ = read('routes/integrations.js');
    assert.match(integ, /const out = await takeDelivery\(wh, req\.body\);/);
    assert.match(integ, /router\.takeDelivery = takeDelivery;/);
  });
});
