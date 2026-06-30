#!/usr/bin/env node
'use strict'

const { Command } = require('commander')
const { upsert, pool, refreshDelta, markRemovedByAge, getPastUnsoldAlcopa, markSold, getKnownSoldIds } = require('./db')
const { geocode, countryFor } = require('./geocode')

const PAGINATED_SOURCES = new Set(['leboncoin', 'lacentrale'])
const STALE_DAYS_DEFAULT = 3
const STALE_DAYS_PAGINATED = 7

// Fixed-height progress display: one bar per worker slot (never more than the
// terminal can hold), with finished items printed as permanent lines above.
// Renders only via process.stdout.write — keep all console output buffered
// elsewhere so nothing else touches the terminal while bars are live.
function createSlotProgress(slotCount) {
  const tty = process.stdout.isTTY
  const BAR = 20
  const slots = new Array(slotCount).fill(null)
  let painted = false

  const bar = (step, total) => {
    const f = total > 0 ? Math.round((step / total) * BAR) : 0
    return '█'.repeat(f) + '░'.repeat(BAR - f)
  }
  const line = s => s
    ? ` ${s.flag} ${s.market.padEnd(3)} |${bar(s.step, s.total)}| ${s.step}/${s.total}  ${s.label}`
    : ''
  const draw = up => {
    if (up) process.stdout.write(`\x1b[${slotCount}A`)
    for (const s of slots) process.stdout.write('\x1b[2K' + line(s) + '\n')
  }

  return {
    update(slot, state) {
      slots[slot] = state
      if (!tty) return
      if (!painted) { painted = true; process.stdout.write('\x1b[?25l'); draw(false) }
      else draw(true)
    },
    log(text) {
      if (!tty || !painted) { process.stdout.write(text + '\n'); return }
      process.stdout.write(`\x1b[${slotCount}A\x1b[2K` + text + '\n')
      for (const s of slots) process.stdout.write('\x1b[2K' + line(s) + '\n')
    },
    stop() {
      // Erase the transient bar block — every finished market is already a
      // permanent line above it — and restore the cursor.
      if (tty && painted) process.stdout.write(`\x1b[${slotCount}A\x1b[0J\x1b[?25h`)
    },
  }
}

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
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  const t0 = Date.now()
  let i = 0
  const spinner = setInterval(() => {
    const secs = ((Date.now() - t0) / 1000).toFixed(0)
    process.stdout.write(`\r${frames[i++ % frames.length]} refreshing listings_with_delta... ${secs}s`)
  }, 100)
  try {
    await refreshDelta()
    clearInterval(spinner)
    process.stdout.write('\r\x1b[K')
    console.log('Refreshed listings_with_delta.')
  } catch (err) {
    clearInterval(spinner)
    process.stdout.write('\r\x1b[K')
    console.error('Failed to refresh listings_with_delta:', err.message)
  }
  await pool.end()
}

function makeOnPage(total, { quiet = false } = {}) {
  return async (listings) => {
    const n = await upsert(listings, { quiet })
    total.count += n
    if (!quiet) console.log(`  [db] upserted ${n} (total so far: ${total.count})`)
    return n
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
  .option('--models <list>', 'comma-separated models (m3,my,ms,mx,ct)', 'm3,my,ms,mx,ct')
  .option('--markets <list>', 'comma-separated markets, or "all" for every supported market', 'fr')
  .option('--concurrency <n>', 'markets to scrape in parallel', v => parseInt(v, 10), 5)
  .action(async ({ models, markets, concurrency }) => {
    const { scrape, MARKETS } = require('./tesla')
    const modelList = models.split(',')
    const marketList = markets === 'all' ? Object.keys(MARKETS) : markets.split(',')
    const total = { count: 0 }
    const runStart = new Date().toISOString()

    const prog = createSlotProgress(Math.min(concurrency, marketList.length))

    // The progress renderer owns the terminal — buffer all other console output
    // during the scrape and replay it once the bars are stopped.
    const buffered = []
    const realConsole = { log: console.log, warn: console.warn, error: console.error }
    console.log = (...a) => buffered.push(['log', a])
    console.warn = (...a) => buffered.push(['warn', a])
    console.error = (...a) => buffered.push(['error', a])

    try {
      await scrape({
        models: modelList,
        markets: marketList,
        concurrency,
        onPage: makeOnPage(total, { quiet: true }),
        onProgress: (mk, ev) => {
          if (ev.label.startsWith('done')) {
            prog.update(ev.slot, null)
            prog.log(`✓ ${ev.flag} ${ev.market}  ${ev.label}`)
          } else {
            prog.update(ev.slot, {
              flag: ev.flag, market: ev.market,
              step: ev.step, total: ev.totalSteps, label: ev.label.slice(0, 36),
            })
          }
        },
      })
    } finally {
      prog.stop()
      Object.assign(console, realConsole)
      for (const [level, args] of buffered) realConsole[level](...args)
    }

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
  .command('nikola')
  .description('Scrape Nikola Brussels Tesla listings')
  .action(async () => {
    const { scrape } = require('./nikola')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    const knownSoldIds = await getKnownSoldIds('nikola')
    await scrape({ onPage: makeOnPage(total), knownSoldIds })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('nikola', runStart, total)
  })

program
  .command('mmxbv')
  .description('Scrape MMX B.V. Tesla listings via wp-json API')
  .action(async () => {
    const { scrape } = require('./mmxbv')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    const knownSoldIds = await getKnownSoldIds('mmxbv')
    await scrape({ onPage: makeOnPage(total), knownSoldIds })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('mmxbv', runStart, total)
  })

program
  .command('ewigo')
  .description('Scrape Ewigo Tesla listings via Inertia data-page JSON')
  .action(async () => {
    const { scrape } = require('./ewigo')
    const total = { count: 0 }
    const runStart = new Date().toISOString()
    const knownSoldIds = await getKnownSoldIds('ewigo')
    await scrape({ onPage: makeOnPage(total), knownSoldIds })
    console.log(`\nDone. Upserted ${total.count} listings.`)
    await finalize('ewigo', runStart, total)
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
        `SELECT location, source, COUNT(*) AS n
           FROM listings
          WHERE location IS NOT NULL
            AND (latitude IS NULL OR longitude IS NULL)
            AND removed_at IS NULL
          GROUP BY location, source
          ORDER BY n DESC`
      )
      console.log(`[geo] ${locations.length} distinct (location, source) pairs to geocode`)
      let hit = 0, miss = 0
      for (let i = 0; i < locations.length; i++) {
        const { location, source, n } = locations[i]
        const country = countryFor(source)
        try {
          const coords = await geocode(client, location, country)
          if (coords) {
            await client.query(
              `UPDATE listings SET latitude = $1, longitude = $2
                WHERE location = $3 AND source = $4 AND latitude IS NULL`,
              [coords.lat, coords.lng, location, source]
            )
            hit++
            console.log(`  [${i + 1}/${locations.length}] ${location} [${country}] → ${coords.lat.toFixed(3)},${coords.lng.toFixed(3)} (${n} listings)`)
          } else {
            miss++
            console.log(`  [${i + 1}/${locations.length}] ${location} [${country}] → no result (${n} listings)`)
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
