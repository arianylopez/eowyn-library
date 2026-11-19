param(
    [ValidateSet('00-smoke', '01-carga-constante', '02-rampa', '03-spike')]
    [string]$Scenario = '00-smoke',
    [string]$BaseUrl = 'http://localhost:3001'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    throw 'k6 no está instalado o no se encuentra en PATH.'
}

$file = Join-Path $PSScriptRoot "$Scenario.js"
$results = Join-Path $PSScriptRoot '../../results/k6/simple'
$run = Join-Path $results "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$Scenario"

New-Item -ItemType Directory -Force -Path $run | Out-Null

& k6 run `
    --env "BASE_URL=$BaseUrl" `
    --summary-export (Join-Path $run 'summary.json') `
    --out "json=$(Join-Path $run 'details.json')" `
    $file 2>&1 | Tee-Object -FilePath (Join-Path $run 'console.log')

$result = $LASTEXITCODE
Write-Host "Resultados guardados en: $run"

if ($result -ne 0) {
    throw "El escenario terminó con código $result. Revisa console.log."
}
