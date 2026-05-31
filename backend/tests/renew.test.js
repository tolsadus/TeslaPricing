'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { vehicleToListing } = require('../scraper/renew')

test('vehicleToListing: parses a full renew vehicle', () => {
  const v = {
    productId: 'P-555',
    brand: { label: 'TESLA' },
    model: { label: 'MODEL 3' },
    name: 'MODEL 3',
    version: { label: 'MODEL 3 Long Range AWD null' },
    energy: { groupLabel: 'Électrique' },
    transmission: { label: 'Automatique' },
    modelYear: 2021,
    mileage: 60000,
    prices: [{ priceWithTaxes: 31990 }],
    dealer: { name: 'Renew Lyon', address: { locality: 'Lyon' } },
    color: { label: 'Noir' },
    horsePower: 440,
    numberOfDoors: 5,
    numberOfSeats: 5,
    assets: [{
      renditions: [
        { resolutionType: 'medium', url: 'https://img/m.jpg' },
        { resolutionType: 'large', url: 'https://img/l.jpg' },
      ],
    }],
  }

  const listing = vehicleToListing(v)

  assert.equal(listing.source, 'renew')
  assert.equal(listing.external_id, 'P-555')
  assert.equal(listing.make, 'Tesla')
  assert.equal(listing.model, 'Model 3')
  assert.equal(listing.version, 'Long Range AWD')
  assert.equal(listing.fuel, 'Électrique')
  assert.equal(listing.gearbox, 'Automatique')
  assert.equal(listing.year, 2021)
  assert.equal(listing.mileage_km, 60000)
  assert.equal(listing.price, 31990)
  assert.equal(listing.location, 'Renew Lyon — Lyon')
  assert.equal(listing.color, 'Noir')
  assert.equal(listing.horse_power, 440)
  assert.equal(listing.doors, 5)
  assert.equal(listing.seats, 5)
  assert.equal(listing.image_url, 'https://img/m.jpg')
})

test('vehicleToListing: returns null without a productId', () => {
  assert.equal(vehicleToListing({}), null)
})

test('vehicleToListing: ignores a price <= 1000', () => {
  const listing = vehicleToListing({ productId: 'P-1', prices: [{ priceWithTaxes: 500 }] })
  assert.equal(listing.price, null)
})
