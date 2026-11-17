#!/usr/bin/env node
/**
 * Elimina todos los datos generados por las pruebas:
 *   - fixtures de rendimiento (usuarios, categorías y libros PERF)
 *   - residuos de smoke, carga mixta y Gatling (prefijos SMOKE/MIX/GTL)
 *   - préstamos asociados a esos usuarios y libros
 *   - usuario manual de pruebas (usuario.qa@example.com)
 *
 * No toca los datos semilla de las migraciones.
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

const PERF_USER = "perf.user%@eowyn.test";
const PERF_BOOK = "PERF%";
const PERF_CATEGORY = "PERF Category %";

async function main() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  try {
    await client.query('BEGIN');

    // Préstamos de cualquier entidad de prueba.
    await client.query(
      `DELETE FROM loans
        WHERE user_id IN (
                SELECT id FROM users
                 WHERE email LIKE $1 OR email = 'usuario.qa@example.com'
              )
           OR book_id IN (
                SELECT id FROM books
                 WHERE isbn LIKE $2
                    OR isbn LIKE 'SMOKEISBN%'
                    OR isbn LIKE 'MIXISBN%'
                    OR isbn LIKE 'GTL%'
                    OR isbn = '9789999000001'
              )`,
      [PERF_USER, PERF_BOOK]
    );

    // Libros de prueba (incluye los que quedaron con borrado lógico).
    await client.query(
      `DELETE FROM books
        WHERE isbn LIKE $1
           OR isbn LIKE 'SMOKEISBN%'
           OR isbn LIKE 'MIXISBN%'
           OR isbn LIKE 'GTL%'
           OR isbn = '9789999000001'
           OR title LIKE 'SMOKE-BOOK-%'
           OR title LIKE 'MIX-BOOK-%'
           OR title LIKE 'GTL-%'
           OR title LIKE 'Libro QA%'`,
      [PERF_BOOK]
    );

    // Categorías de prueba.
    await client.query(
      `DELETE FROM categories
        WHERE name LIKE $1
           OR name LIKE 'SMOKE-CAT-%'
           OR name LIKE 'MIX-CAT-%'
           OR name LIKE 'GTL-%'
           OR name LIKE 'QA Testing%'`,
      [PERF_CATEGORY]
    );

    // Usuarios de prueba.
    await client.query(
      `DELETE FROM users
        WHERE email LIKE $1 OR email = 'usuario.qa@example.com'`,
      [PERF_USER]
    );

    await client.query('COMMIT');
    console.log('Datos de prueba eliminados (fixtures, residuos y préstamos).');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('ERROR eliminando datos de prueba:', error.message);
  process.exit(1);
});
