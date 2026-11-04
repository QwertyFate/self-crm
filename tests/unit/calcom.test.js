// UNIT: utils/calcom.js — the Cal.com client and the sealing of its API key
// (Cal.com integration, piece 1, 2026-10-13).
//
// The module is the only code that talks to api.cal.com and the only code that
// knows how the workspace's key is stored. These tests pin: the key is sealed
// with AES-256-GCM under the server secret and never stored or logged in plain
// text; a tampered or foreign seal fails loudly; every call sends the bearer
// header and the cal-api-version the endpoint wants; Cal.com's errors, a
// network failure and a timeout all surface as a CalError with a status the
// routes can map; the answers are normalised to the few fields the app uses.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { ROOT } = require('../helpers/load-route');

const cal = require(path.join(ROOT, 'utils', 'calcom.js'));
const KEY = 'cal_live_0123456789abcdef0123456789abcdef';

const env = {};
beforeEach(() => {
  for (const k of ['CALCOM_ENCRYPTION_KEY', 'SESSION_SECRET', 'CALCOM_API_URL']) { env[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'test-session-secret';
});
afterEach(() => {
  for (const k of Object.keys(env)) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  delete globalThis.fetch.__calls;
  if (globalThis.fetch.__restore) globalThis.fetch.__restore();
});

// A fake api.cal.com: answers from `plan` (path → { status, body } or a function), records every call.
function fakeCal(plan) {
  const real = globalThis.fetch;
  const calls = [];
  const fake = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method, headers: init?.headers, body: init?.body, signal: init?.signal });
    const key = Object.keys(plan).find(p => u.startsWith(p));
    const entry = key ? plan[key] : { status: 404, body: { status: 'error', error: { message: 'no such route' } } };
    const r = typeof entry === 'function' ? await entry(init) : entry;
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
  fake.__calls = calls;
  fake.__restore = () => { globalThis.fetch = real; };
  globalThis.fetch = fake;
  return calls;
}

describe('the key at rest', () => {
  test('sealKey hides the key; openKey gives it back; two seals of the same key differ', () => {
    const a = cal.sealKey(KEY), b = cal.sealKey(KEY);
    assert.match(a, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'v1.<iv>.<tag>.<ciphertext>, base64url');
    assert.ok(!a.includes(KEY) && !a.includes('cal_live'), 'nothing of the key is readable');
    assert.notEqual(a, b, 'a fresh iv every time');
    assert.equal(cal.openKey(a), KEY);
    assert.equal(cal.openKey(b), KEY);
  });
  test('a tampered seal, a seal under another secret, and junk all fail loudly', () => {
    const sealed = cal.sealKey(KEY);
    const parts = sealed.split('.');
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('AA') ? 'BB' : 'AA');
    assert.throws(() => cal.openKey(parts.join('.')), /cannot be opened/);
    process.env.SESSION_SECRET = 'another-secret';
    assert.throws(() => cal.openKey(sealed), /cannot be opened/, 'a changed server secret means: connect again');
    process.env.SESSION_SECRET = 'test-session-secret';
    assert.throws(() => cal.openKey('v0.a.b.c'), /not in a known format/);
    assert.throws(() => cal.openKey('plain text'), /not in a known format/);
    assert.throws(() => cal.openKey(null), /not in a known format/);
    assert.throws(() => cal.sealKey(''), TypeError);
  });
  test('CALCOM_ENCRYPTION_KEY wins over SESSION_SECRET when set', () => {
    const underSession = cal.sealKey(KEY);
    process.env.CALCOM_ENCRYPTION_KEY = 'dedicated';
    assert.throws(() => cal.openKey(underSession), /cannot be opened/);
    assert.equal(cal.openKey(cal.sealKey(KEY)), KEY);
  });
  test('isApiKeyShaped: Cal.com keys start with cal_', () => {
    assert.equal(cal.isApiKeyShaped(KEY), true);
    assert.equal(cal.isApiKeyShaped('  cal_test_abcdefgh  '), true);
    for (const bad of ['', 'cal_', 'cal_short', 'sk_live_abcdefghij', 'cal live abcdefghij', 42, null, undefined]) assert.equal(cal.isApiKeyShaped(bad), false, String(bad));
  });
});

