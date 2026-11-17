#!/usr/bin/env bash
# Ejecuta una simulación de Gatling.
#
# Uso:
#   ./run.sh                       # CatalogLoadSimulation
#   ./run.sh AuthLoadSimulation
#   ./run.sh LoanCycleSimulation
#   ./run.sh MixedLoadSimulation
set -euo pipefail

cd "$(dirname "$0")"

SIMULATION="${1:-CatalogLoadSimulation}"
shift || true

echo "Ejecutando Gatling: ${SIMULATION}"
echo "Reporte HTML: target/gatling/ (se abre automáticamente salvo -Dgatling.noReports)"

mvn -q gatling:test -Dgatling.simulationClass="eowyn.perf.${SIMULATION}" "$@"
