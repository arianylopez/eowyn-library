# eowyn-library

API REST de biblioteca con Node.js, TypeScript, Express, PostgreSQL y Knex.
Incluye pruebas funcionales Postman, ocho escenarios k6 y cinco simulaciones Gatling.

## Ejecución en Windows (PowerShell)

Ejecutar desde la raíz del repositorio. Requisitos: Node.js 20 o superior,
Docker Desktop con contenedores Linux, k6 en PATH, JDK 21 y Maven en PATH.
Usar siempre la misma máquina y configuración al comparar ejecuciones.

### 1. Preparar la base y compilar

Abrir Docker Desktop y esperar a que el motor esté listo. Luego:

```powershell
Set-Location 'D:\Documents\UCB\6TO SEMESTRE\SOFTWARE QA 2\PROYECTO QA GRUPO\eowyn-library'
node --version
npm --version
k6 version

# Conserva el .env existente. Si no existe, crea uno con valores locales.
if (-not (Test-Path .env)) { Copy-Item .env.template .env }
npm ci
docker compose up -d --wait
npm run migrate:latest
npm test
npm run perf:seed
```

El `.env` debe apuntar a la base local del compose:

```dotenv
PORT=3000
NODE_ENV=development
PG_URL=postgres://gandalf:123456@localhost:5433/eowyn-library
JWT_SEED=eowyn-local-qa-secret-change-for-deployment
TOKEN_EXPIRES_IN=2h
```

Si `docker compose` no se reconoce, usar el ejecutable de Docker Desktop:

```powershell
& 'C:\Program Files\Docker\Docker\resources\bin\docker-compose.exe' up -d --wait
```

Si Docker muestra `Access is denied` o no conecta con el motor, resolver el
acceso a Docker Desktop antes de continuar. No borrar la carpeta `postgres`.
Las migraciones crean las tablas dentro de una base ya existente; no crean la
base cuando falta. El compose configura esa base al inicializar PostgreSQL.

Usuarios semilla: `admin@example.com` (ADMIN_ROLE) y `gandalf@example.com`
(USER_ROLE), ambos con contraseña `123456`. La preparación de rendimiento crea
30 miembros PERF, 5 categorías y 60 libros; además escribe el CSV de Gatling.

### 2. Verificar concurrencia contra PostgreSQL

Esta prueba usa la base de `.env`, crea registros exclusivos y elimina esos
registros al terminar. Ejecutarla antes de las cargas y solo en la base local de QA.

```powershell
$env:QA_DATABASE_TESTS = '1'
npm test
Remove-Item Env:QA_DATABASE_TESTS
```

Debe terminar con **7 pruebas aprobadas, 0 fallidas, 0 omitidas**.
Sin la variable, se ejecutan seis pruebas del dashboard y se omite la de base de datos.
La prueba de integración verifica solicitudes duplicadas, límite de tres préstamos,
stock escaso y devoluciones simultáneas.

### 3. Encender la API (terminal 1)

```powershell
npm run build
node dist/app.js
```

Dejar esta terminal abierta. Usar el código compilado para medir rendimiento.
Para desarrollar con recarga automática se puede usar `npm run dev`.

### 4. Pruebas funcionales (terminal 2)

Con la API encendida, desde la raíz del proyecto:

```powershell
New-Item -ItemType Directory -Force performance/results/postman | Out-Null
$functionalRun = Get-Date -Format 'yyyyMMdd-HHmmss'
npx --yes newman run postman/eowyn_library.postman_collection.json -e postman/eowyn_enviroment.postman_environment.json --folder Eowyn --reporters cli,json,junit --reporter-json-export "performance/results/postman/$functionalRun.json" --reporter-junit-export "performance/results/postman/$functionalRun.xml"
```

La primera ejecución descarga Newman si no está disponible. El flujo `Eowyn`
contiene 11 peticiones, captura token e IDs y verifica los listados y el ciclo
crear/actualizar/prestar/devolver/eliminar. También puede ejecutarse desde el
Collection Runner de Postman importando ambos JSON y seleccionando el entorno.
La carpeta `Adicionales - ejecutar por separado` contiene ejemplos fuera del flujo;
la validación de correo actual es un ejemplo, no un flujo real de verificación.
El PUT de libros actualmente responde 201 y la colección comprueba ese contrato.

### 5. Validación rápida de k6

```powershell
npm run perf:smoke
```

Solo avanzar si termina sin errores. El comando imprime dónde guardó las evidencias.
El smoke comprueba login, autenticación obligatoria, catálogo, CRUD y préstamo/devolución.

### 6. Ejecutar todos los escenarios k6

```powershell
npm run perf:k6 -- all
```

Se ejecutan **secuencialmente**, empezando por smoke; si smoke falla, se detiene
la suite. Los otros fallos quedan registrados y la suite continúa para obtener
evidencia de degradación. El código de salida final será distinto de cero si
algún escenario falla. No ejecutar otra carga o una limpieza al mismo tiempo.

