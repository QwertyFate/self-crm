// ROUTE tests for POST /api/integrations/calendly/receive/:token and GET /calendly/logs
// (CALENDLY_CHANGES Part 2): the public, signed booking receiver. Served the way server.js serves
// it — express.raw on this path BEFORE the global json(), so the signature is checked over the
// exact bytes Calendly sent — over a fake pool that keeps contacts, deals, activities and the log
// in memory. Pinned: the token names the workspace; a missing, wrong or old signature is a 401
// that is logged; a created booking becomes one 'meeting' activity with source calendly, on the
// connected account's clock, owned by the host's CRM user (else by whoever connected); the
// invitee's email finds the contact, an unknown one creates the contact and a deal by the lead
// link's settings; a repeated delivery lands on the same row; a reschedule (canceled with
// rescheduled: true, then created with old_invitee) moves the entry in either order of arrival;
// a cancellation marks the entry and keeps it; other events are ignored; every delivery is
// logged with source calendly; the assignee is told once of what happened.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path    = require('path');
const express = require('express');
const { loadRoute, ROOT } = require('../helpers/load-route');
const cly = require(path.join(ROOT, 'utils', 'calendly.js'));

const TOKEN = 't'.repeat(40), SECRET = 's'.repeat(64), WID = 7;
const CONN = { id: 1, workspace_id: WID, receive_token: TOKEN, webhook_secret: SECRET, connected_by: 1, cly_timezone: 'Europe/Berlin', token_sealed: 'v1.x.y.z' };
const INV = n => `https://api.calendly.com/scheduled_events/EV${n}/invitees/INV${n}`;
const EV  = n => `https://api.calendly.com/scheduled_events/EV${n}`;

