# Tesla Price History — Chrome Extension

Adds a small badge to each car on `tesla.com/*/inventory/used/{m3,my,ms,mx}` showing how that exact VIN has been repriced over time, sourced from the TeslaPricing database.

## Load locally (dev)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and select this `chrome-extension/` folder
4. Visit https://www.tesla.com/fr_FR/inventory/used/my — badges appear on each card

Click a badge for the full history popover.

## Architecture

- **content.js** runs on used-inventory pages, fetches the current VIN list from Tesla's own inventory API (same origin, no auth), then calls our `lookup-vins` Supabase Edge Function to get price history.
- **lookup-vins** (Supabase Edge Function, deployed) validates VIN format, caps batch size at 50, returns the price history for each Tesla VIN we have on file.
- The anon JWT is bundled in `content.js` (publishable by design — same key used by the frontend). Abuse protection lives in the edge function: strict input validation + 5-minute response cache.

## Files

- `manifest.json` — MV3, content-script only, zero permissions beyond matching tesla.com inventory URLs
- `content.js` — VIN extraction, lookup, badge injection, SPA-aware re-render
- `overlay.css` — badge + popover styling
