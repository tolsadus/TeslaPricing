# TeslaPricing

[![Scrape](https://github.com/tolsadus/TeslaPricing/actions/workflows/scrape.yml/badge.svg)](https://github.com/tolsadus/TeslaPricing/actions/workflows/scrape.yml)
[![Deploy to GitHub Pages](https://github.com/tolsadus/TeslaPricing/actions/workflows/deploy.yml/badge.svg)](https://github.com/tolsadus/TeslaPricing/actions/workflows/deploy.yml)

Aggregated Tesla used-car listings scraped from multiple French marketplaces. React frontend backed directly by Supabase, with a Node.js scraper suite.

## Features

- Listings page with sidebar filters (model, price range, year, source) and sort (price, mileage, year, crawl date)
- Infinite scroll with debounced filter updates
- Detail page with photo carousel and per-listing price history chart
- Trends page with average price evolution per model over time (Model 3, Model Y, Model S, Model X)
- Price change tracking — new history entry recorded whenever a price changes
- Deployed automatically to GitHub Pages on every push to `main`

## Sources

| Source | Command | Method |
|---|---|---|
| [Tesla FR](https://www.tesla.com/fr_FR/inventory) | `tesla` | `tesla-inventory` npm package — new & used inventory |
| [CapCar](https://www.capcar.fr) | `capcar` | Algolia API (no browser needed) |
| [Leboncoin](https://www.leboncoin.fr) | `leboncoin` | Playwright — intercepts internal JSON API (Datadome protected) |
| [GMECars](https://www.gmecars.fr) | `gmecars` | HTTP + HTML regex parsing |
| [AramisAuto](https://www.aramisauto.com) | `aramisauto` | Playwright — DOM extraction (Nuxt SSR) |
| [Renew Auto](https://fr.renew.auto) | `renew` | HTTP — parses `window.APP_STATE` JSON blob |
| [LB Automobiles](https://www.lb-automobiles.com) | `lbauto` | HTTP — parses `application/ld+json` structured data |
| [La Centrale](https://www.lacentrale.fr) | `lacentrale` | Playwright — DOM extraction from SSR HTML (supports account login) |

## Stack

- **Backend** — Node.js 24, Playwright (stealth), Supabase (PostgreSQL)
- **Frontend** — React 19, TypeScript, Vite 7, Supabase JS client
- **Hosting** — GitHub Pages (frontend), Supabase (database)

## Setup

### Install dependencies

```bash
cd backend && npm install
cd frontend && npm install
```

### Playwright browsers (required for `leboncoin`, `aramisauto`, and `lacentrale`)

```bash
cd backend && npx playwright install chromium
```

### Environment variables

```bash
# backend/.env
DATABASE_URL=postgresql://...
```

```bash
# frontend/.env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

## Usage

### Start the frontend dev server

```bash
./dev.sh
```

Frontend runs on `http://localhost:5173`.

### Run scrapers

```bash
./scrape.sh <source> [options]
```

| Command | Description |
|---|---|
| `./scrape.sh tesla` | Fetch all Tesla models (new + used) |
| `./scrape.sh tesla --models m3,my` | Specific models only |
| `./scrape.sh capcar` | Scrape CapCar via Algolia (up to 10 pages) |
| `./scrape.sh leboncoin` | Scrape Leboncoin (1 page, Playwright) |
| `./scrape.sh leboncoin --headed` | Open browser window — required on first run to solve captcha |
| `./scrape.sh leboncoin --pages 3` | Multiple pages |
| `./scrape.sh gmecars` | Scrape GMECars |
| `./scrape.sh aramisauto` | Scrape AramisAuto (Playwright) |
| `./scrape.sh aramisauto --headed` | Open browser window if blocked |
| `./scrape.sh renew` | Scrape Renew Auto |
| `./scrape.sh lbauto` | Scrape LB Automobiles |
| `./scrape.sh lacentrale` | Scrape La Centrale (1 page, headless) |
| `./scrape.sh lacentrale --headed` | Open browser window — required on first run to solve captcha |
| `./scrape.sh lacentrale --pages 5` | Multiple pages |
| `./scrape.sh lacentrale --login` | Log in to your account and save the session (reduces bot detection) |
| `./scrape.sh all` | Run all scrapers in sequence |

## Deployment

The frontend is deployed automatically to GitHub Pages via GitHub Actions on every push to `main`. The workflow lives in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Live: **https://tolsadus.github.io/TeslaPricing/**
