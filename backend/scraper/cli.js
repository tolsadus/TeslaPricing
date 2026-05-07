#!/usr/bin/env node
'use strict'

const { Command } = require('commander')
const { upsert, pool, refreshDelta, markRemovedByAge, getPastUnsoldAlcopa, markSold } = require('./db')
const { geocode } = require('./geocode')

const PAGINATED_SOURCES = new Set(['leboncoin', 'lacentrale'])
const STALE_DAYS_DEFAULT = 3
const STALE_DAYS_PAGINATED = 7

async function markRemovedFor(source, _runStart, total) {
  try {
    if (total.count === 0) {
      console.log(`  [db] skipping markRemoved for ${source}: no listings upserted`)
      return
    }
    const days = PAGINATED_SOURCES.has(source) ? STALE_DAYS_PAGINATED : STALE_DAYS_DEFAULT
    const n = await markRemovedByAge(source, days)
    if (n > 0) console.log(`  [db] ${source}: ${n} listings unseen for ${days}+ days marked as removed`)
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
    const { scrape, checkSold } = require('./alcopa')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    await scrape({ onPage: makeOnPage(total) })
    console.log(`\nDone. Upserted ${total.count} listings.`)

    // Backfill: re-check past auction listings that are no longer in the
    // search results to detect ADJUGÉ on their detail pages.
    try {
      const pending = await getPastUnsoldAlcopa({ days: 7 })
      if (pending.length > 0) {
        console.log(`[alcopa] backfilling sold status for ${pending.length} past listings...`)
        const soldIds = []
        for (const row of pending) {
          try {
            const sold = await checkSold(row.url)
            if (sold) {
              soldIds.push(row.id)
              console.log(`  [${row.external_id}] ADJUGÉ`)
            }
          } catch (err) {
            console.error(`  ! backfill failed for ${row.external_id}: ${err.message}`)
          }
          await new Promise(r => setTimeout(r, 500))
        }
        if (soldIds.length > 0) {
          const n = await markSold(soldIds)
          console.log(`[alcopa] marked ${n} listings as sold.`)
        }
      }
    } catch (err) {
      console.error('Failed alcopa sold backfill:', err.message)
    }

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

program
  .command('backfill-geo')
  .description('Geocode all listings without lat/lng (batched by distinct location)')
  .action(async () => {
    const client = await pool.connect()
    try {
      const { rows: locations } = await client.query(
        `SELECT location, COUNT(*) AS n
           FROM listings
          WHERE location IS NOT NULL
            AND (latitude IS NULL OR longitude IS NULL)
            AND removed_at IS NULL
          GROUP BY location
          ORDER BY n DESC`
      )
      console.log(`[geo] ${locations.length} distinct locations to geocode`)
      let hit = 0, miss = 0
      for (let i = 0; i < locations.length; i++) {
        const { location, n } = locations[i]
        try {
          const coords = await geocode(client, location)
          if (coords) {
            await client.query(
              `UPDATE listings SET latitude = $1, longitude = $2
                WHERE location = $3 AND latitude IS NULL`,
              [coords.lat, coords.lng, location]
            )
            hit++
            console.log(`  [${i + 1}/${locations.length}] ${location} → ${coords.lat.toFixed(3)},${coords.lng.toFixed(3)} (${n} listings)`)
          } else {
            miss++
            console.log(`  [${i + 1}/${locations.length}] ${location} → no result (${n} listings)`)
          }
        } catch (err) {
          miss++
          console.error(`  [${i + 1}/${locations.length}] ${location} → ERROR ${err.message}`)
        }
      }
      console.log(`\n[geo] done. hits=${hit} misses=${miss}`)
    } finally {
      client.release()
    }
    await refreshDelta()
    await pool.end()
  })

program.parseAsync(process.argv).catch(err => {
  console.error(err)
  process.exit(1)
})
