# eowyn-library

API REST de gestión de biblioteca (usuarios, categorías, libros y préstamos)
construida con Node.js + TypeScript + Express + PostgreSQL (Knex).

Repositorio base: <https://github.com/arianylopez/eowyn-library.git>

## Requisitos previos

| Herramienta | Versión usada en el entorno de QA |
|---|---|
| Node.js | 20.20.2 |
| npm | 10.8.2 |
| Docker Desktop | 29.4.0 |
| Docker Compose | v5.1.1 |
| PostgreSQL (contenedor) | 15.3 |
| k6 | 2.3.0 |
| JDK | 21 |
| Maven | 3.9.16 |

## Instalación

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/arianylopez/eowyn-library.git
   cd eowyn-library
   ```

2. Crear el archivo `.env` a partir de la plantilla y completar las variables:

   ```bash
   cp .env.template .env
   ```

   Valores usados en el entorno de pruebas:

   ```env
   PORT=3000
   NODE_ENV=development
   PG_URL=postgres://gandalf:123456@localhost:5433/eowyn-library
   JWT_SEED=eowyn-library-qa2-secret-2026
   TOKEN_EXPIRES_IN=2h
   ```

   > El puerto del host es **5433** porque el 5432 ya está ocupado por otro
   > contenedor en el equipo. Debe coincidir con `docker-compose.yml`.

3. Instalar dependencias:

   ```bash
   npm install
   ```

4. Levantar PostgreSQL con Docker Compose:

   ```bash
   docker compose up -d
   docker compose ps          # verificar que esté "healthy"
   ```

5. Ejecutar las migraciones existentes:

   ```bash
   npm run migrate:latest
   ```

6. Iniciar el proyecto en modo desarrollo:

   ```bash
   npm run dev
   ```

   La API queda disponible en <http://localhost:3000>. Verificación rápida:

   ```bash
   curl -i http://localhost:3000/api/categories   # debe responder 401 sin token
   ```

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Levanta la API en modo desarrollo con recarga automática |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Compila y ejecuta la versión de producción |
| `npm run migrate:make -- <nombre>` | Crea una migración nueva |
| `npm run migrate:latest` | Ejecuta las migraciones pendientes |

## Usuarios y datos iniciales

Las migraciones insertan datos semilla:

| Usuario | Correo | Contraseña | Rol |
|---|---|---|---|
| Admin | `admin@example.com` | `123456` | `ADMIN_ROLE` |
| Gandalf | `gandalf@example.com` | `123456` | `USER_ROLE` |

También se crean 15 categorías y 15 libros de ejemplo.

## Pruebas de rendimiento

Antes de ejecutar cualquier escenario hay que crear los datos de prueba:

```bash
node performance/scripts/seed-perf-data.js
```

Escenarios k6 disponibles en `performance/k6/scenarios/`:

| Archivo | Escenario |
|---|---|
| `00-smoke.js` | Humo: valida entorno y flujos completos |
| `01-auth-load.js` | Carga de login (10 VUs, 3 min) |
| `02-catalog-load.js` | Lectura de catálogo (50 VUs, 5 min) |
| `03-mixed-crud.js` | Carga mixta con escrituras (20 VUs, 8 min) |
| `04-loan-contention.js` | Contención de préstamos sobre un libro (30 VUs, 5 min) |
| `05-stress.js` | Estrés hasta 100 VUs |
| `06-spike.js` | Pico de 10 a 100 VUs |
| `07-soak.js` | Resistencia (20 VUs, 30 min) |

```bash
k6 run performance/k6/scenarios/00-smoke.js
k6 run performance/k6/scenarios/02-catalog-load.js
```

Simulaciones Gatling en `performance/gatling/`:

```bash
cd performance/gatling
./run.sh SmokeSimulation       # validación rápida
./run.sh CatalogLoadSimulation # S2
./run.sh AuthLoadSimulation    # S1
./run.sh LoanCycleSimulation   # S4
./run.sh MixedLoadSimulation   # S3
```

Para medir CPU y memoria durante una prueba (usar el mismo nombre que el
resumen para que el dashboard lo incluya):

```bash
./performance/scripts/monitor.sh performance/results/k6/02-catalog-load-resources.csv 420 2
```

Para generar el dashboard HTML con todos los resultados:

```bash
npm run perf:report
open performance/results/report.html
```

Los reportes de Gatling se generan solos en
`performance/gatling/target/gatling/<simulación>-<fecha>/index.html` y se abren
automáticamente al terminar `./run.sh`.

Para limpiar los datos generados:

```bash
node performance/scripts/reset-perf-data.js
```

## Solución de problemas

- **`ECONNREFUSED 127.0.0.1:5433`**: PostgreSQL no está levantado o el puerto no
  coincide. Ejecutar `docker compose up -d` y revisar `PG_URL`.
- **`port is already allocated` al hacer `docker compose up`**: otro servicio usa
  el 5433. Cambiar el mapeo en `docker-compose.yml` y `PG_URL` a la vez.
- **`database "eowyn-library" does not exist`**: el volumen `./postgres` está
  vacío o corrupto; ejecutar las migraciones con `npm run migrate:latest`.
- **401 en todos los endpoints**: falta el header
  `Authorization: Bearer <token>`; obtener el token con `POST /api/auth/login`.
