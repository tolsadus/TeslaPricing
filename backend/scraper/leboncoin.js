'use strict'

const { chromium } = require('playwright')

const BASE_URL = 'https://www.leboncoin.fr'
const SEARCH_URL = `${BASE_URL}/recherche?category=2&u_car_brand=TESLA`

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

const STEALTH_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
Object.defineProperty(navigator, 'languages', {get: () => ['fr-FR', 'fr', 'en-US', 'en']});
window.chrome = {runtime: {}};
`

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--window-size=1440,900',
]

function parseIntSafe(text) {
  if (text == null) return null
  const digits = String(text).replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : null
}

function getAttr(attrs, key) {
  for (const attr of attrs || []) {
    if (attr.key === key) {
      const v = attr.value ?? attr.value_label
      return v != null ? String(v) : null
    }
  }
  return null
}

function findAds(payload) {
  const found = []
  function walk(node) {
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node !== 'object' || node === null) return
    if (Array.isArray(node.ads) && node.ads.length > 0) {
      const first = node.ads[0]
      if (typeof first === 'object' && ('list_id' in first || 'subject' in first)) {
        found.push(...node.ads); return
      }
    }
    Object.values(node).forEach(walk)
  }
  walk(payload)
  return found
}

function adToListing(ad) {
  const list_id = ad.list_id
  if (list_id == null) return null

  const title = (ad.subject || '').trim()
  const attrs = ad.attributes || []

  let price_eur = null
  if (Array.isArray(ad.price)) price_eur = ad.price[0] ?? null
  else price_eur = ad.price ?? null
  price_eur = parseIntSafe(price_eur)

  const make = getAttr(attrs, 'brand')
  const model = getAttr(attrs, 'model')
  const year = parseIntSafe(getAttr(attrs, 'regdate'))
  const mileage_km = parseIntSafe(getAttr(attrs, 'mileage'))
  const fuel = getAttr(attrs, 'fuel')
  const gearbox = getAttr(attrs, 'gearbox')

  const loc = ad.location || {}
  const location = [loc.city, loc.zipcode].filter(Boolean).join(' ') || null

  const url = ad.url || `${BASE_URL}/ad/voitures/${list_id}`
  const images = ad.images || {}
  const urls = images.urls || []
  const image_url = urls[0] || images.thumb_url || null

  return {
    source: 'leboncoin',
    external_id: String(list_id),
    title,
    make: make ? make.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : null,
    model: model ? model.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : null,
    version: null,
    price_eur,
    year,
    mileage_km,
    fuel,
    gearbox,
    location,
    url,
    image_url,
    _photos: [],
  }
}

async function scrapePage(browser, url) {
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
    javaScriptEnabled: true,
  })
  await context.addInitScript(STEALTH_SCRIPT)
  const page = await context.newPage()

  const capturedPayloads = []
  page.on('response', async response => {
    try {
      const reqUrl = response.url()
      if (!reqUrl.includes('leboncoin')) return
      const ctype = response.headers()['content-type'] || ''
      if (!ctype.includes('json')) return
      if (!['/finder/', '/search', '/ads', '/listing'].some(k => reqUrl.includes(k))) return
      const data = await response.json().catch(() => null)
      if (data && typeof data === 'object') capturedPayloads.push(data)
    } catch {}
  })

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1500 + Math.random() * 1500)
    try {
      await page.getByRole('button', { name: /accepter|accept/i }).click({ timeout: 2000 })
    } catch {}
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }) } catch {}
    await page.waitForTimeout(1000 + Math.random() * 1000)

    let nextRaw = null
    try {
      if (await page.locator('script#__NEXT_DATA__').count()) {
        nextRaw = await page.locator('script#__NEXT_DATA__').first().textContent()
      }
    } catch {}

    const ads = []
    for (const payload of capturedPayloads) ads.push(...findAds(payload))
    if (!ads.length && nextRaw) {
      try { ads.push(...findAds(JSON.parse(nextRaw))) } catch {}
    }

    const listings = []
    for (const ad of ads) {
      try {
        const listing = adToListing(ad)
        if (listing) listings.push(listing)
      } catch (err) {
        console.error(`  ! ad parse failed: ${err.message}`)
      }
    }
    return listings
  } finally {
    await context.close()
  }
}

async function scrape({ pages = 1 } = {}) {
  const browser = await chromium.launch({ headless: true, args: STEALTH_ARGS, slowMo: 150 })
  const all = new Map()
  try {
    for (let page = 1; page <= pages; page++) {
      const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${page}`
      console.log(`[leboncoin] page ${page}: ${url}`)
      const results = await scrapePage(browser, url)
      console.log(`  -> ${results.length} listings`)
      for (const l of results) all.set(l.external_id, l)
      if (page < pages) await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000))
    }
  } finally {
    await browser.close()
  }
  return [...all.values()]
}

module.exports = { scrape, adToListing, findAds }
