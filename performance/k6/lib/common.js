import http from 'k6/http';
import { check } from 'k6';

// ---------------------------------------------------------------------------
// Configuración general
// ---------------------------------------------------------------------------
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const ADMIN = {
  email: __ENV.ADMIN_EMAIL || 'admin@example.com',
  password: __ENV.ADMIN_PASSWORD || '123456',
};

export const PERF = {
  userCount: 30,
  password: '123456',
  email: (i) => `perf.user${String(i).padStart(2, '0')}@eowyn.test`,
  bookPrefix: 'PERF Book ',
  categoryPrefix: 'PERF Category ',
};

export const jsonHeaders = (token) => ({
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});

export const authHeaders = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});

const tag = (endpoint) => ({ tags: { endpoint } });

// ---------------------------------------------------------------------------
// Operaciones de negocio reutilizables
// ---------------------------------------------------------------------------
export function login(email, password) {
  return http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { ...jsonHeaders(), ...tag('POST /api/auth/login') }
  );
}

export function getBooks(token, page = 1, limit = 10) {
  return http.get(
    `${BASE_URL}/api/books?page=${page}&limit=${limit}`,
    { ...authHeaders(token), ...tag('GET /api/books') }
  );
}

export function getCategories(token, page = 1, limit = 10) {
  return http.get(
    `${BASE_URL}/api/categories?page=${page}&limit=${limit}`,
    { ...authHeaders(token), ...tag('GET /api/categories') }
  );
}

export function createCategory(token, name, description) {
  return http.post(
    `${BASE_URL}/api/categories`,
    JSON.stringify({ name, description }),
    { ...jsonHeaders(token), ...tag('POST /api/categories') }
  );
}

export function deleteCategory(token, id) {
  return http.del(`${BASE_URL}/api/categories/${id}`, null, {
    ...authHeaders(token),
    ...tag('DELETE /api/categories/:id'),
  });
}

export function createBook(token, book) {
  return http.post(`${BASE_URL}/api/books`, JSON.stringify(book), {
    ...jsonHeaders(token),
    ...tag('POST /api/books'),
  });
}

export function deleteBook(token, id) {
  return http.del(`${BASE_URL}/api/books/${id}`, null, {
    ...authHeaders(token),
    ...tag('DELETE /api/books/:id'),
  });
}

export function createLoan(token, userId, bookId, dueDate) {
  return http.post(
    `${BASE_URL}/api/loans`,
    JSON.stringify({ userId, bookId, dueDate }),
    { ...jsonHeaders(token), ...tag('POST /api/loans') }
  );
}

export function returnLoan(token, loanId) {
  return http.put(`${BASE_URL}/api/loans/${loanId}/return`, null, {
    ...authHeaders(token),
    ...tag('PUT /api/loans/:id/return'),
  });
}

export function futureDate(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function unique(prefix) {
  return `${prefix}-${Date.now()}-${__VU}-${__ITER}`;
}

export function expect(name, res, status) {
  return check(res, {
    [`${name} responde ${status}`]: (r) => r.status === status,
  });
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ---------------------------------------------------------------------------
// Setup compartido: valida datos, obtiene tokens y descubre fixtures PERF
// ---------------------------------------------------------------------------
export function setupData() {
  const adminLogin = login(ADMIN.email, ADMIN.password);
  if (adminLogin.status !== 200) {
    throw new Error(
      `No se pudo autenticar al admin (${adminLogin.status}). ` +
        'Verifica que la API esté arriba y las migraciones ejecutadas.'
    );
  }
  const adminToken = adminLogin.json('token');
  if (!adminToken) throw new Error('La respuesta de login no incluyó token.');

  const users = [];
  for (let i = 1; i <= PERF.userCount; i++) {
    const res = login(PERF.email(i), PERF.password);
    if (res.status !== 200) {
      throw new Error(
        `No se pudo autenticar ${PERF.email(i)} (${res.status}). ` +
          'Ejecuta: node performance/scripts/seed-perf-data.js'
      );
    }
    users.push({
      email: PERF.email(i),
      token: res.json('token'),
      userId: res.json('user.id'),
    });
  }

  const booksRes = getBooks(adminToken, 1, 200);
  if (booksRes.status !== 200) {
    throw new Error(`GET /api/books falló en setup (${booksRes.status}).`);
  }
  const bookIds = (booksRes.json('books') || [])
    .filter((b) => String(b.title || '').startsWith(PERF.bookPrefix))
    .map((b) => b.id);

  const categoriesRes = getCategories(adminToken, 1, 100);
  if (categoriesRes.status !== 200) {
    throw new Error(`GET /api/categories falló en setup (${categoriesRes.status}).`);
  }
  const categoryIds = (categoriesRes.json('categories') || [])
    .filter((c) => String(c.name || '').startsWith(PERF.categoryPrefix))
    .map((c) => c.id);

  if (bookIds.length === 0 || categoryIds.length === 0) {
    throw new Error(
      'No se encontraron fixtures PERF. Ejecuta: node performance/scripts/seed-perf-data.js'
    );
  }

  return { adminToken, users, bookIds, categoryIds };
}

// Usuario de rendimiento asignado de forma estable a cada VU (1:1).
export function vuUser(data) {
  return data.users[(__VU - 1) % data.users.length];
}
