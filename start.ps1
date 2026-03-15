$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = "$ScriptDir\backend"
$FrontendDir = "$ScriptDir\frontend"
$Python = "$BackendDir\venv\Scripts\python.exe"

Write-Host ""
Write-Host "=== Teacher Agent ==="
Write-Host ""

# ── Find a free port (8005+) ──────────────────────────────────────────────────
$BackendPort = & $Python -c @"
import socket, sys
for port in range(8005, 8100):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', port))
        s.close()
        print(port)
        sys.exit(0)
    except OSError:
        pass
sys.exit(1)
"@

if (-not $BackendPort) {
    Write-Host "  ERROR: No free port found in 8005-8099."
    exit 1
}

Write-Host "  Backend port : $BackendPort"

# ── Update frontend .env.local ─────────────────────────────────────────────────
$EnvFile = "$FrontendDir\.env.local"
$NewLine = "NEXT_PUBLIC_API_URL=http://localhost:$BackendPort"
if (Test-Path $EnvFile) {
    $lines = Get-Content $EnvFile
    $lines = $lines -replace "^NEXT_PUBLIC_API_URL=.*", $NewLine
    Set-Content $EnvFile $lines
} else {
    Set-Content $EnvFile $NewLine
}
Write-Host "  .env.local   : -> http://localhost:$BackendPort"

# ── Start backend ──────────────────────────────────────────────────────────────
Write-Host "  Starting backend..."
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONUTF8 = "1"
$BackendProc = Start-Process -FilePath $Python `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--port", $BackendPort `
    -WorkingDirectory $BackendDir -PassThru -NoNewWindow

# ── Wait for backend (curl.exe health check) ───────────────────────────────────
Write-Host -NoNewline "  Waiting for backend"
$Ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    Write-Host -NoNewline "."
    $result = & curl.exe -s --max-time 1 "http://localhost:$BackendPort/health" 2>$null
    if ($result -match "healthy") { $Ready = $true; break }
}
Write-Host ""

if ($Ready) {
    Write-Host "  Backend ready!"
} else {
    Write-Host "  WARNING: Health check timed out - backend may still be starting."
    Write-Host "           Check output above for import errors."
}

# ── Kill any old frontend on port 3000 ────────────────────────────────────────
$listening = netstat -ano 2>$null | Select-String "127.0.0.1:3000\s.*LISTENING"
if ($listening) {
    $OldPid = ($listening.ToString().Trim() -split "\s+")[-1]
    Write-Host "  Stopping old frontend (PID $OldPid)..."
    Stop-Process -Id ([int]$OldPid) -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Remove Next.js lock file if stale
$LockFile = "$FrontendDir\.next\dev\lock"
if (Test-Path $LockFile) {
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}

# ── Start frontend ─────────────────────────────────────────────────────────────
Write-Host "  Starting frontend..."
$FrontendProc = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $FrontendDir -PassThru -NoNewWindow

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "  Backend  : http://localhost:$BackendPort"
Write-Host "  Frontend : http://localhost:3000"
Write-Host ""
Write-Host "  Press Ctrl+C to stop both servers"
Write-Host ""

# ── Cleanup on exit ───────────────────────────────────────────────────────────
try {
    Wait-Process -Id $BackendProc.Id -ErrorAction SilentlyContinue
} finally {
    Write-Host ""
    Write-Host "  Stopping servers..."
    Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $FrontendProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  Done."
}
