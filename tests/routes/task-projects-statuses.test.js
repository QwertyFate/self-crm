// ROUTE tests for routes/task-projects.js — the per-project status list must
// be reachable only through a project of the caller's workspace. Fixture:
// workspace 7 owns project 20, workspace 8 owns project 21. Caller is 7.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const PROJECTS = { 20: 7, 21: 8 };
const statuses = new Map();
const seed = () => { statuses.set(20, [{ id: 1, project_id: 20, key: 'qa', label: 'QA', color: '#00f', position: 0 }]); statuses.set(21, [{ id: 2, project_id: 21, key: 'geheim', label: 'Geheim', color: '#f00', position: 0 }]); };
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /^SELECT id FROM task_projects WHERE id=\$1 AND workspace_id=\$2/, reply: p => ({ rows: PROJECTS[p[0]] === p[1] ? [{ id: p[0] }] : [] }) },
    { match: /^SELECT \* FROM task_project_statuses WHERE project_id=\$1/,      reply: p => ({ rows: statuses.get(Number(p[0])) || [] }) },
    { match: /^DELETE FROM task_project_statuses WHERE project_id=\$1/,         reply: p => { const n = (statuses.get(Number(p[0])) || []).length; statuses.set(Number(p[0]), []); return { rows: [], rowCount: n }; } },
    { match: /^INSERT INTO task_project_statuses/,                              reply: p => { statuses.get(Number(p[0])).push({ project_id: Number(p[0]), key: p[1], label: p[2], color: p[3], position: p[4] }); return { rows: [], rowCount: 1 }; } },
  ]);
  server = await serve({ '/api/task-projects': loadRoute('task-projects.js', { pool }) });
});
after(() => server.close());
beforeEach(() => { pool.reset(); seed(); });

describe('GET /:id/statuses', () => {
  test("another workspace's project -> 404, and its statuses are never read", async () => {
    const r = await server.request('GET', '/api/task-projects/21/statuses');
    assert.equal(r.status, 404);
    assert.equal(pool.some(/FROM task_project_statuses/), false);
  });
  test('own project -> its statuses', async () => {
    const r = await server.request('GET', '/api/task-projects/20/statuses');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map(s => s.key), ['qa']);
  });
  test('non-numeric id -> 404 without any query', async () => {
    const r = await server.request('GET', '/api/task-projects/abc/statuses');
    assert.equal(r.status, 404);
    assert.equal(pool.log.length, 0);
  });
});

describe('PUT /:id/statuses', () => {
  test("another workspace's project -> 404; nothing deleted, nothing inserted, their list intact", async () => {
    const r = await server.request('PUT', '/api/task-projects/21/statuses', { statuses: [{ key: 'mine', label: 'Mine', color: '#0f0' }] });
    assert.equal(r.status, 404);
    assert.equal(pool.writes().length, 0);
    assert.deepEqual(statuses.get(21).map(s => s.key), ['geheim'], "the other workspace's statuses survive");
  });
  test('own project -> replaced in order; every write keyed on the verified project id', async () => {
    const r = await server.request('PUT', '/api/task-projects/20/statuses', { statuses: [{ key: 'a', label: 'A', color: '#1' }, { key: 'b', label: 'B', color: '#2' }] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true });
    assert.deepEqual(pool.find(/^DELETE FROM task_project_statuses/).params, [20]);
    assert.deepEqual(pool.filter(/^INSERT INTO task_project_statuses/).map(e => e.params), [[20, 'a', 'A', '#1', 0], [20, 'b', 'B', '#2', 1]]);
    assert.deepEqual(statuses.get(20).map(s => s.key), ['a', 'b']);
  });
  test('a non-array body -> 400 before the ownership lookup', async () => {
    const r = await server.request('PUT', '/api/task-projects/20/statuses', { statuses: 'x' });
    assert.equal(r.status, 400);
    assert.equal(pool.log.length, 0);
  });
});
