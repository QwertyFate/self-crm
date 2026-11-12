// UNIT tests for utils/fonio-meeting.js (FONIO_CHANGES Part 28): a meeting agreed in a fonio call, booked at the
// workspace's booking service, over a fake pool and a fake Cal.com and Calendly (globalThis.fetch). Pinned: Cal.com
// when it is connected, else Calendly, else nothing; the contact is the guest, by the email confirmed in the call, else
// the contact's own; the agreed time is the connected account's wall clock; the entry is written
// at once on the contact and the deal; and everything that can stand in the way is answered, never thrown.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const KEY = 'cal_live_0123456789abcdef0123456789abcdef', TOKEN = 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0In0';
const TYPE = 'https://api.calendly.com/event_types/T2';
const NOW = Date.parse('2026-11-12T09:00:00.000Z');
const MEETING = { date: '2026-11-20', time: '14:00', email: null, said: '2026-11-20 14:00' };
let calcom, meeting;
const db = {};
const pool = { query: async (sql, p) => {
  const q = String(sql).replace(/\s+/g, ' ').trim();
  db.log.push(q);
  if (q === 'SELECT api_key_sealed, event_type_id, event_types, cal_timezone, connected_by FROM workspace_calcom WHERE workspace_id = $1') return { rows: db.calcom ? [db.calcom] : [] };
  if (q === 'SELECT token_sealed, event_type_uri, event_types, cly_timezone, connected_by FROM workspace_calendly WHERE workspace_id = $1') return { rows: db.calendly ? [db.calendly] : [] };
  if (q === 'SELECT id, name, email, phone FROM contacts WHERE id = $1 AND workspace_id = $2') return { rows: db.contact && db.contact.id === p[0] && p[1] === 7 ? [db.contact] : [] };
  if (q.startsWith("INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calcom_uid, calcom_event_type_id) VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calcom',$9,$10) ON CONFLICT (workspace_id, calcom_uid) WHERE calcom_uid IS NOT NULL DO UPDATE SET")
    || q.startsWith("INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calendly_uri, calendly_event_uri) VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calendly',$9,$10) ON CONFLICT (workspace_id, calendly_uri) WHERE calendly_uri IS NOT NULL DO UPDATE SET")) {
    assert.match(q, /RETURNING id, \(xmax = 0\) AS inserted$/);
    db.entries.push(p); return { rows: [{ id: 900, inserted: !db.seenByWebhook }] };
  }
  if (q === 'SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2') return { rows: [{ assigned_to: db.dealAssignee ?? null }] };
  if (q === 'SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2') return { rows: [{ assigned_to: db.contactAssignee ?? null }] };
  throw new Error('unexpected SQL: ' + q);
} };
const realFetch = globalThis.fetch, envSaved = {};
let calls, reply;
before(() => {
  for (const k of ['SESSION_SECRET', 'CALCOM_ENCRYPTION_KEY', 'CALCOM_API_URL', 'CALENDLY_API_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'meeting-test-secret';
  calcom = require(path.join(ROOT, 'utils', 'calcom.js')); meeting = require(path.join(ROOT, 'utils', 'fonio-meeting.js'));
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, auth: init?.headers?.Authorization, body: init?.body ? JSON.parse(init.body) : undefined });
    const r = reply(String(url));
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
});
after(() => { globalThis.fetch = realFetch; for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; } });
beforeEach(() => {
  calls = []; reply = () => ({ status: 404, body: {} });
  Object.assign(db, { log: [], entries: [], calcom: null, calendly: null, seenByWebhook: false, dealAssignee: null, contactAssignee: null,
    contact: { id: 5, name: 'Erika Muster', email: 'Erika@Muster.de', phone: '+491711234567' } });
});
const calRow = () => ({ api_key_sealed: calcom.sealKey(KEY), event_type_id: 7, event_types: [{ id: 7, title: '30 Minuten', lengthInMinutes: 30 }], cal_timezone: 'Europe/Berlin', connected_by: 1 });
const clyRow = () => ({ token_sealed: calcom.sealKey(TOKEN), event_type_uri: TYPE, event_types: [{ uri: TYPE, name: 'Erstgespräch', poolingType: null, locations: [{ kind: 'google_conference' }] }], cly_timezone: 'Europe/Berlin', connected_by: 1 });
const book = (over = {}) => meeting.bookMeeting(pool, { wid: 7, contactId: 5, dealId: 13, meeting: MEETING, now: NOW, ...over });

describe('nothing to do', () => {
  test('a call that named no meeting: null, nothing asked', async () => {
    assert.equal(await book({ meeting: null }), null); assert.equal(db.log.length, 0);
  });
  test('no booking service connected: not_connected with what was agreed, nothing booked', async () => {
    assert.deepEqual(await book(), { status: 'not_connected', date: '2026-11-20', time: '14:00', said: '2026-11-20 14:00' });
    assert.equal(calls.length, 0); assert.equal(db.entries.length, 0);
  });
});

