#!/bin/bash
# Start OpenMuse Server + Web Frontend with Agnes AI configuration

cd "$(dirname "$0")"

echo "=== Starting OpenMuse ==="
echo "Backend: http://localhost:8787"
echo "Frontend: http://localhost:8081"
echo "Active Model: agnes-3.0-flash (via Agnes AI apihub)"
echo "========================="

# Start Server in background
pnpm dev &
SERVER_PID=$!

# Start Web UI
pnpm dev:web &
WEB_PID=$!

trap "kill $SERVER_PID $WEB_PID 2>/dev/null" EXIT INT TERM

wait
