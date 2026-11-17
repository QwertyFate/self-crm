// ROUTE tests for GET /api/integrations/calendly/slots and POST /api/integrations/calendly/book
// (CALENDLY_CHANGES Part 4): "Book meeting" on a deal or a contact while Calendly is the connected service.
// The real route file over a fake pool and a fake api.calendly.com (globalThis.fetch). Pinned: any member may
// book; the free times are asked a week at a time and never from the past, and come back grouped by the day on
// the VIEWER'S clock in the shape /calcom/slots has; a booking goes to Calendly for the contact's name and email
// at the chosen place, and the 'meeting' entry is written at once under the invitee URI (so the webhook lands on
// it) on the connected account's clock, owned by the booker; the assignee is told once; every refusal names its
// reason in `code` and nothing is written or sent that should not be; the token never leaves the server.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');

const TOKEN = 'eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0In0';
const WID = 7;
const T1 = 'https://api.calendly.com/event_types/T1', T2 = 'https://api.calendly.com/event_types/T2', T3 = 'https://api.calendly.com/event_types/T3';
const INV = 'https://api.calendly.com/scheduled_events/EV1/invitees/INV1', EV = 'https://api.calendly.com/scheduled_events/EV1';
const TYPES = [
  { uri: T1, name: 'Erstgespräch', slug: 'erst', duration: 30, poolingType: null, secret: false, locations: [{ kind: 'google_conference' }, { kind: 'outbound_call' }, { kind: 'physical', location: 'Hauptstr. 1, Bonn' }] },
  { uri: T2, name: 'Kurz', slug: 'kurz', duration: null, poolingType: null, secret: false, locations: [] },
  { uri: T3, name: 'Team', slug: 'team', duration: 45, poolingType: 'round_robin', secret: false, locations: [{ kind: 'zoom_conference' }] },
];

