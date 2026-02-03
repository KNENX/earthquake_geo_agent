# ============================================
# stop.ps1 - Stop all services (API + Web)
# ============================================
$ErrorActionPreference = "Continue"

$PIDS_DIR = Join-Path $PSScriptRoot "pids"
$apiPidFile = Join-Path $PIDS_DIR "api.pid"
$webPidFile = Join-Path $PIDS_DIR "web.pid"

function Stop-ByPidFile {
  param(
    [string]$pidFile,
    [string]$name
  )
    
  if (-not (Test-Path $pidFile)) {
    Write-Host "$name : Not running (no pid file)"
    return
  }

  $procId = (Get-Content $pidFile | Select-Object -First 1).Trim()
  if (-not $procId) {
    Write-Host "$name : Empty pid file, cleaning up"
    Remove-Item -Force $pidFile
    return
  }

  Write-Host "Stopping $name (PID=$procId) ..."
  try {
    Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop
    Write-Host "$name : Stopped"
  }
  catch {
    Write-Host "$name : Process not found or already stopped"
  }

  Remove-Item -Force $pidFile
}

Write-Host ""
Write-Host "========== Stopping Services =========="

# Stop frontend first, then backend
Stop-ByPidFile -pidFile $webPidFile -name "Web (Frontend)"
Stop-ByPidFile -pidFile $apiPidFile -name "API (Backend)"

Write-Host ""
Write-Host "All services stopped."