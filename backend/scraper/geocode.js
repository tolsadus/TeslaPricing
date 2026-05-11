'use strict'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'TeslaPricing/1.0 (https://github.com/tolsadus/TeslaPricing)'
const NOMINATIM_MIN_INTERVAL_MS = 1100 // Nominatim policy: <= 1 req/sec

const COUNTRY_NAMES = { FR: 'France', BE: 'Belgium', NL: 'Netherlands' }

const SOURCE_COUNTRY = {
  tesla: 'FR', leboncoin: 'FR', lacentrale: 'FR', capcar: 'FR',
  lbauto: 'FR', aramisauto: 'FR', gmecars: 'FR', renew: 'FR',
  heycar: 'FR', alcopa: 'FR',
  nikola: 'BE',
  mmxbv: 'NL',
}

function countryFor(source) {
  return SOURCE_COUNTRY[source] || 'FR'
}

let lastNominatimCall = 0

function normalizeLocation(raw) {
  if (!raw) return null
  let s = raw.trim()
  // Strip everything after a comma ("Aix En Provence, Bouches-du-Rhone" → "Aix En Provence")
  const comma = s.indexOf(',')
  if (comma !== -1) s = s.slice(0, comma).trim()
  // Strip trailing French postcode ("Abbeville 80100" → "Abbeville")
  s = s.replace(/\s+\d{5}\s*$/, '').trim()
  // For dealer-style strings like "RENAULT AGEN - EDENAUTO — AGEN", take the
  // last segment after a dash if it's short and looks like a city name.
  const parts = s.split(/\s[-—–]\s/)
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim()
    if (last && last.length <= 30) s = last
  }
  return s.length === 0 ? null : s
}

function isFrenchDeptCode(s) {
  return /^\d{1,3}$/.test(s)
}

async function lookupCity(client, name, country) {
  const res = await client.query(
    'SELECT latitude, longitude FROM cities WHERE name = $1 AND country = $2',
    [name.toLowerCase(), country]
  )
  if (res.rows.length === 0) return null
  const { latitude, longitude } = res.rows[0]
  return { lat: parseFloat(latitude), lng: parseFloat(longitude) }
}

async function saveCity(client, name, country, lat, lng) {
  await client.query(
    `INSERT INTO cities (name, country, latitude, longitude) VALUES ($1, $2, $3, $4)
     ON CONFLICT (name, country) DO NOTHING`,
    [name.toLowerCase(), country, lat, lng]
  )
}

async function callNominatim(query, country) {
  const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimCall)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastNominatimCall = Date.now()

  const cc = country.toLowerCase()
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=${cc}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  const lat = parseFloat(data[0].lat)
  const lng = parseFloat(data[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

async function geocode(client, rawLocation, country = 'FR') {
  const normalized = normalizeLocation(rawLocation)
  if (!normalized) return null

  const cached = await lookupCity(client, normalized, country)
  if (cached) return cached

  const countryName = COUNTRY_NAMES[country] || country
  const query = (country === 'FR' && isFrenchDeptCode(normalized))
    ? `Département ${normalized}, ${countryName}`
    : `${normalized}, ${countryName}`
  const fresh = await callNominatim(query, country)
  if (!fresh) return null
  await saveCity(client, normalized, country, fresh.lat, fresh.lng)
  return fresh
}

module.exports = { geocode, normalizeLocation, countryFor }
