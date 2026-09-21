// ROUTE tests for routes/chat.js (HTTP side). The rate-limit middleware has
// its own unit test; here: workspace scoping of reads, validation of writes,
// and the read-cursor upsert.
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createFakePool } = require('../helpers/fake-pool');
const { loadRoute, serve } = require('../helpers/load-route');

let pool, server;
before(async () => {
  pool = createFakePool([
    { match: /FROM chat_messages m JOIN users u/, reply: () => ({ rows: [{ id: 2, content: 'b' }, { id: 1, content: 'a' }] }) },
    { match: /SELECT COUNT\(\*\) AS count FROM chat_messages/, reply: () => ({ rows: [{ count: '3' }] }) },
    { match: /^INSERT INTO chat_messages/, reply: () => ({ rows: [{ id: 9, created_at: 't' }] }) },
    { match: /^INSERT INTO chat_reads/,    reply: () => ({ rows: [], rowCount: 1 }) },
  ]);
  server = await serve({ '/api/chat': loadRoute('chat.js', { pool, user: { id: 42, workspaceId: 7, role: 'member' } }) });
});
after(() => server.close());
beforeEach(() => pool.reset());

describe('reads', () => {
  test('GET /messages is scoped to the workspace, oldest first, and honours a `before` cursor', async () => {
    const r = await server.request('GET', '/api/chat/messages?before=10');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.messages.map(m => m.id), [1, 2], 'reversed to chronological order');
    const q = pool.find(/FROM chat_messages m JOIN users u/);
    assert.match(q.sql, /WHERE m\.workspace_id = \$1 AND m\.id < \$2/);
    assert.deepEqual(q.params, [7, 10]);
  });
  test('GET /unread counts messages of others in this workspace since my last read', async () => {
    const r = await server.request('GET', '/api/chat/unread');
    assert.deepEqual(r.body, { unread: 3 });
    assert.deepEqual(pool.find(/COUNT\(\*\) AS count FROM chat_messages/).params, [7, 42]);
  });
});

describe('writes', () => {
  test('POST /messages: non-string / empty -> 400, no INSERT', async () => {
    assert.equal((await server.request('POST', '/api/chat/messages', { content: 5 })).status, 400);
    assert.equal((await server.request('POST', '/api/chat/messages', { content: '  ' })).status, 400);
    assert.equal(pool.some(/^INSERT/), false);
  });
  test('POST /messages: valid -> 201 {id, created_at}; stored trimmed under the caller and workspace; read cursor bumped', async () => {
    const r = await server.request('POST', '/api/chat/messages', { content: '  hallo  ' });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { id: 9, created_at: 't' });
    assert.deepEqual(pool.find(/^INSERT INTO chat_messages/).params, [7, 42, 'hallo']);
    assert.deepEqual(pool.find(/^INSERT INTO chat_reads/).params, [42, 7]);
  });
  test('PATCH /read upserts the read cursor for the caller in this workspace', async () => {
    const r = await server.request('PATCH', '/api/chat/read');
    assert.equal(r.status, 200);
    const q = pool.find(/^INSERT INTO chat_reads/);
    assert.match(q.sql, /ON CONFLICT \(user_id, workspace_id\) DO UPDATE/);
    assert.deepEqual(q.params, [42, 7]);
  });
});
