#!/usr/bin/env node
'use strict'

const { Command } = require('commander')
const { upsert, pool } = require('./db')

function makeOnPage(total) {
  return async (listings) => {
    const n = await upsert(listings)
    total.count += n
    console.log(`  [db] upserted ${n} (total so far: ${total.count})`)
  }
}

const program = new Command()
program.name('scrape').description('TeslaPricing scraper CLI')

program
  .command('capcar')
  .description('Scrape CapCar listings via Algolia')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 10)
  .action(async ({ pages }) => {
    const { scrape } = require('./capcar')
    const total = { count: 0 }
    await scrape({ pages, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program
  .command('gmecars')
  .description('Scrape GMECars listings')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .action(async ({ pages }) => {
    const { scrape } = require('./gmecars')
    const total = { count: 0 }
    await scrape({ pages, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program
  .command('leboncoin')
  .description('Scrape Leboncoin listings via Playwright')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .option('--headed', 'open a browser window (needed to solve captcha on first run)')
  .action(async ({ pages, headed }) => {
    const { scrape } = require('./leboncoin')
    const total = { count: 0 }
    await scrape({ pages, headed, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program
  .command('tesla')
  .description('Scrape Tesla inventory')
  .option('--models <list>', 'comma-separated models (m3,my,ms,mx)', 'm3,my,ms,mx')
  .action(async ({ models }) => {
    const { scrape } = require('./tesla')
    const total = { count: 0 }
    await scrape({ models: models.split(','), onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program
  .command('aramisauto')
  .description('Scrape Aramisauto Tesla listings via Playwright')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .option('--headed', 'open a browser window (useful if a cookie wall blocks headless)')
  .action(async ({ pages, headed }) => {
    const { scrape } = require('./aramisauto')
    const total = { count: 0 }
    await scrape({ pages, headed, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program
  .command('renew')
  .description('Scrape Renew Auto Tesla listings')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 5)
  .action(async ({ pages }) => {
    const { scrape } = require('./renew')
    const total = { count: 0 }
    await scrape({ pages, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program
  .command('lbauto')
  .description('Scrape LB Automobiles Tesla listings via JSON-LD')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 10)
  .action(async ({ pages }) => {
    const { scrape } = require('./lbauto')
    const total = { count: 0 }
    await scrape({ pages, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program
  .command('heycar')
  .description('Scrape Heycar Tesla listings')
  .action(async () => {
    const { scrape } = require('./heycar')
    const total = { count: 0 }
    await scrape({ onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program
  .command('alcopa')
  .description('Scrape Alcopa Auction Tesla listings')
  .action(async () => {
    const { scrape } = require('./alcopa')
    const total = { count: 0 }
    await scrape({ onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
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
    const total = { count: 0 }
    await lacentrale.scrape({ pages, headed, debug, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await pool.end()
  })

program.parseAsync(process.argv).catch(err => {
  console.error(err)
  process.exit(1)
})
