// UNIT tests for utils/booking-slots.js (FONIO_CHANGES Part 29): the free times of the workspace's booking service,
// read for fonio's assistant — Cal.com's /v2/slots or Calendly's /event_type_available_times — over a fake pool and
// a fake of both services (globalThis.fetch). Pinned: Cal.com when it is connected, else Calendly; the stored key is
// opened from its seal; only times from `from` on, ascending, once each, with the account's zone; no service, no
// event type, an unreadable key, a failing or silent service: null, never a throw; only GET requests leave; and the
// times as the prompt gets them, on the zone's clock.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const KEY = 'cal_live_0123456789abcdef0123456789abcdef', TOKEN = 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0In0';
const TYPE = 'https://api.calendly.com/event_types/T2';
const FROM = Date.parse('2026-11-12T09:00:00.000Z');   // a Thursday, 10:00 in Berlin
let calcom, slots;
const envSaved = {};
const db = { calcom: null, calendly: null, fail: false };
const pool = { query: async (sql, params) => {
  const q = String(sql).replace(/\s+/g, ' ').trim();
  if (db.fail) throw new Error('database down');
  assert.deepEqual(params, [7]);
  if (q === 'SELECT api_key_sealed, event_type_id, cal_timezone FROM workspace_calcom WHERE workspace_id = $1') return { rows: db.calcom ? [db.calcom] : [] };
  if (q === 'SELECT token_sealed, event_type_uri, cly_timezone FROM workspace_calendly WHERE workspace_id = $1') return { rows: db.calendly ? [db.calendly] : [] };
  throw new Error('unexpected SQL: ' + q);
} };
const realFetch = globalThis.fetch;
let calls = [], reply;
before(() => {
  for (const k of ['SESSION_SECRET', 'CALCOM_ENCRYPTION_KEY', 'CALCOM_API_URL', 'CALENDLY_API_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'slots-test-secret';
  calcom = require(path.join(ROOT, 'utils', 'calcom.js')); slots = require(path.join(ROOT, 'utils', 'booking-slots.js'));
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    calls.push({ url: u, method: init?.method, auth: init?.headers?.Authorization });
    const r = await reply(u);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
});
after(() => { globalThis.fetch = realFetch; for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; } });
beforeEach(() => { calls = []; db.calcom = null; db.calendly = null; db.fail = false; reply = () => ({ status: 404, body: {} }); });
const iso = ms => new Date(ms).toISOString();
const H = 3600000;

describe('Cal.com', () => {
  test('the chosen event type\'s slots for two weeks from now, in UTC, with the stored key; past ones dropped, ascending, once each; the account\'s zone', async () => {
    db.calcom = { api_key_sealed: calcom.sealKey(KEY), event_type_id: 7, cal_timezone: 'Europe/Berlin' };
    db.calendly = { token_sealed: 'never read', event_type_uri: TYPE };
    reply = () => ({ body: { status: 'success', data: { '2026-11-12': [{ start: iso(FROM + 2 * H) }, { start: iso(FROM - H) }, { start: iso(FROM + H) }], '2026-11-13': [{ start: iso(FROM + 24 * H) }, { start: iso(FROM + H) }] } } });
    assert.deepEqual(await slots.freeSlots(pool, 7, FROM), { service: 'calcom', zone: 'Europe/Berlin', slots: [FROM + H, FROM + 2 * H, FROM + 24 * H] });
    assert.equal(calls.length, 1, 'Cal.com is connected, so Calendly is not asked');
    const q = calls[0].url.searchParams;
    assert.equal(calls[0].url.pathname, '/v2/slots'); assert.equal(calls[0].auth, `Bearer ${KEY}`);
    assert.equal(q.get('eventTypeId'), '7'); assert.equal(q.get('start'), iso(FROM)); assert.equal(q.get('end'), iso(FROM + 14 * 24 * H)); assert.equal(q.get('timeZone'), 'UTC');
  });
  test('no event type chosen: null, Cal.com not asked', async () => {
    db.calcom = { api_key_sealed: calcom.sealKey(KEY), event_type_id: null };
    assert.equal(await slots.freeSlots(pool, 7, FROM), null); assert.equal(calls.length, 0);
  });
});

describe('Calendly', () => {
  test('the chosen event type\'s available times, a week from a minute after now, with the stored token; a second week only when the first has nothing', async () => {
    db.calendly = { token_sealed: calcom.sealKey(TOKEN), event_type_uri: TYPE, cly_timezone: null };
    reply = () => ({ body: { collection: [{ status: 'available', start_time: iso(FROM + 3 * H) }, { status: 'available', start_time: iso(FROM + H) }, { status: 'unavailable', start_time: iso(FROM + 2 * H) }] } });
    assert.deepEqual(await slots.freeSlots(pool, 7, FROM), { service: 'calendly', zone: 'Europe/Berlin', slots: [FROM + H, FROM + 3 * H] });
    assert.equal(calls.length, 1);
    const q = calls[0].url.searchParams;
    assert.equal(calls[0].url.pathname, '/event_type_available_times'); assert.equal(calls[0].auth, `Bearer ${TOKEN}`);
    assert.equal(q.get('event_type'), TYPE); assert.equal(q.get('start_time'), iso(FROM + 60000), 'Calendly refuses a start in the past'); assert.equal(q.get('end_time'), iso(FROM + 60000 + 7 * 24 * H));
    calls = [];
    reply = u => ({ body: { collection: u.searchParams.get('start_time') === iso(FROM + 60000) ? [] : [{ status: 'available', start_time: iso(FROM + 9 * 24 * H) }] } });
    assert.deepEqual((await slots.freeSlots(pool, 7, FROM)).slots, [FROM + 9 * 24 * H]);
    assert.equal(calls.length, 2); assert.equal(calls[1].url.searchParams.get('start_time'), iso(FROM + 60000 + 7 * 24 * H)); assert.equal(calls[1].url.searchParams.get('end_time'), iso(FROM + 14 * 24 * H));
  });
  test('nothing free in two weeks: an empty list, not null', async () => {
    db.calendly = { token_sealed: calcom.sealKey(TOKEN), event_type_uri: TYPE };
    reply = () => ({ body: { collection: [] } });
    assert.deepEqual((await slots.freeSlots(pool, 7, FROM)).slots, []);
  });
});

describe('never in the way', () => {
  test('no service connected, a failing service, an unreadable key, a failing database: null, never a throw', async () => {
    assert.equal(await slots.freeSlots(pool, 7, FROM), null); assert.equal(calls.length, 0);
    db.calendly = { token_sealed: calcom.sealKey(TOKEN), event_type_uri: TYPE };
    reply = () => ({ status: 500, body: { message: 'boom' } });
    assert.equal(await slots.freeSlots(pool, 7, FROM), null);
    db.calendly = { token_sealed: 'v1.not.a.seal', event_type_uri: TYPE };
    assert.equal(await slots.freeSlots(pool, 7, FROM), null);
    db.fail = true;
    assert.equal(await slots.freeSlots(pool, 7, FROM), null);
  });
  test('a service that does not answer in time: null after the timeout', async () => {
    db.calendly = { token_sealed: calcom.sealKey(TOKEN), event_type_uri: TYPE };
    let release; reply = () => new Promise(resolve => { release = () => resolve({ body: { collection: [] } }); });
    const started = Date.now();
    assert.equal(await slots.freeSlots(pool, 7, FROM, { timeoutMs: 40 }), null);
    assert.ok(Date.now() - started < 1000);
    release();
  });
  test('reading only: every request is a GET, and the module names no booking call', async () => {
    db.calendly = { token_sealed: calcom.sealKey(TOKEN), event_type_uri: TYPE };
    reply = () => ({ body: { collection: [] } });
    await slots.freeSlots(pool, 7, FROM);
    for (const c of calls) assert.equal(c.method, 'GET');
    assert.doesNotMatch(require('fs').readFileSync(path.join(ROOT, 'utils', 'booking-slots.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//, ''), /createBooking|createInvitee|method: 'POST'/);
  });
});

describe('the times as the prompt gets them', () => {
  const B = (d, h, m = 0) => Date.UTC(2026, 10, d, h - 1, m);   // Berlin clock in November (UTC+1)
  test('one line, grouped by day on the zone\'s clock, with the weekday; the same as a JSON list; today with its weekday', () => {
    const list = [B(20, 9), B(20, 9, 30), B(21, 14), B(23, 0, 30)];
    assert.equal(slots.slotsText(list, 'Europe/Berlin'), 'Fr 20.11.2026: 09:00, 09:30; Sa 21.11.2026: 14:00; Mo 23.11.2026: 00:30');
    assert.equal(slots.slotsJson(list, 'Europe/Berlin'), '["2026-11-20 09:00","2026-11-20 09:30","2026-11-21 14:00","2026-11-23 00:30"]');
    assert.equal(slots.slotsText(list, 'Asia/Manila').slice(0, 21), 'Fr 20.11.2026: 16:00,', 'another zone, another clock');
    assert.equal(slots.todayText(FROM, 'Europe/Berlin'), 'Donnerstag, 12.11.2026');
    assert.equal(slots.todayText(Date.parse('2026-11-12T23:30:00Z'), 'Europe/Berlin'), 'Freitag, 13.11.2026', 'already tomorrow in Berlin');
  });
  test('nothing free: empty text and an empty list; never more than five days and eight times a day', () => {
    assert.equal(slots.slotsText([], 'Europe/Berlin'), ''); assert.equal(slots.slotsJson([], 'Europe/Berlin'), '[]');
    const many = [];
    for (let d = 16; d <= 23; d++) for (let h = 8; h < 18; h++) many.push(B(d, h));
    const days = slots.byDay(many, 'Europe/Berlin');
    assert.equal(days.length, 5); assert.ok(days.every(d => d.times.length === 8)); assert.deepEqual(days.map(d => d.date), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    assert.equal(JSON.parse(slots.slotsJson(many, 'Europe/Berlin')).length, 40);
  });
});
