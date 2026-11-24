// ROUTE tests for "members only see what is assigned to them" on the calendar and the bookings
// (MEMBER_VISIBILITY_CHANGES, pieces 2 and 3, 2026-11-25): routes/calendar.js, routes/calendly.js and the handlers of
// routes/integrations.js a logged-in person calls (the lead webhooks' settings and logs, Cal.com's logs, slots, book,
// cancel, reschedule).
//
// The real routes on a throwaway server; the database is a stand-in that records every statement, Cal.com and
// Calendly are a stand-in fetch that records every call. So these show WHAT each route asks: for a held member the
// statement carries the rule with the member's id, somebody else's deal, contact or meeting is answered like one
// that does not exist, NOTHING is written after it and the outside service is never asked; for an owner, an admin
// and a member of a workspace without the switch the statements are the ones that shipped. What the rule selects on
// real rows is shown on a real Postgres (the log names the harness).
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');
const v      = require(path.join(ROOT, 'utils', 'visibility.js'));
const calcom = require(path.join(ROOT, 'utils', 'calcom.js'));

const HELD = { id: 12, workspaceId: 7, role: 'member', ownOnly: true };
const FREE = [{ id: 1, workspaceId: 7, role: 'owner' }, { id: 2, workspaceId: 7, role: 'admin' }, { id: 12, workspaceId: 7, role: 'member' }];

// The pieces a held member's statements carry, as utils/visibility.js writes them (its own tests pin the text).
const LINKED = (cols, n) => ` AND ${v.rules.linked(cols, n)}`;
const DEAL    = (d, n) => ` AND ${v.rules.deal(d, n)}`;
const CONTACT = (c, n) => ` AND ${v.rules.contact(c, n)}`;
const LOG     = { deal: 'l.deal_id', contact: 'l.contact_id', orphans: false };
const MEETING = { deal: 'activities.deal_id', contact: 'activities.contact_id' };
const ACT     = { deal: 'a.deal_id', contact: 'a.contact_id' };
// A task carries the Tasks page's own rule (utils/task-visibility.js): what it names, and for a subtask its parent too.
const tv = require(path.join(ROOT, 'utils', 'task-visibility.js'));
const TASK_RULE = n => ` AND ${tv.rule('t', n)}`;

// The stand-in database: `answer(sql, params)` may return { rows, rowCount }; everything else finds nothing.
const state = { asked: [], answer: null, outside: [] };
const pool = { query: async (sql, params) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  state.asked.push([t, params]);
  return (state.answer && state.answer(t, params)) || { rows: [], rowCount: 0 };
} };
// The stand-in for Cal.com and Calendly: every call is recorded and answered with a failure, which is enough to
// see WHETHER a route got as far as asking them (it then answers 502).
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = async (url, init) => {
  if (new URL(String(url)).hostname === '127.0.0.1') return realFetch(url, init);
  state.outside.push(`${init?.method || 'GET'} ${new URL(String(url)).pathname}`);
  return new Response(JSON.stringify({ status: 'error', error: { message: 'stand-in' }, message: 'stand-in' }), { status: 500, headers: { 'content-type': 'application/json' } });
}; });
after(() => { globalThis.fetch = realFetch; });
beforeEach(() => { state.asked = []; state.answer = null; state.outside = []; });

const call = async (file, mount, user, method, url, body) => {
  const server = await serve({ [mount]: loadRoute(file, { pool, user }) });
  try { return await server.request(method, mount + url, body); } finally { await server.close(); }
};
const calendar = (user, url) => call('calendar.js', '/api/calendar', user, 'GET', url);
const intg     = (user, method, url, body) => call('integrations.js', '/api/integrations', user, method, url, body);
const cly      = (user, method, url, body) => call('calendly.js', '/api/integrations/calendly', user, method, url, body);
const find  = re => state.asked.filter(a => re.test(a[0]));
const wrote = () => state.asked.filter(a => /^(INSERT|UPDATE|DELETE)/.test(a[0]));
const ruled = () => state.asked.filter(a => /\b(vc|vd|ld|lc)\./.test(a[0]));
const flat  = s => s.replace(/\s+/g, ' ').trim();

// The connections, as their tables hold them (the key and the token sealed like the routes seal them).
const CAL_ROW = { workspace_id: 7, api_key_sealed: calcom.sealKey('cal_live_0123456789abcdef'), cal_email: 'host@example.de', cal_timezone: 'Europe/Berlin', event_type_id: 3,
  event_types: [{ id: 3, title: 'Erstgespräch', lengthInMinutes: 30, locations: [] }], connected_by: 1 };
