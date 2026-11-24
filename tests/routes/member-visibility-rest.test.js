// ROUTE tests for "members only see what is assigned to them", the rest (MEMBER_VISIBILITY_CHANGES, 2026-11-25):
// fonio's calls (routes/fonio.js, utils/fonio-calls.js), the workflows' records (routes/journey.js,
// utils/journey-log.js), the bell (routes/notifications.js) and the Engine's delivery log (routes/engine.js).
//
// The real routes on a throwaway server; the database is a stand-in that records every statement. So these show
// WHAT each route asks: for a held member the statement carries the rule with the member's id (or the sees-check is
// asked first), what the rule hides is a 404 / left out and NOTHING is asked or written after it; for an owner, an
// admin and a member of a workspace without the switch the statements are, letter for letter, the ones that shipped.
// What the rule selects on real rows is shown on a real Postgres (the log names the harness).
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadRoute, serve, ROOT } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');

const DEAL_RULE = (d, n) => `(${d}.assigned_to = $${n} OR (${d}.assigned_to IS NULL AND EXISTS (SELECT 1 FROM contacts vc WHERE vc.id = ${d}.contact_id AND vc.assigned_to = $${n})))`;
const CONTACT_RULE = (c, n) => `(${c}.assigned_to = $${n} OR ${c}.contact_type = 'supplier' OR EXISTS (SELECT 1 FROM deals vd WHERE vd.contact_id = ${c}.id AND vd.assigned_to = $${n}))`;
const DEAL = (d, n) => ` AND ${DEAL_RULE(d, n)}`;
const LD = (col, n) => `WHEN ${col} IS NOT NULL THEN EXISTS (SELECT 1 FROM deals ld WHERE ld.id = ${col} AND ${DEAL_RULE('ld', n)})`;
const LC = (col, n) => `WHEN ${col} IS NOT NULL THEN EXISTS (SELECT 1 FROM contacts lc WHERE lc.id = ${col} AND ${CONTACT_RULE('lc', n)})`;
// a row that follows its deal, else its contact; one that names neither is not shown to a held member
const OWN = (t, n) => ` AND (CASE ${LD(`${t}.deal_id`, n)} ${LC(`${t}.contact_id`, n)} ELSE false END)`;
const OWN_DEAL = (col, n) => ` AND (CASE ${LD(col, n)} ELSE false END)`;
const SEES_DEAL = `SELECT 1 FROM deals d WHERE d.id = $1 AND d.workspace_id = $2${DEAL('d', 3)}`;
const SEES_CONTACT = `SELECT 1 FROM contacts c WHERE c.id = $1 AND c.workspace_id = $2 AND ${CONTACT_RULE('c', 3)}`;

const HELD = { id: 12, workspaceId: 7, role: 'member', ownOnly: true };
const FREE = [{ id: 1, workspaceId: 7, role: 'owner' }, { id: 2, workspaceId: 7, role: 'admin' }, { id: 12, workspaceId: 7, role: 'member' }];

const state = { asked: [], answer: null };
const pool = { query: async (sql, params) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  state.asked.push([t, params]);
  return (state.answer && state.answer(t, params)) || { rows: [], rowCount: 0 };
} };
beforeEach(() => { state.asked = []; state.answer = null; });
const call = async (file, mount, user, method, url, body) => {
  const server = await serve({ [mount]: loadRoute(file, { pool, user }) });
  try { return await server.request(method, mount + url, body); } finally { await server.close(); }
};
const find  = re => state.asked.filter(a => re.test(a[0]));
const wrote = () => state.asked.filter(a => /^(INSERT|UPDATE|DELETE|WITH)/.test(a[0]));
const ruled = () => state.asked.filter(a => /\b(vc|vd|ld|lc|nd|nc|nt)\./.test(a[0]));

