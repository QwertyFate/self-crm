// ROUTE tests for DELETE /api/workspace — the "cannot delete your only
// workspace" guard must count the person's workspaces, not their per-workspace
// user rows. Fixture: owner@x has user rows 1 (workspace 7) and 3 (workspace
// 9) → two memberships; solo@x has user row 5 (workspace 11) → one.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const USERS = { 1: { email: 'owner@x', workspace_id: 7 }, 3: { email: 'owner@x', workspace_id: 9 }, 5: { email: 'solo@x', workspace_id: 11 } };
const membershipsByEmail = email => Object.values(USERS).filter(u => u.email === email).length;
let pool, ownerOfTwo, ownerOfOne, member;

before(async () => {
  pool = createFakePool([
    // the fixed query: memberships of the person behind req.userId, by email
    { match: /FROM user_workspaces uw JOIN users u ON u\.id = uw\.user_id WHERE u\.email = \(SELECT email FROM users WHERE id = \$1\)/,
      reply: p => ({ rows: [{ count: String(membershipsByEmail(USERS[p[0]].email)) }] }) },
    // the old query (pre-fix): one user_workspaces row per user id, always 1
    { match: /^SELECT COUNT\(\*\) as count FROM user_workspaces WHERE user_id=\$1/, reply: () => ({ rows: [{ count: '1' }] }) },
    { match: /^(BEGIN|COMMIT|ROLLBACK)/, reply: () => ({ rows: [] }) },
    { match: /^DELETE FROM/, reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  ownerOfTwo = await serve({ '/api/workspace': loadRoute('workspace.js', { pool, user: { id: 1, workspaceId: 7, role: 'owner' } }) });
  ownerOfOne = await serve({ '/api/workspace': loadRoute('workspace.js', { pool, user: { id: 5, workspaceId: 11, role: 'owner' } }) });
  member     = await serve({ '/api/workspace': loadRoute('workspace.js', { pool, user: { id: 2, workspaceId: 7, role: 'member' } }) });
});
after(async () => { await ownerOfTwo.close(); await ownerOfOne.close(); await member.close(); });
beforeEach(() => pool.reset());

describe('DELETE /api/workspace', () => {
  test('an owner with two workspaces can delete the current one: 200, every DELETE scoped to it, committed', async () => {
    const r = await ownerOfTwo.request('DELETE', '/api/workspace');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true });
    const deletes = pool.filter(/^DELETE FROM/);
    assert.ok(deletes.length >= 10, `all tenant tables cleared (${deletes.length})`);
    for (const d of deletes) assert.deepEqual(d.params, [7], d.sql.slice(0, 40));
    assert.ok(pool.some(/^COMMIT/), 'committed');
    assert.equal(pool.some(/^ROLLBACK/), false);
  });
  test('an owner whose only workspace this is -> 400, nothing deleted', async () => {
    const r = await ownerOfOne.request('DELETE', '/api/workspace');
    assert.equal(r.status, 400);
    assert.match(r.body.error, /only workspace/);
    assert.equal(pool.some(/^(BEGIN|DELETE FROM)/), false);
  });
  test('a member -> 403, no query', async () => {
    const r = await member.request('DELETE', '/api/workspace');
    assert.equal(r.status, 403);
    assert.equal(pool.log.length, 0);
  });
});
