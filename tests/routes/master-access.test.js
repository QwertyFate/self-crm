// ROUTE tests: the master CRM (MASTER_ACCESS_CHANGES Part 1, 2026-11-09; utils/master.js, routes/admin.js
// POST /crm-login, routes/auth.js). The admin secret opens the CRM itself: the picker and the switcher list EVERY
// workspace, entering one points the session at that workspace's owner row, and every visit is a master_access_log
// row that the next switch and both logouts close. Pinned too: without `master` (a normal user, or the console's
// admin session alone) nothing reaches another workspace.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const { loadRoute } = require('../helpers/load-route');

const SECRET = 'a-long-random-admin-secret-for-tests';
const WS = { 7: 'Acme GmbH', 8: 'Lotrecht Messebau', 9: 'Ohne Inhaber' };
// one users row per workspace (the identity model in routes/auth.js)
const USERS = {
  70: { id: 70, name: 'Maria Acme', email: 'maria@acme.example', role: 'owner', workspace_id: 7 },
  71: { id: 71, name: 'Tom Acme', email: 'tom@acme.example', role: 'member', workspace_id: 7 },
  80: { id: 80, name: 'Jonas Brandt', email: 'jonas@lotrecht.example', role: 'owner', workspace_id: 8 },
};
for (const u of Object.values(USERS)) Object.assign(u, { column_widths: null, deal_columns: null, analytics_layout: null, timezone: null, notification_prefs: null });
const OWNERS = { 7: 70, 8: 80 };   // user_workspaces rows with role owner; workspace 9 has none

let LOG = [];
const pick = (row, cols) => Object.fromEntries(cols.map(c => [c, row[c]]));
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    let m;
    if (q.startsWith(`SELECT w.id, w.name, 'owner' AS role FROM workspaces w ORDER BY w.name`)) {
      return { rows: Object.entries(WS).map(([id, name]) => ({ id: Number(id), name, role: 'owner' })).sort((a, b) => a.name.localeCompare(b.name)) };
    }
    if (q.startsWith('SELECT u.id, u.name, w.name AS workspace_name FROM user_workspaces uw')) {
      const u = USERS[OWNERS[params[0]]];
      return { rows: u ? [{ id: u.id, name: u.name, workspace_name: WS[params[0]] }] : [] };
    }
    if (q.startsWith('INSERT INTO master_access_log')) {
      const row = { id: LOG.length + 1, workspace_id: params[0], user_id: params[1], workspace_name: params[2], user_name: params[3], ip: params[4], user_agent: params[5], left_at: null };
      LOG.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (q.startsWith('SELECT id, workspace_id, workspace_name, user_name, entered_at, left_at, ip FROM master_access_log ORDER BY entered_at DESC, id DESC LIMIT 100')) {
      return { rows: LOG.slice().reverse() };
    }
    if (q.startsWith('UPDATE master_access_log SET left_at = NOW() WHERE id = $1 AND left_at IS NULL')) {
      const row = LOG.find(r => r.id === params[0] && !r.left_at);
      if (row) row.left_at = 'now';
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if ((m = /^SELECT (.+) FROM users WHERE id ?= ?\$1$/.exec(q))) { const r = USERS[params[0]]; return { rows: r ? [pick(r, m[1].split(', '))] : [] }; }
    if ((m = /^SELECT (.+) FROM users WHERE email ?= ?\$1 AND workspace_id ?= ?\$2$/.exec(q))) {
      const r = Object.values(USERS).find(x => x.email === params[0] && x.workspace_id === Number(params[1]));
      return { rows: r ? [pick(r, m[1].split(', '))] : [] };
    }
    if (q.startsWith('SELECT DISTINCT w.id, w.name, u.role FROM users u')) {
      return { rows: Object.values(USERS).filter(x => x.email === params[0]).map(x => ({ id: x.workspace_id, name: WS[x.workspace_id], role: x.role })) };
    }
    if (q.startsWith('SELECT id, name, kanban_fields')) return { rows: WS[params[0]] ? [{ id: Number(params[0]), name: WS[params[0]], kanban_fields: null, contact_columns: null }] : [] };
    if (q.startsWith('SELECT w.id, w.name FROM user_workspaces')) {
      const u = USERS[params[0]];
      return { rows: u ? [{ id: u.workspace_id, name: WS[u.workspace_id] }] : [] };
    }
    throw new Error('unexpected query: ' + q);
  },
};

