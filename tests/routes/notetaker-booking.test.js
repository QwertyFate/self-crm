// ROUTE tests for the Notetaker in the booking flow (2026-10-20): "Mit Notetaker aufzeichnen" in the deal's Cal.com
// booking dialog. Served the way server.js serves integrations.js (raw bytes on the Cal.com receiver, json for the
// rest) over a fake pool, a fake api.cal.com and a fake Notetaker at its default address. Pinned: the box is only for
// Google Meet; the request is remembered with the meeting (notetaker_recordings, external_id crm-meeting-<activity>);
// the bot is sent the first time the Meet link is known (in Cal.com's answer, else when the BOOKING_CREATED webhook
// brings it) with the sample payload (the start as the host's wall clock with its offset, our ids as metadata); a
// redelivery that changes nothing sends nothing; a moved meeting is sent again under the same external_id; a cancelled
// one is never sent; a Notetaker that is down never breaks the booking and is tried again on the next delivery; the
// token header only when NOTETAKER_CRM_TOKEN is set. Part 2: each meeting's own secret result link is the callback_url;
// a row from before the link gets one and is sent again; a meeting whose result has come is never sent again.
// Part 4 (2026-10-21): the fake pool hands DATE columns back as node-postgres does, a JavaScript Date at local midnight
// (it handed back text before, which hid the bug that left a booking with its Meet link at "waiting_link"); and the
// link watch: a request still waiting asks Cal.com for the booking until the Google Meet link exists, writes it into
// the entry, then sends the bot; past the meeting it gives up and says why.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const { loadRoute, ROOT } = require('../helpers/load-route');

