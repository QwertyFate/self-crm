// UNIT tests for utils/journey-create.js (ASSISTANT_CHANGES, 2026-11-24): a whole workflow made in one piece — the
// one way a workflow is written that was not clicked together on the board (the admin console's assistant proposes
// it, the admin's click makes it).
//
// The checks are the journey's own: `boxes` is what the real routes/journey.js hands out (router.boxes), so a box is
// refused here exactly where the Workflows page would refuse it. The database is a stand-in that knows the module's
// statements and those of the journey's reference checks, and no others; it keeps what is written as rows, and its
// connection writes down how a transaction is bracketed. How a made workflow reads back and runs on a real Postgres
// is the change log's database run.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute } = require('../helpers/load-route');
const { read } = require('../helpers/client-fn');
const maker = require('../../utils/journey-create');
const triggers = require('../../utils/journey-triggers');

const flat = sql => String(sql).replace(/\s+/g, ' ').trim();
const WID = 7, OTHER = 8, STAMP = '2026-11-24T15:00:00.123456Z';
const state = {};
function reset() {
  Object.assign(state, { sql: [], seq: [], broken: null, nextId: 500,
    workspaces: [WID, OTHER],
    stages: [{ id: 30, ws: WID }, { id: 31, ws: WID }, { id: 80, ws: OTHER }],
    webhooks: [{ id: 12, ws: WID }, { id: 90, ws: OTHER }],
    pipelines: [{ id: 3, ws: WID }, { id: 9, ws: OTHER }],
    dealFields: [{ ws: WID, key: 'budget', type: 'number' }, { ws: WID, key: 'closing', type: 'date' }, { ws: OTHER, key: 'theirs', type: 'text' }],
    contactFields: [{ ws: WID, key: 'city', type: 'text' }],
    users: [{ id: 3, ws: WID }, { id: 99, ws: OTHER }],
    flows: [{ id: 200, workspace_id: OTHER, name: 'Theirs', active: false, activated_at: null, updated_at: STAMP }],
    nodes: [], runs: [] });
}
const TABLES = { pipeline_stages: 'stages', workspace_webhook: 'webhooks', pipelines: 'pipelines' };
async function query(sql, p = []) {
  const t = flat(sql);
  state.sql.push({ sql: t, params: p });
  if (state.broken && state.broken(t)) throw new Error('the database is away');
  if (t === 'SELECT id FROM workspaces WHERE id = $1' || t === 'SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE') return { rows: state.workspaces.includes(p[0]) ? [{ id: p[0] }] : [] };
  if (t === 'SELECT COUNT(*)::int AS n FROM journey_flows WHERE workspace_id = $1') return { rows: [{ n: state.flows.filter(f => f.workspace_id === p[0]).length }] };
  // the journey's own reference checks (routes/journey.js, utils/journey-triggers.js, -branch.js, -ends.js)
  const own = /^SELECT id FROM (pipeline_stages|workspace_webhook|pipelines) WHERE workspace_id = \$1 AND id = ANY\(\$2::int\[\]\)$/.exec(t);
  if (own) return { rows: state[TABLES[own[1]]].filter(r => r.ws === p[0] && p[1].includes(r.id)).map(r => ({ id: r.id })) };
  if (t === 'SELECT type FROM deal_fields WHERE workspace_id = $1 AND field_key = $2') return { rows: state.dealFields.filter(f => f.ws === p[0] && f.key === p[1]).map(f => ({ type: f.type })) };
  if (t === 'SELECT type FROM custom_fields WHERE workspace_id = $1 AND field_key = $2') return { rows: state.contactFields.filter(f => f.ws === p[0] && f.key === p[1]).map(f => ({ type: f.type })) };
  if (t === 'SELECT u.id FROM users u WHERE u.id = ANY($2::int[]) AND (u.workspace_id = $1 OR EXISTS (SELECT 1 FROM user_workspaces uw WHERE uw.user_id = u.id AND uw.workspace_id = $1))') return { rows: state.users.filter(u => u.ws === p[0] && p[1].includes(u.id)).map(u => ({ id: u.id })) };
  if (t === `SELECT f.id, s.config FROM journey_flows f LEFT JOIN journey_nodes s ON s.flow_id = f.id AND s.kind = 'start' WHERE f.workspace_id = $1`) return { rows: state.flows.filter(f => f.workspace_id === p[0]).map(f => ({ id: f.id, config: (state.nodes.find(n => n.flow_id === f.id && n.kind === 'start') || {}).config || null })) };
  if (t === 'SELECT id FROM journey_flows WHERE id = $1 AND workspace_id = $2') return { rows: state.flows.filter(f => f.id === p[0] && f.workspace_id === p[1]).map(f => ({ id: f.id })) };
  // what the maker writes
  if (t === `INSERT INTO journey_flows (workspace_id, name) VALUES ($1, $2) RETURNING id, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`) {
    const flow = { id: state.nextId++, workspace_id: p[0], name: p[1], active: false, activated_at: null, updated_at: STAMP };   // off, as the table's default makes it
    state.flows.push(flow); return { rows: [{ id: flow.id, updated_at: STAMP }] };
  }
  if (t === `INSERT INTO journey_nodes (workspace_id, flow_id, kind, config) VALUES ($1, $2, 'start', $3::jsonb) RETURNING id`) {
    const node = { id: state.nextId++, workspace_id: p[0], flow_id: p[1], kind: 'start', title: '', body: '', wait_minutes: 0, config: JSON.parse(p[2]), next_id: null, else_id: null, x: null, y: null };
    state.nodes.push(node); return { rows: [{ id: node.id }] };
  }
  if (t === 'INSERT INTO journey_nodes (workspace_id, flow_id, kind, title, body, wait_minutes, config) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id') {
    const node = { id: state.nextId++, workspace_id: p[0], flow_id: p[1], kind: p[2], title: p[3], body: p[4], wait_minutes: p[5], config: JSON.parse(p[6]), next_id: null, else_id: null, x: null, y: null };
    state.nodes.push(node); return { rows: [{ id: node.id }] };
  }
  if (t === 'UPDATE journey_nodes SET next_id = $4, else_id = $5, config = $6::jsonb WHERE id = $1 AND workspace_id = $2 AND flow_id = $3') {
    const node = state.nodes.find(n => n.id === p[0] && n.workspace_id === p[1] && n.flow_id === p[2]);
    if (node) Object.assign(node, { next_id: p[3], else_id: p[4], config: JSON.parse(p[5]) });
    return { rows: [], rowCount: node ? 1 : 0 };
  }
  const AS_MADE = 'f.id = $1 AND f.workspace_id = $2 AND f.active = false AND f.activated_at IS NULL AND f.updated_at = $3::timestamptz AND NOT EXISTS (SELECT 1 FROM journey_runs r WHERE r.flow_id = f.id) AND NOT EXISTS (SELECT 1 FROM journey_nodes n WHERE n.flow_id = f.id AND (n.x IS NOT NULL OR n.y IS NOT NULL))';
  const asMade = f => f.id === p[0] && f.workspace_id === p[1] && f.active === false && f.activated_at === null && f.updated_at === p[2] && !state.runs.some(r => r.flow_id === f.id)
    && !state.nodes.some(n => n.flow_id === f.id && (n.x !== null || n.y !== null));   // a box somebody placed on the board
  if (t === `SELECT f.id FROM journey_flows f WHERE ${AS_MADE}`) return { rows: state.flows.filter(asMade).map(f => ({ id: f.id })) };
  if (t === `DELETE FROM journey_flows f WHERE ${AS_MADE} RETURNING f.id`) {
    const gone = state.flows.filter(asMade);
    state.flows = state.flows.filter(f => !gone.includes(f)); state.nodes = state.nodes.filter(n => !gone.some(f => f.id === n.flow_id));
    return { rows: gone.map(f => ({ id: f.id })) };
  }
  throw new Error(`a statement nobody expected: ${t}`);
}
// The pool: its connection writes down how a transaction is bracketed, and undoes what was written when it is rolled back.
const pool = {
  query: async (sql, p) => { state.seq.push('pool'); return query(sql, p); },
  connect: async () => {
    state.seq.push('connect');
    let kept = null;
    return {
      query: async (sql, p) => {
        const t = flat(sql);
        if (t === 'BEGIN') { state.seq.push('BEGIN'); kept = { flows: [...state.flows], nodes: state.nodes.map(n => ({ ...n })) }; return { rows: [] }; }
        if (t === 'COMMIT') { state.seq.push('COMMIT'); kept = null; return { rows: [] }; }
        if (t === 'ROLLBACK') { state.seq.push('ROLLBACK'); if (kept) Object.assign(state, kept); kept = null; return { rows: [] }; }
        state.seq.push(t.split(' ').slice(0, 3).join(' '));
        return query(sql, p);
      },
      release: () => state.seq.push('release'),
    };
  },
};
const boxes = loadRoute('journey.js', { pool }).boxes;   // the journey's own checks, limits and sentences
beforeEach(reset);

