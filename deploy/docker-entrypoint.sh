#!/bin/sh
set -e

cd /app/apps/web

echo "Applying database schema..."
PRISMA_BIN="$(find /app/node_modules/.bun -path '*/prisma/build/index.js' | head -1)"
bun "$PRISMA_BIN" db push --skip-generate

if [ "$RUN_DB_SEED" = "true" ]; then
  echo "Seeding database..."
  SEED_NODE_PATH="$(find /app/node_modules/.bun -maxdepth 1 -type d | tr '\n' ':'):/app/node_modules"
  NODE_PATH="$SEED_NODE_PATH" bun prisma/seed.ts || true
fi

cd /app
echo "Starting LiteStats on port ${PORT:-3000}..."
exec bun apps/web/server.js