const KEY = 'cal_live_0123456789abcdef0123456789abcdef', WID = 7, TOKEN = 't'.repeat(40), SECRET = 's'.repeat(64);
const NT_URL = 'http://localhost:8000/crm/recordings', MEET = 'https://meet.google.com/abc-defg-hij';
const CHAT_DE = 'Hallo, ich bin Notetaker. Dieses Meeting wird gemäß unserer Richtlinie zur Aufzeichnung von Meetings aufgezeichnet und transkribiert, um Notizen zu erstellen. Wenn Sie keine Aufzeichnung wünschen, kann der Host mich aus dem Meeting entfernen.';
const TYPES = [{ id: 7, slug: '30min', title: '30 Minuten', lengthInMinutes: 30, hidden: false, ownerId: 42, locations: [{ type: 'integration', integration: 'cal-video' }, { type: 'integration', integration: 'google-meet' }] }];
let calcom, ROW, integrations;
// what node-postgres makes of a DATE column: a Date at local midnight
const pgDate = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : v);
const state = {};
function reset() {
  Object.assign(state, {
    calls: [], activities: [], recordings: [], nextId: 100, nextRec: 1,
    deals: [{ id: 12, workspace_id: WID, title: 'Elbstraße 12', contact_id: 5, assigned_to: null }],
    contacts: [{ id: 5, workspace_id: WID, name: 'Jana Weber', email: 'jana.weber@example.de', assigned_to: null }],
    users: [{ id: 2, workspace_id: WID, name: 'Anna Weiß', email: 'anna@example.de', timezone: 'Europe/Berlin' }, { id: 42, workspace_id: WID, name: 'Mara Kühn', email: 'mara@example.de', timezone: 'Europe/Berlin' }],
  });
}
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (/FROM workspace_calcom c LEFT JOIN users u/.test(q)) return { rows: [{ ...ROW, connected_by_name: 'Olaf' }] };
    if (q.startsWith('SELECT * FROM workspace_calcom WHERE receive_token=$1')) return { rows: params[0] === TOKEN ? [{ ...ROW }] : [] };
    if (q.startsWith('SELECT id, title, contact_id, assigned_to FROM deals WHERE id=$1 AND workspace_id=$2')) return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]) };
    if (q.startsWith('SELECT id FROM deals WHERE id=$1 AND workspace_id=$2')) return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]).map(d => ({ id: d.id })) };
    if (q.startsWith('SELECT id, name, email, assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2')) return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]) };
    if (q.startsWith('SELECT id, name FROM contacts WHERE id=$1 AND workspace_id=$2')) return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]).map(c => ({ id: c.id, name: c.name })) };
    if (q.startsWith('SELECT id FROM users WHERE workspace_id=$1 AND LOWER(email)=$2')) return { rows: state.users.filter(u => u.workspace_id === params[0] && u.email === params[1]).map(u => ({ id: u.id })) };
    if (q.startsWith('SELECT assigned_to FROM')) return { rows: [{ assigned_to: null }] };
    if (q.startsWith('INSERT INTO activities')) {
      const hit = state.activities.find(a => a.workspace_id === params[0] && a.calcom_uid === params[8]);
      if (hit) { Object.assign(hit, { content: params[3], event_date: params[5], event_time: params[6], event_tz: params[7], cancelled_at: null }); return { rows: [{ id: hit.id, inserted: false }] }; }
      const a = { id: state.nextId++, workspace_id: params[0], contact_id: params[1], deal_id: params[2], content: params[3], created_by: params[4], event_date: params[5], event_time: params[6], event_tz: params[7], calcom_uid: params[8], cancelled_at: null };
      state.activities.push(a); return { rows: [{ id: a.id, inserted: true }] };
    }
    if (q.startsWith('UPDATE activities SET calcom_uid=$1, content=$2, event_date=$3, event_time=$4, event_tz=$5, cancelled_at=NULL WHERE workspace_id=$6')) {
      const hit = state.activities.find(a => a.workspace_id === params[5] && a.calcom_uid === params[6]);
      if (!hit) return { rows: [] };
      Object.assign(hit, { calcom_uid: params[0], content: params[1], event_date: params[2], event_time: params[3], event_tz: params[4], cancelled_at: null });
      return { rows: [{ id: hit.id, contact_id: hit.contact_id, deal_id: hit.deal_id }] };
    }
    if (q.startsWith('UPDATE activities SET cancelled_at=NOW()')) {
      const hit = state.activities.find(a => a.workspace_id === params[0] && a.calcom_uid === params[1] && !a.cancelled_at);
      if (!hit) return { rows: [] };
      hit.cancelled_at = '2026-10-20T10:00:00.000Z';
      return { rows: [{ id: hit.id, contact_id: hit.contact_id, deal_id: hit.deal_id, content: hit.content, event_date: hit.event_date, event_time: hit.event_time, event_tz: hit.event_tz }] };
    }
    if (q.startsWith('INSERT INTO notetaker_recordings')) {
      if (!state.recordings.some(r => r.activity_id === params[1])) state.recordings.push({ id: state.nextRec++, workspace_id: params[0], activity_id: params[1], requested_by: params[2], external_id: params[3], language: params[4], callback_token: params[5], finished_at: null, meeting_url: null, join_at: null, status: 'waiting_link', job_id: null, http_status: null, error: null });
      return { rows: [] };
    }
    if (q.startsWith('UPDATE notetaker_recordings SET callback_token = COALESCE(callback_token, $1) WHERE id = $2 RETURNING callback_token')) {
      const r = state.recordings.find(x => x.id === params[1]);
      r.callback_token = r.callback_token || params[0];
      return { rows: [{ callback_token: r.callback_token }] };
    }
    if (q.startsWith('SELECT n.id, n.external_id, n.meeting_url, n.join_at, n.status, n.job_id, n.language, n.requested_by, n.callback_token, n.finished_at, a.content')) {
      const r = state.recordings.find(x => x.workspace_id === params[0] && x.activity_id === params[1]);
      const a = r && state.activities.find(x => x.id === r.activity_id && x.workspace_id === r.workspace_id);
      return { rows: r && a ? [{ ...r, content: a.content, event_date: pgDate(a.event_date), event_time: a.event_time, event_tz: a.event_tz, deal_id: a.deal_id, contact_id: a.contact_id, cancelled_at: a.cancelled_at }] : [] };
    }
    if (q.startsWith('SELECT n.id, n.workspace_id, n.activity_id, n.status, a.content, a.calcom_uid, a.event_date, a.event_time, a.event_tz, c.api_key_sealed FROM notetaker_recordings n')) {
      const out = [];
      for (const r of state.recordings) {
        const a = state.activities.find(x => x.id === r.activity_id && x.workspace_id === r.workspace_id);
        if ((r.status === 'waiting_link' || (r.status === 'failed' && r.http_status === 0)) && !r.finished_at && a && !a.cancelled_at && a.calcom_uid) out.push({ id: r.id, workspace_id: r.workspace_id, activity_id: r.activity_id, status: r.status, content: a.content, calcom_uid: a.calcom_uid, event_date: pgDate(a.event_date), event_time: a.event_time, event_tz: a.event_tz, api_key_sealed: ROW.api_key_sealed });
      }
      return { rows: out.slice(0, params[0]) };
    }
    if (q.startsWith("UPDATE notetaker_recordings SET http_status=NULL, updated_at=NOW() WHERE id=$1 AND status='failed'")) {
      const r = state.recordings.find(x => x.id === params[0] && x.status === 'failed');
      if (r) r.http_status = null;
      return { rows: [] };
    }
    if (q.startsWith("UPDATE notetaker_recordings SET status='failed', error=$1, updated_at=NOW() WHERE id=$2 AND status='waiting_link'")) {
      const r = state.recordings.find(x => x.id === params[1] && x.status === 'waiting_link');
      if (r) Object.assign(r, { status: 'failed', error: params[0] });
      return { rows: [] };
    }
    if (q.startsWith('UPDATE notetaker_recordings SET status=$1, error=$2, updated_at=NOW() WHERE id=$3')) {
      Object.assign(state.recordings.find(x => x.id === params[2]), { status: params[0], error: params[1] });
      return { rows: [] };
    }
    if (q.startsWith('UPDATE activities SET content=$1 WHERE id=$2 AND workspace_id=$3 AND content=$4')) {
      const a = state.activities.find(x => x.id === params[1] && x.workspace_id === params[2] && x.content === params[3]);
      if (a) a.content = params[0];
      return { rows: [], rowCount: a ? 1 : 0 };
    }
    if (q.startsWith('UPDATE notetaker_recordings SET meeting_url=$1, join_at=$2, status=$3, job_id=COALESCE($4, job_id), http_status=$5, error=$6, sent_at=NOW(), updated_at=NOW() WHERE id=$7')) {
      const r = state.recordings.find(x => x.id === params[6]);
      Object.assign(r, { meeting_url: params[0], join_at: params[1], status: params[2], job_id: params[3] ?? r.job_id, http_status: params[4], error: params[5] });
      return { rows: [] };
    }
    return { rows: [] };
  },
};

