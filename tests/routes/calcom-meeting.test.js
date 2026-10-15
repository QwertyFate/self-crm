// ROUTE tests for POST /api/integrations/calcom/cancel and /reschedule, and the reschedule slots
// (Cal.com integration, Part 11, 2026-10-13): acting on a booked meeting from the CRM. Served as a
// MEMBER (everyone may). Pinned: only an entry from Cal.com with a booking id that is not cancelled
// qualifies; cancel goes to Cal.com with the reason and marks the entry (kept, not removed), a
// booking Cal.com no longer knows still gets marked; reschedule goes to Cal.com, the entry takes the
// NEW uid, title, time and link at once; Cal.com refusing is a 409; both are logged; the slots for
// a reschedule carry the booking's uid, which must be one of ours. Part 12 (2026-10-14): both
// tell the deal's assignee (else the contact's), not the member who did it.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const KEY = 'cal_live_0123456789abcdef0123456789abcdef', WID = 7;
const TYPES = [{ id: 7, slug: '30min', title: '30 Minuten', lengthInMinutes: 30, hidden: false, ownerId: 42, locations: [] }];
const state = {};
let calcom, ROW;
function reset() {
  Object.assign(state, { calls: [], logs: [], told: [], row: { ...ROW },
    deals: [{ id: 12, workspace_id: WID, assigned_to: 3 }], contacts: [{ id: 5, workspace_id: WID, assigned_to: 4 }],
    users: [{ id: 3, workspace_id: WID, timezone: 'Asia/Manila' }, { id: 4, workspace_id: WID, timezone: 'Europe/Berlin' }],
    activities: [
      { id: 50, workspace_id: WID, source: 'calcom', calcom_uid: 'bk_1', calcom_event_type_id: 7, contact_id: 5, deal_id: 12, content: 'T\nhttps://app.cal.com/video/bk_1', event_date: '2026-10-20', event_time: '14:00', event_tz: 'Europe/Berlin', cancelled_at: null },
      { id: 51, workspace_id: WID, source: 'calcom', calcom_uid: 'bk_9', calcom_event_type_id: 7, contact_id: 5, deal_id: null, content: 'old', cancelled_at: '2026-10-01T00:00:00.000Z' },
      { id: 52, workspace_id: WID, source: 'user', calcom_uid: null, contact_id: 5, deal_id: null, content: 'a note', cancelled_at: null },
      { id: 60, workspace_id: 8, source: 'calcom', calcom_uid: 'bk_other', contact_id: 9, deal_id: null, content: 'x', cancelled_at: null },
    ] });
}
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (/FROM workspace_calcom c LEFT JOIN users u/.test(q)) return { rows: state.row ? [{ ...state.row, connected_by_name: 'Olaf' }] : [] };
    if (q.startsWith('SELECT id, contact_id, deal_id, content, calcom_uid, calcom_event_type_id, cancelled_at, event_date, event_time, event_tz FROM activities WHERE id=$1 AND workspace_id=$2 AND source=\'calcom\'')) return { rows: state.activities.filter(a => a.id === params[0] && a.workspace_id === params[1] && a.source === 'calcom').map(a => ({ ...a })) };   // a snapshot, as Postgres hands one back
    if (q.startsWith('SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2')) return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]).map(d => ({ assigned_to: d.assigned_to })) };
    if (q.startsWith('SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2')) return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]).map(c => ({ assigned_to: c.assigned_to })) };
    if (q.startsWith('SELECT id, timezone FROM users WHERE id=$1 AND workspace_id=$2')) return { rows: state.users.filter(u => u.id === params[0] && u.workspace_id === params[1]) };
    if (q.startsWith('SELECT id FROM activities WHERE workspace_id=$1 AND calcom_uid=$2')) return { rows: state.activities.filter(a => a.workspace_id === params[0] && a.calcom_uid === params[1]).map(a => ({ id: a.id })) };
    if (q.startsWith('UPDATE activities SET cancelled_at=NOW() WHERE id=$1 AND workspace_id=$2 RETURNING cancelled_at')) { const a = state.activities.find(x => x.id === params[0] && x.workspace_id === params[1]); if (!a) return { rows: [] }; a.cancelled_at = '2026-10-13T10:00:00.000Z'; return { rows: [{ cancelled_at: a.cancelled_at }] }; }
    if (q.startsWith('UPDATE activities SET calcom_uid=$1, content=$2, event_date=$3, event_time=$4, event_tz=$5, cancelled_at=NULL, calcom_event_type_id=COALESCE($6, calcom_event_type_id) WHERE id=$7 AND workspace_id=$8')) { const a = state.activities.find(x => x.id === params[6] && x.workspace_id === params[7]); if (a) Object.assign(a, { calcom_uid: params[0], content: params[1], event_date: params[2], event_time: params[3], event_tz: params[4], cancelled_at: null, calcom_event_type_id: params[5] ?? a.calcom_event_type_id }); return { rowCount: a ? 1 : 0, rows: [] }; }
    if (q.startsWith('INSERT INTO webhook_logs')) { state.logs.push({ status: params[1], payload: JSON.parse(params[2]), captured: JSON.parse(params[3]), contact_id: params[4], deal_id: params[5] }); return { rows: [] }; }
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
    const r = k ? plan[k] : { status: 404, body: { status: 'error', error: { message: 'no such route' } } };
    if (r.throw) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