// ── fonio ────────────────────────────────────────────────────────────────────
const fonio = (user, method, url, body) => call('fonio.js', '/api/integrations/fonio', user, method, url, body);
const CALLS = held => `SELECT f.id, f.trigger, f.status, f.reason, f.raw_number, f.to_number, f.message, f.due_at, f.sent_at, f.attempts, f.created_at, f.deal_id, f.contact_id, f.call_outcome, f.follow_up_of, f.follow_up_no, c.name AS contact_name, d.title AS deal_title, u.name AS cancelled_by_name FROM fonio_calls f LEFT JOIN contacts c ON c.id = f.contact_id LEFT JOIN deals d ON d.id = f.deal_id LEFT JOIN users u ON u.id = f.cancelled_by WHERE f.workspace_id = $1${held} ORDER BY f.created_at DESC, f.id DESC LIMIT $2`;
const LOG_SENT = held => `SELECT f.id, f.sent_at AS at, f.to_number AS number, f.contact_id, c.name AS contact_name, f.deal_id, d.title AS deal_title, f.conversation_link AS link, f.result_at, f.note_activity_id FROM fonio_calls f LEFT JOIN contacts c ON c.id = f.contact_id LEFT JOIN deals d ON d.id = f.deal_id WHERE f.workspace_id = $1 AND f.status = 'sent'${held} ORDER BY f.sent_at DESC, f.id DESC LIMIT $2`;
const LOG_OTHER = held => `SELECT o.id, o.created_at AS at, o.direction, o.number, o.caller_name, o.contact_id, c.name AS contact_name, o.deal_id, d.title AS deal_title, o.conversation_link AS link, o.duration, o.summary, o.note_activity_id FROM fonio_other_calls o LEFT JOIN contacts c ON c.id = o.contact_id LEFT JOIN deals d ON d.id = o.deal_id WHERE o.workspace_id = $1${held} ORDER BY o.created_at DESC, o.id DESC LIMIT $2`;
const LOG_WAITING = held => `SELECT f.id, f.due_at AS at, f.to_number AS number, f.contact_id, c.name AS contact_name, u.name AS asked_by_name, f.deal_id, d.title AS deal_title, f.trigger FROM fonio_calls f LEFT JOIN contacts c ON c.id = f.contact_id LEFT JOIN deals d ON d.id = f.deal_id LEFT JOIN users u ON u.id = f.asked_by WHERE f.workspace_id = $1 AND f.status IN ('scheduled','sending')${held} ORDER BY f.due_at, f.id LIMIT $2`;
const CONNECTION = 'SELECT * FROM workspace_fonio WHERE workspace_id = $1';

describe('fonio: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: the lists unchanged, no question before a call by hand, an unconnected call can be connected`, async () => {
    await fonio(user, 'GET', '/calls');
    await fonio(user, 'GET', '/log');
    assert.deepEqual(state.asked, [[CALLS(''), [7, 50]], [LOG_SENT(''), [7, 100]], [LOG_OTHER(''), [7, 100]], [LOG_WAITING(''), [7, 100]]]);
    state.asked = [];
    const check = await fonio(user, 'GET', '/calls/check?contact_id=40&deal_id=60');
    const made = await fonio(user, 'POST', '/calls', { contact_id: 40, deal_id: 60 });
    assert.deepEqual([check.status, check.body.reason, made.status, made.body.reason], [409, 'not_connected', 409, 'not_connected']);
    assert.deepEqual(state.asked, [[CONNECTION, [7]], [CONNECTION, [7]]], 'straight to the connection, as before');
    state.asked = [];
    const r = await fonio(user, 'POST', '/log/900/contact', { contact_id: 40 });
    assert.deepEqual([r.status, r.body.code], [404, 'not_found']);
    assert.match(state.asked[0][0], /^SELECT id, direction, contact_id, conversation_link, duration, summary, transcript FROM fonio_other_calls WHERE id = \$1 AND workspace_id = \$2$/, 'the row is looked for');
    assert.deepEqual(ruled(), []);
  });
});

