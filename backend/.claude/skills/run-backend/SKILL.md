---
name: run-backend
description: Run, test, and smoke-drive the TeslaPricing backend scraper CLI. Use when asked to run the scrapers/backend, run a scraper, run backend tests, or verify a scraper parses a source — without writing to the production database.
---

The TeslaPricing backend is a Node.js CLI (`node scraper/cli.js <source>`) that
scrapes Tesla used-car listings from ~13 marketplaces and upserts them into a
**production** Supabase database. Two ways to drive it safely:

- **Unit tests** (`node --test`) — pure parse logic against HTML/JSON fixtures, no network.
- **Smoke driver** (`.claude/skills/run-backend/smoke.mjs`) — imports a scraper
  module directly and runs the real fetch+parse pipeline against the live source
  site, but with a counting `onPage` callback so it **never writes to the DB**.

**Do not run the real CLI (`node scraper/cli.js <source>`) to "test" things —
it writes to production Supabase.** Use the test suite or the smoke driver.

**All paths below are relative to `backend/`.** Run everything from there.

## Prerequisites

macOS or Linux, Node 22+ (`node -v` here: v22.22.1). No browser needed for the
HTTP-only sources the smoke driver targets.

```bash
npm install
```

`backend/.env` already holds `DATABASE_URL`. The smoke driver and tests don't
need it; only the real CLI does (`scraper/db.js` reads it at import).

## Test (parse logic, no network)

```bash
node --test tests/*.test.js
```

Verified: **16 tests pass** (capcar, gmecars, leboncoin, tesla fixtures). This is
the fast check after editing any scraper's parse functions.

## Run (agent path — safe smoke against live sources)

Drives a scraper end-to-end against its live site, parses listings, prints a
sample, and exits non-zero on failure or zero results — **no DB writes**:

```bash
node .claude/skills/run-backend/smoke.mjs            # default: gmecars
node .claude/skills/run-backend/smoke.mjs lbauto
node .claude/skills/run-backend/smoke.mjs capcar --pages 1
```

Verified output (counts vary with live inventory):

```
[smoke] gmecars: scraping 1 page(s), no DB writes...
[gmecars] page 1: https://www.gmecars.fr/149/vehicules/?marque=94&photos=1
  -> 10 listings

✓ gmecars: parsed 10 listing(s)
  sample: {"s":"gmecars","title":"TESLA MODEL Y ...","price":51490,"year":2025,...}
```

Works on the **HTTP-only** sources: `gmecars`, `lbauto`, `capcar`, `renew`,
`heycar`, `mmxbv`, `nikola`, `ewigo`. (`tesla` uses the `tesla-inventory`
package and blocks datacenter IPs.)

Inspect the CLI surface without scraping:

```bash
node scraper/cli.js --help
node scraper/cli.js gmecars --help
```

## Run (human path — real scrape, writes to production DB)

```bash
./scrape.sh gmecars        # from repo root; = node scraper/cli.js gmecars
```

Only run this when you actually intend to update the live database. It scrapes,
upserts, marks stale listings removed, and refreshes the `listings_with_delta`
view. Don't use it as a test.

## Gotchas

- **The smoke driver bypasses `db.js` on purpose.** Scraper modules
  (`scraper/gmecars.js` etc.) only `require('./constants')`, never `./db`, so
  importing one directly with a custom `onPage` runs zero SQL. `cli.js` is the
  only thing that touches Supabase.
- **`db.js` throws at import without `DATABASE_URL`** — `process.env.DATABASE_URL
  .replace(...)` on `undefined`. Irrelevant to the driver/tests; only bites if
  you run the real CLI with no `.env`.
- **Playwright sources won't smoke headless.** `leboncoin`, `lacentrale`,
  `aramisauto` are Datadome/captcha-protected and the driver doesn't launch a
  browser. Run those with `./scrape.sh <src> --headed` and solve the captcha
  once. Don't add them to the smoke list.
- **`tesla` and `alcopa` block GitHub-runner / datacenter IPs** — they only work
  from a residential IP, which is why CI skips them.
- **Zero listings ≠ code bug, sometimes.** A live source can return empty if its
  HTML/JSON layout changed. The driver exits 1 on zero so you notice; diff the
  fetched markup against the scraper's regexes before assuming the site is down.

## Troubleshooting

- **`Cannot find module '../../../scraper/<src>.js'`**: that source file doesn't
  exist — check `ls scraper/`. The arg is the bare source name (`gmecars`), not a path.
- **`<src> has no scrape() export`**: you passed a non-scraper module name. Only
  the per-source files export `scrape`.
- **Smoke exits 1 with `zero listings`**: live site changed, blocked the request,
  or is down. Re-run; if persistent, inspect the fetched HTML vs. the regexes in
  `scraper/<src>.js`.
- **Real CLI errors with `Cannot read properties of undefined (reading 'replace')`**:
  `DATABASE_URL` missing from `backend/.env`.
