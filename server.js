const express    = require('express');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const path       = require('path');
const { pool, initDb } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/contacts',   require('./routes/contacts'));
app.use('/api/stages',     require('./routes/stages'));
app.use('/api/fields',     require('./routes/fields'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/invites',    require('./routes/invites'));
app.use('/api/workspace',  require('./routes/workspace'));
app.use('/api/pipelines',  require('./routes/pipelines'));
app.use('/api/deals',      require('./routes/deals'));
app.use('/api/deal-fields',  require('./routes/deal-fields'));
app.use('/api/objects',      require('./routes/objects'));
app.use('/api/object-fields',require('./routes/object-fields'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
