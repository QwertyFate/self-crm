// ROUTE tests — OPEN SIGNUP (utils/open-signup.js). With OPEN_SIGNUP=true nobody needs a code:
// 'create' asks for no platform code and 'join' takes a workspace_id picked from
// GET /api/auth/signup-options (always a member). With OPEN_SIGNUP=false every handler behaves
// exactly as before: codes required, codes consumed. The routes read the flag per request, so one
// loaded router serves both halves. Real HTTP against routes/auth.js and routes/workspace.js with
// a small in-memory fake of the tables involved.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

function makeState() {
  return {
    workspaces: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }, { id: 3, name: 'Gamma' }],
    // Ada (user 10) belongs to Alpha only
    users: [{ id: 10, email: 'ada@example.com', workspace_id: 1, role: 'owner' }],
    invites: [{ id: 7, code: 'ADMIN-CODE', used: 0, role: 'admin', workspace_id: 3 }],
    platformInvites: [{ id: 3, code: 'PLATFORM', used: 0 }],
  };
}

function makePool(state) {
  const log = [];
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  async function query(sql, params = []) {
    const text = norm(sql); log.push({ sql: text, params });
    if (/^SELECT id FROM users WHERE email = \$1/.test(text))                    return { rows: state.users.filter(u => u.email === params[0]).slice(0, 1) };
    if (/^SELECT \* FROM platform_invites WHERE code = \$1 AND used = 0/.test(text)) return { rows: state.platformInvites.filter(p => p.code === params[0] && !p.used) };
    if (/^SELECT \* FROM invite_codes WHERE code = \$1/.test(text))                return { rows: state.invites.filter(i => i.code === params[0]) };
    if (/^SELECT id FROM workspaces WHERE id = \$1/.test(text))                    return { rows: state.workspaces.filter(w => w.id === params[0]).map(w => ({ id: w.id })) };
    if (/^SELECT id, name FROM workspaces WHERE id NOT IN/.test(text)) {
      const me = state.users.find(u => u.id === params[0]);
      const mine = new Set(state.users.filter(u => u.email === me?.email).map(u => u.workspace_id));
      return { rows: state.workspaces.filter(w => !mine.has(w.id)) };
    }
    if (/^SELECT id, name FROM workspaces ORDER BY name/.test(text))               return { rows: state.workspaces };
    if (/FROM platform_settings/.test(text))                                       return { rows: [] };
    if (/^INSERT INTO workspaces/.test(text)) { const id = 100 + state.workspaces.length; state.workspaces.push({ id, name: params[0] }); return { rows: [{ id }] }; }
    if (/^INSERT INTO pipelines/.test(text))                                       return { rows: [{ id: 1 }] };
    if (/^INSERT INTO users \(workspace_id, email, name, password_hash, role\) SELECT/.test(text)) {   // join-workspace clones the caller
      const id = 500 + state.users.length; state.users.push({ id, email: params[1], workspace_id: params[0], role: params[3] }); return { rows: [{ id }] };
    }
    if (/^INSERT INTO users/.test(text)) { const id = 500 + state.users.length; state.users.push({ id, email: params[2], workspace_id: params[0], role: params[4] }); return { rows: [{ id }] }; }
    if (/FROM users WHERE id=\$1/.test(text))                                      return { rows: [{ id: params[0], name: 'Ada', email: 'ada@example.com', password_hash: '$2b$10$fake' }] };
    if (/^SELECT 1 FROM users WHERE email=\$1 AND workspace_id=\$2/.test(text))     return { rows: state.users.some(u => u.email === params[0] && u.workspace_id === params[1]) ? [{ '?column?': 1 }] : [] };
    if (/^SELECT id, name, kanban_fields/.test(text))                              return { rows: [{ id: params[0], name: state.workspaces.find(w => w.id === params[0])?.name || 'W', kanban_fields: null, contact_columns: null }] };
    return { rows: [] };
  }
  const client = { query, release() {} };
  return { query, connect: async () => client, log, find: re => log.find(e => re.test(e.sql)), filter: re => log.filter(e => re.test(e.sql)), some: re => log.some(e => re.test(e.sql)), reset() { log.length = 0; } };
}

// signup/create-workspace/join-workspace write req.session, which the real app gets from express-session.
const sessionOf = userId => (req, _res, next) => { req.session = userId ? { userId } : {}; next(); };

