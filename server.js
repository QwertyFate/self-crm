const express    = require('express');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const path       = require('path');
const { rateLimit } = require('express-rate-limit');
const { pool, initDb } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

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
    if (filePath.endsWith('.html')) {
      // Never cache HTML — always serve fresh so new elements are available
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // Cache JS/CSS/images for 1 hour (Cloudflare also caches these at the edge)
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
app.use('/api/tasks',        require('./routes/tasks'));
app.use('/api/task-fields',  require('./routes/task-fields'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