const state = {};
function reset() {
  Object.assign(state, {
    calls: [], logs: [], told: [], nextId: 100,
    contacts: [{ id: 5, workspace_id: WID, name: 'Jana Weber', email: 'Jana.Weber@example.de', assigned_to: 4 }],
    users: [{ id: 2, workspace_id: WID, email: 'mara@example.de', timezone: 'Europe/Berlin' }, { id: 4, workspace_id: WID, email: 'lea@example.de', timezone: 'Asia/Manila' }],
    deals: [{ id: 12, workspace_id: WID, contact_id: 5, assigned_to: 4 }],
    activities: [],
    webhook: { pipeline_id: 3, stage_id: 9, default_assignee_id: 4 },
    pipelines: [{ id: 2, workspace_id: WID }], stages: [{ id: 8, pipeline_id: 2 }, { id: 9, pipeline_id: 3 }],
  });
}
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (q === 'SELECT * FROM workspace_calendly WHERE receive_token=$1') return { rows: params[0] === TOKEN ? [CONN] : [] };
    if (q.startsWith('SELECT id, name FROM contacts WHERE workspace_id=$1 AND lower(email)=$2')) return { rows: state.contacts.filter(c => c.workspace_id === params[0] && String(c.email || '').toLowerCase() === params[1]) };
    if (q.startsWith('SELECT pipeline_id, stage_id, default_assignee_id FROM workspace_webhook')) return { rows: state.webhook ? [state.webhook] : [] };
    if (q.startsWith('INSERT INTO contacts')) { const c = { id: state.nextId++, workspace_id: params[0], name: params[1], email: params[2], assigned_to: params[3] }; state.contacts.push(c); return { rows: [{ id: c.id, name: c.name }] }; }
    if (q.startsWith('SELECT id FROM pipelines WHERE workspace_id=$1')) return { rows: state.pipelines.filter(p => p.workspace_id === params[0]).slice(0, 1) };
    if (q.startsWith('SELECT id FROM pipeline_stages WHERE pipeline_id=$1')) return { rows: state.stages.filter(s => s.pipeline_id === params[0]).slice(0, 1) };
    if (q.startsWith('INSERT INTO deals')) { const d = { id: state.nextId++, workspace_id: params[0], contact_id: params[1], pipeline_id: params[2], stage_id: params[3], title: params[4] }; state.deals.push(d); return { rows: [{ id: d.id }] }; }
    if (q.startsWith('SELECT id FROM users WHERE workspace_id=$1 AND LOWER(email)=$2')) return { rows: state.users.filter(u => u.workspace_id === params[0] && u.email === params[1]).map(u => ({ id: u.id })) };
    if (q.startsWith('SELECT id, timezone FROM users WHERE id=$1 AND workspace_id=$2')) return { rows: state.users.filter(u => u.id === params[0] && u.workspace_id === params[1]).map(u => ({ id: u.id, timezone: u.timezone })) };
    if (q.startsWith('SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2')) return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]).map(d => ({ assigned_to: d.assigned_to ?? null })) };
    if (q.startsWith('SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2')) return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]).map(c => ({ assigned_to: c.assigned_to ?? null })) };
    if (q.startsWith("INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calendly_uri, calendly_event_uri) VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calendly',$9,$10) ON CONFLICT (workspace_id, calendly_uri) WHERE calendly_uri IS NOT NULL DO UPDATE SET")) {
      assert.match(q, /RETURNING id, \(xmax = 0\) AS inserted$/);
      const hit = state.activities.find(a => a.workspace_id === params[0] && a.calendly_uri === params[8]);
      if (hit) { Object.assign(hit, { content: params[3], event_date: params[5], event_time: params[6], event_tz: params[7], cancelled_at: null }); return { rows: [{ id: hit.id, inserted: false }] }; }
      const a = { id: state.nextId++, workspace_id: params[0], contact_id: params[1], deal_id: params[2], content: params[3], created_by: params[4], event_date: params[5], event_time: params[6], event_tz: params[7], calendly_uri: params[8], calendly_event_uri: params[9], type: 'meeting', source: 'calendly', cancelled_at: null };
      state.activities.push(a); return { rows: [{ id: a.id, inserted: true }] };
    }
    if (q.startsWith('UPDATE activities SET calendly_uri=$1, calendly_event_uri=$2, content=$3, event_date=$4, event_time=$5, event_tz=$6, cancelled_at=NULL WHERE workspace_id=$7 AND calendly_uri=$8')) {
      const hit = state.activities.find(a => a.workspace_id === params[6] && a.calendly_uri === params[7]);
      if (!hit) return { rows: [] };
      Object.assign(hit, { calendly_uri: params[0], calendly_event_uri: params[1], content: params[2], event_date: params[3], event_time: params[4], event_tz: params[5], cancelled_at: null });
      return { rows: [{ id: hit.id, contact_id: hit.contact_id, deal_id: hit.deal_id }] };
    }
    if (q.startsWith('UPDATE activities SET cancelled_at=NOW() WHERE workspace_id=$1 AND calendly_uri=$2 AND cancelled_at IS NULL')) {
      const hit = state.activities.find(a => a.workspace_id === params[0] && a.calendly_uri === params[1] && !a.cancelled_at);
      if (!hit) return { rows: [] };
      hit.cancelled_at = '2026-11-12T10:00:00.000Z';
      return { rows: [{ id: hit.id, contact_id: hit.contact_id, deal_id: hit.deal_id, content: hit.content, event_date: hit.event_date, event_time: hit.event_time, event_tz: hit.event_tz }] };
    }
    if (q.startsWith("INSERT INTO webhook_logs (workspace_id, source, status, payload, captured, contact_id, deal_id, error) VALUES ($1,'calendly',")) { state.logs.push({ workspace_id: params[0], status: params[1], payload: params[2], captured: JSON.parse(params[3]), contact_id: params[4], deal_id: params[5], error: params[6] }); return { rows: [] }; }
    if (/FROM webhook_logs l LEFT JOIN contacts c ON c\.id = l\.contact_id WHERE l\.workspace_id=\$1 AND l\.source='calendly' ORDER BY l\.created_at DESC LIMIT 30/.test(q)) return { rows: state.logs.filter(l => l.workspace_id === params[0]).map((l, i) => ({ id: i + 1, status: l.status, captured: l.captured, error: l.error, created_at: 'now', contact_name: state.contacts.find(c => c.id === l.contact_id)?.name || null, contact_id: l.contact_id, deal_id: l.deal_id })) };
    throw new Error('unexpected SQL: ' + q);
  },
};

