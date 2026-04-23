'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const BATCH_SIZE = 30

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace('?sslmode=require', ''),
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync(path.join(__dirname, '..', 'supabase-ca.crt')),
  },
  options: '-c idle_in_transaction_session_timeout=30000',
})

function inferSoh(row) {
  const hay = `${row.title ?? ''} ${row.version ?? ''}`
  const m = hay.match(/soh\s*([\d]+[,.]?\d*)\s*%/i)
  if (!m) return null
  return parseFloat(m[1].replace(',', '.'))
}

function inferDrivetrain(row) {
  const hay = `${row.title ?? ''} ${row.version ?? ''}`.toLowerCase()
  if (/plaid/.test(hay)) return 'Plaid'
  if (/performance|pup\b/.test(hay)) return 'Performance'
  if (/\bawd\b|dual.motor|grande.autonomie|long.?range|transmission.int[eé]grale/.test(hay)) return 'AWD'
  if (/\brwd\b|propulsion|standard.?plus|standard.?range|\bstandard\b|single.motor/.test(hay)) return 'RWD'
  return null
}

async function upsertBatch(client, rows, now) {
  // Step 1: fetch prior prices for all rows in this batch
  const priorRes = await client.query(
    `SELECT l.source, l.external_id, l.price_eur
     FROM listings l
     JOIN (SELECT unnest($1::text[]) s, unnest($2::text[]) e) pairs
       ON l.source = pairs.s AND l.external_id = pairs.e`,
    [rows.map(r => r.source), rows.map(r => r.external_id)]
  )
  const priorMap = new Map(priorRes.rows.map(r => [`${r.source}:${r.external_id}`, r.price_eur]))

  // Step 2: batch upsert all listings
  const upsertRes = await client.query(
    `INSERT INTO listings
      (source, external_id, title, make, model, version, price_eur, year,
       mileage_km, fuel, gearbox, location, url, image_url, scraped_at,
       drivetrain, soh, color, horse_power, doors, seats, autopilot)
     SELECT
       unnest($1::text[]),  unnest($2::text[]),  unnest($3::text[]),
       unnest($4::text[]),  unnest($5::text[]),  unnest($6::text[]),
       unnest($7::numeric[]), unnest($8::int[]),
       unnest($9::int[]),   unnest($10::text[]), unnest($11::text[]),
       unnest($12::text[]), unnest($13::text[]), unnest($14::text[]),
       unnest($15::timestamptz[]),
       unnest($16::text[]), unnest($17::numeric[]),
       unnest($18::text[]), unnest($19::int[]),  unnest($20::int[]),
       unnest($21::int[]),  unnest($22::text[])
     ON CONFLICT (source, external_id) DO UPDATE SET
       title       = EXCLUDED.title,
       price_eur   = EXCLUDED.price_eur,
       year        = EXCLUDED.year,
       mileage_km  = EXCLUDED.mileage_km,
       fuel        = EXCLUDED.fuel,
       gearbox     = EXCLUDED.gearbox,
       location    = EXCLUDED.location,
       url         = EXCLUDED.url,
       image_url   = EXCLUDED.image_url,
       scraped_at  = EXCLUDED.scraped_at,
       drivetrain  = EXCLUDED.drivetrain,
       soh         = EXCLUDED.soh,
       color       = EXCLUDED.color,
       horse_power = EXCLUDED.horse_power,
       doors       = EXCLUDED.doors,
       seats       = EXCLUDED.seats,
       autopilot   = EXCLUDED.autopilot
     RETURNING id, source, external_id, price_eur`,
    [
      rows.map(r => r.source),
      rows.map(r => r.external_id),
      rows.map(r => r.title),
      rows.map(r => r.make ?? null),
      rows.map(r => r.model ?? null),
      rows.map(r => r.version ?? null),
      rows.map(r => r.price_eur ?? null),
      rows.map(r => r.year ?? null),
      rows.map(r => r.mileage_km ?? null),
      rows.map(r => r.fuel ?? null),
      rows.map(r => r.gearbox ?? null),
      rows.map(r => r.location ?? null),
      rows.map(r => r.url),
      rows.map(r => r.image_url ?? null),
      rows.map(() => now),
      rows.map(r => inferDrivetrain(r)),
      rows.map(r => inferSoh(r)),
      rows.map(r => r.color ?? null),
      rows.map(r => r.horse_power ?? null),
      rows.map(r => r.doors ?? null),
      rows.map(r => r.seats ?? null),
      rows.map(r => r.autopilot ?? null),
    ]
  )

  const idMap = new Map(upsertRes.rows.map(r => [`${r.source}:${r.external_id}`, r.id]))

  // Step 3: bulk insert price history only for rows whose price changed
  const changed = rows.filter(r => {
    const prior = priorMap.get(`${r.source}:${r.external_id}`)
    return prior === undefined || prior !== r.price_eur
  })
  if (changed.length > 0) {
    await client.query(
      `INSERT INTO price_history (listing_id, price_eur, recorded_at)
       SELECT unnest($1::int[]), unnest($2::numeric[]), unnest($3::timestamptz[])`,
      [
        changed.map(r => idMap.get(`${r.source}:${r.external_id}`)),
        changed.map(r => r.price_eur ?? null),
        changed.map(() => now),
      ]
    )
  }

  // Step 4: photos (per-row, only when provided)
  for (const row of rows) {
    if (!row._photos || row._photos.length === 0) continue
    const id = idMap.get(`${row.source}:${row.external_id}`)
    if (!id) continue
    await client.query('DELETE FROM listing_photos WHERE listing_id = $1', [id])
    for (let i = 0; i < row._photos.length; i++) {
      await client.query(
        'INSERT INTO listing_photos (listing_id, url, sort_order) VALUES ($1, $2, $3)',
        [id, row._photos[i], i]
      )
    }
  }

  return upsertRes.rows.length
}

async function upsert(rows) {
  if (!rows.length) return 0
  const now = new Date().toISOString()
  let count = 0
  const total = rows.length
  process.stdout.write(`  upserting 0/${total}`)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL statement_timeout = 0')
      await upsertBatch(client, batch, now)
      await client.query('COMMIT')
      count += batch.length
      process.stdout.write(`\r  upserting ${count}/${total}`)
    } catch (err) {
      try { await client.query('ROLLBACK') } catch (_) {}
      client.release(true)
      throw err
    }
    client.release()
  }

  process.stdout.write('\n')
  return count
}

module.exports = { pool, upsert }
