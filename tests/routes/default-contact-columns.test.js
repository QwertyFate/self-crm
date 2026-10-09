// ROUTE tests for the default `contact_columns` a brand-new workspace is seeded
// with — from both places that seed one: POST /api/workspace (an existing user
// creating another workspace) and POST /api/auth/signup with mode="create".
//
// Contact stages were removed from the product (see the comment on the `stages`
// table in db.js), so a new workspace must NOT be given a visible "Stage"
// column: nothing in public/js renders contact.stage_id, so it was an always
// empty column every new workspace had to turn off by hand.
//
// Both fake pools answer the platform_settings lookups with no rows, so the
// hardcoded defaults in the route are what the test sees — which is the point.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const EXPECTED_KEYS = ['company', 'email', 'phone', 'assigned_to', 'created_at'];

function makePool(captured) {
  const client = {
    query: async (sql, params) => {
      if (/FROM platform_settings/.test(sql))     return { rows: [] };   // no platform override
      if (/INSERT INTO workspaces/.test(sql)) {
        captured.contactColumns = JSON.parse(params[1]);
        return { rows: [{ id: 9 }] };
      }
      if (/INSERT INTO pipelines/.test(sql))      return { rows: [{ id: 1 }] };
      // The creator's own row, which POST /api/workspace clones into the new
      // workspace. Matched loosely and carrying password_hash, because that
      // route copies the real hash (tests/routes/workspace-password-hash.test.js)
      // and this fixture should not care about the exact column list.
      if (/FROM users WHERE id=/.test(sql)) {
        return { rows: [{ name: 'Ada', email: 'ada@example.com', password_hash: '$2b$10$fake' }] };
      }
      if (/INSERT INTO users/.test(sql))          return { rows: [{ id: 5 }] };
      return { rows: [] };
    },
    release: () => {},
  };
  return {
    connect: async () => client,
    query: async (sql) => {
      if (/FROM platform_invites/.test(sql))        return { rows: [{ id: 3 }] };
      if (/SELECT id FROM users WHERE email/.test(sql)) return { rows: [] };   // email not taken
      return { rows: [] };
    },
  };
}

function assertNoContactStage(columns) {
  assert.ok(Array.isArray(columns), 'contact_columns was stored as a JSON array');
  assert.deepEqual(columns.map(c => c.key), EXPECTED_KEYS);
  assert.equal(columns.find(c => c.key === 'stage_id'), undefined,
    'no stage_id column: contact stages are not part of the product any more');
  assert.equal(columns.find(c => c.label === 'Stage'), undefined,
    'no column labelled "Stage" either');
}

describe('new workspaces are not seeded with a contact Stage column', () => {
  test('POST /api/workspace', async () => {
    const captured = {};
    const s = await serve({ '/api/workspace': loadRoute('workspace.js', { pool: makePool(captured) }) });
    try {
      const r = await s.request('POST', '/api/workspace', { name: 'Second', platform_invite_code: 'CODE' });
      assert.equal(r.status, 201, `expected 201, got ${r.status} ${JSON.stringify(r.body)}`);
      assertNoContactStage(captured.contactColumns);
    } finally { await s.close(); }
  });

  test('POST /api/auth/signup (mode=create)', async () => {
    const captured = {};
    const router = loadRoute('auth.js', { pool: makePool(captured) });
    // signup writes to req.session, which the real app gets from express-session.
    const session = (req, _res, next) => { req.session = {}; next(); };
    const s = await serve({ '/': session, '/api/auth': router });
    try {
      const r = await s.request('POST', '/api/auth/signup', {
        name: 'Ada', email: 'ada@example.com', password: 'secret1',
        mode: 'create', workspace_name: 'First', platform_invite_code: 'CODE',
      });
      assert.equal(r.status, 201, `expected 201, got ${r.status} ${JSON.stringify(r.body)}`);
      assertNoContactStage(captured.contactColumns);
    } finally { await s.close(); }
  });
});