describe('the calls', () => {
  test('getMe: GET /v2/me with the bearer header and no version header; the profile is normalised', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/me': { status: 200, body: { status: 'success', data: { id: 42, username: 'mara', email: 'mara@example.de', name: 'Mara Kühn', timeZone: 'Europe/Berlin', bio: 'x', weekStart: 'Monday' } } } });
    const me = await cal.getMe(KEY);
    assert.deepEqual(me, { id: 42, username: 'mara', email: 'mara@example.de', name: 'Mara Kühn', timeZone: 'Europe/Berlin' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.cal.com/v2/me');
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.equal(calls[0].headers.Accept, 'application/json');
    assert.equal(calls[0].headers['cal-api-version'], undefined);
    assert.equal(calls[0].body, undefined);
    assert.ok(calls[0].signal instanceof AbortSignal, 'every call can time out');
  });
  test('listEventTypes: GET /v2/event-types with cal-api-version 2026-06-12; the list is normalised and rows without an id are dropped', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/event-types': { status: 200, body: { status: 'success', data: [
      { id: 7, slug: '30min', title: '30 Minuten', lengthInMinutes: 30, hidden: false, ownerId: 42, description: 'd', users: [] },
      { id: 8, slug: 'besichtigung', title: 'Besichtigung', lengthInMinutes: 60, hidden: true, ownerId: 42 },
      { slug: 'broken', title: 'no id' },
    ] } } });
    const list = await cal.listEventTypes(KEY);
    assert.deepEqual(list, [
      { id: 7, slug: '30min', title: '30 Minuten', lengthInMinutes: 30, hidden: false, ownerId: 42, locations: [] },
      { id: 8, slug: 'besichtigung', title: 'Besichtigung', lengthInMinutes: 60, hidden: true, ownerId: 42, locations: [] },
    ]);
    assert.equal(calls[0].url, 'https://api.cal.com/v2/event-types');
    assert.equal(calls[0].headers['cal-api-version'], cal.VERSION_EVENT_TYPES);
    assert.equal(cal.VERSION_EVENT_TYPES, '2026-06-12');
  });
  test('an answer without a data array is an empty list, not a crash', async () => {
    fakeCal({ 'https://api.cal.com/v2/event-types': { status: 200, body: { status: 'success', data: null } } });
    assert.deepEqual(await cal.listEventTypes(KEY), []);
  });
  test('calFetch: query and JSON body, the key trimmed, CALCOM_API_URL for a self-hosted Cal.com', async () => {
    process.env.CALCOM_API_URL = 'https://cal.example.de/api/v2/';
    const calls = fakeCal({ 'https://cal.example.de/api/v2/bookings': { status: 201, body: { status: 'success', data: { uid: 'b1' } } } });
    const json = await cal.calFetch(`  ${KEY}  `, '/bookings', { method: 'POST', version: '2026-02-25', body: { start: '2026-10-20T09:00:00Z' }, query: { x: 1, empty: '', skip: null } });
    assert.equal(json.data.uid, 'b1');
    assert.equal(calls[0].url, 'https://cal.example.de/api/v2/bookings?x=1');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.equal(calls[0].headers['cal-api-version'], '2026-02-25');
    assert.equal(calls[0].headers['Content-Type'], 'application/json');
    assert.equal(calls[0].body, '{"start":"2026-10-20T09:00:00Z"}');
    assert.equal(cal.apiUrl(), 'https://cal.example.de/api/v2');
  });
});

describe('the errors', () => {
  test('a rejected key: CalError with Cal.com\'s status and message, the key nowhere in it', async () => {
    fakeCal({ 'https://api.cal.com/v2/me': { status: 401, body: { status: 'error', error: { message: 'Invalid API key', code: 'UNAUTHORIZED' } } } });
    await assert.rejects(cal.getMe(KEY), err => {
      assert.equal(err.name, 'CalError'); assert.equal(err.status, 401); assert.equal(err.message, 'Invalid API key');
      assert.ok(!String(err.message).includes(KEY) && !JSON.stringify(err.body).includes(KEY));
      return true;
    });
  });
  test('an error body in another shape still yields a message; no body at all yields the status', async () => {
    fakeCal({ 'https://api.cal.com/v2/me': { status: 429, body: { message: ['Too many requests'] } } });
    await assert.rejects(cal.getMe(KEY), err => err.status === 429 && err.message === 'Too many requests');
    fakeCal({ 'https://api.cal.com/v2/me': { status: 502 } });
    await assert.rejects(cal.getMe(KEY), err => err.status === 502 && err.message === 'Cal.com answered HTTP 502' && err.body === null);
  });
  test('no network: status 0, "could not be reached"', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    globalThis.fetch.__restore = () => { globalThis.fetch = real; };
    await assert.rejects(cal.getMe(KEY), err => err.name === 'CalError' && err.status === 0 && /could not be reached/.test(err.message));
  });
  test('a timeout: the request is aborted and reported as status 0, "did not answer in time"', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (url, init) => new Promise((_, reject) => { init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }); });
    globalThis.fetch.__restore = () => { globalThis.fetch = real; };
    await assert.rejects(cal.calFetch(KEY, '/me', { timeoutMs: 20 }), err => err.status === 0 && /did not answer in time/.test(err.message));
    assert.equal(cal.TIMEOUT_MS, 10000, 'ten seconds by default');
  });
  test('a key that is not key-shaped never reaches the network', async () => {
    const calls = fakeCal({});
    await assert.rejects(cal.getMe('nope'), err => err.name === 'CalError' && err.status === 0 && /API key is required/.test(err.message));
    await assert.rejects(cal.listEventTypes(''), err => err.status === 0);
    assert.equal(calls.length, 0);
  });
});

// ── Step 2, piece 1: the webhook mapping ─────────────────────────────────────
const BOOKING = {
  triggerEvent: 'BOOKING_CREATED', createdAt: '2026-10-13T08:00:00.000Z',
  payload: {
    type: '30min', title: '30 Minuten zwischen Mara Kühn und Jana Weber', description: '', additionalNotes: '',
    startTime: '2026-10-20T13:00:00Z', endTime: '2026-10-20T13:30:00Z',
    organizer: { id: 42, name: 'Mara Kühn', email: 'Mara@Example.de', username: 'mara', timeZone: 'Europe/Berlin', language: { locale: 'de' } },
    responses: { name: { label: 'your_name', value: 'Jana Weber' }, email: { label: 'email_address', value: 'jana.weber@example.de' } },
    attendees: [{ email: 'Jana.Weber@example.de', name: 'Jana Weber', timeZone: 'Europe/Berlin', language: { locale: 'de' } }],
    location: 'Cal Video', eventTypeId: 7, uid: 'bFJeNb2uX8ANpT3JL5EfXw', eventTitle: '30min', length: 30, bookingId: 91,
    metadata: { videoCallUrl: 'https://app.cal.com/video/bFJeNb2uX8ANpT3JL5EfXw', upgrads_deal_id: '12', upgrads_contact_id: 5 },
    status: 'ACCEPTED',
  },
};