// The contract's example: a lead comes in, an email, two days, a question, a task — and a router beside it.
const SPEC = () => ({
  name: '  Welcome new leads ', explain: 'for people',
  start: { config: { trigger: 'lead', webhook_ids: [12], pipeline_id: 3, stop_stage_ids: [31] }, next: 'mail1', explain: 'x' },
  steps: [
    { key: 'mail1', kind: 'email', title: ' Welcome ', body: 'Hello {{first_name|there}}', wait_minutes: 0, config: {}, next: 'wait1', explain: 'x' },
    { key: 'wait1', kind: 'wait', wait_minutes: 2880, config: {}, next: 'ask1' },
    { key: 'ask1', kind: 'branch', config: { test: 'stage', stage_ids: [30] }, next: 'task1', else: 'r1' },
    { key: 'task1', kind: 'task', title: 'Call the lead', body: 'Today', wait_minutes: 0, config: {}, next: null },
    { key: 'r1', kind: 'router', config: {}, routes: [{ name: 'Hot', when: { test: 'urgency', min_urgency: 3 }, next: 'move1' }, { name: 'Everyone', when: null, next: null }], else: 'task1' },
    { key: 'move1', kind: 'move', config: { stage_id: 31 }, next: null },
  ],
});
const check = (spec, wid = WID, tz = 'Europe/Vienna') => maker.check(pool, wid, spec, { boxes, tz });
const create = (spec, more = {}, wid = WID) => maker.create(pool, wid, spec, { boxes, tz: 'Europe/Vienna', ...more });
const where = out => out.problems.map(p => `${p.where}:${p.code}`);

