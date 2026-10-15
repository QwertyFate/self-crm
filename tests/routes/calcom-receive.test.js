// ROUTE tests for POST /api/integrations/calcom/receive/:token (Cal.com integration,
// Step 2 piece 2, 2026-10-13): the public, signed booking receiver. Served the way
// server.js serves it — express.raw on this path BEFORE the global json(), so the
// signature is checked over the exact bytes Cal.com sent — over a fake pool that
// keeps contacts, deals, activities and the log in memory. Pinned: the token names
// the workspace; a missing or wrong signature is a 401 that is logged; a created
// booking becomes one 'meeting' activity in the host's wall clock with the host's
// zone, owned by the host's CRM user (else by whoever connected); our own metadata
// names contact and deal; an unknown attendee creates the contact and a deal by
// the lead webhook's settings, else the first pipeline's first stage, else no
// deal; a repeated delivery lands on the same row; a reschedule moves the entry
// by the old uid (or creates it); a cancellation marks the entry and keeps it;
// other triggers are ignored; every delivery is logged with source calcom. Part 12
// (2026-10-14): what happened on Cal.com's page is announced to the deal's assignee
// (else the contact's): a NEW booking, a move that still found the old uid, a
// cancellation that still found a live row; never twice, never for what the CRM did.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path    = require('path');
const express = require('express');
const { loadRoute, ROOT } = require('../helpers/load-route');
const cal = require(path.join(ROOT, 'utils', 'calcom.js'));

const TOKEN = 't'.repeat(40), SECRET = 's'.repeat(64), WID = 7;
const CONN = { id: 1, workspace_id: WID, receive_token: TOKEN, webhook_secret: SECRET, connected_by: 1, cal_timezone: 'Europe/Berlin', api_key_sealed: 'v1.x.y.z' };

