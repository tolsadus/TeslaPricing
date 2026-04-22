#!/usr/bin/env node
'use strict'

const { Command } = require('commander')
const { upsert, pool } = require('./db')

const program = new Command()
program.name('scrape').description('Crawsla scraper CLI')

program
  .command('capcar')
  .description('Scrape CapCar listings via Algolia')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 10)
  .action(async ({ pages }) => {
    const { scrape } = require('./capcar')
    const listings = await scrape({ pages })
    const n = await upsert(listings)
    console.log(`\nDone. Upserted ${n} listings.`)
    await pool.end()
  })

program
  .command('gmecars')
  .description('Scrape GMECars listings')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .action(async ({ pages }) => {
    const { scrape } = require('./gmecars')
    const listings = await scrape({ pages })
    const n = await upsert(listings)
    console.log(`\nDone. Upserted ${n} listings.`)
    await pool.end()
  })

program
  .command('leboncoin')
  .description('Scrape Leboncoin listings via Playwright')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .action(async ({ pages }) => {
    const { scrape } = require('./leboncoin')
    const listings = await scrape({ pages })
    const n = await upsert(listings)
    console.log(`\nDone. Upserted ${n} listings.`)
    await pool.end()
  })

program
  .command('tesla')
  .description('Scrape Tesla inventory')
  .option('--models <list>', 'comma-separated models (m3,my,ms,mx)', 'm3,my,ms,mx')
  .action(async ({ models }) => {
    const { scrape } = require('./tesla')
    const listings = await scrape({ models: models.split(',') })
    const n = await upsert(listings)
    console.log(`\nDone. Upserted ${n} listings.`)
    await pool.end()
  })

program.parseAsync(process.argv).catch(err => {
  console.error(err)
  process.exit(1)
})