let base, server, session = {}, savedSecret;
before(async () => {
  savedSecret = process.env.ADMIN_SECRET;
  process.env.ADMIN_SECRET = SECRET;
  delete require.cache[path.resolve(__dirname, '../../utils/master.js')];   // bind utils/master.js to this fake pool
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = session; session.destroy = cb => { session = {}; cb && cb(); }; next(); });
  app.use('/api/admin', loadRoute('admin.js', { pool }));
  app.use('/api/auth', loadRoute('auth.js', { pool }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  if (savedSecret === undefined) delete process.env.ADMIN_SECRET; else process.env.ADMIN_SECRET = savedSecret;
  return new Promise(r => server.close(r));
});
beforeEach(() => { LOG = []; session = {}; });
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const login = () => call('POST', '/api/admin/crm-login', { secret: SECRET });

describe('logging in to the master CRM (POST /api/admin/crm-login)', () => {
  test('a wrong secret → 401, and the session gets no master', async () => {
    const r = await call('POST', '/api/admin/crm-login', { secret: SECRET.slice(0, -1) + 'x' });
    assert.equal(r.status, 401);
    assert.equal(session.master, undefined);
    assert.equal(session.isAdmin, undefined);
  });

  test('a secret of another length or none → 401, not an exception', async () => {
    assert.equal((await call('POST', '/api/admin/crm-login', { secret: 'short' })).status, 401);
    assert.equal((await call('POST', '/api/admin/crm-login', {})).status, 401);
  });

  test('ADMIN_SECRET unset → 503 (the feature is off)', async () => {
    delete process.env.ADMIN_SECRET;
    try { assert.equal((await login()).status, 503); } finally { process.env.ADMIN_SECRET = SECRET; }
  });

  test('the right secret → master and isAdmin on a session with no user; a CRM session that was open ends', async () => {
    session = { userId: 71, workspaceId: 7, userRole: 'member' };
    const r = await login();
    assert.equal(r.status, 200);
    assert.equal(r.body.redirect, '/');
    assert.equal(session.isAdmin, true);
    assert.ok(session.master && session.master.since);
    assert.equal(session.userId, undefined);
    assert.equal(session.workspaceId, undefined);
  });
});

describe('the picker and the switcher list every workspace', () => {
  test('GET /api/auth/me before a pick: the picker with every workspace', async () => {
    await login();
    const r = await call('GET', '/api/auth/me');
    assert.equal(r.body.user, null);
    assert.equal(r.body.needs_workspace_picker, true);
    assert.equal(r.body.master, true);
    assert.deepEqual(r.body.workspaces.map(w => w.id).sort(), [7, 8, 9]);
  });

  test('GET /api/auth/my-workspaces: every workspace', async () => {
    await login();
    const r = await call('GET', '/api/auth/my-workspaces');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.workspaces.map(w => w.id).sort(), [7, 8, 9]);
  });

  test('the console admin session alone (no master) gets neither', async () => {
    session = { isAdmin: true };
    assert.deepEqual((await call('GET', '/api/auth/me')).body, { user: null });
    assert.equal((await call('GET', '/api/auth/my-workspaces')).status, 401);
  });
});

describe('entering a workspace as its owner', () => {
  test('select-workspace: the session points at that workspace\'s owner row, and the visit is logged', async () => {
    await login();
    const r = await call('POST', '/api/auth/select-workspace', { workspace_id: 7 });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, 70);
    assert.equal(r.body.workspace.id, 7);
    assert.equal(session.userId, 70);
    assert.equal(Number(session.workspaceId), 7);
    assert.equal(LOG.length, 1);
    assert.deepEqual(pick(LOG[0], ['workspace_id', 'user_id', 'workspace_name', 'user_name', 'left_at']),
      { workspace_id: 7, user_id: 70, workspace_name: 'Acme GmbH', user_name: 'Maria Acme', left_at: null });
  });

  test('no owner, no such workspace, or a bad id → 404; the session is unchanged and nothing is logged', async () => {
    await login();
    for (const workspace_id of [9, 404, 'x', -1, null]) {
      const r = await call('POST', '/api/auth/select-workspace', { workspace_id });
      assert.equal(r.status, 404, `workspace_id ${workspace_id}`);
    }
    assert.equal(session.userId, undefined);
    assert.equal(LOG.length, 0);
  });

  test('switch-workspace from 7 to 8: the first visit is closed, the second logged, the session is 8\'s owner', async () => {
    await login();
    await call('POST', '/api/auth/select-workspace', { workspace_id: 7 });
    const r = await call('POST', '/api/auth/switch-workspace', { workspace_id: 8 });
    assert.equal(r.status, 200);
    assert.equal(r.body.user_id, 80);
    assert.equal(session.userId, 80);
    assert.equal(LOG.length, 2);
    assert.equal(LOG[0].left_at, 'now');
    assert.equal(LOG[1].left_at, null);
    assert.equal(LOG[1].workspace_id, 8);
  });

  test('GET /me inside: the owner, every workspace in the list, and `master` for the banner', async () => {
    await login();
    await call('POST', '/api/auth/select-workspace', { workspace_id: 8 });
    const r = await call('GET', '/api/auth/me');
    assert.equal(r.body.user.id, 80);
    assert.equal(r.body.workspace.id, 8);
    assert.deepEqual(r.body.workspaces.map(w => w.id).sort(), [7, 8, 9]);
    assert.ok(r.body.master && r.body.master.since);
  });
});

