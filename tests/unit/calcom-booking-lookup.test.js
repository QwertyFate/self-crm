// UNIT tests for two pieces of utils/calcom.js the Notetaker's Meet link depends on (NOTETAKER_CHANGES Part 4,
// 2026-10-21). One: the database hands a DATE column back as a JavaScript Date (node-postgres: local midnight), and
// utcFromWallClock read only 'YYYY-MM-DD' text, so a meeting read back from the table had no start time and its
// Notetaker request sat at "waiting_link" with the Meet link already in the entry. Two: getBooking asks Cal.com for a
// booking (GET /v2/bookings/:uid, cal-api-version 2026-02-25); once Cal.com has created the Google Meet, its link is
// in `location` (meetingUrl is the deprecated older field).
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const cal = require(path.join(ROOT, 'utils', 'calcom.js'));

describe('a date as the database returns it', () => {
  test('a Date at local midnight (what node-postgres makes of a DATE) is the same calendar day as its text', () => {
    assert.equal(cal.utcFromWallClock(new Date(2026, 9, 21), '19:30:00', 'Asia/Manila'), cal.utcFromWallClock('2026-10-21', '19:30', 'Asia/Manila'));
    assert.equal(cal.utcFromWallClock(new Date(2026, 9, 21), '19:30:00', 'Asia/Manila'), '2026-10-21T11:30:00.000Z');
    assert.equal(cal.utcFromWallClock(new Date(2026, 11, 1), '09:30', 'Europe/Berlin'), '2026-12-01T08:30:00.000Z');
    assert.equal(cal.utcFromWallClock(new Date(NaN), '09:30', 'Europe/Berlin'), null, 'an invalid Date is no date');
    assert.equal(cal.utcFromWallClock(null, '09:30', 'Europe/Berlin'), null);
  });
});

describe('getBooking', () => {
  const realFetch = globalThis.fetch;
  const KEY = 'cal_live_0123456789abcdef0123456789abcdef';
  let seen;
  beforeEach(() => { seen = []; delete process.env.CALCOM_API_URL; });
  afterEach(() => { globalThis.fetch = realFetch; });
  const answer = (status, body) => { globalThis.fetch = async (url, init) => { seen.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status }); }; };
  test('GET /v2/bookings/:uid with the bookings version; the Meet link from location once it exists', async () => {
    answer(200, { status: 'success', data: { uid: 'bk 1', title: 'Besichtigung', start: '2026-10-21T11:30:00.000Z', status: 'accepted', location: 'https://meet.google.com/abc-defg-hij', eventTypeId: 7 } });
    const b = await cal.getBooking(KEY, 'bk 1');
    assert.equal(seen[0].url, 'https://api.cal.com/v2/bookings/bk%201');
    assert.equal(seen[0].init.method, 'GET');
    assert.equal(seen[0].init.headers['cal-api-version'], '2026-02-25');
    assert.equal(seen[0].init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(b.uid, 'bk 1'); assert.equal(b.meetingUrl, 'https://meet.google.com/abc-defg-hij');
  });
  test('before the Meet exists, location names only the app: no link yet; the older meetingUrl and metadata.videoCallUrl count too', async () => {
    answer(200, { status: 'success', data: { uid: 'bk_1', location: 'integrations:google:meet' } });
    assert.equal((await cal.getBooking(KEY, 'bk_1')).meetingUrl, null);
    answer(200, { status: 'success', data: { uid: 'bk_1', location: 'integrations:google:meet', meetingUrl: 'https://meet.google.com/abc-defg-hij' } });
    assert.equal((await cal.getBooking(KEY, 'bk_1')).meetingUrl, 'https://meet.google.com/abc-defg-hij');
    answer(200, { status: 'success', data: { uid: 'bk_1', location: 'integrations:google:meet', metadata: { videoCallUrl: 'https://meet.google.com/abc-defg-hij' } } });
    assert.equal((await cal.getBooking(KEY, 'bk_1')).meetingUrl, 'https://meet.google.com/abc-defg-hij');
  });
  test('a recurring answer (a list) gives its first booking; an answer without a booking or a 404 is an error', async () => {
    answer(200, { status: 'success', data: [{ uid: 'bk_1', location: 'https://meet.google.com/abc-defg-hij' }, { uid: 'bk_2' }] });
    assert.equal((await cal.getBooking(KEY, 'bk_1')).uid, 'bk_1');
    answer(200, { status: 'success', data: {} });
    await assert.rejects(cal.getBooking(KEY, 'bk_1'), /without the booking/);
    answer(404, { status: 'error', error: { message: 'Booking not found' } });
    await assert.rejects(cal.getBooking(KEY, 'bk_1'), e => e instanceof cal.CalError && e.status === 404);
  });
});
