'use strict'

const BASE_URL = 'https://www.gmecars.fr'
const SEARCH_URL = `${BASE_URL}/149/vehicules/?marque=94&photos=1`

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

const GEARBOX_WORDS = new Set(['automatique', 'automatisee', 'automatisée', 'manuelle', 'sequentielle', 'séquentielle'])
const FUEL_WORDS = new Set(['electrique', 'électrique', 'essence', 'diesel', 'hybride', 'hybride essence', 'hybride diesel', 'hybride rechargeable', 'gpl', 'e85', 'ethanol', 'éthanol', 'hydrogene', 'hydrogène'])

const LISTING_RE = /<div class="line-car"[^>]*id="svosite_vehicule_ligne_(\d+)"[^>]*>([\s\S]*?)(?=<div class="line-car"|<div id="pagination"|<\/body>)/g
const HREF_RE = /<a href="([^"]+)"[^>]*class="vehiculeInfos"/
const IMG_RE = /<img src="(https?:\/\/[^"]+)"[^>]*style="visibility:hidden/
const BRAND_RE = /<span class="marquemodele"[^>]*><strong>([^<]+)<\/strong><\/span>/
const VERSION_RE = /<span class="version"[^>]*>([^<]+)<\/span>/
const PICTOCARD_RE = /<div class="pictocard"[^>]*>([^<]+)<\/div>/g
const PRICE_RE = /class="encart_prix[^"]*"[^>]*>[\s\S]*?([\d\s ]+?)\s*(?:&euro;|€)/

const YEAR_RE = /^(?:19|20)\d{2}$/
const KM_RE = /\d[\d\s ]*km/i

function parseInt_(value) {
  if (value == null) return null
  const digits = String(value).replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : null
}

function decodeHtml(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
}

function buildPageUrl(page) {
  if (page <= 1) return SEARCH_URL
  const url = new URL(SEARCH_URL)
  url.searchParams.set('p', page)
  return url.toString()
}

function parseListing(body, vid) {
  const hrefMatch = HREF_RE.exec(body)
  if (!hrefMatch) return null
  const listingUrl = new URL(decodeHtml(hrefMatch[1]), BASE_URL).href

  const imgMatch = IMG_RE.exec(body)
  const image_url = imgMatch ? imgMatch[1] : null

  let make = null, model = null
  const brandMatch = BRAND_RE.exec(body)
  if (brandMatch) {
    const brandText = decodeHtml(brandMatch[1]).trim()
    if (brandText.includes(' - ')) {
      [make, model] = brandText.split(' - ', 2).map(s => s.trim())
    } else {
      make = brandText
    }
  }

  const versionMatch = VERSION_RE.exec(body)
  const version = versionMatch ? decodeHtml(versionMatch[1]).trim() : null

  let gearbox = null, fuel = null, year = null, mileage_km = null
  let pictoMatch
  PICTOCARD_RE.lastIndex = 0
  while ((pictoMatch = PICTOCARD_RE.exec(body)) !== null) {
    const value = decodeHtml(pictoMatch[1]).trim()
    const lower = value.toLowerCase()
    if (YEAR_RE.test(value)) year = parseInt(value, 10)
    else if (KM_RE.test(value)) mileage_km = parseInt_(value)
    else if (GEARBOX_WORDS.has(lower)) gearbox = value
    else if (FUEL_WORDS.has(lower)) fuel = value
  }

  let price_eur = null
  const priceMatch = PRICE_RE.exec(body)
  if (priceMatch) price_eur = parseInt_(priceMatch[1])
  if (price_eur !== null && price_eur <= 1000) return null

  const titleParts = [make, model, version].filter(Boolean)
  const title = titleParts.length ? titleParts.join(' ') : vid

  return {
    source: 'gmecars',
    external_id: vid,
    title,
    make: make ? make.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : null,
    model,
    version,
    price_eur,
    year,
    mileage_km,
    fuel,
    gearbox,
    location: null,
    url: listingUrl,
    image_url,
    _photos: [],
  }
}

function parsePage(html) {
  const listings = []
  const seen = new Set()
  let match
  LISTING_RE.lastIndex = 0
  while ((match = LISTING_RE.exec(html)) !== null) {
    const vid = match[1]
    if (seen.has(vid)) continue
    seen.add(vid)
    try {
      const listing = parseListing(match[2], vid)
      if (listing) listings.push(listing)
    } catch (err) {
      console.error(`  ! gmecars parse failed for ${vid}: ${err.message}`)
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
  const buf = await res.arrayBuffer()
  return new TextDecoder('utf-8').decode(buf)
}

async function scrape({ pages = 1 } = {}) {
  const all = new Map()
  for (let page = 1; page <= pages; page++) {
    const url = buildPageUrl(page)
    console.log(`[gmecars] page ${page}: ${url}`)
    try {
      const html = await fetchPage(url)
      const results = parsePage(html)
      console.log(`  -> ${results.length} listings`)
      for (const l of results) all.set(l.external_id, l)
    } catch (err) {
      console.error(`  ! fetch failed: ${err.message}`)
    }
    if (page < pages) await new Promise(r => setTimeout(r, 1500))
  }
  return [...all.values()]
}

module.exports = { scrape, parseListing, parsePage }
