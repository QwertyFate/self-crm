// ROUTE tests for /api/integrations/calendly (CALENDLY_CHANGES Part 1): one connection per
// workspace; everyone reads the status; connect, the event type, refresh and disconnect are
// owner/admin only. Two servers are built from the same route file, one as owner and one as
// member, over a fake pool and a fake api.calendly.com (globalThis.fetch). Pinned: the token is
// sealed before it is bound to the INSERT and never appears in any answer; the receive token and
// the webhook secret are minted once and survive a reconnect; Cal.com and Calendly are never both
// connected (each connect refuses while the other stands); every refusal names its reason in `code`.
const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const TOKEN  = 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0In0';
const TOKEN2 = 'eyJraWQiOiJmZWRjYmE5ODc2NTQzMjEwZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTBmZWRjYmE5ODc2NTQzMjEwIn0';
const USER = 'https://api.calendly.com/users/AAAAAAAAAAAAAAAA';
const ORG  = 'https://api.calendly.com/organizations/OOOOOOOOOOOOOOOO';
const T1 = 'https://api.calendly.com/event_types/T1', T2 = 'https://api.calendly.com/event_types/T2', T3 = 'https://api.calendly.com/event_types/T3';
const HOOK = 'https://api.calendly.com/webhook_subscriptions/WWWW';
const RAW = [
  { uri: T1, name: 'Geheim', active: true, slug: 'geheim', scheduling_url: 'https://calendly.com/mara/geheim', duration: 15, kind: 'solo', pooling_type: null, secret: true, deleted_at: null, locations: null },
  { uri: T2, name: 'Erstgespräch', active: true, slug: 'erstgespraech', scheduling_url: 'https://calendly.com/mara/erstgespraech', duration: 30, kind: 'solo', pooling_type: null, secret: false, deleted_at: null, locations: [{ kind: 'google_conference' }] },
];
const TYPES = [
  { uri: T1, name: 'Geheim', slug: 'geheim', duration: 15, schedulingUrl: 'https://calendly.com/mara/geheim', kind: 'solo', poolingType: null, secret: true, locations: [] },
  { uri: T2, name: 'Erstgespräch', slug: 'erstgespraech', duration: 30, schedulingUrl: 'https://calendly.com/mara/erstgespraech', kind: 'solo', poolingType: null, secret: false, locations: [{ kind: 'google_conference' }] },
];
const ME = { uri: USER, name: 'Mara Kühn', slug: 'mara', email: 'mara@example.de', scheduling_url: 'https://calendly.com/mara', timezone: 'Europe/Berlin', current_organization: ORG };

const state = { row: null, calcom: false, calls: [] };
const pool = {
  query: async (sql, params) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: text, params });
    if (/FROM workspace_calendly c LEFT JOIN users u/.test(text)) { assert.match(text, /LEFT JOIN users h ON h\.workspace_id = c\.workspace_id AND LOWER\(h\.email\) = LOWER\(c\.cly_email\)/, 'the host\'s CRM user is joined by email'); return { rows: state.row && state.row.workspace_id === params[0] ? [{ ...state.row, connected_by_name: 'Olaf Owner', host_user_id: 9 }] : [] }; }
    if (text === 'SELECT 1 FROM workspace_calcom WHERE workspace_id=$1') return { rows: state.calcom && params[0] === 7 ? [{ '?column?': 1 }] : [] };
    if (text.startsWith('INSERT INTO workspace_calendly')) {
      const fresh = { workspace_id: params[0], token_sealed: params[1], user_uri: params[2], org_uri: params[3], cly_name: params[4], cly_email: params[5], cly_slug: params[6], cly_timezone: params[7], scheduling_url: params[8], event_types: JSON.parse(params[9]), event_type_uri: params[10], receive_token: params[11], webhook_secret: params[12], connected_by: params[13], webhook_uri: null, connected_at: '2026-11-12T09:00:00.000Z', updated_at: '2026-11-12T09:00:00.000Z', last_error: null };
      // ON CONFLICT: the token and the secret stay, everything else is replaced
      state.row = state.row ? { ...fresh, id: state.row.id, receive_token: state.row.receive_token, webhook_secret: state.row.webhook_secret, webhook_uri: state.row.webhook_uri } : { id: 1, ...fresh };
      return { rows: [], rowCount: 1 };
    }
    if (text.startsWith('UPDATE workspace_calendly SET event_type_uri=$1')) { if (state.row) state.row = { ...state.row, event_type_uri: params[0] }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calendly SET event_types=$1::jsonb')) { if (state.row) state.row = { ...state.row, event_types: JSON.parse(params[0]), event_type_uri: params[1], last_error: null }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calendly SET last_error=$1')) { if (state.row) state.row = { ...state.row, last_error: params[0] }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calendly SET webhook_uri=$1, last_error=NULL')) { if (state.row) state.row = { ...state.row, webhook_uri: params[0], last_error: null }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calendly SET webhook_uri=NULL, last_error=$1')) { if (state.row) state.row = { ...state.row, webhook_uri: null, last_error: params[0] }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calendly SET webhook_uri=NULL WHERE')) { if (state.row) state.row = { ...state.row, webhook_uri: null }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('DELETE FROM workspace_calendly')) { state.row = null; return { rowCount: 1, rows: [] }; }
    throw new Error('unexpected SQL: ' + text);
  },
};