// Cal.com and the Notetaker behind fetch; the test's own server passes through
let sent = [], probes = [], looks = [], plan = {};
const realFetch = globalThis.fetch;
function fakeNet(p) {
  sent = []; probes = []; looks = []; plan = p;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    if (u === NT_URL) sent.push({ headers: init.headers, body: JSON.parse(init.body) });
    if (/^https:\/\/api\.cal\.com\/v2\/bookings\/[^/]+$/.test(u) && (init?.method || 'GET') === 'GET') looks.push(u);
    if (u.startsWith(NT_URL + '?')) probes.push({ url: u, headers: init.headers });
    const k = Object.keys(plan).find(x => u.startsWith(x));
    let r = k ? plan[k] : { status: 404, body: {} };
    if (Array.isArray(r)) r = r.length > 1 ? r.shift() : r[0];
    if (r.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
const booked = location => ({ status: 201, body: { status: 'success', data: { uid: 'bk_1', title: '30 Minuten zwischen Mara Kühn und Jana Weber', start: '2026-10-21T12:00:00.000Z', end: '2026-10-21T12:30:00.000Z', status: 'accepted', location, eventTypeId: 7, hosts: [{ name: 'Mara Kühn', email: 'mara@example.de', timeZone: 'Europe/Berlin' }], attendees: [{ name: 'Jana Weber', email: 'jana.weber@example.de', timeZone: 'Europe/Berlin' }] } } });
const NT_OK = { status: 202, body: { job_id: 'j_1', status: 'scheduled' } };

let base, server;
const ENV = ['SESSION_SECRET', 'CALCOM_ENCRYPTION_KEY', 'CALCOM_API_URL', 'NOTETAKER_URL', 'NOTETAKER_CRM_TOKEN', 'NOTETAKER_CALLBACK_URL', 'PORT'];
const envSaved = {};
before(async () => {
  for (const k of ENV) { envSaved[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'notetaker-test-secret';
  calcom = require(path.join(ROOT, 'utils', 'calcom.js'));
  ROW = { id: 1, workspace_id: WID, api_key_sealed: calcom.sealKey(KEY), cal_user_id: 42, cal_email: 'mara@example.de', cal_name: 'Mara Kühn', cal_timezone: 'Europe/Berlin', event_types: TYPES, event_type_id: 7, receive_token: TOKEN, webhook_secret: SECRET, webhook_id: 'wh_1', connected_by: 1 };
  const app = express();
  app.use('/api/integrations/calcom/receive', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json());
  integrations = loadRoute('integrations.js', { pool, user: { id: 2, workspaceId: WID, role: 'member', timezone: 'Europe/Berlin' } });
  app.use('/api/integrations', integrations);
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { globalThis.fetch = realFetch; server.closeAllConnections?.(); await new Promise(r => server.close(r)); for (const k of ENV) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; } });
beforeEach(() => { reset(); delete process.env.NOTETAKER_CRM_TOKEN; process.env.SESSION_SECRET = 'notetaker-test-secret'; });

const call = async (method, p, body, headers = {}) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
const book = extra => call('POST', '/api/integrations/calcom/book', { deal_id: 12, event_type_id: 7, start: '2026-10-21T12:00:00.000Z', language: 'de', location: { type: 'integration', integration: 'google-meet' }, ...extra });
const deliver = (trigger, payload) => { const raw = JSON.stringify({ triggerEvent: trigger, createdAt: '2026-10-20T09:00:00.000Z', payload }); return call('POST', `/api/integrations/calcom/receive/${TOKEN}`, raw, { 'x-cal-signature-256': calcom.signBody(SECRET, Buffer.from(raw)) }); };
const WEBHOOK = { title: '30 Minuten zwischen Mara Kühn und Jana Weber', startTime: '2026-10-21T12:00:00Z', endTime: '2026-10-21T12:30:00Z', organizer: { name: 'Mara Kühn', email: 'mara@example.de', timeZone: 'Europe/Berlin' }, attendees: [{ email: 'jana.weber@example.de', name: 'Jana Weber', timeZone: 'Europe/Berlin' }], uid: 'bk_1', eventTypeId: 7, metadata: { upgrads_workspace_id: String(WID), upgrads_contact_id: '5', upgrads_deal_id: '12' }, status: 'ACCEPTED' };

describe('booking with the box ticked', () => {
  test('the Meet link is in Cal.com\'s answer: the request is remembered and the bot sent at once with the sample payload', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: NT_OK });
    const r = await book({ record: true });
    assert.equal(r.status, 201);
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO notetaker_recordings'));
    assert.match(ins.sql, /ON CONFLICT \(activity_id\) DO NOTHING/);
    const link = ins.params[5];
    assert.match(link, /^[0-9a-f]{48}$/, 'a fresh secret result link per meeting');
    assert.deepEqual(ins.params, [WID, 100, 2, 'crm-meeting-100', 'de', link]);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].headers, { 'Content-Type': 'application/json' }, 'no token set: no Authorization header');
    assert.deepEqual(sent[0].body, {
      meeting_url: MEET, callback_url: `http://localhost:3000/api/notetaker/webhook/${link}`, join_at: '2026-10-21T14:00:00+02:00', external_id: 'crm-meeting-100',
      metadata: { workspace_id: '7', activity_id: '100', deal_id: '12', contact_id: '5', user_id: '2' },
      bot_name: 'Notetaker', max_minutes: 120, include_notes: true, chat_message: CHAT_DE,
    });
    assert.deepEqual(r.body.notetaker, { status: 'scheduled', job_id: 'j_1', error: null });
    assert.deepEqual({ ...state.recordings[0], id: undefined }, { id: undefined, workspace_id: WID, activity_id: 100, requested_by: 2, external_id: 'crm-meeting-100', language: 'de', callback_token: link, finished_at: null, meeting_url: MEET, join_at: '2026-10-21T14:00:00+02:00', status: 'scheduled', job_id: 'j_1', http_status: 202, error: null });
  });
  test('no link yet (Cal.com names only the app): the request waits; the webhook brings the link and the bot is sent then, once', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked('integrations:google:meet'), [NT_URL]: NT_OK });
    const r = await book({ record: true });
    assert.equal(r.status, 201);
    assert.equal(sent.length, 0, 'nothing to send without a link');
    assert.deepEqual(r.body.notetaker, { status: 'waiting_link', job_id: null });
    const d = await deliver('BOOKING_CREATED', { ...WEBHOOK, videoCallData: { type: 'google_video', url: MEET } });
    assert.equal(d.status, 200);
    assert.equal(sent.length, 1); assert.equal(sent[0].body.meeting_url, MEET); assert.equal(sent[0].body.external_id, 'crm-meeting-100');
    assert.equal(state.recordings[0].status, 'scheduled');
    await deliver('BOOKING_CREATED', { ...WEBHOOK, videoCallData: { type: 'google_video', url: MEET } });
    assert.equal(sent.length, 1, 'the same delivery again changes nothing and sends nothing');
  });
  test('a moved meeting is sent again under the same external_id (the Notetaker answers updated); a cancelled one is not sent', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: [NT_OK, { status: 200, body: { updated: true, job_id: 'j_1' } }] });
    await book({ record: true });
    await deliver('BOOKING_RESCHEDULED', { ...WEBHOOK, uid: 'bk_2', rescheduleUid: 'bk_1', startTime: '2026-10-22T08:00:00Z', endTime: '2026-10-22T08:30:00Z', videoCallData: { url: MEET } });
    assert.equal(sent.length, 2);
    assert.equal(sent[1].body.external_id, 'crm-meeting-100'); assert.equal(sent[1].body.join_at, '2026-10-22T10:00:00+02:00');
    assert.equal(state.recordings[0].status, 'updated');
    await deliver('BOOKING_CANCELLED', { ...WEBHOOK, uid: 'bk_2' });
    assert.equal(sent.length, 2, 'a cancellation sends nothing');
  });
  test('the box is for Google Meet only: any other place is refused before Cal.com is asked', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: NT_OK });
    const r = await book({ record: true, location: { type: 'integration', integration: 'cal-video' } });
    assert.equal(r.status, 400); assert.match(r.body.error, /Google Meet/);
    assert.equal(state.calls.filter(c => c.sql.startsWith('INSERT INTO activities')).length, 0);
    assert.equal(sent.length, 0);
  });
  test('without the box: nothing remembered, nothing sent, no notetaker in the answer', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: NT_OK });
    const r = await book({});
    assert.equal(r.status, 201);
    assert.equal(state.recordings.length, 0); assert.equal(sent.length, 0);
    assert.equal(r.body.notetaker, null);
    await deliver('BOOKING_CREATED', { ...WEBHOOK, videoCallData: { url: MEET } });
    assert.equal(sent.length, 0, 'a meeting without the box is never sent');
  });
  test('a Notetaker that is down never breaks the booking; the next delivery tries again', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: [{ throw: true }, NT_OK] });
    const r = await book({ record: true });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body.notetaker, { status: 'failed', job_id: null, error: 'The Notetaker is not reachable' });
    assert.equal(state.recordings[0].status, 'failed');
    await deliver('BOOKING_CREATED', { ...WEBHOOK, videoCallData: { url: MEET } });
    assert.equal(sent.length, 2); assert.equal(state.recordings[0].status, 'scheduled');
  });
  test('a meeting from before the result link gets one on its next delivery and is sent again, with the link', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: [NT_OK, { status: 200, body: { updated: true, job_id: 'j_1' } }] });
    await book({ record: true });
    state.recordings[0].callback_token = null;   // as a row written before Part 2
    await deliver('BOOKING_CREATED', { ...WEBHOOK, videoCallData: { url: MEET } });
    assert.equal(sent.length, 2, 'unchanged time and link, but the Notetaker must learn where to send the notes');
    assert.match(state.recordings[0].callback_token, /^[0-9a-f]{48}$/);
    assert.equal(sent[1].body.callback_url, `http://localhost:3000/api/notetaker/webhook/${state.recordings[0].callback_token}`);
    assert.equal(sent[1].body.external_id, 'crm-meeting-100');
    await deliver('BOOKING_CREATED', { ...WEBHOOK, videoCallData: { url: MEET } });
    assert.equal(sent.length, 2, 'and then nothing more');
  });
  test('once the result has come, a late delivery never books the bot again', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: NT_OK });
    await book({ record: true });
    Object.assign(state.recordings[0], { status: 'completed', finished_at: '2026-10-21T13:00:00.000Z' });
    await deliver('BOOKING_CREATED', { ...WEBHOOK, videoCallData: { url: MEET } });
    await deliver('BOOKING_RESCHEDULED', { ...WEBHOOK, uid: 'bk_2', rescheduleUid: 'bk_1', startTime: '2026-10-22T08:00:00Z', endTime: '2026-10-22T08:30:00Z', videoCallData: { url: MEET } });
    assert.equal(sent.length, 1);
  });
  test('with NOTETAKER_CRM_TOKEN set, the bot is asked with Authorization: Bearer <token>', async () => {
    process.env.NOTETAKER_CRM_TOKEN = 'tok_abc';
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: NT_OK });
    await book({ record: true });
    assert.deepEqual(sent[0].headers, { 'Content-Type': 'application/json', Authorization: 'Bearer tok_abc' });
  });
});