// The app the way server.js builds it for this path: raw bytes first, then json for the rest.
async function serveLikeServer(router) {
  const app = express();
  app.use('/api/integrations/calendly/receive', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json());
  app.use('/api/integrations/calendly', router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error', detail: err.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async post(token, rawBody, headers = {}) {
      const res = await fetch(`${base}/api/integrations/calendly/receive/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: rawBody });
      let json = null; try { json = await res.json(); } catch {}
      return { status: res.status, body: json };
    },
    async get(p) { const res = await fetch(base + p); return { status: res.status, body: await res.json() }; },
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}
const signed = (body, { secret = SECRET, at = Date.now() } = {}) => { const raw = typeof body === 'string' ? body : JSON.stringify(body); return [raw, { 'Calendly-Webhook-Signature': cly.signatureHeader(secret, Buffer.from(raw), at) }]; };

// A delivery in Calendly's documented shape (developer.calendly.com, sample webhook data).
const invitee = (n, over = {}, ev = {}) => ({
  event: 'invitee.created', created_at: '2026-11-12T08:00:00.000000Z', created_by: 'https://api.calendly.com/users/AAAA',
  payload: {
    cancel_url: `https://calendly.com/cancellations/INV${n}`, reschedule_url: `https://calendly.com/reschedulings/INV${n}`,
    email: 'Jana.Weber@example.de', name: 'Jana Weber', event: EV(n), uri: INV(n), status: 'active', timezone: 'Europe/Berlin',
    new_invitee: null, old_invitee: null, rescheduled: false, questions_and_answers: [],
    scheduled_event: {
      uri: EV(n), name: 'Erstgespräch', status: 'active', start_time: '2026-11-20T13:00:00.000000Z', end_time: '2026-11-20T13:30:00.000000Z',
      event_type: 'https://api.calendly.com/event_types/T2',
      event_memberships: [{ user: 'https://api.calendly.com/users/AAAA', user_email: 'Mara@Example.de', user_name: 'Mara Kühn' }],
      location: { type: 'google_conference', status: 'pushed', join_url: 'https://meet.google.com/abc-defg-hij' },
      ...ev,
    },
    ...over,
  },
});
const canceled = (n, over = {}) => { const b = invitee(n, { status: 'canceled', cancellation: { canceled_by: 'Jana Weber', reason: 'Krank', canceler_type: 'invitee' }, ...over }); b.event = 'invitee.canceled'; return b; };

let srv;
before(async () => {
  const notifications = { notify: () => {}, notifyUser: async (wid, actor, userId, n) => { state.told.push({ wid, actor, userId, ...n }); return true; } };
  srv = await serveLikeServer(loadRoute('calendly.js', { pool, user: { id: 2, workspaceId: WID, role: 'member' }, notifications }));
});
after(() => srv.close());
beforeEach(reset);

describe('who may deliver', () => {
  test('an unknown token: 404, nothing logged', async () => {
    const r = await srv.post('x'.repeat(40), ...signed(invitee(1)));
    assert.equal(r.status, 404); assert.equal(state.logs.length, 0); assert.equal(state.activities.length, 0);
  });
  test('no signature, a wrong secret, a changed body, an old timestamp: 401, logged without the body, nothing written', async () => {
    const [raw, good] = signed(invitee(1));
    const cases = [{}, signed(invitee(1), { secret: 'other' })[1], null, signed(invitee(1), { at: Date.now() - 11 * 60000 })[1]];
    for (const headers of cases) {
      const r = headers === null ? await srv.post(TOKEN, raw.replace('Jana Weber', 'Jana Wolf'), good) : await srv.post(TOKEN, raw, headers);
      assert.equal(r.status, 401);
    }
    assert.equal(state.activities.length, 0); assert.equal(state.logs.length, 4);
    for (const l of state.logs) { assert.equal(l.status, 'error'); assert.equal(l.payload, null); assert.match(l.error, /Signature/); }
  });
  test('signed, but not JSON: 400; an event this app does not handle: acknowledged and ignored', async () => {
    assert.equal((await srv.post(TOKEN, ...signed('not json'))).status, 400);
    const r = await srv.post(TOKEN, ...signed({ event: 'routing_form_submission.created', payload: {} }));
    assert.equal(r.status, 200); assert.deepEqual(r.body, { ignored: 'routing_form_submission.created' });
    const none = invitee(1, { uri: null });
    assert.equal((await srv.post(TOKEN, ...signed(none))).status, 422);
    assert.equal(state.activities.length, 0);
  });
});

