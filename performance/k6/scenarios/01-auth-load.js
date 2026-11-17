import { sleep } from 'k6';
import { setupData, expect, login, PERF, pick } from '../lib/common.js';

/**
 * S1 - Carga de autenticación.
 * 10 usuarios virtuales sostenidos durante 3 minutos sobre POST /api/auth/login.
 * El costo dominante es bcrypt, por eso los umbrales son más holgados que
 * los de lectura.
 */
export const options = {
  scenarios: {
    auth_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '3m', target: 10 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:POST /api/auth/login}': [
      'p(95)<800',
      'p(99)<1500',
    ],
  },
  tags: { scenario: 'auth-load' },
};

export function setup() {
  return setupData();
}

export default function (data) {
  const index = ((__VU - 1) % PERF.userCount) + 1;
  const res = login(PERF.email(index), PERF.password);
  expect('login', res, 200);
  sleep(1);
}
