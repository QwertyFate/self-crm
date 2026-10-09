// ROUTE tests for POST /api/auth/reset-password — it must re-hash EVERY `users`
// row that shares the email, not just the one the token points at.
//
// WHY. The identity model (see db.js) is one `users` row per workspace, all
// sharing an email and ONE password hash. `POST /api/auth/login` leans on that:
// it does `SELECT * FROM users WHERE email = $1` with no ORDER BY and no LIMIT,
// then checks the password against whichever row came back first. So the moment
// two rows for one email hold DIFFERENT hashes, logging in is decided by heap
// order. Two ways that happens today:
//
//   1. a reset that re-hashes one row and leaves the others on the old hash;
//   2. `POST /api/workspace`, which inserts the literal string 'placeholder'
//      as a new row's hash (readmedev §8).
//
// Both are closed by resetting the password for the whole email: every row ends
// up on the new hash, and a 'placeholder' row is repaired on the way.
//
// The fake pool below MODELS the two rows rather than string-matching the SQL,
// so it asserts the outcome and accepts any correct statement shape.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { loadRoute, serve } = require('../helpers/load-route');

const OLD_PASSWORD = 'oldpassword';
const NEW_PASSWORD = 'brand-new-password';

// A users table of one person with two workspaces, plus the password_resets row
// for the FIRST of their rows. `applyUpdate` understands the two shapes a
// correct fix can take — by id (the pre-fix behaviour) and by email — and
// throws on anything else so an unrecognised statement fails loudly instead of
// quietly passing.
function makePool(rows, tokenFor = 10) {
  const store = rows.map(r => ({ ...r }));

  function applyUpdate(sql, params) {
    const [hash, id] = params;
    if (/WHERE\s+email\s*=\s*\(\s*SELECT\s+email\s+FROM\s+users\s+WHERE\s+id\s*=\s*\$2\s*\)/i.test(sql)) {
      const target = store.find(r => r.id === id);
      const hits = store.filter(r => r.email === target.email);
      hits.forEach(r => { r.password_hash = hash; });
      return { rowCount: hits.length };
    }
    if (/WHERE\s+id\s*=\s*\$2/i.test(sql)) {
      const row = store.find(r => r.id === id);
      row.password_hash = hash;
      return { rowCount: 1 };
    }
    throw new Error(`test fake does not understand this UPDATE: ${sql}`);
  }

  async function query(sql, params) {
    if (/FROM password_resets WHERE token/.test(sql)) {
      if (params[0] !== 'VALID-TOKEN') return { rows: [] };
      return { rows: [{ id: 1, user_id: tokenFor, expires_at: new Date(Date.now() + 3.6e6), used: 0 }] };
    }
    if (/UPDATE users SET password_hash/.test(sql)) return applyUpdate(sql, params);
    if (/UPDATE password_resets SET used/.test(sql)) return { rowCount: 1 };
    if (/DELETE FROM password_resets/.test(sql))     return { rowCount: 0 };
    return { rows: [] };
  }

  return { store, connect: async () => ({ query, release: () => {} }), query };
}

function serveAuth(pool) {
  const session = (req, _res, next) => { req.session = {}; next(); };
  return serve({ '/': session, '/api/auth': loadRoute('auth.js', { pool }) });
}

// What login actually does: an UNORDERED read, then bcrypt against row[0].
// `order` simulates the two heap orders Postgres may hand back.
function loginWouldSucceed(store, email, password, order) {
  const candidates = store.filter(r => r.email === email);
  const first = order === 'reverse' ? candidates[candidates.length - 1] : candidates[0];
  return bcrypt.compareSync(password, first.password_hash);
}

