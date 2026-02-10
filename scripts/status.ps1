# ============================================
# status.ps1 - Check service status
# ============================================
$ErrorActionPreference = "Continue"

$PIDS_DIR = Join-Path $PSScriptRoot "pids"
$apiPidFile = Join-Path $PIDS_DIR "api.pid"
$webPidFile = Join-Path $PIDS_DIR "web.pid"

function Show-Status {
  param(
    [string]$pidFile,
    [string]$name,
    [string]$url
  )
    
  if (-not (Test-Path $pidFile)) {
    Write-Host "$name : Not running"
    return
  }

  $procId = (Get-Content $pidFile | Select-Object -First 1).Trim()
  if (-not $procId) {
    Write-Host "$name : Not running (empty pid file)"
    return
  }

  $p = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
  if ($null -eq $p) {
    Write-Host "$name : Not running (process exited, PID=$procId)"
  }
  else {
    Write-Host "$name : Running (PID=$procId) -> $url"
  }
}

Write-Host ""
Write-Host "========== Service Status =========="
Show-Status -pidFile $apiPidFile -name "API (Backend)" -url "http://127.0.0.1:8000"
Show-Status -pidFile $webPidFile -name "Web (Frontend)" -url "http://localhost:5173"

Write-Host ""
Write-Host "Commands:"
Write-Host "  Start: .\scripts\start.ps1"
Write-Host "  Stop:  .\scripts\stop.ps1"