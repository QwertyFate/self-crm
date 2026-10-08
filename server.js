/* ═══════════════════════════════════════════════════════════════════════════
   SERVER — the whole HTTP and realtime surface in one file. Start here.

   Read it top to bottom once; the order of the middleware IS the behaviour.

   1. helmet + CSP        CSP is applied only when NODE_ENV=production. It
                          allows inline scripts, because the UI uses inline
                          event handlers throughout.
   2. rate limiters       login 5/15min, signup 5/h, password reset 3/h, and
                          the public inbound webhook twice (per IP and per key).
                          Everything else is unlimited.
   3. body parsing        The CSV import route gets a 10 MB JSON limit; every
                          other route keeps the library default (100 kb).
                          The bigger one must be registered FIRST or the parser
                          never sees it — tests/unit/import-body-limit.test.js
                          locks that order in.
   4. sessions            express-session stored in Postgres (connect-pg-simple
                          creates its own table). Cookie: httpOnly, sameSite
                          lax, 7 days.
   5. static files        public/. HTML/CSS/JS are sent no-store so a deploy is
                          visible on reload; other assets cache for an hour.
   6. routes              every /api/* mount, one line each. The ONLY place
                          that knows the full URL map.
   7. /adminconsole       serves public/admin.html; /landingpage serves public/landingpage.html.
   8. catch-all GET *     serves public/index.html, which is why the client can
                          have "pages" without any URL routing.
   9. error handler       entity.too.large → 413 with a readable message,
                          anything else → 500 and the real error to the log.
  10. socket.io           team chat and presence. It reuses the Express session
                          (io.engine.use), re-checks workspace membership on
                          connect, and joins the socket to the room
                          `ws-<workspaceId>`. Presence is an in-memory Map, so
                          it resets on restart and does NOT work across more
                          than one instance.

   ADDING A ROUTE FILE: create routes/<name>.js, mount it here, and give it
   `router.use(requireAuth)` unless it is deliberately public.

   The process exits if initDb() fails — a server that cannot reach its
   database should not serve traffic.
   ═══════════════════════════════════════════════════════════════════════════ */

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

// Node exits on an unhandled promise rejection. Socket.IO does not await or catch what an
// async listener returns, so without this one bad payload in any listener would take the whole
// process down for every tenant (it did: 'chat_message' with a non-string). Log and carry on.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

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

const loginLimiter = rateLimit({
  // Counts WRONG guesses only: a correct password never spends an attempt (it did until 2026-10-06,
  // so a handful of normal logins locked the door for 15 minutes).
  windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true,
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

// Express's json() default body limit is 100kb, too small for a CSV contact import
// sent as a JSON array of rows; raise it just for that route (body-parser skips
// re-parsing a request whose body it already read, so the global json() below still
// applies to every other route at the default, smaller limit).
app.use('/api/contacts/import', express.json({ limit: '10mb' }));
app.use(express.json());

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

app.use('/api/auth/login',           loginLimiter);
app.use('/api/auth/signup',          signupLimiter);
app.use('/api/auth/forgot-password', passwordLimiter);
app.use('/api/auth/reset-password',  passwordLimiter);

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/admin',         require('./routes/admin-provision'));
app.use('/api/platform',      require('./routes/platform'));
app.use('/api/contacts',      require('./routes/contacts'));
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
app.use('/api/engine',        require('./routes/engine'));

app.get('/adminconsole', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
// The public landing page: a standalone document (landingpage.html + landing.css + js/landing.js), no session.
app.get('/landingpage', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landingpage.html')));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That request is too large. Try importing fewer rows at once.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const io = new Server(httpServer, {
  cors: { origin: false },
  transports: ['websocket', 'polling'],
});

io.engine.use(sessionMiddleware);

const presence = new Map();

// The only chat payload that reaches the database: a non-empty string of at most 2000
// characters, trimmed. Anything else (a number, an object, an array — a client can emit any
// JSON value) is null, never an exception: the listener below is async and nothing catches
// what it throws.
function chatMessageText(content) {
  if (typeof content !== 'string' || content.length > 2000) return null;
  const text = content.trim();
  return text ? text : null;
}

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

  let userName = 'Unknown';
  try {
    const { rows: [user] } = await pool.query('SELECT name FROM users WHERE id=$1', [userId]);
    userName = user?.name || 'Unknown';
  } catch { socket.disconnect(); return; }

  socket.join(`ws-${workspaceId}`);

  if (!presence.has(workspaceId)) presence.set(workspaceId, new Map());
  const wsPresence = presence.get(workspaceId);
  if (!wsPresence.has(userId)) wsPresence.set(userId, { name: userName, sockets: new Set() });
  wsPresence.get(userId).sockets.add(socket.id);

  io.to(`ws-${workspaceId}`).emit('online_users', getOnlineList(workspaceId));

  socket.on('chat_message', async (content) => {
    const text = chatMessageText(content);
    if (text === null) return;
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
      io.to(`ws-${workspaceId}`).emit('new_message', {
        id: msg.id,
        content: text,
        created_at: msg.created_at,
        user_id: userId,
        user_name: userName,
      });
    } catch (e) { console.error('Socket chat error:', e); }
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