const state = {};
function reset() {
  Object.assign(state, {
    calls: [], logs: [], told: [], nextId: 100, webhookFirst: false,
    row: null,   // set in before(): needs the sealed token
    contacts: [
      { id: 5, workspace_id: WID, name: 'Jana Weber', email: ' Jana.Weber@example.de ', phone: '+49 171 1234567', assigned_to: 4 },
      { id: 6, workspace_id: WID, name: 'Ohne Mail', email: null, phone: null, assigned_to: null },
      { id: 8, workspace_id: WID, name: 'Ohne Telefon', email: 'ot@example.de', phone: '', assigned_to: null },
      { id: 9, workspace_id: 99, name: 'Fremd', email: 'fremd@example.de', phone: null, assigned_to: null },
    ],
    deals: [{ id: 12, workspace_id: WID, title: 'Haus Bonn', contact_id: 5, assigned_to: 4 }, { id: 13, workspace_id: 99, title: 'Fremd', contact_id: 9, assigned_to: null }],
    users: [{ id: 2, workspace_id: WID, timezone: 'Europe/Berlin' }, { id: 4, workspace_id: WID, timezone: 'Asia/Manila' }],
    activities: [],
  });
}
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    state.calls.push({ sql: q, params });
    if (/FROM workspace_calendly c LEFT JOIN users u/.test(q)) return { rows: state.row && params[0] === WID ? [state.row] : [] };
    if (q === 'SELECT id, title, contact_id, assigned_to FROM deals WHERE id=$1 AND workspace_id=$2') return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]) };
    if (q === 'SELECT id, name, email, phone FROM contacts WHERE id=$1 AND workspace_id=$2') return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]) };
    if (q === 'SELECT assigned_to FROM deals WHERE id=$1 AND workspace_id=$2') return { rows: state.deals.filter(d => d.id === params[0] && d.workspace_id === params[1]).map(d => ({ assigned_to: d.assigned_to })) };
    if (q === 'SELECT assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2') return { rows: state.contacts.filter(c => c.id === params[0] && c.workspace_id === params[1]).map(c => ({ assigned_to: c.assigned_to })) };
    if (q === 'SELECT id, timezone FROM users WHERE id=$1 AND workspace_id=$2') return { rows: state.users.filter(u => u.id === params[0] && u.workspace_id === params[1]) };
    if (q.startsWith("INSERT INTO activities (workspace_id, contact_id, deal_id, type, content, created_by, event_date, event_time, event_tz, source, calendly_uri, calendly_event_uri) VALUES ($1,$2,$3,'meeting',$4,$5,$6,$7,$8,'calendly',$9,$10) ON CONFLICT (workspace_id, calendly_uri) WHERE calendly_uri IS NOT NULL")) {
      assert.match(q, /DO UPDATE SET contact_id=EXCLUDED\.contact_id, deal_id=COALESCE\(EXCLUDED\.deal_id, activities\.deal_id\), created_by=EXCLUDED\.created_by, cancelled_at=NULL, calendly_event_uri=COALESCE\(EXCLUDED\.calendly_event_uri, activities\.calendly_event_uri\) RETURNING id, content, \(xmax = 0\) AS inserted$/, 'a row the webhook made first keeps its title, link and time');
      const hit = state.activities.find(a => a.workspace_id === params[0] && a.calendly_uri === params[8]);
      if (hit) { Object.assign(hit, { contact_id: params[1], deal_id: params[2] ?? hit.deal_id, created_by: params[4], cancelled_at: null }); return { rows: [{ id: hit.id, content: hit.content, inserted: false }] }; }
      const a = { id: state.nextId++, workspace_id: params[0], contact_id: params[1], deal_id: params[2], content: params[3], created_by: params[4], event_date: params[5], event_time: params[6], event_tz: params[7], source: 'calendly', calendly_uri: params[8], calendly_event_uri: params[9] };
      state.activities.push(a);
      return { rows: [{ id: a.id, content: a.content, inserted: true }] };
    }
    if (q.startsWith("INSERT INTO webhook_logs (workspace_id, source, status, payload, captured, contact_id, deal_id, error) VALUES ($1,'calendly',$2,$3,$4,$5,$6,$7)")) {
      state.logs.push({ workspace_id: params[0], status: params[1], payload: params[2] == null ? null : JSON.parse(params[2]), captured: JSON.parse(params[3]), contact_id: params[4], deal_id: params[5], error: params[6] });
      return { rows: [], rowCount: 1 };
    }
    throw new Error('unexpected SQL: ' + q);
  },
};
const notifications = { notify: () => {}, notifyUser: async (wid, actorId, userId, n) => { state.told.push({ wid, actorId, userId, ...n }); return true; } };

// A fake api.calendly.com: `plan` maps a path to a reply or to a function of (URL, body); every call is recorded.
let fetchCalls = [];
const realFetch = globalThis.fetch;
function fakeCalendly(plan) {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.hostname === '127.0.0.1') return realFetch(url, init);   // the test client itself
    const body = init?.body ? JSON.parse(init.body) : undefined;
    fetchCalls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), method: init?.method || 'GET', headers: init?.headers, body });
    let r = plan[u.pathname] ?? { status: 404, body: { title: 'Resource Not Found', message: 'no such route' } };
    if (typeof r === 'function') r = r(u, body);
    if (r.throw) throw Object.assign(new TypeError('fetch failed'), { name: 'TypeError' });
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
// The free times Calendly has, wherever they fall: each request gets the ones inside its own range.
const FREE = ['2099-03-02T08:00:00.000000Z', '2099-03-02T08:30:00.000000Z', '2099-03-10T22:30:00.000000Z', '2099-03-30T07:00:00.000000Z'];
const times = u => ({ status: 200, body: { collection: FREE.filter(s => s >= u.searchParams.get('start_time') && s < u.searchParams.get('end_time')).map(s => ({ status: 'available', invitees_remaining: 1, start_time: s })) } });
const BOOKED = { status: 201, body: { resource: { uri: INV, event: EV, cancel_url: 'https://calendly.com/cancellations/INV1', reschedule_url: 'https://calendly.com/reschedulings/INV1' } } };
const OK = { '/event_type_available_times': times, '/invitees': BOOKED };

