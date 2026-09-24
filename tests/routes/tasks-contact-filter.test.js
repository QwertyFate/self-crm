// ROUTE test: GET /api/tasks accepts an optional contact_id filter next to the
// existing list_id one. The real route file runs on a throwaway Express app
// with a fake pool that records the SQL, so no database is needed.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const calls = [];
const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
let server;

describe('GET /api/tasks filters', () => {
  before(async () => { server = await serve({ '/api/tasks': loadRoute('tasks.js', { pool }) }); });
  after(async () => { await server.close(); });

  test('contact_id narrows the query to that contact', async () => {
    calls.length = 0;
    const r = await server.request('GET', '/api/tasks?contact_id=5');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, []);
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /AND t\.contact_id = \$2/);
    assert.deepEqual(calls[0].params, [7, '5']);
  });
  test('list_id and contact_id combine', async () => {
    calls.length = 0;
    await server.request('GET', '/api/tasks?list_id=3&contact_id=5');
    assert.match(calls[0].sql, /AND t\.list_id = \$2[\s\S]*AND t\.contact_id = \$3/);
    assert.deepEqual(calls[0].params, [7, '3', '5']);
  });
  test('without filters the query is workspace-wide', async () => {
    calls.length = 0;
    await server.request('GET', '/api/tasks');
    assert.doesNotMatch(calls[0].sql, /contact_id = \$/);
    assert.doesNotMatch(calls[0].sql, /list_id = \$/);
    assert.deepEqual(calls[0].params, [7]);
  });
});
