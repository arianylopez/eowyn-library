import { sleep } from 'k6';
import { setupData, expect, getBooks, getCategories, pick } from '../lib/common.js';

/**
 * S2 - Carga de lectura de catálogo.
 * 50 VUs: 70% GET /api/books y 30% GET /api/categories, con paginación
 * variable y tiempo de pensar entre 0,5 y 1,5 s.
 */
export const options = {
  scenarios: {
    catalog_read: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:GET /api/books}': ['p(95)<300', 'p(99)<600'],
    'http_req_duration{endpoint:GET /api/categories}': ['p(95)<300', 'p(99)<600'],
  },
  tags: { scenario: 'catalog-load' },
};

export function setup() {
  return setupData();
}

export default function (data) {
  const token = data.adminToken;
  const page = 1 + Math.floor(Math.random() * 3);
  const limit = pick([5, 10, 20]);

  if (Math.random() < 0.7) {
    expect('listar libros', getBooks(token, page, limit), 200);
  } else {
    expect('listar categorías', getCategories(token, page, limit), 200);
  }

  sleep(0.5 + Math.random());
}
