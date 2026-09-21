// UNIT + ROUTE tests for notifySystem (notifications.js) and the announce
// endpoint that calls it. The bug: placeholders per user did not match the
// values bound per user, so any announcement to two or more users failed
// inside a swallowed catch — nobody was notified and the route said success.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const { createFakePool } = require('../helpers/fake-pool');
const { inject, loadRoute, serve, ROOT } = require('../helpers/load-route');

const USERS = [{ id: 1, workspace_id: 7 }, { id: 2, workspace_id: 7 }, { id: 3, workspace_id: 7 }];
let pool, restore, notifySystem, errors, origError;

// Highest $n referenced in a statement — must equal the number of bound values.
const maxPlaceholder = sql => Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));

before(() => {
  pool = createFakePool([
    { match: /^SELECT id, workspace_id FROM users WHERE workspace_id=\$1/, reply: p => ({ rows: p[0] === 7 ? USERS : [] }) },
    { match: /^INSERT INTO notifications/, reply: (p, sql) => {
        // Behave like Postgres: a placeholder beyond the bound values is an error.
        if (maxPlaceholder(sql) !== p.length) throw new Error(`bind message supplies ${p.length} parameters, but prepared statement requires ${maxPlaceholder(sql)}`);
        return { rows: [], rowCount: (sql.match(/\(\$/g) || []).length };
      } },
  ]);
  restore = inject('db.js', { pool });
  const abs = path.join(ROOT, 'notifications.js'); delete require.cache[abs];
  ({ notifySystem } = require(abs));
  origError = console.error; console.error = (...a) => { errors.push(a.join(' ')); };
});
after(() => { console.error = origError; restore(); });
beforeEach(() => { pool.reset(); errors = []; });

describe('notifySystem', () => {
  test('three users -> one INSERT whose placeholders match the bound values; one row per user; no swallowed error', async () => {
    await notifySystem('Wartung', 'Heute 18:00', 7);
    const ins = pool.find(/^INSERT INTO notifications/);
    assert.ok(ins, 'INSERT issued');
    assert.equal(maxPlaceholder(ins.sql), ins.params.length, 'placeholder count equals bound values');
    assert.equal((ins.sql.match(/\(\$/g) || []).length, 3, 'one value tuple per user');
    assert.deepEqual(ins.params, [7, 1, 'Wartung', 'Heute 18:00', 7, 2, 'Wartung', 'Heute 18:00', 7, 3, 'Wartung', 'Heute 18:00']);
    assert.deepEqual(errors, [], 'nothing was swallowed by the catch');
  });
  test('no users in the workspace -> no INSERT', async () => {
    await notifySystem('x', null, 8);
    assert.equal(pool.some(/^INSERT/), false);
  });
});

describe('POST /api/notifications/announce', () => {
  let owner, member;
  before(async () => {
    const abs = path.join(ROOT, 'notifications.js'); delete require.cache[abs];
    const real = require(abs);
    owner  = await serve({ '/api/notifications': loadRoute('notifications.js', { pool, notifications: real }) });
    member = await serve({ '/api/notifications': loadRoute('notifications.js', { pool, notifications: real, user: { id: 2, workspaceId: 7, role: 'member' } }) });
  });
  after(async () => { await owner.close(); await member.close(); });

  test('member -> 403 Owner only, no query', async () => {
    const r = await member.request('POST', '/api/notifications/announce', { title: 'x' });
    assert.equal(r.status, 403);
    assert.equal(pool.log.length, 0);
  });
  test('owner -> 200 and every member of the workspace gets a row', async () => {
    const r = await owner.request('POST', '/api/notifications/announce', { title: '  Wartung  ', body: ' Heute ' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true });
    const ins = pool.find(/^INSERT INTO notifications/);
    assert.ok(ins, 'INSERT issued');
    assert.equal(maxPlaceholder(ins.sql), ins.params.length);
    assert.equal(ins.params.filter(v => v === 'Wartung').length, 3, 'title trimmed, bound once per user');
    assert.deepEqual(errors, []);
  });
  test('missing title -> 400', async () => {
    assert.equal((await owner.request('POST', '/api/notifications/announce', { body: 'x' })).status, 400);
  });
});
