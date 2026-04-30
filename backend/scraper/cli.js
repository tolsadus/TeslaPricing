#!/usr/bin/env node
'use strict'

const { Command } = require('commander')
const { upsert, pool, deleteStaleAuctions, refreshDelta, markRemoved, markRemovedByAge } = require('./db')

const STALE_AGE_SOURCES = new Set(['leboncoin', 'lacentrale'])
const STALE_AGE_DAYS = 7

async function markRemovedFor(source, runStart, total) {
  try {
    if (STALE_AGE_SOURCES.has(source)) {
      const n = await markRemovedByAge(source, STALE_AGE_DAYS)
      if (n > 0) console.log(`  [db] ${source}: ${n} listings unseen for ${STALE_AGE_DAYS}+ days marked as removed`)
    } else {
      if (total.count === 0) {
        console.log(`  [db] skipping markRemoved for ${source}: no listings upserted`)
        return
      }
      const n = await markRemoved(source, runStart)
      if (n > 0) console.log(`  [db] ${source}: ${n} listings missed this run marked as removed`)
    }
  } catch (err) {
    console.error(`Failed to mark removed for ${source}:`, err.message)
  }
}

async function finalize(source, runStart, total) {
  if (source && runStart && total) await markRemovedFor(source, runStart, total)
  try {
    await refreshDelta()
    console.log('Refreshed listings_with_delta.')
  } catch (err) {
    console.error('Failed to refresh listings_with_delta:', err.message)
  }
  await pool.end()
}

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
    const runStart = new Date().toISOString()
    await scrape({ pages, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('capcar', runStart, total)
  })

program
  .command('gmecars')
  .description('Scrape GMECars listings')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 10)
  .action(async ({ pages }) => {
    const { scrape } = require('./gmecars')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ pages, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('gmecars', runStart, total)
  })

program
  .command('leboncoin')
  .description('Scrape Leboncoin listings via Playwright')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .option('--headed', 'open a browser window (needed to solve captcha on first run)')
  .action(async ({ pages, headed }) => {
    const { scrape } = require('./leboncoin')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ pages, headed, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('leboncoin', runStart, total)
  })

program
  .command('tesla')
  .description('Scrape Tesla inventory')
  .option('--models <list>', 'comma-separated models (m3,my,ms,mx)', 'm3,my,ms,mx')
  .action(async ({ models }) => {
    const { scrape } = require('./tesla')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ models: models.split(','), onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('tesla', runStart, total)
  })

program
  .command('aramisauto')
  .description('Scrape Aramisauto Tesla listings via Playwright')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 1)
  .option('--headed', 'open a browser window (useful if a cookie wall blocks headless)')
  .action(async ({ pages, headed }) => {
    const { scrape } = require('./aramisauto')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ pages, headed, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('aramisauto', runStart, total)
  })

program
  .command('renew')
  .description('Scrape Renew Auto Tesla listings')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 5)
  .action(async ({ pages }) => {
    const { scrape } = require('./renew')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ pages, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('renew', runStart, total)
  })

program
  .command('lbauto')
  .description('Scrape LB Automobiles Tesla listings via JSON-LD')
  .option('--pages <n>', 'number of pages', v => parseInt(v, 10), 10)
  .action(async ({ pages }) => {
    const { scrape } = require('./lbauto')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ pages, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('lbauto', runStart, total)
  })

program
  .command('heycar')
  .description('Scrape Heycar Tesla listings')
  .action(async () => {
    const { scrape } = require('./heycar')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('heycar', runStart, total)
  })

program
  .command('alcopa')
  .description('Scrape Alcopa Auction Tesla listings')
  .action(async () => {
    const { scrape } = require('./alcopa')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    const removed = await deleteStaleAuctions('alcopa', 2)
    console.log(`Removed ${removed} alcopa auctions older than 2 days.`)
    await finalize('alcopa', runStart, total)
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
      await finalize()
      return
    }
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await lacentrale.scrape({ pages, headed, debug, onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('lacentrale', runStart, total)
  })

program.parseAsync(process.argv).catch(err => {
  console.error(err)
  process.exit(1)
})
