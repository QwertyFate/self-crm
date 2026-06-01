const express    = require('express');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const path       = require('path');
const helmet     = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { pool, initDb } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Trust Cloudflare / first proxy for accurate IP detection

const isProd = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com", "https://static.cloudflareinsights.com"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "blob:", "https:"],
      frameSrc:    ["https://docs.google.com"],
      connectSrc:  ["'self'", "https://*.supabase.co", "https://cloudflareinsights.com"],
      fontSrc:     ["'self'", "data:"],
      objectSrc:   ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

// ── Rate limiters ─────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many accounts created from this IP. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many password reset attempts. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-IP: 120 webhook calls per 15 min (enough for any legitimate Make/Zapier flow)
const webhookIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many webhook requests from this IP. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-key: 120 calls per minute per workspace webhook (industry standard range: 100-300/min)
const webhookKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Webhook rate limit exceeded. Maximum 120 requests per minute per key.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.params.key || 'unknown', // rate limit per webhook key
});

app.use(express.json());
app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // Cache images/fonts for 1 hour
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  },
}));

// ── Apply rate limits to auth endpoints ───────────────────
app.use('/api/auth/login',           loginLimiter);
app.use('/api/auth/signup',          signupLimiter);
app.use('/api/auth/forgot-password', passwordLimiter);
app.use('/api/auth/reset-password',  passwordLimiter);

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/contacts',     require('./routes/contacts'));
app.use('/api/stages',       require('./routes/stages'));
app.use('/api/fields',       require('./routes/fields'));
app.use('/api/activities',   require('./routes/activities'));
app.use('/api/invites',      require('./routes/invites'));
app.use('/api/workspace',    require('./routes/workspace'));
app.use('/api/pipelines',    require('./routes/pipelines'));
app.use('/api/deals',        require('./routes/deals'));
app.use('/api/deal-fields',  require('./routes/deal-fields'));
app.use('/api/objects',      require('./routes/objects'));
app.use('/api/object-fields',require('./routes/object-fields'));
app.use('/api/tasks',         require('./routes/tasks'));
app.use('/api/task-fields',   require('./routes/task-fields'));
app.use('/api/task-projects',   require('./routes/task-projects'));
app.use('/api/notifications',   require('./routes/notifications'));
app.use('/api/analytics',       require('./routes/analytics'));
app.use('/api/tasks',         require('./routes/task-attachments'));
app.use('/api/integrations/receive', webhookIpLimiter, webhookKeyLimiter);
app.use('/api/integrations',  require('./routes/integrations'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
