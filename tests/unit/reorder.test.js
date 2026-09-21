// UNIT tests for middleware/reorder.js — reorderItems rewrites positions in
// one transaction and every UPDATE carries the caller's WHERE clause.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { inject, ROOT } = require('../helpers/load-route');

let pool, restore, reorderItems, failOn = null;
before(() => {
  pool = createFakePool([
    { match: /^UPDATE/, reply: p => { if (failOn !== null && p[1] === failOn) throw new Error('boom'); return { rows: [], rowCount: 1 }; } },
  ]);
  restore = inject('db.js', { pool });
  const abs = path.join(ROOT, 'middleware', 'reorder.js'); delete require.cache[abs];
  ({ reorderItems } = require(abs));
});
after(() => restore());
beforeEach(() => { pool.reset(); failOn = null; });

test('positions 0..n-1 in the given order, each UPDATE scoped by the where clause, inside BEGIN/COMMIT', async () => {
  const r = await reorderItems('pipeline_stages', 'id', [30, 10, 20], 'workspace_id=$3', [7]);
  assert.deepEqual(r, { success: true });
  const ups = pool.filter(/^UPDATE pipeline_stages SET position=\$1 WHERE id=\$2 AND workspace_id=\$3/);
  assert.deepEqual(ups.map(u => u.params), [[0, 30, 7], [1, 10, 7], [2, 20, 7]]);
  assert.ok(pool.some(/^BEGIN/) && pool.some(/^COMMIT/));
  assert.equal(pool.some(/^ROLLBACK/), false);
});

test('a failure mid-way rolls back and rethrows', async () => {
  failOn = 10;
  await assert.rejects(reorderItems('pipeline_stages', 'id', [30, 10, 20], 'workspace_id=$3', [7]), /boom/);
  assert.ok(pool.some(/^ROLLBACK/), 'rolled back');
  assert.equal(pool.some(/^COMMIT/), false);
});