describe('check: a workflow that can be made', () => {
  test('the plan is the boxes as they will be written — checked by the journey\'s own checks, in the order they were handed in', async () => {
    const out = await check(SPEC());
    assert.equal(out.ok, true);
    assert.deepEqual(out.plan.name, 'Welcome new leads');
    assert.deepEqual(out.plan.start, { config: { trigger: 'lead', webhook_ids: [12], stage_id: null, stop_stage_ids: [31], pipeline_id: 3 }, next: 'mail1' });
    assert.deepEqual(out.plan.steps.map(s => s.key), ['mail1', 'wait1', 'ask1', 'task1', 'r1', 'move1']);
    assert.deepEqual(out.plan.steps[0], { key: 'mail1', kind: 'email', title: 'Welcome', body: 'Hello {{first_name|there}}', wait: 0, config: { tz: 'Europe/Vienna' }, next: 'wait1', else: null, routes: [] });
    assert.deepEqual(out.plan.steps[1], { key: 'wait1', kind: 'wait', title: '', body: '', wait: 2880, config: {}, next: 'ask1', else: null, routes: [] });
    assert.deepEqual(out.plan.steps[2], { key: 'ask1', kind: 'branch', title: '', body: '', wait: 0, config: { test: 'stage', stage_ids: [30] }, next: 'task1', else: 'r1', routes: [] });
    const r1 = out.plan.steps[4];
    assert.deepEqual(r1.config, boxes.actionOf('router', { config: { routes: [{ name: 'Hot', when: { test: 'urgency', min_urgency: 3 } }, { name: 'Everyone', when: null }] } }, 'Europe/Vienna').config, 'the router as the board would save it');
    assert.deepEqual(r1.routes, [{ id: 1, name: 'Hot', when: r1.config.routes[0].when, next: 'move1' }, { id: 2, name: 'Everyone', when: null, next: null }]);
    assert.deepEqual([r1.next, r1.else], [null, 'task1']);
    assert.deepEqual(out.plan.steps[5].config, { stage_id: 31 });
    assert.equal(JSON.stringify(out.plan).includes('explain'), false, 'what is written for people is not part of the workflow');
  });
  test('it only asks: nothing is written, and no connection is taken', async () => {
    await check(SPEC());
    assert.equal(state.sql.every(q => /^SELECT /.test(q.sql)), true);
    assert.deepEqual([state.seq.includes('connect'), state.flows.length, state.nodes.length], [false, 1, 0]);
    assert.deepEqual(state.sql[0], { sql: 'SELECT id FROM workspaces WHERE id = $1', params: [WID] });
  });
  test('each box is what the journey\'s own check makes of it, with the clock of who it is saved for', async () => {
    const spec = { name: 'T', start: { config: { trigger: 'schedule', stage_id: 30, weekdays: [5, 1, 1], at: '08:30' }, next: 'w' },
      steps: [{ key: 'w', kind: 'wait', wait_minutes: 0, config: { until: '09:00', weekdays: [1, 2] }, next: 'c' }, { key: 'c', kind: 'call', title: 'Call', next: 's' }, { key: 's', kind: 'sms', title: 'SMS', body: 'x', next: 'q' },
        { key: 'q', kind: 'branch', config: { test: 'deal_age', op: 'before', date: '2026-12-31', tz: 'Asia/Tokyo' }, next: null, else: null }] };
    const out = await check(spec, WID, 'Europe/Vienna');
    assert.equal(out.ok, true);
    assert.deepEqual(out.plan.start.config, triggers.checkStart(spec.start.config, { tz: 'Europe/Vienna' }).config);
    assert.equal(out.plan.start.config.tz, 'Europe/Vienna');
    for (const [i, step] of spec.steps.entries()) {
      const want = boxes.actionOf(step.kind, { title: step.title, body: step.body, wait_minutes: step.wait_minutes, config: step.config }, 'Europe/Vienna');
      assert.deepEqual([out.plan.steps[i].title, out.plan.steps[i].body, out.plan.steps[i].wait, out.plan.steps[i].config], [want.title, want.body, want.wait, want.config], step.key);
    }
    assert.deepEqual([out.plan.steps[0].config.tz, out.plan.steps[3].config.tz], ['Europe/Vienna', 'Europe/Vienna'], 'never a zone that was sent');
    assert.equal((await maker.check(pool, WID, spec, { boxes })).plan.steps[0].config.tz, triggers.FALLBACK_ZONE, 'no zone handed in: the journey\'s own fallback');
  });
  test('a start alone is a workflow; what a box does not have may be left out, null or empty', async () => {
    assert.deepEqual((await check({ name: 'Only a start', start: { config: { trigger: 'deal_new' }, next: null } })).plan.steps, []);
    assert.equal((await check({ name: 'T', start: { config: { trigger: 'deal_new' } }, steps: [] })).ok, true);
    const out = await check({ name: 'T', start: { config: { trigger: 'deal_new' }, next: 'a' },
      steps: [{ key: 'a', kind: 'task', title: 'T', body: null, wait_minutes: null, config: null, next: null, else: null, routes: [] }, ] });
    assert.deepEqual(out.plan.steps[0], { key: 'a', kind: 'task', title: 'T', body: '', wait: 0, config: { tz: 'Europe/Vienna' }, next: null, else: null, routes: [] });
  });
  test('two lines may lead to the same box: that is no circle', async () => {
    const out = await check({ name: 'T', start: { config: { trigger: 'deal_new' }, next: 'q' },
      steps: [{ key: 'q', kind: 'branch', config: { test: 'has_email' }, next: 'a', else: 'b' }, { key: 'a', kind: 'task', title: 'A', next: 'end' }, { key: 'b', kind: 'task', title: 'B', next: 'end' }, { key: 'end', kind: 'task', title: 'End' }] });
    assert.equal(out.ok, true);
  });
});

