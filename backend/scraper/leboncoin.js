'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

chromium.use(StealthPlugin())

const BASE_URL = 'https://www.leboncoin.fr'
const SEARCH_URL = `${BASE_URL}/recherche?category=2&u_car_brand=TESLA`
const PROFILE_DIR = path.join(os.homedir(), '.teslapricing', 'leboncoin-profile')

const { USER_AGENT } = require('./constants')

const LAUNCH_ARGS = [
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
      const v = attr.value_label ?? attr.value
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
  const color = getAttr(attrs, 'color')
  const horse_power = parseIntSafe(getAttr(attrs, 'horse_power_din') ?? getAttr(attrs, 'horse_power'))
  const doors = parseIntSafe(getAttr(attrs, 'doors'))
  const seats = parseIntSafe(getAttr(attrs, 'seats'))

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
    color,
    horse_power,
    doors,
    seats,
    location,
    url,
    image_url,
    _photos: [],
  }
}

async function isCaptchaPage(page) {
  const title = await page.title()
  if (title === 'leboncoin.fr') return true
  try {
    const body = await page.locator('body').textContent({ timeout: 2000 })
    return /verification required|slide right|datadome/i.test(body)
  } catch {
    return false
  }
}

async function scrapePage(context, url) {
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
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }) } catch {}
    await page.waitForTimeout(1000 + Math.random() * 1000)

    if (await isCaptchaPage(page)) {
      return { listings: [], captcha: true }
    }

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
    return { listings, captcha: false }
  } finally {
    await page.close()
  }
}

async function scrape({ pages = 1, headed = false } = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !headed,
    args: LAUNCH_ARGS,
    slowMo: 150,
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
  })

  const all = new Map()
  try {
    // Accept cookies once on first load before scraping
    {
      const cookiePage = await context.newPage()
      try {
        await cookiePage.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await cookiePage.waitForTimeout(2000)
        const btn = cookiePage.getByRole('button', { name: /tout accepter|accepter|accept/i })
        try { await btn.waitFor({ timeout: 5000 }); await btn.click() } catch {}
        await cookiePage.waitForTimeout(1000)
      } catch {}
      await cookiePage.close()
    }

    for (let p = 1; p <= pages; p++) {
      const url = p === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${p}`
      console.log(`[leboncoin] page ${p}: ${url}`)
      const { listings, captcha } = await scrapePage(context, url)

      if (captcha) {
        if (headed) {
          console.log('  ! Captcha detected. Solve it in the browser window, then press Enter here...')
          await new Promise(resolve => process.stdin.once('data', resolve))
          // retry the same page after manual solve
          const retry = await scrapePage(context, url)
          if (retry.captcha) { console.error('  ! Still blocked after captcha solve. Aborting.'); break }
          for (const l of retry.listings) all.set(l.external_id, l)
          console.log(`  -> ${retry.listings.length} listings`)
        } else {
          console.error('  ! Captcha detected. Run once in headed mode to solve it:')
          console.error('  !   node scraper/cli.js leboncoin --headed')
          break
        }
        continue
      }

      console.log(`  -> ${listings.length} listings`)
      for (const l of listings) all.set(l.external_id, l)
      if (p < pages) await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000))
    }
  } finally {
    await context.close()
  }
  return [...all.values()]
}

module.exports = { scrape, adToListing, findAds }
