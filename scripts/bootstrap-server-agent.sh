#!/usr/bin/env bash
# 从本机一键：在 LiteStats 登记服务器 + SSH 到目标机安装 Agent
# 用法: ./scripts/bootstrap-server-agent.sh [user@host]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LITESTATS_URL="${LITESTATS_URL:-https://litestats.dev}"
LITESTATS_USER="${LITESTATS_USER:-admin}"
LITESTATS_PASS="${LITESTATS_PASS:-litestats}"
SSH_KEY="${SSH_KEY:-$HOME/Desktop/gentpan.pem}"
REMOTE_HOST="${1:-root@167.233.97.16}"
SERVER_NAME="${SERVER_NAME:-LiteStats 生产}"
SERVER_HOSTNAME="${SERVER_HOSTNAME:-${REMOTE_HOST#*@}}"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

json_get() {
  local expr="$1"
  python3 -c "import json,sys; d=json.load(sys.stdin); print(${expr})"
}

echo "==> 登录 ${LITESTATS_URL} ..."
LOGIN_RESP="$(curl -sS -c "$COOKIE_JAR" -X POST "${LITESTATS_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${LITESTATS_USER}\",\"password\":\"${LITESTATS_PASS}\"}")"

if ! echo "$LOGIN_RESP" | json_get "d.get('ok', False)" | grep -q True; then
  echo "登录失败: $LOGIN_RESP" >&2
  exit 1
fi

echo "==> 查找或创建服务器「${SERVER_NAME}」(${SERVER_HOSTNAME}) ..."
SERVERS_JSON="$(curl -sS -b "$COOKIE_JAR" "${LITESTATS_URL}/api/servers")"
SERVER_ID="$(echo "$SERVERS_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
host = '${SERVER_HOSTNAME}'
for s in data.get('servers', []):
    if s.get('hostname') == host or s.get('name') == '${SERVER_NAME}':
        print(s['id'])
        break
")"

if [[ -n "$SERVER_ID" ]]; then
  echo "    已存在服务器 id=${SERVER_ID}"
else
  CREATE_RESP="$(curl -sS -b "$COOKIE_JAR" -X POST "${LITESTATS_URL}/api/servers" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${SERVER_NAME}\",\"hostname\":\"${SERVER_HOSTNAME}\"}")"
  SERVER_ID="$(echo "$CREATE_RESP" | json_get "d['server']['id']")"
  if [[ -z "$SERVER_ID" || "$SERVER_ID" == "None" ]]; then
    echo "创建服务器失败: $CREATE_RESP" >&2
    exit 1
  fi
  echo "    已创建服务器 id=${SERVER_ID}"
fi

DETAIL_JSON="$(curl -sS -b "$COOKIE_JAR" "${LITESTATS_URL}/api/servers/${SERVER_ID}")"
TOKEN="$(echo "$DETAIL_JSON" | json_get "d['server']['agentToken']")"

if [[ -z "$TOKEN" || "$TOKEN" == "None" ]]; then
  echo "无法获取 Agent Token" >&2
  exit 1
fi

echo "==> SSH 安装 Agent 到 ${REMOTE_HOST} ..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$REMOTE_HOST" \
  "curl -fsSL '${LITESTATS_URL}/scripts/install-litestats-agent.sh' | bash -s -- --token '${TOKEN}' --base-url '${LITESTATS_URL}'"

echo ""
echo "完成: ${LITESTATS_URL}/dashboard/servers/${SERVER_ID}"
