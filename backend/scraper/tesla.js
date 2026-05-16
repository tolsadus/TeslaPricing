'use strict'

const createTeslaInventory = require('tesla-inventory')

const MODELS = ['m3', 'my', 'ms', 'mx']
const CONDITIONS = ['new', 'used']
const MODEL_NAMES = { m3: 'Model 3', my: 'Model Y', ms: 'Model S', mx: 'Model X' }
const CABIN_SEATS = { FIVE: 5, SEVEN: 7, SIX: 6, FOUR: 4 }

// market key (CLI alias) -> { inventory key for tesla-inventory lib, language, market code, currency }
const MARKETS = {
  ae: { inventory: 'ae', language: 'en', market: 'AE', currency: 'AED' },
  at: { inventory: 'at', language: 'de', market: 'AT', currency: 'EUR' },
  au: { inventory: 'au', language: 'en', market: 'AU', currency: 'AUD' },
  be: { inventory: 'be', language: 'nl', market: 'BE', currency: 'EUR' },
  ca: { inventory: 'ca', language: 'en', market: 'CA', currency: 'CAD' },
  ch: { inventory: 'ch', language: 'de', market: 'CH', currency: 'CHF' },
  cn: { inventory: 'cn', language: 'zh', market: 'CN', currency: 'CNY' },
  cz: { inventory: 'cz', language: 'cs', market: 'CZ', currency: 'CZK' },
  de: { inventory: 'de', language: 'de', market: 'DE', currency: 'EUR' },
  dk: { inventory: 'dk', language: 'da', market: 'DK', currency: 'DKK' },
  es: { inventory: 'es', language: 'es', market: 'ES', currency: 'EUR' },
  fi: { inventory: 'fi', language: 'fi', market: 'FI', currency: 'EUR' },
  fr: { inventory: 'fr', language: 'fr', market: 'FR', currency: 'EUR' },
  gb: { inventory: 'gb', language: 'en', market: 'GB', currency: 'GBP' },
  gr: { inventory: 'gr', language: 'el', market: 'GR', currency: 'EUR' },
  hk: { inventory: 'hk', language: 'en', market: 'HK', currency: 'HKD' },
  hr: { inventory: 'hr', language: 'hr', market: 'HR', currency: 'EUR' },
  hu: { inventory: 'hu', language: 'hu', market: 'HU', currency: 'HUF' },
  ie: { inventory: 'ie', language: 'en', market: 'IE', currency: 'EUR' },
  il: { inventory: 'il', language: 'he', market: 'IL', currency: 'ILS' },
  is: { inventory: 'is', language: 'is', market: 'IS', currency: 'ISK' },
  it: { inventory: 'it', language: 'it', market: 'IT', currency: 'EUR' },
  jo: { inventory: 'jo', language: 'en', market: 'JO', currency: 'JOD' },
  jp: { inventory: 'jp', language: 'ja', market: 'JP', currency: 'JPY' },
  kr: { inventory: 'kr', language: 'ko', market: 'KR', currency: 'KRW' },
  lu: { inventory: 'lu', language: 'fr', market: 'LU', currency: 'EUR' },
  mo: { inventory: 'mo', language: 'en', market: 'MO', currency: 'MOP' },
  mx: { inventory: 'mx', language: 'es', market: 'MX', currency: 'MXN' },
  my: { inventory: 'my', language: 'en', market: 'MY', currency: 'MYR' },
  nl: { inventory: 'nl', language: 'nl', market: 'NL', currency: 'EUR' },
  no: { inventory: 'no', language: 'no', market: 'NO', currency: 'NOK' },
  nz: { inventory: 'nz', language: 'en', market: 'NZ', currency: 'NZD' },
  pl: { inventory: 'pl', language: 'pl', market: 'PL', currency: 'PLN' },
  pr: { inventory: 'pr', language: 'es', market: 'PR', currency: 'USD' },
  pt: { inventory: 'pt', language: 'pt', market: 'PT', currency: 'EUR' },
  ro: { inventory: 'ro', language: 'ro', market: 'RO', currency: 'RON' },
  se: { inventory: 'se', language: 'sv', market: 'SE', currency: 'SEK' },
  sg: { inventory: 'sg', language: 'en', market: 'SG', currency: 'SGD' },
  si: { inventory: 'si', language: 'sl', market: 'SI', currency: 'EUR' },
  th: { inventory: 'th', language: 'th', market: 'TH', currency: 'THB' },
  tr: { inventory: 'tr', language: 'tr', market: 'TR', currency: 'TRY' },
  tw: { inventory: 'tw', language: 'zh', market: 'TW', currency: 'TWD' },
  us: { inventory: 'us', language: 'en', market: 'US', currency: 'USD' },
}

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

