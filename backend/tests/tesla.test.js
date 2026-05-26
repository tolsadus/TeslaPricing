'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseItem, MARKETS } = require('../scraper/tesla')

test('parseItem: parses a full Tesla Model 3 inventory item', () => {
  const item = {
    VIN: '5YJ3E1EA7KF000123',
    InventoryPrice: 42990,
    Year: 2023,
    Odometer: 15000,
    TrimName: 'Long Range AWD',
    MetroName: 'Paris',
    OptionCodeList: 'PPSW,IPW2',
    VehiclePhotos: [{ imageUrl: 'https://tesla.com/a.jpg' }, { imageUrl: 'https://tesla.com/b.jpg' }],
  }

  const listing = parseItem(item, 'm3', 'used', MARKETS.fr)

  assert.equal(listing.source, 'tesla')
  assert.equal(listing.external_id, '5YJ3E1EA7KF000123')
  assert.equal(listing.title, 'Tesla Model 3 Long Range AWD')
  assert.equal(listing.make, 'Tesla')
  assert.equal(listing.model, 'Model 3')
  assert.equal(listing.version, 'Long Range AWD')
  assert.equal(listing.price, 42990)
  assert.equal(listing.year, 2023)
  assert.equal(listing.mileage_km, 15000)
  assert.equal(listing.fuel, 'Électrique')
  assert.equal(listing.gearbox, 'Automatique')
  assert.equal(listing.location, 'Paris')
  assert.match(listing.url, /tesla\.com\/fr_FR\/m3\/order\/5YJ3E1EA7KF000123/)
  assert.match(listing.url, /titleStatus=used/)
  assert.deepEqual(listing._photos, ['https://tesla.com/a.jpg', 'https://tesla.com/b.jpg'])
})

test('parseItem: returns null for missing VIN', () => {
  assert.equal(parseItem({ Price: 50000 }, 'my', 'new'), null)
})

test('parseItem: mileage_km=0 for new vehicles without odometer', () => {
  const listing = parseItem({ VIN: 'X', Price: 50000 }, 'my', 'new', MARKETS.fr)
  assert.equal(listing.mileage_km, 0)
})

test('parseItem: converts Miles odometer to km', () => {
  const listing = parseItem(
    { VIN: 'M', Odometer: 91048, OdometerType: 'Miles' }, 'm3', 'used', MARKETS.us
  )
  assert.equal(listing.mileage_km, Math.round(91048 * 1.60934))
})

test('parseItem: falls back to Price then PurchasePrice', () => {
  const a = parseItem({ VIN: 'A', Price: 40000 }, 'm3', 'new', MARKETS.fr)
  const b = parseItem({ VIN: 'B', PurchasePrice: 30000 }, 'm3', 'new', MARKETS.fr)
  assert.equal(a.price, 40000)
  assert.equal(b.price, 30000)
})
