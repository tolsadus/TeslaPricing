'use strict'

const createTeslaInventory = require('tesla-inventory')

const MODELS = ['m3', 'my', 'ms', 'mx']
const CONDITIONS = ['new', 'used']
const MODEL_NAMES = { m3: 'Model 3', my: 'Model Y', ms: 'Model S', mx: 'Model X' }

const fetcher = url => fetch(url).then(res => res.text())
const teslaInventory = createTeslaInventory(fetcher)

function compositorImage(model, optionCodeList) {
  if (!optionCodeList) return null
  const params = new URLSearchParams({
    context: 'design_studio_2', options: optionCodeList, view: 'STUD_3QTR',
    model, size: 800, bkba_opt: 2, crop: '1400,850,300,175',
  })
  return `https://static-assets.tesla.com/configurator/compositor?${params}`
}

function listingUrl(model, vin, condition) {
  return `https://www.tesla.com/fr_FR/${model}/order/${vin}?titleStatus=${condition}&referral=maxime716843`
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
  const mileage_km = typeof odometer === 'number' && odometer > 0 ? Math.round(odometer) : 0

  return {
    source: 'tesla',
    external_id: vin,
    title: titleParts.join(' '),
    make: 'Tesla',
    model: modelName,
    version: trim,
    price_eur: typeof price === 'number' ? Math.round(price) : null,
    year: item.Year ?? null,
    mileage_km,
    fuel: 'Électrique',
    gearbox: 'Automatique',
    location: item.MetroName ?? null,
    url: listingUrl(model, vin, condition),
    image_url: compositorImage(model, item.OptionCodeList ?? null),
    _photos: (item.VehiclePhotos || []).map(p => p.imageUrl).filter(Boolean),
  }
}

async function scrape({ models = MODELS } = {}) {
  const all = []
  for (const model of models) {
    for (const condition of CONDITIONS) {
      console.log(`[tesla] fetching ${model}/${condition}…`)
      try {
        const results = await teslaInventory('fr', { model, condition })
        console.log(`  -> ${results.length} results`)
        const listings = results.map(item => parseItem(item, model, condition)).filter(Boolean)
        all.push(...listings)
      } catch (err) {
        console.error(`  ! failed for ${model}/${condition}: ${err.message}`)
      }
    }
  }
  return all
}

module.exports = { scrape }