describe('Cal.com', () => {
  test('booked on the chosen event type at the agreed time on the account\'s clock, the contact as the attendee, our ids in the metadata; the entry written at once on the contact and the deal', async () => {
    db.calcom = calRow(); db.calendly = clyRow();
    reply = () => ({ status: 201, body: { status: 'success', data: { uid: 'bk_1', title: '30 Minuten zwischen Mara und Erika Muster', start: '2026-11-20T13:00:00.000Z', location: 'https://meet.google.com/abc', eventTypeId: 7 } } });
    const r = await book();
    assert.equal(calls.length, 1, 'Cal.com is connected: Calendly is not asked');
    assert.equal(calls[0].url, 'https://api.cal.com/v2/bookings'); assert.equal(calls[0].auth, `Bearer ${KEY}`);
    assert.deepEqual({ start: calls[0].body.start, eventTypeId: calls[0].body.eventTypeId, attendee: calls[0].body.attendee, metadata: calls[0].body.metadata },
      { start: '2026-11-20T13:00:00.000Z', eventTypeId: 7, attendee: { name: 'Erika Muster', email: 'erika@muster.de', timeZone: 'Europe/Berlin', language: 'de' }, metadata: { upgrads_contact_id: '5', upgrads_deal_id: '13' } });
    assert.deepEqual(db.entries, [[7, 5, 13, '30 Minuten zwischen Mara und Erika Muster\nhttps://meet.google.com/abc', 1, '2026-11-20', '14:00', 'Europe/Berlin', 'bk_1', 7]]);
    assert.deepEqual({ status: r.status, service: r.service, start: r.start, activity_id: r.activity_id, inserted: r.inserted, url: r.url, date: r.date, time: r.time }, { status: 'booked', service: 'calcom', start: '2026-11-20T13:00:00.000Z', activity_id: 900, inserted: true, url: 'https://meet.google.com/abc', date: '2026-11-20', time: '14:00' });
    assert.equal(meeting.noteLine(r), 'Termin gebucht: 20.11.2026, 14:00 (Cal.com)');
  });
  test('Cal.com refuses (the time is taken): failed "refused" with its words, no entry; a call without a deal books on the contact alone', async () => {
    db.calcom = calRow();
    reply = () => ({ status: 400, body: { status: 'error', error: { message: 'User either already has booking at this time or is not available' } } });
    const r = await book();
    assert.deepEqual({ status: r.status, service: r.service, reason: r.reason, detail: r.detail }, { status: 'failed', service: 'calcom', reason: 'refused', detail: 'User either already has booking at this time or is not available' });
    assert.equal(db.entries.length, 0);
    assert.equal(meeting.noteLine(r), 'Termin im Gespräch vereinbart (20.11.2026, 14:00), aber nicht gebucht: Cal.com hat abgelehnt: User either already has booking at this time or is not available');
    reply = () => ({ status: 201, body: { status: 'success', data: { uid: 'bk_2', start: '2026-11-20T13:00:00.000Z' } } });
    await book({ dealId: null });
    assert.deepEqual(calls.at(-1).body.metadata, { upgrads_contact_id: '5' }); assert.equal(db.entries[0][2], null);
  });
});

describe('Calendly', () => {
  test('booked on the chosen event type with the place it asks for; the contact is the invitee; the entry named after the event type and the contact', async () => {
    db.calendly = clyRow();
    reply = () => ({ status: 201, body: { resource: { uri: 'https://api.calendly.com/scheduled_events/EV/invitees/INV', event: 'https://api.calendly.com/scheduled_events/EV' } } });
    const r = await book();
    assert.equal(calls[0].url, 'https://api.calendly.com/invitees'); assert.equal(calls[0].auth, `Bearer ${TOKEN}`);
    assert.deepEqual(calls[0].body, { event_type: TYPE, start_time: '2026-11-20T13:00:00.000Z', invitee: { name: 'Erika Muster', email: 'erika@muster.de', timezone: 'Europe/Berlin' }, location: { kind: 'google_conference' } });
    assert.deepEqual(db.entries, [[7, 5, 13, 'Erstgespräch: Erika Muster', 1, '2026-11-20', '14:00', 'Europe/Berlin', 'https://api.calendly.com/scheduled_events/EV/invitees/INV', 'https://api.calendly.com/scheduled_events/EV']]);
    assert.equal(r.status, 'booked'); assert.equal(r.service, 'calendly'); assert.equal(meeting.noteLine(r), 'Termin gebucht: 20.11.2026, 14:00 (Calendly)');
  });
  test('Calendly\'s webhook was faster: the entry it wrote is the one, and the answer says it was not new (so nobody is told twice)', async () => {
    db.calendly = clyRow(); db.seenByWebhook = true;
    reply = () => ({ status: 201, body: { resource: { uri: 'INV', event: 'EV' } } });
    assert.equal((await book()).inserted, false);
  });
  test('Calendly refuses, with what was wrong', async () => {
    db.calendly = clyRow();
    reply = () => ({ status: 400, body: { title: 'Invalid Argument', message: 'The supplied parameters are invalid.', details: [{ parameter: 'start_time', message: 'is not available' }] } });
    const r = await book();
    assert.deepEqual([r.status, r.reason, r.detail], ['failed', 'refused', 'The supplied parameters are invalid. (start_time: is not available)']);
  });
});

