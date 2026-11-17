import { sleep } from 'k6';
import { setupData, expect, login, getBooks, getCategories, pick, PERF } from '../lib/common.js';

/**
 * S5 - Prueba de estrés / punto de quiebre.
 * Rampa progresiva de 10 a 100 VUs en 8 minutos, meseta de 2 minutos y bajada.
 * El objetivo no es aprobar umbrales estrictos sino identificar a partir de
 * qué nivel de concurrencia se degrada el servicio.
 */
export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '3m', target: 30 },
        { duration: '3m', target: 60 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    checks: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
  tags: { scenario: 'stress' },
};

export function setup() {
  return setupData();
}

export default function (data) {
  if (Math.random() < 0.8) {
    const page = 1 + Math.floor(Math.random() * 4);
    if (Math.random() < 0.7) {
      expect('listar libros', getBooks(data.adminToken, page, pick([5, 10, 20])), 200);
    } else {
      expect('listar categorías', getCategories(data.adminToken, page, 10), 200);
    }
  } else {
    const index = ((__VU - 1) % PERF.userCount) + 1;
    expect('login', login(PERF.email(index), PERF.password), 200);
  }

  sleep(0.3 + Math.random() * 0.7);
}
