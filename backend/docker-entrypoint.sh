#!/bin/sh
set -e

echo "Syncing database schema…"
npx prisma db push --skip-generate --accept-data-loss

echo "Starting Next.js…"
exec npx next start -p 8000
