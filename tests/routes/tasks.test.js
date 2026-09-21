// ROUTE tests for routes/tasks.js: joins and counts scoped to the workspace,
// every body id validated, status and priority validated. Fixture: workspace 7
// owns task 100 (in project 20, which has a custom status 'qa'), list 30, deal
// 50, contact 60, user 1; workspace 8 owns task 101, project 21, list 31, deal
// 51, contact 61, user 2. Caller is user 1 / workspace 7.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const OWN = { tasks: [100], projects: [20], lists: [30], users: [1], deals: [50], contacts: [60] };
const ROW = { id: 100, workspace_id: 7, title: 'parent', status: 'todo', priority: 'medium', project_id: 20, assigned_to_name: 'Alice', created_by_name: 'Alice', deal_title: null, contact_name: null, subtask_count: 0, subtask_done: 0 };
const OWN_BODY = { title: 'T', status: 'todo', priority: 'medium', project_id: 20, list_id: 30, deal_id: 50, contact_id: 60, assigned_to: 1 };
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /FROM tasks WHERE workspace_id=\$1 AND id = ANY/, reply: p => {
        if (p[0] !== 7) return { rows: [] };
        const rows = [];
        const kinds = [['tasks', 'task', 1], ['projects', 'project', 2], ['lists', 'list', 3], ['users', 'user', 4], ['deals', 'deal', 5], ['contacts', 'contact', 6]];
        for (const [set, kind, slot] of kinds) p[slot].forEach(id => OWN[set].includes(id) && rows.push({ kind, id }));
        return { rows };
      } },
    { match: /jsonb_array_elements/,           reply: p => ({ rows: p[1] === 20 ? [{ key: 'qa' }] : [] }) },
    { match: /^INSERT INTO tasks/,             reply: () => ({ rows: [{ id: 99 }] }) },
    { match: /^UPDATE tasks SET/,              reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /SELECT project_id FROM tasks WHERE id=\$1 AND workspace_id=\$2/, reply: () => ({ rows: [{ project_id: 20 }] }) },
    { match: /WHERE t\.parent_id = \$1/,       reply: () => ({ rows: [{ ...ROW, id: 101, parent_id: 100, title: 'child' }] }) },   // subtasks of 100
    { match: /FROM tasks t/,                   reply: () => ({ rows: [ROW] }) },
  ]);
  server = await serve({ '/api/tasks': loadRoute('tasks.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());

const writes = () => pool.filter(/^(INSERT INTO tasks|UPDATE tasks SET)/);

describe('read side', () => {
  test('GET /: the four joins and both count subqueries are scoped', async () => {
    const r = await server.request('GET', '/api/tasks');
    assert.equal(r.status, 200);
    const sql = pool.find(/subtask_count/).sql;
    for (const a of ['u', 'cu', 'dl', 'ct']) assert.ok(sql.includes(`${a}.workspace_id = t.workspace_id`), `join ${a} scoped`);
    assert.equal((sql.match(/s\.parent_id = t\.id AND s\.workspace_id = t\.workspace_id/g) || []).length, 2);
  });
  test('GET /:id: the subtask query carries the workspace as a second parameter', async () => {
    const r = await server.request('GET', '/api/tasks/100');
    assert.equal(r.status, 200);
    const sub = pool.find(/WHERE t\.parent_id = \$1 AND t\.workspace_id = \$2/);
    assert.ok(sub, 'subtask query is scoped');
    assert.deepEqual(sub.params, ['100', 7]);
    assert.deepEqual(r.body.subtasks.map(t => t.id), [101], 'the scoped subtask query feeds the detail');
  });
});

describe('foreign references -> 400, nothing written', () => {
  for (const [field, value] of [['assigned_to', 2], ['parent_id', 101], ['project_id', 21], ['list_id', 31], ['deal_id', 51], ['contact_id', 61]]) {
    test(`POST with foreign ${field}`, async () => {
      const r = await server.request('POST', '/api/tasks', { ...OWN_BODY, [field]: value });
      assert.equal(r.status, 400);
      assert.match(r.body.error, new RegExp(`^${field}`));
      assert.equal(writes().length, 0);
    });
  }
  test('PUT with foreign assigned_to', async () => {
    const r = await server.request('PUT', '/api/tasks/100', { ...OWN_BODY, assigned_to: 2 });
    assert.equal(r.status, 400);
    assert.equal(writes().length, 0);
  });
});

describe('status and priority', () => {
  test('unknown status on PUT and on PATCH /status -> 400', async () => {
    assert.equal((await server.request('PUT', '/api/tasks/100', { ...OWN_BODY, status: 'bogus' })).status, 400);
    assert.equal((await server.request('PATCH', '/api/tasks/100/status', { status: 'bogus' })).status, 400);
    assert.equal(writes().length, 0);
  });
  test("the project's own key and a built-in are accepted", async () => {
    assert.equal((await server.request('PATCH', '/api/tasks/100/status', { status: 'qa' })).status, 200);
    assert.equal((await server.request('PATCH', '/api/tasks/100/status', { status: 'in_review' })).status, 200);
  });
  test('PUT without a status -> 400 (used to be a 500 from NOT NULL)', async () => {
    const { status, ...noStatus } = OWN_BODY;
    assert.equal((await server.request('PUT', '/api/tasks/100', noStatus)).status, 400);
  });
  test('unknown priority -> 400; absent priority defaults to medium', async () => {
    assert.equal((await server.request('PUT', '/api/tasks/100', { ...OWN_BODY, priority: 'asap' })).status, 400);
    const { priority, ...noPriority } = OWN_BODY;
    const r = await server.request('PUT', '/api/tasks/100', noPriority);
    assert.equal(r.status, 200);
    assert.equal(pool.find(/^UPDATE tasks SET/).params[3], 'medium');
  });
});

test('own ids: POST -> 201 {id}; the INSERT binds the sanctioned values', async () => {
  const r = await server.request('POST', '/api/tasks', OWN_BODY);
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { id: 99 });
  const p = pool.find(/^INSERT INTO tasks/).params;
  assert.deepEqual(p.slice(0, 6), [7, null, 20, 30, 50, 60]);   // workspace, parent, project, list, deal, contact
  assert.deepEqual(p.slice(8, 11), ['todo', 'medium', 1]);      // status, priority, assignee
});
