// UNIT tests for utils/calendly.js, the Calendly client (CALENDLY_CHANGES Part 1), over a fake
// api.calendly.com (globalThis.fetch), and for the workspace_calendly table in initDb().
// Pinned: every call carries the bearer token; the account and the event types are read from
// Calendly's `resource` / `collection` shapes; every page of event types is followed; a failure
// becomes a CalendlyError with Calendly's status, message and the scopes it names.
const { test, describe, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { loadDb, ROOT } = require('../helpers/load-db');
const calendly = require(path.join(ROOT, 'utils', 'calendly.js'));

const TOKEN = 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0IiwidHlwIjoiUEFUIn0';
const USER  = 'https://api.calendly.com/users/AAAAAAAAAAAAAAAA';

const realFetch = globalThis.fetch;
let calls = [];
function fake(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    calls.push({ url: u, method: init?.method, headers: init?.headers });
    const r = handler(u);
    if (r.throw) throw Object.assign(new Error(r.throw), { name: r.throw });
    return new Response(r.status === 204 ? null : r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
}
afterEach(() => { globalThis.fetch = realFetch; });

const type = (n, more = {}) => ({ uri: `https://api.calendly.com/event_types/T${n}`, name: `Type ${n}`, active: true, slug: `type-${n}`, scheduling_url: `https://calendly.com/mara/type-${n}`, duration: 30, kind: 'solo', pooling_type: null, type: 'StandardEventType', secret: false, deleted_at: null, locations: null, ...more });

describe('isTokenShaped', () => {
  test('one long word; never empty, short, spaced or not a string', () => {
    assert.equal(calendly.isTokenShaped(TOKEN), true);
    assert.equal(calendly.isTokenShaped('  ' + TOKEN + '\n'), true, 'outer whitespace is trimmed');
    for (const bad of ['', 'short', 'two words that are long enough to pass', 42, null, undefined, 'x'.repeat(4001)]) assert.equal(calendly.isTokenShaped(bad), false, String(bad).slice(0, 20));
  });
});

describe('getMe', () => {
  test('GET /users/me with the bearer token; the account read from `resource`; the zone with its underscore', async () => {
    fake(() => ({ body: { resource: { uri: USER, name: 'Mara Kühn', slug: 'mara', email: 'mara@example.de', scheduling_url: 'https://calendly.com/mara', timezone: 'America/New York', current_organization: 'https://api.calendly.com/organizations/OOOO' } } }));
    const me = await calendly.getMe('  ' + TOKEN + ' ');
    assert.equal(calls.length, 1); assert.equal(calls[0].url.href, 'https://api.calendly.com/users/me');
    assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(me, { uri: USER, organization: 'https://api.calendly.com/organizations/OOOO', name: 'Mara Kühn', email: 'mara@example.de', slug: 'mara', schedulingUrl: 'https://calendly.com/mara', timezone: 'America/New_York' });
  });
  test('an answer without the account is an error, not an empty connection', async () => {
    fake(() => ({ body: { resource: {} } }));
    await assert.rejects(calendly.getMe(TOKEN), e => e instanceof calendly.CalendlyError && e.status === 0);
  });
  test('no token: Calendly is not asked', async () => {
    fake(() => ({ body: {} }));
    await assert.rejects(calendly.getMe(''), e => e instanceof calendly.CalendlyError && e.status === 0 && /token is required/.test(e.message));
    assert.equal(calls.length, 0);
  });
});

describe('failures', () => {
  test('401: Calendly\'s status and message', async () => {
    fake(() => ({ status: 401, body: { title: 'Unauthenticated', message: 'The access token is invalid' } }));
    await assert.rejects(calendly.getMe(TOKEN), e => e instanceof calendly.CalendlyError && e.status === 401 && e.message === 'The access token is invalid' && e.scopes.length === 0);
  });
  test('403 insufficient scope: the scopes Calendly names ride along', async () => {
    fake(() => ({ status: 403, body: { title: 'Insufficient scope', message: 'Insufficient scope', required_scopes: ['users:read', 7] } }));
    await assert.rejects(calendly.getMe(TOKEN), e => e.status === 403 && e.scopes.length === 1 && e.scopes[0] === 'users:read');
  });
  test('no JSON body: the status in words; not reachable and timed out: status 0', async () => {
    fake(() => ({ status: 500 }));
    await assert.rejects(calendly.getMe(TOKEN), e => e.status === 500 && e.message === 'Calendly answered HTTP 500');
    fake(() => ({ throw: 'TypeError' }));
    await assert.rejects(calendly.getMe(TOKEN), e => e.status === 0 && e.message === 'Calendly could not be reached');
    fake(() => ({ throw: 'AbortError' }));
    await assert.rejects(calendly.getMe(TOKEN), e => e.status === 0 && e.message === 'Calendly did not answer in time');
  });
  test('the token never appears in an error', async () => {
    fake(() => ({ status: 401, body: { message: 'no' } }));
    await assert.rejects(calendly.getMe(TOKEN), e => !JSON.stringify({ m: e.message, b: e.body }).includes(TOKEN));
  });
});

describe('listEventTypes', () => {
  test('the user\'s active types, 100 a page, every page followed; deleted ones and ones without a URI dropped', async () => {
    fake(u => u.searchParams.get('page_token') === 'p2'
      ? { body: { collection: [type(3, { secret: true, duration: 45.4, locations: [{ kind: 'google_conference' }, { kind: 'physical', location: ' Hauptstr. 1 ' }, { location: 'no kind' }] })], pagination: { next_page_token: null } } }
      : { body: { collection: [type(1), type(2, { deleted_at: '2026-01-01T00:00:00Z' }), { name: 'no uri' }], pagination: { next_page_token: 'p2' } } });
    const list = await calendly.listEventTypes(TOKEN, USER);
    assert.equal(calls.length, 2);
    const q = calls[0].url.searchParams;
    assert.equal(calls[0].url.pathname, '/event_types'); assert.equal(q.get('user'), USER); assert.equal(q.get('active'), 'true'); assert.equal(q.get('count'), '100'); assert.equal(q.get('page_token'), null);
    assert.equal(calls[1].url.searchParams.get('page_token'), 'p2');
    for (const c of calls) assert.equal(c.headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(list, [
      { uri: 'https://api.calendly.com/event_types/T1', name: 'Type 1', slug: 'type-1', duration: 30, schedulingUrl: 'https://calendly.com/mara/type-1', kind: 'solo', poolingType: null, secret: false, locations: [] },
      { uri: 'https://api.calendly.com/event_types/T3', name: 'Type 3', slug: 'type-3', duration: 45, schedulingUrl: 'https://calendly.com/mara/type-3', kind: 'solo', poolingType: null, secret: true, locations: [{ kind: 'google_conference' }, { kind: 'physical', location: 'Hauptstr. 1' }] },
    ]);
  });
  test('the paging ends even when Calendly always names a next page', async () => {
    fake(() => ({ body: { collection: [type(1)], pagination: { next_page_token: 'again' } } }));
    const list = await calendly.listEventTypes(TOKEN, USER);
    assert.equal(calls.length, 5); assert.equal(list.length, 5);
  });
  test('an empty account: an empty list', async () => {
    fake(() => ({ body: { collection: [], pagination: {} } }));
    assert.deepEqual(await calendly.listEventTypes(TOKEN, USER), []);
  });
});

describe('the webhook (Part 2)', () => {
  const HOOK = 'https://api.calendly.com/webhook_subscriptions/WWWW';
  test('createWebhook: a user-scoped subscription to the two invitee events, signed with our key; the URI comes back', async () => {
    fake(() => ({ status: 201, body: { resource: { uri: HOOK, state: 'active' } } }));
    const wh = await calendly.createWebhook(TOKEN, { url: 'https://crm.example.de/r/abc', organization: 'ORG', user: USER, signingKey: 'k' });
    assert.deepEqual(wh, { uri: HOOK, state: 'active' });
    assert.equal(calls[0].url.href, 'https://api.calendly.com/webhook_subscriptions'); assert.equal(calls[0].method, 'POST');
    fake(() => ({ status: 201, body: { resource: {} } }));
    await assert.rejects(calendly.createWebhook(TOKEN, { url: 'u', organization: 'o', user: USER, signingKey: 'k' }), e => e.status === 0);
  });
  test('deleteWebhook: by the uuid at the end of the URI; already gone counts as done; another failure is thrown', async () => {
    fake(() => ({ status: 204 }));
    assert.equal(await calendly.deleteWebhook(TOKEN, HOOK), true);
    assert.equal(calls[0].url.href, 'https://api.calendly.com/webhook_subscriptions/WWWW'); assert.equal(calls[0].method, 'DELETE');
    fake(() => ({ status: 404, body: { message: 'gone' } }));
    assert.equal(await calendly.deleteWebhook(TOKEN, HOOK), true);
    fake(() => ({ status: 500, body: { message: 'boom' } }));
    await assert.rejects(calendly.deleteWebhook(TOKEN, HOOK), e => e.status === 500);
    assert.equal(calendly.uuidOf(HOOK + '/'), 'WWWW'); assert.equal(calendly.uuidOf(''), null);
  });
  test('verifySignature: t=…,v1=… over "t.body" with the key, in either order; wrong key, changed body, old or future stamp, junk: false', () => {
    const body = Buffer.from('{"event":"invitee.created"}'), now = Date.parse('2026-11-12T10:00:00Z');
    const t = Math.floor(now / 1000);
    const v1 = require('crypto').createHmac('sha256', 'key').update(`${t}.${body}`).digest('hex');
    assert.equal(calendly.signatureHeader('key', body, now), `t=${t},v1=${v1}`, 'the documented scheme: HMAC-SHA256 of t + "." + body');
    assert.equal(calendly.verifySignature(body, `t=${t},v1=${v1}`, 'key', now), true);
    assert.equal(calendly.verifySignature(body, `v1=${v1}, t=${t}`, 'key', now), true);
    assert.equal(calendly.verifySignature(body, `t=${t},v1=${v1}`, 'key', now + 9 * 60000), true, 'nine minutes late is still taken');
    for (const [h, k, at, why] of [[`t=${t},v1=${v1}`, 'other', now, 'wrong key'], [`t=${t},v1=${v1}`, 'key', now + 11 * 60000, 'too old'], [`t=${t},v1=${v1}`, 'key', now - 11 * 60000, 'from the future'],
      [`t=${t + 1},v1=${v1}`, 'key', now, 'another stamp'], [`t=${t},v1=abc`, 'key', now, 'short hex'], ['', 'key', now, 'empty'], [undefined, 'key', now, 'missing'], [`t=${t},v1=${v1}`, '', now, 'no key']]) assert.equal(calendly.verifySignature(body, h, k, at), false, why);
    assert.equal(calendly.verifySignature(Buffer.from('{"event":"x"}'), `t=${t},v1=${v1}`, 'key', now), false, 'changed body');
  });
  test('parseInvitee: the booking in the receiver\'s shape; the name from its parts; the link from join_url or a place that is a link; other events ignored', () => {
    const body = { event: 'invitee.created', payload: { uri: 'INV', event: 'EV', email: ' Jana@Example.de ', name: null, first_name: 'Jana', last_name: 'Weber', timezone: 'Europe/Berlin', old_invitee: 'OLD', rescheduled: false,
      cancel_url: 'https://calendly.com/cancellations/X', reschedule_url: 'https://calendly.com/reschedulings/X', cancellation: { reason: ' Krank ' },
      scheduled_event: { uri: 'EV2', name: 'Erstgespräch', start_time: '2026-11-20T13:00:00.000000Z', end_time: '2026-11-20T13:30:00.000000Z', event_type: 'T', event_memberships: [{ user_email: 'Mara@Example.de', user_name: 'Mara' }], location: { type: 'zoom_conference', join_url: 'https://zoom.us/j/1' } } } };
    const b = calendly.parseInvitee(body);
    assert.deepEqual(b, { trigger: 'invitee.created', uid: 'INV', eventUri: 'EV2', eventType: 'T', oldInvitee: 'OLD', rescheduled: false, title: 'Erstgespräch', start: '2026-11-20T13:00:00.000Z', end: '2026-11-20T13:30:00.000Z',
      organizer: { name: 'Mara', email: 'mara@example.de', timeZone: null }, attendee: { name: 'Jana Weber', email: 'jana@example.de', timeZone: 'Europe/Berlin' }, contactId: null, dealId: null, cancellationReason: 'Krank',
      cancelUrl: 'https://calendly.com/cancellations/X', rescheduleUrl: 'https://calendly.com/reschedulings/X', meetingUrl: 'https://zoom.us/j/1', location: 'Zoom' });
    const custom = calendly.parseInvitee({ event: 'invitee.canceled', payload: { uri: 'I', rescheduled: true, scheduled_event: { location: { type: 'custom', location: 'https://example.org/room' } } } });
    assert.equal(custom.rescheduled, true); assert.equal(custom.meetingUrl, 'https://example.org/room'); assert.equal(custom.organizer, null); assert.equal(custom.eventUri, null);
    assert.equal(calendly.parseInvitee({ event: 'invitee.created', payload: { uri: 'I', scheduled_event: { location: { type: 'physical', location: 'Hauptstr. 1' } } } }).meetingUrl, null);
    assert.deepEqual(calendly.parseInvitee({ event: 'invitee_no_show.created', payload: {} }), { trigger: null, ignored: 'invitee_no_show.created' });
    assert.deepEqual(calendly.parseInvitee(null), { trigger: null, ignored: null });
  });
  test('inviteeToActivity: the event\'s name with the customer, on the given zone\'s clock; fallbacks without a name, a title or a start', () => {
    const b = { uid: 'INV', eventUri: 'EV', title: 'Erstgespräch', start: '2026-11-20T23:30:00.000Z', attendee: { name: 'Jana Weber', email: 'j@x.de' }, meetingUrl: 'https://meet.google.com/a' };
    assert.deepEqual(calendly.inviteeToActivity(b, 'Europe/Berlin'), { type: 'meeting', content: 'Erstgespräch: Jana Weber\nhttps://meet.google.com/a', event_date: '2026-11-21', event_time: '00:30', event_tz: 'Europe/Berlin', calendly_uri: 'INV', calendly_event_uri: 'EV' });
    assert.equal(calendly.inviteeToActivity({ ...b, title: null, meetingUrl: null }, null).content, 'Termin mit Jana Weber');
    assert.equal(calendly.inviteeToActivity({ uid: 'I', attendee: {} }, 'Europe/Berlin').content, 'Termin');
    assert.equal(calendly.inviteeToActivity({ uid: 'I', title: 'T', attendee: { email: 'j@x.de' } }, 'Europe/Berlin').content, 'T: j@x.de');
    assert.equal(calendly.inviteeToActivity({ uid: 'I', attendee: {} }, 'Europe/Berlin').event_date, null);
  });
});

describe('booking and cancelling (kept for booking from a deal, Part 3)', () => {
  test('createInvitee: POST /invitees with the event type, the UTC start, the invitee and our mark; the booking and its event come back', async () => {
    let sent;
    globalThis.fetch = async (url, init) => { sent = { url: String(url), method: init.method, body: JSON.parse(init.body), auth: init.headers.Authorization }; return new Response(JSON.stringify({ resource: { uri: 'INV', event: 'EV', cancel_url: 'https://calendly.com/cancellations/X', reschedule_url: 'https://calendly.com/reschedulings/X' } }), { status: 201, headers: { 'content-type': 'application/json' } }); };
    const b = await calendly.createInvitee(TOKEN, { eventType: 'T', start: '2026-11-04T05:00:00.000Z', name: 'fonio: Erika (+49171)', email: 'team@example.de', timezone: 'Europe/Berlin', utmSource: 'upgrads_fonio' });
    assert.deepEqual(b, { uri: 'INV', eventUri: 'EV', cancelUrl: 'https://calendly.com/cancellations/X', rescheduleUrl: 'https://calendly.com/reschedulings/X' });
    assert.deepEqual(sent, { url: 'https://api.calendly.com/invitees', method: 'POST', auth: `Bearer ${TOKEN}`, body: { event_type: 'T', start_time: '2026-11-04T05:00:00.000Z', invitee: { name: 'fonio: Erika (+49171)', email: 'team@example.de', timezone: 'Europe/Berlin' }, tracking: { utm_campaign: null, utm_source: 'upgrads_fonio', utm_medium: null, utm_content: null, utm_term: null, salesforce_uuid: null } } });
    fake(() => ({ status: 201, body: { resource: {} } }));
    await assert.rejects(calendly.createInvitee(TOKEN, { eventType: 'T', start: 's', name: 'n', email: 'e', timezone: 'z' }), e => e.status === 0);
    fake(() => ({ status: 403, body: { title: 'Permission Denied', message: 'Please upgrade your Calendly account to Standard' } }));
    await assert.rejects(calendly.createInvitee(TOKEN, { eventType: 'T', start: 's', name: 'n', email: 'e', timezone: 'z' }), e => e.status === 403 && /upgrade/.test(e.message));
  });
  test('bookingLocation: the event type\'s first place in the shape a booking takes; the invitee\'s number where the host calls; none for a type without a place or a round robin', () => {
    const type = locations => ({ uri: 'T', poolingType: null, locations });
    for (const [locations, want] of [
      [[{ kind: 'google_conference' }, { kind: 'zoom_conference' }], { kind: 'google_conference' }],
      [[{ kind: 'outbound_call' }], { kind: 'outbound_call', location: '+491711234567' }],
      [[{ kind: 'ask_invitee' }], { kind: 'ask_invitee', location: '+491711234567' }],
      [[{ kind: 'physical', location: 'Hauptstr. 1' }], { kind: 'physical', location: 'Hauptstr. 1' }],
      [[{ kind: 'inbound_call' }], { kind: 'inbound_call' }],
      [[], null],
    ]) assert.deepEqual(calendly.bookingLocation(type(locations), '+491711234567'), want, JSON.stringify(locations));
    assert.equal(calendly.bookingLocation({ poolingType: 'round_robin', locations: [{ kind: 'zoom_conference' }] }, '1'), null);
    assert.equal(calendly.bookingLocation(undefined, '1'), null);
  });
  test('a refusal names what was wrong: Calendly\'s details ride along with its message (seen 2026-11-12: every tracking key is wanted)', async () => {
    fake(() => ({ status: 400, body: { title: 'Invalid Argument', message: 'The supplied parameters are invalid.', details: [{ parameter: 'tracking.utm_campaign', message: 'is missing' }, { message: 'start_time is not available' }] } }));
    await assert.rejects(calendly.createInvitee(TOKEN, { eventType: 'T', start: 's', name: 'n', email: 'e', timezone: 'z' }), e => e.message === 'The supplied parameters are invalid. (tracking.utm_campaign: is missing; start_time is not available)');
  });
  test('cancelEvent: POST /scheduled_events/:uuid/cancellation; gone or already cancelled counts as done; another failure is thrown', async () => {
    fake(() => ({ status: 201, body: { resource: {} } }));
    assert.equal(await calendly.cancelEvent(TOKEN, 'https://api.calendly.com/scheduled_events/EV1', { reason: 'The call was cancelled' }), true);
    assert.equal(calls[0].url.href, 'https://api.calendly.com/scheduled_events/EV1/cancellation'); assert.equal(calls[0].method, 'POST');
    for (const status of [403, 404]) { fake(() => ({ status, body: { message: 'x' } })); assert.equal(await calendly.cancelEvent(TOKEN, 'https://api.calendly.com/scheduled_events/EV1'), true); }
    fake(() => ({ status: 500, body: { message: 'boom' } }));
    await assert.rejects(calendly.cancelEvent(TOKEN, 'https://api.calendly.com/scheduled_events/EV1'), e => e.status === 500);
  });
});

describe('workspace_calendly', () => {
  let sqls;
  before(async () => {
    const pool = createFakePool([{ match: /COUNT\(\*\)::int AS n/, reply: () => ({ rows: [{ n: 1 }] }) }]);
    const { initDb } = loadDb(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), pool);
    await initDb();
    sqls = pool.log.map(e => e.sql);
  });
  test('created once, guarded, one row per workspace, the token sealed, the receive token unique', () => {
    const hits = sqls.filter(s => /CREATE TABLE IF NOT EXISTS workspace_calendly \(/.test(s));
    assert.equal(hits.length, 1);
    const s = hits[0].replace(/\s+/g, ' ');
    assert.match(s, /workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(s, /token_sealed TEXT NOT NULL/); assert.doesNotMatch(s, /\btoken TEXT/, 'never a plain token column');
    for (const col of ['user_uri TEXT NOT NULL', 'org_uri TEXT', 'cly_name TEXT', 'cly_email TEXT', 'cly_slug TEXT', 'cly_timezone TEXT', 'scheduling_url TEXT', "event_types JSONB NOT NULL DEFAULT '[]'", 'event_type_uri TEXT', 'receive_token TEXT NOT NULL UNIQUE', 'webhook_secret TEXT NOT NULL', 'webhook_uri TEXT', 'connected_by INTEGER REFERENCES users(id) ON DELETE SET NULL', 'last_error TEXT']) assert.ok(s.includes(col), col);
  });
  test('it sits right after Cal.com\'s table and columns', () => {
    const i = sqls.findIndex(s => /CREATE TABLE IF NOT EXISTS workspace_calendly/.test(s));
    const c = sqls.findIndex(s => /CREATE TABLE IF NOT EXISTS workspace_calcom/.test(s));
    const u = sqls.findIndex(s => /CREATE TABLE IF NOT EXISTS user_workspaces/.test(s));
    assert.ok(c < i && i < u, `${c} < ${i} < ${u}`);
  });
});
