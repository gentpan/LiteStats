#!/bin/sh
# LiteStats 探针：采集本机 CPU / 内存 / 磁盘 / 网速 / 负载 / 连接，上报到本项目。
# 这是 LiteStats 自己的程序，不要安装 CF-Server-Monitor 或 cfsm-agent。
set -eu

URL="${LITESTATS_URL:-}"
ID="${LITESTATS_ID:-}"
SECRET="${LITESTATS_SECRET:-}"
INTERVAL="${LITESTATS_INTERVAL:-15}"
PING="${LITESTATS_PING:-0}"
ONCE=0
STATE_FILE="${LITESTATS_STATE:-/tmp/litestats-agent.state}"

usage() {
  echo "用法: litestats-agent --url URL --id ID --secret SECRET [--interval 15] [--ping] [--once]" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --url|-url) URL="$2"; shift 2 ;;
    --url=*|-url=*) URL="${1#*=}"; shift ;;
    --id|-id) ID="$2"; shift 2 ;;
    --id=*|-id=*) ID="${1#*=}"; shift ;;
    --secret|-secret) SECRET="$2"; shift 2 ;;
    --secret=*|-secret=*) SECRET="${1#*=}"; shift ;;
    --interval|-interval) INTERVAL="$2"; shift 2 ;;
    --interval=*|-interval=*) INTERVAL="${1#*=}"; shift ;;
    --ping|-ping) PING=1; shift ;;
    --once) ONCE=1; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1" >&2; usage ;;
  esac
done

[ -n "$URL" ] && [ -n "$ID" ] && [ -n "$SECRET" ] || usage
case "$INTERVAL" in
  ''|*[!0-9]*) INTERVAL=15 ;;
esac
[ "$INTERVAL" -ge 5 ] || INTERVAL=5

report_url() {
  u=$(printf '%s' "$URL" | sed 's|/*$||')
  case "$u" in
    */api/monitor/update) printf '%s\n' "$u" ;;
    */api/monitor) printf '%s/update\n' "$u" ;;
    *) printf '%s/api/monitor/update\n' "$u" ;;
  esac
}

json_esc() {
  printf '%s' "$1" | awk 'BEGIN { ORS="" } {
    gsub(/\\/, "\\\\")
    gsub(/"/, "\\\"")
    gsub(/\t/, "\\t")
    gsub(/\r/, "")
    gsub(/\n/, "\\n")
    print
  }'
}

read_cpu() {
  if [ -r /proc/stat ]; then
    awk '/^cpu / {
      idle = $5 + $6
      busy = $2 + $3 + $4 + $7 + $8 + $9
      print idle, busy
      exit
    }' /proc/stat
    return
  fi
  set -- $(sysctl -n kern.cp_time 2>/dev/null || echo "0 0 0 0 0")
  echo "$4 $(($1 + $2 + $3 + ${5:-0}))"
}

read_net() {
  if [ -r /proc/net/dev ]; then
    awk '
      NR < 3 { next }
      {
        gsub(/:/, " ")
        name = $1
        if (name == "lo" || name == "lo0" || name ~ /^(docker|veth|br-|cni|flannel|calico|virbr|tun|tap)/) next
        rx += $2; tx += $10
      }
      END { print rx+0, tx+0 }
    ' /proc/net/dev
    return
  fi
  netstat -ibn 2>/dev/null | awk '
    $1 == "Name" { next }
    $3 ~ /Link/ {
      name = $1
      if (name == "lo0" || name ~ /^(gif|stf|awdl|llw|utun|bridge|vmenet|ap|lo)/) next
      rx += $7+0; tx += $10+0
    }
    END { print rx+0, tx+0 }
  '
}

read_mem() {
  if [ -r /proc/meminfo ]; then
    awk '
      $1 == "MemTotal:" { total = $2 }
      $1 == "MemAvailable:" { avail = $2 }
      END {
        total_mb = int(total / 1024)
        used_mb = int((total - avail) / 1024)
        if (used_mb < 0) used_mb = 0
        print total_mb, used_mb
      }
    ' /proc/meminfo
    return
  fi
  total=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 / 1024 ))
  page=$(pagesize 2>/dev/null || echo 4096)
  vm=$(vm_stat 2>/dev/null || true)
  active=$(printf '%s\n' "$vm" | awk '/Pages active/ { gsub(/\./, "", $3); print $3+0; exit }')
  wired=$(printf '%s\n' "$vm" | awk '/Pages wired/ { gsub(/\./, "", $NF); print $NF+0; exit }')
  compressed=$(printf '%s\n' "$vm" | awk '/compressor/ { gsub(/\./, "", $NF); print $NF+0; exit }')
  used=$(( (${active:-0} + ${wired:-0} + ${compressed:-0}) * page / 1024 / 1024 ))
  [ "$used" -le "$total" ] || used=$total
  echo "$total $used"
}

