#!/usr/bin/env bash
set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

pnpm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed 2>/dev/null || true

echo "Starting io-manager in dev mode on :${PORT:-7100}..."
echo "Dashboard: http://localhost:${PORT:-7100}/"
pnpm start:dev