let berlin, manila;
const envSaved = {};
before(async () => {
  for (const k of ['SESSION_SECRET', 'CALCOM_ENCRYPTION_KEY', 'CALENDLY_API_URL']) { envSaved[k] = process.env[k]; delete process.env[k]; }
  process.env.SESSION_SECRET = 'route-test-secret';
  // both are plain members: booking is not an owner's or admin's matter
  berlin = await serve({ '/api/integrations/calendly': loadRoute('calendly.js', { pool, notifications, user: { id: 2, workspaceId: WID, role: 'member', timezone: 'Europe/Berlin' } }) });
  manila = await serve({ '/api/integrations/calendly': loadRoute('calendly.js', { pool, notifications, user: { id: 4, workspaceId: WID, role: 'member', timezone: 'Asia/Manila' } }) });
});
after(async () => {
  await berlin.close(); await manila.close();
  globalThis.fetch = realFetch;
  for (const k of Object.keys(envSaved)) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; }
});
// Everything as at the start of a test: the data, the connection (reset() clears it) and a Calendly that says yes.
function fresh() {
  reset();
  const calcom = require(path.join(ROOT, 'utils', 'calcom.js'));
  state.row = { id: 1, workspace_id: WID, token_sealed: calcom.sealKey(TOKEN), user_uri: 'https://api.calendly.com/users/A', cly_name: 'Mara Kühn', cly_email: 'mara@example.de', cly_timezone: 'Europe/Berlin', event_types: TYPES, event_type_uri: T1, connected_by: 1, host_user_id: 2 };
  fakeCalendly(OK);
}
beforeEach(fresh);

const SECRET_WORDS = /token_sealed|eyJraWQ|"v1\./;
const sqlOf = re => state.calls.filter(c => re.test(c.sql));

