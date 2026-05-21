const crypto = require('crypto');
const axios = require('axios');
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SCOPES } = require('./config');

const authHeader = () =>
  'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

async function exchangeCode(code) {
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: authHeader() } }
  );
  return res.data;
}

async function refreshToken(refreshToken) {
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: authHeader() } }
  );
  return res.data;
}

async function ensureToken(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (Date.now() > req.session.tokenExpiry - 60000) {
    try {
      const data = await refreshToken(req.session.refreshToken);
      req.session.accessToken = data.access_token;
      req.session.tokenExpiry = Date.now() + data.expires_in * 1000;
    } catch {
      req.session.destroy();
      return res.status(401).json({ error: 'Token refresh failed' });
    }
  }
  next();
}

function registerAuthRoutes(app) {
  app.get('/login', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    // Save the session explicitly before redirecting — express-session's automatic
    // save fires on res.end() but a redirect can race ahead of the write to the
    // store, leaving the session empty when Spotify redirects back to /callback.
    req.session.save(err => {
      if (err) {
        console.error('Session save error in /login:', err);
        return res.redirect('/?error=session_error');
      }
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state,
      });
      res.redirect(`https://accounts.spotify.com/authorize?${params}`);
    });
  });

  app.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) return res.redirect('/?error=' + encodeURIComponent(error));

    // Guard against duplicate callback hits (browser retry, redirect loop, etc.)
    // oauthState is deleted before the async exchange so a second hit finds it gone.
    if (!req.session.oauthState) {
      if (req.session.accessToken) return res.redirect('/app');
      return res.redirect('/?error=invalid_callback');
    }

    if (state !== req.session.oauthState) return res.redirect('/?error=state_mismatch');

    // Delete state and persist immediately — any duplicate request arriving after
    // this point will hit the guard above and not attempt a second token exchange.
    delete req.session.oauthState;
    await new Promise((resolve, reject) =>
      req.session.save(err => (err ? reject(err) : resolve()))
    );

    try {
      const data = await exchangeCode(code);
      req.session.accessToken = data.access_token;
      req.session.refreshToken = data.refresh_token;
      req.session.tokenExpiry = Date.now() + data.expires_in * 1000;
      res.redirect('/app');
    } catch {
      res.redirect('/?error=token_exchange_failed');
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
  });

  app.get('/api/auth-status', (req, res) => {
    res.json({ loggedIn: !!req.session.accessToken });
  });
}

module.exports = { registerAuthRoutes, ensureToken };