describe('the Meet link, fetched from Cal.com when it has not come (Part 4)', () => {
  const BEFORE = Date.parse('2026-10-20T10:00:00Z'), LATE = Date.parse('2026-10-21T12:31:00Z');   // the meeting starts 2026-10-21T12:00Z
  const GOOGLE = 'https://api.cal.com/v2/bookings/bk_1';
  test('the dates as the database returns them: a booking whose answer holds the Meet link sends the bot at once', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: NT_OK });
    const r = await book({ record: true });
    assert.deepEqual(r.body.notetaker, { status: 'scheduled', job_id: 'j_1', error: null });
    assert.equal(sent.length, 1); assert.equal(sent[0].body.join_at, '2026-10-21T14:00:00+02:00');
  });
  test('no link at booking: the watch asks Cal.com until the Meet exists, writes the link into the entry, then sends the bot, once', async () => {
    fakeNet({ [GOOGLE]: [{ status: 200, body: { status: 'success', data: { uid: 'bk_1', location: 'integrations:google:meet' } } }, { status: 200, body: { status: 'success', data: { uid: 'bk_1', location: MEET } } }], 'https://api.cal.com/v2/bookings': booked('integrations:google:meet'), [NT_URL]: NT_OK });
    const r = await book({ record: true });
    assert.equal(r.body.notetaker.status, 'waiting_link'); assert.equal(sent.length, 0);
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), [{ id: 1, status: 'waiting_link' }], 'Cal.com has not made the Meet yet');
    assert.deepEqual(looks, [GOOGLE]); assert.equal(sent.length, 0);
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), [{ id: 1, status: 'scheduled' }]);
    assert.equal(state.activities[0].content, `30 Minuten zwischen Mara Kühn und Jana Weber\n${MEET}`, 'the entry gets its join link');
    assert.equal(sent.length, 1); assert.equal(sent[0].body.meeting_url, MEET); assert.equal(sent[0].body.external_id, 'crm-meeting-100');
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), [], 'nothing waits any more');
    assert.equal(looks.length, 2); assert.equal(sent.length, 1);
  });
  test('a request that waits although the entry has the link (as before this fix) is sent without asking Cal.com', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: [{ throw: true }, NT_OK] });
    await book({ record: true });
    Object.assign(state.recordings[0], { status: 'waiting_link', meeting_url: null, join_at: null });
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), [{ id: 1, status: 'scheduled' }]);
    assert.equal(looks.length, 0); assert.equal(sent.length, 2);
  });
  test('past the start (the Notetaker takes 30 minutes late at most): it stops waiting and says why, without asking Cal.com', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked('integrations:google:meet'), [NT_URL]: NT_OK });
    await book({ record: true });
    assert.deepEqual(await integrations.notetakerLinkTick({ now: LATE }), [{ id: 1, status: 'failed' }]);
    assert.equal(state.recordings[0].error, 'The Google Meet link never arrived from Cal.com');
    assert.equal(looks.length, 0); assert.equal(sent.length, 0);
  });
  test('Cal.com down: the request keeps waiting for the next tick; a cancelled meeting is not asked about', async () => {
    fakeNet({ [GOOGLE]: { throw: true }, 'https://api.cal.com/v2/bookings': booked('integrations:google:meet'), [NT_URL]: NT_OK });
    await book({ record: true });
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), [{ id: 1, status: 'waiting_link' }]);
    state.activities[0].cancelled_at = '2026-10-20T11:00:00.000Z';
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), []);
    assert.equal(sent.length, 0);
  });
  test('the Notetaker unreachable at booking: the watch sends again until it answers; past the start it lets the request rest', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: [{ throw: true }, { throw: true }, NT_OK] });
    const r = await book({ record: true });
    assert.equal(r.body.notetaker.status, 'failed'); assert.equal(state.recordings[0].http_status, 0);
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), [{ id: 1, status: 'failed' }], 'still down');
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), [{ id: 1, status: 'scheduled' }], 'up again: sent');
    assert.equal(sent.length, 3); assert.equal(looks.length, 0, 'the link was there: Cal.com is not asked');
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), []);
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: { throw: true } });
    reset();
    await book({ record: true });
    assert.deepEqual(await integrations.notetakerLinkTick({ now: LATE }), [{ id: 1, status: 'failed' }]);
    assert.equal(state.recordings[0].http_status, null, 'not picked up again');
    assert.deepEqual(await integrations.notetakerLinkTick({ now: LATE }), []);
    assert.equal(sent.length, 1, 'only the booking itself tried');
  });
  test('a start the Notetaker cannot use is a failure with a reason, not a silent wait', async () => {
    fakeNet({ 'https://api.cal.com/v2/bookings': booked(MEET), [NT_URL]: NT_OK });
    await book({});
    state.recordings.push({ id: 9, workspace_id: WID, activity_id: 100, requested_by: 2, external_id: 'crm-meeting-100', language: 'de', callback_token: 'c'.repeat(48), finished_at: null, meeting_url: null, join_at: null, status: 'waiting_link', job_id: null, http_status: null, error: null });
    state.activities[0].event_date = null;
    assert.deepEqual(await integrations.notetakerLinkTick({ now: BEFORE }), [{ id: 9, status: 'failed' }]);
    assert.equal(state.recordings[0].error, 'The meeting has no start time the Notetaker can use');
    assert.equal(sent.length, 0);
  });
  test('the watch is started by server.js once the database is ready, like the Engine\'s retry worker; it ticks at once and every 20 seconds, unref\'d, never overlapping', () => {
    const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert.match(srv, /const integrations = require\('\.\/routes\/integrations'\);/);
    assert.match(srv, /app\.use\('\/api\/integrations',  integrations\);/);
    assert.match(srv, /initDb\(\)\s*\.then\(\(\) => \{[\s\S]*integrations\.startNotetakerLinkWatch\(\);[\s\S]*\}\)\s*\.catch/);
    const src = fs.readFileSync(path.join(ROOT, 'routes', 'integrations.js'), 'utf8');
    const fn = src.slice(src.indexOf('function startNotetakerLinkWatch('), src.indexOf('\n}', src.indexOf('function startNotetakerLinkWatch(')));
    assert.match(fn, /intervalMs = 20000/); assert.match(fn, /if \(busy\) return;/); assert.match(fn, /timer\.unref\(\)/); assert.match(fn, /tick\(\);\s*return ntLinkWatch;$/);
  });
});

