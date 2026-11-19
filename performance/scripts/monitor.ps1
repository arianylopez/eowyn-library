param(
  [Parameter(Mandatory=$true)][string]$OutFile,
  [Parameter(Mandatory=$true)][int]$UntilProcessId,
  [int]$IntervalSeconds = 2,
  [int]$ApiPort = 3000
)
$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
'timestamp,app_cpu_pct,app_rss_mb,db_cpu_pct,db_mem_mb' | Set-Content -LiteralPath $OutFile -Encoding utf8
$previousCpu = $null
$previousTime = Get-Date
$previousPid = $null
while (Get-Process -Id $UntilProcessId -ErrorAction SilentlyContinue) {
  $cpu = ''
  $ram = ''
  $dbCpu = ''
  $dbRam = ''
  $listener = Get-NetTCPConnection -State Listen -LocalPort $ApiPort -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $appProcess = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($appProcess) {
      $now = Get-Date
      if ($previousPid -eq $appProcess.Id -and $null -ne $previousCpu) {
        # Percent of one logical CPU, consistent with docker stats (>100 is possible).
        $cpu = ((($appProcess.CPU - $previousCpu) / ($now - $previousTime).TotalSeconds) * 100).ToString('F2', $culture)
      }
      $ram = ($appProcess.WorkingSet64 / 1MB).ToString('F2', $culture)
      $previousCpu = $appProcess.CPU
      $previousTime = $now
      $previousPid = $appProcess.Id
    }
  }
  try {
    $stats = & docker stats --no-stream --format '{{.CPUPerc}},{{.MemUsage}}' eowyn-library-db 2>$null
    if ($LASTEXITCODE -eq 0 -and $stats -match '^([\d.]+)%,\s*([\d.]+)([KMG]i?B)') {
      $dbCpu = $Matches[1]
      $memory = [double]::Parse($Matches[2], $culture)
      switch -Regex ($Matches[3]) {
        '^Gi?B$' { $memory *= 1024 }
        '^Ki?B$' { $memory /= 1024 }
      }
      $dbRam = $memory.ToString('F2', $culture)
    }
  } catch { # Unavailable samples remain empty, never zero.
  }
  "$((Get-Date).ToString('o')),$cpu,$ram,$dbCpu,$dbRam" | Add-Content -LiteralPath $OutFile -Encoding utf8
  Start-Sleep -Seconds $IntervalSeconds
}