const state = {};
function reset() {
  Object.assign(state, {
    calls: [], logs: [], told: [], nextId: 100,
    contacts: [{ id: 5, workspace_id: WID, name: 'Jana Weber', email: 'jana.weber@example.de', assigned_to: 4 }],
    users: [{ id: 2, workspace_id: WID, email: 'mara@example.de', timezone: 'Europe/Berlin' }, { id: 3, workspace_id: WID, email: 'tim@example.de', timezone: 'Asia/Manila' }, { id: 4, workspace_id: WID, email: 'lea@example.de', timezone: 'Europe/Berlin' }],
    deals: [{ id: 12, workspace_id: WID, contact_id: 5, assigned_to: 3 }],
    activities: [],
    webhook: { pipeline_id: 3, stage_id: 9, default_assignee_id: 4 },
    pipelines: [{ id: 2, workspace_id: WID }], stages: [{ id: 8, pipeline_id: 2 }, { id: 9, pipeline_id: 3 }],
  });
}
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (q.startsWith('SELECT * FROM workspace_calcom WHERE receive_token=$1')) return { rows: params[0] === TOKEN ? [CONN] : [] };
    if (q.startsWith('SELECT id, name FROM contacts WHERE id=$1 AND workspace_id=$2')) return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]) };
    if (q.startsWith('SELECT id, name FROM contacts WHERE workspace_id=$1 AND email=$2')) return { rows: state.contacts.filter(c => c.workspace_id === params[0] && c.email === params[1]) };
    if (q.startsWith('SELECT pipeline_id, stage_id, default_assignee_id FROM workspace_webhook')) return { rows: state.webhook ? [state.webhook] : [] };
    if (q.startsWith('INSERT INTO contacts')) { const c = { id: state.nextId++, workspace_id: params[0], name: params[1], email: params[2], assigned_to: params[3] }; state.contacts.push(c); return { rows: [{ id: c.id, name: c.name }] }; }
    if (q.startsWith('SELECT id FROM pipelines WHERE workspace_id=$1')) return { rows: state.pipelines.filter(p => p.workspace_id === params[0]).slice(0, 1) };
    if (q.startsWith('SELECT id FROM pipeline_stages WHERE pipeline_id=$1')) return { rows: state.stages.filter(s => s.pipeline_id === params[0]).slice(0, 1) };
    if (q.startsWith('INSERT INTO deals')) { const d = { id: state.nextId++, workspace_id: params[0], contact_id: params[1], pipeline_id: params[2], stage_id: params[3], title: params[4] }; state.deals.push(d); return { rows: [{ id: d.id }] }; }
    if (q.startsWith('SELECT id FROM deals WHERE id=$1 AND workspace_id=$2')) return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]).map(d => ({ id: d.id })) };
    if (q.startsWith('SELECT id FROM users WHERE workspace_id=$1 AND LOWER(email)=$2')) return { rows: state.users.filter(u => u.workspace_id === params[0] && u.email === params[1]).map(u => ({ id: u.id })) };
    if (q.startsWith('SELECT id, timezone FROM users WHERE id=$1 AND workspace_id=$2')) return { rows: state.users.filter(u => u.id === params[0] && u.workspace_id === params[1]).map(u => ({ id: u.id, timezone: u.timezone })) };
    if (q.startsWith('SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2')) return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]).map(d => ({ assigned_to: d.assigned_to ?? null })) };
    if (q.startsWith('SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2')) return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]).map(c => ({ assigned_to: c.assigned_to ?? null })) };
    if (q.startsWith('INSERT INTO activities')) {
      const hit = state.activities.find(a => a.workspace_id === params[0] && a.calcom_uid === params[8]);
      if (hit) { Object.assign(hit, { content: params[3], event_date: params[5], event_time: params[6], event_tz: params[7], cancelled_at: null }); return { rows: [{ id: hit.id, inserted: false }] }; }   // xmax = 0 only on a fresh row
      const a = { id: state.nextId++, workspace_id: params[0], contact_id: params[1], deal_id: params[2], content: params[3], created_by: params[4], event_date: params[5], event_time: params[6], event_tz: params[7], calcom_uid: params[8], type: 'meeting', source: 'calcom', cancelled_at: null };
      state.activities.push(a); return { rows: [{ id: a.id, inserted: true }] };
    }
    if (q.startsWith('UPDATE activities SET calcom_uid=$1')) {
      const hit = state.activities.find(a => a.workspace_id === params[5] && a.calcom_uid === params[6]);
      if (!hit) return { rows: [] };
      Object.assign(hit, { calcom_uid: params[0], content: params[1], event_date: params[2], event_time: params[3], event_tz: params[4], cancelled_at: null });
      return { rows: [{ id: hit.id, contact_id: hit.contact_id, deal_id: hit.deal_id }] };
    }
    if (q.startsWith('UPDATE activities SET cancelled_at=NOW()')) {
      const hit = state.activities.find(a => a.workspace_id === params[0] && a.calcom_uid === params[1] && !a.cancelled_at);
      if (!hit) return { rows: [] };
      hit.cancelled_at = '2026-10-13T10:00:00.000Z';
      return { rows: [{ id: hit.id, contact_id: hit.contact_id, deal_id: hit.deal_id, content: hit.content, event_date: hit.event_date, event_time: hit.event_time, event_tz: hit.event_tz }] };
    }
    if (q.startsWith('INSERT INTO webhook_logs')) { state.logs.push({ workspace_id: params[0], status: params[1], payload: params[2], captured: JSON.parse(params[3]), contact_id: params[4], deal_id: params[5], error: params[6], sql: q }); return { rows: [] }; }
    return { rows: [] };
  },
};

