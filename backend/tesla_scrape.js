'use strict'

const createTeslaInventory = require('tesla-inventory')
const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, 'crawsla.db')
const MODELS = ['m3', 'my', 'ms', 'mx']
const CONDITIONS = ['new', 'used']
const MODEL_NAMES = { m3: 'Model 3', my: 'Model Y', ms: 'Model S', mx: 'Model X' }

const fetcher = url => fetch(url).then(res => res.text())
const teslaInventory = createTeslaInventory(fetcher)

function compositorImage(model, optionCodeList) {
  if (!optionCodeList) return null
  const params = new URLSearchParams({
    context: 'design_studio_2',
    options: optionCodeList,
    view: 'STUD_3QTR',
    model,
    size: 800,
    bkba_opt: 2,
    crop: '1400,850,300,175',
  })
  return `https://static-assets.tesla.com/configurator/compositor?${params}`
}

function listingUrl(model, vin, condition) {
  return `https://www.tesla.com/fr_FR/${model}/order/${vin}?titleStatus=${condition}`
}

function parseItem(item, model, condition) {
  const vin = item.VIN
  if (!vin) return null

  const price = item.InventoryPrice ?? item.Price ?? item.PurchasePrice ?? null
  const modelName = MODEL_NAMES[model] ?? model
  const trim = item.TrimName ?? null
  const titleParts = ['Tesla', modelName]
  if (trim) titleParts.push(trim)

  const odometer = item.Odometer
  const mileageKm = typeof odometer === 'number' && odometer > 0 ? Math.round(odometer) : 0

  return {
    source: 'tesla',
    external_id: vin,
    title: titleParts.join(' '),
    make: 'Tesla',
    model: modelName,
    version: trim,
    price_eur: typeof price === 'number' ? Math.round(price) : null,
    year: item.Year ?? null,
    mileage_km: mileageKm,
    fuel: 'Électrique',
    gearbox: 'Automatique',
    location: item.MetroName ?? null,
    url: listingUrl(model, vin, condition),
    image_url: compositorImage(model, item.OptionCodeList ?? null),
  }
}

function upsertListings(db, listings) {
  const now = new Date().toISOString()

  const selectPrices = db.prepare(
    'SELECT source, external_id, id, price_eur FROM listings WHERE source = ? AND external_id = ?'
  )

  const upsert = db.prepare(`
    INSERT INTO listings
      (source, external_id, title, make, model, version, price_eur, year, mileage_km,
       fuel, gearbox, location, url, image_url, scraped_at)
    VALUES
      (@source, @external_id, @title, @make, @model, @version, @price_eur, @year, @mileage_km,
       @fuel, @gearbox, @location, @url, @image_url, @scraped_at)
    ON CONFLICT(source, external_id) DO UPDATE SET
      title      = excluded.title,
      price_eur  = excluded.price_eur,
      year       = excluded.year,
      mileage_km = excluded.mileage_km,
      fuel       = excluded.fuel,
      gearbox    = excluded.gearbox,
      location   = excluded.location,
      url        = excluded.url,
      image_url  = excluded.image_url,
      scraped_at = excluded.scraped_at
  `)

  const insertHistory = db.prepare(`
    INSERT INTO price_history (listing_id, price_eur, recorded_at)
    VALUES (@listing_id, @price_eur, @recorded_at)
  `)

  const selectId = db.prepare(
    'SELECT id FROM listings WHERE source = ? AND external_id = ?'
  )

  const run = db.transaction(rows => {
    for (const row of rows) {
      const prior = selectPrices.get(row.source, row.external_id)
      upsert.run({ ...row, scraped_at: now })

      const priceChanged = !prior || prior.price_eur !== row.price_eur
      if (priceChanged) {
        const { id } = selectId.get(row.source, row.external_id)
        insertHistory.run({ listing_id: id, price_eur: row.price_eur, recorded_at: now })
      }
    }
  })

  run(listings)
}

async function main() {
  const args = process.argv.slice(2)
  const models = args.length ? args : MODELS
  const db = new Database(DB_PATH)

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  let total = 0

  for (const model of models) {
    for (const condition of CONDITIONS) {
      console.log(`[tesla] fetching ${model}/${condition}…`)
      try {
        const results = await teslaInventory('fr', { model, condition })
        console.log(`  -> ${results.length} results`)

        const listings = results
          .map(item => parseItem(item, model, condition))
          .filter(Boolean)

        upsertListings(db, listings)
        total += listings.length
        console.log(`  -> upserted ${listings.length} listings`)
      } catch (err) {
        console.error(`  ! failed for ${model}/${condition}: ${err.message}`)
      }
    }
  }

  db.close()
  console.log(`\nDone. Total upserted: ${total}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