describe('fonio: a held member', () => {
  test('the history and the call log hold the calls of the deals and contacts they see; a call that names nobody is not theirs', async () => {
    await fonio(HELD, 'GET', '/calls');
    await fonio(HELD, 'GET', '/log');
    assert.deepEqual(state.asked, [
      [CALLS(OWN('f', 3)), [7, 50, 12]],
      [LOG_SENT(OWN('f', 3)), [7, 100, 12]],
      [LOG_OTHER(OWN('o', 3)), [7, 100, 12]],
      [LOG_WAITING(OWN('f', 3)), [7, 100, 12]],
    ]);
    for (const a of state.asked) assert.ok(a[0].includes('ELSE false END)'), 'no deal and no contact: owners and admins only');
  });
  test('what the list returns is what the page gets: nothing is added back afterwards', async () => {
    state.answer = t => (t === LOG_SENT(OWN('f', 3)) ? { rows: [{ id: 12, at: '2026-11-10T10:00:00.000Z', number: '+49171', contact_id: 40, contact_name: 'Erika', deal_id: 60, deal_title: 'Wohnung 3' }] } : null);
    const r = await fonio(HELD, 'GET', '/log');
    assert.deepEqual(r.body.entries.map(e => e.key), ['call:12']);
    assert.equal(r.body.can_manage, false);
  });
  for (const [name, method, url, body] of [['asking who would be called', 'GET', '/calls/check?contact_id=40', undefined], ['"Call this contact"', 'POST', '/calls', { contact_id: 40 }]]) {
    test(`${name} for a contact they cannot see: answered like a contact that is not there, and nothing else is asked`, async () => {
      const r = await fonio(HELD, method, url, body);
      assert.deepEqual([r.status, r.body], [404, { error: 'Contact not found', reason: 'no_contact' }]);
      assert.deepEqual(state.asked, [[SEES_CONTACT, [40, 7, 12]]]);
    });
  }
  for (const [name, method, url, body] of [['asking who would be called', 'GET', '/calls/check?contact_id=40&deal_id=60', undefined], ['"Call this contact"', 'POST', '/calls', { contact_id: 40, deal_id: 60 }]]) {
    test(`${name} with a deal they cannot see riding along: 404, no call planned`, async () => {
      state.answer = t => (t === SEES_CONTACT ? { rows: [{}] } : null);
      const r = await fonio(HELD, method, url, body);
      assert.deepEqual([r.status, r.body], [404, { error: 'Not found' }]);
      assert.deepEqual(state.asked, [[SEES_CONTACT, [40, 7, 12]], [SEES_DEAL, [60, 7, 12]]]);
      assert.deepEqual(wrote(), []);
    });
  }
  test('a contact and a deal they see: the call goes its usual way', async () => {
    state.answer = t => (t === SEES_CONTACT || t === SEES_DEAL ? { rows: [{}] } : null);
    const check = await fonio(HELD, 'GET', '/calls/check?contact_id=40&deal_id=60');
    assert.deepEqual([check.status, check.body.reason], [409, 'not_connected'], 'the next question is the usual one');
    assert.deepEqual(state.asked.map(a => a[0]), [SEES_CONTACT, SEES_DEAL, CONNECTION]);
    state.asked = [];
    await fonio(HELD, 'POST', '/calls', { contact_id: 40 });
    assert.deepEqual(state.asked.map(a => a[0]), [SEES_CONTACT, CONNECTION], 'no deal named, no question about one');
  });
  test('a call without a contact is not theirs to connect: 404 like a call that is not there, nothing asked or written', async () => {
    const r = await fonio(HELD, 'POST', '/log/900/contact', { contact_id: 40 });
    assert.deepEqual([r.status, r.body], [404, { error: 'Call not found', code: 'not_found' }]);
    assert.deepEqual(state.asked, []);
    assert.equal((await fonio(HELD, 'POST', '/log/x/contact', { contact_id: 40 })).status, 400, 'a bad id is still a bad id');
  });
  test('cancelling a call and a call\'s technical record stay owner and admin only', async () => {
    assert.equal((await fonio(HELD, 'POST', '/calls/14/cancel')).status, 403);
    assert.equal((await fonio(HELD, 'GET', '/log/call/12')).status, 403);
    assert.deepEqual(state.asked, []);
  });
});

