'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseListing, parsePage } = require('../scraper/gmecars')

const LISTING_HTML = `
  <a href="/voiture-occasion/12345/tesla-model-3-long-range" class="vehiculeInfos">
    <img src="https://gmecars.fr/img.jpg" style="visibility:hidden">
    <span class="marquemodele"><strong>TESLA - MODEL 3</strong></span>
    <span class="version">Long Range Dual Motor</span>
    <div class="pictocard">2021</div>
    <div class="pictocard">52 000 km</div>
    <div class="pictocard">Automatique</div>
    <div class="pictocard">Électrique</div>
    <div class="encart_prix"><span>34 990 €</span></div>
  </a>
`

test('parseListing: parses a full listing body', () => {
  const listing = parseListing(LISTING_HTML, '12345')

  assert.equal(listing.source, 'gmecars')
  assert.equal(listing.external_id, '12345')
  assert.equal(listing.make, 'Tesla')
  assert.equal(listing.model, 'MODEL 3') // model is kept as-is from source (only make is title-cased)
  assert.equal(listing.version, 'Long Range Dual Motor')
  assert.equal(listing.year, 2021)
  assert.equal(listing.mileage_km, 52000)
  assert.equal(listing.fuel, 'Électrique')
  assert.equal(listing.gearbox, 'Automatique')
  assert.equal(listing.price_eur, 34990)
  assert.match(listing.url, /gmecars\.fr.*12345/)
  assert.equal(listing.image_url, 'https://gmecars.fr/img.jpg')
})

test('parseListing: filters out sold listings (price <= 1000)', () => {
  const sold = LISTING_HTML.replace('34 990 €', '1 €')
  assert.equal(parseListing(sold, '12345'), null)
})

test('parseListing: returns null when no href anchor', () => {
  assert.equal(parseListing('<div>nothing here</div>', '12345'), null)
})

test('parsePage: parses multiple listings from page html', () => {
  const pageHtml = `
    <div class="line-car" id="svosite_vehicule_ligne_100">${LISTING_HTML}</div>
    <div class="line-car" id="svosite_vehicule_ligne_200">${LISTING_HTML}</div>
    <div id="pagination"></div>
  `
  const results = parsePage(pageHtml)
  assert.equal(results.length, 2)
  assert.deepEqual(results.map(r => r.external_id).sort(), ['100', '200'])
})