read_swap() {
  if [ -r /proc/meminfo ]; then
    awk '
      $1 == "SwapTotal:" { total = $2 }
      $1 == "SwapFree:" { free = $2 }
      END { print int(total/1024), int((total-free)/1024) }
    ' /proc/meminfo
    return
  fi
  echo "0 0"
}

read_disk() {
  df -kP / 2>/dev/null | awk 'NR == 2 { print int($2/1024), int($3/1024) }'
}

read_load() {
  if [ -r /proc/loadavg ]; then
    awk '{ print $1, $2, $3 }' /proc/loadavg
    return
  fi
  sysctl -n vm.loadavg 2>/dev/null | awk '{ gsub(/[{}]/, ""); print $1, $2, $3 }'
}

read_boot_ms() {
  if [ -r /proc/stat ]; then
    awk '/^btime / { print $2 * 1000; exit }' /proc/stat
    return
  fi
  sysctl -n kern.boottime 2>/dev/null | awk -F'[=,}]' '{ for (i=1;i<=NF;i++) if ($i ~ /sec /) { gsub(/[^0-9]/, "", $(i+1)); print $(i+1) * 1000; exit } }'
}

read_os() {
  if [ -r /etc/os-release ]; then
    awk -F= '/^PRETTY_NAME=/ { gsub(/"/, "", $2); print $2; exit }' /etc/os-release
    return
  fi
  if command -v sw_vers >/dev/null 2>&1; then
    echo "$(sw_vers -productName) $(sw_vers -productVersion)"
    return
  fi
  uname -s
}

read_cpu_info() {
  if [ -r /proc/cpuinfo ]; then
    awk -F: '/model name/ { gsub(/^ /,"",$2); print $2; exit }' /proc/cpuinfo
    return
  fi
  sysctl -n machdep.cpu.brand_string 2>/dev/null || echo CPU
}

read_cores() {
  if command -v nproc >/dev/null 2>&1; then
    nproc
    return
  fi
  sysctl -n hw.ncpu 2>/dev/null || echo 1
}

read_processes() {
  if [ -d /proc ]; then
    ls -1d /proc/[0-9]* 2>/dev/null | wc -l | tr -d ' '
    return
  fi
  ps -A 2>/dev/null | wc -l | awk '{ print ($1>0?$1-1:0) }'
}

read_socks() {
  kind=$1
  if [ -r /proc/net/sockstat ]; then
    key=TCP
    [ "$kind" = udp ] && key=UDP
    awk -v key="$key" '$1 == key":" { for (i=1;i<=NF;i++) if ($i=="inuse") { print $(i+1); exit } }' /proc/net/sockstat
    return
  fi
  netstat -an 2>/dev/null | awk -v proto="$kind" 'BEGIN { p=tolower(proto) } tolower($1) ~ "^"p { n++ } END { print n+0 }'
}

ping_ms() {
  host=$1
  out=$(ping -c 1 -W 1 "$host" 2>/dev/null || ping -c 1 -W 1000 "$host" 2>/dev/null || true)
  printf '%s\n' "$out" | awk -F'time=' 'NF>1 { split($2, a, " "); gsub(/ms/,"",a[1]); if (a[1]+0==a[1]) { printf "%d", a[1]+0; exit } }'
}

save_state() {
  echo "$1 $2 $3 $4 $5" > "$STATE_FILE"
}

load_state() {
  if [ -r "$STATE_FILE" ]; then
    cat "$STATE_FILE"
    return
  fi
  echo ""
}

now_ms() {
  if date +%s%3N 2>/dev/null | grep -Eq '^[0-9]+$'; then
    date +%s%3N
    return
  fi
  python3 -c 'import time; print(int(time.time()*1000))' 2>/dev/null || echo $(( $(date +%s) * 1000 ))
}