// ── workflows ────────────────────────────────────────────────────────────────
const journey = (user, method, url, body) => call('journey.js', '/api/journey', user, method, url, body);
const FLOW = 'SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2';
const COUNTS = held => `SELECT status, COUNT(*)::int AS n FROM journey_runs WHERE flow_id = $1 AND workspace_id = $2 AND root_id IS NULL${held} GROUP BY status`;
const WAITING = held => `SELECT r.deal_id, d.title AS deal_title, r.due_at, n.kind, n.title FROM journey_runs r JOIN deals d ON d.id = r.deal_id LEFT JOIN journey_nodes n ON n.id = r.node_id WHERE r.flow_id = $1 AND r.workspace_id = $2 AND r.status IN ('waiting','working')${held} ORDER BY r.due_at, r.id LIMIT 100`;
const STEPS = held => `SELECT l.deal_id, d.title AS deal_title, l.kind, l.title, l.status, l.detail, l.created_at FROM journey_log l LEFT JOIN deals d ON d.id = l.deal_id WHERE l.flow_id = $1 AND l.workspace_id = $2 AND l.event = 'step'${held} ORDER BY l.id DESC LIMIT 100`;
const HISTORY = held => `SELECT l.id, l.created_at, l.event, l.flow_id, l.flow_name, l.deal_id, l.deal_title, l.kind, l.title, l.status, l.detail, l.actor_name FROM journey_log l WHERE l.workspace_id = $1 AND ($2::int IS NULL OR l.flow_id = $2) AND ($3::int IS NULL OR l.deal_id = $3) AND ($4::text[] IS NULL OR l.event = ANY($4::text[])) AND ($5::text IS NULL OR POSITION(LOWER($5) IN LOWER(l.deal_title)) > 0 OR POSITION(LOWER($5) IN LOWER(l.title)) > 0 OR POSITION(LOWER($5) IN LOWER(l.flow_name)) > 0) AND ($6::int IS NULL OR l.id < $6)${held} ORDER BY l.id DESC LIMIT $7`;
const OWN_RECORD = n => ` AND (l.event = 'flow' OR EXISTS (SELECT 1 FROM deals ld WHERE ld.id = l.deal_id AND ${DEAL_RULE('ld', n)}))`;
const flowThere = t => (t === FLOW ? { rows: [{ id: 3 }] } : null);

describe('workflows: whoever is not held asks exactly what shipped', () => {
  for (const user of FREE) test(`${user.role}: the trace, the record and "include" unchanged`, async () => {
    state.answer = flowThere;
    await journey(user, 'GET', '/flows/3/activity');
    await journey(user, 'GET', '/history?deal_id=5&limit=20');
    assert.deepEqual(state.asked, [[FLOW, [3, 7]], [COUNTS(''), [3, 7]], [WAITING(''), [3, 7]], [STEPS(''), [3, 7]], [HISTORY(''), [7, null, 5, null, null, null, 21]]]);
    state.asked = [];
    const r = await journey(user, 'POST', '/flows/3/include', { deal_id: 5 });
    assert.deepEqual([r.status, r.body.code], [409, 'inactive'], 'the workflow is asked first, as before');
    assert.match(state.asked[0][0], /^SELECT f\.id, f\.workspace_id, f\.activated_at/);
    assert.deepEqual(ruled(), []);
  });
});

