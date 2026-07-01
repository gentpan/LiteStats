#!/usr/bin/env bash
# 从本机 rsync 同步到生产服务器并重建（服务器未装 git 时使用）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/Desktop/gentpan.pem}"
REMOTE_HOST="${REMOTE_HOST:-root@167.233.97.16}"
REMOTE_DIR="${REMOTE_DIR:-/opt/litestats}"

echo "同步到 ${REMOTE_HOST}:${REMOTE_DIR} ..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .env.production \
  --exclude .env \
  --exclude data \
  --exclude .git \
  -e "ssh -i ${SSH_KEY}" \
  "${ROOT}/" \
  "${REMOTE_HOST}:${REMOTE_DIR}/"

echo "重建并启动容器..."
ssh -i "${SSH_KEY}" "${REMOTE_HOST}" "cd ${REMOTE_DIR} && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build"

echo "完成: https://litestats.dev"
