# ============================================
# start.ps1 - Start all services (API + Web)
# ============================================
$ErrorActionPreference = "Stop"

$ROOT = Resolve-Path (Join-Path $PSScriptRoot "..")
$API_DIR = Join-Path $ROOT "api"
$WEB_DIR = Join-Path $ROOT "web"
$PIDS_DIR = Join-Path $PSScriptRoot "pids"

# Ensure pids directory exists
New-Item -ItemType Directory -Force -Path $PIDS_DIR | Out-Null

$apiPidFile = Join-Path $PIDS_DIR "api.pid"
$webPidFile = Join-Path $PIDS_DIR "web.pid"

Write-Host ""
Write-Host "========== Starting Services =========="
Write-Host "Project root: $ROOT"
Write-Host ""

# ---- Start API Backend ----
if (Test-Path $apiPidFile) {
  $existingPid = (Get-Content $apiPidFile | Select-Object -First 1).Trim()
  $existingProc = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
  if ($null -ne $existingProc) {
    Write-Host "API (Backend): Already running (PID=$existingPid)"
  }
  else {
    # Process dead but pid file exists, cleanup and restart
    Remove-Item -Force $apiPidFile
    Write-Host "API (Backend): Stale pid file detected, restarting..."
  }
}

if (-not (Test-Path $apiPidFile)) {
  Write-Host "API (Backend): Starting..."
  $apiOutLog = Join-Path $PIDS_DIR "api.out.log"
  $apiErrLog = Join-Path $PIDS_DIR "api.err.log"

  $apiPython = Join-Path $API_DIR ".venv\Scripts\python.exe"
  if (-not (Test-Path $apiPython)) {
    throw "Error: Python venv not found: $apiPython"
  }

  $apiArgs = @("-m", "uvicorn", "main:app", "--port", "3333")

  $apiProc = Start-Process `
    -FilePath $apiPython `
    -WorkingDirectory $API_DIR `
    -ArgumentList $apiArgs `
    -RedirectStandardOutput $apiOutLog `
    -RedirectStandardError $apiErrLog `
    -PassThru `
    -WindowStyle Hidden

  $apiProc.Id | Out-File -Encoding ascii -FilePath $apiPidFile
  Write-Host "API (Backend): Started (PID=$($apiProc.Id))"
  Write-Host "               Log: $apiErrLog"
}

# ---- Start Web Frontend ----
if (Test-Path $webPidFile) {
  $existingPid = (Get-Content $webPidFile | Select-Object -First 1).Trim()
  $existingProc = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
  if ($null -ne $existingProc) {
    Write-Host "Web (Frontend): Already running (PID=$existingPid)"
  }
  else {
    Remove-Item -Force $webPidFile
    Write-Host "Web (Frontend): Stale pid file detected, restarting..."
  }
}

if (-not (Test-Path $webPidFile)) {
  Write-Host "Web (Frontend): Starting..."
  $webOutLog = Join-Path $PIDS_DIR "web.out.log"
  $webErrLog = Join-Path $PIDS_DIR "web.err.log"

  $npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source

  $webProc = Start-Process `
    -FilePath $npmCmd `
    -WorkingDirectory $WEB_DIR `
    -ArgumentList @("run", "dev") `
    -RedirectStandardOutput $webOutLog `
    -RedirectStandardError $webErrLog `
    -PassThru `
    -WindowStyle Hidden

  $webProc.Id | Out-File -Encoding ascii -FilePath $webPidFile
  Write-Host "Web (Frontend): Started (PID=$($webProc.Id))"
  Write-Host "                Log: $webErrLog"
}

Write-Host ""
Write-Host "========== Service URLs =========="
Write-Host "  Frontend: http://localhost:5173/"
Write-Host "  Backend:  http://127.0.0.1:3333/docs"
Write-Host ""
Write-Host "Commands:"
Write-Host "  Status: .\scripts\status.ps1"
Write-Host "  Stop:   .\scripts\stop.ps1"