collect_and_post() {
  set -- $(read_cpu)
  idle=$1 busy=$2
  set -- $(read_net)
  rx=$1 tx=$2
  at=$(now_ms)
  prev=$(load_state)
  if [ -z "$prev" ]; then
    save_state "$at" "$idle" "$busy" "$rx" "$tx"
    sleep 1
    set -- $(read_cpu)
    idle=$1 busy=$2
    set -- $(read_net)
    rx=$1 tx=$2
    at=$(now_ms)
    prev=$(load_state)
  fi
  set -- $prev
  p_at=$1 p_idle=$2 p_busy=$3 p_rx=$4 p_tx=$5
  save_state "$at" "$idle" "$busy" "$rx" "$tx"

  d_idle=$(( idle - p_idle )); [ "$d_idle" -ge 0 ] || d_idle=0
  d_busy=$(( busy - p_busy )); [ "$d_busy" -ge 0 ] || d_busy=0
  d_rx=$(( rx - p_rx )); [ "$d_rx" -ge 0 ] || d_rx=0
  d_tx=$(( tx - p_tx )); [ "$d_tx" -ge 0 ] || d_tx=0
  dt=$(( at - p_at ))
  [ "$dt" -gt 0 ] || dt=1000
  cpu=$(awk -v b="$d_busy" -v i="$d_idle" 'BEGIN { t=b+i; if (t<=0) print 0; else printf "%.2f", b*100/t }')
  in_speed=$(awk -v n="$d_rx" -v dt="$dt" 'BEGIN { printf "%d", n*1000/dt }')
  out_speed=$(awk -v n="$d_tx" -v dt="$dt" 'BEGIN { printf "%d", n*1000/dt }')

  set -- $(read_mem)
  ram_total=$1 ram_used=$2
  set -- $(read_swap)
  swap_total=$1 swap_used=$2
  set -- $(read_disk)
  disk_total=${1:-0} disk_used=${2:-0}
  load=$(read_load)
  boot=$(read_boot_ms)
  os=$(read_os)
  arch=$(uname -m)
  kernel="$(uname -s) $(uname -r)"
  cpu_info=$(read_cpu_info)
  cores=$(read_cores)
  processes=$(read_processes)
  tcp=$(read_socks tcp)
  udp=$(read_socks udp)

  ping_json=""
  if [ "$PING" = 1 ]; then
    ct=$(ping_ms 202.96.128.86 || true)
    cu=$(ping_ms 210.22.84.3 || true)
    cm=$(ping_ms 211.136.17.107 || true)
    bd=$(ping_ms 223.5.5.5 || true)
    [ -n "$ct" ] && ping_json="$ping_json,\"ping_ct\":$ct"
    [ -n "$cu" ] && ping_json="$ping_json,\"ping_cu\":$cu"
    [ -n "$cm" ] && ping_json="$ping_json,\"ping_cm\":$cm"
    [ -n "$bd" ] && ping_json="$ping_json,\"ping_bd\":$bd"
  fi

  body=$(printf '%s' "{\"id\":\"$(json_esc "$ID")\",\"secret\":\"$(json_esc "$SECRET")\",\"metrics\":{\"cpu\":$cpu,\"ram_total\":${ram_total:-0},\"ram_used\":${ram_used:-0},\"swap_total\":${swap_total:-0},\"swap_used\":${swap_used:-0},\"disk_total\":${disk_total:-0},\"disk_used\":${disk_used:-0},\"load_avg\":\"$(json_esc "$load")\",\"boot_time\":${boot:-0},\"net_rx\":$rx,\"net_tx\":$tx,\"net_in_speed\":$in_speed,\"net_out_speed\":$out_speed,\"os\":\"$(json_esc "$os")\",\"arch\":\"$(json_esc "$arch")\",\"kernel_version\":\"$(json_esc "$kernel")\",\"cpu_info\":\"$(json_esc "$cpu_info")\",\"cpu_cores\":${cores:-1},\"processes\":${processes:-0},\"tcp_conn\":${tcp:-0},\"udp_conn\":${udp:-0}$ping_json}}")
  curl -sS -m 15 -X POST "$(report_url)" -H "Content-Type: application/json" --data-binary "$body" >/dev/null
}

collect_and_post
[ "$ONCE" = 1 ] && exit 0
while :; do
  sleep "$INTERVAL"
  collect_and_post || true
done
