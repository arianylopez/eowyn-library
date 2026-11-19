import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const email = __ENV.ADMIN_EMAIL || 'admin@example.com';
const password = __ENV.ADMIN_PASSWORD || '123456';

export const options = {
  stages: [
    { duration: '10s', target: 2 }, // Sube a 2 usuarios
    { duration: '10s', target: 5 }, // Sube a 5 usuarios
    { duration: '20s', target: 5 }, // Mantiene la carga
    { duration: '10s', target: 0 }, // Baja a 0 usuarios
  ],
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
  },
};

export function setup() {
  const login = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (login.status !== 200 || !login.json('token')) {
    throw new Error('No se pudo iniciar sesión.');
  }

  return { token: login.json('token') };
}

export default function (data) {
  const libros = http.get(`${baseUrl}/api/books`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });

  check(libros, {
    'libros responde 200': (r) => r.status === 200,
    'respuesta contiene libros': (r) => r.status === 200 && Array.isArray(r.json('books')),
  });

  sleep(1);
}
