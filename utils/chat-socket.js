/**
 * Team chat over Socket.IO: one room per workspace.
 *
 * A socket is admitted only with a session that names a user and a workspace
 * the user belongs to (checked against user_workspaces on connect). Presence
 * is kept in memory per workspace (a user is online while any of their
 * sockets is connected) and broadcast as `online_users` on every change.
 *
 * `chat_message(content, ack)` stores the message, marks the sender's read
 * position, broadcasts `new_message` to the room (the sender included) and
 * answers the optional ack with `{ ok, id, created_at }` or `{ error }` where
 * error is 'empty' | 'too_long' | 'rate_limited' | 'server'. A light sliding
 * window (default 10 messages per 10 s per user) keeps one tab from flooding
 * the room.
 */
const MAX_LEN = 2000;

function registerChatSocket(io, pool, opts = {}) {
  const presence = opts.presence || new Map();                      // workspaceId -> Map(userId -> { name, sockets:Set })
  const limit = Object.assign({ max: 10, windowMs: 10000 }, opts.rateLimit || {});
  const now = opts.now || (() => Date.now());
  const recent = new Map();                                         // userId -> [timestamps]

  function getOnlineList(workspaceId) {
    const ws = presence.get(workspaceId);
    if (!ws) return [];
    return [...ws.entries()].map(([id, u]) => ({ id, name: u.name }));
  }
  function allowed(userId) {
    const t = now(), from = t - limit.windowMs;
    const list = (recent.get(userId) || []).filter(x => x > from);
    if (list.length >= limit.max) { recent.set(userId, list); return false; }
    list.push(t); recent.set(userId, list);
    return true;
  }

  io.on('connection', async (socket) => {
    const sess = socket.request?.session;
    if (!sess?.userId || !sess?.workspaceId) { socket.disconnect(); return; }
    const userId = sess.userId, workspaceId = sess.workspaceId;

    try {
      const { rows: [mem] } = await pool.query('SELECT role FROM user_workspaces WHERE user_id=$1 AND workspace_id=$2', [userId, workspaceId]);
      if (!mem) { socket.disconnect(); return; }
    } catch { socket.disconnect(); return; }

    const { rows: [user] } = await pool.query('SELECT name FROM users WHERE id=$1', [userId]);
    const userName = user?.name || 'Unknown';

    socket.join(`ws-${workspaceId}`);
    if (!presence.has(workspaceId)) presence.set(workspaceId, new Map());
    const wsPresence = presence.get(workspaceId);
    if (!wsPresence.has(userId)) wsPresence.set(userId, { name: userName, sockets: new Set() });
    wsPresence.get(userId).sockets.add(socket.id);
    io.to(`ws-${workspaceId}`).emit('online_users', getOnlineList(workspaceId));

    socket.on('chat_message', async (content, ack) => {
      const reply = r => { if (typeof ack === 'function') ack(r); };
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) return reply({ error: 'empty' });
      if (text.length > MAX_LEN) return reply({ error: 'too_long' });
      if (!allowed(userId)) return reply({ error: 'rate_limited' });
      try {
        const { rows: [msg] } = await pool.query(
          `INSERT INTO chat_messages (workspace_id, user_id, content) VALUES ($1,$2,$3) RETURNING id, created_at`,
          [workspaceId, userId, text]
        );
        await pool.query(
          `INSERT INTO chat_reads (user_id, workspace_id, last_read_at) VALUES ($1,$2,NOW())
           ON CONFLICT (user_id, workspace_id) DO UPDATE SET last_read_at = NOW()`,
          [userId, workspaceId]
        );
        io.to(`ws-${workspaceId}`).emit('new_message', { id: msg.id, content: text, created_at: msg.created_at, user_id: userId, user_name: userName });
        reply({ ok: true, id: msg.id, created_at: msg.created_at });
      } catch (e) {
        console.error('Socket chat error:', e);
        reply({ error: 'server' });
      }
    });

    socket.on('disconnect', () => {
      const u = wsPresence.get(userId);
      if (u) {
        u.sockets.delete(socket.id);
        if (u.sockets.size === 0) wsPresence.delete(userId);
      }
      io.to(`ws-${workspaceId}`).emit('online_users', getOnlineList(workspaceId));
    });
  });

  return { presence, getOnlineList };
}

module.exports = { registerChatSocket, MAX_LEN };
