// Headless-Chromium driver for the TeslaPricing frontend.
//
// chromium-cli isn't available on this machine, so this is the
// fallback browser driver (see the playwright.md pattern). It drives
// the running Vite dev server (http://localhost:5173 by default) via
// Playwright, which is installed in ../../../../backend/node_modules.
//
// Usage (from the frontend/ dir, dev server already running):
//   node .claude/skills/run-frontend/driver.mjs smoke
//   node .claude/skills/run-frontend/driver.mjs shot '#/trends' trends
//
//   BASE_URL=http://localhost:4173 node ... shot '#/map' map   # preview build
//
// Screenshots land in /tmp/teslapricing-shots/. `smoke` exits non-zero
// if the page logs any console/page errors.

import { createRequire } from "module";

// Resolve Playwright from the backend workspace (frontend has no playwright dep).
const backendURL = new URL("../../../../backend/", import.meta.url);
const require = createRequire(backendURL);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:5173";
const SHOTS = "/tmp/teslapricing-shots";
const cmd = process.argv[2] || "smoke";

require("fs").mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

const shot = async (name) => {
  const path = `${SHOTS}/${name}.png`;
  await page.screenshot({ path });
  console.log("📸", path);
};

try {
  if (cmd === "shot") {
    const hash = process.argv[3] || "";
    const name = process.argv[4] || "shot";
    await page.goto(BASE + hash, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brand", { timeout: 20000 });
    await page.waitForTimeout(1500); // let route-level data settle
    await shot(name);
  } else if (cmd === "smoke") {
    // 1. Listings load from Supabase
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".brand", { timeout: 20000 });
    await page.waitForSelector(".card", { timeout: 25000 });
    console.log("✓ listings:", await page.locator(".card").count(), "cards");
    await shot("01-listings");

    // 2. Real filter interaction: click the Model 3 tile, grid re-queries
    await page.locator(".model-tile", { hasText: "Model 3" }).click();
    await page.waitForTimeout(1200); // debounced re-fetch
    await page.waitForSelector(".model-tile.active", { timeout: 5000 });
    console.log("✓ Model 3 filter:", await page.locator(".card").count(), "cards");
    await shot("02-model3");

    // 3. Client-side route change to Trends
    await page.goto(BASE + "#/trends", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".trends-page", { timeout: 20000 });
    await page.waitForSelector(".trend-card", { timeout: 20000 });
    console.log("✓ trends:", await page.locator(".trend-card").count(), "model cards");
    await shot("03-trends");
  } else {
    console.error(`unknown command: ${cmd} (use 'smoke' or 'shot')`);
    process.exitCode = 2;
  }

  if (errors.length) {
    console.error(`\n✗ ${errors.length} console/page error(s):`);
    errors.slice(0, 10).forEach((e) => console.error("  -", e));
    process.exitCode = 1;
  } else {
    console.log("\n✓ no console errors");
  }
} catch (e) {
  console.error("✗ driver failed:", e.message);
  await shot("error");
  process.exitCode = 1;
} finally {
  await browser.close();
}
