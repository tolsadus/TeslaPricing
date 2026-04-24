'use strict'

const BASE_URL = 'https://www.lb-automobiles.com'
const SEARCH_URL = `${BASE_URL}/recherche-import?brand=49`

const { USER_AGENT } = require('./constants')

function canonicalModel(text) {
  if (/model[\s-]*x/i.test(text)) return 'Model X'
  if (/model[\s-]*s/i.test(text)) return 'Model S'
  if (/model[\s-]*y/i.test(text)) return 'Model Y'
  if (/model[\s-]*3/i.test(text)) return 'Model 3'
  return null
}

// Extract numeric ID from URL slug: ".../100d-1222557" → "1222557"
function extractId(url) {
  const m = url.match(/-(\d+)$/)
  return m ? m[1] : null
}

function itemToListing(item) {
  const carUrl = item.offers?.url || ''
  const external_id = extractId(carUrl)
  if (!external_id) return null

  const make = item.brand?.name || 'Tesla'
  const model = canonicalModel(item.model || item.name || '')

  // Version: name minus "Tesla" and the model (e.g. "Tesla Model S 100D" → "100D")
  let version = null
  const nameParts = (item.name || '').replace(/^Tesla\s+/i, '')
  const modelLabel = item.model || ''
  const versionRaw = nameParts.replace(new RegExp(modelLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim()
  version = versionRaw || null

  const price_eur = item.offers?.price ?? null
  const year = item.vehicleModelDate ?? null
  const mileage_km = item.mileageFromOdometer?.value ?? null
  const fuel = item.fuelType || null
  const gearbox = item.vehicleTransmission || null
  const image_url = item.image || null

  const title = item.name || `${make} ${model}`

  const color = item.color || null
  const seats = item.seatingCapacity ? parseInt(item.seatingCapacity, 10) || null : null
  const doors = item.numberOfDoors ? parseInt(item.numberOfDoors, 10) || null : null
  const horse_power = null

  return {
    source: 'lbauto',
    external_id,
    title,
    make,
    model,
    version,
    price_eur: price_eur && price_eur > 1000 ? price_eur : null,
    year,
    mileage_km,
    fuel,
    gearbox,
    color,
    horse_power,
    doors,
    seats,
    location: null,
    url: carUrl,
    image_url,
    _photos: [],
  }
}

function parsePage(html) {
  const m = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)
  if (!m) return []
  try {
    const data = JSON.parse(m[1])
    const items = (data.itemListElement || []).map(e => e.item).filter(Boolean)
    const listings = []
    for (const item of items) {
      try {
        const listing = itemToListing(item)
        if (listing) listings.push(listing)
      } catch (err) {
        console.error(`  ! lbauto parse failed: ${err.message}`)
      }
    }
    return listings
  } catch (err) {
    console.error(`  ! lbauto JSON parse failed: ${err.message}`)
    return []
  }
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

async function scrape({ pages = 10, onPage } = {}) {
  const all = new Map()
  for (let page = 1; page <= pages; page++) {
    const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${page}`
    console.log(`[lbauto] page ${page}: ${url}`)
    try {
      const html = await fetchPage(url)
      const results = parsePage(html)
      console.log(`  -> ${results.length} listings`)
      if (results.length === 0) break
      const pageListings = results.filter(l => !all.has(l.external_id))
      for (const l of results) all.set(l.external_id, l)
      if (onPage && pageListings.length > 0) await onPage(pageListings)
    } catch (err) {
      console.error(`  ! fetch failed: ${err.message}`)
      break
    }
    if (page < pages) await new Promise(r => setTimeout(r, 1500))
  }
  return [...all.values()]
}

module.exports = { scrape, itemToListing, parsePage }
