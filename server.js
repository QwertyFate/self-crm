const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const path       = require('path');
const helmet     = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { pool, initDb } = require('./db');

const app        = express();
const httpServer = http.createServer(app);
const PORT       = process.env.PORT || 3000;

app.set('trust proxy', 1);

const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com", "https://static.cloudflareinsights.com"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "blob:", "https:"],
      frameSrc:    ["https://docs.google.com"],
      connectSrc:  ["'self'", "https://*.supabase.co", "https://cloudflareinsights.com", "wss:"],
      fontSrc:     ["'self'", "data:"],
      objectSrc:   ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

// ── Rate limiters ─────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  message: { error: 'Too many accounts created from this IP. Please try again in an hour.' },
  standardHeaders: true, legacyHeaders: false,
});
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 3,
  message: { error: 'Too many password reset attempts. Please try again in an hour.' },
  standardHeaders: true, legacyHeaders: false,
});
const webhookIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 120,
  message: { error: 'Too many webhook requests from this IP. Please slow down.' },
  standardHeaders: true, legacyHeaders: false,
});
const webhookKeyLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  message: { error: 'Webhook rate limit exceeded. Maximum 120 requests per minute per key.' },
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.params.key || 'unknown',
});

app.use(express.json());

// Extract session middleware so Socket.io can share it
const sessionMiddleware = session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
});
app.use(sessionMiddleware);

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  },
}));

// ── Apply rate limits ─────────────────────────────────────
app.use('/api/auth/login',           loginLimiter);
app.use('/api/auth/signup',          signupLimiter);
app.use('/api/auth/forgot-password', passwordLimiter);
app.use('/api/auth/reset-password',  passwordLimiter);

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/contacts',      require('./routes/contacts'));
app.use('/api/stages',        require('./routes/stages'));
app.use('/api/fields',        require('./routes/fields'));
app.use('/api/activities',    require('./routes/activities'));
app.use('/api/invites',       require('./routes/invites'));
app.use('/api/workspace',     require('./routes/workspace'));
app.use('/api/pipelines',     require('./routes/pipelines'));
app.use('/api/deals',         require('./routes/deals'));
app.use('/api/deal-fields',   require('./routes/deal-fields'));
app.use('/api/objects',       require('./routes/objects'));
app.use('/api/object-fields', require('./routes/object-fields'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/task-fields',   require('./routes/task-fields'));
app.use('/api/task-projects', require('./routes/task-projects'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat',          require('./routes/chat'));
app.use('/api/analytics',     require('./routes/analytics'));
app.use('/api/tasks',         require('./routes/task-attachments'));
app.use('/api/integrations/receive', webhookIpLimiter, webhookKeyLimiter);
app.use('/api/integrations',  require('./routes/integrations'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Socket.io — real-time chat + presence ─────────────────
const io = new Server(httpServer, {
  cors: { origin: false },
  transports: ['websocket', 'polling'],
});

// Share Express session with Socket.io
io.engine.use(sessionMiddleware);

// workspaceId → Map<userId, { name, sockets: Set<socketId> }>
const presence = new Map();

function getOnlineList(workspaceId) {
  const ws = presence.get(workspaceId);
  if (!ws) return [];
  return [...ws.entries()].map(([id, u]) => ({ id, name: u.name }));
}

io.on('connection', async (socket) => {
  const sess = socket.request.session;
  if (!sess?.userId || !sess?.workspaceId) { socket.disconnect(); return; }

  const userId      = sess.userId;
  const workspaceId = sess.workspaceId;

  // Verify membership
  try {
    const { rows: [mem] } = await pool.query(
      'SELECT role FROM user_workspaces WHERE user_id=$1 AND workspace_id=$2',
      [userId, workspaceId]
    );
    if (!mem) { socket.disconnect(); return; }
  } catch { socket.disconnect(); return; }

  const { rows: [user] } = await pool.query('SELECT name FROM users WHERE id=$1', [userId]);
  const userName = user?.name || 'Unknown';

  socket.join(`ws-${workspaceId}`);

  // Update presence
  if (!presence.has(workspaceId)) presence.set(workspaceId, new Map());
  const wsPresence = presence.get(workspaceId);
  if (!wsPresence.has(userId)) wsPresence.set(userId, { name: userName, sockets: new Set() });
  wsPresence.get(userId).sockets.add(socket.id);

  // Broadcast updated online list to workspace
  io.to(`ws-${workspaceId}`).emit('online_users', getOnlineList(workspaceId));

  // ── Incoming message ──────────────────────────────────────
  socket.on('chat_message', async (content) => {
    if (!content?.trim() || content.length > 2000) return;
    try {
      const { rows: [msg] } = await pool.query(
        `INSERT INTO chat_messages (workspace_id, user_id, content) VALUES ($1,$2,$3) RETURNING id, created_at`,
        [workspaceId, userId, content.trim()]
      );
      // Auto-mark sender as read
      await pool.query(
        `INSERT INTO chat_reads (user_id, workspace_id, last_read_at) VALUES ($1,$2,NOW())
         ON CONFLICT (user_id, workspace_id) DO UPDATE SET last_read_at = NOW()`,
        [userId, workspaceId]
      );
      io.to(`ws-${workspaceId}`).emit('new_message', {
        id: msg.id,
        content: content.trim(),
        created_at: msg.created_at,
        user_id: userId,
        user_name: userName,
      });
    } catch (e) { console.error('Socket chat error:', e); }
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    const u = wsPresence?.get(userId);
    if (u) {
      u.sockets.delete(socket.id);
      if (u.sockets.size === 0) wsPresence.delete(userId);
    }
    io.to(`ws-${workspaceId}`).emit('online_users', getOnlineList(workspaceId));
  });
});

initDb()
  .then(() => httpServer.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
