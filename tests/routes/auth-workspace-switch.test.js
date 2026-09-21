// ROUTE tests for the tenant-switch primitives in routes/auth.js:
// POST /select-workspace and POST /switch-workspace. The only thing that may
// move a session into a workspace is a `users` row with the caller's email in
// that workspace. Fixture: owner@x has user 1 (ws 7, owner) and user 3 (ws 9,
// member); workspace 8 belongs to somebody else.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

const USERS = [{ id: 1, email: 'owner@x', workspace_id: 7, role: 'owner', name: 'O' }, { id: 3, email: 'owner@x', workspace_id: 9, role: 'member', name: 'O' }, { id: 4, email: 'other@x', workspace_id: 8, role: 'owner', name: 'X' }];
let pool, server, sess;

before(async () => {
  pool = createFakePool([
    { match: /^SELECT email FROM users WHERE id=\$1/, reply: p => { const u = USERS.find(u => u.id === p[0]); return { rows: u ? [{ email: u.email }] : [] }; } },
    { match: /FROM users WHERE email=\$1 AND workspace_id=\$2/, reply: p => { const u = USERS.find(u => u.email === p[0] && u.workspace_id === p[1]); return { rows: u ? [{ ...u, column_widths: {}, deal_columns: [], analytics_layout: {} }] : [] }; } },
    { match: /FROM workspaces WHERE id=\$1/, reply: p => ({ rows: [{ id: p[0], name: `W${p[0]}`, kanban_fields: null, contact_columns: null }] }) },
  ]);
  const withSession = (req, _res, next) => { req.session = sess; next(); };
  server = await serve({ '/api/auth': [withSession, loadRoute('auth.js', { pool })] });
});
after(() => server.close());
beforeEach(() => { pool.reset(); sess = { userId: 1, workspaceId: 7, userRole: 'owner' }; });

for (const route of ['select-workspace', 'switch-workspace']) {
  describe(`POST /api/auth/${route}`, () => {
    test('no session -> 401, no query', async () => {
      sess = null;
      const r = await server.request('POST', `/api/auth/${route}`, { workspace_id: 9 });
      assert.equal(r.status, 401);
      assert.equal(pool.log.length, 0);
    });
    test('a workspace the caller has no user row in -> 403 and the session is untouched', async () => {
      const r = await server.request('POST', `/api/auth/${route}`, { workspace_id: 8 });
      assert.equal(r.status, 403);
      assert.deepEqual(sess, { userId: 1, workspaceId: 7, userRole: 'owner' });
      assert.deepEqual(pool.find(/FROM users WHERE email=\$1 AND workspace_id=\$2/).params, ['owner@x', 8], 'membership looked up by the SESSION user\'s email, not by anything from the body');
    });
    test("a workspace with the caller's email -> 200 and the session is rebound to THAT user row and role (no carry-over)", async () => {
      const r = await server.request('POST', `/api/auth/${route}`, { workspace_id: 9 });
      assert.equal(r.status, 200);
      assert.equal(sess.userId, 3, 'the workspace-9 user row');
      assert.equal(sess.workspaceId, 9);
      assert.equal(sess.userRole, 'member', 'owner role in workspace 7 does not carry over');
      assert.equal(r.body.workspace.id, 9);
    });
  });
}
