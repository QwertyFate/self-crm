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
   7. /adminconsole       serves public/admin.html; /landingpage serves public/landingpage.html;
      /landingpagetwo serves public/landingpagetwo.html, a second design to compare (Part 41).
      INTERNAL_TOOLS_PATH (a fixed secret path) mounts internal-tools/, the team's separate tools.
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
const { APP_VERSION } = require('./utils/app-version');   // the client files' fingerprint: open tabs reload themselves when it changes
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const path       = require('path');
const helmet     = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { pool, initDb } = require('./db');
const engine     = require('./utils/engine');   // outgoing Engine webhooks: the retry worker is started after initDb()
const integrations = require('./routes/integrations');   // the Cal.com and Notetaker routes; the Notetaker's link watch is started after initDb()

const app        = express();
const httpServer = http.createServer(app);
const PORT       = process.env.PORT || 3000;

// Node exits on an unhandled promise rejection. Socket.IO does not await or catch what an
// async listener returns, so without this one bad payload in any listener would take the whole
// process down for every tenant (it did: 'chat_message' with a non-string). Log and carry on.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
// The same for a synchronous exception that nothing caught. Node's default is to exit; this CRM
// runs under `npm run dev` (nodemon), which does NOT restart a crashed process — it waits for a
// file change — so one unexpected throw (an integration, a listener, a timer) would mean downtime
// until someone notices. Log it, keep serving. Every request handler is already wrapped (express
// error handlers, the Engine paths' fehler shaping), so this is the last net, not the first.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (kept running):', err);
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
// Keyed by the path below the mount ("/<key>"), like the two receivers below: mounted with app.use, the limiter runs
// before the router has matched ":key", so req.params.key was always undefined and every workspace shared one bucket
// (fixed 2026-10-22, tests/unit/webhook-key-limiter.test.js).
const webhookKeyLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  message: { error: 'Webhook rate limit exceeded. Maximum 120 requests per minute per key.' },
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.path || 'unknown',
});
// Cal.com's booking receiver: the same two limits, the second keyed by the receive token in the path.
const calcomTokenLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  message: { error: 'Webhook rate limit exceeded. Maximum 120 requests per minute per receiver.' },
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.path || 'unknown',
});
// The Notetaker's result link (routes/notetaker.js): one secret link per recorded meeting, keyed by the path like
// Cal.com's receiver; the Notetaker retries a result five times at most, so 30 a minute is plenty.
const notetakerLinkLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  message: { error: 'Too many deliveries for this recording.' },
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.path || 'unknown',
});
// The landing page's request form (routes/landing.js): a person asks once or twice; five a quarter hour per
// address is room for typos and too little for a flood of fake leads in the team's CRM.
const landingAskLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true, legacyHeaders: false,
});
// Onboarding Engine API (/api/kunden): 300 requests per minute per IP. The number is
// published to the Engine team in ENGINE_INTEGRATION.md; the body is the Engine's error
// shape, not the { error } the browser routes use.
const engineApiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 300,
  message: { fehler: { code: 'zu_viele_anfragen', nachricht: 'Zu viele Anfragen. Bitte später erneut versuchen.' } },
  standardHeaders: true, legacyHeaders: false,
});
// The break's team board (/api/break-scores): scores are reported by the browser, so 30 requests a minute
// per IP is plenty for reading the board and saving finished games, and too little for a flood.
const breakScoresLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  message: { error: 'Too many score requests. Please wait a minute.' },
  standardHeaders: true, legacyHeaders: false,
});

// Express's json() default body limit is 100kb, too small for a CSV contact import
// sent as a JSON array of rows; raise it just for that route (body-parser skips
// re-parsing a request whose body it already read, so the global json() below still
// applies to every other route at the default, smaller limit).
app.use('/api/contacts/import', express.json({ limit: '10mb' }));
// Cal.com's booking webhooks are signed over the raw body (x-cal-signature-256), so this path
// keeps the bytes for routes/integrations.js to verify; the global json() below skips a body
// that was already read.
app.use('/api/integrations/calcom/receive', express.raw({ type: '*/*', limit: '1mb' }));
// The Notetaker's result is signed over the raw body (X-Notetaker-Signature) and carries the whole transcript,
// so this path keeps the bytes and allows more than json()'s 100kb.
app.use('/api/notetaker/webhook', express.raw({ type: '*/*', limit: '5mb' }));
app.use(express.json());
// Engine API paths: a malformed or oversized body is a body-parser error BEFORE the routers run.
// Answer the Engine's { fehler } shape (400 / 413) instead of the browser's { error } — and never a crash.
const engineGate = require('./middleware/engine-gate');
const engineRequestLog = require('./middleware/engine-request-log');
app.use('/api/kunden',    engineGate.engineBodyErrors);
app.use('/api/dokumente', engineGate.engineBodyErrors);