const T1 = 'https://api.calendly.com/event_types/T1';
const CLY_ROW = { workspace_id: 7, token_sealed: calcom.sealKey('eyJraWQiOiIxY2UxZTEzNjE3ZGNmNzY2YjNjZWJjY2Y4ZGM1YmFmYThhNjVlNjg0MDIzZjdjMzJiZTgzNDliMjM4MDEzNWI0In0'), cly_timezone: 'Europe/Berlin',
  event_type_uri: T1, event_types: [{ uri: T1, name: 'Erstgespräch', duration: 30, poolingType: null, locations: [] }], user_uri: 'https://api.calendly.com/users/U1', connected_by: 1 };
const connections = t => (/FROM workspace_calcom c LEFT JOIN users u/.test(t) ? { rows: [CAL_ROW] } : /FROM workspace_calendly c LEFT JOIN users u/.test(t) ? { rows: [CLY_ROW] } : null);
const START = new Date(Date.now() + 3 * 86400000).toISOString();

// ═══ The calendar ═════════════════════════════════════════════════════════════════════════════════════════════════
describe('/api/calendar: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: no rule, the three (one) parameters, both halves on the workspace`, async () => {
    await calendar(user, '/?start=2026-11-01&end=2026-11-30');
    await calendar(user, '/today');
    assert.deepEqual(ruled(), []);
    assert.deepEqual(state.asked.map(a => a[1]), [[7, '2026-11-01', '2026-11-30'], [7]]);
    const [range, today] = state.asked.map(a => a[0]);
    assert.ok(range.includes("WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id ORDER BY deals.updated_at DESC LIMIT 1"));
    assert.ok(range.includes('AND a.event_date <= $3::date UNION ALL'));
    assert.ok(range.includes('AND t.due_date <= $3::date ORDER BY event_date ASC'));
    assert.ok(today.includes('AND a.event_date = CURRENT_DATE UNION ALL'));
    assert.ok(today.includes('AND t.due_date = CURRENT_DATE ORDER BY event_time ASC'));
  });
});

describe('/api/calendar: a held member', () => {
  test('a range: activities and tasks each follow the deal or contact they name, and the deal an entry links to is one the member sees', async () => {
    assert.equal((await calendar(HELD, '/?start=2026-11-01&end=2026-11-30')).status, 200);
    const [sql, params] = state.asked[0];
    assert.equal(state.asked.length, 1, 'still one statement');
    assert.deepEqual(params, [7, '2026-11-01', '2026-11-30', 12, 12, 12]);
    assert.ok(sql.includes(`AND a.event_date <= $3::date${LINKED(ACT, 4)} UNION ALL`), sql);
    assert.ok(sql.includes(`WHERE deals.contact_id = a.contact_id AND deals.workspace_id = a.workspace_id${DEAL('deals', 5)} ORDER BY deals.updated_at DESC LIMIT 1`), sql);
    assert.ok(sql.includes(`AND t.due_date <= $3::date${TASK_RULE(6)} ORDER BY event_date ASC`), sql);
  });
  test('today: the same three pieces, numbered after the workspace alone', async () => {
    assert.equal((await calendar(HELD, '/today')).status, 200);
    const [sql, params] = state.asked[0];
    assert.deepEqual(params, [7, 12, 12, 12]);
    assert.ok(sql.includes(`AND a.event_date = CURRENT_DATE${LINKED(ACT, 2)} UNION ALL`), sql);
    assert.ok(sql.includes(`AND deals.workspace_id = a.workspace_id${DEAL('deals', 3)} ORDER BY deals.updated_at`), sql);
    assert.ok(sql.includes(`AND t.due_date = CURRENT_DATE${TASK_RULE(4)} ORDER BY event_time ASC`), sql);
  });
  test('an entry that names neither a deal nor a contact stays for everyone (the pieces end in ELSE true)', () => {
    assert.match(LINKED(ACT, 4), /ELSE true END\)$/);
    assert.match(TASK_RULE(6), /^ AND \(\(CASE WHEN t\.deal_id IS NOT NULL .* ELSE true END\) AND \(t\.parent_id IS NULL OR EXISTS \(SELECT 1 FROM tasks pt WHERE pt\.id = t\.parent_id AND /, 'and a subtask only with its parent, as on the Tasks page');
  });
  test('the route still refuses a range without both ends before asking anything', async () => {
    assert.equal((await calendar(HELD, '/?start=2026-11-01')).status, 400);
    assert.deepEqual(state.asked, []);
  });
});

// ═══ The logs ═════════════════════════════════════════════════════════════════════════════════════════════════════
describe('the three delivery logs: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: no rule, no extra parameter`, async () => {
    await intg(user, 'GET', '/logs');
    await intg(user, 'GET', '/logs?webhook_id=4');
    await intg(user, 'GET', '/calcom/logs');
    await cly(user, 'GET', '/logs');
    assert.deepEqual(ruled(), []);
    assert.deepEqual(state.asked.map(a => a[1]), [[7, null], [7, 4], [7], [7]]);
    assert.ok(state.asked[0][0].endsWith("WHERE l.workspace_id=$1 AND l.source='lead' AND ($2::int IS NULL OR l.webhook_id=$2) ORDER BY l.created_at DESC LIMIT 50"));
    assert.ok(state.asked[2][0].endsWith("WHERE l.workspace_id=$1 AND l.source='calcom' ORDER BY l.created_at DESC LIMIT 30"));
    assert.ok(state.asked[3][0].endsWith("WHERE l.workspace_id=$1 AND l.source='calendly' ORDER BY l.created_at DESC LIMIT 30"));
  });
});

