---
name: run-frontend
description: Build, run, and drive the TeslaPricing React/Vite frontend. Use when asked to start the frontend, run the web app, build it, screenshot a page, or interact with the running UI (listings, trends, map, filters).
---

The TeslaPricing frontend is a React 19 + Vite 8 SPA backed directly by a
(public, read-only) Supabase database — no local backend needed to see real
data. Drive it by starting the Vite dev server, then running the Playwright
driver at `.claude/skills/run-frontend/driver.mjs` against it. `chromium-cli`
is not installed on this machine, so the driver is the browser harness.

**All paths below are relative to `frontend/`.** Run everything from there.

## Prerequisites

This is macOS — no `apt-get`, no `xvfb`. The browser comes from Playwright,
which lives in the sibling `backend/` workspace (the frontend has no
Playwright dependency; the driver resolves it from `../backend`).

```bash
# Node (v22 present here). Frontend deps:
npm install

# Driver needs Playwright + a Chromium binary, both from backend/:
cd ../backend && npm install && npx playwright install chromium && cd ../frontend
```

No env setup: `frontend/.env` ships a publishable Supabase URL/key, so
listings load live over the network with zero configuration.

## Run (agent path)

Start the dev server in the background and poll the port — `timeout(1)` does
not exist on macOS, so use a `curl` loop, not `sleep`:

```bash
npm run dev > /tmp/teslapricing-dev.log 2>&1 &
echo $! > /tmp/teslapricing-dev.pid
until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done
```

Drive it with the smoke flow (loads listings → clicks the Model 3 filter →
opens the Trends chart, screenshotting each step and failing on any console
error):

```bash
node .claude/skills/run-frontend/driver.mjs smoke
```

Expected output — exit 0, three screenshots, no console errors:

```
✓ listings: 50 cards
✓ Model 3 filter: 50 cards
✓ trends: 4 model cards
✓ no console errors
```

Screenshot any route on demand (`shot <hash> <name>`):

```bash
node .claude/skills/run-frontend/driver.mjs shot '#/map' map
node .claude/skills/run-frontend/driver.mjs shot '#/dropped' deals
```

Screenshots land in `/tmp/teslapricing-shots/`. **Open them** — a green exit
isn't proof the page looks right.

Stop the server when done:

```bash
kill "$(cat /tmp/teslapricing-dev.pid)"
```

| command | what it does |
|---|---|
| `driver.mjs smoke` | listings → Model 3 filter → Trends, 3 screenshots, exits 1 on console errors |
| `driver.mjs shot '<#hash>' <name>` | one screenshot of any route (`#/map`, `#/dropped`, `#/trends`, `#/watchlist`, `#/compare`, `#/auctions`) |

Routes are hash-based. Override the target with `BASE_URL=...` (e.g. to hit a
`npm run preview` build on `:4173`).

## Run (human path)

```bash
npm run dev   # → http://localhost:5173, opens nothing; Ctrl-C to stop
```

Useless headless — there's no browser to look at. Use the driver instead.

## Build

```bash
npm run build   # tsc -b && vite build → dist/  (~200ms)
```

The "chunks larger than 500 kB" warning is expected and harmless.

## Gotchas

- **`chromium-cli` is not installed.** That's why a Playwright driver exists.
  It imports Playwright from `../backend/node_modules` via `createRequire` — if
  you move the skill or the backend, fix `backendURL` in `driver.mjs`.
- **Card count doesn't prove a filter applied.** The grid pages at 50, so
  "50 cards" before and after clicking Model 3 is normal. The driver checks
  `.model-tile.active` instead; if you verify by eye, read the card titles.
- **First `nav` can be slow.** Vite compiles routes on demand. The driver
  `waitForSelector`s the element it needs; never `sleep` a fixed time hoping.
- **Listings need network.** The page fetches from the live Supabase project.
  Offline, the shell renders but `.card` never appears and `smoke` times out.

## Troubleshooting

- **`Cannot find package 'playwright'`**: backend deps missing. Run
  `cd ../backend && npm install && npx playwright install chromium`.
- **`EADDRINUSE` / port 5173 busy**: a stale dev server. `kill "$(cat
  /tmp/teslapricing-dev.pid)"`, or find it with `lsof -ti:5173 | xargs kill`.
- **`smoke` times out at `.card`**: dev server not up yet, or no network to
  Supabase. Check `/tmp/teslapricing-dev.log` and `curl http://localhost:5173`.
