// Safe smoke-runner for the TeslaPricing scrapers.
//
// The real CLI (`node scraper/cli.js <source>`) WRITES to the production
// Supabase DB. This driver instead imports a scraper module directly and
// passes its own counting `onPage`, so it exercises the real fetch+parse
// pipeline against the live source site WITHOUT ever touching the database.
// (Scraper modules don't require ./db; only cli.js does.)
//
// Usage (from backend/):
//   node .claude/skills/run-backend/smoke.mjs            # default: gmecars
//   node .claude/skills/run-backend/smoke.mjs lbauto
//   node .claude/skills/run-backend/smoke.mjs capcar --pages 1
//
// HTTP-only sources need no browser. Playwright-backed sources
// (leboncoin, lacentrale, aramisauto) need `npx playwright install chromium`
// and usually a headed browser to clear a captcha — out of scope for a
// headless smoke. Exits non-zero if zero listings are parsed.

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const source = process.argv[2] || "gmecars";
const pagesFlag = process.argv.indexOf("--pages");
const pages = pagesFlag > -1 ? parseInt(process.argv[pagesFlag + 1], 10) : 1;

const mod = require(`../../../scraper/${source}.js`);
if (typeof mod.scrape !== "function") {
  console.error(`✗ ${source} has no scrape() export`);
  process.exit(2);
}

let count = 0;
let firstSample = null;
const onPage = async (listings) => {
  if (!firstSample && listings.length) firstSample = listings[0];
  count += listings.length;
  return listings.length;
};

console.log(`[smoke] ${source}: scraping ${pages} page(s), no DB writes...`);
try {
  await mod.scrape({ pages, onPage });
} catch (e) {
  console.error(`✗ ${source} scrape threw: ${e.message}`);
  process.exit(1);
}

console.log(`\n✓ ${source}: parsed ${count} listing(s)`);
if (firstSample) {
  const { source: s, title, price, year, mileage_km, url } = firstSample;
  console.log("  sample:", JSON.stringify({ s, title, price, year, mileage_km, url }));
}
if (count === 0) {
  console.error("✗ zero listings — source layout may have changed, or it blocked us");
  process.exit(1);
}