describe('GET /slots: the free times for the dialog\'s month', () => {
  test('a month is asked a week at a time for the chosen event type and comes back by day on the viewer\'s clock, each time with its end', async () => {
    const r = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=31');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.event_type, { uri: T1, name: 'Erstgespräch', duration: 30 });
    assert.equal(r.body.time_zone, 'Europe/Berlin'); assert.equal(r.body.from, '2099-03-01'); assert.equal(r.body.days, 31);
    assert.deepEqual(Object.keys(r.body.slots), ['2099-03-02', '2099-03-10', '2099-03-30']);
    assert.deepEqual(r.body.slots['2099-03-02'], [
      { start: '2099-03-02T08:00:00.000Z', end: '2099-03-02T08:30:00.000Z' },
      { start: '2099-03-02T08:30:00.000Z', end: '2099-03-02T09:00:00.000Z' },
    ], 'the type\'s 30 minutes after each start');
    assert.equal(r.body.slots['2099-03-10'][0].start, '2099-03-10T22:30:00.000Z', '23:30 in Berlin: still the 10th');

    assert.equal(fetchCalls.length, 5, '31 days: four weeks and the rest');
    for (const c of fetchCalls) {
      assert.equal(c.path, '/event_type_available_times'); assert.equal(c.query.event_type, T1);
      assert.equal(c.headers.Authorization, 'Bearer ' + TOKEN);
      assert.ok(Date.parse(c.query.end_time) - Date.parse(c.query.start_time) <= 7 * 24 * 3600 * 1000, 'never more than a week');
    }
    assert.equal(fetchCalls[0].query.start_time, '2099-02-28T23:00:00.000Z', 'the month begins at the viewer\'s midnight');
    assert.equal(fetchCalls[4].query.end_time, '2099-03-31T22:00:00.000Z', 'and ends at it (summer time by then)');
    for (let i = 1; i < 5; i++) assert.equal(fetchCalls[i].query.start_time, fetchCalls[i - 1].query.end_time, 'the weeks join without a gap');
    assert.doesNotMatch(JSON.stringify(r.body), SECRET_WORDS);
  });

  test('the same times for a viewer elsewhere fall on that viewer\'s days', async () => {
    const r = await manila.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=31');
    assert.equal(r.status, 200);
    assert.equal(r.body.time_zone, 'Asia/Manila');
    assert.deepEqual(Object.keys(r.body.slots), ['2099-03-02', '2099-03-11', '2099-03-30'], '22:30 UTC on the 10th is 06:30 on the 11th in Manila');
    assert.equal(fetchCalls[0].query.start_time, '2099-02-28T16:00:00.000Z', 'Manila\'s midnight');
  });

  test('another event type of the account by its URI; one without a length gives no end; a type the account does not have is refused', async () => {
    const r = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=7&event_type=' + encodeURIComponent(T2));
    assert.equal(r.status, 200);
    assert.equal(fetchCalls.length, 1); assert.equal(fetchCalls[0].query.event_type, T2);
    assert.deepEqual(r.body.slots['2099-03-02'][0], { start: '2099-03-02T08:00:00.000Z', end: null });

    fakeCalendly(OK);
    const bad = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=7&event_type=' + encodeURIComponent('https://api.calendly.com/event_types/NOPE'));
    assert.equal(bad.status, 400); assert.equal(bad.body.code, 'event_type');
    assert.equal(fetchCalls.length, 0, 'Calendly is not asked');
  });

  test('Calendly is never asked about the past: this month starts a minute from now, a month gone by asks nothing', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await berlin.request('GET', `/api/integrations/calendly/slots?from=${today.slice(0, 8)}01&days=31`);
    assert.equal(r.status, 200);
    assert.ok(fetchCalls.length >= 1);
    assert.ok(Date.parse(fetchCalls[0].query.start_time) > Date.now() + 30000, 'not before a moment from now');

    fakeCalendly(OK);
    const gone = await berlin.request('GET', '/api/integrations/calendly/slots?from=2000-01-01&days=31');
    assert.equal(gone.status, 200); assert.deepEqual(gone.body.slots, {});
    assert.equal(fetchCalls.length, 0);
  });

  test('a time Calendly names twice is offered once; a wrong `days` is brought into range', async () => {
    fakeCalendly({ '/event_type_available_times': () => ({ status: 200, body: { collection: [{ status: 'available', start_time: '2099-03-02T08:00:00.000000Z' }, { status: 'available', start_time: '2099-03-02T08:00:00Z' }, { status: 'unavailable', start_time: '2099-03-02T09:00:00Z' }] } }) });
    const r = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=999');
    assert.equal(r.body.days, 42);
    assert.equal(r.body.slots['2099-03-02'].length, 1);
  });

  test('not connected, and a stored token that cannot be opened any more', async () => {
    state.row = null;
    const none = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=7');
    assert.equal(none.status, 404); assert.equal(none.body.code, 'not_connected');

    state.row = { id: 1, workspace_id: WID, token_sealed: 'v1.broken', event_types: TYPES, event_type_uri: T1, cly_timezone: 'Europe/Berlin' };
    const sealed = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=7');
    assert.equal(sealed.status, 409); assert.equal(sealed.body.code, 'reseal');
  });
  test('Calendly away, answering with an error, or refusing the token: each with its code', async () => {
    fakeCalendly({ '/event_type_available_times': { throw: true } });
    const away = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=7');
    assert.equal(away.status, 502); assert.equal(away.body.code, 'unreachable');

    fakeCalendly({ '/event_type_available_times': { status: 400, body: { title: 'Invalid Argument', message: 'The supplied parameters are invalid.', details: [{ parameter: 'start_time', message: 'must be in the future' }] } } });
    const bad = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=7');
    assert.equal(bad.status, 502); assert.equal(bad.body.code, 'calendly_error');
    assert.match(bad.body.detail, /start_time: must be in the future/, 'Calendly\'s own reason rides along');

    fakeCalendly({ '/event_type_available_times': { status: 401, body: { title: 'Unauthenticated', message: 'The access token is invalid' } } });
    const token = await berlin.request('GET', '/api/integrations/calendly/slots?from=2099-03-01&days=7');
    assert.equal(token.status, 400); assert.equal(token.body.code, 'rejected');
  });
});

