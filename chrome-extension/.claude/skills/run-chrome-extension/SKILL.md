---
name: run-chrome-extension
description: Load, run, and screenshot the "Tesla Price History" Chrome extension. Use when asked to run/test the chrome extension, see the price-history badges or popover, or verify a content.js / overlay.css change in a real browser.
---

"Tesla Price History" is an MV3, content-script-only Chrome extension. On
`tesla.com/.../inventory/used/{m3,my,ms,mx}` it reads the page's VIN list from
Tesla's own inventory API, calls the `lookup-vins` Supabase Edge Function for
price history, and injects a badge (▼ drop / ▲ rise / grey "TPH" flat) on each
card, with a hover popover showing the full history.

Drive it with the Playwright driver at
`.claude/skills/run-chrome-extension/driver.mjs`. It loads the **real** unpacked
extension into Chromium and navigates to a **real** matched tesla.com URL — so
`content.js` injects exactly as in production — but **intercepts** the three
network calls and serves fixtures. Hitting live tesla.com directly is bot-gated,
region-gated, and only shows badges for VINs already in our DB; the fixtures make
the run deterministic and offline.

**All paths below are relative to `chrome-extension/`.** Run everything from there.

## Prerequisites

macOS or Linux. The extension has no build step and no `package.json` — it's
loaded unpacked. The driver needs Playwright + Chromium, which live in the
sibling `backend/` workspace (the driver resolves them from `../backend`):

```bash
cd ../backend && npm install && npx playwright install chromium && cd ../chrome-extension
```

On **Linux**, headless Chromium needs xvfb plus the usual libs; wrap the driver
in `xvfb-run -a node ...`. On macOS (verified here) nothing extra is needed.

## Run (agent path)

```bash
node .claude/skills/run-chrome-extension/driver.mjs
```

Verified output:

```
✓ 3 badge(s) injected
📸 /tmp/tph-ext-shots/01-grid.png
✓ popover open with 3 history row(s)
📸 /tmp/tph-ext-shots/02-popover.png

[TPH] logs:
  [TPH] refresh model=my {language: fr, market: FR}
  [TPH] Tesla API returned 3 cars
  [TPH] DB returned history for 3/3 VINs
  [TPH] injected 3 badges
```

Two screenshots land in `/tmp/tph-ext-shots/`: `01-grid.png` (three cards, one
badge each) and `02-popover.png` (hover popover with the history table). **Open
them** — a green exit doesn't prove the overlay looks right.

To watch it in a real window (debugging selectors/positioning):

```bash
node .claude/skills/run-chrome-extension/driver.mjs headed
```

The driver exits non-zero if no badge is injected.

### Changing the fixture

The card DOM and the two API responses are inline in `driver.mjs` (`CARS`,
`pageHtml`, `inventoryJson`, `lookupJson`). To test a new layout (e.g. the China
`div.result-pricing` inline placement) or a new badge state, edit those — no
network involved. VINs must match `/[A-HJ-NPR-Z0-9]{17}/` and appear in both the
card `data-id` and the lookup response, or no badge is placed.

## Run (human path)

Per `chrome-extension/README.md`: `chrome://extensions` → Developer mode → Load
unpacked → select `chrome-extension/`, then visit a real
`tesla.com/fr_FR/inventory/used/my`. Requires a residential IP and that our DB
holds VINs currently listed there; otherwise no badges. Useless for headless agents.

## Gotchas

- **`headless: true` silently breaks it.** Under Playwright's old headless mode
  extension content scripts never load (you get zero `[TPH]` logs). The driver
  launches with `headless: false` + the `--headless=new` arg instead — new
  headless *does* run content scripts. Don't "simplify" that back to `headless: true`.
- **Route registration order is load-bearing.** Playwright runs the
  most-recently-added matching route first. The catch-all `**/*` → abort is
  registered **first** so the three specific fulfillers (added after) win. Flip
  the order and the page navigation gets aborted (`net::ERR_FAILED`).
- **The matched URL must stay matched.** The driver navigates to
  `https://www.tesla.com/fr_FR/inventory/used/my`. Change it to something the
  manifest `matches` globs don't cover and `content.js` never injects — the page
  loads but stays bare.
- **`chromium-cli` can't load unpacked extensions** — that's why this is a
  Playwright driver, not a `chromium-cli` heredoc like the frontend skill.
- **VIN charset.** A VIN with `I`, `O`, or `Q` won't match `VIN_RE`, so the badge
  silently won't appear. Keep fixture VINs in `[A-HJ-NPR-Z0-9]`.

## Troubleshooting

- **`Cannot find package 'playwright'`**: backend deps missing —
  `cd ../backend && npm install && npx playwright install chromium`.
- **Timeout on `.tph-badge` + empty `[TPH]` logs**: content script didn't run —
  almost always the headless-mode trap above, or the URL no longer matches the
  manifest.
- **`net::ERR_FAILED` on goto**: the catch-all abort route shadowed the page
  route — check that `**/*` is registered before the fulfillers.
- **Badge appears but popover doesn't**: the driver `hover`s the first badge;
  if `overlay.css`'s `.tph-popover` got renamed, update the selector.
