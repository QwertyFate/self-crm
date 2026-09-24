// ROUTE test: GET /api/chat/messages pages by id in both directions —
// `before` (older, newest-first then reversed) and the new `after` (missed
// messages after a reconnect, oldest-first) — on the real route with a fake pool.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadRoute, serve } = require('../helpers/load-route');

const calls = [];
const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
let server;

describe('GET /api/chat/messages cursors', () => {
  before(async () => { server = await serve({ '/api/chat': loadRoute('chat.js', { pool }) }); });
  after(async () => { await server.close(); });

  test('after=40 returns the messages newer than 40, oldest first', async () => {
    calls.length = 0;
    const r = await server.request('GET', '/api/chat/messages?after=40');
    assert.equal(r.status, 200); assert.deepEqual(r.body, { messages: [] });
    assert.match(calls[0].sql, /AND m\.id > \$2/); assert.match(calls[0].sql, /ORDER BY m\.id ASC/);
    assert.deepEqual(calls[0].params, [7, 40]);
  });
  test('before=40 returns the messages older than 40, newest first from the database', async () => {
    calls.length = 0;
    await server.request('GET', '/api/chat/messages?before=40');
    assert.match(calls[0].sql, /AND m\.id < \$2/); assert.match(calls[0].sql, /ORDER BY m\.id DESC/);
    assert.deepEqual(calls[0].params, [7, 40]);
  });
  test('no cursor: the latest page, ordered by id', async () => {
    calls.length = 0;
    await server.request('GET', '/api/chat/messages');
    assert.doesNotMatch(calls[0].sql, /m\.id [<>] \$/); assert.match(calls[0].sql, /ORDER BY m\.id DESC/);
    assert.deepEqual(calls[0].params, [7]);
  });
});
