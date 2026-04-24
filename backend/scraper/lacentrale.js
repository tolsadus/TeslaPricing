'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

chromium.use(StealthPlugin())

const BASE_URL = 'https://www.lacentrale.fr'
const SEARCH_URL = `${BASE_URL}/listing?makesModelsCommercialNames=TESLA&type=vo`
const LOGIN_URL = `${BASE_URL}/login`
const PROFILE_DIR = path.join(os.homedir(), '.teslapricing', 'lacentrale-profile')

const { USER_AGENT } = require('./constants')

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--window-size=1440,900',
]

function canonicalModel(text) {
  if (!text) return null
  if (/model[\s_-]*x/i.test(text)) return 'Model X'
  if (/model[\s_-]*s/i.test(text)) return 'Model S'
  if (/model[\s_-]*y/i.test(text)) return 'Model Y'
  if (/model[\s_-]*3/i.test(text)) return 'Model 3'
  return null
}

// Extracts listing cards directly from the rendered DOM via page.evaluate()
async function extractFromDom(page) {
  const raw = await page.evaluate((baseUrl) => {
    const cards = document.querySelectorAll('[data-tracking-meta]')
    const results = []

    for (const card of cards) {
      try {
        let ref = null
        try { ref = JSON.parse(card.getAttribute('data-tracking-meta')).classified_ref } catch {}
        if (!ref) continue

        const anchor = card.querySelector('a[href*="auto-occasion"]')
        const href = anchor ? anchor.getAttribute('href') : null
        const url = href ? (href.startsWith('http') ? href : baseUrl + href) : null

        const title = card.querySelector('h2')?.textContent?.trim() || null
        // subtitle is the first non-h2 text block after the title (version/trim)
        const subtitleEl = card.querySelector('[class*="subTitle"]')
        const version = subtitleEl?.textContent?.trim() || null

        // Characteristic items: year, gearbox, km, fuel — identify by content pattern
        const chars = [...card.querySelectorAll('[class*="vehicleCharacteristicsItem"]')]
          .map(el => el.querySelector('[class*="Text_Text_body-medium"]')?.textContent?.trim())
          .filter(Boolean)

        let year = null, mileage_km = null, fuel = null, gearbox = null
        let color = null, horse_power = null, doors = null, seats = null
        for (const c of chars) {
          if (/^\d{4}$/.test(c)) { year = parseInt(c, 10); continue }
          if (/km/i.test(c)) { mileage_km = parseInt(c.replace(/[^\d]/g, ''), 10) || null; continue }
          if (/électrique|diesel|essence|hybride|gpl|hydrogène/i.test(c)) { fuel = c; continue }
          if (/auto|manuelle|automatique/i.test(c)) { gearbox = c; continue }
          if (/\bch\b|\bcv\b/i.test(c)) { const n = parseInt(c.replace(/[^\d]/g, ''), 10); if (n) horse_power = n; continue }
          if (/portes?/i.test(c)) { const n = parseInt(c.replace(/[^\d]/g, ''), 10); if (n) doors = n; continue }
          if (/places?/i.test(c)) { const n = parseInt(c.replace(/[^\d]/g, ''), 10); if (n) seats = n; continue }
          if (/^(?:gris|blanc|noir|rouge|bleu|vert|orange|jaune|marron|beige|argent|violet|rose|bordeaux|anthracite|grise|bleue|verte|blanche|noire|rouge|dorée?|dorée?|gold|silver|white|black|blue|red|green|grey|gray|brown)/i.test(c)) { color = c; continue }
        }

        // Price: text inside the price container, strip non-numeric except space
        const priceEl = card.querySelector('[class*="vehiclePrice"]')
        const priceText = priceEl?.textContent?.replace(/[^\d]/g, '') || ''
        const price_eur = priceText ? parseInt(priceText, 10) : null

        // Image: first img with a lacentrale pictures CDN src
        const img = card.querySelector('img[src*="pictures.lacentrale"]')
        const image_url = img?.getAttribute('src') || null

        // Location: text in footer area containing a city/region
        const locationEl = card.querySelector('[class*="sellerLocation"], [class*="location"], [class*="city"]')
        const location = locationEl?.textContent?.trim() || null

        results.push({ ref, url, title, version, year, mileage_km, fuel, gearbox, price_eur, image_url, location, color, horse_power, doors, seats })
      } catch {}
    }
    return results
  }, BASE_URL)

  const seen = new Set()
  const listings = []
  for (const r of raw) {
    if (!r.ref || seen.has(r.ref)) continue
    seen.add(r.ref)

    const titleText = r.title || `Tesla ${r.ref}`
    const make = 'Tesla'
    const model = canonicalModel(titleText)

    listings.push({
      source: 'lacentrale',
      external_id: r.ref,
      title: titleText,
      make,
      model,
      version: r.version || null,
      price_eur: r.price_eur && r.price_eur > 1000 ? r.price_eur : null,
      year: r.year || null,
      mileage_km: r.mileage_km || null,
      fuel: r.fuel || null,
      gearbox: r.gearbox || null,
      color: r.color || null,
      horse_power: r.horse_power || null,
      doors: r.doors || null,
      seats: r.seats || null,
      location: r.location || null,
      url: r.url || `${BASE_URL}/auto-occasion-annonce-${r.ref}.html`,
      image_url: r.image_url || null,
      _photos: [],
    })
  }
  return listings
}

