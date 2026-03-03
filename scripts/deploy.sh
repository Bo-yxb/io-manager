#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-182.92.83.121}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_PORT="${REMOTE_PORT:-22}"
APP_PORT="${APP_PORT:-7100}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/io-manager}"
REPO_URL="${REPO_URL:-git@github.com:Bo-yxb/io-manager.git}"
BRANCH="${BRANCH:-main}"

SSH_OPTS="-p ${REMOTE_PORT} -o StrictHostKeyChecking=accept-new"

echo "[1/5] Sync source on remote host (${REMOTE_HOST})..."
ssh ${SSH_OPTS} "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  mkdir -p '${DEPLOY_DIR}'
  cd '${DEPLOY_DIR}'

  if [ ! -d .git ]; then
    git clone -b '${BRANCH}' '${REPO_URL}' .
  else
    git fetch origin '${BRANCH}'
    git checkout '${BRANCH}'
    git reset --hard 'origin/${BRANCH}'
  fi
"

echo "[2/5] Install dependencies..."
ssh ${SSH_OPTS} "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  cd '${DEPLOY_DIR}'
  corepack enable || true
  pnpm install --frozen-lockfile || pnpm install
"

echo "[3/5] Build and migrate..."
ssh ${SSH_OPTS} "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  cd '${DEPLOY_DIR}'
  npx prisma generate
  npx prisma migrate deploy
  pnpm build
"

echo "[4/5] Restart service..."
ssh ${SSH_OPTS} "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  cd '${DEPLOY_DIR}'
  pm2 delete io-manager 2>/dev/null || true
  PORT=${APP_PORT} pm2 start dist/main.js --name io-manager
  pm2 save
  sleep 2
  pm2 logs io-manager --lines 20 --nostream || true
"

echo "[5/5] Health check..."
sleep 3
curl -fsS "http://${REMOTE_HOST}:${APP_PORT}/api/v1/health"
echo ""
echo "Deploy done. Dashboard: http://${REMOTE_HOST}:${APP_PORT}/"
