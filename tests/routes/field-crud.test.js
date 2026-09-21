// ROUTE tests for middleware/field-crud.js — the factory behind /api/fields,
// /api/deal-fields, /api/object-fields and /api/task-fields (16 endpoints).
// Tested once through one table; the four mounts are checked statically.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { inject, serve, ROOT } = require('../helpers/load-route');

const OWNED = new Set([5, 6]);   // deal_fields ids in workspace 7
let pool, server, restoreDb, restoreAuth;

before(async () => {
  pool = createFakePool([
    { match: /^SELECT \* FROM deal_fields WHERE workspace_id=\$1/, reply: () => ({ rows: [{ id: 5, field_key: 'revenue', type: 'number' }] }) },
    { match: /MAX\(position\)/,                       reply: () => ({ rows: [{ m: 1 }] }) },
    { match: /^INSERT INTO deal_fields/,              reply: p => { if (p[2] === 'revenue') { const e = new Error('dup'); e.code = '23505'; throw e; } return { rows: [{ id: 9 }] }; } },
    { match: /^UPDATE deal_fields SET/,               reply: p => ({ rows: [], rowCount: OWNED.has(Number(p[p.length - 2])) && p[p.length - 1] === 7 ? 1 : 0 }) },
    { match: /^DELETE FROM deal_fields WHERE id=\$1 AND workspace_id=\$2/, reply: p => ({ rows: [], rowCount: OWNED.has(Number(p[0])) && p[1] === 7 ? 1 : 0 }) },
  ]);
  restoreDb   = inject('db.js', { pool });
  restoreAuth = inject('middleware/auth.js', (req, _r, next) => { req.userId = 1; req.workspaceId = 7; req.userRole = 'owner'; next(); });
  const abs = path.join(ROOT, 'middleware', 'field-crud.js'); delete require.cache[abs];
  const { createFieldRouter } = require(abs);
  server = await serve({ '/api/deal-fields': createFieldRouter('deal_fields') });
});
after(async () => { await server.close(); restoreDb(); restoreAuth(); });
beforeEach(() => pool.reset());

describe('createFieldRouter (deal_fields)', () => {
  test('GET lists only this workspace', async () => {
    const r = await server.request('GET', '/api/deal-fields');
    assert.equal(r.status, 200);
    assert.deepEqual(pool.find(/^SELECT \* FROM deal_fields/).params, [7]);
  });
  test('POST: invalid type -> 400; missing name/key -> 400; duplicate key -> 400; valid -> 201 with the next position', async () => {
    assert.equal((await server.request('POST', '/api/deal-fields', { name: 'X', field_key: 'x', type: 'blob' })).status, 400, 'type');
    assert.equal((await server.request('POST', '/api/deal-fields', { name: 'X', type: 'text' })).status, 400, 'key');
    assert.equal(pool.some(/^INSERT/), false);
    assert.equal((await server.request('POST', '/api/deal-fields', { name: 'R', field_key: 'revenue', type: 'number' })).status, 400, 'duplicate');
    pool.reset();
    const r = await server.request('POST', '/api/deal-fields', { name: 'Budget', field_key: 'budget', type: 'number' });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { id: 9 });
    assert.deepEqual(pool.find(/^INSERT INTO deal_fields/).params.slice(0, 4), [7, 'Budget', 'budget', 'number']);
    assert.equal(pool.find(/^INSERT INTO deal_fields/).params[5], 2, 'position = max + 1');
  });
  test("PUT on another workspace's field -> 404 (UPDATE scoped); invalid type -> 400; own -> 200", async () => {
    assert.equal((await server.request('PUT', '/api/deal-fields/7', { name: 'N' })).status, 404, 'foreign');
    assert.match(pool.find(/^UPDATE deal_fields/).sql, /AND workspace_id=\$\d+$/);
    assert.equal((await server.request('PUT', '/api/deal-fields/5', { name: 'N', type: 'blob' })).status, 400, 'type');
    assert.equal((await server.request('PUT', '/api/deal-fields/5', { name: 'N', type: 'date' })).status, 200);
  });
  test("DELETE on another workspace's field -> 404; own -> 200", async () => {
    assert.equal((await server.request('DELETE', '/api/deal-fields/7')).status, 404);
    assert.deepEqual(pool.find(/^DELETE FROM deal_fields/).params, ['7', 7]);
    assert.equal((await server.request('DELETE', '/api/deal-fields/6')).status, 200);
  });
});

test('the factory is mounted exactly for the four hard-coded tables (the table name is interpolated into SQL)', () => {
  const routes = ['fields', 'deal-fields', 'object-fields', 'task-fields'].map(f => fs.readFileSync(path.join(ROOT, 'routes', `${f}.js`), 'utf8'));
  const tables = routes.map(src => /createFieldRouter\('([a-z_]+)'\)/.exec(src)?.[1]);
  assert.deepEqual(tables, ['custom_fields', 'deal_fields', 'object_fields', 'task_fields']);
  const allSrc = fs.readdirSync(path.join(ROOT, 'routes')).map(f => fs.readFileSync(path.join(ROOT, 'routes', f), 'utf8')).join('\n');
  assert.equal((allSrc.match(/createFieldRouter\(/g) || []).length, 4, 'no other caller');
});
