'use strict'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'TeslaPricing/1.0 (https://github.com/tolsadus/TeslaPricing)'
const NOMINATIM_MIN_INTERVAL_MS = 1100 // Nominatim policy: <= 1 req/sec

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

async function lookupCity(client, name) {
  const res = await client.query(
    'SELECT latitude, longitude FROM cities WHERE name = $1',
    [name.toLowerCase()]
  )
  if (res.rows.length === 0) return null
  const { latitude, longitude } = res.rows[0]
  return { lat: parseFloat(latitude), lng: parseFloat(longitude) }
}

async function saveCity(client, name, lat, lng) {
  await client.query(
    `INSERT INTO cities (name, latitude, longitude) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO NOTHING`,
    [name.toLowerCase(), lat, lng]
  )
}

async function callNominatim(query) {
  const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimCall)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastNominatimCall = Date.now()

  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=fr`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  const lat = parseFloat(data[0].lat)
  const lng = parseFloat(data[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

async function geocode(client, rawLocation) {
  const normalized = normalizeLocation(rawLocation)
  if (!normalized) return null

  const cached = await lookupCity(client, normalized)
  if (cached) return cached

  const query = isFrenchDeptCode(normalized)
    ? `Département ${normalized}, France`
    : `${normalized}, France`
  const fresh = await callNominatim(query)
  if (!fresh) return null
  await saveCity(client, normalized, fresh.lat, fresh.lng)
  return fresh
}

module.exports = { geocode, normalizeLocation }
