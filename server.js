require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 },
}));

// ── Auth ──────────────────────────────────────────────────────────────────────

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
      client_id: process.env.SPOTIFY_CLIENT_ID,
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

  console.log('Token exchange › redirect_uri:', REDIRECT_URI);

  try {
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64'),
        },
      }
    );

    req.session.accessToken = tokenRes.data.access_token;
    req.session.refreshToken = tokenRes.data.refresh_token;
    req.session.tokenExpiry = Date.now() + tokenRes.data.expires_in * 1000;
    res.redirect('/app');
  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
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

// Return the current access token so the Web Playback SDK can use it
app.get('/api/token', ensureToken, (req, res) => {
  res.json({ access_token: req.session.accessToken });
});

// ── Token refresh middleware ───────────────────────────────────────────────────

async function ensureToken(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (Date.now() > req.session.tokenExpiry - 60000) {
    try {
      const tokenRes = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: req.session.refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from(
              `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
            ).toString('base64'),
          },
        }
      );
      req.session.accessToken = tokenRes.data.access_token;
      req.session.tokenExpiry = Date.now() + tokenRes.data.expires_in * 1000;
    } catch (err) {
      req.session.destroy();
      return res.status(401).json({ error: 'Token refresh failed' });
    }
  }
  next();
}

function spotifyAPI(req) {
  return axios.create({
    baseURL: 'https://api.spotify.com/v1',
    headers: { Authorization: `Bearer ${req.session.accessToken}` },
  });
}

// ── API Routes ─────────────────────────────────────────────────────────────────

app.get('/api/me', ensureToken, async (req, res) => {
  try {
    const r = await spotifyAPI(req).get('/me');
    res.json(r.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Failed' });
  }
});

app.get('/api/playlists', ensureToken, async (req, res) => {
  try {
    const api = spotifyAPI(req);
    let playlists = [];
    let url = '/me/playlists?limit=50';
    while (url) {
      const r = await api.get(url);
      playlists = playlists.concat(r.data.items);
      url = r.data.next ? r.data.next.replace('https://api.spotify.com/v1', '') : null;
    }
    res.json(playlists);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Failed' });
  }
});

// Fetch all liked songs (paginated)
app.get('/api/liked-songs', ensureToken, async (req, res) => {
  try {
    const api = spotifyAPI(req);
    let tracks = [];
    let url = '/me/tracks?limit=50';
    while (url) {
      const r = await api.get(url);
      tracks = tracks.concat(r.data.items.map(item => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map(a => a.name).join(', '),
        album: item.track.album.name,
        albumArt: item.track.album.images[0]?.url || null,
        preview_url: item.track.preview_url,
        uri: item.track.uri,
      })));
      url = r.data.next ? r.data.next.replace('https://api.spotify.com/v1', '') : null;
    }
    res.json(tracks);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Failed' });
  }
});

// Fetch all tracks in a playlist (paginated)
app.get('/api/playlist/:id/tracks', ensureToken, async (req, res) => {
  try {
    const api = spotifyAPI(req);
    let tracks = [];
    let url = `/playlists/${req.params.id}/tracks?limit=50`;
    while (url) {
      const r = await api.get(url);
      tracks = tracks.concat(
        r.data.items
          .filter(item => item.track && item.track.id)
          .map(item => ({
            id: item.track.id,
            name: item.track.name,
            artists: item.track.artists.map(a => a.name).join(', '),
            album: item.track.album.name,
            albumArt: item.track.album.images[0]?.url || null,
            preview_url: item.track.preview_url,
            uri: item.track.uri,
          }))
      );
      url = r.data.next ? r.data.next.replace('https://api.spotify.com/v1', '') : null;
    }
    res.json(tracks);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Failed' });
  }
});

// Remove liked songs in batch (max 50 per request)
app.post('/api/remove-liked', ensureToken, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.json({ removed: 0 });
  try {
    const api = spotifyAPI(req);
    for (let i = 0; i < ids.length; i += 50) {
      await api.delete('/me/tracks', { data: { ids: ids.slice(i, i + 50) } });
    }
    res.json({ removed: ids.length });
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Failed' });
  }
});

// Remove playlist tracks in batch (max 100 per request)
app.post('/api/remove-playlist-tracks', ensureToken, async (req, res) => {
  const { playlistId, uris } = req.body;
  if (!playlistId || !uris || !uris.length) return res.json({ removed: 0 });
  try {
    const api = spotifyAPI(req);
    for (let i = 0; i < uris.length; i += 100) {
      await api.delete(`/playlists/${playlistId}/tracks`, {
        data: { tracks: uris.slice(i, i + 100).map(uri => ({ uri })) },
      });
    }
    res.json({ removed: uris.length });
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Failed' });
  }
});

// ── Playback control ──────────────────────────────────────────────────────────

app.get('/api/track-analysis/:id', ensureToken, async (req, res) => {
  try {
    const r = await spotifyAPI(req).get(`/audio-analysis/${req.params.id}`);
    const sections = r.data.sections.map(s => ({
      start: s.start,
      duration: s.duration,
      loudness: s.loudness,
    }));
    res.json({ sections, duration: r.data.track.duration });
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Failed' });
  }
});

app.put('/api/player/play', ensureToken, async (req, res) => {
  const { device_id, uri } = req.body;
  if (!device_id || !uri) return res.status(400).json({ error: 'device_id and uri required' });
  try {
    await spotifyAPI(req).put(
      `/me/player/play?device_id=${encodeURIComponent(device_id)}`,
      { uris: [uri] }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Failed' });
  }
});

app.put('/api/player/pause', ensureToken, async (req, res) => {
  try {
    await spotifyAPI(req).put('/me/player/pause');
    res.json({ ok: true });
  } catch (err) {
    // 403 = no active device; not an error worth surfacing
    res.json({ ok: true });
  }
});

// ── Static page routes ─────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/app', ensureToken, (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║          Spotify Playlist Cleaner              ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log('Setup instructions:');
  console.log('  1. Go to https://developer.spotify.com/dashboard');
  console.log('  2. Create an app (or use an existing one)');
  console.log(`  3. Add redirect URI: http://127.0.0.1:${PORT}/callback`);
  console.log('  4. Copy Client ID and Client Secret into .env');
  console.log(`\nServer running at: http://127.0.0.1:${PORT}\n`);
});
