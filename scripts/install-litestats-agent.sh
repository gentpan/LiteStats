#!/usr/bin/env bash
# LiteStats Agent 一键安装 — 在目标 Linux 服务器上以 root/sudo 执行
# 用法:
#   curl -fsSL https://litestats.dev/scripts/install-litestats-agent.sh | sudo bash -s -- --token YOUR_TOKEN
#   curl -fsSL ... | sudo bash -s -- --token TOKEN --base-url https://litestats.dev --interval 1
set -euo pipefail

BASE_URL="${LITESTATS_BASE_URL:-https://litestats.dev}"
TOKEN="${LITESTATS_AGENT_TOKEN:-}"
ENDPOINT="${LITESTATS_AGENT_ENDPOINT:-}"
INTERVAL=1
AGENT_DIR="/usr/local/bin"
AGENT_PATH="${AGENT_DIR}/litestats-agent"
CRON_FILE="/etc/cron.d/litestats-agent"
LOG_FILE="/var/log/litestats-agent.log"

usage() {
  cat <<'EOF'
LiteStats 服务器探针一键安装

选项:
  --token TOKEN       Agent Token（必填，或在环境变量 LITESTATS_AGENT_TOKEN）
  --base-url URL      LiteStats 地址，默认 https://litestats.dev
  --endpoint URL      上报 API，默认 {base-url}/api/agent/metrics
  --interval MINUTES  cron 间隔（分钟），默认 1
  -h, --help          显示帮助

示例:
  curl -fsSL https://litestats.dev/scripts/install-litestats-agent.sh | sudo bash -s -- --token abc123
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2%/}"
      shift 2
      ;;
    --endpoint)
      ENDPOINT="$2"
      shift 2
      ;;
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "错误: 请提供 --token 或设置环境变量 LITESTATS_AGENT_TOKEN" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "错误: 请使用 root 或 sudo 运行（需要写入 ${CRON_FILE}）" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "错误: 仅支持 Linux 服务器" >&2
  exit 1
fi

ENDPOINT="${ENDPOINT:-${BASE_URL}/api/agent/metrics}"

echo "==> 下载探针脚本..."
mkdir -p "$AGENT_DIR"
curl -fsSL "${BASE_URL}/scripts/litestats-agent.sh" -o "$AGENT_PATH"
chmod 755 "$AGENT_PATH"

echo "==> 配置定时任务 (${CRON_FILE})..."
cat >"$CRON_FILE" <<EOF
# LiteStats server agent — managed by install-litestats-agent.sh
SHELL=/bin/bash
PATH=/usr/sbin:/usr/bin:/sbin:/bin
*/${INTERVAL} * * * * root LITESTATS_AGENT_TOKEN=${TOKEN} LITESTATS_AGENT_ENDPOINT=${ENDPOINT} ${AGENT_PATH} >> ${LOG_FILE} 2>&1
EOF
chmod 644 "$CRON_FILE"

touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

echo "==> 执行首次上报..."
if LITESTATS_AGENT_TOKEN="$TOKEN" LITESTATS_AGENT_ENDPOINT="$ENDPOINT" "$AGENT_PATH"; then
  echo ""
  echo "安装成功"
  echo "  探针: ${AGENT_PATH}"
  echo "  日志: ${LOG_FILE}"
  echo "  上报: ${ENDPOINT}"
  echo "  间隔: 每 ${INTERVAL} 分钟"
else
  echo "警告: 首次上报失败，请检查 Token 与网络连通性" >&2
  exit 1
fi
