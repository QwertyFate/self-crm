// ROUTE tests for POST /api/pipelines/:id/stages — a stage may only be added
// to a pipeline of the caller's workspace. Fixture: workspace 7 owns pipeline
// 5, workspace 8 owns pipeline 6. Caller is 7.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const PIPELINES = { 5: 7, 6: 8 };
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /^SELECT id FROM pipelines WHERE id=\$1 AND workspace_id=\$2/, reply: p => ({ rows: PIPELINES[p[0]] === p[1] ? [{ id: p[0] }] : [] }) },
    { match: /MAX\(position\)/,                reply: () => ({ rows: [{ m: 2 }] }) },
    { match: /^INSERT INTO pipeline_stages/,   reply: () => ({ rows: [{ id: 77 }], rowCount: 1 }) },
  ]);
  server = await serve({ '/api/pipelines': loadRoute('pipelines.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());

test("another workspace's pipeline -> 404, no stage inserted", async () => {
  const r = await server.request('POST', '/api/pipelines/6/stages', { name: 'Fremd' });
  assert.equal(r.status, 404);
  assert.equal(pool.some(/^INSERT INTO pipeline_stages/), false);
  assert.equal(pool.some(/MAX\(position\)/), false, 'not even the position probe runs');
});

test('own pipeline -> 201 with the next position; the position probe and the INSERT are workspace-scoped', async () => {
  const r = await server.request('POST', '/api/pipelines/5/stages', { name: 'Angebot', color: '#123' });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { id: 77, name: 'Angebot', color: '#123', position: 3 });
  const probe = pool.find(/MAX\(position\)/);
  assert.match(probe.sql, /AND workspace_id=\$2/);
  assert.deepEqual(probe.params, [5, 7]);
  assert.deepEqual(pool.find(/^INSERT INTO pipeline_stages/).params, [7, 5, 'Angebot', '#123', 3]);
});

test('missing name -> 400; non-numeric id -> 400; no query', async () => {
  assert.equal((await server.request('POST', '/api/pipelines/5/stages', {})).status, 400, 'name');
  assert.equal((await server.request('POST', '/api/pipelines/abc/stages', { name: 'x' })).status, 400, 'id');
  assert.equal(pool.log.length, 0);
});