describe('the three delivery logs: a held member', () => {
  test('only deliveries that name a deal or a contact they see; a delivery that names nobody is not theirs', async () => {
    await intg(HELD, 'GET', '/logs');
    await intg(HELD, 'GET', '/logs?webhook_id=4');
    await intg(HELD, 'GET', '/calcom/logs');
    await cly(HELD, 'GET', '/logs');
    assert.deepEqual(state.asked.map(a => a[1]), [[7, null, 12], [7, 4, 12], [7, 12], [7, 12]]);
    assert.ok(state.asked[0][0].endsWith(`AND ($2::int IS NULL OR l.webhook_id=$2)${LINKED(LOG, 3)} ORDER BY l.created_at DESC LIMIT 50`), state.asked[0][0]);
    assert.ok(state.asked[1][0].endsWith(`${LINKED(LOG, 3)} ORDER BY l.created_at DESC LIMIT 50`));
    assert.ok(state.asked[2][0].endsWith(`AND l.source='calcom'${LINKED(LOG, 2)} ORDER BY l.created_at DESC LIMIT 30`), state.asked[2][0]);
    assert.ok(state.asked[3][0].endsWith(`AND l.source='calendly'${LINKED(LOG, 2)} ORDER BY l.created_at DESC LIMIT 30`), state.asked[3][0]);
    assert.match(LINKED(LOG, 2), /ELSE false END\)$/, 'a rejected lead, a test delivery, a guest the CRM did not take: owners and admins only');
  });
  test('a bad webhook_id is still refused before anything is asked', async () => {
    assert.equal((await intg(HELD, 'GET', '/logs?webhook_id=x')).status, 400);
    assert.deepEqual(state.asked, []);
  });
});

