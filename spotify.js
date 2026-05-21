const axios = require('axios');

function client(req) {
  return axios.create({
    baseURL: 'https://api.spotify.com/v1',
    headers: { Authorization: `Bearer ${req.session.accessToken}` },
  });
}

function mapTrack(item) {
  const track = item.track || item;
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map(a => a.name).join(', '),
    album: track.album.name,
    albumArt: track.album.images[0]?.url || null,
    preview_url: track.preview_url,
    uri: track.uri,
  };
}

async function paginate(api, startUrl) {
  const items = [];
  let url = startUrl;
  while (url) {
    const r = await api.get(url);
    items.push(...r.data.items);
    url = r.data.next ? r.data.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return items;
}

async function getMe(req) {
  const r = await client(req).get('/me');
  return r.data;
}

async function getPlaylists(req) {
  return paginate(client(req), '/me/playlists?limit=50');
}

async function getLikedSongs(req) {
  const items = await paginate(client(req), '/me/tracks?limit=50');
  return items.map(mapTrack);
}

async function getPlaylistTracks(req, playlistId) {
  const items = await paginate(client(req), `/playlists/${playlistId}/tracks?limit=50`);
  return items.filter(item => item.track?.id).map(mapTrack);
}

async function removeLikedSongs(req, ids) {
  const api = client(req);
  for (let i = 0; i < ids.length; i += 50) {
    await api.delete('/me/tracks', { data: { ids: ids.slice(i, i + 50) } });
  }
  return ids.length;
}

async function removePlaylistTracks(req, playlistId, uris) {
  const api = client(req);
  for (let i = 0; i < uris.length; i += 100) {
    await api.delete(`/playlists/${playlistId}/tracks`, {
      data: { tracks: uris.slice(i, i + 100).map(uri => ({ uri })) },
    });
  }
  return uris.length;
}

async function getTrackAnalysis(req, trackId) {
  const r = await client(req).get(`/audio-analysis/${trackId}`);
  return {
    sections: r.data.sections.map(s => ({ start: s.start, duration: s.duration, loudness: s.loudness })),
    duration: r.data.track.duration,
  };
}

async function play(req, deviceId, uri) {
  await client(req).put(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { uris: [uri] });
}

async function pause(req) {
  // 403 means no active device — not an error worth surfacing
  await client(req).put('/me/player/pause').catch(() => {});
}

module.exports = { getMe, getPlaylists, getLikedSongs, getPlaylistTracks, removeLikedSongs, removePlaylistTracks, getTrackAnalysis, play, pause };