describe('POST /book: a meeting for a deal\'s contact', () => {
  const START = '2099-03-02T08:00:00.000Z';

  test('booked at Calendly for the contact, at the type\'s first place; the entry is written at once and the assignee is told', async () => {
    const r = await berlin.request('POST', '/api/integrations/calendly/book', { deal_id: 12, contact_id: 5, event_type: T1, start: '2099-03-02T08:00:00.000000Z' });
    assert.equal(r.status, 201);

    assert.equal(fetchCalls.length, 1);
    const sent = fetchCalls[0];
    assert.equal(sent.method, 'POST'); assert.equal(sent.path, '/invitees');
    assert.equal(sent.headers.Authorization, 'Bearer ' + TOKEN);
    assert.deepEqual(sent.body, {
      event_type: T1, start_time: START,
      invitee: { name: 'Jana Weber', email: 'Jana.Weber@example.de', timezone: 'Europe/Berlin' },   // the booker's zone; the email without its stray blanks
      location: { kind: 'google_conference' },
    });
    assert.ok(!('tracking' in sent.body), 'no tracking block: Calendly wants all six keys once one is sent');

    assert.equal(state.activities.length, 1);
    const a = state.activities[0];
    assert.deepEqual({ contact: a.contact_id, deal: a.deal_id, by: a.created_by, uri: a.calendly_uri, event: a.calendly_event_uri, source: a.source },
      { contact: 5, deal: 12, by: 2, uri: INV, event: EV, source: 'calendly' }, 'named by the invitee URI, owned by the booker, on the deal');
    assert.equal(a.content, 'Erstgespräch: Jana Weber');
    assert.deepEqual([a.event_date, a.event_time, a.event_tz], ['2099-03-02', '09:00', 'Europe/Berlin'], 'the connected account\'s clock, as the receiver writes it');

    assert.deepEqual(r.body.activity, { id: a.id, type: 'meeting', content: 'Erstgespräch: Jana Weber', event_date: '2099-03-02', event_time: '09:00', event_tz: 'Europe/Berlin', contact_id: 5, deal_id: 12, calendly_uri: INV, calendly_event_uri: EV, source: 'calendly', created_by: 2 });
    assert.deepEqual(r.body.booking, { uri: INV, event_uri: EV, start: START, location: { kind: 'google_conference' } });
    assert.doesNotMatch(JSON.stringify(r.body), /cancellations|reschedulings/, 'the links that cancel or move the booking stay on the server');
    assert.doesNotMatch(JSON.stringify(r.body), SECRET_WORDS);

    // the deal's assignee (user 4, in Manila) is told, on their clock, by the booker
    assert.equal(r.body.told, 4);
    assert.equal(state.told.length, 1);
    assert.deepEqual({ actor: state.told[0].actorId, user: state.told[0].userId, type: state.told[0].type, title: state.told[0].title, entity: state.told[0].entityType, id: state.told[0].entityId },
      { actor: 2, user: 4, type: 'meeting_booked', title: 'Erstgespräch: Jana Weber', entity: 'deal', id: 12 });
    assert.match(state.told[0].body, /^02\.03\.2099, 16:00 \(Asia\/Manila\), Google Meet$/);

    // one line in Calendly's log on the card
    assert.equal(state.logs.length, 1);
    assert.equal(state.logs[0].status, 'success');
    assert.deepEqual({ t: state.logs[0].captured.trigger, by: state.logs[0].captured.booked_by, who: state.logs[0].captured.attendee, c: state.logs[0].contact_id, d: state.logs[0].deal_id },
      { t: 'BOOKED_FROM_CRM', by: 2, who: 'jana.weber@example.de', c: 5, d: 12 });
    assert.doesNotMatch(JSON.stringify(state.logs[0]), SECRET_WORDS);
    assert.doesNotMatch(JSON.stringify(state.logs[0]), /cancellations|reschedulings/);
  });

  test('from a contact, with no deal; the card\'s own event type when none is named; the booker who is the assignee is not told', async () => {
    state.contacts[0].assigned_to = 4;
    const r = await manila.request('POST', '/api/integrations/calendly/book', { contact_id: 5, start: START });
    assert.equal(r.status, 201);
    assert.equal(fetchCalls[0].body.event_type, T1, 'the type chosen on the card');
    assert.equal(fetchCalls[0].body.invitee.timezone, 'Asia/Manila');
    assert.equal(state.activities[0].deal_id, null); assert.equal(state.activities[0].created_by, 4);
    assert.equal(state.activities[0].event_tz, 'Europe/Berlin', 'still the account\'s clock');
    assert.equal(r.body.told, null); assert.equal(state.told.length, 0);
  });

  test('a deal alone names its contact', async () => {
    const r = await berlin.request('POST', '/api/integrations/calendly/book', { deal_id: 12, start: START });
    assert.equal(r.status, 201);
    assert.equal(state.activities[0].contact_id, 5); assert.equal(state.activities[0].deal_id, 12);
  });

  test('the place chosen in the dialog, by its position: the host\'s address as it is, the customer\'s number where the host calls', async () => {
    const addr = await berlin.request('POST', '/api/integrations/calendly/book', { contact_id: 5, event_type: T1, start: START, location: 2 });
    assert.equal(addr.status, 201);
    assert.deepEqual(fetchCalls[0].body.location, { kind: 'physical', location: 'Hauptstr. 1, Bonn' });
    assert.match(state.told[0].body, /, Hauptstr\. 1, Bonn$/);

    fresh();
    const call = await berlin.request('POST', '/api/integrations/calendly/book', { contact_id: 5, event_type: T1, start: START, location: 1 });
    assert.equal(call.status, 201);
    assert.deepEqual(fetchCalls[0].body.location, { kind: 'outbound_call', location: '+49 171 1234567' });
  });

  test('a type without a place, and a round robin, are booked with no location', async () => {
    const none = await berlin.request('POST', '/api/integrations/calendly/book', { contact_id: 5, event_type: T2, start: START });
    assert.equal(none.status, 201);
    assert.ok(!('location' in fetchCalls[0].body));

    fresh();
    const robin = await berlin.request('POST', '/api/integrations/calendly/book', { contact_id: 5, event_type: T3, start: START });
    assert.equal(robin.status, 201);
    assert.ok(!('location' in fetchCalls[0].body), 'Calendly sets a round robin\'s place itself');
  });

  test('the webhook was faster: its row is taken over (deal, contact, booker) and nobody is told a second time', async () => {
    state.activities.push({ id: 50, workspace_id: WID, contact_id: 5, deal_id: null, content: 'Erstgespräch: Jana Weber\nhttps://meet.google.com/abc-defg-hij', created_by: 1, event_date: '2099-03-02', event_time: '09:00', event_tz: 'Europe/Berlin', source: 'calendly', calendly_uri: INV, calendly_event_uri: EV });
    const r = await berlin.request('POST', '/api/integrations/calendly/book', { deal_id: 12, contact_id: 5, event_type: T1, start: START });
    assert.equal(r.status, 201);
    assert.equal(state.activities.length, 1, 'no second entry');
    assert.deepEqual({ deal: state.activities[0].deal_id, by: state.activities[0].created_by }, { deal: 12, by: 2 });
    assert.equal(r.body.activity.id, 50);
    assert.match(r.body.activity.content, /meet\.google\.com/, 'the link the webhook brought stays');
    assert.equal(r.body.told, null); assert.equal(state.told.length, 0);
    assert.equal(state.logs[0].captured.told, null);
  });
});

