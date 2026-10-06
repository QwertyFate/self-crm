// ROUTE test for POST /api/workspace — the new `users` row must carry the
// creator's REAL password hash, never the literal string 'placeholder'.
//
// WHY. This is the route the UI's "+ Add workspace → Create" actually calls.
// It used to insert `'placeholder'` as the new row's password_hash, while its
// unused twin POST /api/auth/create-workspace copies the real one. Nobody can
// log in *with* a placeholder row — `bcrypt.compareSync(anything,'placeholder')`
// is always false — so it is not a weak password but an unusable one, and the
// risk is ACCOUNT LOCKOUT: POST /api/auth/login reads
// `SELECT * FROM users WHERE email = $1` with no ORDER BY and no LIMIT, then
// checks the password against whichever row came back first. One placeholder
// row among a user's rows can therefore refuse them their own correct password,
// depending on heap order.
//
// readmedev §8 has the long version. The companion fix is in
// tests/routes/reset-password-all-rows.test.js, which repairs rows like this
// when the user resets; this test stops them being created in the first place.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { loadRoute, serve } = require('../helpers/load-route');

const PASSWORD  = 'the-real-password';
const REAL_HASH = bcrypt.hashSync(PASSWORD, 10);

function makePool(captured) {
  const client = {
    query: async (sql, params) => {
      if (/FROM platform_settings/.test(sql))  return { rows: [] };
      if (/INSERT INTO workspaces/.test(sql))  return { rows: [{ id: 9 }] };
      if (/INSERT INTO pipelines/.test(sql))   return { rows: [{ id: 1 }] };
      // The creator's own row. password_hash is included whether or not the
      // route asks for it, so this fake works against the code before and
      // after the fix — pre-fix the route simply ignores it.
      if (/FROM users WHERE id=/.test(sql)) {
        return { rows: [{ name: 'Ada', email: 'ada@example.com', password_hash: REAL_HASH }] };
      }
      if (/INSERT INTO users/.test(sql)) {
        captured.userParams = params;
        return { rows: [{ id: 5 }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  return {
    connect: async () => client,
    query: async (sql) => {
      if (/FROM platform_invites/.test(sql)) return { rows: [{ id: 3 }] };
      return { rows: [] };
    },
  };
}

describe('POST /api/workspace stores a usable password hash', () => {
  test("the new users row gets the creator's real hash, not 'placeholder'", async () => {
    const captured = {};
    const s = await serve({ '/api/workspace': loadRoute('workspace.js', { pool: makePool(captured) }) });
    try {
      const r = await s.request('POST', '/api/workspace', { name: 'Second', platform_invite_code: 'CODE' });
      assert.equal(r.status, 201, `expected 201, got ${r.status} ${JSON.stringify(r.body)}`);

      const storedHash = captured.userParams[3];
      assert.notEqual(storedHash, 'placeholder',
        "the literal string 'placeholder' locks the account out depending on heap order");
      assert.equal(storedHash, REAL_HASH, "the creator's own hash is copied across");

      // The thing that actually matters: this row can authenticate.
      assert.ok(bcrypt.compareSync(PASSWORD, storedHash),
        'the new row must accept the password the user already has');

      // And the rest of the row is still the creator's identity.
      assert.equal(captured.userParams[0], 9,  'the new workspace');
      assert.equal(captured.userParams[1], 'Ada');
      assert.equal(captured.userParams[2], 'ada@example.com');
      assert.equal(captured.userParams[4], 'owner');
    } finally { await s.close(); }
  });

  test('login cannot be refused by row order afterwards', async () => {
    // Both of this email's rows now hold the same hash, so the unordered
    // `WHERE email = $1` in login has nothing left to get wrong.
    const captured = {};
    const s = await serve({ '/api/workspace': loadRoute('workspace.js', { pool: makePool(captured) }) });
    try {
      await s.request('POST', '/api/workspace', { name: 'Second', platform_invite_code: 'CODE' });
      const rows = [
        { id: 1, workspace_id: 1, email: 'ada@example.com', password_hash: REAL_HASH },
        { id: 5, workspace_id: 9, email: 'ada@example.com', password_hash: captured.userParams[3] },
      ];
      for (const order of ['natural', 'reverse']) {
        const first = order === 'reverse' ? rows[rows.length - 1] : rows[0];
        assert.ok(bcrypt.compareSync(PASSWORD, first.password_hash),
          `login must succeed when the ${order} row order is returned`);
      }
    } finally { await s.close(); }
  });
});