describe('what can stand in the way, answered and never thrown', () => {
  beforeEach(() => { db.calendly = clyRow(); reply = () => ({ status: 201, body: { resource: { uri: 'INV', event: 'EV' } } }); });
  const why = async over => { const r = await book(over); return [r.status, r.reason]; };
  test('a date or time nobody could read; a time already past', async () => {
    assert.deepEqual(await why({ meeting: { date: null, time: null, email: null, said: 'nächsten Donnerstag' } }), ['failed', 'no_time']);
    assert.deepEqual(await why({ meeting: { date: '2026-11-20', time: null, email: null, said: '2026-11-20' } }), ['failed', 'no_time']);
    assert.deepEqual(await why({ meeting: { ...MEETING, date: '2026-11-12', time: '09:30' } }), ['failed', 'past'], '9:30 in Berlin is 8:30 UTC, before now (9:00 UTC)');
    assert.equal(calls.length, 0);
    assert.equal(meeting.noteLine(await book({ meeting: { date: null, time: null, email: null, said: 'nächsten Donnerstag' } })), 'Termin im Gespräch vereinbart (nächsten Donnerstag), aber nicht gebucht: Datum oder Uhrzeit waren nicht lesbar');
  });
  test('no contact; a contact without an email — unless the call brought one; no event type chosen', async () => {
    assert.deepEqual(await why({ contactId: null }), ['failed', 'no_contact']);
    assert.deepEqual(await why({ contactId: 99 }), ['failed', 'no_contact']);
    db.contact.email = null;
    assert.deepEqual(await why(), ['failed', 'no_email']); assert.equal(calls.length, 0);
    assert.deepEqual(await why({ meeting: { ...MEETING, email: 'erika@privat.de' } }), ['booked', undefined]);
    assert.equal(calls[0].body.invitee.email, 'erika@privat.de');
    db.contact.email = 'erika@muster.de'; db.calendly = { ...clyRow(), event_type_uri: null };
    assert.deepEqual(await why(), ['failed', 'no_event_type']);
  });
  test('an address confirmed or corrected in the call wins over the contact\'s own; without one the contact\'s is used', async () => {
    await book({ meeting: { ...MEETING, email: 'neu@privat.de' } });
    assert.equal(calls[0].body.invitee.email, 'neu@privat.de');
    calls = [];
    await book();
    assert.equal(calls[0].body.invitee.email, 'erika@muster.de');
  });
  test('a key that cannot be opened, a database that fails: failed "error", no throw', async () => {
    db.calendly = { ...clyRow(), token_sealed: 'v1.not.a.seal' };
    assert.deepEqual(await why(), ['failed', 'error']);
    const broken = { query: async () => { throw new Error('database down'); } };
    const r = await meeting.bookMeeting(broken, { wid: 7, contactId: 5, dealId: 13, meeting: MEETING, now: NOW });
    assert.deepEqual([r.status, r.reason, r.detail], ['failed', 'error', 'database down']);
  });
});

describe('the note\'s line and who is told', () => {
  test('noteLine: nothing for no meeting; what was agreed when nothing is connected', () => {
    assert.equal(meeting.noteLine(null), '');
    assert.equal(meeting.noteLine({ status: 'not_connected', date: '2026-11-20', time: '14:00' }), 'Im Gespräch vereinbarter Termin: 20.11.2026, 14:00');
    assert.equal(meeting.noteLine({ status: 'failed', service: 'calendly', reason: 'no_email', date: '2026-11-20', time: '14:00' }), 'Termin im Gespräch vereinbart (20.11.2026, 14:00), aber nicht gebucht: der Kontakt hat keine E-Mail-Adresse');
  });
  test('assigneeOf: the deal\'s assignee, else the contact\'s, else nobody', async () => {
    db.dealAssignee = 9; db.contactAssignee = 4;
    assert.equal(await meeting.assigneeOf(pool, 7, 13, 5), 9);
    db.dealAssignee = null;
    assert.equal(await meeting.assigneeOf(pool, 7, 13, 5), 4);
    assert.equal(await meeting.assigneeOf(pool, 7, null, 5), 4);
    db.contactAssignee = null;
    assert.equal(await meeting.assigneeOf(pool, 7, 13, 5), null);
  });
});
