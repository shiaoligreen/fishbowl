# fishbowl

A lightweight online Fishbowl game.

## Features

- Unlimited word/phrase submissions
- Repeated-word flagging in the submitted list
- One-minute round timer
- Skip cards during rounds
- Customizable rounds (Taboo, Charades, One Word, One Sound) with ordering
- Shared room-based submissions across multiple devices

## Run locally

### GitHub Pages

This project can be hosted as static files on GitHub Pages.
- On GitHub Pages, the game runs in browser-storage mode (per room code, per browser).
- No backend setup is required.
- A deployment workflow is included at `/home/runner/work/fishbowl/fishbowl/.github/workflows/deploy-pages.yml`.

To publish:
1. Push to the `main` branch.
2. In GitHub repository settings, set **Pages** source to **GitHub Actions**.
3. Wait for the **Deploy static site to Pages** workflow to finish.

### Local multi-device mode

Run the server from `/home/runner/work/fishbowl/fishbowl`:

```bash
node server.js
```

Then open `http://localhost:8080`.

To submit words from multiple devices, open the same URL and join the same room code on each device.
