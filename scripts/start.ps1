$ErrorActionPreference = "Stop"

$ROOT = Resolve-Path (Join-Path $PSScriptRoot "..")
$API_DIR = Join-Path $ROOT "api"
$WEB_DIR = Join-Path $ROOT "web"
$PIDS_DIR = Join-Path $PSScriptRoot "pids"

New-Item -ItemType Directory -Force -Path $PIDS_DIR | Out-Null

$apiPidFile = Join-Path $PIDS_DIR "api.pid"
$webPidFile = Join-Path $PIDS_DIR "web.pid"

Write-Host "Project root: $ROOT"

# ---- Start API ----
if (Test-Path $apiPidFile) {
  Write-Host "API seems already started (pid file exists): $apiPidFile"
} else {
  Write-Host "Starting API (uvicorn) ..."
  $apiOutLog = Join-Path $PIDS_DIR "api.out.log"
  $apiErrLog = Join-Path $PIDS_DIR "api.err.log"

  $apiPython = Join-Path $API_DIR ".venv\Scripts\python.exe"
  if (-not (Test-Path $apiPython)) {
    throw "API venv python not found: $apiPython"
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
  Write-Host "API started. PID=$($apiProc.Id). OutLog=$apiOutLog ErrLog=$apiErrLog"
}

# ---- Start Web ----
if (Test-Path $webPidFile) {
  Write-Host "Web seems already started (pid file exists): $webPidFile"
} else {
  Write-Host "Starting Web (vite) ..."
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
  Write-Host "Web started. PID=$($webProc.Id). OutLog=$webOutLog ErrLog=$webErrLog"
}

Write-Host ""
Write-Host "Open:"
Write-Host "  Frontend: http://localhost:5173/"
Write-Host "  Backend docs: http://127.0.0.1:3333/docs"