import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const email = __ENV.ADMIN_EMAIL || 'admin@example.com';
const password = __ENV.ADMIN_PASSWORD || '123456';

export const options = {
  stages: [
    { duration: '5s', target: 1 }, // Carga inicial
    { duration: '3s', target: 5 }, // Subida rápida
    { duration: '7s', target: 5 }, // Mantiene el pico
    { duration: '3s', target: 1 }, // Baja rápidamente
    { duration: '7s', target: 1 }, // Recuperación
    { duration: '3s', target: 0 }, // Finaliza
  ],
  thresholds: {
    checks: ['rate>0.90'],
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<2000'],
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