describe('the webhook: signature', () => {
  test('verifySignature: Cal.com\'s hex HMAC-SHA256 over the raw body, constant time; wrong, missing or malformed fails', () => {
    const raw = Buffer.from(JSON.stringify(BOOKING));
    const secret = 'a'.repeat(64);
    const sig = cal.signBody(secret, raw);
    assert.match(sig, /^[0-9a-f]{64}$/);
    assert.equal(cal.verifySignature(raw, sig, secret), true);
    assert.equal(cal.verifySignature(raw, 'sha256=' + sig, secret), true, 'a prefixed form is tolerated');
    assert.equal(cal.verifySignature(raw, '  ' + sig.toUpperCase() + ' ', secret), true, 'hex case and whitespace do not matter');
    assert.equal(cal.verifySignature(Buffer.from(JSON.stringify({ ...BOOKING, createdAt: 'x' })), sig, secret), false, 'another body');
    assert.equal(cal.verifySignature(raw, sig, 'b'.repeat(64)), false, 'another secret');
    assert.equal(cal.verifySignature(raw, sig.slice(0, -2), secret), false, 'truncated');
    assert.equal(cal.verifySignature(raw, 'zz' + sig.slice(2), secret), false, 'not hex');
    assert.equal(cal.verifySignature(raw, '', secret), false); assert.equal(cal.verifySignature(raw, undefined, secret), false); assert.equal(cal.verifySignature(raw, sig, ''), false);
  });
});

describe('the webhook: parseBooking', () => {
  test('a created booking: uid, title, start and end as ISO, the host and the customer with lower-cased emails, our metadata read back', () => {
    const b = cal.parseBooking(BOOKING);
    assert.equal(b.trigger, 'BOOKING_CREATED'); assert.equal(b.uid, 'bFJeNb2uX8ANpT3JL5EfXw'); assert.equal(b.rescheduleUid, null);
    assert.equal(b.title, '30 Minuten zwischen Mara Kühn und Jana Weber');
    assert.equal(b.start, '2026-10-20T13:00:00.000Z'); assert.equal(b.end, '2026-10-20T13:30:00.000Z');
    assert.deepEqual(b.organizer, { name: 'Mara Kühn', email: 'mara@example.de', timeZone: 'Europe/Berlin' });
    assert.deepEqual(b.attendee,  { name: 'Jana Weber', email: 'jana.weber@example.de', timeZone: 'Europe/Berlin' });
    assert.equal(b.dealId, 12); assert.equal(b.contactId, 5); assert.equal(b.metadata.videoCallUrl, 'https://app.cal.com/video/bFJeNb2uX8ANpT3JL5EfXw');
    assert.equal(b.cancellationReason, null);
  });
  test('the customer is the first attendee who is not the host; a booking without a title falls back to the event title', () => {
    const b = cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { ...BOOKING.payload, title: '', attendees: [{ email: 'mara@example.de', name: 'Mara Kühn' }, { email: 'tim@example.de', name: 'Tim Berger' }] } });
    assert.equal(b.attendee.email, 'tim@example.de'); assert.equal(b.attendees.length, 2); assert.equal(b.title, '30min');
    const only = cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', attendees: [{ email: 'mara@example.de', name: 'Mara Kühn' }], organizer: { email: 'mara@example.de' } } });
    assert.equal(only.attendee.email, 'mara@example.de', 'with nobody else, the host is the attendee rather than nobody');
  });
  test('rescheduled carries the old uid; cancelled carries the reason', () => {
    const r = cal.parseBooking({ triggerEvent: 'BOOKING_RESCHEDULED', payload: { ...BOOKING.payload, uid: 'newUid', rescheduleUid: 'bFJeNb2uX8ANpT3JL5EfXw', startTime: '2026-10-21T09:00:00Z', endTime: '2026-10-21T09:30:00Z' } });
    assert.equal(r.trigger, 'BOOKING_RESCHEDULED'); assert.equal(r.uid, 'newUid'); assert.equal(r.rescheduleUid, 'bFJeNb2uX8ANpT3JL5EfXw'); assert.equal(r.start, '2026-10-21T09:00:00.000Z');
    const c = cal.parseBooking({ triggerEvent: 'BOOKING_CANCELLED', payload: { ...BOOKING.payload, status: 'CANCELLED', cancellationReason: 'Krank' } });
    assert.equal(c.trigger, 'BOOKING_CANCELLED'); assert.equal(c.uid, 'bFJeNb2uX8ANpT3JL5EfXw'); assert.equal(c.cancellationReason, 'Krank');
  });
  test('any other trigger, or no body, is reported as ignored; junk fields never throw', () => {
    assert.deepEqual(cal.parseBooking({ triggerEvent: 'MEETING_ENDED', uid: 'x', title: 'flat' }), { trigger: null, ignored: 'MEETING_ENDED' });
    assert.deepEqual(cal.parseBooking({}), { trigger: null, ignored: null }); assert.deepEqual(cal.parseBooking(null), { trigger: null, ignored: null });
    const b = cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 7, startTime: 'not a date', attendees: 'nope', organizer: 'nope', metadata: 'nope' } });
    assert.equal(b.uid, null); assert.equal(b.start, null); assert.deepEqual(b.attendees, []); assert.equal(b.attendee, null); assert.equal(b.organizer, null); assert.equal(b.dealId, null);
  });
});

