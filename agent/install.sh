#!/bin/sh
# 把 LiteStats 探针装成系统服务。不要用这个脚本去装 cfsm-agent。
set -eu

URL=""
ID=""
SECRET=""
INTERVAL=15
PING=0
ACTION=install

usage() {
  cat >&2 <<EOF
用法:
  curl -fsSL <LiteStats地址>/install.sh | sudo sh -s -- --url URL --id ID --secret SECRET
  sh install.sh uninstall
EOF
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    install) ACTION=install; shift ;;
    uninstall) ACTION=uninstall; shift ;;
    --url|-url) URL="$2"; shift 2 ;;
    --url=*|-url=*) URL="${1#*=}"; shift ;;
    --id|-id) ID="$2"; shift 2 ;;
    --id=*|-id=*) ID="${1#*=}"; shift ;;
    --secret|-secret) SECRET="$2"; shift 2 ;;
    --secret=*|-secret=*) SECRET="${1#*=}"; shift ;;
    --interval|-interval) INTERVAL="$2"; shift 2 ;;
    --interval=*|-interval=*) INTERVAL="${1#*=}"; shift ;;
    --ping|-ping) PING=1; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1" >&2; usage ;;
  esac
done

BIN=/usr/local/bin/litestats-agent
ENV_FILE=/etc/litestats-agent.env
UNIT=/etc/systemd/system/litestats-agent.service
OPENRC=/etc/init.d/litestats-agent

if [ "$ACTION" = uninstall ]; then
  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now litestats-agent 2>/dev/null || true
  fi
  if command -v rc-update >/dev/null 2>&1; then
    rc-update del litestats-agent default 2>/dev/null || true
    rc-service litestats-agent stop 2>/dev/null || true
  fi
  rm -f "$BIN" "$ENV_FILE" "$UNIT" "$OPENRC" /tmp/litestats-agent.state
  echo "已卸载 LiteStats 探针"
  exit 0
fi

[ -n "$URL" ] && [ -n "$ID" ] && [ -n "$SECRET" ] || usage
URL=$(printf '%s' "$URL" | sed 's|/*$||')

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 安装（sudo）" >&2
  exit 1
fi

tmp=$(mktemp)
if ! curl -fsSL "$URL/litestats-agent.sh" -o "$tmp"; then
  echo "下载探针失败: $URL/litestats-agent.sh" >&2
  rm -f "$tmp"
  exit 1
fi
install -m 755 "$tmp" "$BIN"
rm -f "$tmp"

umask 077
cat > "$ENV_FILE" <<EOF
LITESTATS_URL=$URL
LITESTATS_ID=$ID
LITESTATS_SECRET=$SECRET
LITESTATS_INTERVAL=$INTERVAL
LITESTATS_PING=$PING
EOF
chmod 600 "$ENV_FILE"

if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  cat > "$UNIT" <<'EOF'
[Unit]
Description=LiteStats server probe
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/litestats-agent.env
ExecStart=/usr/local/bin/litestats-agent
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now litestats-agent
  echo "已安装并启动 litestats-agent（systemd）"
  echo "查看: systemctl status litestats-agent"
  exit 0
fi

if command -v rc-update >/dev/null 2>&1; then
  cat > "$OPENRC" <<'EOF'
#!/sbin/openrc-run
name="litestats-agent"
command="/usr/local/bin/litestats-agent"
command_background=true
pidfile="/run/litestats-agent.pid"
supervisor=supervise-daemon

depend() {
  need net
}

start_pre() {
  if [ -f /etc/litestats-agent.env ]; then
    set -a
    # shellcheck disable=SC1091
    . /etc/litestats-agent.env
    set +a
  fi
}
EOF
  chmod 755 "$OPENRC"
  rc-update add litestats-agent default
  rc-service litestats-agent start
  echo "已安装并启动 litestats-agent（OpenRC）"
  exit 0
fi

echo "没有 systemd / OpenRC。探针已放到 $BIN，请自行保活，例如："
echo "  nohup env \$(grep -v '^#' $ENV_FILE | xargs) $BIN >/var/log/litestats-agent.log 2>&1 &"
