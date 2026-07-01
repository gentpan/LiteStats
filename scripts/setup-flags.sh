#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-$HOME/Downloads/flags.zip}"
TARGET_DIR="$(cd "$(dirname "$0")/../apps/web/public" && pwd)"

if [ ! -f "$ZIP_PATH" ]; then
  echo "找不到 flags.zip: $ZIP_PATH"
  echo "用法: $0 [/path/to/flags.zip]"
  exit 1
fi

echo "解压国旗到 ${TARGET_DIR}/flags ..."
unzip -q -o "$ZIP_PATH" -d "$TARGET_DIR"
echo "完成: ${TARGET_DIR}/flags/{1x1,4x3}"