describe('POST /api/auth/reset-password covers every users row for the email', () => {
  test('a two-workspace user can log in afterwards whichever row comes back first', async () => {
    const oldHash = bcrypt.hashSync(OLD_PASSWORD, 10);
    const pool = makePool([
      { id: 10, workspace_id: 1, email: 'maria@acme.io', password_hash: oldHash },
      { id: 20, workspace_id: 2, email: 'maria@acme.io', password_hash: oldHash },
    ]);
    const s = await serveAuth(pool);
    try {
      const r = await s.request('POST', '/api/auth/reset-password', {
        token: 'VALID-TOKEN', password: NEW_PASSWORD,
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status} ${JSON.stringify(r.body)}`);

      const rows = pool.store.filter(x => x.email === 'maria@acme.io');
      assert.equal(rows.length, 2);
      for (const row of rows) {
        assert.ok(bcrypt.compareSync(NEW_PASSWORD, row.password_hash),
          `users row ${row.id} (workspace ${row.workspace_id}) must accept the new password`);
        assert.ok(!bcrypt.compareSync(OLD_PASSWORD, row.password_hash),
          `users row ${row.id} must no longer accept the old password`);
      }

      // The point of all of it: login no longer depends on which row Postgres
      // happens to return first.
      for (const order of ['natural', 'reverse']) {
        assert.ok(loginWouldSucceed(pool.store, 'maria@acme.io', NEW_PASSWORD, order),
          `login must succeed with the new password when the ${order} row order is returned`);
        assert.ok(!loginWouldSucceed(pool.store, 'maria@acme.io', OLD_PASSWORD, order),
          `the old password must be dead in the ${order} row order too`);
      }
    } finally { await s.close(); }
  });

  test("a reset repairs a 'placeholder' hash row, so it can no longer lock the account out", async () => {
    // What POST /api/workspace leaves behind: a second row whose hash is the
    // literal string 'placeholder'. bcrypt.compareSync(anything,'placeholder')
    // is always false, so while that row is returned first the user is refused
    // their own correct password.
    const pool = makePool([
      { id: 10, workspace_id: 1, email: 'maria@acme.io', password_hash: bcrypt.hashSync(OLD_PASSWORD, 10) },
      { id: 20, workspace_id: 2, email: 'maria@acme.io', password_hash: 'placeholder' },
    ]);

    assert.ok(!loginWouldSucceed(pool.store, 'maria@acme.io', OLD_PASSWORD, 'reverse'),
      'baseline: with the placeholder row first, the correct password is refused');

    const s = await serveAuth(pool);
    try {
      const r = await s.request('POST', '/api/auth/reset-password', {
        token: 'VALID-TOKEN', password: NEW_PASSWORD,
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status} ${JSON.stringify(r.body)}`);

      assert.equal(pool.store.filter(x => x.password_hash === 'placeholder').length, 0,
        'the placeholder hash is gone — the reset repaired it');
      for (const order of ['natural', 'reverse']) {
        assert.ok(loginWouldSucceed(pool.store, 'maria@acme.io', NEW_PASSWORD, order),
          `login must succeed in the ${order} row order after the repair`);
      }
    } finally { await s.close(); }
  });

  test('the token can point AT the placeholder row and the repair still works', async () => {
    // POST /api/auth/forgot-password also reads `WHERE email = $1` with no
    // ORDER BY (routes/auth.js line 388), so the token it mints may belong to
    // the placeholder row. The repair keys off that row's EMAIL, not its hash,
    // so it covers every row either way — this is what makes the self-heal
    // reliable rather than lucky.
    const pool = makePool([
      { id: 10, workspace_id: 1, email: 'maria@acme.io', password_hash: bcrypt.hashSync(OLD_PASSWORD, 10) },
      { id: 20, workspace_id: 2, email: 'maria@acme.io', password_hash: 'placeholder' },
    ], 20);   // ← the token belongs to the BROKEN row
    const s = await serveAuth(pool);
    try {
      const r = await s.request('POST', '/api/auth/reset-password', {
        token: 'VALID-TOKEN', password: NEW_PASSWORD,
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status} ${JSON.stringify(r.body)}`);
      assert.equal(pool.store.filter(x => x.password_hash === 'placeholder').length, 0);
      for (const order of ['natural', 'reverse']) {
        assert.ok(loginWouldSucceed(pool.store, 'maria@acme.io', NEW_PASSWORD, order),
          `login must succeed in the ${order} row order`);
      }
    } finally { await s.close(); }
  });

  test('an email whose rows are ALL placeholders is recoverable too', async () => {
    // The copy-based repair SQL in readmedev §8 cannot fix this — there is no
    // good row to copy from. A reset can, because it writes a FRESH hash
    // rather than copying one, so this user is never permanently locked out.
    const pool = makePool([
      { id: 10, workspace_id: 1, email: 'maria@acme.io', password_hash: 'placeholder' },
      { id: 20, workspace_id: 2, email: 'maria@acme.io', password_hash: 'placeholder' },
    ], 10);
    const s = await serveAuth(pool);
    try {
      const r = await s.request('POST', '/api/auth/reset-password', {
        token: 'VALID-TOKEN', password: NEW_PASSWORD,
      });
      assert.equal(r.status, 200);
      for (const row of pool.store) {
        assert.ok(bcrypt.compareSync(NEW_PASSWORD, row.password_hash),
          `row ${row.id} must accept the new password`);
      }
    } finally { await s.close(); }
  });

  test('a single-workspace user is unaffected', async () => {
    const pool = makePool([
      { id: 10, workspace_id: 1, email: 'solo@acme.io', password_hash: bcrypt.hashSync(OLD_PASSWORD, 10) },
    ]);
    const s = await serveAuth(pool);
    try {
      const r = await s.request('POST', '/api/auth/reset-password', {
        token: 'VALID-TOKEN', password: NEW_PASSWORD,
      });
      assert.equal(r.status, 200);
      assert.ok(bcrypt.compareSync(NEW_PASSWORD, pool.store[0].password_hash));
    } finally { await s.close(); }
  });

  test('another person on another email is never touched', async () => {
    const otherHash = bcrypt.hashSync('their-own-password', 10);
    const pool = makePool([
      { id: 10, workspace_id: 1, email: 'maria@acme.io', password_hash: bcrypt.hashSync(OLD_PASSWORD, 10) },
      { id: 20, workspace_id: 2, email: 'maria@acme.io', password_hash: bcrypt.hashSync(OLD_PASSWORD, 10) },
      { id: 30, workspace_id: 2, email: 'someone@else.io', password_hash: otherHash },
    ]);
    const s = await serveAuth(pool);
    try {
      const r = await s.request('POST', '/api/auth/reset-password', {
        token: 'VALID-TOKEN', password: NEW_PASSWORD,
      });
      assert.equal(r.status, 200);
      const other = pool.store.find(x => x.email === 'someone@else.io');
      assert.equal(other.password_hash, otherHash, 'a different email keeps its hash');
      assert.ok(!bcrypt.compareSync(NEW_PASSWORD, other.password_hash));
    } finally { await s.close(); }
  });

  test('an invalid token still changes nothing', async () => {
    const oldHash = bcrypt.hashSync(OLD_PASSWORD, 10);
    const pool = makePool([{ id: 10, workspace_id: 1, email: 'maria@acme.io', password_hash: oldHash }]);
    const s = await serveAuth(pool);
    try {
      const r = await s.request('POST', '/api/auth/reset-password', {
        token: 'WRONG-TOKEN', password: NEW_PASSWORD,
      });
      assert.equal(r.status, 400);
      assert.equal(pool.store[0].password_hash, oldHash);
    } finally { await s.close(); }
  });
});
