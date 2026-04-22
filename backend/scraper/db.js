'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace('?sslmode=require', ''),
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync(path.join(__dirname, '..', 'supabase-ca.crt')),
  },
})

async function upsert(rows) {
  if (!rows.length) return 0
  const client = await pool.connect()
  const now = new Date().toISOString()
  let count = 0
  try {
    await client.query('BEGIN')
    for (const row of rows) {
      const prior = await client.query(
        'SELECT id, price_eur FROM listings WHERE source = $1 AND external_id = $2',
        [row.source, row.external_id]
      )
      const res = await client.query(
        `INSERT INTO listings
          (source, external_id, title, make, model, version, price_eur, year,
           mileage_km, fuel, gearbox, location, url, image_url, scraped_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (source, external_id) DO UPDATE SET
           title      = EXCLUDED.title,
           price_eur  = EXCLUDED.price_eur,
           year       = EXCLUDED.year,
           mileage_km = EXCLUDED.mileage_km,
           fuel       = EXCLUDED.fuel,
           gearbox    = EXCLUDED.gearbox,
           location   = EXCLUDED.location,
           url        = EXCLUDED.url,
           image_url  = EXCLUDED.image_url,
           scraped_at = EXCLUDED.scraped_at
         RETURNING id`,
        [row.source, row.external_id, row.title, row.make, row.model,
         row.version, row.price_eur, row.year, row.mileage_km, row.fuel,
         row.gearbox, row.location, row.url, row.image_url, now]
      )
      const id = res.rows[0].id

      if (row._photos && row._photos.length > 0) {
        await client.query('DELETE FROM listing_photos WHERE listing_id = $1', [id])
        for (let i = 0; i < row._photos.length; i++) {
          await client.query(
            'INSERT INTO listing_photos (listing_id, url, sort_order) VALUES ($1, $2, $3)',
            [id, row._photos[i], i]
          )
        }
      }

      const priorRow = prior.rows[0]
      if (!priorRow || priorRow.price_eur !== row.price_eur) {
        await client.query(
          'INSERT INTO price_history (listing_id, price_eur, recorded_at) VALUES ($1, $2, $3)',
          [id, row.price_eur, now]
        )
      }
      count++
    }
    await client.query('COMMIT')
    return count
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

module.exports = { pool, upsert }