describe('workflows: a held member', () => {
  test('the drawings are for everyone: the list of workflows carries no rule', async () => {
    assert.equal((await journey(HELD, 'GET', '/')).status, 200);
    assert.deepEqual(ruled(), []);
    assert.ok(state.asked.length >= 2);
  });
  test('a workflow\'s trace: the counts, who waits and what the steps did are those of the deals they see', async () => {
    state.answer = flowThere;
    assert.equal((await journey(HELD, 'GET', '/flows/3/activity')).status, 200);
    assert.deepEqual(state.asked, [
      [FLOW, [3, 7]],
      [COUNTS(OWN_DEAL('journey_runs.deal_id', 3)), [3, 7, 12]],
      [WAITING(DEAL('d', 3)), [3, 7, 12]],
      [STEPS(OWN_DEAL('l.deal_id', 3)), [3, 7, 12]],
    ]);
  });
  test('the record: the entries of deals they see and what was done to the workflows; an entry of a deal that is gone is left out', async () => {
    assert.equal((await journey(HELD, 'GET', '/history')).status, 200);
    assert.deepEqual(state.asked, [[HISTORY(OWN_RECORD(8)), [7, null, null, null, null, null, 51, 12]]]);
    state.asked = [];
    await journey(HELD, 'GET', '/history?flow_id=3&deal_id=5&group=steps&q=haus&before=90&limit=10');
    assert.deepEqual(state.asked, [[HISTORY(OWN_RECORD(8)), [7, 3, 5, ['step', 'retry'], 'haus', 90, 11, 12]]], 'after every filter of the page, and the member last');
    state.asked = [];
    assert.equal((await journey(HELD, 'GET', '/history?limit=0')).status, 400);
    assert.deepEqual(state.asked, [], 'a refused question asks nothing');
  });
  test('a deal they cannot see is not put into a workflow: answered like a deal of another workspace, nothing started', async () => {
    const r = await journey(HELD, 'POST', '/flows/3/include', { deal_id: 5 });
    assert.deepEqual([r.status, r.body.code], [400, 'deal']);
    assert.deepEqual(state.asked, [[SEES_DEAL, [5, 7, 12]]]);
  });
  test('a deal they see goes its usual way', async () => {
    state.answer = t => (t === SEES_DEAL ? { rows: [{}] } : null);
    const r = await journey(HELD, 'POST', '/flows/3/include', { deal_id: 5 });
    assert.deepEqual([r.status, r.body.code], [409, 'inactive']);
    assert.equal(state.asked[0][0], SEES_DEAL);
    assert.match(state.asked[1][0], /^SELECT f\.id, f\.workspace_id, f\.activated_at/);
  });
});

describe('utils/journey-log.js history: the caller\'s scope', () => {
  const log = require(path.join(ROOT, 'utils', 'journey-log.js'));
  test('without one the statement and its values are the ones that shipped', async () => {
    const asked = [];
    await log.history({ query: async (sql, p) => { asked.push([sql.replace(/\s+/g, ' ').trim(), p]); return { rows: [] }; } }, 7, {});
    assert.deepEqual(asked, [[HISTORY(''), [7, null, null, null, null, null, 51]]]);
  });
  test('with one its piece stands after the last condition, and it is handed the statement\'s own values to add to', async () => {
    const asked = [];
    const out = await log.history({ query: async (sql, p) => { asked.push([sql.replace(/\s+/g, ' ').trim(), p]); return { rows: [{ id: 2 }, { id: 1 }] }; } }, 7, { limit: '1' },
      { scope: params => { params.push('x'); return ` AND l.title = $${params.length}`; } });
    assert.deepEqual(asked, [[HISTORY(' AND l.title = $8'), [7, null, null, null, null, null, 2, 'x']]]);
    assert.deepEqual(out, { entries: [{ id: 2 }], more: true });
  });
  test('a question that is refused never calls the scope', async () => {
    let called = false;
    assert.deepEqual(await log.history({ query: async () => { throw new Error('not asked'); } }, 7, { limit: '0' }, { scope: () => { called = true; return ''; } }), { code: 'history' });
    assert.equal(called, false);
  });
});

describe('utils/fonio-calls.js lists: the caller\'s scope', () => {
  const fc = require(path.join(ROOT, 'utils', 'fonio-calls.js'));
  const db = asked => ({ query: async (sql, p) => { asked.push([sql.replace(/\s+/g, ' ').trim(), p]); return { rows: [] }; } });
  test('without one: the statements and values that shipped', async () => {
    const asked = [];
    await fc.listCalls(db(asked), 7);
    await fc.listLog(db(asked), 7, { limit: 30 });
    assert.deepEqual(asked, [[CALLS(''), [7, 50]], [LOG_SENT(''), [7, 30]], [LOG_OTHER(''), [7, 30]], [LOG_WAITING(''), [7, 30]]]);
  });
  test('with one: each statement gets its own piece for its own table and its own values', async () => {
    const asked = [];
    const scope = (params, t) => { params.push(99); return ` AND ${t}.id > $${params.length}`; };
    await fc.listCalls(db(asked), 7, { scope });
    await fc.listLog(db(asked), 7, { scope });
    assert.deepEqual(asked, [[CALLS(' AND f.id > $3'), [7, 50, 99]], [LOG_SENT(' AND f.id > $3'), [7, 100, 99]], [LOG_OTHER(' AND o.id > $3'), [7, 100, 99]], [LOG_WAITING(' AND f.id > $3'), [7, 100, 99]]]);
    assert.notEqual(asked[1][1], asked[2][1], 'never one array shared by two statements');
  });
});

