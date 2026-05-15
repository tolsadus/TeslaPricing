'use strict'

const SEARCH_URL = 'https://heycar.com/fr/autos/make/tesla'
const BASE_URL   = 'https://heycar.com'

const { USER_AGENT } = require('./constants')

function canonicalModel(text) {
  if (/model[\s-]*x/i.test(text)) return 'Model X'
  if (/model[\s-]*s/i.test(text)) return 'Model S'
  if (/model[\s-]*y/i.test(text)) return 'Model Y'
  if (/model[\s-]*3/i.test(text)) return 'Model 3'
  return null
}

function parseRsc(text) {
  const listings = [...text.matchAll(/\{[^{}]*"listing_id":"([^"]+)"[^{}]*\}/g)]
    .map(m => { try { return JSON.parse(m[0]) } catch { return null } })
    .filter(Boolean)

  // Images appear twice per listing (thumbnail + full) — take every other one
  const imageUrls = [...text.matchAll(/"url":"(https:\/\/cdn\.[^"]+)"/g)]
    .map(m => m[1])
    .filter((_, i) => i % 2 === 0)

  return listings.map((item, i) => {
    const model = canonicalModel(item.model || item.vehicle_name || '')
    const listingId = item.listing_id
    const url = `${BASE_URL}/fr/autos/${listingId.replaceAll('-', '_')}`

    return {
      source:      'heycar',
      external_id: listingId,
      title:       item.vehicle_name || `Tesla ${model}`,
      make:        'Tesla',
      model,
      version:     item.variant || null,
      price:   typeof item.price === 'number' ? item.price : null,
      year:        item.year ?? null,
      mileage_km:  typeof item.mileage === 'number' ? item.mileage : null,
      fuel:        'Électrique',
      gearbox:     'Automatique',
      color:       item.colour || null,
      horse_power: null,
      doors:       null,
      seats:       null,
      location:    null,
      url,
      image_url:   imageUrls[i] ?? null,
      _photos:     [],
    }
  })
}

async function scrape({ onPage } = {}) {
  console.log(`[heycar] fetching ${SEARCH_URL}`)
  const res = await fetch(SEARCH_URL, {
    headers: {
      'User-Agent':      USER_AGENT,
      'Accept':          'text/x-component',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'RSC':             '1',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  const listings = parseRsc(text)
  console.log(`  -> ${listings.length} listings`)
  if (onPage && listings.length > 0) await onPage(listings)
  return listings
}

module.exports = { scrape, parseRsc }