// ═══ A lead webhook's sample ══════════════════════════════════════════════════════════════════════════════════════
describe('a lead webhook\'s sample (a lead\'s own delivery)', () => {
  const SAMPLE = { name: 'Jana Weber', email: 'jana@example.de', phone: '+49 171 1' };
  const WH = { id: 4, workspace_id: 7, name: 'Webhook 1', webhook_key: 'k', field_map: { name: 'name', email: 'email' }, sample: SAMPLE, sample_at: '2026-11-20T10:00:00.000Z', test_until: null, active: true };
  const webhooks = t => (/FROM workspace_webhook w LEFT JOIN pipelines p/.test(t) ? { rows: [{ ...WH }] }
    : /^UPDATE workspace_webhook/.test(t) ? { rows: [{ ...WH }], rowCount: 1 }
    : /^SELECT id, field_map, sample FROM workspace_webhook/.test(t) ? { rows: [{ id: 4, field_map: WH.field_map, sample: SAMPLE }] }
    : /^SELECT id FROM workspace_webhook/.test(t) ? { rows: [{ id: 4 }] }
    : /^SELECT id, name FROM contacts WHERE workspace_id=\$1 AND email=\$2/.test(t) ? { rows: [{ id: 30, name: 'Jana Weber' }] } : null);
  // every answer that carries a webhook: the list, a change, the three test routes, "take the last delivery"
  const CARRIERS = [
    ['GET', '/settings', undefined, b => b.webhooks[0]],
    ['PATCH', '/settings/4', { name: 'Neu' }, b => b.webhook],
    ['PATCH', '/settings', { name: 'Neu' }, b => b.webhook],
    ['POST', '/settings/4/test', {}, b => b.webhook],
    ['DELETE', '/settings/4/test', undefined, b => b.webhook],
    ['DELETE', '/settings/4/sample', undefined, b => b.webhook],
    ['POST', '/settings/4/sample/last', {}, b => b.webhook],
  ];
  for (const user of FREE) test(`${user.role}: gets it, with its fields, and the preview`, async () => {
    state.answer = webhooks;
    for (const [method, url, body, pick] of CARRIERS) {
      const r = await intg(user, method, url, body);
      assert.ok(r.status < 300, `${method} ${url}: ${r.status}`);
      assert.deepEqual(pick(r.body).sample, SAMPLE, `${method} ${url}`);
    }
    const list = (await intg(user, 'GET', '/settings')).body.webhooks[0];
    assert.deepEqual(list.sample_fields.map(f => f.path).sort(), ['email', 'name', 'phone']);
    const p = await intg(user, 'POST', '/settings/4/preview', {});
    assert.equal(p.body.has_sample, true);
    assert.deepEqual(p.body.contact, { name: 'Jana Weber', email: 'jana@example.de', phone: null, company: null });
    assert.deepEqual(p.body.existing, { id: 30, name: 'Jana Weber' });
  });
  test('a held member: every answer carries the webhook WITHOUT the sample and its fields; when it arrived stays', async () => {
    state.answer = webhooks;
    for (const [method, url, body, pick] of CARRIERS) {
      const r = await intg(HELD, method, url, body);
      assert.ok(r.status < 300, `${method} ${url}: ${r.status}`);
      const wh = pick(r.body);
      assert.equal(wh.sample, null, `${method} ${url}`);
      assert.equal(wh.sample_at, WH.sample_at, 'no person\'s data, and the card notices a test delivery by it');
      if ('sample_fields' in wh) assert.deepEqual(wh.sample_fields, [], `${method} ${url}`);
      assert.equal(JSON.stringify(r.body).includes('jana@example.de'), false, `${method} ${url}: the lead's data is nowhere in the answer`);
      assert.equal(wh.name, WH.name, 'the webhook itself is still theirs to read');
    }
  });
  test('a new webhook goes through the same gate: whatever its row holds, a held member gets it without a sample', async () => {
    // a new row has no sample in the database; the stand-in gives it one so the test can SEE the gate
    state.answer = t => (/^INSERT INTO workspace_webhook/.test(t) ? { rows: [{ id: 5, workspace_id: 7, name: 'Webhook 2', sample: SAMPLE }] } : /^SELECT name FROM workspace_webhook/.test(t) ? { rows: [] } : null);
    const held = await intg(HELD, 'POST', '/settings', {});
    assert.deepEqual([held.status, held.body.webhook.sample, held.body.webhook.name], [201, null, 'Webhook 2']);
    const owner = await intg(FREE[0], 'POST', '/settings', {});
    assert.deepEqual([owner.status, owner.body.webhook.sample], [201, SAMPLE]);
  });
  test('a held member: no preview, and no contact is looked up by the sample\'s email', async () => {
    state.answer = webhooks;
    const r = await intg(HELD, 'POST', '/settings/4/preview', { field_map: { name: 'name', email: 'email' } });
    assert.deepEqual([r.status, r.body], [200, { has_sample: false }]);
    assert.deepEqual(find(/FROM contacts/), []);
    assert.equal((await intg(HELD, 'POST', '/settings/9/preview', {})).status, 200, 'the stand-in knows every id; an unknown webhook is the route\'s own 404');
  });
});

