'use strict'

const BASE_URL = 'https://wvw.ewigo.com'
const SEARCH_URL = `${BASE_URL}/achat?filter%5Bmarque%5D=TESLA`

const { USER_AGENT } = require('./constants')

function canonicalModel(text) {
  if (/cybertruck/i.test(text)) return 'Cybertruck'
  if (/roadster/i.test(text)) return 'Roadster'
  if (/model[\s-]*x/i.test(text)) return 'Model X'
  if (/model[\s-]*s/i.test(text)) return 'Model S'
  if (/model[\s-]*y/i.test(text)) return 'Model Y'
  if (/model[\s-]*3/i.test(text)) return 'Model 3'
  return null
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function titleCase(s) {
  return s.replace(/(^|[-\s])([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

// "https://clermont-ferrand-sud-ewigo.com/vehicule/142555" → "Clermont-Ferrand"
function locationFromUrl(url) {
  try {
    const host = new URL(url).hostname
    let slug = host.replace(/^www\./, '').replace(/-ewigo\.com$/, '').replace(/\.ewigo\.com$/, '')
    slug = slug.replace(/-(nord|sud|est|ouest|centre)$/i, '')
    if (!slug) return null
    return titleCase(slug)
  } catch {
    return null
  }
}

function mapFuel(energy) {
  if (!energy) return null
  if (/electri/i.test(energy)) return 'Électrique'
  return energy
}

function adToListing(ad) {
  const external_id = ad.id != null ? String(ad.id) : null
  if (!external_id) return null

  const url = ad.full_url || `${BASE_URL}/vehicule/${external_id}`
  const model = canonicalModel(`${ad.model || ''} ${ad.version || ''}`)
  const version = (ad.version || '').trim() || null

  const titleParts = [
    ad.make ? titleCase(String(ad.make).toLowerCase()) : 'Tesla',
    model || (ad.model ? titleCase(String(ad.model).toLowerCase()) : null),
    version,
  ].filter(Boolean)
  const title = titleParts.join(' ')

  const price = Number.isFinite(ad.price) && ad.price > 1000 ? ad.price : null
  const mileage_km = Number.isFinite(ad.kms) ? ad.kms : null
  const seats = Number.isFinite(ad.seats_count) ? ad.seats_count : null

  let year = Number.isFinite(ad.year) ? ad.year : null
  if (!year && ad.market_release_date) {
    const y = new Date(ad.market_release_date).getUTCFullYear()
    if (Number.isFinite(y)) year = y
  }

  const image_url = ad.first_photo_thumb || null

  return {
    source: 'ewigo',
    external_id,
    title,
    make: 'Tesla',
    model,
    version,
    price,
    year,
    mileage_km,
    fuel: mapFuel(ad.energy),
    gearbox: ad.gear || null,
    color: null,
    horse_power: null,
    doors: null,
    seats,
    location: locationFromUrl(url),
    url,
    image_url,
    is_sold: ad.is_solded === 1 || ad.is_solded === true,
    _photos: [],
  }
}

function parsePage(html) {
  const m = html.match(/<div id="app" data-page="([\s\S]*?)"><\/div>/)
  if (!m) return { ads: [], lastPage: 1 }
  let data
  try {
    data = JSON.parse(decodeEntities(m[1]))
  } catch (err) {
    console.error(`  ! ewigo data-page JSON parse failed: ${err.message}`)
    return { ads: [], lastPage: 1 }
  }
  const network = data?.props?.adsNetwork
  if (!network || !Array.isArray(network.data)) return { ads: [], lastPage: 1 }
  const listings = []
  for (const ad of network.data) {
    try {
      const listing = adToListing(ad)
      if (listing) listings.push(listing)
    } catch (err) {
      console.error(`  ! ewigo parse failed for id=${ad?.id}: ${err.message}`)
    }
  }
  return { ads: listings, lastPage: network.last_page || 1 }
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

async function scrape({ onPage, knownSoldIds = new Set() } = {}) {
  const seen = new Set()
  let page = 1
  let lastPage = 1
  while (page <= lastPage) {
    const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${page}`
    console.log(`[ewigo] page ${page}: ${url}`)
    let html
    try {
      html = await fetchPage(url)
    } catch (err) {
      console.error(`  ! fetch failed: ${err.message}`)
      break
    }
    const { ads, lastPage: lp } = parsePage(html)
    lastPage = lp
    let forSale = 0, newSold = 0, skippedKnownSold = 0
    const fresh = []
    for (const l of ads) {
      if (seen.has(l.external_id)) continue
      seen.add(l.external_id)
      if (l.is_sold && knownSoldIds.has(l.external_id)) { skippedKnownSold++; continue }
      fresh.push(l)
      if (l.is_sold) newSold++; else forSale++
    }
    console.log(`  -> ${forSale} for sale, ${newSold} newly sold, ${skippedKnownSold} already-known sold (skipped) [last_page=${lastPage}]`)
    if (onPage && fresh.length > 0) await onPage(fresh)
    if (page >= lastPage) break
    page++
    await new Promise(r => setTimeout(r, 1500))
  }
}

module.exports = { scrape, parsePage, adToListing, locationFromUrl }
