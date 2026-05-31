'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeLocation, countryFor } = require('../scraper/geocode')

test('normalizeLocation: strips everything after a comma', () => {
  assert.equal(normalizeLocation('Aix En Provence, Bouches-du-Rhone'), 'Aix En Provence')
})

test('normalizeLocation: strips a trailing French postcode', () => {
  assert.equal(normalizeLocation('Abbeville 80100'), 'Abbeville')
})

test('normalizeLocation: takes the last dash segment for dealer strings', () => {
  assert.equal(normalizeLocation('RENAULT AGEN - EDENAUTO — AGEN'), 'AGEN')
})

test('normalizeLocation: returns null for empty or missing input', () => {
  assert.equal(normalizeLocation(''), null)
  assert.equal(normalizeLocation(null), null)
  assert.equal(normalizeLocation('   '), null)
})

test('countryFor: maps known sources and defaults to FR', () => {
  assert.equal(countryFor('nikola'), 'BE')
  assert.equal(countryFor('mmxbv'), 'NL')
  assert.equal(countryFor('leboncoin'), 'FR')
  assert.equal(countryFor('unknown-source'), 'FR')
})
