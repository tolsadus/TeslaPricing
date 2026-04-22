'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { adToListing, findAds } = require('../scraper/leboncoin')

test('adToListing: parses a full Leboncoin ad', () => {
  const ad = {
    list_id: 2345678901,
    subject: 'Tesla Model 3 Long Range',
    price: [35000],
    attributes: [
      { key: 'brand', value: 'tesla' },
      { key: 'model', value: 'model 3' },
      { key: 'regdate', value: '2021' },
      { key: 'mileage', value: '50000' },
      { key: 'fuel', value: 'Électrique' },
      { key: 'gearbox', value: 'Automatique' },
    ],
    location: { city: 'Lyon', zipcode: '69000' },
    url: 'https://www.leboncoin.fr/ad/voitures/2345678901',
    images: { urls: ['https://img/a.jpg', 'https://img/b.jpg'] },
  }

  const listing = adToListing(ad)

  assert.equal(listing.source, 'leboncoin')
  assert.equal(listing.external_id, '2345678901')
  assert.equal(listing.title, 'Tesla Model 3 Long Range')
  assert.equal(listing.make, 'Tesla')
  assert.equal(listing.model, 'Model 3')
  assert.equal(listing.price_eur, 35000)
  assert.equal(listing.year, 2021)
  assert.equal(listing.mileage_km, 50000)
  assert.equal(listing.fuel, 'Électrique')
  assert.equal(listing.gearbox, 'Automatique')
  assert.equal(listing.location, 'Lyon 69000')
  assert.equal(listing.url, 'https://www.leboncoin.fr/ad/voitures/2345678901')
  assert.equal(listing.image_url, 'https://img/a.jpg')
})

test('adToListing: returns null when list_id is missing', () => {
  assert.equal(adToListing({ subject: 'foo' }), null)
})

test('adToListing: uses thumb_url when no urls array', () => {
  const listing = adToListing({
    list_id: 1, subject: 'x', price: 10000, attributes: [],
    images: { thumb_url: 'https://img/t.jpg' },
  })
  assert.equal(listing.image_url, 'https://img/t.jpg')
})

test('findAds: recursively locates ads array in nested payload', () => {
  const payload = {
    props: {
      pageProps: {
        searchData: {
          ads: [
            { list_id: 1, subject: 'A' },
            { list_id: 2, subject: 'B' },
          ],
        },
      },
    },
  }
  const ads = findAds(payload)
  assert.equal(ads.length, 2)
  assert.equal(ads[0].list_id, 1)
})
