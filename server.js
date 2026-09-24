const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const path       = require('path');
const helmet     = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { pool, initDb } = require('./db');
const { registerChatSocket } = require('./utils/chat-socket');

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
app.use('/api/platform',      require('./routes/platform'));
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

app.get('/adminconsole', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

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

// Team chat: presence, room broadcast, acked sends, per-user rate limit (utils/chat-socket.js).
registerChatSocket(io, pool);

initDb()
  .then(() => httpServer.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
