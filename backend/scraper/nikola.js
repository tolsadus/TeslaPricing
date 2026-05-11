'use strict'

const BASE_URL = 'https://nikola-brussels.be'
const SEARCH_URL = `${BASE_URL}/cars/`

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
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

// "€24.990" → 24990  (BE: '.' is thousands separator)
function parsePrice(text) {
  if (!text) return null
  const m = text.match(/€\s*([\d.,]+)/)
  if (!m) return null
  const n = parseInt(m[1].replace(/[.,\s]/g, ''), 10)
  return Number.isFinite(n) && n > 1000 ? n : null
}

// "131.364 km" → 131364
function parseMileage(text) {
  if (!text) return null
  const m = text.match(/([\d.,]+)\s*km/i)
  if (!m) return null
  const n = parseInt(m[1].replace(/[.,\s]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

// "Mar 2019" → 2019
function parseYear(text) {
  if (!text) return null
  const m = text.match(/\b(19|20)\d{2}\b/)
  return m ? parseInt(m[0], 10) : null
}

function parseCard(html, soldClass = false) {
  const refMatch = html.match(/REF:\s*(\d+)/)
  if (!refMatch) return null
  const external_id = refMatch[1]

  const hrefMatch = html.match(/href="(https:\/\/nikola-brussels\.be\/ref-[^"]+)"/)
  const url = hrefMatch ? hrefMatch[1] : `${BASE_URL}/ref-${external_id}/`

  const imgMatch = html.match(/background-image:\s*url\(([^)]+)\)/)
  const image_url = imgMatch ? imgMatch[1].trim().replace(/^['"]|['"]$/g, '') : null

  const h3Match = html.match(/<h3>([\s\S]*?)<\/h3>/)
  const titleRaw = h3Match ? stripTags(h3Match[1]) : null
  if (!titleRaw) return null
  const title = `Tesla ${titleRaw}`

  const parts = titleRaw.split('|').map(s => s.trim()).filter(Boolean)
  const model = canonicalModel(parts[0] || titleRaw)
  const version = parts.slice(1).join(' ').trim() || null

  const regMatch = html.match(/<p>Registration<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/)
  const year = regMatch ? parseYear(stripTags(regMatch[1])) : null

  const milageMatch = html.match(/<p>Milage<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/)
  const mileage_km = milageMatch ? parseMileage(stripTags(milageMatch[1])) : null

  const priceMatch = html.match(/<b>([^<]*€[^<]*)<\/b>/)
  const price_eur = priceMatch ? parsePrice(priceMatch[1]) : null

  const tagMatch = html.match(/<span class="tag">([\s\S]*?)<\/span>/)
  const tag = tagMatch ? stripTags(tagMatch[1]) : null
  const is_sold = soldClass || /sold/i.test(tag || '') || /in memory of/i.test(tag || '') || /<div class="layer">Sold<\/div>/i.test(html)

  return {
    source: 'nikola',
    external_id,
    title,
    make: 'Tesla',
    model,
    version,
    price_eur,
    year,
    mileage_km,
    fuel: null,
    gearbox: null,
    color: null,
    horse_power: null,
    doors: null,
    seats: null,
    location: 'Brussels',
    url,
    image_url,
    is_sold,
    _photos: [],
  }
}

function parsePage(html) {
  const listings = []
  const normalRe = /<li class="normal">[\s\S]*?<\/li>/g
  const soldRe = /<li class="sold">[\s\S]*?<\/li>/g
  for (const m of html.matchAll(normalRe)) {
    try {
      const listing = parseCard(m[0], false)
      if (listing) listings.push(listing)
    } catch (err) {
      console.error(`  ! nikola parse failed (normal): ${err.message}`)
    }
  }
  for (const m of html.matchAll(soldRe)) {
    try {
      const listing = parseCard(m[0], true)
      if (listing) listings.push(listing)
    } catch (err) {
      console.error(`  ! nikola parse failed (sold): ${err.message}`)
    }
  }
  return listings
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,nl;q=0.7',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = await res.arrayBuffer()
  return new TextDecoder('utf-8').decode(buf)
}

async function scrape({ onPage, knownSoldIds = new Set() } = {}) {
  console.log(`[nikola] fetching ${SEARCH_URL}`)
  let html
  try {
    html = await fetchPage(SEARCH_URL)
  } catch (err) {
    console.error(`  ! fetch failed: ${err.message}`)
    return []
  }
  const all = parsePage(html)
  const listings = []
  let forSale = 0, newSold = 0, skippedKnownSold = 0
  for (const l of all) {
    if (l.is_sold && knownSoldIds.has(l.external_id)) { skippedKnownSold++; continue }
    listings.push(l)
    if (l.is_sold) newSold++; else forSale++
  }
  console.log(`  -> ${forSale} for sale, ${newSold} newly sold, ${skippedKnownSold} already-known sold (skipped)`)
  if (onPage && listings.length > 0) await onPage(listings)
  return listings
}

module.exports = { scrape, parseCard, parsePage }
