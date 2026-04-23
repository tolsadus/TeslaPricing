'use strict'

const BASE_URL = 'https://fr.renew.auto'
const SEARCH_URL = `${BASE_URL}/achat-vehicules-occasions.html?brand.label.raw=TESLA`

const { USER_AGENT } = require('./constants')

function canonicalModel(text) {
  if (/model[\s-]*x/i.test(text)) return 'Model X'
  if (/model[\s-]*s/i.test(text)) return 'Model S'
  if (/model[\s-]*y/i.test(text)) return 'Model Y'
  if (/model[\s-]*3/i.test(text)) return 'Model 3'
  return null
}

// Pick the medium rendition from an asset, falling back to small or large
function pickImageUrl(assets) {
  if (!Array.isArray(assets) || assets.length === 0) return null
  const renditions = assets[0].renditions || []
  const byType = Object.fromEntries(renditions.map(r => [r.resolutionType, r.url]))
  return byType.medium || byType.large || byType.small || renditions[0]?.url || null
}

// Recursively find all vehicle objects (have both productId and assets)
function findVehicles(obj) {
  if (Array.isArray(obj)) return obj.flatMap(findVehicles)
  if (obj && typeof obj === 'object') {
    if (obj.productId && Array.isArray(obj.assets)) return [obj]
    return Object.values(obj).flatMap(findVehicles)
  }
  return []
}

function vehicleToListing(v) {
  const productId = v.productId
  if (!productId) return null

  const url = `${BASE_URL}/achat-vehicules-occasions/details.html?productId=${productId}`

  const makeRaw = v.brand?.label || 'TESLA'
  const make = makeRaw.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  const modelLabel = v.model?.label || ''
  const model = canonicalModel(modelLabel) || canonicalModel(v.name || '')

  // "MODEL Y Standard RWD null" → strip model prefix and "null"
  const versionRaw = (v.version?.label || '').replace(/\bnull\b/gi, '').trim()
  const versionMatch = versionRaw.match(/^MODEL\s+[XSY3]\s+(.+)/i)
  const version = (versionMatch ? versionMatch[1].trim() : versionRaw) || null

  const fuel = v.energy?.groupLabel || null
  const gearbox = v.transmission?.label || null

  const year = v.modelYear || (v.lastRegistrationDate ? parseInt(v.lastRegistrationDate.slice(0, 4), 10) : null)
  const mileage_km = typeof v.mileage === 'number' ? v.mileage : null

  const price_eur = v.prices?.[0]?.priceWithTaxes ?? null

  const locality = v.dealer?.address?.locality || null
  const dealerName = v.dealer?.name || null
  const location = [dealerName, locality].filter(Boolean).join(' — ') || null

  const image_url = pickImageUrl(v.assets)

  const title = [makeRaw, modelLabel, versionRaw].filter(Boolean).join(' ')

  return {
    source: 'renew',
    external_id: productId,
    title: title || `Tesla ${productId}`,
    make,
    model,
    version,
    price_eur: price_eur && price_eur > 1000 ? price_eur : null,
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

function parseAppState(html) {
  const m = /window\.APP_STATE=JSON\.parse\("(.*?)"\);/.exec(html)
  if (!m) return []
  try {
    const state = JSON.parse(JSON.parse('"' + m[1] + '"'))
    return findVehicles(state)
  } catch {
    return []
  }
}

function parsePage(html) {
  const vehicles = parseAppState(html)
  const listings = []
  for (const v of vehicles) {
    try {
      const listing = vehicleToListing(v)
      if (listing) listings.push(listing)
    } catch (err) {
      console.error(`  ! renew parse failed for ${v.productId}: ${err.message}`)
    }
  }
  return listings
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'fr-FR,fr;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = await res.arrayBuffer()
  return new TextDecoder('utf-8').decode(buf)
}

async function scrape({ pages = 5 } = {}) {
  const all = new Map()
  for (let page = 1; page <= pages; page++) {
    const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${page}`
    console.log(`[renew] page ${page}: ${url}`)
    try {
      const html = await fetchPage(url)
      const results = parsePage(html)
      console.log(`  -> ${results.length} listings`)
      if (results.length === 0) break
      for (const l of results) all.set(l.external_id, l)
    } catch (err) {
      console.error(`  ! fetch failed: ${err.message}`)
      break
    }
    if (page < pages) await new Promise(r => setTimeout(r, 1500))
  }
  return [...all.values()]
}

module.exports = { scrape, vehicleToListing, parsePage }
