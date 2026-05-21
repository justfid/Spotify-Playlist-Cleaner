const PORT = process.env.PORT || 8888;

module.exports = {
  PORT,
  REDIRECT_URI: `http://127.0.0.1:${PORT}/callback`,
  CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret',
  SCOPES: [
    'user-library-read',
    'user-library-modify',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'streaming',
    'user-read-playback-state',
    'user-modify-playback-state',
  ].join(' '),
};
