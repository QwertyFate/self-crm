// ROUTE tests for DELETE /api/workspace/members/:id. Fixture: workspace 7 has
// owner 1 and member 2; workspace 8 has member 5. Caller is owner 1 unless stated.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const USERS = { 1: { workspace_id: 7, role: 'owner' }, 2: { workspace_id: 7, role: 'member' }, 5: { workspace_id: 8, role: 'member' } };
let pool, owner, member;

before(async () => {
  pool = createFakePool([
    { match: /^SELECT id, role FROM users WHERE id=\$1 AND workspace_id=\$2/, reply: p => { const u = USERS[p[0]]; return { rows: u && u.workspace_id === p[1] ? [{ id: p[0], role: u.role }] : [] }; } },
    { match: /^(BEGIN|COMMIT|ROLLBACK)/, reply: () => ({ rows: [] }) },
    { match: /^(UPDATE contacts SET assigned_to=NULL|DELETE FROM users)/, reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  owner  = await serve({ '/api/workspace': loadRoute('workspace.js', { pool }) });
  member = await serve({ '/api/workspace': loadRoute('workspace.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } }) });
});
after(async () => { await owner.close(); await member.close(); });
beforeEach(() => pool.reset());
const writes = () => pool.filter(/^(UPDATE contacts|DELETE FROM users)/);

describe('DELETE /api/workspace/members/:id', () => {
  test('a member -> 403, no query', async () => {
    const r = await member.request('DELETE', '/api/workspace/members/1');
    assert.equal(r.status, 403);
    assert.equal(pool.log.length, 0);
  });
  test('removing yourself -> 400, no query', async () => {
    const r = await owner.request('DELETE', '/api/workspace/members/1');
    assert.equal(r.status, 400);
    assert.match(r.body.error, /yourself/);
    assert.equal(pool.log.length, 0);
  });
  test("a user id from another workspace -> 404, nothing deleted (the lookup carries workspace_id)", async () => {
    const r = await owner.request('DELETE', '/api/workspace/members/5');
    assert.equal(r.status, 404);
    assert.deepEqual(pool.find(/FROM users WHERE id=\$1 AND workspace_id=\$2/).params, [5, 7]);
    assert.equal(writes().length, 0);
  });
  test('a member of this workspace -> 200: their contacts are unassigned and the user row deleted, in one transaction, both scoped', async () => {
    const r = await owner.request('DELETE', '/api/workspace/members/2');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true });
    assert.deepEqual(pool.find(/^UPDATE contacts SET assigned_to=NULL/).params, [2, 7]);
    assert.deepEqual(pool.find(/^DELETE FROM users/).params, [2, 7]);
    assert.ok(pool.some(/^BEGIN/) && pool.some(/^COMMIT/), 'transactional');
  });
});