describe('check: every problem at once', () => {
  test('a workflow with something wrong everywhere: each thing is said, with where it is', async () => {
    const out = await check({ name: '   ', start: { config: { stop_stage_ids: [31] }, next: 'ghost' },
      steps: [
        { key: 'Mail', kind: 'email', title: 'x' }, { key: 'dup', kind: 'task', title: 'x' }, { key: 'dup', kind: 'task', title: 'x' }, 'not a box',
        { key: 'a', kind: 'teleport' },
        { key: 'b', kind: 'email', title: '', body: 'x' },
        { key: 'c', kind: 'task', title: 'x', wait_minutes: -5 },
        { key: 'd', kind: 'branch', config: { test: 'weather' } },
        { key: 'e', kind: 'router', routes: Array.from({ length: 7 }, () => ({})) },
        { key: 'f', kind: 'move', config: {} },
        { key: 'g', kind: 'wait', wait_minutes: 0, config: {} },
        { key: 'h', kind: 'task', title: 'x', next: 'nowhere', else: 'a', routes: [{ next: 'a' }] },
        { key: 'i', kind: 'router', routes: [{ name: 'One', when: null, next: 'gone' }], next: 'a' },
        { key: 'j', kind: 'task', title: 'x', next: 5 },
        { key: 'k', kind: 'move', config: { stage_id: 80 } },
      ] });
    assert.equal(out.ok, false);
    assert.deepEqual(where(out), ['name:name', 'steps:key', 'steps:key', 'steps:key', 'a:kind', 'b:title', 'c:wait', 'd:branch', 'e:router', 'f:stage', 'g:until',
      'h:line', 'h:line', 'h:line', 'i:line', 'i:line', 'j:line', 'start:line',
      'dup:unreachable', 'a:unreachable', 'b:unreachable', 'c:unreachable', 'd:unreachable', 'e:unreachable', 'f:unreachable', 'g:unreachable', 'h:unreachable', 'i:unreachable', 'j:unreachable', 'k:unreachable',
      'start:start', 'k:stage']);
    assert.deepEqual(out.problems.filter(p => p.where === 'steps').map(p => /\((box \d+)\)$/.exec(p.message)[1]), ['box 1', 'box 3', 'box 4'], 'a box without a usable key is named by its place');
    assert.equal(Object.hasOwn(out, 'plan'), false);
  });
  test('what is the journey\'s to say is said in the journey\'s own sentence; the maker\'s own problems have their own', async () => {
    const out = await check({ name: 'x'.repeat(81), start: { config: { trigger: 'stage' } }, steps: [{ key: 'b', kind: 'email', title: '' }, { key: 'b' }, { key: 'c', kind: 'task', title: 'x', next: 'zzz' }] });
    const said = Object.fromEntries(out.problems.map(p => [`${p.where}:${p.code}`, p.message]));
    assert.equal(said['name:name'], boxes.ERRORS.name[1]);
    assert.equal(said['b:title'], boxes.ERRORS.title[1]);
    assert.equal(said['start:stage'], boxes.ERRORS.stage[1]);
    assert.equal(said['steps:key'], `${maker.MESSAGES.key} (box 2)`);
    assert.equal(said['c:line'], `${maker.MESSAGES.line} (no box is called "zzz")`);
    assert.equal(said['c:unreachable'], maker.MESSAGES.unreachable);
    for (const code of ['title', 'body', 'wait', 'branch', 'router', 'until', 'stage', 'user', 'webhooks', 'start', 'field', 'pipeline', 'flow', 'kind', 'nodes_limit', 'name']) assert.equal(typeof boxes.ERRORS[code][1], 'string', code);
    assert.deepEqual(Object.keys(maker.MESSAGES).sort(), ['key', 'line', 'steps', 'unreachable', 'workspace']);
    // two of the maker's codes are words the journey's routes use too: "line" means the same there; "unreachable" is, there,
    // Google not answering — a refusal of the mail routes that no check of a box ever gives. Here the maker's sentence is said.
    assert.deepEqual(Object.keys(maker.MESSAGES).filter(code => Object.hasOwn(boxes.ERRORS, code)), ['line', 'unreachable']);
    assert.notEqual(said['c:unreachable'], boxes.ERRORS.unreachable[1]);
    const journey = read('routes/journey.js'), checks = journey.slice(journey.indexOf('function actionOf('), journey.indexOf('// The workspace\'s workflows with their boxes'));
    assert.doesNotMatch(checks + read('utils/journey-triggers.js') + read('utils/journey-branch.js') + read('utils/journey-router.js') + read('utils/journey-ends.js'), /code: 'unreachable'|return 'unreachable'/, 'no check of a box answers "unreachable"');
  });
  test('a key is a lower-case letter and up to 29 more letters, digits or underscores', async () => {
    const one = key => check({ name: 'T', start: { config: { trigger: 'deal_new' }, next: typeof key === 'string' ? key : null }, steps: [{ key, kind: 'task', title: 'x' }] });
    for (const key of ['a', 'mail_1', 'x'.repeat(30), 'a9_']) assert.equal((await one(key)).ok, true, key);
    for (const key of ['', 'A', '1a', '_a', 'a-b', 'a b', 'x'.repeat(31), 'ä', 5, null, undefined, ['a'], 'start;DROP']) assert.equal(where(await one(key)).includes('steps:key'), true, String(key));
  });
  test('steps that are no list, and more boxes than a workflow holds', async () => {
    assert.deepEqual(where(await check({ name: 'T', start: { config: { trigger: 'deal_new' } }, steps: { a: 1 } })), ['steps:steps']);
    const many = n => ({ name: 'T', start: { config: { trigger: 'deal_new' }, next: 'k0' }, steps: Array.from({ length: n }, (_, i) => ({ key: `k${i}`, kind: 'task', title: 'x', next: i + 1 < n ? `k${i + 1}` : null })) });
    assert.equal((await check(many(boxes.MAX_NODES - 1))).ok, true, 'with its start, as many as the board allows');
    assert.deepEqual(where(await check(many(boxes.MAX_NODES))), ['steps:nodes_limit']);
  });
  test('a spec that is no workflow at all is refused in words, never with a throw', async () => {
    for (const spec of [null, undefined, 'x', 5, [], {}]) {
      const out = await check(spec);
      assert.deepEqual(where(out), ['name:name', 'start:start'], JSON.stringify(spec));
    }
  });
  test('a start that says nothing of what starts the workflow: one that could never be switched on is not made', async () => {
    for (const config of [{}, { trigger: null }, { trigger: null, stop_stage_ids: [31] }]) {
      const out = await check({ name: 'T', start: { config } });
      assert.deepEqual(out.problems, [{ where: 'start', code: 'start', message: `${boxes.ERRORS.start[1]} (it does not say what starts the workflow)` }], JSON.stringify(config));
    }
    for (const start of [undefined, null, 'x', {}, { config: 'x' }, { config: { trigger: 'weather' } }]) assert.deepEqual(where(await check({ name: 'T', start })), ['start:start'], JSON.stringify(start));
    for (const key of Object.keys(triggers.TRIGGERS).filter(k => !triggers.TRIGGERS[k].uses.some(u => ['stage_id', 'field_key', 'result', 'hours', 'days', 'weekdays', 'at', 'flow_id'].includes(u)))) {
      assert.equal((await check({ name: 'T', start: { config: { trigger: key } } })).ok, true, key);
    }
  });
});