// ═══ Booking at Cal.com ═══════════════════════════════════════════════════════════════════════════════════════════
describe('Cal.com from the CRM: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: book, cancel, reschedule and the slots of a meeting being moved`, async () => {
    state.answer = (t, p) => connections(t)
      || (/^SELECT id, title, contact_id, assigned_to FROM deals/.test(t) ? { rows: [{ id: 5, title: 'Haus', contact_id: 9, assigned_to: null }] }
        : /^SELECT id, name, email, assigned_to FROM contacts/.test(t) ? { rows: [{ id: 9, name: 'Jana', email: 'jana@example.de', assigned_to: null }] }
        : /^SELECT id, contact_id, deal_id, content, calcom_uid/.test(t) ? { rows: [{ id: p[0], contact_id: 9, deal_id: 5, content: 'T', calcom_uid: 'uid1', cancelled_at: null }] }
        : /^SELECT id FROM activities WHERE workspace_id=\$1 AND calcom_uid=\$2/.test(t) ? { rows: [{ id: 40 }] } : null);
    assert.equal((await intg(user, 'POST', '/calcom/book', { deal_id: 5, start: START })).status, 502);
    assert.equal((await intg(user, 'POST', '/calcom/cancel', { activity_id: 40 })).status, 502);
    assert.equal((await intg(user, 'POST', '/calcom/reschedule', { activity_id: 40, start: START })).status, 502);
    assert.equal((await intg(user, 'GET', '/calcom/slots?reschedule_uid=uid1')).status, 502);
    assert.equal(state.outside.length, 4, 'each got as far as Cal.com');
    assert.deepEqual(ruled(), []);
    assert.deepEqual(find(/^SELECT id, title, contact_id, assigned_to FROM deals/), [['SELECT id, title, contact_id, assigned_to FROM deals WHERE id=$1 AND workspace_id=$2', [5, 7]]]);
    assert.deepEqual(find(/^SELECT id, name, email, assigned_to FROM contacts/), [['SELECT id, name, email, assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2', [9, 7]]]);
    assert.deepEqual(find(/^SELECT id, contact_id, deal_id, content, calcom_uid/).map(a => a), Array(2).fill(["SELECT id, contact_id, deal_id, content, calcom_uid, calcom_event_type_id, cancelled_at, event_date, event_time, event_tz FROM activities WHERE id=$1 AND workspace_id=$2 AND source='calcom'", [40, 7]]));
    assert.deepEqual(find(/^SELECT id FROM activities WHERE workspace_id/), [['SELECT id FROM activities WHERE workspace_id=$1 AND calcom_uid=$2', [7, 'uid1']]]);
  });
});

