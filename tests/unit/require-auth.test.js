// UNIT tests for middleware/auth.js — the session gate in front of ~120
// endpoints. Every route test stubs it out; this file tests the real one.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { fakeRes } = require('../helpers/fake-http');
const { inject, ROOT } = require('../helpers/load-route');

const MEMBERS = { '1:7': 'owner', '2:7': 'member' };   // userId:workspaceId -> role
let pool, restore, requireAuth;

before(() => {
  pool = createFakePool([
    { match: /FROM user_workspaces uw WHERE uw\.user_id = \$1 AND uw\.workspace_id = \$2/, reply: p => { const role = MEMBERS[`${p[0]}:${p[1]}`]; return { rows: role ? [{ role, workspace_id: p[1] }] : [] }; } },
  ]);
  restore = inject('db.js', { pool });
  const abs = path.join(ROOT, 'middleware', 'auth.js'); delete require.cache[abs];
  requireAuth = require(abs);
});
after(() => restore());
beforeEach(() => pool.reset());

function session(fields) { const s = { ...fields, destroyed: false, destroy(cb) { this.destroyed = true; cb && cb(); } }; return s; }
async function run(sess) {
  const req = { session: sess }; const res = fakeRes(); let nextArg = 'not called';
  await requireAuth(req, res, e => { nextArg = e; });
  return { req, res, nextArg };
}

describe('requireAuth', () => {
  test('no session -> 401, no query, next not called', async () => {
    const { res, nextArg } = await run(undefined);
    assert.equal(res.code, 401);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
    assert.equal(nextArg, 'not called');
    assert.equal(pool.log.length, 0);
  });
  test('a session whose user has no membership in its workspace -> 401 and the session is destroyed', async () => {
    const sess = session({ userId: 1, workspaceId: 9 });   // user 1 is not in workspace 9
    const { res, nextArg } = await run(sess);
    assert.equal(res.code, 401);
    assert.equal(sess.destroyed, true, 'session.destroy() called');
    assert.equal(nextArg, 'not called');
  });
  test('a member -> next(); workspace and role come from the membership row, user id from the session', async () => {
    const { req, res, nextArg } = await run(session({ userId: 2, workspaceId: 7 }));
    assert.equal(nextArg, undefined, 'next() without error');
    assert.equal(res.sent, false);
    assert.equal(req.userId, 2);
    assert.equal(req.workspaceId, 7);
    assert.equal(req.userRole, 'member');
    assert.deepEqual(pool.find(/FROM user_workspaces/).params, [2, 7]);
  });
  test('an owner gets role owner', async () => {
    const { req } = await run(session({ userId: 1, workspaceId: 7 }));
    assert.equal(req.userRole, 'owner');
  });
  test('a database error goes to next(err), nothing is sent', async () => {
    const broken = createFakePool([{ match: /FROM user_workspaces/, reply: () => { throw new Error('db down'); } }]);
    const undo = inject('db.js', { pool: broken });
    const abs = path.join(ROOT, 'middleware', 'auth.js'); delete require.cache[abs];
    const mw = require(abs);
    const res = fakeRes(); let err;
    await mw({ session: session({ userId: 1, workspaceId: 7 }) }, res, e => { err = e; });
    assert.equal(err.message, 'db down');
    assert.equal(res.sent, false);
    undo(); inject('db.js', { pool }); delete require.cache[abs]; requireAuth = require(abs);
  });
});
