$BackendDir = "$PSScriptRoot\backend"
$FrontendDir = "$PSScriptRoot\frontend"
$Python = "$BackendDir\venv\Scripts\python.exe"

# Find a free port
$Port = & $Python -c @"
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

Write-Host "Starting backend on port $Port..."

# Update .env.local
$EnvFile = "$FrontendDir\.env.local"
$NewLine = "NEXT_PUBLIC_API_URL=http://localhost:$Port"
if (Test-Path $EnvFile) {
    (Get-Content $EnvFile) -replace "^NEXT_PUBLIC_API_URL=.*", $NewLine | Set-Content $EnvFile
} else {
    Set-Content $EnvFile $NewLine
}
Write-Host "Updated .env.local -> http://localhost:$Port"

# Start backend (must run from backend dir so 'app' module is found)
$env:PYTHONDONTWRITEBYTECODE = "1"
$env:PYTHONUTF8 = "1"
Push-Location $BackendDir
& $Python -m uvicorn app.main:app --port $Port
Pop-Location