describe('Cal.com from the CRM: a held member', () => {
  test('booking for somebody else\'s deal: answered like a deal that does not exist; Cal.com is not asked, nothing is written', async () => {
    state.answer = connections;
    const r = await intg(HELD, 'POST', '/calcom/book', { deal_id: 5, start: START });
    assert.deepEqual([r.status, r.body], [400, { error: 'Deal not found in this workspace' }]);
    assert.deepEqual(find(/FROM deals WHERE id/), [[`SELECT id, title, contact_id, assigned_to FROM deals WHERE id=$1 AND workspace_id=$2${DEAL('deals', 3)}`, [5, 7, 12]]]);
    assert.deepEqual([state.outside, wrote()], [[], []]);
    assert.deepEqual(find(/FROM contacts WHERE id/), [], 'the contact is not even read');
  });
  test('booking for somebody else\'s contact (alone, or beside a deal they see): the same', async () => {
    state.answer = t => connections(t) || (/FROM deals WHERE id/.test(t) ? { rows: [{ id: 5, title: 'Haus', contact_id: 9, assigned_to: 12 }] } : null);
    const alone = await intg(HELD, 'POST', '/calcom/book', { contact_id: 9, start: START });
    const beside = await intg(HELD, 'POST', '/calcom/book', { deal_id: 5, contact_id: 10, start: START });
    for (const r of [alone, beside]) assert.deepEqual([r.status, r.body], [400, { error: 'Contact not found in this workspace' }]);
    assert.deepEqual(find(/FROM contacts WHERE id/), [
      [`SELECT id, name, email, assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2${CONTACT('contacts', 3)}`, [9, 7, 12]],
      [`SELECT id, name, email, assigned_to FROM contacts WHERE id=$1 AND workspace_id=$2${CONTACT('contacts', 3)}`, [10, 7, 12]],
    ]);
    assert.deepEqual([state.outside, wrote()], [[], []]);
  });
  test('booking for their own deal and its contact: Cal.com is asked', async () => {
    state.answer = t => connections(t) || (/FROM deals WHERE id/.test(t) ? { rows: [{ id: 5, title: 'Haus', contact_id: 9, assigned_to: 12 }] }
      : /FROM contacts WHERE id/.test(t) ? { rows: [{ id: 9, name: 'Jana', email: 'jana@example.de', assigned_to: null }] } : null);
    assert.equal((await intg(HELD, 'POST', '/calcom/book', { deal_id: 5, start: START })).status, 502);
    assert.deepEqual(state.outside, ['POST /v2/bookings']);
  });
  for (const [name, url, body] of [['cancelling', '/calcom/cancel', { activity_id: 40 }], ['moving', '/calcom/reschedule', { activity_id: 40, start: START }]]) {
    test(`${name} somebody else's meeting: answered like a meeting that does not exist; Cal.com is not asked, the entry is not touched`, async () => {
      state.answer = connections;
      const r = await intg(HELD, 'POST', url, body);
      assert.deepEqual([r.status, r.body], [404, { error: 'No Cal.com meeting with that id in this workspace' }]);
      assert.deepEqual(find(/FROM activities/), [[`SELECT id, contact_id, deal_id, content, calcom_uid, calcom_event_type_id, cancelled_at, event_date, event_time, event_tz FROM activities WHERE id=$1 AND workspace_id=$2 AND source='calcom'${LINKED(MEETING, 3)}`, [40, 7, 12]]]);
      assert.deepEqual([state.outside, wrote()], [[], []]);
    });
    test(`${name} a meeting they see: Cal.com is asked`, async () => {
      state.answer = (t, p) => connections(t) || (/FROM activities WHERE id/.test(t) ? { rows: [{ id: p[0], contact_id: 9, deal_id: 5, content: 'T', calcom_uid: 'uid1', cancelled_at: null }] } : null);
      assert.equal((await intg(HELD, 'POST', url, body)).status, 502);
      assert.equal(state.outside.length, 1);
    });
  }
  test('the free times for moving somebody else\'s meeting: 404, Cal.com is not asked; the free times as such stay open', async () => {
    state.answer = connections;
    const r = await intg(HELD, 'GET', '/calcom/slots?reschedule_uid=uid1');
    assert.deepEqual([r.status, r.body], [404, { error: 'No meeting with that booking in this workspace' }]);
    assert.deepEqual(find(/FROM activities/), [[`SELECT id FROM activities WHERE workspace_id=$1 AND calcom_uid=$2${LINKED(MEETING, 3)}`, [7, 'uid1', 12]]]);
    assert.deepEqual(state.outside, []);
    state.asked = [];
    assert.equal((await intg(HELD, 'GET', '/calcom/slots')).status, 502, 'the connected account\'s free times are nobody\'s lead');
    assert.equal(state.outside.length, 1);
    assert.deepEqual(ruled(), []);
  });
  test('a meeting\'s entry follows its deal, else its contact; an entry that names neither is everyone\'s', () => {
    assert.match(LINKED(MEETING, 3), /^ AND \(CASE WHEN activities\.deal_id IS NOT NULL THEN EXISTS .* WHEN activities\.contact_id IS NOT NULL THEN EXISTS .* ELSE true END\)$/);
  });
});