describe('leaving', () => {
  test('POST /api/auth/logout closes the open visit and ends the session', async () => {
    await login();
    await call('POST', '/api/auth/select-workspace', { workspace_id: 7 });
    assert.equal((await call('POST', '/api/auth/logout')).status, 200);
    assert.equal(LOG[0].left_at, 'now');
    assert.equal(session.userId, undefined);
    assert.equal(session.master, undefined);
  });

  test('POST /api/admin/logout closes the visit and leaves no owner session behind', async () => {
    await login();
    await call('POST', '/api/auth/select-workspace', { workspace_id: 7 });
    assert.equal((await call('POST', '/api/admin/logout')).status, 200);
    assert.equal(LOG[0].left_at, 'now');
    assert.equal(session.userId, undefined);
    assert.equal(session.workspaceId, undefined);
    assert.equal(session.master, undefined);
    assert.equal(session.isAdmin, false);
  });
});

describe('the banner\'s "Beenden" and the console\'s log (MASTER_ACCESS_CHANGES Parts 2 and 4)', () => {
  test('POST /api/admin/crm-leave closes the visit, ends master mode and keeps the console login', async () => {
    await login();
    await call('POST', '/api/auth/select-workspace', { workspace_id: 7 });
    const r = await call('POST', '/api/admin/crm-leave');
    assert.equal(r.status, 200);
    assert.equal(r.body.redirect, '/adminconsole');
    assert.equal(LOG[0].left_at, 'now');
    assert.equal(session.master, undefined);
    assert.equal(session.userId, undefined);
    assert.equal(session.workspaceId, undefined);
    assert.equal(session.isAdmin, true);
    // and the CRM no longer lists every workspace
    assert.deepEqual((await call('GET', '/api/auth/me')).body, { user: null });
  });

  test('GET /api/admin/crm-log: the visits, newest first, for the console only', async () => {
    await login();
    await call('POST', '/api/auth/select-workspace', { workspace_id: 7 });
    await call('POST', '/api/auth/switch-workspace', { workspace_id: 8 });
    const r = await call('GET', '/api/admin/crm-log');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.visits.map(v => [v.workspace_name, v.user_name, v.left_at]),
      [['Lotrecht Messebau', 'Jonas Brandt', null], ['Acme GmbH', 'Maria Acme', 'now']]);
    session = {};
    assert.equal((await call('GET', '/api/admin/crm-log')).status, 401);
    assert.equal((await call('POST', '/api/admin/crm-leave')).status, 401);
  });
});

describe('without master nothing reaches another workspace', () => {
  test('a member of 7 cannot select or switch into 8 (403), and nothing is logged', async () => {
    session = { userId: 71, workspaceId: 7, userRole: 'member' };
    assert.equal((await call('POST', '/api/auth/select-workspace', { workspace_id: 8 })).status, 403);
    assert.equal((await call('POST', '/api/auth/switch-workspace', { workspace_id: 8 })).status, 403);
    assert.equal(session.userId, 71);
    assert.equal(LOG.length, 0);
  });

  test('the console admin session alone cannot switch into a workspace', async () => {
    session = { isAdmin: true };
    assert.equal((await call('POST', '/api/auth/select-workspace', { workspace_id: 7 })).status, 401);
    assert.equal((await call('POST', '/api/auth/switch-workspace', { workspace_id: 7 })).status, 401);
    assert.equal(LOG.length, 0);
  });
});