const CAL_OK = {
  'https://api.cal.com/v2/bookings/bk_1/cancel': { status: 200, body: { status: 'success', data: { uid: 'bk_1', status: 'cancelled', cancellationReason: 'Krank' } } },
  'https://api.cal.com/v2/bookings/bk_1/reschedule': { status: 201, body: { status: 'success', data: { uid: 'bk_2', title: 'T neu', start: '2026-10-21T09:00:00Z', end: '2026-10-21T09:30:00Z', status: 'accepted', eventTypeId: 7, rescheduledFromUid: 'bk_1', location: 'https://meet.google.com/x' } } },
  'https://api.cal.com/v2/slots': { status: 200, body: { status: 'success', data: {} } },
};
let member;
const envSaved = {};
before(async () => {
  for (const k of ['SESSION_SECRET', 'CALCOM_ENCRYPTION_KEY', 'CALCOM_API_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'meeting-test-secret';
  calcom = require(path.join(ROOT, 'utils', 'calcom.js'));
  ROW = { id: 1, workspace_id: WID, api_key_sealed: calcom.sealKey(KEY), cal_user_id: 42, cal_email: 'mara@example.de', cal_name: 'Mara Kühn', cal_timezone: 'Europe/Berlin', event_types: TYPES, event_type_id: 7, receive_token: 't'.repeat(40), webhook_secret: 's'.repeat(64), webhook_id: 'wh_1', connected_by: 1 };
  member = await serve({ '/api/integrations': loadRoute('integrations.js', { pool, user: { id: 2, workspaceId: WID, role: 'member', timezone: 'Europe/Berlin' }, notifications: { notify() {}, notifyUser: async (...args) => { state.told.push(args); return true; } } }) });
});
after(async () => { await member.close(); globalThis.fetch = realFetch; for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; } });
beforeEach(() => { reset(); fakeCal(CAL_OK); process.env.SESSION_SECRET = 'meeting-test-secret'; });

describe('POST /api/integrations/calcom/cancel', () => {
  test('what qualifies: no id 400; a note, another workspace\'s meeting or an unknown id 404; an already cancelled meeting 409; Cal.com is not asked for any of them', async () => {
    assert.equal((await member.request('POST', '/api/integrations/calcom/cancel', {})).status, 400);
    for (const id of [52, 60, 999]) assert.equal((await member.request('POST', '/api/integrations/calcom/cancel', { activity_id: id })).status, 404, String(id));
    assert.equal((await member.request('POST', '/api/integrations/calcom/cancel', { activity_id: 51 })).status, 409);
    assert.equal(fetchCalls.length, 0); assert.equal(state.logs.length, 0);
  });
  test('a member cancels a meeting: Cal.com gets the uid and the reason, the entry is marked and kept, the delivery is logged', async () => {
    const r = await member.request('POST', '/api/integrations/calcom/cancel', { activity_id: 50, reason: ' Krank ' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(fetchCalls[0].url, 'https://api.cal.com/v2/bookings/bk_1/cancel'); assert.equal(fetchCalls[0].method, 'POST'); assert.equal(fetchCalls[0].headers.Authorization, `Bearer ${KEY}`); assert.deepEqual(fetchCalls[0].body, { cancellationReason: 'Krank' });
    assert.deepEqual(r.body, { success: true, activity: { id: 50, cancelled_at: '2026-10-13T10:00:00.000Z', calcom_uid: 'bk_1' }, gone: false, told: 3 });
    const a = state.activities.find(x => x.id === 50); assert.ok(a.cancelled_at, 'marked'); assert.equal(state.activities.length, 4, 'kept');
    assert.deepEqual(state.told, [[WID, 2, 3, { type: 'meeting_cancelled', category: 'activities', title: 'T', body: '20.10.2026, 20:00 (Asia/Manila), Cal Video', entityType: 'deal', entityId: 12 }]], 'the deal\'s assignee is told, on their clock (the entry\'s wall clock in the host\'s zone, converted), with the link\'s app; the member who cancelled is the actor'); assert.equal(state.logs[0].captured.told, 3);
    const l = state.logs[0]; assert.equal(l.status, 'success'); assert.equal(l.captured.trigger, 'CANCELLED_FROM_CRM'); assert.equal(l.captured.uid, 'bk_1'); assert.equal(l.captured.reason, 'Krank'); assert.equal(l.captured.cancelled_by, 2); assert.equal(l.contact_id, 5); assert.equal(l.deal_id, 12);
  });
  test('Cal.com no longer knows the booking: the entry is still marked (gone: true); Cal.com refusing: 409, nothing marked; unreachable: 502', async () => {
    fakeCal({ 'https://api.cal.com/v2/bookings/bk_1/cancel': { status: 404, body: { status: 'error', error: { message: 'Booking not found' } } } });
    const r = await member.request('POST', '/api/integrations/calcom/cancel', { activity_id: 50 });
    assert.equal(r.status, 200); assert.equal(r.body.gone, true); assert.ok(state.activities.find(x => x.id === 50).cancelled_at);
    reset(); fakeCal({ 'https://api.cal.com/v2/bookings/bk_1/cancel': { status: 400, body: { status: 'error', error: { message: 'cannot cancel a past booking' } } } });
    const r2 = await member.request('POST', '/api/integrations/calcom/cancel', { activity_id: 50 });
    assert.equal(r2.status, 409); assert.match(r2.body.error, /did not accept the cancellation: cannot cancel a past booking/); assert.equal(state.activities.find(x => x.id === 50).cancelled_at, null); assert.equal(state.logs.length, 0);
    reset(); fakeCal({ 'https://api.cal.com/v2/bookings/bk_1/cancel': { throw: true } });
    assert.equal((await member.request('POST', '/api/integrations/calcom/cancel', { activity_id: 50 })).status, 502);
  });
});

describe('POST /api/integrations/calcom/reschedule', () => {
  test('a member moves a meeting: Cal.com gets the uid and the new start; the entry takes the new uid, title, time in the host\'s zone and link at once; logged with the old uid', async () => {
    const r = await member.request('POST', '/api/integrations/calcom/reschedule', { activity_id: 50, start: '2026-10-21T09:00:00Z' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(fetchCalls[0].url, 'https://api.cal.com/v2/bookings/bk_1/reschedule'); assert.deepEqual(fetchCalls[0].body, { start: '2026-10-21T09:00:00.000Z' });
    const a = state.activities.find(x => x.id === 50);
    assert.equal(a.calcom_uid, 'bk_2'); assert.equal(a.event_date, '2026-10-21'); assert.equal(a.event_time, '11:00'); assert.equal(a.event_tz, 'Europe/Berlin'); assert.equal(a.content, 'T neu\nhttps://meet.google.com/x'); assert.equal(a.cancelled_at, null);
    assert.equal(r.body.activity.calcom_uid, 'bk_2'); assert.equal(r.body.activity.event_time, '11:00'); assert.equal(r.body.booking.rescheduled_from, 'bk_1'); assert.equal(r.body.booking.uid, 'bk_2');
    assert.equal(r.body.told, 3); assert.deepEqual(state.told, [[WID, 2, 3, { type: 'meeting_moved', category: 'activities', title: 'T neu', body: '21.10.2026, 17:00 (Asia/Manila), Google Meet', entityType: 'deal', entityId: 12 }]], 'told of the new time and the new link');
    const l = state.logs[0]; assert.equal(l.captured.trigger, 'RESCHEDULED_FROM_CRM'); assert.equal(l.captured.rescheduled_from, 'bk_1'); assert.equal(l.captured.uid, 'bk_2'); assert.equal(l.captured.rescheduled_by, 2);
  });
  test('a bad start is 400; a cancelled meeting 409; a note 404; Cal.com refusing the time 409 with nothing moved', async () => {
    assert.equal((await member.request('POST', '/api/integrations/calcom/reschedule', { activity_id: 50, start: 'morgen' })).status, 400);
    assert.equal((await member.request('POST', '/api/integrations/calcom/reschedule', { activity_id: 51, start: '2026-10-21T09:00:00Z' })).status, 409);
    assert.equal((await member.request('POST', '/api/integrations/calcom/reschedule', { activity_id: 52, start: '2026-10-21T09:00:00Z' })).status, 404);
    assert.equal(fetchCalls.length, 0);
    fakeCal({ 'https://api.cal.com/v2/bookings/bk_1/reschedule': { status: 400, body: { status: 'error', error: { message: 'Slot is no longer available' } } } });
    const r = await member.request('POST', '/api/integrations/calcom/reschedule', { activity_id: 50, start: '2026-10-21T09:00:00Z' });
    assert.equal(r.status, 409); assert.match(r.body.error, /did not accept the new time/); assert.equal(state.activities.find(x => x.id === 50).calcom_uid, 'bk_1');
  });
});

describe('GET /api/integrations/calcom/slots?reschedule_uid=', () => {
  test('the booking\'s uid goes to Cal.com so its own slot counts as free; a uid that is not ours is 404', async () => {
    const r = await member.request('GET', '/api/integrations/calcom/slots?reschedule_uid=bk_1');
    assert.equal(r.status, 200); assert.equal(new URL(fetchCalls[0].url).searchParams.get('bookingUidToReschedule'), 'bk_1');
    assert.equal((await member.request('GET', '/api/integrations/calcom/slots?reschedule_uid=bk_other')).status, 404, 'another workspace\'s booking');
    assert.equal((await member.request('GET', '/api/integrations/calcom/slots?reschedule_uid=nope')).status, 404);
  });
});
