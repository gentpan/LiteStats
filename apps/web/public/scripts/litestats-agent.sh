#!/usr/bin/env bash
# LiteStats 服务器探针 — 在目标 Linux 服务器上通过 cron 定期执行
set -euo pipefail

ENDPOINT="${LITESTATS_AGENT_ENDPOINT:-https://litestats.dev/api/agent/metrics}"
TOKEN="${LITESTATS_AGENT_TOKEN:?请设置 LITESTATS_AGENT_TOKEN}"

read_cpu_percent() {
  if command -v mpstat >/dev/null 2>&1; then
    mpstat 1 1 | awk '/Average/ {printf "%.1f", 100 - $NF}'
    return
  fi

  if top -bn1 2>/dev/null | grep -qi "cpu(s)"; then
    top -bn1 | grep -i "cpu(s)" | head -1 | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{printf "%.1f", 100 - $1}'
    return
  fi

  awk '/^cpu / {idle=$5; total=0; for (i=2;i<=NF;i++) total+=$i; if (total>0) printf "%.1f", (total-idle)*100/total}' /proc/stat
}

MEM_TOTAL=$(awk '/MemTotal:/ {print $2 * 1024}' /proc/meminfo)
MEM_AVAIL=$(awk '/MemAvailable:/ {print $2 * 1024}' /proc/meminfo)
MEM_USED=$((MEM_TOTAL - MEM_AVAIL))
DISK_LINE=$(df -B1 --output=used,size / 2>/dev/null | tail -1 || df -B1 / | tail -1)
DISK_USED=$(echo "$DISK_LINE" | awk '{print $1}')
DISK_TOTAL=$(echo "$DISK_LINE" | awk '{print $2}')
LOAD1=$(awk '{print $1}' /proc/loadavg)
UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime)
CPU_PERCENT=$(read_cpu_percent)

curl -sS -X POST "$ENDPOINT" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{
  "cpuPercent": ${CPU_PERCENT:-0},
  "memUsed": ${MEM_USED:-0},
  "memTotal": ${MEM_TOTAL:-0},
  "diskUsed": ${DISK_USED:-0},
  "diskTotal": ${DISK_TOTAL:-0},
  "load1": ${LOAD1:-0},
  "uptimeSec": ${UPTIME_SEC:-0}
}
EOF
)" >/dev/null

echo "metrics sent to $ENDPOINT"
