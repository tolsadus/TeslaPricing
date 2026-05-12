# TeslaPricing

[![Scrape](https://github.com/tolsadus/TeslaPricing/actions/workflows/scrape.yml/badge.svg)](https://github.com/tolsadus/TeslaPricing/actions/workflows/scrape.yml)
![Last Scrape](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Frepos%2Ftolsadus%2FTeslaPricing%2Factions%2Fworkflows%2Fscrape.yml%2Fruns%3Fstatus%3Dsuccess%26per_page%3D1&query=%24.workflow_runs%5B0%5D.updated_at&label=last%20scrape&color=green)
[![Deploy to GitHub Pages](https://github.com/tolsadus/TeslaPricing/actions/workflows/deploy.yml/badge.svg)](https://github.com/tolsadus/TeslaPricing/actions/workflows/deploy.yml)

Aggregated Tesla used-car listings scraped from multiple French marketplaces. React frontend backed directly by Supabase, with a Node.js scraper suite.

## Features

- **Listings page** — card-style filter sidebar (Model tiles, Price, Year, Mileage with "new only" toggle, Drivetrain, Autopilot, Seats, Color, Source) plus a horizontal sort bar at the top (latest, price ↑/↓, mileage ↑/↓, year, biggest drop in € and %). Infinite scroll with debounced updates, 4-per-row grid.
- **Click-to-filter source** — clicking a listing card's source pill (e.g. "TESLA", "LACENTRALE") toggles the source filter for the whole grid.
- **Hide & reset** — eye icon on each card hides a listing; sidebar surfaces hidden count with both "Show hidden" and "Reset hidden" actions.
- **Watchlist & Compare** — bookmark listings or compare up to 3 side-by-side (price, mileage, options, history).
- **Deals page** — biggest active price drops, with top-3 podium.
- **Auctions page** — separate view for Alcopa auction listings.
- **Map view** — geolocated dealer markers filtered by the same sidebar.
- **Trends page** — average price evolution per model over time (Model 3, Y, S, X) with price-change tracking (new history entry on every price change).
- **In-feed ad scaffolding** — placeholder card every 20 listings, gated behind a `SHOW_ADS` flag and ready to wire to AdSense once a CMP is set up.
- **i18n (EN/FR), light/dark theme, Supabase auth** (Google sign-in syncs watchlist/hidden across devices).
- Deployed automatically to GitHub Pages on every push to `main`.

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
| [Heycar](https://heycar.com/fr) | `heycar` | HTTP — parses Next.js RSC payload for `listing_id` JSON fragments |
| [Alcopa Auction](https://www.alcopa-auction.fr) | `alcopa` | HTTP + HTML regex parsing (auction listings) |

> **Note:** `tesla` and `alcopa` block GitHub-hosted runner IPs, so they only run locally — not from the scheduled GitHub Action.

## Stack

- **Backend** — Node.js 26, Playwright (stealth), Supabase (PostgreSQL)
- **Frontend** — React 19, TypeScript, Vite 8, Supabase JS client
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
| `./scrape.sh heycar` | Scrape Heycar |
| `./scrape.sh alcopa` | Scrape Alcopa Auction (local only — blocks GitHub IPs) |
| `./scrape.sh lacentrale` | Scrape La Centrale (1 page, headless) |
| `./scrape.sh lacentrale --headed` | Open browser window — required on first run to solve captcha |
| `./scrape.sh lacentrale --pages 5` | Multiple pages |
| `./scrape.sh lacentrale --login` | Log in to your account and save the session (reduces bot detection) |
| `./scrape.sh all` | Run all scrapers in sequence |

## Deployment

The frontend is deployed automatically to GitHub Pages via GitHub Actions on every push to `main`. The workflow lives in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Live: **https://tolsadus.github.io/TeslaPricing/**
