import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import {
  setupData,
  vuUser,
  createLoan,
  returnLoan,
  futureDate,
  expect,
  BASE_URL,
  jsonHeaders,
} from '../lib/common.js';

/**
 * S4 - Contención sobre un mismo libro.
 * 30 VUs crean y devuelven préstamos del MISMO libro durante 5 minutos.
 * Ejercita el SELECT ... FOR UPDATE y las transacciones de stock.
 * Un 400 "sin copias" o "préstamo activo" es un resultado de negocio válido,
 * por eso se marca como estado esperado y no como fallo HTTP.
 */
const rejected = new Counter('loan_rejected');

export const options = {
  scenarios: {
    loan_contention: {
      executor: 'constant-vus',
      vus: 30,
      duration: '5m',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:POST /api/loans}': ['p(95)<800', 'p(99)<1500'],
    'http_req_duration{endpoint:PUT /api/loans/:id/return}': ['p(95)<800', 'p(99)<1500'],
  },
  tags: { scenario: 'loan-contention' },
};

export function setup() {
  return setupData();
}

export default function (data) {
  const user = vuUser(data);
  const bookId = data.bookIds[0];

  const res = http.post(
    `${BASE_URL}/api/loans`,
    JSON.stringify({ userId: user.userId, bookId, dueDate: futureDate(7) }),
    {
      ...jsonHeaders(user.token),
      tags: { endpoint: 'POST /api/loans' },
      responseCallback: http.expectedStatuses(201, 400),
    }
  );

  if (res.status === 201) {
    expect('devolver préstamo', returnLoan(user.token, res.json('id')), 200);
  } else {
    check(res, {
      'rechazo de negocio esperado': (r) => r.status === 400 &&
        /has no available copies|already has an active loan|maximum number of active loans/.test(r.body),
    });
    rejected.add(1);
  }

  sleep(0.1);
}
