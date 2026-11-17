#!/bin/sh
set -e
node scripts/migrate.mjs
if [ "${SEED:-0}" = "1" ]; then
  node scripts/seed.ts
fi
exec "$@"
