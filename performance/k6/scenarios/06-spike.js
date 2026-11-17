import { sleep } from 'k6';
import { setupData, expect, getBooks, getCategories, login, pick, PERF } from '../lib/common.js';

/**
 * S6 - Prueba de pico (spike).
 * Línea base de 10 VUs, salto a 100 VUs en 10 s, meseta de 45 s y retorno
 * a 10 VUs. Evalúa la recuperación del servicio tras la sobrecarga.
 */
export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '10s', target: 100 },
        { duration: '45s', target: 100 },
        { duration: '15s', target: 10 },
        { duration: '2m', target: 10 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    checks: ['rate>0.90'],
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<2000'],
  },
  tags: { scenario: 'spike' },
};

export function setup() {
  return setupData();
}

export default function (data) {
  if (Math.random() < 0.9) {
    if (Math.random() < 0.7) {
      expect(
        'listar libros',
        getBooks(data.adminToken, 1 + Math.floor(Math.random() * 3), pick([5, 10, 20])),
        200
      );
    } else {
      expect('listar categorías', getCategories(data.adminToken, 1, 10), 200);
    }
  } else {
    const index = ((__VU - 1) % PERF.userCount) + 1;
    expect('login', login(PERF.email(index), PERF.password), 200);
  }

  sleep(0.2 + Math.random() * 0.6);
}