| Escenario | Perfil principal | Duración configurada aproximada |
|---|---|---|
| 00-smoke | 1 VU, flujo completo | 30 s |
| 01-auth-load | 0 → 10 → 0 VUs, login | 4 min |
| 02-catalog-load | 0 → 50 → 0 VUs, catálogo | 6 min 30 s |
| 03-mixed-crud | 20 VUs, lecturas y escrituras | 8 min |
| 04-loan-contention | 30 VUs sobre el mismo libro | 5 min |
| 05-stress | 10 → 30 → 60 → 100 → 0 VUs | 11 min |
| 06-spike | 10 → 100 → 10 VUs | 5 min 10 s |
| 07-soak | 20 VUs, lecturas y préstamos | 30 min |

El total supera 70 minutos contando preparación y cierre. Para repetir un escenario:

```powershell
npm run perf:k6 -- 02-catalog-load
```

En Windows se toma CPU y RAM del proceso que escucha en el puerto de la API y
CPU/RAM del contenedor `eowyn-library-db`. Si no puede obtener una muestra,
queda vacía; no se convierte en cero. La RAM de la API es el working set en MB.
La CPU se expresa respecto de un núcleo lógico y puede superar 100%.
El monitor está pensado para la API local; no usar sus datos como recursos de un servidor remoto.

### 7. Preparar Java y ejecutar Gatling

Comprobar que Maven usa Java 21 o superior (el proyecto compila para Java 21):

```powershell
java -version
mvn -version
```

Si `java` se queda esperando o Maven usa otro JDK, en esta máquina se puede seleccionar:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21.0.11'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
mvn -version
```

Después, con la misma API encendida y sin k6 ejecutándose:

```powershell
npm run perf:gatling -- SmokeSimulation
npm run perf:gatling -- all
```

La suite ejecuta Smoke, AuthLoad, CatalogLoad, MixedLoad y LoanCycle. Dura unos
23 minutos más preparación y cierre. Maven descarga dependencias la primera vez.
Para ejecutar solo una simulación:

```powershell
npm run perf:gatling -- CatalogLoadSimulation
```

Los tokens de catálogo, carga mixta y préstamos se obtienen durante la preparación,
para evitar medir un login nuevo en cada operación de catálogo.
**Los perfiles de ambas herramientas no son idénticos**: Gatling usa 20 usuarios
sobre libros aleatorios durante 4 minutos en LoanCycle, mientras k6 usa 30 sobre
un único libro durante 5 minutos. Comparar cada resultado con su perfil y umbrales;
no atribuir diferencias exclusivamente a la herramienta.

### 8. Abrir resultados y conservar evidencia para el informe

Cada comando de k6/Gatling crea una carpeta nueva:

```text
performance/results/<fecha-UTC>/k6/
performance/results/<fecha-UTC>/gatling/
```

k6 guarda resumen JSON con p95/p99, serie temporal JSON, log de consola, CSV de
recursos, metadatos de entorno/códigos de salida y `report.html` generado al terminar.
El estado del dashboard usa los umbrales reales y el código de salida; las muestras
sin medición no se presentan como ceros. La serie temporal permite analizar cambios
con la carga; el resumen describe la ejecución completa.

Abrir el dashboard k6 más reciente:

```powershell
$latestDashboard = Get-ChildItem performance/results -Recurse -Filter report.html | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestDashboard) { Invoke-Item $latestDashboard.FullName }
```

Gatling guarda logs, metadatos y CSV en la carpeta por fecha. Sus reportes HTML
nativos, con gráficos y resultados de las aserciones, están en:

```text
performance/gatling/target/gatling/<simulacion-fecha>/index.html
```

Abrir el más reciente:

```powershell
$latestGatling = Get-ChildItem performance/gatling/target/gatling -Recurse -Filter index.html | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestGatling) { Invoke-Item $latestGatling.FullName }
```

Para regenerar un dashboard, usar la ruta exacta impresa por el ejecutor:

```powershell
# Sustituir FECHA por la carpeta real de la ejecución.
node performance/scripts/generate-report.js performance/results/FECHA/k6 performance/results/FECHA/k6/report.html
```

Guardar para el informe: versiones y hardware (`execution.json`), fecha, configuración
del escenario, resultados Postman, logs completos, umbrales aprobados/fallidos,
p95/p99, solicitudes por segundo, errores, series temporales y CSV de CPU/RAM.
Capturar también pantallas de los reportes y describir cualquier fallo real sin ocultarlo.
Para analizar Gatling, conservar la carpeta completa de cada reporte, no solo `index.html`.
Los resultados están ignorados por Git: respaldar `performance/results` y
`performance/gatling/target/gatling` después de las ejecuciones.
Estos HTML son evidencia técnica; el informe académico se elabora después del análisis.

### 9. Apagar y limpiar (al terminar de guardar los resultados)

Detener la API con Ctrl+C en la terminal 1 y apagar el contenedor:

```powershell
docker compose stop
```

Opcionalmente, para eliminar datos de pruebas antes de otra campaña:

```powershell
# Requiere la base encendida; elimina registros PERF y residuos SMOKE/MIX/GTL/QA.
# Revisar performance/scripts/reset-perf-data.js antes de usarlo sobre datos propios.
npm run perf:reset
npm run perf:seed
```

No ejecutar limpieza mientras se mide rendimiento. `npm run perf:clean` es un
script Bash antiguo que borra resultados: no es necesario para este procedimiento.