describe('the health check before the box is offered (Part 3)', () => {
  test('GET /notetaker/health: available when the Notetaker answers its listing; asked again only after 15 seconds or when fresh', async () => {
    fakeNet({ [NT_URL]: { status: 200, body: [] } });
    const r = await call('GET', '/api/integrations/notetaker/health?fresh=1');
    assert.equal(r.status, 200); assert.deepEqual(r.body, { available: true });
    assert.equal(probes.length, 1); assert.equal(probes[0].url, NT_URL + '?external_id=crm-health-check');
    assert.deepEqual((await call('GET', '/api/integrations/notetaker/health')).body, { available: true });
    assert.equal(probes.length, 1, 'the answer is kept for a moment: opening dialogs does not hammer the Notetaker');
    await call('GET', '/api/integrations/notetaker/health?fresh=1');
    assert.equal(probes.length, 2, '"Check again" asks again');
  });
  test('down, or the token refused: not available, with the reason the dialog shows', async () => {
    fakeNet({ [NT_URL]: { throw: true } });
    assert.deepEqual((await call('GET', '/api/integrations/notetaker/health?fresh=1')).body, { available: false, reason: 'unreachable' });
    fakeNet({ [NT_URL]: { status: 401, body: { detail: 'missing or wrong Authorization: Bearer token' } } });
    assert.deepEqual((await call('GET', '/api/integrations/notetaker/health?fresh=1')).body, { available: false, reason: 'token' });
  });
  test('members only: the route sits behind the login check', () => {
    assert.match(fs.readFileSync(path.join(ROOT, 'routes', 'integrations.js'), 'utf8'), /router\.get\('\/notetaker\/health', requireAuth, async \(req, res\) => \{/);
  });
});

describe('the table and the settings', () => {
  test('one request per meeting, removed with it; the external id is unique; waiting for the link by default', () => {
    const db = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
    const i = db.indexOf('CREATE TABLE IF NOT EXISTS notetaker_recordings'); assert.ok(i > db.indexOf('async function initDb()'));
    const t = db.slice(i, db.indexOf(')\n  `);', i));
    assert.match(t, /workspace_id\s+INTEGER NOT NULL REFERENCES workspaces\(id\) ON DELETE CASCADE/);
    assert.match(t, /activity_id\s+INTEGER NOT NULL UNIQUE REFERENCES activities\(id\) ON DELETE CASCADE/);
    assert.match(t, /requested_by\s+INTEGER REFERENCES users\(id\) ON DELETE SET NULL/);
    assert.match(t, /external_id\s+TEXT NOT NULL UNIQUE/);
    assert.match(t, /status\s+TEXT NOT NULL DEFAULT 'waiting_link'/);
  });
  test('.env.example names the address, the optional token and the callback', () => {
    const env = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    assert.match(env, /^# ?NOTETAKER_URL=http:\/\/localhost:8000\/crm\/recordings$/m);
    assert.match(env, /^# ?NOTETAKER_CRM_TOKEN=$/m);
    assert.match(env, /^# ?NOTETAKER_CALLBACK_URL=http:\/\/localhost:3000\/api\/notetaker\/webhook$/m);
  });
});
