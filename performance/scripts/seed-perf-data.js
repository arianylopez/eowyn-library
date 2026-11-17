#!/usr/bin/env node
/**
 * Prepara los datos de prueba de rendimiento de eowyn-library.
 *
 * Crea (de forma idempotente):
 *   - 30 usuarios  perf.userNN@eowyn.test / 123456  (rol USER_ROLE)
 *   - 5 categorías PERF Category N
 *   - 60 libros    PERF Book NNN  (isbn PERF############, 1000 copias cada uno)
 *
 * Además genera el feeder CSV que usa Gatling:
 *   performance/gatling/src/test/resources/perf-users.csv
 *
 * Uso:
 *   node performance/scripts/seed-perf-data.js
 *   node performance/scripts/seed-perf-data.js --reset   (limpia y vuelve a crear)
 */
'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PG_URL = process.env.PG_URL;
if (!PG_URL) {
  console.error('ERROR: PG_URL no está definida en .env');
  process.exit(1);
}

const USERS = 30;
const BOOKS = 60;
const CATEGORIES = 5;
const PASSWORD = '123456';
const USER_PREFIX = 'perf.user';
const USER_DOMAIN = '@eowyn.test';
const CATEGORY_PREFIX = 'PERF Category ';
const BOOK_PREFIX = 'PERF Book ';
const ISBN_PREFIX = 'PERF';
const CATEGORY_FOR_BOOKS = 1; // se reemplaza por el id real de la primera categoría PERF

const userEmail = (i) => `${USER_PREFIX}${String(i).padStart(2, '0')}${USER_DOMAIN}`;

async function reset(client) {
  await client.query('BEGIN');
  try {
    await client.query(
      `DELETE FROM loans
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
           OR book_id IN (SELECT id FROM books WHERE isbn LIKE $2)`,
      [`${USER_PREFIX}%${USER_DOMAIN}`, `${ISBN_PREFIX}%`]
    );
    await client.query('DELETE FROM books WHERE isbn LIKE $1', [`${ISBN_PREFIX}%`]);
    await client.query('DELETE FROM categories WHERE name LIKE $1', [`${CATEGORY_PREFIX}%`]);
    await client.query('DELETE FROM users WHERE email LIKE $1', [`${USER_PREFIX}%${USER_DOMAIN}`]);
    await client.query('COMMIT');
    console.log('Datos de rendimiento eliminados.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();

  try {
    if (process.argv.includes('--reset')) {
      await reset(client);
    }

    // Usuario administrador (creado por las migraciones).
    const admin = await client.query('SELECT id, email FROM users WHERE email = $1', [
      'admin@example.com',
    ]);
    if (admin.rowCount === 0) {
      throw new Error('No existe admin@example.com. Ejecuta npm run migrate:latest.');
    }
    const adminId = admin.rows[0].id;

    // -------------------- Usuarios --------------------
    const hash = await bcrypt.hash(PASSWORD, 10);
    const users = [];
    for (let i = 1; i <= USERS; i++) {
      const email = userEmail(i);
      const result = await client.query(
        `INSERT INTO users (name, email, password, role, "emailValidated")
         VALUES ($1, $2, $3, '{USER_ROLE}', true)
         ON CONFLICT (email) DO UPDATE
           SET password = EXCLUDED.password,
               role = EXCLUDED.role,
               "emailValidated" = true
         RETURNING id, email`,
        [`Perf User ${String(i).padStart(2, '0')}`, email, hash]
      );
      users.push({ ...result.rows[0], password: PASSWORD });
    }

    // -------------------- Categorías --------------------
    const categories = [];
    for (let i = 1; i <= CATEGORIES; i++) {
      const name = `${CATEGORY_PREFIX}${i}`;
      const result = await client.query(
        `INSERT INTO categories (name, description, user_id, is_deleted)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (name) DO UPDATE
           SET description = EXCLUDED.description,
               is_deleted = false
         RETURNING id, name`,
        [name, `Categoría de pruebas de rendimiento ${i}`, adminId]
      );
      categories.push(result.rows[0]);
    }

    // -------------------- Libros --------------------
    const books = [];
    for (let i = 1; i <= BOOKS; i++) {
      const isbn = `${ISBN_PREFIX}${String(i).padStart(12, '0')}`;
      const title = `${BOOK_PREFIX}${String(i).padStart(3, '0')}`;
      const result = await client.query(
        `INSERT INTO books
           (title, author, isbn, publication_year, category_id, user_id,
            total_quantity, available_quantity, is_deleted)
         VALUES ($1, $2, $3, 2020, $4, $5, 1000, 1000, false)
         ON CONFLICT (isbn) DO UPDATE
           SET title = EXCLUDED.title,
               author = EXCLUDED.author,
               category_id = EXCLUDED.category_id,
               is_deleted = false
         RETURNING id, title, isbn`,
        [title, 'Perf Author', isbn, categories[0].id, adminId]
      );
      books.push(result.rows[0]);
    }

    // Restablece el stock solo de libros sin préstamos activos.
    await client.query(
      `UPDATE books b
          SET total_quantity = 1000,
              available_quantity = 1000
        WHERE b.isbn LIKE $1
          AND NOT EXISTS (
            SELECT 1 FROM loans l
             WHERE l.book_id = b.id AND l.status IN ('ongoing', 'overdue')
          )`,
      [`${ISBN_PREFIX}%`]
    );

    // -------------------- Feeder de Gatling --------------------
    const csvPath = path.resolve(
      __dirname,
      '../gatling/src/test/resources/perf-users.csv'
    );
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.writeFileSync(
      csvPath,
      ['email,password,userId']
        .concat(users.map((u) => `${u.email},${u.password},${u.id}`))
        .join('\n') + '\n'
    );

    console.log('Datos de rendimiento listos.');
    console.log(`  Usuarios   : ${users.length} (${userEmail(1)} ... ${userEmail(USERS)})`);
    console.log(`  Categorías : ${categories.length} (ids: ${categories.map((c) => c.id).join(', ')})`);
    console.log(`  Libros     : ${books.length} (ids: ${books[0].id} ... ${books[books.length - 1].id})`);
    console.log(`  Feeder     : ${path.relative(process.cwd(), csvPath)}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('ERROR preparando datos de rendimiento:', error.message);
  process.exit(1);
});