async function build(userId) {
  const state = makeState(), pool = makePool(state);
  const s = await serve({
    '/': sessionOf(userId),
    // auth.js create-workspace seeds the default pipeline through db.js — give it the real-shaped helper
    '/api/auth':      loadRoute('auth.js',      { pool, db: { pool, seedDefaultPipeline: async (wsId, client) => { await client.query('INSERT INTO pipelines (workspace_id, name, position) VALUES ($1,$2,0) RETURNING id', [wsId, 'Sales Pipeline']); } } }),
    '/api/workspace': loadRoute('workspace.js', { pool, user: { id: 10, workspaceId: 1, role: 'owner' } }),
  });
  return { state, pool, s };
}
const NEW = { name: 'Bob', email: 'bob@example.com', password: 'secret1' };

let savedFlag;
before(() => { savedFlag = process.env.OPEN_SIGNUP; });
after(() => { if (savedFlag === undefined) delete process.env.OPEN_SIGNUP; else process.env.OPEN_SIGNUP = savedFlag; });

describe('OPEN_SIGNUP=false — the original behaviour, codes everywhere', () => {
  before(() => { process.env.OPEN_SIGNUP = 'false'; });
  test('signup-options says closed and lists nothing', async () => {
    const { s } = await build(null);
    try { const r = await s.request('GET', '/api/auth/signup-options'); assert.equal(r.status, 200); assert.deepEqual(r.body, { openSignup: false }); }
    finally { await s.close(); }
  });
  test('create without a platform code → 400; with one → 201 and the code is consumed', async () => {
    const { s, pool } = await build(null);
    try {
      let r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'create', workspace_name: 'Delta' });
      assert.equal(r.status, 400); assert.equal(r.body.error, 'Platform invite code required');
      r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'create', workspace_name: 'Delta', platform_invite_code: 'PLATFORM' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.ok(pool.some(/^UPDATE platform_invites SET used=1/), 'consumed');
    } finally { await s.close(); }
  });
  test('join without a code → 400 even with a workspace_id; with a code → the code decides workspace and role', async () => {
    const { s, pool } = await build(null);
    try {
      let r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join', workspace_id: 2 });
      assert.equal(r.status, 400); assert.equal(r.body.error, 'Invite code required');
      r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join', invite_code: 'ADMIN-CODE' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const ins = pool.find(/^INSERT INTO users \(workspace_id, name, email/); assert.equal(ins.params[0], 3); assert.equal(ins.params[4], 'admin');
      assert.ok(pool.some(/^UPDATE invite_codes SET used=1/));
    } finally { await s.close(); }
  });
  test('logged in: create-workspace, join-workspace and POST /api/workspace all still demand their code', async () => {
    const { s } = await build(10);
    try {
      assert.equal((await s.request('POST', '/api/auth/create-workspace', { workspace_name: 'X' })).body.error, 'Platform invite code required');
      assert.equal((await s.request('POST', '/api/auth/join-workspace', { workspace_id: 2 })).body.error, 'Invite code required');
      assert.equal((await s.request('POST', '/api/workspace', { name: 'X' })).body.error, 'Platform invite code required');
    } finally { await s.close(); }
  });
});

