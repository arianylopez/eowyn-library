import { sleep } from 'k6';
import {
  setupData,
  expect,
  vuUser,
  getBooks,
  getCategories,
  createLoan,
  returnLoan,
  futureDate,
  pick,
} from '../lib/common.js';

/**
 * S7 - Prueba de resistencia (soak).
 * 20 VUs durante 30 minutos con 90% lecturas y 10% ciclo de préstamo.
 * Busca fugas de memoria, degradación progresiva y saturación del pool.
 * La memoria se monitorea en paralelo con performance/scripts/monitor.sh.
 */
export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30m',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<400', 'p(99)<800'],
  },
  tags: { scenario: 'soak' },
};

export function setup() {
  return setupData();
}

export default function (data) {
  const user = vuUser(data);

  if (Math.random() < 0.9) {
    if (Math.random() < 0.75) {
      expect(
        'listar libros',
        getBooks(data.adminToken, 1 + Math.floor(Math.random() * 3), pick([5, 10, 20])),
        200
      );
    } else {
      expect('listar categorías', getCategories(data.adminToken, 1, 10), 200);
    }
  } else {
    const loanRes = createLoan(user.token, user.userId, pick(data.bookIds), futureDate(7));
    expect('crear préstamo', loanRes, 201);
    if (loanRes.status === 201) {
      expect('devolver préstamo', returnLoan(user.token, loanRes.json('id')), 200);
    }
  }

  sleep(0.5 + Math.random());
}
