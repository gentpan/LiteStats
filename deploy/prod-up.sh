#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.production ]; then
  echo "请先复制配置: cp .env.production.example .env.production"
  exit 1
fi

echo "构建并启动 LiteStats 生产环境..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo ""
echo "部署完成。请确保："
echo "  1. DNS 已将 \${DOMAIN} 指向本机"
echo "  2. .env.production 中 WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN 与域名一致"
echo "  3. 首次登录后修改默认密码并注册 Passkey"
echo ""
echo "健康检查: curl -s https://\${DOMAIN}/api/health | jq"