// ═══ Booking at Calendly ══════════════════════════════════════════════════════════════════════════════════════════
describe('Calendly from the CRM', () => {
  for (const user of FREE) test(`${user.role} (not held): the deal and the contact are read as shipped, Calendly is asked`, async () => {
    state.answer = t => connections(t) || (/FROM deals WHERE id/.test(t) ? { rows: [{ id: 5, title: 'Haus', contact_id: 9, assigned_to: null }] }
      : /FROM contacts WHERE id/.test(t) ? { rows: [{ id: 9, name: 'Jana', email: 'jana@example.de', phone: null }] } : null);
    assert.equal((await cly(user, 'POST', '/book', { deal_id: 5, start: START })).status, 502);
    assert.deepEqual(state.outside, ['POST /invitees']);
    assert.deepEqual(ruled(), []);
    assert.deepEqual(find(/FROM deals WHERE id/), [['SELECT id, title, contact_id, assigned_to FROM deals WHERE id=$1 AND workspace_id=$2', [5, 7]]]);
    assert.deepEqual(find(/FROM contacts WHERE id/), [['SELECT id, name, email, phone FROM contacts WHERE id=$1 AND workspace_id=$2', [9, 7]]]);
  });
  test('a held member, somebody else\'s deal: the route\'s own "not found" with its code; Calendly is not asked, nothing is written', async () => {
    state.answer = connections;
    const r = await cly(HELD, 'POST', '/book', { deal_id: 5, start: START });
    assert.deepEqual([r.status, r.body], [400, { error: 'Deal not found in this workspace', code: 'contact' }]);
    assert.deepEqual(find(/FROM deals WHERE id/), [[`SELECT id, title, contact_id, assigned_to FROM deals WHERE id=$1 AND workspace_id=$2${DEAL('deals', 3)}`, [5, 7, 12]]]);
    assert.deepEqual([state.outside, wrote()], [[], []]);
  });
  test('a held member, somebody else\'s contact: the same', async () => {
    state.answer = connections;
    const r = await cly(HELD, 'POST', '/book', { contact_id: 9, start: START });
    assert.deepEqual([r.status, r.body], [400, { error: 'Contact not found in this workspace', code: 'contact' }]);
    assert.deepEqual(find(/FROM contacts WHERE id/), [[`SELECT id, name, email, phone FROM contacts WHERE id=$1 AND workspace_id=$2${CONTACT('contacts', 3)}`, [9, 7, 12]]]);
    assert.deepEqual([state.outside, wrote()], [[], []]);
  });
  test('a held member, their own deal and contact: Calendly is asked; the free times stay open to them', async () => {
    state.answer = t => connections(t) || (/FROM deals WHERE id/.test(t) ? { rows: [{ id: 5, title: 'Haus', contact_id: 9, assigned_to: 12 }] }
      : /FROM contacts WHERE id/.test(t) ? { rows: [{ id: 9, name: 'Jana', email: 'jana@example.de', phone: null }] } : null);
    assert.equal((await cly(HELD, 'POST', '/book', { deal_id: 5, start: START })).status, 502);
    assert.deepEqual(state.outside, ['POST /invitees']);
    state.outside = []; state.asked = [];
    assert.equal((await cly(HELD, 'GET', '/slots')).status, 502);
    assert.ok(state.outside.length >= 1);
    assert.deepEqual(ruled(), []);
  });
});

// ═══ What was deliberately left ═══════════════════════════════════════════════════════════════════════════════════
describe('what a logged-in person cannot reach here stays as it was', () => {
  const src = read('routes/integrations.js'), clySrc = read('routes/calendly.js');
  const CALLS = /visibility\.\w+\(/;   // a call into utils/visibility.js (a comment may name the file)
  test('the public receivers carry no login and no rule: a lead or a booking arrives whoever may see it afterwards', () => {
    for (const [file, re] of [[src, /router\.post\('\/receive\/:key', async \(req, res\) => \{/], [src, /router\.post\('\/calcom\/receive\/:token', async \(req, res\) => \{/], [clySrc, /router\.post\('\/receive\/:token', async \(req, res\) => \{/]]) assert.match(file, re);
    const receiver = src.slice(src.indexOf("router.post('/receive/:key'"), src.indexOf('// ═══ Cal.com ═'));
    assert.doesNotMatch(receiver, CALLS);
    const calReceiver = src.slice(src.indexOf("router.post('/calcom/receive/:token'"), src.indexOf('const MEETING_OF'));
    assert.doesNotMatch(calReceiver, CALLS);
    const clyReceiver = clySrc.slice(clySrc.indexOf("router.post('/receive/:token'"), clySrc.indexOf('// ═══ Calendly: booking from the CRM'));
    assert.doesNotMatch(clyReceiver, CALLS);
  });
  test('connecting, the event type, refresh, the webhook and disconnect are owner or admin only already', () => {
    for (const route of ["post('/calcom/connect'", "patch('/calcom'", "post('/calcom/refresh'", "post('/calcom/register-webhook'", "delete('/calcom'"]) assert.ok(src.includes(`router.${route}, requireAuth, requireManageCal,`), route);
    for (const route of ["post('/connect'", "patch('/'", "post('/refresh'", "post('/register-webhook'", "delete('/'"]) assert.ok(clySrc.includes(`router.${route}, requireAuth, requireManage,`), route);
  });
  test('the statements are still written once each (flat text of the source)', () => {
    assert.equal(flat(src).split("FROM webhook_logs l LEFT JOIN contacts c ON c.id = l.contact_id WHERE l.workspace_id=$1 AND l.source='calcom'${visibility.linked(").length, 2);
    assert.equal(flat(clySrc).split("WHERE l.workspace_id=$1 AND l.source='calendly'${visibility.linked(").length, 2);
  });
});
