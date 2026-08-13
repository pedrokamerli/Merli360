#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="file:/app/data/dev.db"
fi

DB_WAS_MISSING=false
if [ ! -f "/app/data/dev.db" ]; then
  DB_WAS_MISSING=true
fi

echo "Sincronizando schema Prisma do Merli360..."
npx prisma db push
node prisma/ensure-defaults.js
node scripts/migrate-financial-legacy.js

if [ "$DB_WAS_MISSING" = "true" ]; then
  echo "Inicializando banco SQLite do Merli360..."
  npx prisma db seed
else
  echo "Banco SQLite existente encontrado."
fi

exec "$@"
