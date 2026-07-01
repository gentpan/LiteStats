#!/bin/sh
set -e

cd /app/apps/web

echo "Waiting for database..."
sleep 5

SEED_NODE_PATH="$(find /app/node_modules/.bun -maxdepth 1 -type d | tr '\n' ':'):/app/node_modules"
export NODE_PATH="$SEED_NODE_PATH"

echo "Starting LiteStats monitor worker..."
exec bun prisma/monitor-worker.ts