describe('OPEN_SIGNUP=true — no codes', () => {
  before(() => { process.env.OPEN_SIGNUP = 'true'; });
  test('signup-options: open, every workspace by id and name for a visitor; a logged-in user does not see their own', async () => {
    const anon = await build(null);
    try {
      const r = await anon.s.request('GET', '/api/auth/signup-options');
      assert.deepEqual(r.body, { openSignup: true, workspaces: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }, { id: 3, name: 'Gamma' }] });
    } finally { await anon.s.close(); }
    const me = await build(10);
    try {
      const r = await me.s.request('GET', '/api/auth/signup-options');
      assert.deepEqual(r.body.workspaces.map(w => w.id), [2, 3], 'Alpha is Ada\'s already');
    } finally { await me.s.close(); }
  });
  test('create: no code asked, none looked up, none consumed; the signer-up is the owner', async () => {
    const { s, pool, state } = await build(null);
    try {
      const r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'create', workspace_name: 'Delta' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(pool.some(/platform_invites/), false, 'platform_invites is never touched');
      assert.equal(state.workspaces.at(-1).name, 'Delta');
      const ins = pool.find(/^INSERT INTO users \(workspace_id, name, email/); assert.equal(ins.params[4], 'owner');
      assert.deepEqual(pool.find(/^INSERT INTO user_workspaces/).params.slice(1), [state.workspaces.at(-1).id, 'owner']);
    } finally { await s.close(); }
  });
  test('create with a pasted code is simply ignored (still no lookup)', async () => {
    const { s, pool } = await build(null);
    try {
      const r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'create', workspace_name: 'Delta', platform_invite_code: 'WHATEVER' });
      assert.equal(r.status, 201); assert.equal(pool.some(/platform_invites/), false);
    } finally { await s.close(); }
  });
  test('join by workspace_id → a member of that workspace, no invite row touched', async () => {
    const { s, pool } = await build(null);
    try {
      const r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join', workspace_id: 2 });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.deepEqual(pool.find(/^SELECT id FROM workspaces WHERE id = \$1/).params, [2], 'the workspace must exist');
      const ins = pool.find(/^INSERT INTO users \(workspace_id, name, email/); assert.equal(ins.params[0], 2); assert.equal(ins.params[4], 'member');
      assert.deepEqual(pool.find(/^INSERT INTO user_workspaces/).params.slice(1), [2, 'member']);
      assert.equal(pool.some(/invite_codes/), false);
    } finally { await s.close(); }
  });
  test('join by workspace_id accepts the id as a string too (a <select> value) and never as admin', async () => {
    const { s, pool } = await build(null);
    try {
      const r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join', workspace_id: '3' });
      assert.equal(r.status, 201); assert.equal(pool.find(/^INSERT INTO users \(workspace_id, name, email/).params[4], 'member');
    } finally { await s.close(); }
  });
  test('an invite code still works in open signup — the only way to arrive as admin', async () => {
    const { s, pool } = await build(null);
    try {
      const r = await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join', invite_code: 'ADMIN-CODE', workspace_id: 2 });
      assert.equal(r.status, 201);
      const ins = pool.find(/^INSERT INTO users \(workspace_id, name, email/); assert.equal(ins.params[0], 3, 'the code wins over the picker'); assert.equal(ins.params[4], 'admin');
      assert.ok(pool.some(/^UPDATE invite_codes SET used=1/));
    } finally { await s.close(); }
  });
  test('join with neither, a bad id, or an unknown workspace → 400, nothing written', async () => {
    const { s, pool } = await build(null);
    try {
      assert.equal((await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join' })).body.error, 'Choose a workspace');
      assert.equal((await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join', workspace_id: 'abc' })).body.error, 'Choose a workspace');
      assert.equal((await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join', workspace_id: -1 })).body.error, 'Choose a workspace');
      assert.equal((await s.request('POST', '/api/auth/signup', { ...NEW, mode: 'join', workspace_id: 999 })).body.error, 'Workspace not found');
      assert.equal(pool.some(/^INSERT INTO/), false);
    } finally { await s.close(); }
  });
  test('logged in: create-workspace without a code → 201 with the workspace, nothing consumed', async () => {
    const { s, pool } = await build(10);
    try {
      const r = await s.request('POST', '/api/auth/create-workspace', { workspace_name: 'Side' });
      assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.workspace.name, 'Side');
      assert.equal(pool.some(/platform_invites/), false);
    } finally { await s.close(); }
  });
  test('logged in: join-workspace by workspace_id → member; already a member → 400', async () => {
    const { s, pool } = await build(10);
    try {
      const r = await s.request('POST', '/api/auth/join-workspace', { workspace_id: 2 });
      assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.workspace.id, 2);
      assert.deepEqual(pool.find(/^INSERT INTO user_workspaces/).params.slice(1), [2, 'member']);
      assert.equal(pool.some(/invite_codes/), false);
      assert.equal((await s.request('POST', '/api/auth/join-workspace', { workspace_id: 1 })).body.error, 'You are already a member of this workspace');
    } finally { await s.close(); }
  });
  test('logged in: POST /api/workspace without a code → 201, platform_invites untouched', async () => {
    const { s, pool } = await build(10);
    try {
      const r = await s.request('POST', '/api/workspace', { name: 'Side' });
      assert.equal(r.status, 201, JSON.stringify(r.body)); assert.ok(r.body.workspace_id);
      assert.equal(pool.some(/platform_invites/), false);
    } finally { await s.close(); }
  });
});
