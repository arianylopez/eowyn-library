#!/usr/bin/env bash
# Elimina los resultados generados por las pruebas (k6, Gatling y dashboard).
# No toca los datos de la base de datos; para eso usar npm run perf:reset.
#
# Uso:
#   ./performance/scripts/clean-results.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

rm -rf performance/results/k6/* performance/results/report.html
rm -rf performance/gatling/target/gatling/*

mkdir -p performance/results/k6

echo "Resultados anteriores eliminados:"
echo "  performance/results/k6/"
echo "  performance/results/report.html"
echo "  performance/gatling/target/gatling/"
