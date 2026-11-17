#!/usr/bin/env bash
# Ejecuta un escenario k6 y guarda el resumen JSON en performance/results/k6/.
#
# Uso:
#   ./run.sh                 # smoke (00-smoke)
#   ./run.sh 02-catalog-load
#   ./run.sh 07-soak --out results/soak.json
set -euo pipefail

cd "$(dirname "$0")"

SCENARIO="${1:-00-smoke}"
shift || true

mkdir -p ../results/k6
SUMMARY="../results/k6/${SCENARIO}-summary.json"

echo "Ejecutando k6: ${SCENARIO}"
echo "Resumen: ${SUMMARY}"

BASE_URL="${BASE_URL:-http://localhost:3000}" \
  k6 run --summary-export "$SUMMARY" "scenarios/${SCENARIO}.js" "$@"