describe('the webhook: wallClock and bookingToActivity', () => {
  test('a UTC instant becomes the host\'s date and time: summer and winter in Berlin, a day change in Tokyo, an unknown zone falls back and says so', () => {
    assert.deepEqual(cal.wallClock('2026-07-15T13:00:00Z', 'Europe/Berlin'), { date: '2026-07-15', time: '15:00', zone: 'Europe/Berlin' });
    assert.deepEqual(cal.wallClock('2026-01-15T13:05:00Z', 'Europe/Berlin'), { date: '2026-01-15', time: '14:05', zone: 'Europe/Berlin' });
    assert.deepEqual(cal.wallClock('2026-01-15T23:30:00Z', 'Asia/Tokyo'),    { date: '2026-01-16', time: '08:30', zone: 'Asia/Tokyo' });
    assert.deepEqual(cal.wallClock('2026-01-15T00:10:00Z', 'America/New_York'), { date: '2026-01-14', time: '19:10', zone: 'America/New_York' });
    assert.deepEqual(cal.wallClock('2026-10-20T13:00:00Z', 'Mars/Olympus'), { date: '2026-10-20', time: '15:00', zone: 'Europe/Berlin' });
    assert.deepEqual(cal.wallClock('2026-10-20T13:00:00Z', ''), { date: '2026-10-20', time: '15:00', zone: 'Europe/Berlin' });
    assert.equal(cal.wallClock('garbage', 'Europe/Berlin'), null);
    assert.equal(cal.FALLBACK_ZONE, 'Europe/Berlin');
  });
  test('bookingToActivity: type meeting, Cal.com\'s title, the host\'s wall clock and zone stamped, the uid kept; without a start no date', () => {
    const a = cal.bookingToActivity(cal.parseBooking(BOOKING));
    assert.deepEqual(a, { type: 'meeting', content: '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://app.cal.com/video/bFJeNb2uX8ANpT3JL5EfXw', event_date: '2026-10-20', event_time: '15:00', event_tz: 'Europe/Berlin', calcom_uid: 'bFJeNb2uX8ANpT3JL5EfXw' }, 'the video link from the webhook\'s metadata on the second line');
    const noTitle = cal.bookingToActivity(cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', attendees: [{ name: 'Jana Weber', email: 'j@x.de' }] } }), 'Asia/Tokyo');
    assert.deepEqual(noTitle, { type: 'meeting', content: 'Termin mit Jana Weber', event_date: null, event_time: null, event_tz: null, calcom_uid: 'u' });
    const tz = cal.bookingToActivity(cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', startTime: '2026-01-15T23:30:00Z', organizer: { email: 'h@x.de' } } }), 'Asia/Tokyo');
    assert.equal(tz.event_tz, 'Asia/Tokyo', 'no zone on the host: the connection\'s zone'); assert.equal(tz.event_date, '2026-01-16'); assert.equal(tz.content, 'Termin');
  });
});

// ── Step 2, piece 3: the webhook calls ────────────────────────────────────────
describe('the webhook calls', () => {
  test('createWebhook: POST /v2/webhooks with the receiver, the three triggers, active and the secret; the id comes back as a string', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/webhooks': { status: 201, body: { status: 'success', data: { id: 123, subscriberUrl: 'https://crm/x', active: true } } } });
    const wh = await cal.createWebhook(KEY, { subscriberUrl: 'https://crm/x', secret: 's'.repeat(64) });
    assert.deepEqual(wh, { id: '123', subscriberUrl: 'https://crm/x', active: true });
    assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.deepEqual(JSON.parse(calls[0].body), { subscriberUrl: 'https://crm/x', triggers: ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED'], active: true, secret: 's'.repeat(64) });
    assert.deepEqual(cal.WEBHOOK_TRIGGERS, ['BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED']);
  });
  test('createWebhook without an id in the answer, or refused, is a CalError', async () => {
    fakeCal({ 'https://api.cal.com/v2/webhooks': { status: 201, body: { status: 'success', data: {} } } });
    await assert.rejects(cal.createWebhook(KEY, { subscriberUrl: 'https://crm/x', secret: 's' }), err => err.name === 'CalError' && /without an id/.test(err.message));
    fakeCal({ 'https://api.cal.com/v2/webhooks': { status: 403, body: { status: 'error', error: { message: 'nope' } } } });
    await assert.rejects(cal.createWebhook(KEY, { subscriberUrl: 'https://crm/x', secret: 's' }), err => err.status === 403 && err.message === 'nope');
  });
  test('deleteWebhook: DELETE /v2/webhooks/:id; an already-gone webhook (404) counts as done; other errors throw', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/webhooks/wh%2F1': { status: 200, body: { status: 'success' } }, 'https://api.cal.com/v2/webhooks/gone': { status: 404, body: { status: 'error', error: { message: 'not found' } } }, 'https://api.cal.com/v2/webhooks/bad': { status: 500, body: {} } });
    assert.equal(await cal.deleteWebhook(KEY, 'wh/1'), true); assert.equal(calls[0].method, 'DELETE'); assert.equal(calls[0].url, 'https://api.cal.com/v2/webhooks/wh%2F1');
    assert.equal(await cal.deleteWebhook(KEY, 'gone'), true);
    await assert.rejects(cal.deleteWebhook(KEY, 'bad'), err => err.status === 500);
  });
});

// ── Step 3, piece 1: booking from the CRM ─────────────────────────────────────
describe('booking from the CRM', () => {
  test('getSlots: GET /v2/slots with cal-api-version 2024-09-04, the event type, the range, the zone and format=range; the answer per day as ISO instants, junk dropped', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/slots': { status: 200, body: { status: 'success', data: { '2026-10-20': [{ start: '2026-10-20T09:00:00.000+02:00', end: '2026-10-20T09:30:00.000+02:00' }, { start: 'nope' }, 'junk'], '2026-10-21': [], 'not-a-date': [{ start: '2026-10-22T09:00:00Z' }], '2026-10-23': 'junk' } } } });
    const days = await cal.getSlots(KEY, { eventTypeId: 7, start: '2026-10-20', end: '2026-10-27', timeZone: 'Europe/Berlin' });
    assert.deepEqual(days, { '2026-10-20': [{ start: '2026-10-20T07:00:00.000Z', end: '2026-10-20T07:30:00.000Z' }], '2026-10-21': [] });
    const u = new URL(calls[0].url);
    assert.equal(u.pathname, '/v2/slots'); assert.equal(calls[0].headers['cal-api-version'], '2024-09-04'); assert.equal(cal.VERSION_SLOTS, '2024-09-04');
    assert.deepEqual(Object.fromEntries(u.searchParams), { eventTypeId: '7', start: '2026-10-20', end: '2026-10-27', timeZone: 'Europe/Berlin', format: 'range' });
    fakeCal({ 'https://api.cal.com/v2/slots': { status: 200, body: { status: 'success', data: [] } } });
    assert.deepEqual(await cal.getSlots(KEY, { eventTypeId: 7, start: '2026-10-20', end: '2026-10-21', timeZone: 'Europe/Berlin' }), {}, 'an array where an object was expected is no slots, not a crash');
  });
  test('createBooking: POST /v2/bookings with cal-api-version 2026-02-25, the attendee (zone and language defaulted), metadata only when given, the note as the notes field, the length only when given; the answer normalised', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/bookings': { status: 201, body: { status: 'success', data: { uid: 'bk_1', title: 'T', start: '2026-10-20T12:00:00Z', end: '2026-10-20T12:30:00Z', status: 'accepted', meetingUrl: 'https://app.cal.com/video/bk_1', eventTypeId: 7, duration: 30, hosts: [{ name: 'Mara', email: 'Mara@Example.de', timeZone: 'Europe/Berlin' }], attendees: [{ name: 'Jana', email: 'J@x.de', timeZone: 'Europe/Berlin' }] } } } });
    const b = await cal.createBooking(KEY, { eventTypeId: 7, start: '2026-10-20T12:00:00.000Z', attendee: { name: 'Jana', email: 'j@x.de' }, metadata: { upgrads_deal_id: '12' }, notes: '  hi  ', lengthInMinutes: 30 });
    assert.equal(calls[0].headers['cal-api-version'], '2026-02-25'); assert.equal(cal.VERSION_BOOKINGS, '2026-02-25');
    assert.deepEqual(JSON.parse(calls[0].body), { start: '2026-10-20T12:00:00.000Z', eventTypeId: 7, attendee: { name: 'Jana', email: 'j@x.de', timeZone: 'Europe/Berlin', language: 'de' }, metadata: { upgrads_deal_id: '12' }, bookingFieldsResponses: { notes: 'hi' }, lengthInMinutes: 30 });
    assert.deepEqual(b, { uid: 'bk_1', title: 'T', start: '2026-10-20T12:00:00.000Z', end: '2026-10-20T12:30:00.000Z', status: 'accepted', location: null, meetingUrl: 'https://app.cal.com/video/bk_1', eventTypeId: 7, duration: 30, rescheduledFromUid: null, cancellationReason: null, hosts: [{ name: 'Mara', email: 'mara@example.de', timeZone: 'Europe/Berlin' }], attendees: [{ name: 'Jana', email: 'j@x.de', timeZone: 'Europe/Berlin' }] });
    await cal.createBooking(KEY, { eventTypeId: 7, start: '2026-10-20T12:00:00.000Z', attendee: { name: 'Jana', email: 'j@x.de', timeZone: 'Asia/Tokyo', language: 'en' }, metadata: {}, notes: '   ' });
    assert.deepEqual(JSON.parse(calls[1].body), { start: '2026-10-20T12:00:00.000Z', eventTypeId: 7, attendee: { name: 'Jana', email: 'j@x.de', timeZone: 'Asia/Tokyo', language: 'en' } }, 'no empty metadata, no blank note, no length');
    fakeCal({ 'https://api.cal.com/v2/bookings': { status: 201, body: { status: 'success', data: { title: 'no uid' } } } });
    await assert.rejects(cal.createBooking(KEY, { eventTypeId: 7, start: '2026-10-20T12:00:00.000Z', attendee: { name: 'J', email: 'j@x.de' } }), err => err.name === 'CalError' && /without a uid/.test(err.message));
  });
});

