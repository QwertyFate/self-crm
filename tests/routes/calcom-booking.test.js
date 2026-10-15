// ROUTE tests for GET /api/integrations/calcom/slots and POST /api/integrations/calcom/book
// (Cal.com integration, Step 3 piece 2, 2026-10-13): booking from the CRM. Served as a
// MEMBER (anyone may book; the host is always the connected account) over a fake pool and
// a fake api.cal.com. Pinned: slots are asked for the chosen event type in the viewer's
// zone, from today or a given day, 1–14 days; a booking needs a known deal or contact of
// this workspace and the contact's email; Cal.com gets the attendee, our metadata and the
// note; the entry is written at once on the same row the webhook will land on, owned by
// the booker; Cal.com refusing a slot is a 409, unreachable a 502; the delivery is logged.
// Part 12 (2026-10-14): the deal's assignee (else the contact's) rides along as a Cal.com
// guest unless they are the host or the attendee; an event type that takes no guests gets
// the booking without them; the assignee is told once (not when they booked it themselves).
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const KEY = 'cal_live_0123456789abcdef0123456789abcdef', WID = 7;
const TYPES = [{ id: 7, slug: '30min', title: '30 Minuten', lengthInMinutes: 30, hidden: false, ownerId: 42, locations: [{ type: 'integration', integration: 'cal-video' }, { type: 'integration', integration: 'google-meet' }, { type: 'address', address: 'Elbstraße 12' }] }, { id: 8, slug: 'besichtigung', title: 'Besichtigung', lengthInMinutes: 60, hidden: true, ownerId: 42, locations: [] }];
const state = {};
let calcom, ROW;
function reset() {
  Object.assign(state, {
    calls: [], logs: [], activities: [], told: [], nextId: 100,
    row: { ...ROW },
    deals: [{ id: 12, workspace_id: WID, title: 'Elbstraße 12', contact_id: 5, assigned_to: 3 }, { id: 13, workspace_id: WID, title: 'Ohne Mail', contact_id: 6, assigned_to: null }, { id: 14, workspace_id: WID, title: 'Maras Deal', contact_id: 5, assigned_to: 9 }, { id: 15, workspace_id: WID, title: 'Mein Deal', contact_id: 5, assigned_to: 2 }, { id: 16, workspace_id: WID, title: 'Niemandes Deal', contact_id: 7, assigned_to: null }],
    contacts: [{ id: 5, workspace_id: WID, name: 'Jana Weber', email: 'jana.weber@example.de', assigned_to: null }, { id: 6, workspace_id: WID, name: 'Kein Mail', email: null, assigned_to: null }, { id: 7, workspace_id: WID, name: 'Ömer Kaya', email: 'oe.kaya@example.de', assigned_to: 3 }],
    users: [{ id: 2, workspace_id: WID, name: 'Booker', email: 'booker@example.de', timezone: 'America/New_York' }, { id: 3, workspace_id: WID, name: 'Tim Berger', email: 'Tim@Example.de ', timezone: 'Asia/Manila' }, { id: 9, workspace_id: WID, name: 'Mara Kühn', email: 'mara@example.de', timezone: 'Europe/Berlin' }],
  });
}
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (/FROM workspace_calcom c LEFT JOIN users u/.test(q)) return { rows: state.row ? [{ ...state.row, connected_by_name: 'Olaf' }] : [] };
    if (q.startsWith('SELECT id, title, contact_id, assigned_to FROM deals WHERE id=$1 AND workspace_id=$2')) return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]) };
    if (q.startsWith('SELECT id, name, email, assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2')) return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]) };
    if (q.startsWith('SELECT id, name, email FROM users WHERE id=$1 AND workspace_id=$2') || q.startsWith('SELECT id, timezone FROM users WHERE id=$1 AND workspace_id=$2')) return { rows: state.users.filter(u => u.id === params[0] && u.workspace_id === params[1]) };
    if (q.startsWith('SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2')) return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]).map(d => ({ assigned_to: d.assigned_to })) };
    if (q.startsWith('SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2')) return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]).map(c => ({ assigned_to: c.assigned_to })) };
    if (q.startsWith('INSERT INTO activities')) {
      const hit = state.activities.find(a => a.calcom_uid === params[8]);
      if (hit) { Object.assign(hit, { content: params[3], created_by: params[4], deal_id: params[2] ?? hit.deal_id }); return { rows: [{ id: hit.id }] }; }
      const a = { id: state.nextId++, workspace_id: params[0], contact_id: params[1], deal_id: params[2], content: params[3], created_by: params[4], event_date: params[5], event_time: params[6], event_tz: params[7], calcom_uid: params[8] };
      state.activities.push(a); return { rows: [{ id: a.id }] };
    }
    if (q.startsWith('INSERT INTO webhook_logs')) { state.logs.push({ status: params[1], payload: JSON.parse(params[2]), captured: JSON.parse(params[3]), contact_id: params[4], deal_id: params[5], error: params[6] }); return { rows: [] }; }
    return { rows: [] };
  },
};

