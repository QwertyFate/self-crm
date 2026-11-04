// ROUTE tests for /api/integrations/calcom (Cal.com integration, piece 2, 2026-10-13):
// one connection per workspace; everyone reads the status; connect, the event
// type, refresh and disconnect are owner/admin only. Two servers are built from
// the same route file, one as owner and one as member, over a fake pool and a
// fake api.cal.com (globalThis.fetch). Pinned: the key is sealed before it is
// bound to the INSERT and never appears in any answer; the receive token and the
// webhook secret are minted once and survive a reconnect; a wrong key, an
// unreachable Cal.com and a rotated server secret each get their own status.
const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const KEY  = 'cal_live_0123456789abcdef0123456789abcdef';
const KEY2 = 'cal_live_fedcba9876543210fedcba9876543210';
const TYPES = [
  { id: 7, slug: '30min', title: '30 Minuten', lengthInMinutes: 30, hidden: false, ownerId: 42, locations: [{ type: 'integration', integration: 'cal-video' }, { type: 'integration', integration: 'google-meet' }] },
  { id: 8, slug: 'besichtigung', title: 'Besichtigung', lengthInMinutes: 60, hidden: true, ownerId: 42, locations: [] },
];
const ME = { id: 42, username: 'mara', email: 'mara@example.de', name: 'Mara Kühn', timeZone: 'Europe/Berlin' };

const state = { row: null, calls: [] };
const pool = {
  query: async (sql, params) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: text, params });
    if (/FROM workspace_calcom c LEFT JOIN users u/.test(text)) { assert.match(text, /LEFT JOIN users h ON h\.workspace_id = c\.workspace_id AND LOWER\(h\.email\) = LOWER\(c\.cal_email\)/, 'the host\'s CRM user is joined by email'); return { rows: state.row && state.row.workspace_id === params[0] ? [{ ...state.row, connected_by_name: 'Olaf Owner', host_user_id: 9 }] : [] }; }
    if (text.startsWith('INSERT INTO workspace_calcom')) {
      const fresh = { workspace_id: params[0], api_key_sealed: params[1], cal_user_id: params[2], cal_username: params[3], cal_email: params[4], cal_name: params[5], cal_timezone: params[6], event_types: JSON.parse(params[7]), event_type_id: params[8], receive_token: params[9], webhook_secret: params[10], connected_by: params[11], webhook_id: null, connected_at: '2026-10-13T09:00:00.000Z', updated_at: '2026-10-13T09:00:00.000Z', last_error: null };
      // ON CONFLICT: the token and the secret stay, everything else is replaced
      state.row = state.row ? { ...fresh, id: state.row.id, receive_token: state.row.receive_token, webhook_secret: state.row.webhook_secret, webhook_id: state.row.webhook_id } : { id: 1, ...fresh };
      return { rows: [state.row] };
    }
    if (text.startsWith('UPDATE workspace_calcom SET event_type_id=$1')) { if (state.row) state.row = { ...state.row, event_type_id: params[0] }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calcom SET event_types=$1::jsonb')) { if (state.row) state.row = { ...state.row, event_types: JSON.parse(params[0]), event_type_id: params[1], last_error: null }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calcom SET last_error=$1')) { if (state.row) state.row = { ...state.row, last_error: params[0] }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calcom SET webhook_id=$1, last_error=NULL')) { if (state.row) state.row = { ...state.row, webhook_id: params[0], last_error: null }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calcom SET webhook_id=NULL, last_error=$1')) { if (state.row) state.row = { ...state.row, webhook_id: null, last_error: params[0] }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('UPDATE workspace_calcom SET webhook_id=NULL WHERE')) { if (state.row) state.row = { ...state.row, webhook_id: null }; return { rowCount: 1, rows: [] }; }
    if (text.startsWith('DELETE FROM workspace_calcom')) { state.row = null; return { rowCount: 1, rows: [] }; }
    return { rows: [] };
  },
};

