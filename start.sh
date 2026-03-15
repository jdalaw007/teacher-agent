#!/usr/bin/env bash
# Teacher Agent startup script
# Kills stale processes, finds a free port, starts backend + frontend.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
PYTHON="$BACKEND_DIR/venv/Scripts/python.exe"

echo ""
echo "=== Teacher Agent ==="
echo ""

# ── Kill stale Node processes (previous frontend instances) ───────────────────
echo "  Cleaning up old processes..."
powershell.exe -Command "
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
" 2>/dev/null
sleep 1

# ── Remove Next.js dev lock if stale ─────────────────────────────────────────
LOCK_FILE="$FRONTEND_DIR/.next/dev/lock"
if [ -f "$LOCK_FILE" ]; then
  echo "  Removing stale Next.js lock..."
  rm -f "$LOCK_FILE"
fi

# ── Find a free backend port (skip known zombie range 8001-8009) ──────────────
BACKEND_PORT=$("$PYTHON" - <<'EOF'
import socket, sys
for port in range(8010, 8100):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('127.0.0.1', port))
        s.close()
        print(port)
        sys.exit(0)
    except OSError:
        pass
print("No free port found in 8010-8099", file=sys.stderr)
sys.exit(1)
EOF
)

if [ $? -ne 0 ]; then
  echo "  ERROR: Could not find a free backend port (8010-8099 all occupied)."
  exit 1
fi

echo "  Backend port : $BACKEND_PORT"

# ── Update frontend .env.local ────────────────────────────────────────────────
ENV_FILE="$FRONTEND_DIR/.env.local"
if [ -f "$ENV_FILE" ] && grep -q "^NEXT_PUBLIC_API_URL=" "$ENV_FILE"; then
  sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://localhost:$BACKEND_PORT|" "$ENV_FILE"
else
  echo "NEXT_PUBLIC_API_URL=http://localhost:$BACKEND_PORT" >> "$ENV_FILE"
fi
echo "  .env.local   : http://localhost:$BACKEND_PORT"

# ── Start backend ─────────────────────────────────────────────────────────────
echo "  Starting backend..."
cd "$BACKEND_DIR"
PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1 \
  "$PYTHON" -m uvicorn app.main:app --port "$BACKEND_PORT" &
BACKEND_PID=$!

# Wait up to 25s for backend to become healthy
echo -n "  Waiting for backend"
READY=0
for i in $(seq 1 25); do
  sleep 1
  echo -n "."
  if curl -s "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
done
echo ""

if [ $READY -eq 0 ]; then
  echo "  ERROR: Backend did not start. Check for import errors above."
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi
echo "  Backend ready on :$BACKEND_PORT"

# ── Start frontend ────────────────────────────────────────────────────────────
echo "  Starting frontend..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

# Wait for frontend to be ready
echo -n "  Waiting for frontend"
FREADY=0
for i in $(seq 1 30); do
  sleep 1
  echo -n "."
  if curl -s "http://localhost:3000" >/dev/null 2>&1; then
    FREADY=1
    break
  fi
done
echo ""

if [ $FREADY -eq 0 ]; then
  echo "  WARNING: Frontend may still be compiling — check the output above."
fi

echo ""
echo "  ┌──────────────────────────────────────────┐"
echo "  │  Backend  : http://localhost:$BACKEND_PORT          │"
echo "  │  Frontend : http://localhost:3000         │"
echo "  │  OAuth CB : http://localhost:8003         │"
echo "  └──────────────────────────────────────────┘"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# ── Shutdown on Ctrl+C ────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "  Stopping servers..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  echo "  Done."
}
trap cleanup EXIT INT TERM

wait "$BACKEND_PID" "$FRONTEND_PID"
