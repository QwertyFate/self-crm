// ROUTE tests for routes/notifications.js — a user's notification list and
// its read/clear actions must be scoped to that user (the announce endpoint
// is covered in unit/notify-system.test.js).
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

let pool, server;
before(async () => {
  pool = createFakePool([
    { match: /FROM notifications n/, reply: () => ({ rows: [{ id: 1, read: false }, { id: 2, read: true }, { id: 3, read: false }] }) },
    { match: /^(UPDATE|DELETE FROM) notifications/, reply: () => ({ rows: [], rowCount: 1 }) },
    { match: /^UPDATE users SET notification_prefs/, reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  server = await serve({ '/api/notifications': loadRoute('notifications.js', { pool, user: { id: 42, workspaceId: 7, role: 'member' } }) });
});
after(() => server.close());
beforeEach(() => pool.reset());

describe('scoped to the caller', () => {
  test('GET / lists my notifications with the unread count', async () => {
    const r = await server.request('GET', '/api/notifications');
    assert.equal(r.status, 200);
    assert.equal(r.body.unread, 2);
    assert.deepEqual(pool.find(/FROM notifications n/).params, [42]);
  });
  test('PATCH /:id/read marks only my row', async () => {
    await server.request('PATCH', '/api/notifications/5/read');
    const q = pool.find(/^UPDATE notifications SET read=true WHERE id=\$1 AND user_id=\$2/);
    assert.ok(q, 'scoped by user_id');
    assert.deepEqual(q.params, ['5', 42]);
  });
  test('PATCH /read-all and DELETE /clear act on my rows only', async () => {
    await server.request('PATCH', '/api/notifications/read-all');
    assert.deepEqual(pool.find(/^UPDATE notifications SET read=true WHERE user_id=\$1/).params, [42]);
    await server.request('DELETE', '/api/notifications/clear');
    assert.deepEqual(pool.find(/^DELETE FROM notifications WHERE user_id=\$1 AND read=true/).params, [42]);
  });
  test('PATCH /preferences requires an object and writes it to my user row', async () => {
    assert.equal((await server.request('PATCH', '/api/notifications/preferences', { prefs: 'x' })).status, 400);
    const r = await server.request('PATCH', '/api/notifications/preferences', { prefs: { deals: false } });
    assert.equal(r.status, 200);
    assert.deepEqual(pool.find(/^UPDATE users SET notification_prefs/).params, [JSON.stringify({ deals: false }), 42]);
  });
});
