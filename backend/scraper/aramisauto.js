'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

chromium.use(StealthPlugin())

const BASE_URL = 'https://www.aramisauto.com'
const SEARCH_URL = `${BASE_URL}/achat/?text=tesla&per-page=120`
const PROFILE_DIR = path.join(os.homedir(), '.teslapricing', 'aramisauto-profile')

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--window-size=1440,900',
]

// Order matters: X/S before Y to avoid "Model Y" matching "Model S" via partial overlap
const CANONICAL_MODELS = ['Model X', 'Model S', 'Model Y', 'Model 3']

function parseIntSafe(text) {
  if (text == null) return null
  const digits = String(text).replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : null
}

function canonicalModel(text) {
  for (const m of CANONICAL_MODELS) {
    if (new RegExp(m.replace(' ', '[\\s\\-]'), 'i').test(text)) return m
  }
  return null
}

// title: "Tesla MODEL 3 44 Kw - RWD • Standard Plus Électrique • Auto. • 409km WLTP 2021 • 35 145 km • Occasion"
// alt:   "Tesla MODEL 3 44 Kw - RWD Standard Plus Électrique Auto. 2021 - 35 145 km"
function parseListing({ vehicleId, href, title, altText, priceText, imageUrl }) {
  if (!vehicleId) return null

  const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`

  // Prefer title (has • separators), fall back to alt; collapse newlines
  const text = (title || altText || '').replace(/\s*\n\s*/g, ' ')
  const parts = text.split(/[•·]/).map(s => s.trim()).filter(Boolean)

  // parts[0] → "Tesla MODEL 3 44 Kw - RWD"
  const mainPart = parts[0] || ''
  const make = mainPart.split(/\s+/)[0] || 'Tesla'

  // Canonical model from full text ("Model 3", "Model Y", "Model S", "Model X")
  const model = canonicalModel(text)

  // Fuel type anywhere in text
  let fuel = null
  const fuelMatch = text.match(/\b(Électrique|électrique|Essence|Diesel|Hybride rechargeable|Hybride)\b/i)
  if (fuelMatch) fuel = fuelMatch[1].charAt(0).toUpperCase() + fuelMatch[1].slice(1).toLowerCase()

  // Gearbox
  let gearbox = null
  if (/\bAuto\b/i.test(text)) gearbox = 'Automatique'
  else if (/\bMan\b/i.test(text)) gearbox = 'Manuelle'

  // Year
  let year = null
  const yearMatch = text.match(/\b((?:19|20)\d{2})\b/)
  if (yearMatch) year = parseInt(yearMatch[1], 10)

  // Mileage
  let mileage_km = null
  const kmMatch = text.match(/([\d][\d\s]*)\s*km/i)
  if (kmMatch) mileage_km = parseIntSafe(kmMatch[1])

  // Version: parts[1] stripped of fuel type
  let version = null
  if (parts[1]) {
    version = parts[1]
      .replace(/\b(Électrique|électrique|Essence|Diesel|Hybride rechargeable|Hybride)\b/ig, '')
      .trim() || null
  }

  const price_eur = parseIntSafe(priceText)

  // Strip CDN proxy prefix from image URL
  let cleanImageUrl = imageUrl || null
  if (cleanImageUrl && cleanImageUrl.includes('cdn-cgi')) {
    const m = cleanImageUrl.match(/(https?:\/\/storage\.googleapis\.com[^\s"?]+)/)
    if (m) cleanImageUrl = m[1]
  }

  return {
    source: 'aramisauto',
    external_id: String(vehicleId),
    title: mainPart.replace(/\s*\n\s*/g, ' ') || `Tesla ${vehicleId}`,
    make,
    model,
    version,
    price_eur: price_eur && price_eur > 1000 ? price_eur : null,
    year,
    mileage_km,
    fuel,
    gearbox,
    location: null,
    url: fullUrl,
    image_url: cleanImageUrl,
    _photos: [],
  }
}

async function scrapePage(context, url) {
  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1500 + Math.random() * 1000)

    try {
      await page.getByRole('button', { name: /accepter|accept|tout accepter/i }).click({ timeout: 3000 })
    } catch {}

    try { await page.waitForLoadState('networkidle', { timeout: 10000 }) } catch {}
    await page.waitForTimeout(1000 + Math.random() * 500)

    const items = await page.evaluate(() => {
      const results = []
      const seen = new Set()

      const links = document.querySelectorAll('a[href*="/voitures/tesla/"]')

      for (const link of links) {
        const href = link.getAttribute('href') || ''

        let vehicleId = null
        const rvMatch = href.match(/\/rv(\d+)/)
        if (rvMatch) vehicleId = rvMatch[1]
        if (!vehicleId) {
          const qMatch = href.match(/vehicleId=(\d+)/)
          if (qMatch) vehicleId = qMatch[1]
        }
        if (!vehicleId || seen.has(vehicleId)) continue
        seen.add(vehicleId)

        // Walk up to the card container so we can find price even if it's a sibling of the <a>
        const card = link.closest('article, li, [class*="card"], [class*="Card"], [class*="vehicle"], [class*="Vehicle"]') || link.parentElement

        const img = link.querySelector('img')
        const imageUrl = img ? (img.getAttribute('src') || '') : ''
        const altText = img ? (img.getAttribute('alt') || '') : ''

        const heading = link.querySelector('h1, h2, h3, h4, h5')
        const title = heading ? heading.innerText.trim() : altText

        // Search for price in the whole card container (price may be outside the <a>)
        // French prices use non-breaking spaces ( ) as thousands separators
        let priceText = ''
        const searchRoot = card || link
        const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const t = walker.currentNode.textContent || ''
          if (t.includes('€')) {
            const m = t.match(/([\d][\d\s ]*)[\s ]*€/)
            if (m) { priceText = m[1]; break }
          }
        }

        results.push({ vehicleId, href, imageUrl, altText, title, priceText })
      }

      return results
    })

    const listings = []
    for (const item of items) {
      try {
        const listing = parseListing(item)
        if (listing) listings.push(listing)
      } catch (err) {
        console.error(`  ! parse failed for ${item.vehicleId}: ${err.message}`)
      }
    }
    return listings
  } finally {
    await page.close()
  }
}

async function scrape({ pages = 1, headed = false } = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !headed,
    args: LAUNCH_ARGS,
    slowMo: 100,
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
  })

  const all = new Map()
  try {
    for (let p = 1; p <= pages; p++) {
      const url = p === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${p}`
      console.log(`[aramisauto] page ${p}: ${url}`)
      const listings = await scrapePage(context, url)
      console.log(`  -> ${listings.length} listings`)
      for (const l of listings) all.set(l.external_id, l)
      if (p < pages) await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000))
    }
  } finally {
    await context.close()
  }

  return [...all.values()]
}

module.exports = { scrape, parseListing }