// ── the bell ─────────────────────────────────────────────────────────────────
const bell = (user, method, url, body) => call('notifications.js', '/api/notifications', user, method, url, body);
const BELL = held => `SELECT n.*, u.name AS actor_name FROM notifications n LEFT JOIN users u ON u.id = n.actor_id WHERE n.user_id = $1${held} ORDER BY n.created_at DESC LIMIT 50`;
const OWN_BELL = n => ` AND (CASE WHEN n.entity_id IS NULL THEN true WHEN n.entity_type = 'deal' THEN EXISTS (SELECT 1 FROM deals nd WHERE nd.id = n.entity_id AND nd.workspace_id = n.workspace_id AND ${DEAL_RULE('nd', n)}) WHEN n.entity_type = 'contact' THEN EXISTS (SELECT 1 FROM contacts nc WHERE nc.id = n.entity_id AND nc.workspace_id = n.workspace_id AND ${CONTACT_RULE('nc', n)}) WHEN n.entity_type = 'task' THEN EXISTS (SELECT 1 FROM tasks nt WHERE nt.id = n.entity_id AND nt.workspace_id = n.workspace_id AND ${TASK_RULE('nt', n)}) ELSE true END)`;
// the Tasks page's rule (utils/task-visibility.js), written out: what the task names, and for a subtask its parent too
const TASK_OWN = (t, n) => `(CASE ${LD(`${t}.deal_id`, n)} ${LC(`${t}.contact_id`, n)} ELSE true END)`;
function TASK_RULE(t, n) { return `(${TASK_OWN(t, n)} AND (${t}.parent_id IS NULL OR EXISTS (SELECT 1 FROM tasks pt WHERE pt.id = ${t}.parent_id AND ${TASK_OWN('pt', n)})))`; }

describe('the bell', () => {
  for (const user of FREE) test(`${user.role}: exactly the statement that shipped`, async () => {
    await bell(user, 'GET', '/');
    assert.deepEqual(state.asked, [[BELL(''), [user.id]]]);
  });
  test('a held member: a notification about a deal, a contact or a task follows it; one that names nothing stays', async () => {
    state.answer = () => ({ rows: [{ id: 3, read: false }, { id: 2, read: true }, { id: 1, read: false }] });
    const r = await bell(HELD, 'GET', '/');
    assert.deepEqual(state.asked, [[BELL(OWN_BELL(2)), [12, 12]]]);
    assert.deepEqual([r.body.notifications.length, r.body.unread], [3, 2], 'the unread count is of what the member gets');
  });
  test('a task is judged by the Tasks page\'s own rule, not by one written a second time here', () => {
    const src = read('routes/notifications.js');
    assert.match(src, /const taskRule\s+= require\('\.\.\/utils\/task-visibility'\);/);
    assert.match(src, /FROM tasks nt WHERE nt\.id = n\.entity_id AND nt\.workspace_id = n\.workspace_id AND \$\{taskRule\.rule\('nt', n\)\}\)/);
    assert.equal(require(path.join(ROOT, 'utils', 'task-visibility.js')).rule('nt', 2), TASK_RULE('nt', 2));
  });
  test('the three kinds a notification is written with are the three the rule knows', () => {
    const kinds = new Set();
    for (const file of ['routes/deals.js', 'routes/contacts.js', 'routes/tasks.js', 'routes/fonio.js', 'routes/notetaker.js', 'routes/integrations.js', 'routes/activities.js', 'routes/activity-comments.js', 'utils/journey-run.js', 'utils/fonio-stage.js', 'routes/calendly.js', 'routes/objects.js', 'routes/calendar.js']) {
      const src = read(file);
      for (const m of src.matchAll(/entityType:\s*([^,}]+)[,}]/g)) for (const k of m[1].matchAll(/'(\w+)'/g)) kinds.add(k[1]);
      for (const m of src.matchAll(/dealId \? '(\w+)' : '(\w+)'/g)) { kinds.add(m[1]); kinds.add(m[2]); }
    }
    assert.deepEqual([...kinds].sort(), ['contact', 'deal', 'task'], 'a new kind must be given its rule in routes/notifications.js ownBell()');
  });
  test('marking read and clearing stay the member\'s own rows only', async () => {
    await bell(HELD, 'PATCH', '/5/read');
    await bell(HELD, 'PATCH', '/read-all');
    await bell(HELD, 'DELETE', '/clear');
    assert.deepEqual(state.asked.map(a => a[1]), [['5', 12], [12], [12]]);
    assert.ok(state.asked.every(a => /user_id=\$[12]/.test(a[0])));
  });
});