// ── Part 6: where the meeting happens ─────────────────────────────────────────
describe('locations', () => {
  test('listEventTypes keeps the locations Cal.com lists, with only the fields the dialog and the booking need; junk dropped', async () => {
    fakeCal({ 'https://api.cal.com/v2/event-types': { status: 200, body: { status: 'success', data: [{ id: 7, title: 'T', locations: [
      { type: 'integration', integration: 'google-meet', credentialId: 5 }, { type: 'integration', integration: 'cal-video' }, { type: 'integration' },
      { type: 'address', address: 'Elbstraße 12', public: true }, { type: 'link', link: 'https://x.example/room', public: false }, { type: 'phone', phone: '+49 40 1', public: true },
      { type: 'attendeePhone' }, { type: 'organizersDefaultApp' }, { type: 'unknown', location: '?' }, 'junk', null,
    ] }, { id: 8, title: 'U' }] } } });
    const list = await cal.listEventTypes(KEY);
    assert.deepEqual(list[0].locations, [{ type: 'integration', integration: 'google-meet' }, { type: 'integration', integration: 'cal-video' }, { type: 'address', address: 'Elbstraße 12' }, { type: 'link', link: 'https://x.example/room' }, { type: 'phone', phone: '+49 40 1' }, { type: 'attendeePhone' }, { type: 'organizersDefaultApp' }]);
    assert.deepEqual(list[1].locations, [], 'no locations field: an empty list');
  });
  test('bookingLocationFor: a wanted location must be on the list; a video app names its integration, the organizer\'s address / link / phone go by type; attendee-named ones are not offered', () => {
    const locs = [{ type: 'integration', integration: 'google-meet' }, { type: 'integration', integration: 'zoom' }, { type: 'address', address: 'Elbstraße 12' }, { type: 'link', link: 'https://x' }, { type: 'phone', phone: '+49' }, { type: 'attendeePhone' }];
    assert.deepEqual(cal.bookingLocationFor(locs, { type: 'integration', integration: 'zoom' }), { type: 'integration', integration: 'zoom' });
    assert.deepEqual(cal.bookingLocationFor(locs, { type: 'address', address: 'anything' }), { type: 'address' });
    assert.deepEqual(cal.bookingLocationFor(locs, { type: 'link' }), { type: 'link' }); assert.deepEqual(cal.bookingLocationFor(locs, { type: 'phone' }), { type: 'phone' });
    assert.equal(cal.bookingLocationFor(locs, { type: 'integration', integration: 'cal-video' }), null, 'not on this event type');
    assert.equal(cal.bookingLocationFor(locs, { type: 'attendeePhone', phone: '+1' }), null); assert.equal(cal.bookingLocationFor(locs, 'zoom'), null); assert.equal(cal.bookingLocationFor([], { type: 'link' }), null);
  });
  test('createBooking sends the location and reads the meeting link from Cal.com\'s `location` (or the older meetingUrl); parseBooking reads it from the webhook; bookingToActivity puts it on a second line', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/bookings': { status: 201, body: { status: 'success', data: { uid: 'b', title: 'T', start: '2026-10-20T12:00:00Z', end: '2026-10-20T12:30:00Z', location: 'https://meet.google.com/abc-defg-hij', meetingUrl: 'https://meet.google.com/abc-defg-hij' } } } });
    const b = await cal.createBooking(KEY, { eventTypeId: 7, start: '2026-10-20T12:00:00.000Z', attendee: { name: 'J', email: 'j@x.de' }, location: { type: 'integration', integration: 'google-meet' } });
    assert.deepEqual(JSON.parse(calls[0].body).location, { type: 'integration', integration: 'google-meet' });
    assert.equal(b.location, 'https://meet.google.com/abc-defg-hij'); assert.equal(b.meetingUrl, 'https://meet.google.com/abc-defg-hij');
    fakeCal({ 'https://api.cal.com/v2/bookings': { status: 201, body: { status: 'success', data: { uid: 'b', location: 'Elbstraße 12, Hamburg', meetingUrl: null } } } });
    const inPerson = await cal.createBooking(KEY, { eventTypeId: 7, start: '2026-10-20T12:00:00.000Z', attendee: { name: 'J', email: 'j@x.de' }, location: { type: 'address' } });
    assert.equal(inPerson.location, 'Elbstraße 12, Hamburg'); assert.equal(inPerson.meetingUrl, null, 'an address is not a link');
    const hook = cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', title: 'T', startTime: '2026-10-20T12:00:00Z', location: 'integrations:google:meet', metadata: { videoCallUrl: 'https://meet.google.com/abc-defg-hij' } } });
    assert.equal(hook.meetingUrl, 'https://meet.google.com/abc-defg-hij');
    assert.equal(cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', location: 'https://zoom.us/j/1' } }).meetingUrl, 'https://zoom.us/j/1', 'a link in location counts too');
    assert.equal(cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', location: 'Elbstraße 12' } }).meetingUrl, null);
    const a = cal.bookingToActivity({ uid: 'u', title: 'T', start: '2026-10-20T12:00:00Z', organizer: { timeZone: 'Europe/Berlin' }, meetingUrl: 'https://meet.google.com/abc-defg-hij' });
    assert.equal(a.content, 'T\nhttps://meet.google.com/abc-defg-hij');
    assert.equal(cal.bookingToActivity({ uid: 'u', title: 'T', start: '2026-10-20T12:00:00Z' }).content, 'T', 'no link, one line');
  });
});

// ── Part 11: cancel and reschedule ────────────────────────────────────────────
describe('cancel and reschedule', () => {
  test('cancelBooking: POST /v2/bookings/:uid/cancel with the version header, the reason only when given; a booking Cal.com no longer knows counts as cancelled; other refusals throw', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/bookings/bk_1/cancel': { status: 200, body: { status: 'success', data: { uid: 'bk_1', status: 'cancelled', cancellationReason: 'Krank' } } }, 'https://api.cal.com/v2/bookings/gone/cancel': { status: 404, body: { status: 'error', error: { message: 'Booking not found' } } }, 'https://api.cal.com/v2/bookings/no/cancel': { status: 400, body: { status: 'error', error: { message: 'already cancelled' } } } });
    assert.deepEqual(await cal.cancelBooking(KEY, 'bk_1', { reason: '  Krank  ' }), { uid: 'bk_1', status: 'cancelled', cancellationReason: 'Krank', gone: false });
    assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].headers['cal-api-version'], '2026-02-25'); assert.deepEqual(JSON.parse(calls[0].body), { cancellationReason: 'Krank' });
    await cal.cancelBooking(KEY, 'bk_1', {}); assert.deepEqual(JSON.parse(calls[1].body), {}, 'no reason, no field');
    assert.deepEqual(await cal.cancelBooking(KEY, 'gone', {}), { uid: 'gone', status: 'cancelled', cancellationReason: null, gone: true });
    await assert.rejects(cal.cancelBooking(KEY, 'no', {}), err => err.name === 'CalError' && err.status === 400);
  });
  test('rescheduleBooking: POST /v2/bookings/:uid/reschedule with the new start (and a reason when given); the NEW booking comes back, naming the old uid', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/bookings/bk_1/reschedule': { status: 201, body: { status: 'success', data: { uid: 'bk_2', title: 'T', start: '2026-10-21T09:00:00Z', end: '2026-10-21T09:30:00Z', status: 'accepted', eventTypeId: 7, rescheduledFromUid: 'bk_1', location: 'https://meet.google.com/x' } } }, 'https://api.cal.com/v2/bookings/bk_3/reschedule': { status: 201, body: { status: 'success', data: { uid: 'bk_4' } } } });
    const b = await cal.rescheduleBooking(KEY, 'bk_1', { start: '2026-10-21T09:00:00.000Z', reason: 'Später' });
    assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].headers['cal-api-version'], '2026-02-25'); assert.deepEqual(JSON.parse(calls[0].body), { start: '2026-10-21T09:00:00.000Z', reschedulingReason: 'Später' });
    assert.equal(b.uid, 'bk_2'); assert.equal(b.rescheduledFromUid, 'bk_1'); assert.equal(b.start, '2026-10-21T09:00:00.000Z'); assert.equal(b.eventTypeId, 7); assert.equal(b.meetingUrl, 'https://meet.google.com/x');
    const c = await cal.rescheduleBooking(KEY, 'bk_3', { start: '2026-10-21T09:00:00.000Z' });
    assert.equal(c.rescheduledFromUid, 'bk_3', 'the old uid is remembered even when Cal.com does not say it'); assert.deepEqual(JSON.parse(calls[1].body), { start: '2026-10-21T09:00:00.000Z' });
    fakeCal({ 'https://api.cal.com/v2/bookings/bk_1/reschedule': { status: 201, body: { status: 'success', data: {} } } });
    await assert.rejects(cal.rescheduleBooking(KEY, 'bk_1', { start: '2026-10-21T09:00:00.000Z' }), err => /without a uid/.test(err.message));
  });
  test('getSlots passes bookingUidToReschedule, so the booking\'s own slot counts as free; parseBooking reads the event type', async () => {
    const calls = fakeCal({ 'https://api.cal.com/v2/slots': { status: 200, body: { status: 'success', data: {} } } });
    await cal.getSlots(KEY, { eventTypeId: 7, start: '2026-10-20', end: '2026-10-27', timeZone: 'Europe/Berlin', bookingUidToReschedule: 'bk_1' });
    assert.equal(new URL(calls[0].url).searchParams.get('bookingUidToReschedule'), 'bk_1');
    await cal.getSlots(KEY, { eventTypeId: 7, start: '2026-10-20', end: '2026-10-27', timeZone: 'Europe/Berlin' });
    assert.equal(new URL(calls[1].url).searchParams.has('bookingUidToReschedule'), false);
    assert.equal(cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', eventTypeId: 7 } }).eventTypeId, 7);
    assert.equal(cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', eventTypeId: 'x' } }).eventTypeId, null);
  });
});

