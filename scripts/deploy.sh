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

echo "[1/4] Sync source on remote host (${REMOTE_HOST})..."
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

echo "[2/4] Build on remote host..."
ssh ${SSH_OPTS} "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  cd '${DEPLOY_DIR}'

  if [ -x ./mvnw ]; then
    ./mvnw -DskipTests clean package
  else
    mvn -DskipTests clean package
  fi
"

echo "[3/4] Restart service on remote host..."
ssh ${SSH_OPTS} "${REMOTE_USER}@${REMOTE_HOST}" "
  set -euo pipefail
  cd '${DEPLOY_DIR}'
  pkill -f 'io-manager-0.0.1-SNAPSHOT.jar' || true
  nohup java -jar target/io-manager-0.0.1-SNAPSHOT.jar --server.port=${APP_PORT} > app.log 2>&1 &
  sleep 2
  tail -n 40 app.log || true
"

echo "[4/4] Health check..."
curl -fsS "http://${REMOTE_HOST}:${APP_PORT}/api/health"

echo "Deploy done."
