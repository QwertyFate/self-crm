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

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error(
    'FATAL: SESSION_SECRET is not set. Refusing to start with a hard-coded fallback secret.\n' +
    'Set SESSION_SECRET in .env — generate one with:\n' +
    '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  console.warn('WARNING: SESSION_SECRET is shorter than 32 characters and is weak. Rotate it.');
}

// Platform admin console path. Unset disables the console; malformed is fatal.
const { resolveAdminConsolePath } = require('./utils/admin-console');
let ADMIN_CONSOLE_PATH = null;
try {
  ADMIN_CONSOLE_PATH = resolveAdminConsolePath(process.env.ADMIN_CONSOLE_PATH);
} catch (e) {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
}
if (!ADMIN_CONSOLE_PATH) console.warn('ADMIN_CONSOLE_PATH is not set — the platform admin console is disabled.');

// Trust X-Forwarded-* only from Cloudflare's edge and local/private hops.
// A hop count is wrong in both directions: too low collapses every user onto
// the proxy's IP, too high lets a direct hit on the origin spoof its own IP.
app.set('trust proxy', require('./utils/trusted-proxies'));

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
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Too many admin login attempts. Please try again in 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
});
// Backstop for the admin login that does not key on IP at all: one bucket for
// every source, counting failures only. An attacker rotating or spoofing IPs
// still gets at most 30 guesses per window. Headers are left to the per-IP
// limiter above so a legitimate client sees one consistent RateLimit-* set.
const adminGlobalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  keyGenerator: () => 'admin-login-global',
  skipSuccessfulRequests: true,
  message: { error: 'Too many admin login attempts. Please try again in 15 minutes.' },
  standardHeaders: false, legacyHeaders: false,
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
// Coarse pre-auth backstop for the chat write path, keyed on client IP
// (trustworthy via the trust-proxy CIDR list above). Mounted before json and
// session below, so a flood is rejected with zero DB work — no session lookup,
// no auth query. The precise per-user bucket in routes/chat.js still applies
// afterwards; a single user is capped at ~36/min there, so 120/min/IP leaves
// room for several users behind one NAT while still cutting a flood dead.
const chatIpLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  message: { error: 'Too many chat requests from this IP. Please slow down.' },
  standardHeaders: true, legacyHeaders: false,
});

// Runs before express.json() and the session middleware, so a rejected flood
// never parses a body, never touches the session store, never queries auth.
app.post('/api/chat/messages', chatIpLimiter);

// Contact import bodies pass the global 100 kB default at roughly 500 rows,
// well under the route's own 2000-row cap. Parse this one route with a larger
// limit; body-parser skips an already-parsed body, so the global parser below
// leaves it alone. Nothing else gets the larger limit.
app.post('/api/contacts/import', express.json({ limit: '2mb' }));

app.use(express.json());

const sessionMiddleware = session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 7 * 24 * 60 * 60 * 1000 },
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

app.use('/api/auth/login',           loginLimiter);
app.use('/api/auth/signup',          signupLimiter);
app.use('/api/auth/forgot-password', passwordLimiter);
app.use('/api/auth/reset-password',  passwordLimiter);

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/contacts',      require('./routes/contacts'));
app.use('/api/stages',        require('./routes/stages'));
app.use('/api/fields',        require('./routes/fields'));
app.use('/api/activities',         require('./routes/activities'));
app.use('/api/activity-comments',  require('./routes/activity-comments'));
app.use('/api/calendar',           require('./routes/calendar'));
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

// Platform admin console: page and API live only under ADMIN_CONSOLE_PATH.
// admin.html sits in private/ (not public/) so the static middleware can never
// serve it, and the page derives its API base from its own URL.
if (ADMIN_CONSOLE_PATH) {
  app.use(`${ADMIN_CONSOLE_PATH}/api/login`, adminLimiter, adminGlobalLimiter);
  app.use(`${ADMIN_CONSOLE_PATH}/api`,       require('./routes/admin'));
  app.get(ADMIN_CONSOLE_PATH, (req, res) => res.sendFile(path.join(__dirname, 'private', 'admin.html')));
}

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const io = new Server(httpServer, {
  cors: { origin: false },
  transports: ['websocket', 'polling'],
});

io.engine.use(sessionMiddleware);

// Per-user chat throttle: 6 messages per 10 s, keyed by user id (not socket
// id) so multiple tabs share one bucket and reconnecting does not reset it.
// The instance is a module singleton shared with routes/chat.js, so HTTP
// posts and socket emits draw from the same allowance.
const { chatLimiter, CHAT_LIMIT, CHAT_MAX_LENGTH } = require('./utils/chat-rate-limit');

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

  if (!presence.has(workspaceId)) presence.set(workspaceId, new Map());
  const wsPresence = presence.get(workspaceId);
  if (!wsPresence.has(userId)) wsPresence.set(userId, { name: userName, sockets: new Set() });
  wsPresence.get(userId).sockets.add(socket.id);

  io.to(`ws-${workspaceId}`).emit('online_users', getOnlineList(workspaceId));

  socket.on('chat_message', async (content, ack) => {
    // Request/response: every send is answered through the ack callback with
    // { ok: true, id } or { ok: false, reason }. A tab still running the
    // previous chat.js emits with no callback; answer it the old way so nothing
    // is silently lost mid-deploy.
    const reply = (payload) => {
      if (typeof ack === 'function') return ack(payload);
      if (payload.ok === false && payload.reason === 'rate_limited') {
        socket.emit('chat_rate_limited', {
          retryAfterMs: payload.retryAfterMs,
          limit:        payload.limit,
          windowMs:     payload.windowMs,
        });
      }
    };

    // Validate first — pure CPU, no DB — so a malformed or oversized message
    // costs the sender nothing: no quota spent, no query run. Then the bucket,
    // which still gates every pool.query below.
    if (typeof content !== 'string' || !content.trim() || content.length > CHAT_MAX_LENGTH) {
      return reply({ ok: false, reason: 'invalid', maxLength: CHAT_MAX_LENGTH });
    }

    const verdict = chatLimiter.check(userId);
    if (!verdict.allowed) {
      return reply({
        ok:           false,
        reason:       'rate_limited',
        retryAfterMs: verdict.retryAfterMs,
        limit:        CHAT_LIMIT.max,
        windowMs:     CHAT_LIMIT.windowMs,
      });
    }
    try {
      const { rows: [msg] } = await pool.query(
        `INSERT INTO chat_messages (workspace_id, user_id, content) VALUES ($1,$2,$3) RETURNING id, created_at`,
        [workspaceId, userId, content.trim()]
      );
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
      reply({ ok: true, id: msg.id, created_at: msg.created_at });
    } catch (e) {
      console.error('Socket chat error:', e);
      reply({ ok: false, reason: 'server_error' });
    }
  });

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
