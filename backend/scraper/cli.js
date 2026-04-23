#!/usr/bin/env node
'use strict'

const { Command } = require('commander')
const { upsert, pool } = require('./db')

const program = new Command()
program.name('scrape').description('TeslaPricing scraper CLI')

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
  .option('--headed', 'open a browser window (needed to solve captcha on first run)')
  .action(async ({ pages, headed }) => {
    const { scrape } = require('./leboncoin')
    const listings = await scrape({ pages, headed })
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

program
  .command('aramisauto')
  .description('Scrape Aramisauto Tesla listings via Playwright')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .option('--headed', 'open a browser window (useful if a cookie wall blocks headless)')
  .action(async ({ pages, headed }) => {
    const { scrape } = require('./aramisauto')
    const listings = await scrape({ pages, headed })
    const n = await upsert(listings)
    console.log(`\nDone. Upserted ${n} listings.`)
    await pool.end()
  })

program
  .command('renew')
  .description('Scrape Renew Auto Tesla listings')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 5)
  .action(async ({ pages }) => {
    const { scrape } = require('./renew')
    const listings = await scrape({ pages })
    const n = await upsert(listings)
    console.log(`\nDone. Upserted ${n} listings.`)
    await pool.end()
  })

program
  .command('lbauto')
  .description('Scrape LB Automobiles Tesla listings via JSON-LD')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 10)
  .action(async ({ pages }) => {
    const { scrape } = require('./lbauto')
    const listings = await scrape({ pages })
    const n = await upsert(listings)
    console.log(`\nDone. Upserted ${n} listings.`)
    await pool.end()
  })

program
  .command('lacentrale')
  .description('Scrape La Centrale Tesla listings via Playwright')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .option('--headed', 'open a browser window (needed to solve captcha on first run)')
  .option('--login', 'open browser to log in and save session, then exit')
  .option('--debug', 'dump raw captured payloads to ~/.teslapricing/debug/ for inspection')
  .action(async ({ pages, headed, login, debug }) => {
    const lacentrale = require('./lacentrale')
    if (login) {
      await lacentrale.login()
      await pool.end()
      return
    }
    const listings = await lacentrale.scrape({ pages, headed, debug })
    const n = await upsert(listings)
    console.log(`\nDone. Upserted ${n} listings.`)
    await pool.end()
  })

program.parseAsync(process.argv).catch(err => {
  console.error(err)
  process.exit(1)
})