function listingUrl(locale, model, vin, condition, marketKey) {
  const domain = marketKey === 'cn' ? 'cn' : 'com'
  return `https://www.tesla.${domain}/${locale}/${model}/order/${vin}?titleStatus=${condition}&referral=maxime716843`
}

function parseItem(item, model, condition, marketCfg) {
  const vin = item.VIN
  if (!vin) return null

  const price = item.InventoryPrice ?? item.Price ?? item.PurchasePrice ?? null
  const modelName = MODEL_NAMES[model] ?? model
  const trim = item.TrimName ?? null
  const titleParts = ['Tesla', modelName]
  if (trim) titleParts.push(trim)

  const odometer = item.Odometer
  const mileage_km = typeof odometer === 'number' && odometer > 0 ? Math.round(odometer) : 0

  const paintOption = (item.OptionCodeData || []).find(o => o.group === 'PAINT')
  const rawColor = paintOption?.long_name ?? paintOption?.name ?? null
  const color = rawColor ? rawColor.replace(/^Coloris\s+/i, '').trim() : null

  const cabinKey = (item.CABIN_CONFIG || [])[0]
  const seats = CABIN_SEATS[cabinKey] ?? null

  const location = item.City || item.InTransitMetroName || item.VrlName || item.MetroName || null

  const apArr = item.AUTOPILOT || []
  const optionCodes = (item.OptionCodeData || []).map(o => (o.code || '').replace(/^\$/, ''))
  let autopilot = null
  if (apArr.includes('FULL_SELF_DRIVING') || optionCodes.includes('APPF')) autopilot = 'FSD'
  else if (apArr.includes('ENHANCED_AUTOPILOT') || optionCodes.includes('APPB')) autopilot = 'EAP'

  const tow_hitch = optionCodes.includes('TW01') || (item.OptionCodeData || []).some(o => o.group === 'TOWING')

  return {
    source: 'tesla',
    external_id: vin,
    title: titleParts.join(' '),
    make: 'Tesla',
    model: modelName,
    version: trim,
    price: typeof price === 'number' ? Math.round(price) : null,
    year: item.Year ?? null,
    mileage_km,
    fuel: 'Électrique',
    gearbox: 'Automatique',
    color,
    horse_power: null,
    doors: null,
    seats,
    autopilot,
    tow_hitch,
    location,
    country: marketCfg.market,
    market: marketCfg.market,
    currency: marketCfg.currency,
    url: listingUrl(`${marketCfg.language}_${marketCfg.market}`, model, vin, condition, marketCfg.inventory),
    image_url: compositorImage(model, item.OptionCodeList ?? null),
    _photos: (item.VehiclePhotos || []).map(p => p.imageUrl).filter(Boolean),
  }
}

// Runs fn over items with at most `limit` in flight at once.
async function runPool(items, limit, fn) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await fn(items[cursor++])
  })
  await Promise.all(workers)
}

// Two-letter ISO code -> flag emoji (regional indicator pair).
function flagEmoji(market) {
  return String.fromCodePoint(...[...market.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
}

async function scrapeMarket(marketKey, models, onPage, all, onProgress) {
  const cfg = MARKETS[marketKey]
  if (!cfg) {
    console.warn(`[tesla] unknown market "${marketKey}", skipping`)
    return
  }
  const flag = flagEmoji(cfg.market)
  const totalSteps = models.length * CONDITIONS.length
  let step = 0
  let count = 0
  const report = label => {
    if (onProgress) onProgress(marketKey, { market: cfg.market, flag, step, totalSteps, count, label })
    else console.log(`${flag} ${cfg.market}  ${step}/${totalSteps}  ${label}`)
  }
  report('start')
  for (const model of models) {
    for (const condition of CONDITIONS) {
      step++
      try {
        const results = await teslaInventory(cfg.inventory, { model, condition })
        const listings = results.map(item => parseItem(item, model, condition, cfg)).filter(Boolean)
        all.push(...listings)
        count += listings.length
        if (onPage && listings.length > 0) await onPage(listings)
        report(`${model}/${condition} +${listings.length}`)
      } catch (err) {
        report(`${model}/${condition} ✗ ${err.message}`)
      }
    }
  }
  report(`done · ${count} listings`)
}

async function scrape({ models = MODELS, markets = ['fr'], concurrency = 5, onPage, onProgress } = {}) {
  const all = []
  await runPool(markets, concurrency, marketKey => scrapeMarket(marketKey, models, onPage, all, onProgress))
  return all
}

module.exports = { scrape, parseItem, MARKETS, CONDITIONS, flagEmoji }
