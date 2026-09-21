// ROUTE tests for the deal <-> object link endpoints in routes/deals.js — both
// ends must belong to the caller's workspace. Fixture: workspace 7 owns deal
// 50 and object 40; workspace 8 owns deal 51 and object 41. Caller is 7.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const OWNER = { deals: { 50: 7, 51: 8 }, objects: { 40: 7, 41: 8 } };
let pool, server;

before(async () => {
  pool = createFakePool([
    { match: /^SELECT 1 FROM deals WHERE id=\$1 AND workspace_id=\$2/, reply: p => ({ rows: OWNER.deals[p[0]] === p[1] ? [{}] : [] }) },
    { match: /^SELECT EXISTS \(SELECT 1 FROM deals WHERE id=\$1 AND workspace_id=\$3\) AS a/, reply: p => ({ rows: [{ a: OWNER.deals[p[0]] === p[2], b: OWNER.objects[p[1]] === p[2] }] }) },
    // pre-fix and post-fix GET both read deal_objects; answer by deal id regardless of shape
    { match: /FROM deal_objects dobj JOIN objects o/, reply: p => ({ rows: Number(p[0]) === 50 ? [{ id: 40, workspace_id: 7, name: 'Objekt' }] : Number(p[0]) === 51 ? [{ id: 41, workspace_id: 8, name: 'Fremd' }] : [] }) },
    { match: /^(INSERT INTO|DELETE FROM) deal_objects/, reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  server = await serve({ '/api/deals': loadRoute('deals.js', { pool }) });
});
after(() => server.close());
beforeEach(() => pool.reset());
const linkWrites = () => pool.filter(/^(INSERT INTO|DELETE FROM) deal_objects/);

describe('GET /:id/objects', () => {
  test("another workspace's deal -> 404 and its objects are never read", async () => {
    const r = await server.request('GET', '/api/deals/51/objects');
    assert.equal(r.status, 404);
    assert.equal(pool.some(/FROM deal_objects/), false);
  });
  test('own deal -> its objects, joined only within the workspace', async () => {
    const r = await server.request('GET', '/api/deals/50/objects');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map(o => o.id), [40]);
    const q = pool.find(/FROM deal_objects dobj JOIN objects o/);
    assert.match(q.sql, /o\.workspace_id = \$2/);
    assert.deepEqual(q.params, [50, 7]);
  });
});

describe('POST /:id/objects and DELETE /:id/objects/:objectId — both ends must be ours', () => {
  for (const [method, url, body, why, msg] of [
    ['POST',   '/api/deals/51/objects',    { object_id: 40 }, 'foreign deal, own object',   'Not found'],
    ['POST',   '/api/deals/50/objects',    { object_id: 41 }, 'own deal, foreign object',   'Object not found'],
    ['DELETE', '/api/deals/51/objects/40', undefined,         'foreign deal (unlink)',      'Not found'],
    ['DELETE', '/api/deals/50/objects/41', undefined,         'foreign object (unlink)',    'Object not found'],
  ]) {
    test(`${method} ${url} (${why}) -> 404 ${msg}, nothing written`, async () => {
      const r = await server.request(method, url, body);
      assert.equal(r.status, 404);
      assert.equal(r.body.error, msg);
      assert.equal(linkWrites().length, 0);
    });
  }
  test('own deal + own object -> 201 link / 200 unlink, with the original write', async () => {
    const a = await server.request('POST', '/api/deals/50/objects', { object_id: 40 });
    assert.equal(a.status, 201);
    assert.deepEqual(a.body, { success: true });
    assert.deepEqual(pool.find(/^INSERT INTO deal_objects/).params, [50, 40]);
    const b = await server.request('DELETE', '/api/deals/50/objects/40');
    assert.equal(b.status, 200);
    assert.deepEqual(pool.find(/^DELETE FROM deal_objects/).params, [50, 40]);
  });
  test('missing object_id -> 400; non-numeric ids -> 400; no query either way', async () => {
    assert.equal((await server.request('POST', '/api/deals/50/objects', {})).status, 400, 'missing object_id');
    assert.equal((await server.request('POST', '/api/deals/abc/objects', { object_id: 40 })).status, 400, 'deal id');
    assert.equal((await server.request('DELETE', '/api/deals/50/objects/x')).status, 400, 'object id');
    assert.equal(pool.log.length, 0);
  });
});
