'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { carToListing } = require('../scraper/mmxbv')

test('carToListing: parses a full mmxbv car', () => {
  const car = {
    id: 998,
    url: 'https://mmxbv.nl/car/998',
    name: 'Tesla Model Y Long Range Trekhaak',
    attributes: [
      { name: 'Model', value: [{ name: 'Model Y' }] },
      { name: 'Bouwjaar', value: '2022' },
      { name: 'Kilometerstand', value: 45000 },
      { name: 'Kleur', value: [{ name: 'Wit' }] },
      { name: 'Prijs', value: { EUR: 38900 } },
      { name: 's/0-100 - Pk', value: [{ name: '5.0s - 390pk' }] },
      { name: 'Galerij', images: [{ url: 'https://img/y1.jpg' }] },
    ],
  }

  const listing = carToListing(car)

  assert.equal(listing.source, 'mmxbv')
  assert.equal(listing.external_id, '998')
  assert.equal(listing.title, 'Tesla Model Y Long Range Trekhaak')
  assert.equal(listing.make, 'Tesla')
  assert.equal(listing.model, 'Model Y')
  assert.equal(listing.version, 'Long Range Trekhaak')
  assert.equal(listing.year, 2022)
  assert.equal(listing.mileage_km, 45000)
  assert.equal(listing.color, 'Wit')
  assert.equal(listing.price, 38900)
  assert.equal(listing.horse_power, 390)
  assert.equal(listing.tow_hitch, true)
  assert.equal(listing.image_url, 'https://img/y1.jpg')
  assert.equal(listing.is_sold, false)
})

test('carToListing: ignores a price <= 1000', () => {
  const listing = carToListing({
    id: 1, url: 'x', name: 'Tesla Model 3',
    attributes: [{ name: 'Prijs', value: { EUR: 500 } }],
  })
  assert.equal(listing.price, null)
})

test('carToListing: marks sold when passed sold=true', () => {
  const listing = carToListing({ id: 2, url: 'x', name: 'Tesla', attributes: [] }, true)
  assert.equal(listing.is_sold, true)
})