// The internal team's tools: a separate little app (internal-tools/), not part of the CRM, at one fixed secret path that
// nothing links to. Its page and API live only under it; the ADMIN_SECRET's value is its password, sent with every
// request. Mounted before the session, so it never reads or writes the CRM's sessions (or their database table).
const INTERNAL_TOOLS_PATH = '/abec51839ff2263df763d138';
app.use(INTERNAL_TOOLS_PATH, require('./internal-tools'));

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
app.use('/api/admin',         require('./routes/admin-engine'));       // Engine Monitor: switches, request log, deliveries (cross-tenant)
app.use('/api/platform',      require('./routes/platform'));
app.use('/api/contacts',      require('./routes/contacts'));
app.use('/api/contacts',      require('./routes/contact-documents'));   // /:contactId/documents… — falls through contacts.js like task-attachments
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
app.use('/api/break-scores', breakScoresLimiter);
app.use('/api/break-scores', require('./routes/break-scores'));   // the break's team board (public/js/break-game.js)
app.use('/api/tasks',         require('./routes/task-attachments'));
app.use('/api/integrations/receive', webhookIpLimiter, webhookKeyLimiter);
app.use('/api/integrations/calcom/receive', webhookIpLimiter, calcomTokenLimiter);
app.use('/api/integrations',  integrations);
app.use('/api/notetaker/webhook', webhookIpLimiter, notetakerLinkLimiter);
app.use('/api/notetaker',     require('./routes/notetaker'));   // PUBLIC: the Notetaker's result for one meeting, by its secret link
app.use('/api/landing/ask', landingAskLimiter);
app.use('/api/landing',       require('./routes/landing'));   // PUBLIC: the landing page's request form becomes a lead in the team's CRM
app.use('/api/engine',        require('./routes/engine'));
// Onboarding Engine API: API-key auth (no session), German error shape, rate-limited.
app.use('/api/kunden',        engineRequestLog);                                 // every call is logged (admin Engine Monitor)
app.use('/api/kunden',        engineApiLimiter);
app.use('/api/kunden',        engineGate);                                       // 503 while the platform admin has the API switched off
app.use('/api/kunden',        require('./routes/engine-api'));
app.use('/api/dokumente',     engineRequestLog);
app.use('/api/dokumente',     engineApiLimiter);
app.use('/api/dokumente',     engineGate);
app.use('/api/dokumente',     require('./routes/engine-dokumente'));   // GET /:id/download → signed link (API key)

app.get('/adminconsole', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
// The public landing page: a standalone document (landingpage.html + landing.css + js/landing.js), no session.
app.get('/landingpage', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landingpage.html')));
// A second landing page to compare with the first (landingpagetwo.html + landing-two.css + js/landing-two.js), no session.
app.get('/landingpagetwo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landingpagetwo.html')));

// The client files' fingerprint. Every open tab asks for it (and hears it on each socket connect)
// and reloads itself when it changes, so a deploy reaches people without a manual refresh.
app.get('/api/version', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ version: APP_VERSION }); });
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

  socket.emit('app:version', APP_VERSION);   // the tab compares it with the version it was loaded with

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
  .then(() => {
    httpServer.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`));
    // Re-drives pending Engine deliveries on the briefing's schedule (≥ 5 attempts over
    // ~24 h) and so survives restarts. ENGINE_RETRY_WORKER=0 disables it, e.g. on a second
    // instance that should not compete for the same rows.
    if (process.env.ENGINE_RETRY_WORKER !== '0') engine.startRetryWorker();
    // Requests for the Notetaker whose Google Meet link has not come: asks Cal.com for it every 20 seconds
    // (routes/integrations.js, NOTETAKER_CHANGES Part 4), so a CRM that Cal.com's webhook cannot reach still sends the bot.
    integrations.startNotetakerLinkWatch();
  })
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