describe('check: the lines', () => {
  const flow = steps => ({ name: 'T', start: { config: { trigger: 'deal_new' }, next: steps[0].key }, steps });
  const task = (key, next = null) => ({ key, kind: 'task', title: key, next });
  test('round in a circle — by a box\'s own line, a branch\'s "no", a router\'s route or its "otherwise" — is said at the box that closes it, with the way round', async () => {
    let out = await check(flow([task('a', 'a')]));
    assert.deepEqual(out.problems.map(p => [p.where, p.code, /\((.*)\)$/.exec(p.message)[1]]), [['a', 'line', 'round in a circle: a → a']]);
    out = await check(flow([task('a', 'b'), task('b', 'c'), task('c', 'b')]));
    assert.deepEqual(out.problems.map(p => [p.where, /\((.*)\)$/.exec(p.message)[1]]), [['c', 'round in a circle: b → c → b']]);
    out = await check(flow([{ key: 'q', kind: 'branch', config: { test: 'has_email' }, next: 'a', else: 'q' }, task('a')]));
    assert.deepEqual(where(out), ['q:line']);
    out = await check(flow([{ key: 'r', kind: 'router', routes: [{ name: 'A', next: 'a' }, { name: 'B', next: 'b' }], else: null }, task('a'), task('b', 'r')]));
    assert.deepEqual(out.problems.map(p => [p.where, /\((.*)\)$/.exec(p.message)[1]]), [['b', 'round in a circle: r → b → r']]);
    out = await check(flow([task('a', 'r'), { key: 'r', kind: 'router', routes: [{ name: 'A', next: null }], else: 'a' }]));
    assert.deepEqual(where(out), ['r:line']);
  });
  test('a line names a box of this workflow by its key, or nothing', async () => {
    for (const next of ['ghost', 'start', '', 'A', 5, true, ['a'], { key: 'a' }]) assert.deepEqual(where(await check(flow([task('a', next)]))), ['a:line'], JSON.stringify(next));
    assert.deepEqual(where(await check({ name: 'T', start: { config: { trigger: 'deal_new' }, next: 'ghost' }, steps: [] })), ['start:line']);
    assert.deepEqual(where(await check({ name: 'T', start: { config: { trigger: 'deal_new' }, next: 7 }, steps: [] })), ['start:line']);
  });
  test('only a branch and a router have "else", only a router has "routes", and a router has no "next"', async () => {
    for (const kind of boxes.ACTIONS.filter(k => !['branch', 'router'].includes(k))) {
      const base = { key: 'a', kind, title: 'x', body: 'x', wait_minutes: 5, config: kind === 'move' ? { stage_id: 30 } : {} };
      assert.deepEqual(where(await check(flow([{ ...base, else: 'b' }, task('b')]))), ['a:line', 'b:unreachable'], `${kind}: else`);
      assert.deepEqual(where(await check(flow([{ ...base, routes: [{ name: 'x', next: null }] }]))), ['a:line'], `${kind}: routes`);
      assert.equal((await check(flow([{ ...base, next: 'b' }, task('b')]))).ok, true, `${kind}: next`);
    }
    assert.equal((await check(flow([{ key: 'q', kind: 'branch', config: { test: 'has_phone' }, next: 'a', else: 'b' }, task('a'), task('b')]))).ok, true);
    assert.deepEqual(where(await check(flow([{ key: 'q', kind: 'branch', config: { test: 'has_phone' }, routes: [{ name: 'x' }] }]))), ['q:line']);
    assert.deepEqual(where(await check(flow([{ key: 'r', kind: 'router', routes: [{ name: 'x', next: null }], next: 'a' }, task('a')]))), ['r:line', 'a:unreachable']);
    assert.deepEqual(where(await check(flow([{ key: 'r', kind: 'router', routes: [{ name: 'x', next: 'nope' }, { name: 'y', next: 'a' }] }, task('a')]))), ['r:line']);
  });
  test('a box no line leads to is said — also every box behind one, and every box when the start leads nowhere', async () => {
    assert.deepEqual(where(await check(flow([task('a'), task('b', 'c'), task('c')]))), ['b:unreachable', 'c:unreachable']);
    assert.deepEqual(where(await check({ name: 'T', start: { config: { trigger: 'deal_new' }, next: null }, steps: [task('a')] })), ['a:unreachable']);
    const reached = await check(flow([{ key: 'r', kind: 'router', routes: [{ name: 'A', next: 'a' }], else: 'b' }, task('a'), task('b', 'c'), task('c')]));
    assert.equal(reached.ok, true, 'reached through a route and through "otherwise"');
  });
});

describe('check: what a box names must be the workspace\'s own', () => {
  const one = (step, start = { trigger: 'deal_new' }) => check({ name: 'T', start: { config: start, next: step ? step.key : null }, steps: step ? [step] : [] });
  test('a stage, a person, a field in a box — another workspace\'s, or none at all, is refused with the journey\'s code', async () => {
    assert.deepEqual(where(await one({ key: 'm', kind: 'move', config: { stage_id: 80 } })), ['m:stage']);
    assert.deepEqual(where(await one({ key: 'm', kind: 'move', config: { stage_id: 999 } })), ['m:stage']);
    assert.deepEqual(where(await one({ key: 'q', kind: 'branch', config: { test: 'stage', stage_ids: [30, 80] } })), ['q:stage']);
    assert.deepEqual(where(await one({ key: 'q', kind: 'branch', config: { test: 'field', field_key: 'theirs' } })), ['q:field']);
    assert.deepEqual(where(await one({ key: 'q', kind: 'branch', config: { test: 'contact_field', field_key: 'nope' } })), ['q:field']);
    assert.deepEqual(where(await one({ key: 'q', kind: 'branch', config: { test: 'deal_owner', op: 'is', user_ids: [99] } })), ['q:user']);
    assert.deepEqual(where(await one({ key: 'r', kind: 'router', routes: [{ name: 'A', when: { test: 'stage', stage_ids: [30] } }, { name: 'B', when: { test: 'stage', stage_ids: [80] } }] })), ['r:stage'], 'a route\'s question too');
    for (const step of [{ key: 'm', kind: 'move', config: { stage_id: 31 } }, { key: 'q', kind: 'branch', config: { test: 'field', field_key: 'budget', op: 'gt', value: '5' } }, { key: 'q', kind: 'branch', config: { test: 'contact_field', field_key: 'city' } },
      { key: 'q', kind: 'branch', config: { test: 'contact_field', base: 'email', op: 'contains', value: '@' } }, { key: 'q', kind: 'branch', config: { test: 'deal_owner', op: 'is', user_ids: [3] } }]) assert.equal((await one(step)).ok, true, JSON.stringify(step.config));
  });
  test('what the start names: its stages, lead webhooks, pipeline, field, the other workflow — and what its end rules name', async () => {
    for (const [config, code] of [[{ trigger: 'stage', stage_id: 80 }, 'stage'], [{ trigger: 'deal_new', stop_stage_ids: [31, 80] }, 'stage'], [{ trigger: 'deal_new', stay_stage_ids: [80] }, 'stage'], [{ trigger: 'lead', webhook_ids: [12, 90] }, 'webhooks'],
      [{ trigger: 'deal_new', pipeline_id: 9 }, 'pipeline'], [{ trigger: 'deal_field', field_key: 'theirs' }, 'field'], [{ trigger: 'date_field', field_key: 'budget', at: '09:00' }, 'field'], [{ trigger: 'flow_done', flow_id: 200 }, 'flow'],
      [{ trigger: 'deal_new', stop_on: ['field'], stop_set: { field: { field_key: 'theirs' } } }, 'field']]) {
      assert.deepEqual(where(await one(null, config)), [`start:${code}`], JSON.stringify(config));
    }
    state.flows.push({ id: 201, workspace_id: WID, name: 'Ours', active: false, activated_at: null, updated_at: STAMP });
    for (const config of [{ trigger: 'stage', stage_id: 30 }, { trigger: 'lead', webhook_ids: [12] }, { trigger: 'lead' }, { trigger: 'deal_new', pipeline_id: 3 }, { trigger: 'deal_field', field_key: 'budget' }, { trigger: 'date_field', field_key: 'closing', at: '09:00' },
      { trigger: 'flow_done', flow_id: 201 }]) assert.equal((await one(null, config)).ok, true, JSON.stringify(config));
  });
  test('the same workflow asked for the other workspace: everything it names is foreign there', async () => {
    const out = await check(SPEC(), OTHER);
    assert.deepEqual(where(out), ['start:stage', 'ask1:stage', 'move1:stage']);
    assert.equal(state.sql.filter(q => q.params && q.params.length && q.sql !== 'SELECT id FROM workspaces WHERE id = $1').every(q => q.params[0] === OTHER), true, 'every question is asked for that workspace');
  });
  test('no such workspace: that alone is said, and nothing else is asked', async () => {
    for (const wid of [999, 0, -1, '7', null, undefined, 7.5, '7; DROP']) {
      state.sql = [];
      assert.deepEqual(await maker.check(pool, wid, SPEC(), { boxes }), { ok: false, problems: [{ where: 'workspace', code: 'workspace', message: maker.MESSAGES.workspace }] }, String(wid));
      assert.equal(state.sql.length, wid === 999 ? 1 : 0, 'what is no id never reaches the database');
    }
  });
});

