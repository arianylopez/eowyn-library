import { sleep } from 'k6';
import {
  setupData,
  expect,
  vuUser,
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
  pick,
  PERF,
} from '../lib/common.js';

/**
 * S3 - Carga mixta (lecturas + escrituras + préstamos).
 * 20 VUs durante 8 minutos con la siguiente distribución:
 *   45% GET /api/books
 *   20% GET /api/categories
 *   10% POST + DELETE /api/categories
 *   15% POST + DELETE /api/books
 *   10% POST /api/loans + PUT /api/loans/:id/return
 */
export const options = {
  scenarios: {
    mixed_crud: {
      executor: 'constant-vus',
      vus: 20,
      duration: '8m',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    checks: ['rate>0.98'],
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<600', 'p(99)<1200'],
  },
  tags: { scenario: 'mixed-crud' },
};

export function setup() {
  return setupData();
}

export default function (data) {
  const { adminToken, bookIds, categoryIds } = data;
  const user = vuUser(data);
  const dice = Math.random();

  if (dice < 0.45) {
    expect(
      'listar libros',
      getBooks(adminToken, 1 + Math.floor(Math.random() * 3), pick([5, 10, 20])),
      200
    );
  } else if (dice < 0.65) {
    expect(
      'listar categorías',
      getCategories(adminToken, 1 + Math.floor(Math.random() * 2), pick([5, 10])),
      200
    );
  } else if (dice < 0.75) {
    const res = createCategory(
      adminToken,
      unique('MIX-CAT'),
      'Categoría temporal generada por la prueba mixta'
    );
    expect('crear categoría', res, 201);
    if (res.status === 201) {
      expect('eliminar categoría', deleteCategory(adminToken, res.json('id')), 204);
    }
  } else if (dice < 0.90) {
    const res = createBook(adminToken, {
      title: unique('MIX-BOOK'),
      author: 'Mixed Load Author',
      isbn: unique('MIXISBN'),
      publicationYear: 2021,
      categoryId: pick(categoryIds),
      totalQuantity: 2,
      availableQuantity: 2,
    });
    expect('crear libro', res, 201);
    if (res.status === 201) {
      expect('eliminar libro', deleteBook(adminToken, res.json('id')), 204);
    }
  } else {
    const loanRes = createLoan(user.token, user.userId, pick(bookIds), futureDate(7));
    expect('crear préstamo', loanRes, 201);
    if (loanRes.status === 201) {
      expect('devolver préstamo', returnLoan(user.token, loanRes.json('id')), 200);
    }
  }

  sleep(0.2 + Math.random() * 0.8);
}
