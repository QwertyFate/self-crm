const express  = require('express');
const session  = require('express-session');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
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

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`));