describe('create: the workflow is written in one piece', () => {
  test('one transaction: the workspace held, checked again, counted, the workflow, its start, every box, then the lines — and the connection given back', async () => {
    const recorded = [];
    const out = await create(SPEC(), { record: async e => { recorded.push([e, state.seq.at(-1)]); } });
    assert.deepEqual(out, { ok: true, flowId: 500, updatedAt: STAMP });
    assert.deepEqual([state.seq[0], state.seq[1], state.seq[2]], ['connect', 'BEGIN', 'SELECT id FROM']);
    const wrote = state.seq.filter(s => /^(INSERT|UPDATE|DELETE) /.test(s));
    assert.deepEqual(wrote, ['INSERT INTO journey_flows', ...Array(7).fill('INSERT INTO journey_nodes'), ...Array(5).fill('UPDATE journey_nodes SET')]);
    assert.deepEqual(state.seq.slice(-2), ['COMMIT', 'release']);
    assert.equal(state.seq.includes('pool'), false, 'every statement is asked on the one connection');
    assert.equal(state.seq.indexOf('SELECT COUNT(*)::int AS') < state.seq.indexOf('INSERT INTO journey_flows'), true);
    assert.deepEqual(state.sql.find(q => /FOR NO KEY UPDATE$/.test(q.sql)).params, [WID]);
    assert.deepEqual(recorded, [[{ workspaceId: WID, event: 'flow', actorId: null, flowId: 500, flowName: 'Welcome new leads', title: 'Welcome new leads', detail: 'created' }, 'release']], 'the record is written after the workflow is');
  });
  test('what is written: the workflow off and nobody\'s, the start with its checked config, each box, and every line by the ids just made', async () => {
    await create(SPEC());
    const flow = state.flows.find(f => f.id === 500), nodes = state.nodes.filter(n => n.flow_id === 500), by = Object.fromEntries(nodes.map(n => [n.kind === 'start' ? 'start' : n.title || n.kind, n]));
    assert.deepEqual([flow.workspace_id, flow.name, flow.active, flow.activated_at], [WID, 'Welcome new leads', false, null]);
    assert.deepEqual(state.sql.find(q => /^INSERT INTO journey_flows/.test(q.sql)).params, [WID, 'Welcome new leads'], 'a name and a workspace: nothing says who made it, and nothing switches it on');
    assert.equal(nodes.every(n => n.workspace_id === WID && n.x === null && n.y === null), true, 'unplaced: the board lays them out');
    assert.deepEqual(nodes.map(n => n.kind), ['start', 'email', 'wait', 'branch', 'task', 'router', 'move']);
    const [start, mail, wait, ask, task, router, move] = nodes;
    assert.deepEqual([start.config, start.next_id, start.else_id], [{ trigger: 'lead', webhook_ids: [12], stage_id: null, stop_stage_ids: [31], pipeline_id: 3 }, mail.id, null]);
    assert.deepEqual([mail.title, mail.body, mail.wait_minutes, mail.config, mail.next_id], ['Welcome', 'Hello {{first_name|there}}', 0, { tz: 'Europe/Vienna' }, wait.id]);
    assert.deepEqual([wait.wait_minutes, wait.next_id], [2880, ask.id]);
    assert.deepEqual([ask.config, ask.next_id, ask.else_id], [{ test: 'stage', stage_ids: [30] }, task.id, router.id], 'a branch: "yes" and "no"');
    assert.deepEqual([task.next_id, task.else_id], [null, null]);
    assert.deepEqual([router.next_id, router.else_id], [null, task.id], 'a router has no line of its own; its "otherwise" is else_id');
    assert.deepEqual(router.config.routes.map(r => [r.id, r.name, r.next_id]), [[1, 'Hot', move.id], [2, 'Everyone', null]], 'each route\'s line is kept in the router\'s config');
    assert.deepEqual([move.config, move.next_id], [{ stage_id: 31 }, null]);
    assert.equal(by.start.id, start.id);
    for (const q of state.sql.filter(x => /^UPDATE journey_nodes/.test(x.sql))) assert.deepEqual(q.params.slice(1, 3), [WID, 500], 'a line is only ever drawn inside the workflow just made');
  });
  test('a box without a line gets no second statement; a start that leads nowhere neither', async () => {
    await create({ name: 'T', start: { config: { trigger: 'deal_new' }, next: null }, steps: [] });
    assert.equal(state.sql.some(q => /^UPDATE /.test(q.sql)), false);
    reset();
    await create({ name: 'T', start: { config: { trigger: 'deal_new' }, next: 'r' }, steps: [{ key: 'r', kind: 'router', routes: [{ name: 'A', next: null }], else: null }] });
    assert.equal(state.sql.filter(q => /^UPDATE /.test(q.sql)).length, 1, 'only the start\'s');
  });
  test('a workflow with a problem: said, rolled back, nothing is there — and the record is not written', async () => {
    let recorded = 0;
    const spec = SPEC(); spec.steps[5].config.stage_id = 80;
    const out = await create(spec, { record: () => { recorded++; } });
    assert.deepEqual([out.ok, where(out), out.flowId], [false, ['move1:stage'], undefined]);
    assert.deepEqual([state.seq.slice(-2), state.flows.length, state.nodes.length, recorded], [['ROLLBACK', 'release'], 1, 0, 0]);
    assert.equal(state.sql.some(q => /^(INSERT|UPDATE|DELETE)/.test(q.sql)), false);
  });
  test('the workspace is full, is gone, or is no id: refused with a code, and nothing is written', async () => {
    state.flows.push(...Array.from({ length: boxes.MAX_FLOWS - 1 }, (_, i) => ({ id: 300 + i, workspace_id: WID, name: 'x', active: false, activated_at: null, updated_at: STAMP })));
    assert.equal((await create(SPEC())).ok, true, 'the twentieth is made');
    assert.deepEqual(await create(SPEC()), { ok: false, code: 'limit' });
    assert.deepEqual(state.seq.slice(-2), ['ROLLBACK', 'release']);
    assert.equal(state.flows.filter(f => f.workspace_id === WID).length, boxes.MAX_FLOWS);
    assert.deepEqual(await create(SPEC(), {}, 999), { ok: false, code: 'workspace' });
    assert.deepEqual(state.seq.slice(-2), ['ROLLBACK', 'release']);
    state.seq = [];
    for (const wid of [0, -3, '7', null, 7.5]) assert.deepEqual(await create(SPEC(), {}, wid), { ok: false, code: 'workspace' }, String(wid));
    assert.deepEqual(state.seq, [], 'what is no id takes no connection');
  });
  test('the database fails in the middle: rolled back, the connection given back, the error goes on — and no record', async () => {
    let recorded = 0;
    for (const at of [/^INSERT INTO journey_flows/, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7::jsonb\)/, /^UPDATE journey_nodes/, /^SELECT COUNT/]) {
      reset(); state.broken = t => at.test(t);
      await assert.rejects(create(SPEC(), { record: () => { recorded++; } }), /the database is away/, String(at));
      assert.deepEqual([state.seq.slice(-2), state.flows.length, state.nodes.length], [['ROLLBACK', 'release'], 1, 0], String(at));
    }
    assert.equal(recorded, 0);
  });
  test('a record that cannot be written never undoes the workflow', async () => {
    const said = [], real = console.error; console.error = (...a) => said.push(a.join(' '));
    try {
      assert.equal((await create(SPEC(), { record: async () => { throw new Error('the record is away'); } })).ok, true);
      assert.equal((await create(SPEC(), { record: () => { throw new Error('at once'); } })).ok, true);
      assert.equal((await create(SPEC(), { record: 'not a function' })).ok, true);
      assert.equal((await create(SPEC())).ok, true, 'none handed in');
    } finally { console.error = real; }
    assert.deepEqual([state.flows.filter(f => f.workspace_id === WID).length, said.length], [4, 2]);
    assert.match(said[0], /the record of a made workflow could not be written: the record is away/);
  });
});

