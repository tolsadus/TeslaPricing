'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseHit } = require('../scraper/capcar')

test('parseHit: parses a full Tesla Model 3 hit', () => {
  const hit = {
    reference: 'CAP-12345',
    objectID: 'CAP-12345',
    brand: 'Tesla',
    version: 'Model 3',
    carPackage: 'Long Range',
    price: 35000,
    year: 2022,
    mileage: 45000,
    energy: 'ELECTRIC',
    gearbox: 'AUTOMATIC',
    city: 'paris',
    department: '75',
    imageId: 'abc/def.jpg',
  }

  const listing = parseHit(hit)

  assert.equal(listing.source, 'capcar')
  assert.equal(listing.external_id, 'CAP-12345')
  assert.equal(listing.title, 'Tesla Model 3 Long Range')
  assert.equal(listing.make, 'Tesla')
  assert.equal(listing.model, 'Model 3')
  assert.equal(listing.version, 'Long Range')
  assert.equal(listing.price_eur, 35000)
  assert.equal(listing.year, 2022)
  assert.equal(listing.mileage_km, 45000)
  assert.equal(listing.fuel, 'Électrique')
  assert.equal(listing.gearbox, 'Automatique')
  assert.equal(listing.location, 'Paris, 75')
  assert.match(listing.url, /capcar\.fr\/voiture-occasion\/model-3\/CAP-12345/)
  assert.equal(listing.image_url, 'https://res.cloudinary.com/lghaauto/image/upload/abc/def.jpg')
})

test('parseHit: returns null for missing reference', () => {
  assert.equal(parseHit({ brand: 'Tesla' }), null)
})

test('parseHit: handles missing optional fields', () => {
  const listing = parseHit({ reference: 'X1', brand: 'Tesla' })
  assert.equal(listing.external_id, 'X1')
  assert.equal(listing.version, null)
  assert.equal(listing.price_eur, null)
  assert.equal(listing.location, null)
  assert.equal(listing.image_url, null)
})
