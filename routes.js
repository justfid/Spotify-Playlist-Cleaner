const path = require('path');
const spotify = require('./spotify');
const { ensureToken } = require('./auth');

function registerRoutes(app) {
  app.get('/api/token', ensureToken, (req, res) => {
    res.json({ access_token: req.session.accessToken });
  });

  app.get('/api/me', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getMe(req)); } catch (err) { next(err); }
  });

  app.get('/api/playlists', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getPlaylists(req)); } catch (err) { next(err); }
  });

  app.get('/api/liked-songs', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getLikedSongs(req)); } catch (err) { next(err); }
  });

  app.get('/api/playlist/:id/tracks', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getPlaylistTracks(req, req.params.id)); } catch (err) { next(err); }
  });

  app.post('/api/remove-liked', ensureToken, async (req, res, next) => {
    const { ids } = req.body;
    if (!ids?.length) return res.json({ removed: 0 });
    try {
      res.json({ removed: await spotify.removeLikedSongs(req, ids) });
    } catch (err) { next(err); }
  });

  app.post('/api/remove-playlist-tracks', ensureToken, async (req, res, next) => {
    const { playlistId, uris } = req.body;
    if (!playlistId || !uris?.length) return res.json({ removed: 0 });
    try {
      res.json({ removed: await spotify.removePlaylistTracks(req, playlistId, uris) });
    } catch (err) { next(err); }
  });

  app.get('/api/track-analysis/:id', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getTrackAnalysis(req, req.params.id)); } catch (err) { next(err); }
  });

  app.put('/api/player/play', ensureToken, async (req, res, next) => {
    const { device_id, uri } = req.body;
    if (!device_id || !uri) return res.status(400).json({ error: 'device_id and uri required' });
    try {
      await spotify.play(req, device_id, uri);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  app.put('/api/player/pause', ensureToken, async (req, res, next) => {
    try {
      await spotify.pause(req);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.get('/app', ensureToken, (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
}

module.exports = { registerRoutes };
