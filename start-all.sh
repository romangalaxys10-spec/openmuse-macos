#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo " Starting OpenMuse Native macOS Ecosystem"
echo "=========================================="
echo "Backend Server:  http://127.0.0.1:8787"
echo "Browser Worker:  http://127.0.0.1:8790"
echo "Active Model:    agnes-3.0-flash (Agnes AI Gateway)"
echo "Desktop App:     OpenMuse.app (Native AppKit)"
echo "=========================================="

mkdir -p .openmuse/browser-profiles

# 1. Start Browser Worker in background
echo "-> Starting Browser Worker on port 8790..."
node --env-file=.env --import tsx apps/worker/src/index.ts >> .openmuse/worker.log 2>&1 &
WORKER_PID=$!

# 2. Start Main Server in background
echo "-> Starting OpenMuse API Server on port 8787..."
node dist/apps/server/src/index.js >> .openmuse/server.log 2>&1 &
SERVER_PID=$!

# Cleanup handler on script exit
cleanup() {
  echo ""
  echo "-> Stopping OpenMuse background services..."
  kill "$WORKER_PID" "$SERVER_PID" 2>/dev/null || true
  wait "$WORKER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "-> Services stopped."
}
trap cleanup EXIT INT TERM

# Wait for server and browser worker to be ready
echo "-> Waiting for backend services to initialize..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8787/api/health >/dev/null 2>&1 && curl -s http://127.0.0.1:8790/health >/dev/null 2>&1; then
    echo "-> Backend and Browser Worker are online!"
    break
  fi
  sleep 0.5
done

# 3. Launch the native macOS desktop app
if [ -d "$HOME/Applications/OpenMuse.app" ]; then
  echo "-> Launching OpenMuse.app..."
  open "$HOME/Applications/OpenMuse.app"
elif [ -d "$HOME/Desktop/OpenMuse.app" ]; then
  echo "-> Launching Desktop OpenMuse.app..."
  open "$HOME/Desktop/OpenMuse.app"
fi

echo "-> All services running. Press Ctrl+C to terminate."
wait