describe('POST /book: what stands in the way', () => {
  const START = '2099-03-02T08:00:00.000Z';
  const nothingDone = () => { assert.equal(fetchCalls.length, 0, 'Calendly is not asked'); assert.equal(state.activities.length, 0); assert.equal(state.told.length, 0); };

  test('before Calendly is asked: no connection, an unknown type, an unreadable start, no contact, someone else\'s deal or contact, no email, no number for a call, a place the type does not have', async () => {
    for (const [body, status, code] of [
      [{ contact_id: 5, event_type: 'https://api.calendly.com/event_types/NOPE', start: START }, 400, 'event_type'],
      [{ contact_id: 5, start: 'tomorrow at nine' }, 400, 'start'],
      [{ contact_id: 5 }, 400, 'start'],
      [{ start: START }, 400, 'contact'],
      [{ deal_id: 13, start: START }, 400, 'contact'],
      [{ contact_id: 9, start: START }, 400, 'contact'],
      [{ contact_id: 6, start: START }, 400, 'no_email'],
      [{ contact_id: 8, start: START, location: 1 }, 400, 'no_phone'],
      [{ contact_id: 5, start: START, location: 3 }, 400, 'location'],
      [{ contact_id: 5, start: START, location: -1 }, 400, 'location'],
      [{ contact_id: 5, start: START, location: 'zoom' }, 400, 'location'],
      [{ contact_id: 5, event_type: T2, start: START, location: 0 }, 400, 'location'],
    ]) {
      const r = await berlin.request('POST', '/api/integrations/calendly/book', body);
      assert.equal(r.status, status, JSON.stringify(body)); assert.equal(r.body.code, code, JSON.stringify(body));
      nothingDone();
    }
    state.row = null;
    const none = await berlin.request('POST', '/api/integrations/calendly/book', { contact_id: 5, start: START });
    assert.equal(none.status, 404); assert.equal(none.body.code, 'not_connected');
    nothingDone();
  });

  test('Calendly says no to this booking (the time was taken): 409 refused with its words, and nothing is written', async () => {
    fakeCalendly({ '/invitees': { status: 400, body: { title: 'Invalid Argument', message: 'The supplied parameters are invalid.', details: [{ parameter: 'start_time', message: 'is not available' }] } } });
    const r = await berlin.request('POST', '/api/integrations/calendly/book', { deal_id: 12, contact_id: 5, start: START });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'refused');
    assert.match(r.body.detail, /The supplied parameters are invalid\. \(start_time: is not available\)/);
    assert.equal(state.activities.length, 0); assert.equal(state.told.length, 0); assert.equal(state.logs.length, 0);
    assert.equal(sqlOf(/^INSERT INTO activities/).length, 0);
  });

  test('a plan or permission refusal without named scopes is Calendly\'s no in its own words too', async () => {
    fakeCalendly({ '/invitees': { status: 403, body: { title: 'Permission Denied', message: 'Please upgrade your Calendly account to Standard' } } });
    const r = await berlin.request('POST', '/api/integrations/calendly/book', { contact_id: 5, start: START });
    assert.equal(r.status, 409); assert.equal(r.body.code, 'refused');
    assert.match(r.body.detail, /Please upgrade/);
  });

  test('the connection\'s own failures keep their codes: a wrong token, a missing permission, Calendly away or broken', async () => {
    for (const [reply, status, code] of [
      [{ status: 401, body: { title: 'Unauthenticated', message: 'The access token is invalid' } }, 400, 'rejected'],
      [{ status: 403, body: { title: 'Permission Denied', message: 'Insufficient scope', required_scopes: ['scheduled_events:write'] } }, 400, 'scope'],
      [{ throw: true }, 502, 'unreachable'],
      [{ status: 500, body: { title: 'Internal Server Error', message: 'boom' } }, 502, 'calendly_error'],
    ]) {
      fakeCalendly({ '/invitees': reply });
      const r = await berlin.request('POST', '/api/integrations/calendly/book', { contact_id: 5, start: START });
      assert.equal(r.status, status, code); assert.equal(r.body.code, code);
      assert.equal(state.activities.length, 0, code);
    }
  });
});