// A fake api.calendly.com: `plan` maps a URL prefix to a reply; every call is recorded.
let fetchCalls = [];
const realFetch = globalThis.fetch;
function fakeCalendly(plan) {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);   // the test client itself
    fetchCalls.push({ url: u, method: init?.method, headers: init?.headers, body: init?.body ? JSON.parse(init.body) : undefined });
    const k = Object.keys(plan).find(p => u.startsWith(p));
    let r = k ? plan[k] : { status: 404, body: { title: 'Resource Not Found', message: 'no such route' } };
    if (typeof r === 'function') r = r(init);
    if (r.throw) throw Object.assign(new TypeError('fetch failed'), { name: 'TypeError' });
    return new Response(r.status === 204 ? null : r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
const OK = {
  'https://api.calendly.com/users/me': { status: 200, body: { resource: ME } },
  'https://api.calendly.com/event_types': { status: 200, body: { collection: RAW, pagination: { next_page_token: null } } },
  'https://api.calendly.com/webhook_subscriptions/': { status: 204 },   // DELETE /webhook_subscriptions/:uuid
  'https://api.calendly.com/webhook_subscriptions': { status: 201, body: { resource: { uri: HOOK, state: 'active' } } },
};
const NO_WEBHOOK = { ...OK, 'https://api.calendly.com/webhook_subscriptions': { status: 403, body: { title: 'Permission Denied', message: 'Please upgrade your Calendly account to Standard' } } };

let owner, member, calcom;
const envSaved = {};
before(async () => {
  for (const k of ['SESSION_SECRET', 'CALCOM_ENCRYPTION_KEY', 'CALENDLY_API_URL', 'APP_BASE_URL', 'BASE_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'route-test-secret';
  calcom = require(path.join(ROOT, 'utils', 'calcom.js'));
  owner  = await serve({ '/api/integrations/calendly': loadRoute('calendly.js', { pool, user: { id: 1, workspaceId: 7, role: 'owner' } }) });
  member = await serve({ '/api/integrations/calendly': loadRoute('calendly.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } }) });
});
after(async () => {
  await owner.close(); await member.close();
  globalThis.fetch = realFetch;
  for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; }
});
beforeEach(() => { state.row = null; state.calcom = false; state.calls.length = 0; fakeCalendly(OK); process.env.SESSION_SECRET = 'route-test-secret'; });
afterEach(() => { globalThis.fetch = realFetch; });

const SECRET_WORDS = /token_sealed|receive_token|webhook_secret|eyJraWQ|"v1\./;
const noSecrets = body => assert.doesNotMatch(JSON.stringify(body), SECRET_WORDS, 'nothing secret in the answer');
const BASE = '/api/integrations/calendly';

async function connectAsOwner(token = TOKEN) {
  const r = await owner.request('POST', BASE + '/connect', { token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
}

describe('GET /api/integrations/calendly', () => {
  test('not connected: everyone gets connected:false; can_manage says who may connect; Calendly is not called', async () => {
    const m = await member.request('GET', BASE);
    assert.equal(m.status, 200); assert.deepEqual(m.body, { connected: false, calendly: null, can_manage: false, blocked_by: null });
    assert.deepEqual((await owner.request('GET', BASE)).body, { connected: false, calendly: null, can_manage: true, blocked_by: null });
    assert.equal(fetchCalls.length, 0);
  });
  test('while Cal.com is connected the status says what stands in the way', async () => {
    state.calcom = true;
    assert.deepEqual((await owner.request('GET', BASE)).body, { connected: false, calendly: null, can_manage: true, blocked_by: 'calcom' });
    assert.equal((await member.request('GET', BASE)).body.blocked_by, 'calcom');
  });
});

describe('POST /api/integrations/calendly/connect', () => {
  test('a member may not connect: 403, Calendly not called, nothing written', async () => {
    const r = await member.request('POST', BASE + '/connect', { token: TOKEN });
    assert.equal(r.status, 403); assert.equal(r.body.error, 'Owner or admin only');
    assert.equal(fetchCalls.length, 0); assert.equal(state.row, null);
  });
  test('something that is not token-shaped is refused before Calendly is asked', async () => {
    for (const token of ['', 'short', 'two words that are long enough', 42]) {
      const r = await owner.request('POST', BASE + '/connect', { token });
      assert.equal(r.status, 400, String(token)); assert.equal(r.body.code, 'token_shape');
    }
    assert.equal(fetchCalls.length, 0); assert.equal(state.row, null);
  });
  test('Cal.com is connected: 409 calcom_connected, Calendly not called, nothing written', async () => {
    state.calcom = true;
    const r = await owner.request('POST', BASE + '/connect', { token: TOKEN });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'calcom_connected'); assert.match(r.body.error, /disconnect it before connecting Calendly/);
    assert.equal(fetchCalls.length, 0); assert.equal(state.row, null);
  });
  test('Calendly rejects the token: 400 rejected; a token without a permission: 400 scope with the list; nothing written', async () => {
    fakeCalendly({ 'https://api.calendly.com/users/me': { status: 401, body: { title: 'Unauthenticated', message: 'The access token is invalid' } } });
    const r = await owner.request('POST', BASE + '/connect', { token: TOKEN });
    assert.equal(r.status, 400); assert.equal(r.body.code, 'rejected'); assert.equal(r.body.error, 'Calendly rejected the token: The access token is invalid'); noSecrets(r.body);
    fakeCalendly({ ...OK, 'https://api.calendly.com/event_types': { status: 403, body: { title: 'Insufficient scope', message: 'Insufficient scope', required_scopes: ['event_types:read'] } } });
    const s = await owner.request('POST', BASE + '/connect', { token: TOKEN });
    assert.equal(s.status, 400); assert.equal(s.body.code, 'scope'); assert.deepEqual(s.body.scopes, ['event_types:read']);
    fakeCalendly({ 'https://api.calendly.com/users/me': { status: 403, body: { title: 'Permission Denied', message: 'You do not have permission' } } });
    assert.equal((await owner.request('POST', BASE + '/connect', { token: TOKEN })).body.code, 'rejected', 'a 403 without scopes is a refusal of the token');
    assert.equal(state.row, null);
  });
  test('Calendly unreachable: 502 unreachable; Calendly broken: 502 calendly_error with its message; nothing written', async () => {
    fakeCalendly({ 'https://api.calendly.com/users/me': { throw: true } });
    const r = await owner.request('POST', BASE + '/connect', { token: TOKEN });
    assert.equal(r.status, 502); assert.equal(r.body.code, 'unreachable');
    fakeCalendly({ 'https://api.calendly.com/users/me': { status: 500, body: { title: 'Server Error', message: 'boom' } } });
    const b = await owner.request('POST', BASE + '/connect', { token: TOKEN });
    assert.equal(b.status, 502); assert.equal(b.body.code, 'calendly_error'); assert.equal(b.body.detail, 'boom');
    assert.equal(state.row, null);
  });
  test('an owner connects: the account and its event types are fetched with the token, the token is stored sealed, a receive token and a secret are minted, the first type that is not secret is chosen', async () => {
    const r = await connectAsOwner();
    assert.deepEqual(fetchCalls.map(c => c.url.split('?')[0]), ['https://api.calendly.com/users/me', 'https://api.calendly.com/event_types', 'https://api.calendly.com/webhook_subscriptions']);
    const wh = fetchCalls[2];
    assert.equal(wh.method, 'POST');
    assert.match(wh.body.url, new RegExp('^http://127\\.0\\.0\\.1:\\d+/api/integrations/calendly/receive/' + state.row.receive_token + '$'), 'the receiver at this server\'s own origin, named by the token');
    assert.deepEqual({ ...wh.body, url: null }, { url: null, events: ['invitee.created', 'invitee.canceled'], organization: ORG, user: USER, scope: 'user', signing_key: state.row.webhook_secret });
    assert.equal(state.row.webhook_uri, HOOK, 'Calendly\'s name for the webhook remembered');
    for (const c of fetchCalls) assert.equal(c.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(new URL(fetchCalls[1].url).searchParams.get('user'), USER, 'the types of the account behind the token');
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO workspace_calendly'));
    assert.ok(ins, 'one insert'); assert.match(ins.sql, /ON CONFLICT \(workspace_id\) DO UPDATE SET/);
    assert.doesNotMatch(ins.sql, /DO UPDATE SET[^]*receive_token=/, 'the receive token is not replaced on reconnect'); assert.doesNotMatch(ins.sql, /DO UPDATE SET[^]*webhook_secret=/);
    const p = ins.params;
    assert.equal(p[0], 7);
    assert.match(p[1], /^v1\./, 'sealed'); assert.ok(!p[1].includes(TOKEN), 'never the plain token'); assert.equal(calcom.openKey(p[1]), TOKEN, 'and it opens to the token');
    assert.deepEqual(p.slice(2, 9), [USER, ORG, 'Mara Kühn', 'mara@example.de', 'mara', 'Europe/Berlin', 'https://calendly.com/mara']);
    assert.deepEqual(JSON.parse(p[9]), TYPES); assert.equal(p[10], T2, 'the first type shown on the booking page');
    assert.match(p[11], /^[0-9a-f]{40}$/, 'receive token'); assert.match(p[12], /^[0-9a-f]{64}$/, 'webhook secret'); assert.equal(p[13], 1, 'connected by the owner');
    assert.equal(r.body.connected, true); assert.equal(r.body.can_manage, true); assert.equal(r.body.blocked_by, null);
    const c = r.body.calendly;
    assert.equal(c.name, 'Mara Kühn'); assert.equal(c.email, 'mara@example.de'); assert.equal(c.slug, 'mara'); assert.equal(c.timezone, 'Europe/Berlin'); assert.equal(c.scheduling_url, 'https://calendly.com/mara');
    assert.deepEqual(c.event_type, { uri: T2, name: 'Erstgespräch', slug: 'erstgespraech', duration: 30 });
    assert.deepEqual(c.event_types, TYPES); assert.equal(c.connected_by_name, 'Olaf Owner'); assert.equal(c.host_user_id, 9); assert.equal(c.webhook_registered, true); assert.equal(c.last_error, null);
    noSecrets(r.body);
  });
  test('a member then sees the account, the event type and the list, read-only, not the secrets', async () => {
    await connectAsOwner();
    const r = await member.request('GET', BASE);
    assert.equal(r.status, 200); assert.equal(r.body.connected, true); assert.equal(r.body.can_manage, false); assert.equal(r.body.calendly.can_manage, false);
    assert.equal(r.body.calendly.email, 'mara@example.de'); assert.deepEqual(r.body.calendly.event_types, TYPES); noSecrets(r.body);
  });
  test('connecting again replaces the account and keeps the receive token, the webhook secret and a still-valid event type choice', async () => {
    await connectAsOwner();
    await owner.request('PATCH', BASE, { event_type: T1 });
    const token = state.row.receive_token, secret = state.row.webhook_secret;
    fakeCalendly({ ...OK, 'https://api.calendly.com/users/me': { status: 200, body: { resource: { ...ME, email: 'tim@example.de', name: 'Tim Berger' } } } });
    const r = await connectAsOwner(TOKEN2);
    assert.equal(fetchCalls.filter(c => c.url.includes('webhook_subscriptions')).length, 0, 'the same account (the same user URI) keeps its webhook');
    assert.equal(r.body.calendly.email, 'tim@example.de'); assert.equal(r.body.calendly.event_type.uri, T1, 'the choice survives when the type still exists');
    assert.equal(state.row.receive_token, token); assert.equal(state.row.webhook_secret, secret);
    assert.equal(calcom.openKey(state.row.token_sealed), TOKEN2);
  });
});

describe('PATCH /api/integrations/calendly', () => {
  test('member: 403; not connected: 404; unknown type: 400; a secret type is still allowed', async () => {
    assert.equal((await member.request('PATCH', BASE, { event_type: T1 })).status, 403);
    const none = await owner.request('PATCH', BASE, { event_type: T1 });
    assert.equal(none.status, 404); assert.equal(none.body.code, 'not_connected');
    await connectAsOwner();
    for (const event_type of [T3, '', 7, undefined]) {
      const bad = await owner.request('PATCH', BASE, { event_type });
      assert.equal(bad.status, 400, String(event_type)); assert.equal(bad.body.code, 'event_type');
    }
    const ok = await owner.request('PATCH', BASE, { event_type: T1 });
    assert.equal(ok.status, 200); assert.equal(ok.body.calendly.event_type.uri, T1);
    assert.deepEqual(state.calls.find(c => c.sql.startsWith('UPDATE workspace_calendly SET event_type_uri=$1')).params, [T1, 7]); noSecrets(ok.body);
  });
});

describe('POST /api/integrations/calendly/refresh', () => {
  test('re-fetches the event types with the stored token (opened from its seal) for the stored account; a vanished choice is re-picked', async () => {
    await connectAsOwner();
    fakeCalendly({ 'https://api.calendly.com/event_types': { status: 200, body: { collection: [{ ...RAW[1], uri: T3, name: 'Besichtigung', slug: 'besichtigung', duration: 60 }], pagination: {} } } });
    const r = await owner.request('POST', BASE + '/refresh');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(fetchCalls.length, 1); assert.equal(fetchCalls[0].headers.Authorization, `Bearer ${TOKEN}`, 'the seal opened to the token');
    assert.equal(new URL(fetchCalls[0].url).searchParams.get('user'), USER);
    assert.equal(r.body.calendly.event_type.uri, T3); assert.deepEqual(r.body.calendly.event_types.map(t => t.uri), [T3]);
    assert.equal((await member.request('POST', BASE + '/refresh')).status, 403);
  });
  test('not connected: 404; a Calendly error is remembered as last_error and reported; a rotated server secret means connect again', async () => {
    assert.equal((await owner.request('POST', BASE + '/refresh')).status, 404);
    await connectAsOwner();
    fakeCalendly({ 'https://api.calendly.com/event_types': { status: 500, body: { title: 'Server Error', message: 'boom' } } });
    const r = await owner.request('POST', BASE + '/refresh');
    assert.equal(r.status, 502); assert.equal(r.body.code, 'calendly_error'); assert.equal(state.row.last_error, 'boom');
    process.env.SESSION_SECRET = 'rotated';
    const r2 = await owner.request('POST', BASE + '/refresh');
    assert.equal(r2.status, 409); assert.equal(r2.body.code, 'reseal');
  });
});

describe('DELETE /api/integrations/calendly', () => {
  test('member: 403; owner: the row goes and the status reads not connected', async () => {
    await connectAsOwner();
    assert.equal((await member.request('DELETE', BASE)).status, 403);
    assert.equal(state.row.cly_email, 'mara@example.de', 'still there');
    fetchCalls.length = 0;
    const r = await owner.request('DELETE', BASE);
    assert.equal(r.status, 200); assert.deepEqual(r.body, { success: true, connected: false, calendly: null, can_manage: true, blocked_by: null });
    assert.deepEqual(state.calls.find(c => c.sql.startsWith('DELETE FROM workspace_calendly')).params, [7]);
    assert.deepEqual(fetchCalls.map(c => c.method + ' ' + c.url), ['DELETE https://api.calendly.com/webhook_subscriptions/WWWW'], 'the webhook leaves Calendly with the connection, with the stored token');
    assert.equal(fetchCalls[0].headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal((await owner.request('GET', BASE)).body.connected, false);
  });
});

describe('the booking webhook (Part 2)', () => {
  test('Calendly refuses the webhook: the connection stands, the card says why, a retry registers it', async () => {
    fakeCalendly(NO_WEBHOOK);
    const r = await connectAsOwner();
    assert.equal(r.body.connected, true); assert.equal(r.body.calendly.webhook_registered, false);
    assert.equal(r.body.calendly.last_error, 'Webhook: Please upgrade your Calendly account to Standard'); assert.equal(state.row.webhook_uri, null);
    assert.equal((await member.request('POST', BASE + '/register-webhook')).status, 403);
    const still = await owner.request('POST', BASE + '/register-webhook');
    assert.equal(still.status, 502); assert.equal(still.body.code, 'webhook'); assert.equal(still.body.detail, 'Please upgrade your Calendly account to Standard'); assert.equal(still.body.connected, true); noSecrets(still.body);
    fakeCalendly(OK);
    const ok = await owner.request('POST', BASE + '/register-webhook');
    assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.calendly.webhook_registered, true); assert.equal(ok.body.calendly.last_error, null);
    assert.equal(fetchCalls.at(-1).headers.Authorization, `Bearer ${TOKEN}`, 'with the stored token, opened');
  });
  test('a token without the webhook permission: the missing scopes are named', async () => {
    fakeCalendly({ ...OK, 'https://api.calendly.com/webhook_subscriptions': { status: 403, body: { title: 'Insufficient scope', message: 'Insufficient scope', required_scopes: ['webhooks:write'] } } });
    const r = await connectAsOwner();
    assert.equal(r.body.calendly.last_error, 'Webhook: the token lacks webhooks:write');
  });
  test('a retry while one is registered removes it first; another account\'s webhook is removed with the old token; not connected: 404; a rotated secret: 409', async () => {
    assert.equal((await owner.request('POST', BASE + '/register-webhook')).status, 404);
    await connectAsOwner();
    fetchCalls.length = 0;
    await owner.request('POST', BASE + '/register-webhook');
    assert.deepEqual(fetchCalls.map(c => c.method + ' ' + c.url), ['DELETE https://api.calendly.com/webhook_subscriptions/WWWW', 'POST https://api.calendly.com/webhook_subscriptions']);
    fakeCalendly({ ...OK, 'https://api.calendly.com/users/me': { status: 200, body: { resource: { ...ME, uri: USER + 'B' } } } });
    await connectAsOwner(TOKEN2);
    const del = fetchCalls.find(c => c.method === 'DELETE'), post = fetchCalls.find(c => c.method === 'POST');
    assert.equal(del.headers.Authorization, `Bearer ${TOKEN}`, 'the old account\'s webhook goes with the old token');
    assert.equal(post.headers.Authorization, `Bearer ${TOKEN2}`); assert.equal(post.body.user, USER + 'B');
    process.env.SESSION_SECRET = 'rotated';
    const r = await owner.request('POST', BASE + '/register-webhook');
    assert.equal(r.status, 409); assert.equal(r.body.code, 'reseal');
  });
  test('APP_BASE_URL names the public origin when set', async () => {
    process.env.APP_BASE_URL = 'https://crm.example.de/';
    try {
      await connectAsOwner();
      assert.equal(fetchCalls[2].body.url, `https://crm.example.de/api/integrations/calendly/receive/${state.row.receive_token}`);
    } finally { delete process.env.APP_BASE_URL; }
  });
});

// The other half of "never both": Cal.com's connect refuses while Calendly is connected.
describe('POST /api/integrations/calcom/connect while Calendly is connected', () => {
  test('409 calendly_connected before Cal.com is asked; nothing written', async () => {
    const sqls = [];
    const calPool = { query: async (sql, params) => {
      const text = String(sql).replace(/\s+/g, ' ').trim(); sqls.push(text);
      if (text === 'SELECT 1 FROM workspace_calendly WHERE workspace_id=$1') { assert.deepEqual(params, [7]); return { rows: [{ '?column?': 1 }] }; }
      return { rows: [] };
    } };
    const srv = await serve({ '/api/integrations': loadRoute('integrations.js', { pool: calPool, user: { id: 1, workspaceId: 7, role: 'owner' } }) });
    try {
      fakeCalendly({});
      const r = await srv.request('POST', '/api/integrations/calcom/connect', { api_key: 'cal_live_0123456789abcdef0123456789abcdef' });
      assert.equal(r.status, 409); assert.equal(r.body.code, 'calendly_connected'); assert.match(r.body.error, /disconnect it before connecting Cal\.com/);
      assert.equal(fetchCalls.length, 0, 'Cal.com is not asked'); assert.ok(!sqls.some(s => s.startsWith('INSERT INTO workspace_calcom')));
    } finally { await srv.close(); }
  });
  test('server.js mounts the Calendly routes ahead of the general integrations router', () => {
    const server = require('fs').readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert.match(server, /app\.use\('\/api\/integrations\/calendly', require\('\.\/routes\/calendly'\)\);[^\n]*\napp\.use\('\/api\/integrations',  integrations\);/);
  });
});