describe('view: the plan as the console shows it', () => {
  test('each box with what it is called, its settings as they will be saved, and its lines by the boxes\' keys', async () => {
    const { plan } = await check(SPEC());
    const v = maker.view(plan);
    assert.deepEqual(v.start, { label: 'Start', settings: plan.start.config, next: 'mail1' });
    assert.deepEqual(v.steps.map(s => [s.key, s.kind, s.label]), [['mail1', 'email', 'Email'], ['wait1', 'wait', 'Wait'], ['ask1', 'branch', 'If / else'], ['task1', 'task', 'Task'], ['r1', 'router', 'Router'], ['move1', 'move', 'Move to a stage']]);
    assert.deepEqual(v.steps[0], { key: 'mail1', kind: 'email', label: 'Email', title: 'Welcome', body: 'Hello {{first_name|there}}', wait_minutes: 0, settings: { tz: 'Europe/Vienna' }, next: 'wait1', else: null, routes: [] });
    assert.deepEqual([v.steps[2].next, v.steps[2].else, v.steps[1].wait_minutes], ['task1', 'r1', 2880]);
    assert.deepEqual(v.steps[4].routes, [{ name: 'Hot', when: plan.steps[4].config.routes[0].when, next: 'move1' }, { name: 'Everyone', when: null, next: null }]);
    assert.equal(v.steps[4].settings, plan.steps[4].config);
  });
  test('every kind of box the journey knows has its name — a kind added later fails here', () => {
    assert.deepEqual(Object.keys(maker.LABELS).sort(), ['start', ...boxes.ACTIONS].sort());
    assert.deepEqual(maker.LABELS, { start: 'Start', call: 'Call (fonio)', email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS', task: 'Task', move: 'Move to a stage', wait: 'Wait', branch: 'If / else', router: 'Router' });
    assert.equal(maker.view({ start: {}, steps: [{ key: 'a', kind: 'teleport' }] }).steps[0].label, 'teleport');
    for (const none of [null, undefined, 'x', {}]) assert.deepEqual(maker.view(none), { start: { label: 'Start', settings: {}, next: null }, steps: [] });
  });
});

describe('untouched and remove: a made workflow is taken away only as it was made', () => {
  const made = async () => { const out = await create(SPEC()); state.sql = []; state.seq = []; return out; };
  const flow = () => state.flows.find(f => f.id === 500);
  test('as it was made: untouched, and remove takes it away with its boxes — once', async () => {
    const { flowId, updatedAt } = await made();
    assert.equal(await maker.untouched(pool, WID, flowId, updatedAt), true);
    assert.equal(state.nodes.length, 7);
    assert.equal(await maker.remove(pool, WID, flowId, updatedAt), true);
    assert.deepEqual([flow(), state.nodes.length], [undefined, 0]);
    assert.equal(await maker.remove(pool, WID, flowId, updatedAt), false, 'a second time nothing is deleted');
    assert.equal(await maker.untouched(pool, WID, flowId, updatedAt), false);
  });
  test('touched in any way — switched on, switched on and off again, changed, a deal in it — or asked for another workspace: not untouched, and not removed', async () => {
    const touches = [f => { f.active = true; f.activated_at = 'now'; }, f => { f.activated_at = '2026-11-24'; }, f => { f.updated_at = '2026-11-24T15:00:00.123457Z'; }, f => { state.runs.push({ flow_id: f.id }); }, f => { f.active = true; }];
    for (const [i, touch] of touches.entries()) {
      reset();
      const { flowId, updatedAt } = await made();
      touch(flow());
      assert.equal(await maker.untouched(pool, WID, flowId, updatedAt), false, `touch ${i}`);
      assert.equal(await maker.remove(pool, WID, flowId, updatedAt), false, `touch ${i}`);
      assert.deepEqual([!!flow(), state.nodes.length], [true, 7], `touch ${i}: it is still there, with its boxes`);
    }
    // a box somebody placed on the board: dragging one does not change the workflow's time, and is somebody's work all the same
    const box = kind => state.nodes.find(n => n.flow_id === 500 && n.kind === kind);
    const places = [() => { box('email').x = 120; box('email').y = 80; }, () => { box('task').x = 0; }, () => { box('router').y = 0; }, () => { box('start').x = 40; box('start').y = 40; }];
    for (const [i, place] of places.entries()) {
      reset();
      const { flowId, updatedAt } = await made();
      assert.ok(state.nodes.every(n => n.x === null && n.y === null), 'made unplaced');
      place();
      assert.equal(flow().updated_at, updatedAt, 'the workflow\'s own time has not moved');
      assert.equal(await maker.untouched(pool, WID, flowId, updatedAt), false, `place ${i}`);
      assert.equal(await maker.remove(pool, WID, flowId, updatedAt), false, `place ${i}`);
      assert.deepEqual([!!flow(), state.nodes.length], [true, 7], `place ${i}: it is still there, with its boxes`);
    }
    // a placed box of ANOTHER workflow does not count
    reset();
    const mine = await made();
    state.nodes.push({ id: 999, workspace_id: WID, flow_id: 200, kind: 'task', x: 5, y: 5 });
    assert.equal(await maker.untouched(pool, WID, mine.flowId, mine.updatedAt), true);
    assert.equal(await maker.remove(pool, WID, mine.flowId, mine.updatedAt), true);
    reset();
    const { flowId, updatedAt } = await made();
    assert.equal(await maker.remove(pool, OTHER, flowId, updatedAt), false);
    assert.equal(await maker.remove(pool, WID, 200, STAMP), false, 'another workspace\'s workflow, even with its own time');
    assert.equal(await maker.remove(pool, WID, flowId, '2026-11-24T15:00:00.000000Z'), false, 'another time than the one it was made at');
    assert.equal(!!flow(), true);
  });
  test('removing is ONE statement that carries every condition: nothing is looked at first and deleted afterwards', async () => {
    const { flowId, updatedAt } = await made();
    await maker.remove(pool, WID, flowId, updatedAt);
    assert.deepEqual(state.sql, [{ sql: 'DELETE FROM journey_flows f WHERE f.id = $1 AND f.workspace_id = $2 AND f.active = false AND f.activated_at IS NULL AND f.updated_at = $3::timestamptz AND NOT EXISTS (SELECT 1 FROM journey_runs r WHERE r.flow_id = f.id) AND NOT EXISTS (SELECT 1 FROM journey_nodes n WHERE n.flow_id = f.id AND (n.x IS NOT NULL OR n.y IS NOT NULL)) RETURNING f.id', params: [flowId, WID, updatedAt] }]);
    state.sql = [];
    await maker.untouched(pool, WID, flowId, updatedAt);
    assert.deepEqual(state.sql, [{ sql: 'SELECT f.id FROM journey_flows f WHERE f.id = $1 AND f.workspace_id = $2 AND f.active = false AND f.activated_at IS NULL AND f.updated_at = $3::timestamptz AND NOT EXISTS (SELECT 1 FROM journey_runs r WHERE r.flow_id = f.id) AND NOT EXISTS (SELECT 1 FROM journey_nodes n WHERE n.flow_id = f.id AND (n.x IS NOT NULL OR n.y IS NOT NULL))', params: [flowId, WID, updatedAt] }],
      'the question carries the same conditions as the delete, word for word');
  });
  test('what is no id or no time of create()\'s never reaches the database', async () => {
    await made();
    for (const [wid, id, at] of [[0, 500, STAMP], ['7', 500, STAMP], [WID, 0, STAMP], [WID, '500', STAMP], [WID, 500.5, STAMP], [WID, 500, null], [WID, 500, ''], [WID, 500, 'now'], [WID, 500, '2026-11-24 15:00:00'], [WID, 500, new Date()],
      [WID, 500, `${STAMP}' OR '1'='1`], [WID, 500, '2026-11-24T15:00:00.1234567Z']]) {
      assert.equal(await maker.untouched(pool, wid, id, at), false, JSON.stringify([wid, id, at]));
      assert.equal(await maker.remove(pool, wid, id, at), false, JSON.stringify([wid, id, at]));
    }
    assert.deepEqual([state.sql.length, !!flow()], [0, true]);
    for (const at of ['2026-11-24T15:00:00Z', '2026-11-24T15:00:00.1Z', STAMP]) { state.sql = []; await maker.untouched(pool, WID, 500, at); assert.equal(state.sql.length, 1, at); }
  });
});

describe('how it is built', () => {
  const code = read('utils/journey-create.js').replace(/\/\*[\s\S]*?\*\//, '');
  test('it opens no database module: the pool and the journey\'s checks are handed in', () => {
    assert.deepEqual([...code.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]), ['./journey-triggers', './journey-router']);
    assert.deepEqual(Object.keys(maker).sort(), ['KEY', 'LABELS', 'MESSAGES', 'check', 'create', 'remove', 'untouched', 'view']);
  });
  test('it can make a workflow and take an untouched one away — and nothing else: no statement switches one on or changes one that exists', () => {
    const statements = [...code.matchAll(/(?:'|`)((?:SELECT|INSERT|UPDATE|DELETE) [^'`]*)(?:'|`)/g)].map(m => flat(m[1]).split(' ').slice(0, 3).join(' '));
    assert.deepEqual(statements, ['SELECT id FROM', 'SELECT id FROM', 'SELECT COUNT(*)::int AS', 'INSERT INTO journey_flows', 'INSERT INTO journey_nodes', 'INSERT INTO journey_nodes', 'UPDATE journey_nodes SET', 'SELECT f.id FROM', 'DELETE FROM journey_flows']);
    assert.doesNotMatch(code, /\bactive\s*=\s*true|SET active|activated_at\s*=\s*NOW|UPDATE journey_flows|DELETE FROM journey_nodes|journey_runs SET|INSERT INTO journey_runs/);
    assert.match(code, /const LINES = 'UPDATE journey_nodes SET next_id = \$4, else_id = \$5, config = \$6::jsonb WHERE id = \$1 AND workspace_id = \$2 AND flow_id = \$3';/, 'a line is drawn only in the workspace and the workflow named');
  });
  test('an id is a parameter of a statement, never part of one', () => {
    assert.deepEqual([...code.matchAll(/\$\{([^}]+)\}/g)].map(m => m[1]).filter(x => !/^(sentence|detail|String\(step\.kind\)|key|i \+ 1|\[\.\.\.path)/.test(x)), ['AS_MADE', 'AS_MADE']);
    assert.match(code, /const KEY = \/\^\[a-z\]\[a-z0-9_\]\{0,29\}\$\/;/);
  });
});
