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
    [int]$port,
    [string]$url
  )
    
  $isRunning = $false
  $statusMsg = "Not running"
  $procId = $null

  if (Test-Path $pidFile) {
    $procId = (Get-Content $pidFile | Select-Object -First 1).Trim()
    if ($procId) {
      $p = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
      if ($null -ne $p) {
        $isRunning = $true
        $statusMsg = "Running (PID=$procId)"
      } else {
         $statusMsg = "Not running (Stale PID file)"
      }
    }
  }

  # Also check if port is actually listening
  $portConnections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($null -ne $portConnections) {
    # Port is in use
    $owningPid = $portConnections[0].OwningProcess
    if (-not $isRunning) {
       $isRunning = $true
       $statusMsg = "Running (Port $port is in use by PID $owningPid, missing/stale PID file)"
    } else {
       if ($owningPid -ne $procId) {
           $statusMsg += " [Warning: Port $port actually used by PID $owningPid]"
       }
    }
  }

  if ($isRunning) {
    Write-Host "$name : $statusMsg -> $url"
  } else {
    Write-Host "$name : $statusMsg"
  }
}

Write-Host ""
Write-Host "========== Service Status =========="
Show-Status -pidFile $apiPidFile -name "API (Backend)" -port 8000 -url "http://127.0.0.1:8000"
Show-Status -pidFile $webPidFile -name "Web (Frontend)" -port 5173 -url "http://localhost:5173"

Write-Host ""
Write-Host "Commands:"
Write-Host "  Start: .\scripts\start.ps1"
Write-Host "  Stop:  .\scripts\stop.ps1"