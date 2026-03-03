#!/usr/bin/env bash
set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)

cd "$ROOT/apps/api"
npm install
PORT=7100 node server.js &
API_PID=$!

cd "$ROOT/apps/web"
python3 -m http.server 7101 &
WEB_PID=$!

echo "API running on :7100 (pid=$API_PID)"
echo "WEB running on :7101 (pid=$WEB_PID)"
echo "Ctrl+C to stop"
wait
