import http from 'k6/http';
import { sleep } from 'k6';
import {
  BASE_URL,
  setupData,
  expect,
  login,
  getBooks,
  getCategories,
  createCategory,
  deleteCategory,
  createBook,
  deleteBook,
  createLoan,
  returnLoan,
  futureDate,
  unique,
  ADMIN,
} from '../lib/common.js';

/**
 * S0 - Smoke test.
 * Valida que el entorno, los datos y los flujos críticos funcionen con 1 VU.
 * No mide capacidad: es un requisito previo a cualquier prueba de carga.
 */
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<2500'],
  },
  tags: { scenario: 'smoke' },
};

export function setup() {
  return setupData();
}

export default function (data) {
  const { adminToken, users, bookIds, categoryIds } = data;
  const user = users[0];

  // 1) Login
  expect('login', login(ADMIN.email, ADMIN.password), 200);

  // 2) Autenticación requerida
  const noToken = http.get(`${BASE_URL}/api/books`, {
    tags: { endpoint: 'GET /api/books (sin token)' },
    // El 401 es el resultado esperado: no debe contarse como fallo HTTP.
    responseCallback: http.expectedStatuses(401),
  });
  expect('books sin token', noToken, 401);

  // 3) Lecturas paginadas
  expect('listar libros', getBooks(adminToken, 1, 5), 200);
  expect('listar categorías', getCategories(adminToken, 1, 5), 200);

  // 4) Ciclo categoría
  const catName = unique('SMOKE-CAT');
  const catRes = createCategory(adminToken, catName, 'Categoría creada por el smoke test');
  expect('crear categoría', catRes, 201);
  if (catRes.status === 201) {
    expect('eliminar categoría', deleteCategory(adminToken, catRes.json('id')), 204);
  }

  // 5) Ciclo libro
  const bookRes = createBook(adminToken, {
    title: unique('SMOKE-BOOK'),
    author: 'Smoke Author',
    isbn: unique('SMOKEISBN'),
    publicationYear: 2020,
    categoryId: categoryIds[0],
    totalQuantity: 2,
    availableQuantity: 2,
  });
  expect('crear libro', bookRes, 201);
  if (bookRes.status === 201) {
    expect('eliminar libro', deleteBook(adminToken, bookRes.json('id')), 204);
  }

  // 6) Ciclo préstamo -> devolución
  const loanRes = createLoan(user.token, user.userId, bookIds[0], futureDate(7));
  expect('crear préstamo', loanRes, 201);
  if (loanRes.status === 201) {
    expect('devolver préstamo', returnLoan(adminToken, loanRes.json('id')), 200);
  }

  sleep(1);
}
