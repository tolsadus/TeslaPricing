'use strict'

const BASE_URL = 'https://mmxbv.nl'
const API_URL = `${BASE_URL}/wp-json/vehica/v1/cars`

const { USER_AGENT } = require('./constants')

function canonicalModel(text) {
  if (/model[\s-]*x/i.test(text)) return 'Model X'
  if (/model[\s-]*s/i.test(text)) return 'Model S'
  if (/model[\s-]*y/i.test(text)) return 'Model Y'
  if (/model[\s-]*3/i.test(text)) return 'Model 3'
  return null
}

function findAttr(attrs, name) {
  return (attrs || []).find(a => a.name === name) || null
}

function attrTaxonomyName(attrs, name) {
  const a = findAttr(attrs, name)
  if (!a || !Array.isArray(a.value) || a.value.length === 0) return null
  return a.value[0].name || null
}

function attrNumber(attrs, name) {
  const a = findAttr(attrs, name)
  if (!a) return null
  if (typeof a.value === 'number') return a.value
  if (typeof a.value === 'string') {
    const n = parseInt(a.value, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parsePerfHp(label) {
  // e.g. "5.0s - 390pk"
  if (!label) return null
  const m = label.match(/(\d+)\s*pk/i)
  return m ? parseInt(m[1], 10) : null
}

function isSold(attrs) {
  const a = findAttr(attrs, 'Type aanbod')
  if (!a || !Array.isArray(a.value)) return false
  return a.value.some(v => /verkocht/i.test(v.slug || '') || /verkocht/i.test(v.name || ''))
}

function carToListing(car, sold = false) {
  const external_id = String(car.id)
  const url = car.url
  const title = car.name || `Tesla ${external_id}`

  const attrs = car.attributes || []

  const modelLabel = attrTaxonomyName(attrs, 'Model')
  const model = canonicalModel(modelLabel || title)

  const year = attrNumber(attrs, 'Bouwjaar')
  const mileage_km = attrNumber(attrs, 'Kilometerstand')
  const color = attrTaxonomyName(attrs, 'Kleur')

  const priceAttr = findAttr(attrs, 'Prijs')
  let price_eur = null
  if (priceAttr && priceAttr.value && typeof priceAttr.value === 'object') {
    const v = Object.values(priceAttr.value)[0]
    if (typeof v === 'number' && v > 1000) price_eur = v
  }

  const perfLabel = attrTaxonomyName(attrs, 's/0-100 - Pk')
  const horse_power = parsePerfHp(perfLabel)

  // Version: strip "Tesla" + model from title
  let version = title.replace(/^Tesla\s+/i, '')
  if (model) version = version.replace(new RegExp(`^${model}\\s*`, 'i'), '')
  version = version.trim() || null

  const tow_hitch = /trekhaak/i.test(title) || null

  const gallery = findAttr(attrs, 'Galerij')
  const firstPhoto = (gallery && Array.isArray(gallery.images) && gallery.images[0])
    ? gallery.images[0].url
    : null
  const image_url = firstPhoto

  return {
    source: 'mmxbv',
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
    color,
    horse_power,
    doors: null,
    seats: null,
    tow_hitch,
    location: null,
    url,
    image_url,
    is_sold: sold,
    _photos: [],
  }
}

async function fetchAll() {
  const res = await fetch(API_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${API_URL}`)
  return res.json()
}

async function scrape({ onPage, knownSoldIds = new Set() } = {}) {
  console.log(`[mmxbv] fetching ${API_URL}`)
  let data
  try {
    data = await fetchAll()
  } catch (err) {
    console.error(`  ! fetch failed: ${err.message}`)
    return []
  }
  const cars = data.results || []
  console.log(`  -> ${cars.length} cars (resultsCount=${data.resultsCount})`)

  const listings = []
  let forSale = 0, newSold = 0, skippedKnownSold = 0
  for (const car of cars) {
    try {
      const sold = isSold(car.attributes || [])
      const external_id = String(car.id)
      if (sold && knownSoldIds.has(external_id)) { skippedKnownSold++; continue }
      const listing = carToListing(car, sold)
      if (!listing.external_id) continue
      listings.push(listing)
      if (sold) newSold++; else forSale++
    } catch (err) {
      console.error(`  ! mmxbv parse failed for ${car.id}: ${err.message}`)
    }
  }
  console.log(`  -> ${forSale} for sale, ${newSold} newly sold, ${skippedKnownSold} already-known sold (skipped)`)

  if (onPage && listings.length > 0) await onPage(listings)
  return listings
}

module.exports = { scrape, carToListing }