// A fake api.cal.com: `plan` maps a URL prefix to a reply; every call is recorded.
let fetchCalls = [];
const realFetch = globalThis.fetch;
function fakeCal(plan) {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    // the test client itself uses fetch against 127.0.0.1: pass that through
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    fetchCalls.push({ url: u, method: init?.method, headers: init?.headers, body: init?.body ? JSON.parse(init.body) : undefined });
    const k = Object.keys(plan).find(p => u.startsWith(p));
    const r = k ? plan[k] : { status: 404, body: { status: 'error', error: { message: 'no such route' } } };
    if (r.throw) throw Object.assign(new TypeError('fetch failed'), { name: 'TypeError' });
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
const CAL_OK = {
  'https://api.cal.com/v2/me': { status: 200, body: { status: 'success', data: ME } },
  'https://api.cal.com/v2/event-types': { status: 200, body: { status: 'success', data: TYPES } },
  'https://api.cal.com/v2/webhooks/': { status: 200, body: { status: 'success', data: { id: 'wh_old' } } },        // DELETE /webhooks/:id
  'https://api.cal.com/v2/webhooks': { status: 201, body: { status: 'success', data: { id: 'wh_1', subscriberUrl: 'x', active: true } } },
};
const CAL_NO_WEBHOOK = { ...CAL_OK, 'https://api.cal.com/v2/webhooks': { status: 403, body: { status: 'error', error: { message: 'Webhooks need a higher plan' } } } };

let owner, member, calcom;
const ROW_LIKE = () => ({ id: 1, workspace_id: 7, api_key_sealed: calcom.sealKey(KEY), cal_user_id: 42, cal_email: 'mara@example.de', cal_name: 'Mara Kühn', cal_timezone: 'Europe/Berlin', event_types: TYPES, event_type_id: 7, receive_token: 't'.repeat(40), webhook_secret: 's'.repeat(64), webhook_id: 'wh_1', connected_by: 1, connected_at: 'c', updated_at: 'u', last_error: null });
const envSaved = {};
before(async () => {
  for (const k of ['SESSION_SECRET', 'CALCOM_ENCRYPTION_KEY', 'CALCOM_API_URL', 'APP_BASE_URL', 'BASE_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'route-test-secret';
  calcom = require(path.join(ROOT, 'utils', 'calcom.js'));
  owner  = await serve({ '/api/integrations': loadRoute('integrations.js', { pool, user: { id: 1, workspaceId: 7, role: 'owner' } }) });
  member = await serve({ '/api/integrations': loadRoute('integrations.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } }) });
});
after(async () => {
  await owner.close(); await member.close();
  globalThis.fetch = realFetch;
  for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; }
});
beforeEach(() => { state.row = null; state.calls.length = 0; fakeCal(CAL_OK); process.env.SESSION_SECRET = 'route-test-secret'; });
afterEach(() => { globalThis.fetch = realFetch; });

const SECRET_WORDS = /api_key|sealed|receive_token|webhook_secret|cal_live/;
const noSecrets = body => assert.doesNotMatch(JSON.stringify(body), SECRET_WORDS, 'nothing secret in the answer');

async function connectAsOwner(key = KEY) {
  const r = await owner.request('POST', '/api/integrations/calcom/connect', { api_key: key });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
}

describe('GET /api/integrations/calcom', () => {
  test('not connected: everyone gets connected:false; can_manage says who may connect', async () => {
    const m = await member.request('GET', '/api/integrations/calcom');
    assert.equal(m.status, 200); assert.deepEqual(m.body, { connected: false, calcom: null, can_manage: false });
    const o = await owner.request('GET', '/api/integrations/calcom');
    assert.deepEqual(o.body, { connected: false, calcom: null, can_manage: true });
    assert.equal(fetchCalls.length, 0, 'reading the status never calls Cal.com');
  });
});

describe('GET /api/integrations/calcom with a stale copy of the event types', () => {
  test('a copy without locations (from before 2026-10-13) is re-read from Cal.com once, by itself, for a member too; a current copy is not; a failing Cal.com keeps the copy', async () => {
    state.row = { id: 1, workspace_id: 7, api_key_sealed: calcom.sealKey(KEY), cal_user_id: 42, cal_email: 'mara@example.de', cal_name: 'Mara Kühn', cal_timezone: 'Europe/Berlin', event_types: [{ id: 7, slug: '30min', title: '30 Minuten', lengthInMinutes: 30, hidden: false, ownerId: 42 }], event_type_id: 7, receive_token: 't'.repeat(40), webhook_secret: 's'.repeat(64), webhook_id: 'wh_1', connected_by: 1, connected_at: 'c', updated_at: 'u', last_error: null };
    const r = await member.request('GET', '/api/integrations/calcom');
    assert.equal(r.status, 200);
    assert.deepEqual(fetchCalls.map(c => c.url), ['https://api.cal.com/v2/event-types'], 'one read'); assert.equal(fetchCalls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.deepEqual(r.body.calcom.event_types, TYPES, 'the fresh list, locations included'); assert.deepEqual(state.row.event_types, TYPES); assert.equal(state.row.event_type_id, 7);
    fetchCalls.length = 0;
    await member.request('GET', '/api/integrations/calcom');
    assert.equal(fetchCalls.length, 0, 'a current copy is left alone');
    state.row = { ...state.row, event_types: [{ id: 7, title: 'old' }] };
    fakeCal({ 'https://api.cal.com/v2/event-types': { throw: true } });
    const r2 = await member.request('GET', '/api/integrations/calcom');
    assert.equal(r2.status, 200); assert.deepEqual(r2.body.calcom.event_types, [{ id: 7, title: 'old' }], 'kept when Cal.com is not reachable');
  });
  test('?fresh=1 re-reads a current copy too (the booking dialog asks so), for a member, keeping the chosen type', async () => {
    state.row = { ...ROW_LIKE(), event_types: [{ id: 8, slug: 'besichtigung', title: 'Besichtigung', lengthInMinutes: 60, hidden: true, ownerId: 42, locations: [] }], event_type_id: 8 };
    fakeCal(CAL_OK);
    const r = await member.request('GET', '/api/integrations/calcom?fresh=1');
    assert.equal(r.status, 200); assert.deepEqual(fetchCalls.map(c => c.url), ['https://api.cal.com/v2/event-types']);
    assert.deepEqual(r.body.calcom.event_types, TYPES); assert.equal(r.body.calcom.event_type.id, 8, 'the chosen type stays when it still exists');
    fetchCalls.length = 0;
    await member.request('GET', '/api/integrations/calcom');
    assert.equal(fetchCalls.length, 0, 'without fresh, a current copy is left alone');
  });
});

describe('POST /api/integrations/calcom/connect', () => {
  test('a member may not connect: 403, Cal.com not called, nothing written', async () => {
    const r = await member.request('POST', '/api/integrations/calcom/connect', { api_key: KEY });
    assert.equal(r.status, 403); assert.equal(r.body.error, 'Owner or admin only');
    assert.equal(fetchCalls.length, 0); assert.equal(state.row, null);
  });
  test('a key that is not key-shaped is refused before Cal.com is asked', async () => {
    for (const api_key of ['', 'sk_live_abcdefghijk', 'cal_', 42]) {
      const r = await owner.request('POST', '/api/integrations/calcom/connect', { api_key });
      assert.equal(r.status, 400, String(api_key)); assert.match(r.body.error, /start with cal_/);
    }
    assert.equal(fetchCalls.length, 0); assert.equal(state.row, null);
  });
  test('Cal.com rejects the key: 400 with Cal.com\'s message, nothing written', async () => {
    fakeCal({ 'https://api.cal.com/v2/me': { status: 401, body: { status: 'error', error: { message: 'Invalid API key' } } } });
    const r = await owner.request('POST', '/api/integrations/calcom/connect', { api_key: KEY });
    assert.equal(r.status, 400); assert.equal(r.body.error, 'Cal.com rejected the key: Invalid API key');
    assert.equal(state.row, null); noSecrets(r.body);
  });
  test('Cal.com unreachable: 502, nothing written', async () => {
    fakeCal({ 'https://api.cal.com/v2/me': { throw: true } });
    const r = await owner.request('POST', '/api/integrations/calcom/connect', { api_key: KEY });
    assert.equal(r.status, 502); assert.match(r.body.error, /could not be reached/); assert.equal(state.row, null);
  });
  test('an owner connects: the profile and the event types are fetched with the key, the key is stored sealed, a token and a secret are minted, the first visible event type is chosen', async () => {
    const r = await connectAsOwner();
    assert.deepEqual(fetchCalls.map(c => c.url), ['https://api.cal.com/v2/me', 'https://api.cal.com/v2/event-types', 'https://api.cal.com/v2/webhooks']);
    for (const c of fetchCalls) assert.equal(c.headers.Authorization, `Bearer ${KEY}`);
    const wh = fetchCalls[2];
    assert.equal(wh.method, 'POST'); assert.equal(wh.headers['Content-Type'], 'application/json');
    assert.match(wh.body.subscriberUrl, new RegExp('^http://127\\.0\\.0\\.1:\\d+/api/integrations/calcom/receive/' + state.row.receive_token + '$'), 'the receiver at this server\'s own origin (no APP_BASE_URL set), named by the token');
    assert.equal(wh.body.secret, state.row.webhook_secret, 'signed with the workspace secret'); assert.equal(wh.body.active, true);
    assert.deepEqual(wh.body.triggers, ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED']);
    assert.equal(state.row.webhook_id, 'wh_1', 'Cal.com\'s id remembered');
    assert.equal(fetchCalls[1].headers['cal-api-version'], '2026-06-12');
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO workspace_calcom'));
    assert.ok(ins, 'one insert'); assert.match(ins.sql, /ON CONFLICT \(workspace_id\) DO UPDATE SET/); assert.doesNotMatch(ins.sql, /DO UPDATE SET[^]*receive_token=/, 'the token is not replaced on reconnect'); assert.doesNotMatch(ins.sql, /DO UPDATE SET[^]*webhook_secret=/);
    const p = ins.params;
    assert.equal(p[0], 7);
    assert.match(p[1], /^v1\./, 'sealed'); assert.ok(!p[1].includes(KEY), 'never the plain key'); assert.equal(calcom.openKey(p[1]), KEY, 'and it opens to the key');
    assert.deepEqual(p.slice(2, 7), [42, 'mara', 'mara@example.de', 'Mara Kühn', 'Europe/Berlin']);
    assert.deepEqual(JSON.parse(p[7]), TYPES); assert.equal(p[8], 7, 'the first visible event type');
    assert.match(p[9], /^[0-9a-f]{40}$/, 'receive token'); assert.match(p[10], /^[0-9a-f]{64}$/, 'webhook secret'); assert.equal(p[11], 1, 'connected by the owner');
    assert.equal(r.body.connected, true); assert.equal(r.body.can_manage, true);
    const c = r.body.calcom;
    assert.equal(c.cal_email, 'mara@example.de'); assert.equal(c.cal_name, 'Mara Kühn'); assert.equal(c.cal_username, 'mara'); assert.equal(c.cal_timezone, 'Europe/Berlin');
    assert.deepEqual(c.event_type, { id: 7, slug: '30min', title: '30 Minuten', lengthInMinutes: 30 });
    assert.deepEqual(c.event_types, TYPES, 'the whole list to choose from');
    assert.equal(c.connected_by_name, 'Olaf Owner'); assert.equal(c.webhook_registered, true); assert.equal(c.last_error, null); assert.equal(c.host_user_id, 9, 'the host\'s CRM user, for the booking dialog\'s conflict check');
    noSecrets(r.body);
  });
  test('a member then sees everything that is connected, read-only: the account, the event type and the list (to pick one when booking), not the secrets', async () => {
    await connectAsOwner();
    const r = await member.request('GET', '/api/integrations/calcom');
    assert.equal(r.status, 200); assert.equal(r.body.connected, true); assert.equal(r.body.can_manage, false);
    assert.equal(r.body.calcom.cal_email, 'mara@example.de'); assert.equal(r.body.calcom.event_type.title, '30 Minuten'); assert.equal(r.body.calcom.connected_by_name, 'Olaf Owner');
    assert.deepEqual(r.body.calcom.event_types, TYPES, 'members book, so they see the list'); assert.equal(r.body.calcom.can_manage, false); noSecrets(r.body);
  });
  test('connecting again replaces the account and keeps the receive token, the webhook secret and a still-valid event type choice', async () => {
    await connectAsOwner();
    await owner.request('PATCH', '/api/integrations/calcom', { event_type_id: 8 });
    const token = state.row.receive_token, secret = state.row.webhook_secret;
    fakeCal({ ...CAL_OK, 'https://api.cal.com/v2/me': { status: 200, body: { status: 'success', data: { ...ME, id: 43, email: 'tim@example.de', name: 'Tim Berger' } } } });
    fetchCalls.length = 0;
    const r = await connectAsOwner(KEY2);
    assert.equal(r.body.calcom.cal_email, 'tim@example.de');
    const del = fetchCalls.find(c => c.method === 'DELETE');
    assert.equal(del.url, 'https://api.cal.com/v2/webhooks/wh_1'); assert.equal(del.headers.Authorization, `Bearer ${KEY}`, 'the old account\'s webhook goes with the old key');
    const post = fetchCalls.filter(c => c.url === 'https://api.cal.com/v2/webhooks' && c.method === 'POST');
    assert.equal(post.length, 1); assert.equal(post[0].headers.Authorization, `Bearer ${KEY2}`, 'the new one is made with the new key');
    assert.equal(r.body.calcom.webhook_registered, true);
    assert.equal(r.body.calcom.event_type.id, 8, 'the choice survives when the type still exists');
    assert.equal(state.row.receive_token, token); assert.equal(state.row.webhook_secret, secret);
    assert.equal(calcom.openKey(state.row.api_key_sealed), KEY2);
  });
});

describe('the booking webhook', () => {
  test('Cal.com refuses the webhook: the connection stands, the card says so, a retry registers it', async () => {
    fakeCal(CAL_NO_WEBHOOK);
    const r = await connectAsOwner();
    assert.equal(r.body.connected, true); assert.equal(r.body.calcom.webhook_registered, false);
    assert.equal(r.body.calcom.last_error, 'Webhook: Webhooks need a higher plan'); assert.equal(state.row.webhook_id, null);
    assert.equal((await member.request('POST', '/api/integrations/calcom/register-webhook')).status, 403);
    const still = await owner.request('POST', '/api/integrations/calcom/register-webhook');
    assert.equal(still.status, 502); assert.match(still.body.error, /did not take the webhook: Webhooks need a higher plan/); assert.equal(still.body.connected, true);
    fakeCal(CAL_OK);
    const ok = await owner.request('POST', '/api/integrations/calcom/register-webhook');
    assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.calcom.webhook_registered, true); assert.equal(ok.body.calcom.last_error, null);
    assert.equal(fetchCalls.at(-1).headers.Authorization, `Bearer ${KEY}`, 'with the stored key, opened');
    assert.equal(state.row.webhook_id, 'wh_1');
  });
  test('a retry while one is registered removes it first, so there is never two for one receiver', async () => {
    await connectAsOwner();
    fetchCalls.length = 0;
    await owner.request('POST', '/api/integrations/calcom/register-webhook');
    assert.deepEqual(fetchCalls.map(c => c.method + ' ' + c.url), ['DELETE https://api.cal.com/v2/webhooks/wh_1', 'POST https://api.cal.com/v2/webhooks']);
  });
  test('reconnecting the same account keeps its webhook; no public address is reported, not thrown', async () => {
    await connectAsOwner();
    fetchCalls.length = 0;
    await connectAsOwner(KEY2);   // same cal user id 42 in CAL_OK
    assert.deepEqual(fetchCalls.map(c => c.url), ['https://api.cal.com/v2/me', 'https://api.cal.com/v2/event-types'], 'no webhook call');
    assert.equal(state.row.webhook_id, 'wh_1');
    process.env.APP_BASE_URL = '   ';
    state.row = null; fetchCalls.length = 0;
    const r = await connectAsOwner();
    delete process.env.APP_BASE_URL;
    assert.equal(r.body.calcom.webhook_registered, true, 'blank env falls back to the request origin');
  });
  test('APP_BASE_URL names the public origin when set', async () => {
    process.env.APP_BASE_URL = 'https://crm.example.de/';
    try {
      await connectAsOwner();
      assert.equal(fetchCalls[2].body.subscriberUrl, `https://crm.example.de/api/integrations/calcom/receive/${state.row.receive_token}`);
    } finally { delete process.env.APP_BASE_URL; }
  });
  test('register-webhook when not connected: 404', async () => {
    assert.equal((await owner.request('POST', '/api/integrations/calcom/register-webhook')).status, 404);
  });
});

describe('PATCH /api/integrations/calcom', () => {
  test('member: 403; not connected: 404; unknown type: 400; a hidden type is still allowed', async () => {
    assert.equal((await member.request('PATCH', '/api/integrations/calcom', { event_type_id: 8 })).status, 403);
    assert.equal((await owner.request('PATCH', '/api/integrations/calcom', { event_type_id: 8 })).status, 404);
    await connectAsOwner();
    const bad = await owner.request('PATCH', '/api/integrations/calcom', { event_type_id: 999 });
    assert.equal(bad.status, 400); assert.match(bad.body.error, /event types/);
    assert.equal((await owner.request('PATCH', '/api/integrations/calcom', { event_type_id: 'x' })).status, 400);
    const ok = await owner.request('PATCH', '/api/integrations/calcom', { event_type_id: 8 });
    assert.equal(ok.status, 200); assert.equal(ok.body.calcom.event_type.id, 8);
    const upd = state.calls.find(c => c.sql.startsWith('UPDATE workspace_calcom SET event_type_id=$1'));
    assert.deepEqual(upd.params, [8, 7]); noSecrets(ok.body);
  });
});

describe('POST /api/integrations/calcom/refresh', () => {
  test('re-fetches the event types with the stored key (opened from its seal); a vanished choice is re-picked', async () => {
    await connectAsOwner();
    await owner.request('PATCH', '/api/integrations/calcom', { event_type_id: 8 });
    fakeCal({ 'https://api.cal.com/v2/event-types': { status: 200, body: { status: 'success', data: [{ id: 9, slug: 'call', title: 'Call', lengthInMinutes: 15, hidden: false, ownerId: 42 }] } } });
    const r = await owner.request('POST', '/api/integrations/calcom/refresh');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(fetchCalls.map(c => c.url), ['https://api.cal.com/v2/event-types']);
    assert.equal(fetchCalls[0].headers.Authorization, `Bearer ${KEY}`, 'the seal opened to the key');
    assert.equal(r.body.calcom.event_type.id, 9); assert.deepEqual(r.body.calcom.event_types.map(t => t.id), [9]);
    assert.equal((await member.request('POST', '/api/integrations/calcom/refresh')).status, 403);
  });
  test('a Cal.com error is remembered as last_error and reported; a rotated server secret means connect again', async () => {
    await connectAsOwner();
    fakeCal({ 'https://api.cal.com/v2/event-types': { status: 500, body: { status: 'error', error: { message: 'boom' } } } });
    const r = await owner.request('POST', '/api/integrations/calcom/refresh');
    assert.equal(r.status, 502); assert.match(r.body.error, /boom/);
    assert.equal(state.row.last_error, 'boom');
    process.env.SESSION_SECRET = 'rotated';
    const r2 = await owner.request('POST', '/api/integrations/calcom/refresh');
    assert.equal(r2.status, 409); assert.match(r2.body.error, /connect Cal\.com again/);
  });
});

describe('DELETE /api/integrations/calcom', () => {
  test('member: 403; owner: the row goes and the status reads not connected', async () => {
    await connectAsOwner();
    assert.equal((await member.request('DELETE', '/api/integrations/calcom')).status, 403);
    assert.equal(state.row.cal_email, 'mara@example.de', 'still there');
    fetchCalls.length = 0;
    const r = await owner.request('DELETE', '/api/integrations/calcom');
    assert.equal(r.status, 200); assert.deepEqual(r.body, { success: true, connected: false, calcom: null, can_manage: true });
    assert.deepEqual(fetchCalls.map(c => c.method + ' ' + c.url), ['DELETE https://api.cal.com/v2/webhooks/wh_1'], 'the webhook leaves Cal.com with the connection');
    const del = state.calls.find(c => c.sql.startsWith('DELETE FROM workspace_calcom'));
    assert.deepEqual(del.params, [7]);
    assert.equal((await owner.request('GET', '/api/integrations/calcom')).body.connected, false);
  });
});
