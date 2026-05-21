require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const { PORT, SESSION_SECRET, REDIRECT_URI } = require('./config');
const { registerAuthRoutes } = require('./auth');
const { registerRoutes } = require('./routes');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 },
}));

registerAuthRoutes(app);
registerRoutes(app);

// Must be registered last — catches errors forwarded via next(err) from all routes
app.use((err, req, res, next) => {
  const status = err.response?.status || 500;
  const body = err.response?.data || { error: err.message || 'Internal server error' };
  res.status(status).json(body);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║          Spotify Playlist Cleaner              ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log('Setup instructions:');
  console.log('  1. Go to https://developer.spotify.com/dashboard');
  console.log('  2. Create an app (or use an existing one)');
  console.log(`  3. Add redirect URI: ${REDIRECT_URI}`);
  console.log('  4. Copy Client ID and Client Secret into .env');
  console.log(`\nServer running at: http://127.0.0.1:${PORT}\n`);
});
