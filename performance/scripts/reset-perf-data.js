#!/usr/bin/env node
/**
 * Elimina todos los datos generados por seed-perf-data.js.
 *
 * Uso:
 *   node performance/scripts/reset-perf-data.js
 */
'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PG_URL = process.env.PG_URL;
if (!PG_URL) {
  console.error('ERROR: PG_URL no está definida en .env');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM loans
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'perf.user%@eowyn.test')
           OR book_id IN (SELECT id FROM books WHERE isbn LIKE 'PERF%')`
    );
    await client.query("DELETE FROM books WHERE isbn LIKE 'PERF%'");
    await client.query("DELETE FROM categories WHERE name LIKE 'PERF Category %'");
    await client.query("DELETE FROM users WHERE email LIKE 'perf.user%@eowyn.test'");
    await client.query('COMMIT');
    console.log('Datos de rendimiento eliminados.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('ERROR eliminando datos de rendimiento:', error.message);
  process.exit(1);
});
