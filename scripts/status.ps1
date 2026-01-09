$ErrorActionPreference = "Continue"

$PIDS_DIR = Join-Path $PSScriptRoot "pids"
$apiPidFile = Join-Path $PIDS_DIR "api.pid"
$webPidFile = Join-Path $PIDS_DIR "web.pid"

function Stop-ByPidFile([string]$pidFile, [string]$name) {
  if (-not (Test-Path $pidFile)) {
    Write-Host "${name}: not running (no pid file)."
    return
  }

  $procId = (Get-Content $pidFile | Select-Object -First 1).Trim()
  if (-not $procId) {
    Write-Host "${name}: empty pid file, removing."
    Remove-Item -Force $pidFile
    return
  }

  Write-Host "Stopping ${name} PID=${procId} ..."
  try {
    Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop
    Write-Host "${name} stopped."
  } catch {
    Write-Host "${name}: process not found or already stopped."
  }

  Remove-Item -Force $pidFile
}

# 先停前端再停后端
Stop-ByPidFile $webPidFile "Web"
Stop-ByPidFile $apiPidFile "API"