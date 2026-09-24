// UNIT test for the chat socket handler (utils/chat-socket.js) with fakes for
// Socket.IO and the pool: presence, room broadcast, the ack on chat_message
// (ok / empty / too_long / rate_limited) and presence cleanup on disconnect.
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { registerChatSocket } = require('../../utils/chat-socket');

function fakeIo() {
  const io = { handlers: {}, emitted: [] };
  io.on = (ev, fn) => { io.handlers[ev] = fn; };
  io.to = room => ({ emit: (ev, payload) => io.emitted.push({ room, ev, payload }) });
  return io;
}
function fakeSocket(session, id = 's1') {
  return { id, request: { session }, rooms: [], handlers: {}, disconnected: false,
    on(ev, fn) { this.handlers[ev] = fn; }, join(r) { this.rooms.push(r); }, disconnect() { this.disconnected = true; } };
}
function fakePool() {
  const calls = []; let nextId = 100;
  return { calls, query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM user_workspaces')) return { rows: [{ role: 'member' }] };
    if (sql.includes('SELECT name FROM users')) return { rows: [{ name: 'Zoe Quinn' }] };
    if (sql.includes('INSERT INTO chat_messages')) return { rows: [{ id: ++nextId, created_at: '2026-09-24T10:00:00.000Z' }] };
    return { rows: [] };
  } };
}
const ack = () => { const a = { calls: [] }; a.fn = r => a.calls.push(r); return a; };

describe('registerChatSocket', () => {
  let io, pool, socket;
  beforeEach(async () => {
    io = fakeIo(); pool = fakePool();
    registerChatSocket(io, pool, { rateLimit: { max: 3, windowMs: 10000 } });
    socket = fakeSocket({ userId: 1, workspaceId: 7 });
    await io.handlers.connection(socket);
  });

  test('a session-backed socket joins its workspace room and presence is broadcast', () => {
    assert.deepEqual(socket.rooms, ['ws-7']);
    assert.equal(socket.disconnected, false);
    assert.deepEqual(io.emitted.at(-1), { room: 'ws-7', ev: 'online_users', payload: [{ id: 1, name: 'Zoe Quinn' }] });
  });
  test('a socket without a session is dropped before anything else', async () => {
    const s2 = fakeSocket({}, 's2');
    await io.handlers.connection(s2);
    assert.equal(s2.disconnected, true); assert.deepEqual(s2.rooms, []);
  });
  test('chat_message: stored, read marker upserted, broadcast to the room, acked with the id', async () => {
    const a = ack();
    await socket.handlers.chat_message('  hello team  ', a.fn);
    assert.ok(pool.calls.some(c => c.sql.includes('INSERT INTO chat_messages') && c.params[2] === 'hello team'));
    assert.ok(pool.calls.some(c => c.sql.includes('INSERT INTO chat_reads')));
    const bc = io.emitted.find(e => e.ev === 'new_message');
    assert.deepEqual(bc, { room: 'ws-7', ev: 'new_message', payload: { id: 101, content: 'hello team', created_at: '2026-09-24T10:00:00.000Z', user_id: 1, user_name: 'Zoe Quinn' } });
    assert.deepEqual(a.calls, [{ ok: true, id: 101, created_at: '2026-09-24T10:00:00.000Z' }]);
  });
  test('empty and over-long messages are refused with a reason and never stored', async () => {
    const a = ack();
    await socket.handlers.chat_message('   ', a.fn);
    await socket.handlers.chat_message('x'.repeat(2001), a.fn);
    await socket.handlers.chat_message(42, a.fn);
    assert.deepEqual(a.calls, [{ error: 'empty' }, { error: 'too_long' }, { error: 'empty' }]);
    assert.equal(pool.calls.some(c => c.sql.includes('INSERT INTO chat_messages')), false);
    assert.equal(io.emitted.some(e => e.ev === 'new_message'), false);
  });
  test('a burst beyond the limit is refused with rate_limited; an ack is optional', async () => {
    const a = ack();
    for (let i = 0; i < 3; i++) await socket.handlers.chat_message(`m${i}`, a.fn);
    await socket.handlers.chat_message('m3', a.fn);
    await socket.handlers.chat_message('m4');   // no ack callback: must not throw
    assert.deepEqual(a.calls.map(r => r.ok ? 'ok' : r.error), ['ok', 'ok', 'ok', 'rate_limited']);
    assert.equal(io.emitted.filter(e => e.ev === 'new_message').length, 3);
  });
  test('disconnect removes the user from presence and re-broadcasts', () => {
    socket.handlers.disconnect();
    assert.deepEqual(io.emitted.at(-1), { room: 'ws-7', ev: 'online_users', payload: [] });
  });
});
