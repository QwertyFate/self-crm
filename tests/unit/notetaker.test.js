// UNIT tests for utils/notetaker.js: the client for the Notetaker recording bot (2026-10-20). The CRM's server
// sends POST <NOTETAKER_URL> (default http://localhost:8000/crm/recordings) with Content-Type: application/json and,
// only when NOTETAKER_CRM_TOKEN is set, Authorization: Bearer <token>. The body is the service's sample payload.
// Pinned: the Google Meet links accepted, the start as the zone's wall clock WITH its offset (the service refuses a
// time without a zone), the payload's every field and default, the callback URL, the token header, and how each
// answer is read: 202 scheduled / queued with the job id, 200 updated, 200 duplicate, 400, 401, anything else, and
// a service that is down or silent.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ROOT } = require('../helpers/load-route');
const nt = require(path.join(ROOT, 'utils', 'notetaker.js'));

const SAMPLE_CHAT = 'Hallo, ich bin Notetaker. Dieses Meeting wird gemäß unserer Richtlinie zur Aufzeichnung von Meetings aufgezeichnet und transkribiert, um Notizen zu erstellen. Wenn Sie keine Aufzeichnung wünschen, kann der Host mich aus dem Meeting entfernen.';
const ENV = ['NOTETAKER_URL', 'NOTETAKER_CRM_TOKEN', 'NOTETAKER_CALLBACK_URL', 'PORT'];
const saved = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('the link and the time', () => {
  test('only a Google Meet link over https with a meeting code is accepted; a query is dropped', () => {
    assert.equal(nt.meetUrlOf('https://meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
    assert.equal(nt.meetUrlOf('https://meet.google.com/abc-defg-hij?authuser=0'), 'https://meet.google.com/abc-defg-hij');
    for (const bad of ['http://meet.google.com/abc-defg-hij', 'https://meet.google.com/', 'https://zoom.us/j/123', 'https://app.cal.com/video/x', 'https://evil.example/meet.google.com/abc', 'meet.google.com/abc-defg-hij', '', null]) assert.equal(nt.meetUrlOf(bad), null, String(bad));
  });
  test('the start as the zone\'s wall clock with the offset, summer and winter, east and west, UTC; a bad zone is null', () => {
    assert.equal(nt.isoWithOffset('2026-10-21T12:00:00.000Z', 'Europe/Berlin'), '2026-10-21T14:00:00+02:00');
    assert.equal(nt.isoWithOffset('2026-12-01T13:30:00.000Z', 'Europe/Berlin'), '2026-12-01T14:30:00+01:00');
    assert.equal(nt.isoWithOffset('2026-10-21T18:00:00.000Z', 'America/New_York'), '2026-10-21T14:00:00-04:00');
    assert.equal(nt.isoWithOffset('2026-10-21T14:00:00.000Z', 'UTC'), '2026-10-21T14:00:00+00:00');
    assert.equal(nt.isoWithOffset('2026-10-21T06:00:00.000Z', 'Asia/Kolkata'), '2026-10-21T11:30:00+05:30');
    assert.equal(nt.isoWithOffset('2026-10-21T12:00:00.000Z', 'Not/AZone'), null);
    assert.equal(nt.isoWithOffset('not a date', 'Europe/Berlin'), null);
  });
});

describe('the payload', () => {
  test('the sample\'s every field: link, callback, start, external id, metadata, bot name, 120 minutes, notes, the German chat message', () => {
    const p = nt.payload({ meetingUrl: 'https://meet.google.com/abc-defg-hij', joinAt: '2026-10-21T14:00:00+02:00', externalId: nt.externalIdFor(5531), metadata: { deal_id: '1042', contact_id: '77', user_id: '2' }, language: 'de' });
    assert.deepEqual(p, {
      meeting_url: 'https://meet.google.com/abc-defg-hij',
      callback_url: 'http://localhost:3000/api/notetaker/webhook',
      join_at: '2026-10-21T14:00:00+02:00',
      external_id: 'crm-meeting-5531',
      metadata: { deal_id: '1042', contact_id: '77', user_id: '2' },
      bot_name: 'Notetaker',
      max_minutes: 120,
      include_notes: true,
      chat_message: SAMPLE_CHAT,
    });
  });
  test('an English booking gets the English chat message; the callback follows PORT, or NOTETAKER_CALLBACK_URL when set', () => {
    assert.match(nt.payload({ language: 'en' }).chat_message, /^Hello, I am Notetaker\. This meeting is being recorded/);
    process.env.PORT = '4001';
    assert.equal(nt.payload({}).callback_url, 'http://localhost:4001/api/notetaker/webhook');
    process.env.NOTETAKER_CALLBACK_URL = 'http://localhost:9999/hook';
    assert.equal(nt.payload({}).callback_url, 'http://localhost:9999/hook');
  });
  test('the service\'s address: the default, or NOTETAKER_URL', () => {
    assert.equal(nt.config().url, 'http://localhost:8000/crm/recordings');
    process.env.NOTETAKER_URL = 'http://localhost:8100/crm/recordings';
    assert.equal(nt.config().url, 'http://localhost:8100/crm/recordings');
    assert.equal(nt.config().token, null, 'no token unless one is set');
  });
});

describe('reading the answer', () => {
  test('202: the job id and scheduled or queued; 200 updated; 200 duplicate', () => {
    assert.deepEqual(nt.interpret(202, { job_id: 'j_1', status: 'scheduled' }), { ok: true, status: 'scheduled', job_id: 'j_1' });
    assert.deepEqual(nt.interpret(202, { id: 77, status: 'queued' }), { ok: true, status: 'queued', job_id: '77' });
    assert.deepEqual(nt.interpret(200, { updated: true, job_id: 'j_1' }), { ok: true, status: 'updated', job_id: 'j_1' });
    assert.deepEqual(nt.interpret(200, { duplicate: true }), { ok: true, status: 'duplicate', job_id: null });
  });
  test('400 says why (a string or a list of problems); 401 is the token; anything else names the status', () => {
    assert.equal(nt.interpret(400, { detail: 'join_at needs a timezone' }).error, 'The Notetaker refused the request: join_at needs a timezone');
    assert.equal(nt.interpret(400, { detail: [{ msg: 'bad link' }, { msg: 'callback not on localhost' }] }).error, 'The Notetaker refused the request: bad link; callback not on localhost');
    assert.deepEqual(nt.interpret(401, {}), { ok: false, status: 'failed', job_id: null, error: 'The Notetaker refused the token (401)' });
    assert.equal(nt.interpret(500, null).error, 'The Notetaker answered 500');
  });
});

describe('sending', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  test('POST with JSON to the service; no Authorization header without a token, Bearer with one', async () => {
    const seen = [];
    globalThis.fetch = async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ job_id: 'j_9', status: 'scheduled' }), { status: 202 }); };
    const r1 = await nt.send({ a: 1 });
    assert.deepEqual(r1, { http: 202, ok: true, status: 'scheduled', job_id: 'j_9' });
    assert.equal(seen[0].url, 'http://localhost:8000/crm/recordings'); assert.equal(seen[0].init.method, 'POST');
    assert.deepEqual(seen[0].init.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(seen[0].init.body), { a: 1 });
    process.env.NOTETAKER_CRM_TOKEN = 'tok_123';
    await nt.send({ a: 2 });
    assert.deepEqual(seen[1].init.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer tok_123' });
  });
  test('a service that is down, or silent past the timeout, is a failure with a plain reason, never a throw', async () => {
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    assert.deepEqual(await nt.send({}), { http: 0, ok: false, status: 'failed', job_id: null, error: 'The Notetaker is not reachable' });
    globalThis.fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    assert.equal((await nt.send({})).error, 'The Notetaker did not answer within 10 seconds');
    globalThis.fetch = async () => new Response('not json', { status: 502 });
    assert.deepEqual(await nt.send({}), { http: 502, ok: false, status: 'failed', job_id: null, error: 'The Notetaker answered 502' });
  });
});
