// ROUTE tests: the signed-in user's notification preferences come back from the server (2026-10-21).
// Bug: GET /api/auth/me (and the login, workspace-pick and workspace-switch answers) never returned
// users.notification_prefs, so the settings screen ticked every box after a reload, and saving it again turned every
// category back on. A person has one users row per workspace, so the preferences are per workspace: the switch must
// hand back the new workspace's own. Pinned: each answer carries notification_prefs from the row the session signs in
// as, {} when none were ever saved.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const { loadRoute } = require('../helpers/load-route');

const HASH = bcrypt.hashSync('secret-pw', 4);
const ROWS = {
  11: { id: 11, name: 'Anna Weiß', email: 'anna@example.de', role: 'owner', workspace_id: 1, password_hash: HASH, column_widths: null, deal_columns: null, analytics_layout: null, timezone: null, notification_prefs: { deals: false, tasks: true } },
  12: { id: 12, name: 'Anna Weiß', email: 'anna@example.de', role: 'member', workspace_id: 2, password_hash: HASH, column_widths: null, deal_columns: null, analytics_layout: null, timezone: null, notification_prefs: null },
  21: { id: 21, name: 'Ben Kraus', email: 'ben@example.de', role: 'member', workspace_id: 1, password_hash: HASH, column_widths: null, deal_columns: null, analytics_layout: null, timezone: null, notification_prefs: { contacts: false } },
};
const pick = (row, cols) => Object.fromEntries(cols.map(c => [c, row[c]]));
const pool = {
  query: async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    let m;
    if ((m = /^SELECT (.+) FROM users WHERE id ?= ?\$1$/.exec(q))) { const r = ROWS[params[0]]; return { rows: r ? [m[1] === '*' ? r : pick(r, m[1].split(', '))] : [] }; }
    if ((m = /^SELECT (.+) FROM users WHERE email ?= ?\$1 AND workspace_id ?= ?\$2$/.exec(q))) { const r = Object.values(ROWS).find(x => x.email === params[0] && x.workspace_id === Number(params[1])); return { rows: r ? [pick(r, m[1].split(', '))] : [] }; }
    if (q === 'SELECT * FROM users WHERE email = $1') return { rows: Object.values(ROWS).filter(x => x.email === params[0]).slice(0, 1) };
    if (q.startsWith('SELECT DISTINCT w.id, w.name, u.role FROM users u')) return { rows: Object.values(ROWS).filter(x => x.email === params[0]).map(x => ({ id: x.workspace_id, name: 'WS ' + x.workspace_id, role: x.role })) };
    if (q.startsWith('SELECT id, name, kanban_fields')) return { rows: [{ id: Number(params[0]), name: 'WS ' + params[0], kanban_fields: null, contact_columns: null }] };
    if (q.startsWith('SELECT w.id, w.name FROM user_workspaces')) return { rows: [] };
    throw new Error('unexpected query: ' + q);
  },
};

let base, server, session = {};
before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = session; session.destroy = cb => { session = {}; cb && cb(); }; next(); });
  app.use('/api/auth', loadRoute('auth.js', { pool }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(r => server.close(r)));
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() }; };

describe('notification preferences in every answer that signs a user in', () => {
  test('GET /me: the saved preferences of the signed-in row; {} when none were ever saved', async () => {
    session = { userId: 11, workspaceId: 1 };
    assert.deepEqual((await call('GET', '/api/auth/me')).body.user.notification_prefs, { deals: false, tasks: true });
    session = { userId: 12, workspaceId: 2 };
    assert.deepEqual((await call('GET', '/api/auth/me')).body.user.notification_prefs, {});
  });
  test('POST /switch-workspace: the new workspace\'s own preferences come back with the new role and id', async () => {
    session = { userId: 11, workspaceId: 1 };
    const r = await call('POST', '/api/auth/switch-workspace', { workspace_id: 2 });
    assert.equal(r.status, 200);
    assert.deepEqual({ role: r.body.role, user_id: r.body.user_id, notification_prefs: r.body.notification_prefs }, { role: 'member', user_id: 12, notification_prefs: {} });
    const back = await call('POST', '/api/auth/switch-workspace', { workspace_id: 1 });
    assert.deepEqual(back.body.notification_prefs, { deals: false, tasks: true });
  });
  test('POST /select-workspace (after a login with several workspaces): the picked row\'s preferences', async () => {
    session = { userId: 11 };
    const r = await call('POST', '/api/auth/select-workspace', { workspace_id: 1 });
    assert.deepEqual(r.body.user.notification_prefs, { deals: false, tasks: true });
  });
  test('POST /login with one workspace: that row\'s preferences', async () => {
    session = {};
    const r = await call('POST', '/api/auth/login', { email: 'ben@example.de', password: 'secret-pw' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.user.notification_prefs, { contacts: false });
  });
});
