$ErrorActionPreference = "Continue"

$PIDS_DIR = Join-Path $PSScriptRoot "pids"
$apiPidFile = Join-Path $PIDS_DIR "api.pid"
$webPidFile = Join-Path $PIDS_DIR "web.pid"

function Show-Status([string]$pidFile, [string]$name) {
  if (-not (Test-Path $pidFile)) {
    Write-Host "${name}: not running (no pid file)."
    return
  }

  $procId = (Get-Content $pidFile | Select-Object -First 1).Trim()
  if (-not $procId) {
    Write-Host "${name}: unknown (empty pid file)."
    return
  }

  $p = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
  if ($null -eq $p) {
    Write-Host "${name}: not running (stale pid ${procId})."
  } else {
    Write-Host "${name}: running PID=${procId} Name=$($p.ProcessName)"
  }
}

Show-Status $apiPidFile "API"
Show-Status $webPidFile "Web"