let fetchCalls = [];
const realFetch = globalThis.fetch;
function fakeCal(plan) {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, init);
    fetchCalls.push({ url: u, method: init?.method || 'GET', headers: init?.headers, body: init?.body ? JSON.parse(init.body) : undefined });
    const k = Object.keys(plan).find(p => u.startsWith(p));
    let r = k ? plan[k] : { status: 404, body: { status: 'error', error: { message: 'no such route' } } };
    if (Array.isArray(r)) r = r.length > 1 ? r.shift() : r[0];   // an array answers in turn, the last one for good
    if (r.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
const SLOTS = { '2026-10-20': [{ start: '2026-10-20T09:00:00.000+02:00', end: '2026-10-20T09:30:00.000+02:00' }, { start: '2026-10-20T14:00:00.000+02:00', end: '2026-10-20T14:30:00.000+02:00' }], '2026-10-21': [] };
const BOOKED = { uid: 'bk_1', title: '30 Minuten zwischen Mara Kühn und Jana Weber', start: '2026-10-20T12:00:00.000Z', end: '2026-10-20T12:30:00.000Z', status: 'accepted', meetingUrl: 'https://app.cal.com/video/bk_1', eventTypeId: 7, duration: 30, hosts: [{ name: 'Mara Kühn', email: 'mara@example.de', timeZone: 'Europe/Berlin' }], attendees: [{ name: 'Jana Weber', email: 'jana.weber@example.de', timeZone: 'Europe/Berlin' }] };
const CAL_OK = { 'https://api.cal.com/v2/slots': { status: 200, body: { status: 'success', data: SLOTS } }, 'https://api.cal.com/v2/bookings': { status: 201, body: { status: 'success', data: BOOKED } } };

let member;
const envSaved = {};
before(async () => {
  for (const k of ['SESSION_SECRET', 'CALCOM_ENCRYPTION_KEY', 'CALCOM_API_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'booking-test-secret';
  calcom = require(path.join(ROOT, 'utils', 'calcom.js'));
  ROW = { id: 1, workspace_id: WID, api_key_sealed: calcom.sealKey(KEY), cal_user_id: 42, cal_email: 'mara@example.de', cal_name: 'Mara Kühn', cal_timezone: 'Europe/Berlin', event_types: TYPES, event_type_id: 7, receive_token: 't'.repeat(40), webhook_secret: 's'.repeat(64), webhook_id: 'wh_1', connected_by: 1 };
  member = await serve({ '/api/integrations': loadRoute('integrations.js', { pool, user: { id: 2, workspaceId: WID, role: 'member', timezone: 'America/New_York' }, notifications: { notify() {}, notifyUser: async (...args) => { state.told.push(args); return true; } } }) });
});
after(async () => { await member.close(); globalThis.fetch = realFetch; for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; } });
beforeEach(() => { reset(); fakeCal(CAL_OK); process.env.SESSION_SECRET = 'booking-test-secret'; });

describe('GET /api/integrations/calcom/slots', () => {
  test('not connected: 404; the chosen event type, the viewer\'s zone, today for seven days by default; the answer per day', async () => {
    state.row = null;
    assert.equal((await member.request('GET', '/api/integrations/calcom/slots')).status, 404);
    reset(); fakeCal(CAL_OK);
    const r = await member.request('GET', '/api/integrations/calcom/slots');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const u = new URL(fetchCalls[0].url);
    assert.equal(u.origin + u.pathname, 'https://api.cal.com/v2/slots');
    assert.equal(fetchCalls[0].headers['cal-api-version'], '2024-09-04'); assert.equal(fetchCalls[0].headers.Authorization, `Bearer ${KEY}`);
    assert.equal(u.searchParams.get('eventTypeId'), '7'); assert.equal(u.searchParams.get('timeZone'), 'America/New_York'); assert.equal(u.searchParams.get('format'), 'range');
    const today = calcom.wallClock(new Date().toISOString(), 'America/New_York').date;
    assert.equal(u.searchParams.get('start'), today);
    const end = new Date(today + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 7);
    assert.equal(u.searchParams.get('end'), end.toISOString().slice(0, 10));
    assert.deepEqual(r.body.event_type, { id: 7, title: '30 Minuten', lengthInMinutes: 30 }); assert.equal(r.body.time_zone, 'America/New_York'); assert.equal(r.body.days, 7); assert.equal(r.body.from, today);
    assert.deepEqual(r.body.slots, { '2026-10-20': [{ start: '2026-10-20T07:00:00.000Z', end: '2026-10-20T07:30:00.000Z' }, { start: '2026-10-20T12:00:00.000Z', end: '2026-10-20T12:30:00.000Z' }], '2026-10-21': [] }, 'ISO instants, per day');
  });
  test('from, days (clamped to 42, a month\'s grid) and another event type (a hidden one too); an unknown type is 400; Cal.com failing is 502', async () => {
    const r = await member.request('GET', '/api/integrations/calcom/slots?from=2026-10-20&days=60&event_type_id=8');
    const u = new URL(fetchCalls[0].url);
    assert.equal(u.searchParams.get('eventTypeId'), '8'); assert.equal(u.searchParams.get('start'), '2026-10-20'); assert.equal(u.searchParams.get('end'), '2026-12-01'); assert.equal(r.body.days, 42);
    assert.equal((await member.request('GET', '/api/integrations/calcom/slots?event_type_id=999')).status, 400);
    assert.equal((await member.request('GET', '/api/integrations/calcom/slots?from=20.10.2026')).status, 200, 'a malformed from falls back to today');
    fakeCal({ 'https://api.cal.com/v2/slots': { throw: true } });
    assert.equal((await member.request('GET', '/api/integrations/calcom/slots')).status, 502);
  });
});

describe('POST /api/integrations/calcom/book', () => {
  test('from a deal: Cal.com gets the attendee in the booker\'s zone and language, our metadata and the note; the entry is written at once in the host\'s zone, owned by the booker, linked to deal and contact; logged; 201', async () => {
    const r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z', note: '  Bitte Unterlagen mitbringen  ', language: 'de' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const call = fetchCalls[0];
    assert.equal(call.url, 'https://api.cal.com/v2/bookings'); assert.equal(call.method, 'POST'); assert.equal(call.headers['cal-api-version'], '2026-02-25'); assert.equal(call.headers.Authorization, `Bearer ${KEY}`);
    assert.deepEqual(call.body, { start: '2026-10-20T12:00:00.000Z', eventTypeId: 7, attendee: { name: 'Jana Weber', email: 'jana.weber@example.de', timeZone: 'America/New_York', language: 'de' }, metadata: { upgrads_workspace_id: '7', upgrads_contact_id: '5', upgrads_deal_id: '12' }, bookingFieldsResponses: { notes: 'Bitte Unterlagen mitbringen' }, guests: ['tim@example.de'] }, 'the deal\'s assignee rides along as a guest, email trimmed and lower-cased');
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO activities'));
    assert.match(ins.sql, /ON CONFLICT \(workspace_id, calcom_uid\) WHERE calcom_uid IS NOT NULL DO UPDATE SET content=EXCLUDED\.content, event_date=EXCLUDED\.event_date, event_time=EXCLUDED\.event_time, event_tz=EXCLUDED\.event_tz, created_by=EXCLUDED\.created_by, deal_id=COALESCE\(EXCLUDED\.deal_id, activities\.deal_id\), cancelled_at=NULL/, 'the webhook may have landed first: the booker still owns it, the deal link stays');
    assert.deepEqual(ins.params, [WID, 5, 12, '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://app.cal.com/video/bk_1', 2, '2026-10-20', '14:00', 'Europe/Berlin', 'bk_1', 7], 'the host\'s wall clock (Berlin), not the booker\'s; the meeting link on the second line');
    assert.deepEqual(r.body.activity, { id: 100, type: 'meeting', content: '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://app.cal.com/video/bk_1', event_date: '2026-10-20', event_time: '14:00', event_tz: 'Europe/Berlin', contact_id: 5, deal_id: 12, calcom_uid: 'bk_1', calcom_event_type_id: 7, source: 'calcom', created_by: 2 });
    assert.deepEqual(r.body.booking, { uid: 'bk_1', title: '30 Minuten zwischen Mara Kühn und Jana Weber', start: '2026-10-20T12:00:00.000Z', end: '2026-10-20T12:30:00.000Z', status: 'accepted', location: null, meeting_url: 'https://app.cal.com/video/bk_1', guests: [{ name: 'Tim Berger', email: 'tim@example.de' }] });
    assert.equal(r.body.told, 3, 'the assignee was told');
    assert.deepEqual(state.told, [[WID, 2, 3, { type: 'meeting_booked', category: 'activities', title: '30 Minuten zwischen Mara Kühn und Jana Weber', body: '20.10.2026, 20:00 (Asia/Manila), Cal Video', entityType: 'deal', entityId: 12 }]], 'one bell: the meeting\'s own title, the time on the assignee\'s clock, where it happens, the deal to open');
    const l = state.logs[0];
    assert.equal(l.status, 'success'); assert.equal(l.contact_id, 5); assert.equal(l.deal_id, 12);
    assert.equal(l.captured.trigger, 'BOOKED_FROM_CRM'); assert.equal(l.captured.booked_by, 2); assert.equal(l.captured.uid, 'bk_1'); assert.equal(l.payload.request.event_type_id, 7);
    assert.equal(l.captured.guest, 'tim@example.de'); assert.equal(l.captured.guest_dropped, false); assert.equal(l.captured.told, 3);
  });
  test('the assignee (Part 12): the host as assignee is told but not invited again; the booker as assignee is invited but not told; a contact\'s assignee counts when the deal has none; nobody responsible, nobody told; an event type that refuses guests gets the booking without them; a refused slot is not retried', async () => {
    let r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 14, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 201); assert.equal('guests' in fetchCalls[0].body, false, 'the host is already there'); assert.deepEqual(r.body.booking.guests, []); assert.equal(r.body.told, 9);
    assert.deepEqual(state.told[0].slice(0, 3), [WID, 2, 9]); assert.equal(state.told[0][3].body, '20.10.2026, 14:00 (Europe/Berlin), Cal Video', 'on the host\'s own clock');
    reset(); fakeCal(CAL_OK);
    r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 15, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 201); assert.deepEqual(fetchCalls[0].body.guests, ['booker@example.de'], 'the booker gets the invitation into their own calendar'); assert.equal(r.body.told, null); assert.equal(state.told.length, 0, 'they booked it themselves');
    reset(); fakeCal(CAL_OK);
    r = await member.request('POST', '/api/integrations/calcom/book', { contact_id: 7, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 201); assert.deepEqual(fetchCalls[0].body.guests, ['tim@example.de']); assert.equal(r.body.told, 3);
    assert.deepEqual(state.told[0][3], { type: 'meeting_booked', category: 'activities', title: '30 Minuten zwischen Mara Kühn und Jana Weber', body: '20.10.2026, 20:00 (Asia/Manila), Cal Video', entityType: 'contact', entityId: 7 }, 'no deal: the contact\'s assignee, the contact to open');
    reset(); fakeCal(CAL_OK);
    r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 16, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 201); assert.deepEqual(fetchCalls[0].body.guests, ['tim@example.de'], 'the deal has no assignee: the contact\'s'); assert.equal(r.body.told, 3);
    reset(); fakeCal(CAL_OK); state.contacts.find(c => c.id === 7).assigned_to = null;
    r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 16, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 201); assert.equal('guests' in fetchCalls[0].body, false); assert.equal(r.body.told, null); assert.equal(state.told.length, 0);
    reset(); fakeCal({ ...CAL_OK, 'https://api.cal.com/v2/bookings': [{ status: 400, body: { status: 'error', error: { message: 'guests field is hidden on this event type' } } }, { status: 201, body: { status: 'success', data: BOOKED } }] });
    r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(fetchCalls.length, 2); assert.deepEqual(fetchCalls[0].body.guests, ['tim@example.de']); assert.equal('guests' in fetchCalls[1].body, false, 'booked again without the guest');
    assert.deepEqual(r.body.booking.guests, []); assert.equal(state.logs[0].captured.guest_dropped, true); assert.equal(r.body.told, 3, 'the bell still rings');
    reset(); fakeCal({ ...CAL_OK, 'https://api.cal.com/v2/bookings': { status: 400, body: { status: 'error', error: { message: 'Slot is no longer available' } } } });
    r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 409); assert.equal(fetchCalls.length, 1, 'any other refusal is not retried'); assert.equal(state.told.length, 0);
  });
  test('where it happens: a chosen location of the event type goes to Cal.com; one not on the type is 400 before Cal.com is asked; none means Cal.com\'s default; the link Cal.com answers with lands in the entry', async () => {
    fakeCal({ ...CAL_OK, 'https://api.cal.com/v2/bookings': { status: 201, body: { status: 'success', data: { ...BOOKED, location: 'https://meet.google.com/abc-defg-hij', meetingUrl: 'https://meet.google.com/abc-defg-hij' } } } });
    const r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z', location: { type: 'integration', integration: 'google-meet' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(fetchCalls[0].body.location, { type: 'integration', integration: 'google-meet' });
    assert.equal(r.body.booking.location, 'https://meet.google.com/abc-defg-hij'); assert.equal(r.body.activity.content, '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://meet.google.com/abc-defg-hij');
    fetchCalls = [];
    const addr = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z', location: { type: 'address', address: 'ignored, Cal.com knows it' } });
    assert.equal(addr.status, 201); assert.deepEqual(fetchCalls[0].body.location, { type: 'address' });
    fetchCalls = [];
    const bad = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z', location: { type: 'integration', integration: 'zoom' } });
    assert.equal(bad.status, 400); assert.match(bad.body.error, /event type's locations/); assert.equal(fetchCalls.length, 0);
    const none = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z' });
    assert.equal(none.status, 201); assert.equal('location' in fetchCalls[0].body, false, 'no location field: the event type\'s default');
  });
  test('from a contact, another event type, English, no note: no deal in the metadata, no notes field; a deal of another workspace is 400', async () => {
    const r = await member.request('POST', '/api/integrations/calcom/book', { contact_id: 5, event_type_id: 8, start: '2026-10-20T12:00:00Z', language: 'en' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(fetchCalls[0].body, { start: '2026-10-20T12:00:00.000Z', eventTypeId: 8, attendee: { name: 'Jana Weber', email: 'jana.weber@example.de', timeZone: 'America/New_York', language: 'en' }, metadata: { upgrads_workspace_id: '7', upgrads_contact_id: '5' } });
    assert.equal(r.body.activity.deal_id, null);
    assert.equal((await member.request('POST', '/api/integrations/calcom/book', { deal_id: 999, start: '2026-10-20T12:00:00Z' })).status, 400);
  });
  test('what is refused before Cal.com is asked: no start, a bad start, no contact, an unknown contact, a contact without an email, an unknown event type', async () => {
    const cases = [[{ deal_id: 12 }, /start must be/], [{ deal_id: 12, start: 'morgen' }, /start must be/], [{ start: '2026-10-20T12:00:00Z' }, /contact is required/], [{ contact_id: 999, start: '2026-10-20T12:00:00Z' }, /Contact not found/], [{ deal_id: 13, start: '2026-10-20T12:00:00Z' }, /no email address/], [{ deal_id: 12, start: '2026-10-20T12:00:00Z', event_type_id: 999 }, /event types/]];
    for (const [body, re] of cases) { const r = await member.request('POST', '/api/integrations/calcom/book', body); assert.equal(r.status, 400, JSON.stringify(body)); assert.match(r.body.error, re); }
    assert.equal(fetchCalls.length, 0); assert.equal(state.activities.length, 0); assert.equal(state.logs.length, 0);
  });
  test('Cal.com refuses the slot: 409 with its message, nothing written; unreachable: 502; a rotated server secret: 409 connect again; not connected: 404', async () => {
    fakeCal({ 'https://api.cal.com/v2/bookings': { status: 400, body: { status: 'error', error: { message: 'Slot is no longer available' } } } });
    const r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 409); assert.equal(r.body.error, 'Cal.com did not accept the booking: Slot is no longer available'); assert.equal(state.activities.length, 0); assert.equal(state.logs.length, 0);
    fakeCal({ 'https://api.cal.com/v2/bookings': { throw: true } });
    assert.equal((await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z' })).status, 502);
    process.env.SESSION_SECRET = 'rotated';
    assert.equal((await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z' })).status, 409);
    process.env.SESSION_SECRET = 'booking-test-secret'; state.row = null;
    assert.equal((await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z' })).status, 404);
  });
  test('the same booking twice (the webhook landed first, say): one row, re-owned by the booker', async () => {
    state.activities.push({ id: 50, workspace_id: WID, contact_id: 5, deal_id: null, created_by: 1, calcom_uid: 'bk_1', content: 'old' });
    const r = await member.request('POST', '/api/integrations/calcom/book', { deal_id: 12, start: '2026-10-20T12:00:00Z' });
    assert.equal(r.status, 201); assert.equal(r.body.activity.id, 50); assert.equal(state.activities.length, 1); assert.equal(state.activities[0].created_by, 2); assert.equal(state.activities[0].deal_id, 12);
  });
});
