'use strict'

const ALGOLIA_APP_ID = '691K8M71IA'
const ALGOLIA_API_KEY = '95874bf3cc96f8de61eced3440501724'
const ALGOLIA_INDEX = 'production_cars'
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`
const BASE_URL = 'https://www.capcar.fr'
const CLOUDINARY_BASE = 'https://res.cloudinary.com/lghaauto/image/upload'
const HITS_PER_PAGE = 50

const ENERGY_MAP = { ELECTRIC: 'Électrique', HYBRID: 'Hybride', PETROL: 'Essence', DIESEL: 'Diesel' }
const GEARBOX_MAP = { AUTOMATIC: 'Automatique', MANUAL: 'Manuelle' }

function slugify(text) {
  return text.toLowerCase().trim()
    .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function listingUrl(version, reference) {
  return `${BASE_URL}/voiture-occasion/${slugify(version || reference)}/${reference}`
}

function imageUrl(imageId) {
  return imageId ? `${CLOUDINARY_BASE}/${imageId}` : null
}

function parseHit(hit) {
  const reference = hit.reference || hit.objectID
  if (!reference) return null

  const brand = hit.brand || 'Tesla'
  const version = hit.version || ''
  const pkg = hit.carPackage || ''
  const title = [brand, version, pkg].filter(Boolean).join(' ')

  const city = (hit.city || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  const location = [city, hit.department].filter(Boolean).join(', ') || null

  const energy = (hit.energy || '').toUpperCase()
  const gearbox = (hit.gearbox || '').toUpperCase()

  return {
    source: 'capcar',
    external_id: reference,
    title,
    make: brand,
    model: version || null,
    version: pkg || null,
    price_eur: hit.price ?? null,
    year: hit.year ?? null,
    mileage_km: hit.mileage ?? null,
    fuel: ENERGY_MAP[energy] || (energy ? energy.charAt(0) + energy.slice(1).toLowerCase() : null),
    gearbox: GEARBOX_MAP[gearbox] || (gearbox ? gearbox.charAt(0) + gearbox.slice(1).toLowerCase() : null),
    location,
    url: listingUrl(version, reference),
    image_url: imageUrl(hit.imageId),
    _photos: [],
  }
}

async function algoliaQuery(page) {
  const res = await fetch(ALGOLIA_URL, {
    method: 'POST',
    headers: {
      'x-algolia-application-id': ALGOLIA_APP_ID,
      'x-algolia-api-key': ALGOLIA_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: '', filters: 'brand:Tesla', hitsPerPage: HITS_PER_PAGE, page }),
  })
  return res.json()
}

async function scrape({ pages = 10, onPage } = {}) {
  const results = new Map()
  let page = 0

  while (true) {
    console.log(`[capcar] page ${page}`)
    const payload = await algoliaQuery(page)
    const hits = payload.hits || []
    const nbPages = payload.nbPages || 1
    console.log(`  -> ${hits.length} hits (page ${page + 1}/${nbPages})`)

    const pageListings = []
    for (const hit of hits) {
      try {
        const listing = parseHit(hit)
        if (listing && !results.has(listing.external_id)) {
          results.set(listing.external_id, listing)
          pageListings.push(listing)
        }
      } catch (err) {
        console.error(`  ! parse failed for ${hit.reference}: ${err.message}`)
      }
    }

    if (onPage && pageListings.length > 0) await onPage(pageListings)

    page++
    if (page >= nbPages || page >= pages) break
    await new Promise(r => setTimeout(r, 500))
  }

  return [...results.values()]
}

module.exports = { scrape, parseHit }