// The app the way server.js builds it for this path: raw bytes first, then json for the rest.
async function serveLikeServer(router, { raw = true } = {}) {
  const app = express();
  if (raw) app.use('/api/integrations/calcom/receive', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json());
  app.use('/api/integrations', router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async post(token, rawBody, headers = {}) {
      const res = await fetch(`${base}/api/integrations/calcom/receive/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: rawBody });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, body: json };
    },
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}
const signed = (body, secret = SECRET) => { const raw = typeof body === 'string' ? body : JSON.stringify(body); return [raw, { 'x-cal-signature-256': cal.signBody(secret, Buffer.from(raw)) }]; };

const BOOKING = {
  triggerEvent: 'BOOKING_CREATED', createdAt: '2026-10-13T08:00:00.000Z',
  payload: {
    title: '30 Minuten zwischen Mara Kühn und Jana Weber', startTime: '2026-10-20T13:00:00Z', endTime: '2026-10-20T13:30:00Z',
    organizer: { name: 'Mara Kühn', email: 'Mara@Example.de', timeZone: 'Europe/Berlin' },
    attendees: [{ email: 'Jana.Weber@example.de', name: 'Jana Weber', timeZone: 'Europe/Berlin' }],
    uid: 'bFJeNb2uX8ANpT3JL5EfXw', eventTypeId: 7, metadata: { videoCallUrl: 'https://app.cal.com/video/x' }, status: 'ACCEPTED',
  },
};
const withPayload = (extra, trigger = 'BOOKING_CREATED') => ({ ...BOOKING, triggerEvent: trigger, payload: { ...BOOKING.payload, ...extra } });

let srv;
before(async () => { srv = await serveLikeServer(loadRoute('integrations.js', { pool, notifications: { notify() {}, notifyUser: async (...args) => { state.told.push(args); return true; } } })); });
after(async () => { await srv.close(); });
beforeEach(reset);

describe('the door', () => {
  test('an unknown token is a 404 and nothing is logged', async () => {
    const [raw, h] = signed(BOOKING);
    const r = await srv.post('x'.repeat(40), raw, h);
    assert.equal(r.status, 404); assert.equal(state.logs.length, 0); assert.equal(state.activities.length, 0);
  });
  test('no signature, a wrong signature, a signature under another secret: 401, logged as an error with source calcom, nothing written', async () => {
    const [raw] = signed(BOOKING);
    for (const h of [{}, { 'x-cal-signature-256': 'ab'.repeat(32) }, signed(BOOKING, 'z'.repeat(64))[1]]) {
      const r = await srv.post(TOKEN, raw, h);
      assert.equal(r.status, 401); assert.equal(r.body.error, 'Bad signature');
    }
    assert.equal(state.logs.length, 3);
    for (const l of state.logs) { assert.equal(l.status, 'error'); assert.match(l.sql, /VALUES \(\$1,'calcom',/); assert.equal(l.error, 'Signature missing or wrong'); assert.equal(l.payload, null); }
    assert.equal(state.activities.length, 0);
  });
  test('the signature is checked over the raw bytes: a pretty-printed body verifies here, and would not through a re-serialising parser', async () => {
    const pretty = JSON.stringify(BOOKING, null, 2);
    const [raw, h] = signed(pretty);
    const r = await srv.post(TOKEN, raw, h);
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.success, true);
    const plain = await serveLikeServer(loadRoute('integrations.js', { pool }), { raw: false });
    try { const r2 = await plain.post(TOKEN, raw, h); assert.equal(r2.status, 401, 'without express.raw the bytes differ and the signature fails: that is why server.js mounts it'); }
    finally { await plain.close(); }
  });
  test('triggers this app does not handle are acknowledged and ignored, not logged', async () => {
    const [raw, h] = signed({ triggerEvent: 'MEETING_ENDED', uid: 'x' });
    const r = await srv.post(TOKEN, raw, h);
    assert.equal(r.status, 200); assert.deepEqual(r.body, { ignored: 'MEETING_ENDED' }); assert.equal(state.logs.length, 0);
  });
  test('a booking without a uid is a 422, logged', async () => {
    const [raw, h] = signed(withPayload({ uid: null }));
    const r = await srv.post(TOKEN, raw, h);
    assert.equal(r.status, 422); assert.equal(state.logs[0].error, 'Booking without uid');
  });
});

describe('BOOKING_CREATED', () => {
  test('a known contact (by email, case-insensitive) and a known host: one meeting in the host\'s wall clock, owned by the host, logged', async () => {
    const [raw, h] = signed(BOOKING);
    const r = await srv.post(TOKEN, raw, h);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { success: true, trigger: 'BOOKING_CREATED', activity_id: 100, contact_id: 5, deal_id: null, created_contact: false, created_deal: false });
    const ins = state.calls.find(c => c.sql.startsWith('INSERT INTO activities'));
    assert.match(ins.sql, /VALUES \(\$1,\$2,\$3,'meeting',\$4,\$5,\$6,\$7,\$8,'calcom',\$9,\$10\)/);
    assert.match(ins.sql, /ON CONFLICT \(workspace_id, calcom_uid\) WHERE calcom_uid IS NOT NULL DO UPDATE SET content=EXCLUDED\.content, event_date=EXCLUDED\.event_date, event_time=EXCLUDED\.event_time, event_tz=EXCLUDED\.event_tz, cancelled_at=NULL/, 'a repeated delivery lands on the same row');
    assert.deepEqual(ins.params, [WID, 5, null, '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://app.cal.com/video/x', 2, '2026-10-20', '15:00', 'Europe/Berlin', 'bFJeNb2uX8ANpT3JL5EfXw', 7], 'the video link on the second line; the booking\'s event type kept for a reschedule');
    assert.equal(state.contacts.length, 1, 'no contact created'); assert.equal(state.deals.length, 1, 'no deal created');
    const l = state.logs[0];
    assert.equal(l.status, 'success'); assert.equal(l.contact_id, 5); assert.equal(l.deal_id, null);
    assert.deepEqual(l.captured, { trigger: 'BOOKING_CREATED', uid: 'bFJeNb2uX8ANpT3JL5EfXw', title: '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://app.cal.com/video/x', event_date: '2026-10-20', event_time: '15:00', event_tz: 'Europe/Berlin', attendee: 'jana.weber@example.de', contact_id: 5, deal_id: null, created_contact: false, created_deal: false, told: 4 });
    assert.equal(JSON.parse(l.payload).payload.uid, 'bFJeNb2uX8ANpT3JL5EfXw', 'the whole delivery is kept');
  });
  test('our own metadata names the contact and the deal (a booking made from the CRM); a deal of another workspace is ignored', async () => {
    const [raw, h] = signed(withPayload({ metadata: { upgrads_contact_id: 5, upgrads_deal_id: 12 }, attendees: [{ email: 'other@example.de', name: 'Other' }] }));
    const r = await srv.post(TOKEN, raw, h);
    assert.equal(r.body.contact_id, 5); assert.equal(r.body.deal_id, 12); assert.equal(r.body.created_contact, false);
    assert.equal(state.calls.filter(c => c.sql.startsWith('SELECT id, name FROM contacts WHERE workspace_id=$1 AND email=$2')).length, 0, 'no email lookup when our metadata says who');
    state.calls.length = 0;
    const [raw2, h2] = signed(withPayload({ uid: 'u2', metadata: { upgrads_contact_id: 5, upgrads_deal_id: 999 } }));
    assert.equal((await srv.post(TOKEN, raw2, h2)).body.deal_id, null);
  });
  test('an unknown attendee: the contact is created with the lead webhook\'s assignee, a deal in its pipeline and stage, the meeting on both, then logged', async () => {
    const [raw, h] = signed(withPayload({ uid: 'u3', attendees: [{ email: 'Neu@Example.de', name: 'Neue Kundin' }] }));
    const r = await srv.post(TOKEN, raw, h);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.created_contact, true); assert.equal(r.body.created_deal, true);
    const c = state.contacts.find(x => x.email === 'neu@example.de');
    assert.ok(c, 'contact created, email lower-cased'); assert.equal(c.name, 'Neue Kundin'); assert.equal(c.assigned_to, 4, 'the lead webhook\'s default assignee');
    const d = state.deals.find(x => x.contact_id === c.id);
    assert.ok(d); assert.equal(d.pipeline_id, 3); assert.equal(d.stage_id, 9); assert.equal(d.title, 'Neue Kundin');
    assert.equal(r.body.contact_id, c.id); assert.equal(r.body.deal_id, d.id);
    const a = state.activities[0]; assert.equal(a.contact_id, c.id); assert.equal(a.deal_id, d.id);
    assert.deepEqual([state.logs[0].contact_id, state.logs[0].deal_id, state.logs[0].captured.created_contact, state.logs[0].captured.created_deal], [c.id, d.id, true, true]);
  });
  test('an unknown attendee with no lead webhook settings: the first pipeline\'s first stage; with no pipeline at all: the contact only', async () => {
    state.webhook = null;
    const [raw, h] = signed(withPayload({ uid: 'u4', attendees: [{ email: 'a@example.de', name: 'A' }] }));
    const r = await srv.post(TOKEN, raw, h);
    const d = state.deals.find(x => x.title === 'A'); assert.ok(d); assert.equal(d.pipeline_id, 2); assert.equal(d.stage_id, 8);
    assert.equal(state.contacts.find(x => x.email === 'a@example.de').assigned_to, 1, 'assigned to whoever connected Cal.com');
    state.pipelines = []; state.deals = [];
    const [raw2, h2] = signed(withPayload({ uid: 'u5', attendees: [{ email: 'b@example.de', name: 'B' }] }));
    const r2 = await srv.post(TOKEN, raw2, h2);
    assert.equal(r2.body.created_contact, true); assert.equal(r2.body.created_deal, false); assert.equal(r2.body.deal_id, null); assert.equal(state.deals.length, 0);
  });
  test('a host without a CRM user: the entry belongs to whoever connected Cal.com; no zone on the host: the connection\'s zone', async () => {
    const [raw, h] = signed(withPayload({ uid: 'u6', organizer: { name: 'Gast', email: 'gast@example.de' } }));
    await srv.post(TOKEN, raw, h);
    const a = state.activities[0]; assert.equal(a.created_by, 1); assert.equal(a.event_tz, 'Europe/Berlin'); assert.equal(a.event_time, '15:00');
  });
  test('the same delivery twice: one row, the second answer carries the same activity id', async () => {
    const [raw, h] = signed(BOOKING);
    const a = await srv.post(TOKEN, raw, h), b = await srv.post(TOKEN, raw, h);
    assert.equal(a.body.activity_id, b.body.activity_id); assert.equal(state.activities.length, 1); assert.equal(state.logs.length, 2);
  });
});

describe('BOOKING_RESCHEDULED and BOOKING_CANCELLED', () => {
  test('a reschedule moves the entry by the old uid, gives it the new uid and clears a cancellation; an unseen booking is created instead', async () => {
    await srv.post(TOKEN, ...signed(BOOKING));
    const [raw, h] = signed(withPayload({ uid: 'newUid', rescheduleUid: 'bFJeNb2uX8ANpT3JL5EfXw', startTime: '2026-10-21T09:00:00Z', endTime: '2026-10-21T09:30:00Z' }, 'BOOKING_RESCHEDULED'));
    const r = await srv.post(TOKEN, raw, h);
    assert.deepEqual(r.body, { success: true, trigger: 'BOOKING_RESCHEDULED', activity_id: 100, contact_id: 5, deal_id: null });
    const a = state.activities[0];
    assert.equal(state.activities.length, 1); assert.equal(a.calcom_uid, 'newUid'); assert.equal(a.event_date, '2026-10-21'); assert.equal(a.event_time, '11:00'); assert.equal(a.cancelled_at, null);
    assert.equal(state.logs[1].captured.rescheduled_from, 'bFJeNb2uX8ANpT3JL5EfXw');
    const [raw2, h2] = signed(withPayload({ uid: 'fresh', rescheduleUid: 'never-seen' }, 'BOOKING_RESCHEDULED'));
    const r2 = await srv.post(TOKEN, raw2, h2);
    assert.equal(r2.body.trigger, 'BOOKING_RESCHEDULED'); assert.equal(r2.body.created_contact, false); assert.equal(state.activities.length, 2, 'created, since there was nothing to move');
  });
  test('a cancellation marks the entry and keeps it; a second cancellation or an unknown uid finds nothing and still answers 200', async () => {
    await srv.post(TOKEN, ...signed(BOOKING));
    const [raw, h] = signed(withPayload({ status: 'CANCELLED', cancellationReason: 'Krank' }, 'BOOKING_CANCELLED'));
    const r = await srv.post(TOKEN, raw, h);
    assert.deepEqual(r.body, { success: true, trigger: 'BOOKING_CANCELLED', activity_id: 100, found: true });
    assert.equal(state.activities.length, 1, 'kept'); assert.ok(state.activities[0].cancelled_at, 'marked');
    const upd = state.calls.find(c => c.sql.startsWith('UPDATE activities SET cancelled_at=NOW()'));
    assert.match(upd.sql, /WHERE workspace_id=\$1 AND calcom_uid=\$2 AND cancelled_at IS NULL RETURNING id, contact_id, deal_id/); assert.deepEqual(upd.params, [WID, 'bFJeNb2uX8ANpT3JL5EfXw']);
    assert.deepEqual([state.logs[1].captured.found, state.logs[1].captured.reason, state.logs[1].contact_id], [true, 'Krank', 5]);
    const again = await srv.post(TOKEN, raw, h);
    assert.deepEqual(again.body, { success: true, trigger: 'BOOKING_CANCELLED', activity_id: null, found: false });
  });
});

describe('server.js', () => {
  test('the receiver path gets the raw body before the global json parser, and both webhook limits', () => {
    const s = require('fs').readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    const iRaw = s.indexOf("app.use('/api/integrations/calcom/receive', express.raw({ type: '*/*', limit: '1mb' }));");
    const iJson = s.indexOf('app.use(express.json());');
    assert.ok(iRaw > 0 && iRaw < iJson, 'raw before json');
    assert.match(s, /const calcomTokenLimiter = rateLimit\(\{\s*windowMs: 60 \* 1000, max: 120,[\s\S]*?keyGenerator: \(req\) => req\.path \|\| 'unknown',\s*\}\);/);
    const iLim = s.indexOf("app.use('/api/integrations/calcom/receive', webhookIpLimiter, calcomTokenLimiter);");
    const iMount = s.indexOf("app.use('/api/integrations',  require('./routes/integrations'));");
    assert.ok(iLim > 0 && iLim < iMount, 'limited before the router is mounted');
  });
  test('GET /logs stays a lead log; GET /calcom/logs is the Cal.com log', () => {
    const r = require('fs').readFileSync(path.join(ROOT, 'routes', 'integrations.js'), 'utf8');
    assert.match(r, /WHERE l\.workspace_id=\$1 AND l\.source='lead'\s*ORDER BY l\.created_at DESC LIMIT 50/);
    assert.match(r, /router\.get\('\/calcom\/logs', requireAuth,[\s\S]*?WHERE l\.workspace_id=\$1 AND l\.source='calcom'\s*ORDER BY l\.created_at DESC LIMIT 30/);
    assert.match(r, /router\.post\('\/calcom\/receive\/:token', async \(req, res\) => \{/, 'no requireAuth on the receiver');
  });
});

// ── Part 12: what happened on Cal.com's page is announced to the assignee ─────
describe('telling the assignee (Part 12)', () => {
  const TOLD = (kind, who, body, entity) => [WID, null, who, { type: 'meeting_' + kind, category: 'activities', title: '30 Minuten zwischen Mara Kühn und Jana Weber', body, ...entity }];
  test('a new booking: the contact\'s assignee when there is no deal, on their clock; the deal\'s assignee when our metadata names a deal; no actor, so even the host would be told', async () => {
    let [raw, h] = signed(BOOKING);
    await srv.post(TOKEN, raw, h);
    assert.deepEqual(state.told, [TOLD('booked', 4, '20.10.2026, 15:00 (Europe/Berlin), Cal Video', { entityType: 'contact', entityId: 5 })]);
    reset();
    [raw, h] = signed(withPayload({ uid: 'u2', metadata: { upgrads_contact_id: 5, upgrads_deal_id: 12 }, location: 'integrations:google:meet', videoCallData: { url: 'https://meet.google.com/abc-defg-hij' } }));
    await srv.post(TOKEN, raw, h);
    assert.deepEqual(state.told, [TOLD('booked', 3, '20.10.2026, 21:00 (Asia/Manila), Google Meet', { entityType: 'deal', entityId: 12 })], 'the link in videoCallData is read; the deal\'s assignee, on Manila time');
    assert.equal(state.activities[0].content, '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://meet.google.com/abc-defg-hij', 'our metadata carries no link of its own, so the Google Meet link from videoCallData lands in the entry');
    reset(); state.deals[0].assigned_to = null; state.contacts[0].assigned_to = null;
    [raw, h] = signed(withPayload({ uid: 'u3', metadata: { upgrads_contact_id: 5, upgrads_deal_id: 12 } }));
    await srv.post(TOKEN, raw, h);
    assert.equal(state.told.length, 0, 'nobody responsible, nobody told'); assert.equal(state.logs[0].captured.told, null);
  });
  test('the same delivery twice tells once; a booking the CRM made (its row already there) is not announced again by its webhook', async () => {
    const [raw, h] = signed(BOOKING);
    await srv.post(TOKEN, raw, h); await srv.post(TOKEN, raw, h);
    assert.equal(state.told.length, 1);
    reset(); state.activities.push({ id: 77, workspace_id: WID, contact_id: 5, deal_id: 12, calcom_uid: BOOKING.payload.uid, content: 'booked from the CRM', cancelled_at: null });
    await srv.post(TOKEN, raw, h);
    assert.equal(state.told.length, 0, '/calcom/book told the assignee already; this delivery only fills in the link'); assert.equal(state.activities[0].content, '30 Minuten zwischen Mara Kühn und Jana Weber\nhttps://app.cal.com/video/x');
  });
  test('a move on Cal.com\'s page (the old uid still stands) is announced as moved, at the new time; one the CRM made first (the row already renamed) is not; an unknown booking moved is a new booking', async () => {
    state.activities.push({ id: 50, workspace_id: WID, contact_id: 5, deal_id: 12, calcom_uid: 'old', content: 'T\nhttps://app.cal.com/video/x', cancelled_at: null });
    let [raw, h] = signed(withPayload({ uid: 'new', rescheduleUid: 'old', startTime: '2026-10-21T08:00:00Z' }, 'BOOKING_RESCHEDULED'));
    await srv.post(TOKEN, raw, h);
    assert.deepEqual(state.told, [TOLD('moved', 3, '21.10.2026, 16:00 (Asia/Manila), Cal Video', { entityType: 'deal', entityId: 12 })]); assert.equal(state.logs[0].captured.told, 3);
    reset(); state.activities.push({ id: 50, workspace_id: WID, contact_id: 5, deal_id: 12, calcom_uid: 'new', content: 'T', cancelled_at: null });
    await srv.post(TOKEN, raw, h);
    assert.equal(state.told.length, 0, 'the CRM moved it: the row carries the new uid already, nothing to announce');
    reset();
    await srv.post(TOKEN, raw, h);
    assert.equal(state.told.length, 1); assert.equal(state.told[0][3].type, 'meeting_booked', 'never seen before: created, and announced as booked');
  });
  test('a cancellation on Cal.com\'s page is announced as cancelled; a booking the CRM cancelled already, or one nobody knows, is not', async () => {
    state.activities.push({ id: 50, workspace_id: WID, contact_id: 5, deal_id: null, calcom_uid: BOOKING.payload.uid, content: 'T\nhttps://meet.google.com/abc-defg-hij', event_date: '2026-10-20', event_time: '15:00', event_tz: 'Europe/Berlin', cancelled_at: null });
    let [raw, h] = signed(withPayload({ cancellationReason: 'Krank' }, 'BOOKING_CANCELLED'));
    await srv.post(TOKEN, raw, h);
    assert.deepEqual(state.told, [[WID, null, 4, { type: 'meeting_cancelled', category: 'activities', title: 'T', body: '20.10.2026, 15:00 (Europe/Berlin), Cal Video', entityType: 'contact', entityId: 5 }]], 'the entry\'s own title; the link the delivery carries outranks the entry\'s; the contact\'s assignee');
    reset(); state.activities.push({ id: 50, workspace_id: WID, contact_id: 5, deal_id: null, calcom_uid: BOOKING.payload.uid, content: 'T\nhttps://meet.google.com/abc-defg-hij', event_date: '2026-10-20', event_time: '15:00', event_tz: 'Europe/Berlin', cancelled_at: null });
    [raw, h] = signed(withPayload({ cancellationReason: 'Krank', metadata: {} }, 'BOOKING_CANCELLED'));
    await srv.post(TOKEN, raw, h);
    assert.equal(state.told[0][3].body, '20.10.2026, 15:00 (Europe/Berlin), Google Meet', 'a delivery without a link: the entry\'s own link names the app');
    reset(); state.activities.push({ id: 50, workspace_id: WID, contact_id: 5, deal_id: null, calcom_uid: BOOKING.payload.uid, content: 'T', cancelled_at: '2026-10-13T09:00:00.000Z' });
    await srv.post(TOKEN, raw, h);
    assert.equal(state.told.length, 0, 'cancelled from the CRM: that route told them');
    reset();
    await srv.post(TOKEN, raw, h);
    assert.equal(state.told.length, 0, 'unknown booking: nothing to tell');
  });
  test('an unknown attendee who books: the new contact\'s assignee (the lead webhook\'s) is told about the new deal', async () => {
    const [raw, h] = signed(withPayload({ uid: 'u9', attendees: [{ email: 'neu@example.de', name: 'Neue Kundin' }] }));
    const r = await srv.post(TOKEN, raw, h);
    assert.equal(state.told.length, 1); assert.deepEqual(state.told[0].slice(0, 3), [WID, null, 4]); assert.equal(state.told[0][3].entityType, 'deal'); assert.equal(state.told[0][3].entityId, r.body.deal_id);
  });
});