async function isCaptchaPage(page) {
  const title = await page.title()
  if (title === 'lacentrale.fr') return true
  try {
    const body = await page.locator('body').textContent({ timeout: 2000 })
    return /verification required|slide right|datadome|captcha/i.test(body)
  } catch {
    return false
  }
}

async function scrape({ pages = 1, headed = false, debug = false, onPage } = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !headed,
    args: LAUNCH_ARGS,
    slowMo: 150,
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
  })

  const page = await context.newPage()
  const all = new Map()

  try {
    for (let p = 1; p <= pages; p++) {
      const url = p === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${p}`
      console.log(`[lacentrale] page ${p}: ${url}`)

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(1500 + Math.random() * 1500)

      if (p === 1) {
        try {
          await page.getByRole('button', { name: /accepter|accept/i }).click({ timeout: 2000 })
        } catch {}
      }

      try { await page.waitForLoadState('networkidle', { timeout: 10000 }) } catch {}
      await page.waitForTimeout(1000 + Math.random() * 1000)

      if (await isCaptchaPage(page)) {
        if (headed) {
          console.log('  ! Captcha detected. Solve it in the browser window, then press Enter here…')
          await new Promise(resolve => process.stdin.once('data', resolve))
          await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
          await page.waitForTimeout(1500)
          if (await isCaptchaPage(page)) { console.error('  ! Still blocked. Aborting.'); break }
        } else {
          console.error('  ! Captcha detected. Run once in headed mode to solve it:')
          console.error('  !   node scraper/cli.js lacentrale --headed')
          break
        }
      }

      if (debug) {
        const debugDir = path.join(os.homedir(), '.teslapricing', 'debug')
        fs.mkdirSync(debugDir, { recursive: true })
        const pageHtml = await page.content()
        fs.writeFileSync(path.join(debugDir, `lacentrale-page${p}.html`), pageHtml)
        console.log(`  [debug] HTML → ${path.join(debugDir, `lacentrale-page${p}.html`)}`)
      }

      const listings = await extractFromDom(page)
      console.log(`  -> ${listings.length} listings`)
      const pageListings = listings.filter(l => !all.has(l.external_id))
      for (const l of listings) all.set(l.external_id, l)
      if (onPage && pageListings.length > 0) await onPage(pageListings)

      if (p < pages) await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000))
    }
  } finally {
    await page.close()
    await context.close()
  }
  return [...all.values()]
}

async function login() {
  fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: LAUNCH_ARGS,
    slowMo: 150,
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
  })

  const page = await context.newPage()
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  console.log('[lacentrale] Browser open — log in to your account, then press Enter here…')
  await new Promise(resolve => process.stdin.once('data', resolve))
  await context.close()
  console.log('[lacentrale] Session saved. Future scrapes will use your account.')
}

module.exports = { scrape, login }
