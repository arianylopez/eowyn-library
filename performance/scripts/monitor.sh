#!/usr/bin/env bash
# Muestrea CPU y memoria del proceso de la API y del contenedor PostgreSQL
# durante una prueba de rendimiento.
#
# Uso:
#   ./performance/scripts/monitor.sh <archivo-salida.csv> [duracion_segundos] [intervalo_segundos]
#
# Ejemplo:
#   ./performance/scripts/monitor.sh performance/results/cpu-load.csv 300 2

set -euo pipefail

OUT="${1:-performance/results/resources.csv}"
DURATION="${2:-300}"
INTERVAL="${3:-2}"

mkdir -p "$(dirname "$OUT")"
echo "timestamp,app_cpu_pct,app_rss_mb,db_cpu_pct,db_mem_mb" > "$OUT"

# En desarrollo, ts-node-dev crea un proceso padre (tsnd) y un hijo que
# ejecuta realmente la API. Se debe medir el hijo; en producción se busca
# directamente el proceso de dist/app.js del repositorio actual.
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
find_app_pid() {
  local parent
  parent="$(pgrep -f "${REPO_ROOT}/node_modules/[.]bin/tsnd" | head -1 || true)"
  if [[ -n "${parent}" ]]; then
    pgrep -P "${parent}" | head -1 || true
  else
    pgrep -f "node .*${REPO_ROOT}/dist/app[.]js" | head -1 || true
  fi
}

APP_PID="$(find_app_pid)"
if [[ -z "${APP_PID}" ]]; then
  echo "ADVERTENCIA: no se encontró el proceso de la API; se omite CPU/RSS de la app." >&2
fi

END=$((SECONDS + DURATION))
while (( SECONDS < END )); do
  TS="$(date '+%Y-%m-%dT%H:%M:%S')"

  if [[ -z "${APP_PID}" ]] || ! ps -p "${APP_PID}" > /dev/null 2>&1; then
    APP_PID="$(find_app_pid)"
  fi

  if [[ -n "${APP_PID}" ]] && ps -p "${APP_PID}" > /dev/null 2>&1; then
    APP_CPU="$(ps -p "${APP_PID}" -o %cpu= | tr -d ' ')"
    APP_RSS="$(ps -p "${APP_PID}" -o rss= | awk '{printf "%.1f", $1/1024}')"
  else
    APP_CPU=""
    APP_RSS=""
  fi

  DB_STATS="$(docker stats --no-stream --format '{{.CPUPerc}},{{.MemUsage}}' eowyn-library-db 2>/dev/null || echo ',')"
  DB_CPU="$(echo "$DB_STATS" | cut -d',' -f1 | tr -d '% ')"
  DB_MEM_RAW="$(echo "$DB_STATS" | cut -d',' -f2 | awk '{print $1}')"
  DB_MEM="$(echo "$DB_MEM_RAW" | sed 's/MiB//;s/GiB/*1024/' | awk '{ if ($0 ~ /\*/) { split($0,a,"*"); printf "%.1f", a[1]*a[2] } else { printf "%.1f", $0 } }')"

  echo "$TS,$APP_CPU,$APP_RSS,$DB_CPU,$DB_MEM" >> "$OUT"
  sleep "$INTERVAL"
done

echo "Muestras guardadas en $OUT"