// ── Part 12: the link one click away, the assignee told ──────────────────────
describe('the link and the guest (Part 12)', () => {
  test('parseBooking reads the video link from videoCallData.url too (Google Meet, once the calendar event exists) and hands over the place text; createBooking sends guests, trimmed, lower-cased, empties dropped, nothing when there are none', async () => {
    const hook = cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', location: 'integrations:google:meet', videoCallData: { type: 'google_video', url: 'https://meet.google.com/abc-defg-hij' } } });
    assert.equal(hook.meetingUrl, 'https://meet.google.com/abc-defg-hij'); assert.equal(hook.location, 'integrations:google:meet');
    assert.equal(cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', metadata: { videoCallUrl: 'https://app.cal.com/video/u' }, videoCallData: { url: 'https://meet.google.com/x' } } }).meetingUrl, 'https://app.cal.com/video/u', 'metadata first, as before');
    assert.equal(cal.parseBooking({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'u', location: 'Elbstraße 12' } }).location, 'Elbstraße 12');
    const calls = fakeCal({ 'https://api.cal.com/v2/bookings': { status: 201, body: { status: 'success', data: { uid: 'b' } } } });
    await cal.createBooking(KEY, { eventTypeId: 7, start: '2026-10-20T12:00:00.000Z', attendee: { name: 'J', email: 'j@x.de' }, guests: [' Tim@Example.de ', '', null, 'lea@example.de'] });
    assert.deepEqual(JSON.parse(calls[0].body).guests, ['tim@example.de', 'lea@example.de']);
    await cal.createBooking(KEY, { eventTypeId: 7, start: '2026-10-20T12:00:00.000Z', attendee: { name: 'J', email: 'j@x.de' }, guests: [] });
    assert.equal('guests' in JSON.parse(calls[1].body), false);
    await cal.createBooking(KEY, { eventTypeId: 7, start: '2026-10-20T12:00:00.000Z', attendee: { name: 'J', email: 'j@x.de' } });
    assert.equal('guests' in JSON.parse(calls[2].body), false);
  });
  test('where a meeting happens, in words: the app behind a link by its host, Cal.com\'s integration by name, else the place text; the link inside an entry\'s text', () => {
    for (const [url, app] of [['https://meet.google.com/abc-defg-hij', 'Google Meet'], ['https://us02web.zoom.us/j/1', 'Zoom'], ['https://zoom.com/j/2', 'Zoom'], ['https://teams.microsoft.com/l/x', 'Microsoft Teams'], ['https://app.cal.com/video/bk', 'Cal Video'], ['https://x.daily.co/r', 'Cal Video'], ['https://whereby.com/r', 'Whereby'], ['https://x.webex.com/m', 'Webex'], ['https://meet.jit.si/r', 'Jitsi'], ['https://example.org/r', null], ['nope', null], [null, null]]) assert.equal(cal.meetingApp(url), app, String(url));
    assert.equal(cal.placeLabel({ url: 'https://meet.google.com/abc-defg-hij', location: 'integrations:google:meet' }), 'Google Meet');
    assert.equal(cal.placeLabel({ url: 'https://example.org/r' }), 'https://example.org/r', 'an unknown host: the link itself');
    assert.equal(cal.placeLabel({ location: 'integrations:google:meet' }), 'Google Meet'); assert.equal(cal.placeLabel({ location: 'integrations:zoom' }), 'Zoom'); assert.equal(cal.placeLabel({ location: 'integrations:daily' }), 'Cal Video'); assert.equal(cal.placeLabel({ location: 'integration:office365:video' }), 'Microsoft Teams'); assert.equal(cal.placeLabel({ location: 'integrations:unknownapp' }), 'unknownapp');
    assert.equal(cal.placeLabel({ location: 'https://zoom.us/j/9' }), 'Zoom'); assert.equal(cal.placeLabel({ location: 'Elbstraße 12, Hamburg' }), 'Elbstraße 12, Hamburg'); assert.equal(cal.placeLabel({ location: '+49 40 123' }), '+49 40 123');
    assert.equal(cal.placeLabel({}), null); assert.equal(cal.placeLabel(), null); assert.equal(cal.placeLabel({ location: '  ' }), null);
    assert.equal(cal.meetingLinkOf('T\nhttps://app.cal.com/video/bk_1'), 'https://app.cal.com/video/bk_1'); assert.equal(cal.meetingLinkOf('see https://meet.google.com/x now'), 'https://meet.google.com/x'); assert.equal(cal.meetingLinkOf('T'), null); assert.equal(cal.meetingLinkOf(null), null);
  });
  test('utcFromWallClock is the inverse of wallClock: Berlin summer and winter, Manila, a bad input; through a DST gap it lands on a real instant', () => {
    assert.equal(cal.utcFromWallClock('2026-10-20', '14:00', 'Europe/Berlin'), '2026-10-20T12:00:00.000Z');
    assert.equal(cal.utcFromWallClock('2026-12-01', '09:30', 'Europe/Berlin'), '2026-12-01T08:30:00.000Z');
    assert.equal(cal.utcFromWallClock('2026-10-20', '20:00', 'Asia/Manila'), '2026-10-20T12:00:00.000Z');
    assert.equal(cal.utcFromWallClock('2026-10-20', '14:00', 'Nowhere/City'), '2026-10-20T12:00:00.000Z', 'an unknown zone falls back to the default zone, as wallClock does');
    for (const [d, t] of [['2026-10-20', '14:00'], ['2026-03-29', '02:30'], ['2026-12-01', '00:00']]) { const iso = cal.utcFromWallClock(d, t, 'Europe/Berlin'); assert.ok(iso && !Number.isNaN(new Date(iso).getTime()), d + ' ' + t); }
    const back = cal.wallClock(cal.utcFromWallClock('2026-10-20', '20:00', 'Asia/Manila'), 'Asia/Manila'); assert.equal(back.date + ' ' + back.time, '2026-10-20 20:00');
    assert.equal(cal.utcFromWallClock('20.10.2026', '14:00', 'Europe/Berlin'), null); assert.equal(cal.utcFromWallClock('2026-10-20', 'x', 'Europe/Berlin'), null); assert.equal(cal.utcFromWallClock(null, null, 'Europe/Berlin'), null);
  });
});
