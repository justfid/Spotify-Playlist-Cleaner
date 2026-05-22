# Spotify Playlist Cleaner

Review your Liked Songs or any playlist one track at a time. Keep what you love, remove the rest — with full track playback and batch or instant deletion.

> **Spotify Premium is required.** Full track playback uses the [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk), which only works with Premium accounts.

## Setup

### 1. Create a Spotify app

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create app**
3. In the app settings, add this redirect URI:
   ```
   http://127.0.0.1:8888/callback
   ```
4. Save, then copy your **Client ID** and **Client Secret**

### 2. Configure credentials

Edit `.env`:

```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SESSION_SECRET=any_random_string
PORT=8888
```

### 3. Install and run

```bash
npm install
npm start
```

Open **http://127.0.0.1:8888** in your browser.

> Use `127.0.0.1` — not `localhost`. Spotify's dashboard accepts `127.0.0.1` as a valid redirect URI without a security warning.

---

## How it works

1. **Connect** — authenticate with your Spotify account
2. **Choose a source** — Liked Songs or any playlist you own
3. **Review tracks** — one track at a time with album art and 30s audio preview
4. **Swipe or press** — remove, keep, or skip each track
5. **Delete** — remove marked tracks at the end, or delete them immediately from the review panel

---

## Controls

| Action | Button | Keyboard |
|--------|--------|----------|
| Remove track | ← REMOVE | `←` Arrow Left |
| Keep track | → KEEP | `→` Arrow Right |
| Skip track | ↓ Skip | `↓` Arrow Down or `Space` |
| Undo last decision | ↩ Undo | `Z` |
| Close modal | — | `Esc` |

---

## Review Removals Panel

During a session, a **Review removals (n)** button appears once you've marked at least one track for removal. Clicking it opens a panel showing all tracks earmarked for deletion. From there you can:

- **↩ Undo** — move a track back to the front of the unseen queue so you can re-review it
- **Delete now** — immediately delete that single track from Spotify and remove it from the list
- **Delete all now** — immediately delete every track in the list from Spotify

Closing the panel returns you exactly to where you were in the swiping session.

---

## Deletion behaviour

- **Liked Songs**: uses `DELETE /v1/me/tracks`
- **Playlists**: uses `DELETE /v1/playlists/{id}/tracks`
- Batch requests are chunked (50 per request for liked songs, 100 for playlists) to stay within Spotify's API limits

---

## Tech stack

- **Backend**: Node.js / Express — handles Spotify OAuth (authorization code flow), token storage and refresh, all Spotify API calls (play, pause, delete)
- **Frontend**: single-page vanilla JS — no frameworks
- **Playback**: Spotify Web Playback SDK — streams full tracks directly to a virtual device in the browser (Premium required)
- **Auth**: tokens are stored server-side in an encrypted session; the frontend receives them only via `/api/token` for the SDK handshake
