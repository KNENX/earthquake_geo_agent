# ============================================
# stop.ps1 - Stop all services (API + Web)
# ============================================
$ErrorActionPreference = "Continue"

$PIDS_DIR = Join-Path $PSScriptRoot "pids"
$apiPidFile = Join-Path $PIDS_DIR "api.pid"
$webPidFile = Join-Path $PIDS_DIR "web.pid"

function Stop-ByPortAndPid {
  param(
    [string]$pidFile,
    [string]$name,
    [int]$port
  )
    
  $stopped = $false

  if (Test-Path $pidFile) {
    $procId = (Get-Content $pidFile | Select-Object -First 1).Trim()
    if ($procId) {
      Write-Host "Stopping $name (PID=$procId) from PID file..."
      $null = cmd /c "taskkill /F /T /PID $procId 2>&1"
      $stopped = $true
    }
    Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
  }

  # Ensure the port is freed by killing the process holding it
  $portMappings = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($null -ne $portMappings) {
    foreach ($mapping in $portMappings) {
      $owningPid = $mapping.OwningProcess
      if ($null -ne $owningPid -and $owningPid -ne 0 -and $owningPid -ne 4) {
        Write-Host "Stopping $name (PID=$owningPid) occupying port $port..."
        $null = cmd /c "taskkill /F /T /PID $owningPid 2>&1"
        $stopped = $true
      }
    }
  }

  if ($stopped) {
    Write-Host "$name : Stopped"
  }
  else {
    Write-Host "$name : Not running or already stopped"
  }
}

Write-Host ""
Write-Host "========== Stopping Services =========="

# Stop frontend first, then backend
Stop-ByPortAndPid -pidFile $webPidFile -name "Web (Frontend)" -port 5173
Stop-ByPortAndPid -pidFile $apiPidFile -name "API (Backend)" -port 8000

Write-Host ""
Write-Host "All services stopped."