// ── the Engine's delivery log ────────────────────────────────────────────────
const engine = (user, method, url, body) => call('engine.js', '/api/engine', user, method, url, body);
const DELIVERIES = held => `SELECT d.id, d.event, d.event_id, d.status, d.attempts, d.last_status_code, d.last_error, d.deal_id, d.contact_id, d.payload, d.created_at, d.delivered_at, d.next_attempt_at, d.last_attempt_at, dl.title AS deal_title, c.name AS contact_name FROM engine_deliveries d LEFT JOIN deals dl ON dl.id = d.deal_id AND dl.workspace_id = d.workspace_id LEFT JOIN contacts c ON c.id = d.contact_id AND c.workspace_id = d.workspace_id WHERE d.workspace_id=$1${held} ORDER BY d.created_at DESC LIMIT 50`;

describe('the Engine\'s delivery log', () => {
  for (const user of FREE) test(`${user.role}: exactly the statement that shipped`, async () => {
    await engine(user, 'GET', '/deliveries');
    assert.deepEqual(state.asked, [[DELIVERIES(''), [7]]]);
  });
  test('a held member: the deliveries of deals and contacts they see; a test event or one whose deal and contact are gone is not theirs', async () => {
    await engine(HELD, 'GET', '/deliveries');
    assert.deepEqual(state.asked, [[DELIVERIES(OWN('d', 2)), [7, 12]]]);
  });
  test('the onboarding monitor, a retry and a test event stay owner and admin only', async () => {
    assert.equal((await engine(HELD, 'GET', '/onboarding')).status, 403);
    assert.equal((await engine(HELD, 'POST', '/deliveries/5/retry')).status, 403);
    assert.equal((await engine(HELD, 'POST', '/test-event')).status, 403);
    assert.deepEqual(state.asked, []);
  });
});

// ── read and found to hold nothing about a deal or a contact ─────────────────
describe('the route files that were read and left as they are', () => {
  test('no statement in them reads a deal or a contact', () => {
    for (const file of ['chat.js', 'mailbox.js', 'note-templates.js', 'break-scores.js', 'invites.js', 'platform.js', 'journey-fixed.js', 'journey-mail.js', 'deal-fields.js', 'fields.js', 'object-fields.js']) {
      assert.doesNotMatch(read(`routes/${file}`), /(FROM|JOIN|UPDATE|INTO)\s+(deals|contacts|activities|tasks|fonio_calls|journey_runs|journey_log)\b/i, file);
    }
  });
  test('routes/workspace.js touches contacts and deals only where the owner removes a member or the workspace', () => {
    const src = read('routes/workspace.js');
    const hits = [...src.matchAll(/(FROM|JOIN|UPDATE|INTO)\s+(deals|contacts)\b[^\n]*/g)].map(m => m[0]);
    assert.equal(hits.length, 3, hits.join('\n'));
    const remove = src.slice(src.indexOf("router.delete('/members/:id'"), src.indexOf("router.patch('/members/:id/role'"));
    const gone   = src.slice(src.indexOf("router.delete('/', "), src.indexOf("router.patch('/member-visibility'"));
    for (const block of [remove, gone]) assert.match(block.slice(0, 200), /if \(req\.userRole !== 'owner'\) return res\.status\(403\)/);
    assert.equal(hits.filter(h => remove.includes(h) || gone.includes(h)).length, 3);
  });
});
