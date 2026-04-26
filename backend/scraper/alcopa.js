'use strict'

const SEARCH_URL = 'https://www.alcopa-auction.fr/recherche?brands%5B%5D=TESLA'
const BASE_URL = 'https://www.alcopa-auction.fr'

const { USER_AGENT } = require('./constants')

function canonicalModel(text) {
  if (/model[\s-]*x/i.test(text)) return 'Model X'
  if (/model[\s-]*s/i.test(text)) return 'Model S'
  if (/model[\s-]*y/i.test(text)) return 'Model Y'
  if (/model[\s-]*3/i.test(text)) return 'Model 3'
  return null
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseListings(html) {
  const byId = new Map()

  // Each listing is wrapped in <div class="card h-100">. Split by card boundaries.
  const cardOpens = []
  const openRe = /<div class="card h-100">/g
  let openMatch
  while ((openMatch = openRe.exec(html)) !== null) cardOpens.push(openMatch.index)
  if (cardOpens.length === 0) return []

  for (let i = 0; i < cardOpens.length; i++) {
    const start = cardOpens[i]
    const end = cardOpens[i + 1] ?? html.length
    const card = html.slice(start, end)

    try {
      const hrefMatch = card.match(/href="(\/(?:voiture|utilitaire)-occasion\/tesla\/[^"]+)"/i)
      if (!hrefMatch) continue
      const path = hrefMatch[1]
      const idMatch = path.match(/-(\d+)$/)
      if (!idMatch) continue
      const external_id = idMatch[1]
      if (byId.has(external_id)) continue

      const imgMatch = card.match(/<img[^>]+src="([^"]+)"/)
      const image_url = imgMatch ? imgMatch[1] : null

      const text = stripTags(card)

      // Variant title sits in <p class="mb-2"> — e.g. "MODEL 3 RWD STANDARD"
      const titleMatch = card.match(/<p[^>]*class="[^"]*mb-2[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      const rawTitle = titleMatch ? stripTags(titleMatch[1]) : ''
      const model = canonicalModel(rawTitle)

      const yearMatch = text.match(/1[eè]re?\s+mise\s*:\s*(\d{4})/i)
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null

      // Mileage sits on its own line in the card, preceded by <br/>
      const kmMatch = card.match(/<br\s*\/?>\s*([\d\s]+?)\s*km\b/i)
      const mileage_km = kmMatch ? parseInt(kmMatch[1].replace(/\s/g, ''), 10) : null

      const priceMatch = text.match(/(?:Mise\s+[àa]\s+prix|Ench[eè]re\s+courante)\s*:?\s*(\d[\d\s]*)\s*(?:€|&euro;)/i)
      const price_eur = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, ''), 10) : null

      const locationMatch = card.match(/title="Lieu de stockage"[^>]*>[\s\S]*?<strong>[\s\S]*?<\/i>\s*([^<]+?)<\/strong>/i)
      const location = locationMatch ? locationMatch[1].trim() : null

      const sohMatch = text.match(/Certificat\s+batterie\s+(\d+)\s*%/i)
      const soh = sohMatch ? parseInt(sohMatch[1], 10) : null

      const lotMatch = text.match(/Lot\s+n°\s*(\d+)/i)
      const lot_number = lotMatch ? lotMatch[1] : null

      const dateMatch = card.match(/title="Date vente"[\s\S]*?(\d{2})\/(\d{2})\/(\d{4})/i)
      const auction_date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null

      let version = rawTitle.replace(/^(?:TESLA\s+)?MODEL\s+[XSY3]\s*/i, '').trim() || null
      if (soh !== null) version = `${version ? version + ' ' : ''}SOH ${soh}%`

      byId.set(external_id, {
        source:      'alcopa',
        external_id,
        title:       `Tesla ${rawTitle || external_id}`,
        make:        'Tesla',
        model,
        version,
        price_eur:   price_eur && price_eur > 1000 ? price_eur : null,
        year,
        mileage_km,
        fuel:        'Électrique',
        gearbox:     'Automatique',
        color:       null, // filled in by fetchDetail
        vin:         null, // filled in by fetchDetail
        horse_power: null,
        doors:       null,
        seats:       null,
        location,
        url:         `${BASE_URL}${path}`,
        image_url,
        _photos:     [],
        auction_date,
        lot_number,
      })
    } catch (err) {
      console.error(`  ! alcopa parse error: ${err.message}`)
    }
  }
  return [...byId.values()]
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':      USER_AGENT,
      'Accept-Language': 'fr-FR,fr;q=0.9',
      Accept:            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function parseDetail(html) {
  const tableRow = (label) => {
    const re = new RegExp(`<th[^>]*>[^<]*${label}[^<]*<\\/th>\\s*<td[^>]*>([^<]+)<\\/td>`, 'i')
    const m = html.match(re)
    return m ? m[1].trim() : null
  }
  const vin = tableRow('Numéro de série')
  const color = tableRow('Couleur')
  return { vin, color }
}

async function scrape({ onPage } = {}) {
  console.log(`[alcopa] fetching ${SEARCH_URL}`)
  try {
    const html = await fetchHtml(SEARCH_URL)
    const listings = parseListings(html)
    console.log(`  -> ${listings.length} listings, fetching details...`)

    for (const listing of listings) {
      try {
        const detailHtml = await fetchHtml(listing.url)
        const { vin, color } = parseDetail(detailHtml)
        listing.vin = vin
        listing.color = color
        if (vin) console.log(`  [${listing.external_id}] VIN: ${vin}`)
      } catch (err) {
        console.error(`  ! detail fetch failed for ${listing.external_id}: ${err.message}`)
      }
      await new Promise(r => setTimeout(r, 500))
    }

    if (onPage && listings.length > 0) await onPage(listings)
    return listings
  } catch (err) {
    console.error(`  ! alcopa fetch failed: ${err.message}`)
    return []
  }
}

module.exports = { scrape, parseListings }
