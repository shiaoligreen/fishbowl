# fishbowl

A lightweight online Fishbowl game.

## Features

- Unlimited word/phrase submissions
- Backend-enforced duplicate checking per room
- Shared room state across devices when using `server.js`
- Rotating player turns each round in shared game mode
- One-minute round timer
- Skip cards during rounds
- Customizable rounds (Taboo, Charades, One Word, One Sound) with ordering

## Run locally

Run the server from `/home/runner/work/fishbowl/fishbowl`:

```bash
node server.js
```

Then open `http://localhost:8080`.

To submit words and play from multiple devices, open the same URL and join the same room code on each device.

## GitHub Pages + shared server mode

GitHub Pages hosts only static files, so cross-device sync needs a running `server.js` instance.

1. Host this repository's `server.js` on any Node-compatible host.
2. Open the GitHub Pages site.
3. Set the API base URL in the page (or use `?api=https://your-server.example.com` in the URL).
4. Join the same room and player names across devices.

If the API is unavailable, the app falls back to single-browser local storage mode.