describe('a booking arrives', () => {
  test('a known contact (by email, whatever its case): one meeting entry on the account\'s clock, source calendly, owned by the host\'s CRM user, the link on its second line; the assignee is told', async () => {
    const r = await srv.post(TOKEN, ...signed(invitee(1)));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(state.activities, [{ id: 100, workspace_id: WID, contact_id: 5, deal_id: null, content: 'Erstgespräch: Jana Weber\nhttps://meet.google.com/abc-defg-hij', created_by: 2, event_date: '2026-11-20', event_time: '14:00', event_tz: 'Europe/Berlin', calendly_uri: INV(1), calendly_event_uri: EV(1), type: 'meeting', source: 'calendly', cancelled_at: null }]);
    assert.deepEqual(r.body, { success: true, event: 'invitee.created', activity_id: 100, contact_id: 5, deal_id: null, created_contact: false, created_deal: false });
    assert.equal(state.contacts.length, 1, 'no second Jana'); assert.equal(state.deals.length, 1);
    assert.equal(state.told.length, 1);
    const n = state.told[0];
    assert.equal(n.userId, 4, 'the contact\'s assignee'); assert.equal(n.actor, null); assert.equal(n.type, 'meeting_booked'); assert.equal(n.title, 'Erstgespräch: Jana Weber');
    assert.equal(n.body, '20.11.2026, 21:00 (Asia/Manila), Google Meet', 'on the assignee\'s own clock, with the app behind the link');
    const l = state.logs[0];
    assert.equal(l.status, 'success'); assert.equal(l.contact_id, 5);
    assert.equal(l.captured.trigger, 'BOOKING_CREATED'); assert.equal(l.captured.event, 'invitee.created'); assert.equal(l.captured.attendee, 'jana.weber@example.de'); assert.equal(l.captured.told, 4);
  });
  test('an unknown invitee: the contact and a deal are created by the lead link\'s settings, then the entry', async () => {
    const r = await srv.post(TOKEN, ...signed(invitee(2, { email: 'Neu@Example.de', name: 'Nora Neu' })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.created_contact, true); assert.equal(r.body.created_deal, true);
    const c = state.contacts.at(-1), d = state.deals.at(-1), a = state.activities[0];
    assert.deepEqual([c.name, c.email, c.assigned_to], ['Nora Neu', 'neu@example.de', 4]);
    assert.deepEqual([d.contact_id, d.pipeline_id, d.stage_id, d.title], [c.id, 3, 9, 'Nora Neu']);
    assert.deepEqual([a.contact_id, a.deal_id, a.content.split('\n')[0]], [c.id, d.id, 'Erstgespräch: Nora Neu']);
    assert.equal(state.logs[0].captured.created_contact, true); assert.equal(state.logs[0].captured.created_deal, true);
  });
  test('a host who is no CRM user: owned by whoever connected Calendly; no link and a physical place: the title alone', async () => {
    await srv.post(TOKEN, ...signed(invitee(3, {}, { event_memberships: [{ user_email: 'extern@example.de', user_name: 'Ex Tern' }], location: { type: 'physical', location: 'Hauptstr. 1, Berlin' } })));
    assert.equal(state.activities[0].created_by, 1); assert.equal(state.activities[0].content, 'Erstgespräch: Jana Weber');
    assert.equal(state.told[0].body, '20.11.2026, 21:00 (Asia/Manila), Hauptstr. 1, Berlin');
  });
  test('the same delivery twice: one entry, the assignee told once', async () => {
    await srv.post(TOKEN, ...signed(invitee(1)));
    const again = await srv.post(TOKEN, ...signed(invitee(1)));
    assert.equal(again.status, 200); assert.equal(again.body.activity_id, 100);
    assert.equal(state.activities.length, 1); assert.equal(state.told.length, 1); assert.equal(state.logs.length, 2);
  });
});

describe('a booking is cancelled', () => {
  test('the entry stays, marked cancelled; the assignee is told once; the reason is logged', async () => {
    await srv.post(TOKEN, ...signed(invitee(1)));
    state.told.length = 0;
    const r = await srv.post(TOKEN, ...signed(canceled(1)));
    assert.equal(r.status, 200); assert.deepEqual(r.body, { success: true, event: 'invitee.canceled', activity_id: 100, found: true });
    assert.ok(state.activities[0].cancelled_at); assert.equal(state.activities.length, 1);
    assert.equal(state.told.length, 1); assert.equal(state.told[0].type, 'meeting_cancelled');
    assert.equal(state.logs.at(-1).captured.trigger, 'BOOKING_CANCELLED'); assert.equal(state.logs.at(-1).captured.reason, 'Krank');
    const again = await srv.post(TOKEN, ...signed(canceled(1)));
    assert.equal(again.body.found, false); assert.equal(state.told.length, 1, 'not told twice');
  });
  test('a cancellation of a booking the CRM never saw: acknowledged, nothing written', async () => {
    const r = await srv.post(TOKEN, ...signed(canceled(9)));
    assert.equal(r.status, 200); assert.equal(r.body.found, false); assert.equal(state.activities.length, 0); assert.equal(state.told.length, 0);
  });
});

describe('a booking is moved (Calendly sends a canceled with rescheduled: true and a created with old_invitee)', () => {
  const oldGone = () => canceled(1, { rescheduled: true, new_invitee: INV(2), cancellation: { reason: null } });
  const fresh   = () => invitee(2, { old_invitee: INV(1) }, { start_time: '2026-11-21T09:00:00.000000Z', end_time: '2026-11-21T09:30:00.000000Z' });
  const moved = () => {
    assert.equal(state.activities.length, 1, 'one entry, moved');
    const a = state.activities[0];
    assert.deepEqual([a.id, a.calendly_uri, a.calendly_event_uri, a.event_date, a.event_time, a.cancelled_at], [100, INV(2), EV(2), '2026-11-21', '10:00', null]);
    assert.deepEqual(state.told.map(n => n.type), ['meeting_moved'], 'told once, as a move — never as a cancellation');
  };
  test('the canceled first, then the created', async () => {
    await srv.post(TOKEN, ...signed(invitee(1)));
    state.told.length = 0;
    const c = await srv.post(TOKEN, ...signed(oldGone()));
    assert.deepEqual(c.body, { success: true, event: 'invitee.canceled', rescheduled: true });
    assert.equal(state.activities[0].cancelled_at, null, 'not a cancellation'); assert.equal(state.told.length, 0);
    const n = await srv.post(TOKEN, ...signed(fresh()));
    assert.equal(n.body.moved, true); assert.equal(n.body.activity_id, 100);
    moved();
    assert.deepEqual(state.logs.slice(-2).map(l => l.captured.trigger), ['BOOKING_RESCHEDULED', 'BOOKING_RESCHEDULED']);
  });
  test('the created first, then the canceled', async () => {
    await srv.post(TOKEN, ...signed(invitee(1)));
    state.told.length = 0;
    await srv.post(TOKEN, ...signed(fresh()));
    await srv.post(TOKEN, ...signed(oldGone()));
    moved();
  });
  test('a move of a booking the CRM never saw: the new booking is created', async () => {
    const r = await srv.post(TOKEN, ...signed(fresh()));
    assert.equal(r.status, 200); assert.equal(r.body.moved, undefined);
    assert.equal(state.activities.length, 1); assert.equal(state.activities[0].calendly_uri, INV(2));
    assert.deepEqual(state.told.map(n => n.type), ['meeting_booked']);
  });
});

describe('GET /api/integrations/calendly/logs', () => {
  test('the workspace\'s Calendly deliveries, with the contact\'s name', async () => {
    await srv.post(TOKEN, ...signed(invitee(1)));
    const r = await srv.get('/api/integrations/calendly/logs');
    assert.equal(r.status, 200); assert.equal(r.body.logs.length, 1);
    assert.equal(r.body.logs[0].contact_name, 'Jana Weber'); assert.equal(r.body.logs[0].captured.trigger, 'BOOKING_CREATED');
    assert.deepEqual(state.calls.at(-1).params, [WID]);
  });
});

describe('server.js and db.js', () => {
  const server = require('fs').readFileSync(path.join(ROOT, 'server.js'), 'utf8'), db = require('fs').readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  test('the receiver gets its raw bytes before the global json(), and the webhook limits before the router', () => {
    const raw = server.indexOf("app.use('/api/integrations/calendly/receive', express.raw({ type: '*/*', limit: '1mb' }));");
    assert.ok(raw > 0 && raw < server.indexOf('app.use(express.json());'));
    const lim = server.indexOf("app.use('/api/integrations/calendly/receive', webhookIpLimiter, calcomTokenLimiter);");
    assert.ok(lim > 0 && lim < server.indexOf("app.use('/api/integrations/calendly', require('./routes/calendly'));"));
  });
  test('the entry\'s columns, one entry per booking, and the source', () => {
    assert.match(db, /ALTER TABLE activities ADD COLUMN IF NOT EXISTS calendly_uri\s+TEXT/); assert.match(db, /ALTER TABLE activities ADD COLUMN IF NOT EXISTS calendly_event_uri TEXT/);
    assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_calendly_uri ON activities \(workspace_id, calendly_uri\) WHERE calendly_uri IS NOT NULL/);
    assert.match(db, /CHECK\(source IN \('user','engine','calcom','notetaker','fonio','calendly'\)\)/);
  });
});
