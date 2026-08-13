#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL PostgreSQL obrigatoria."
  exit 1
fi

node scripts/create-postgres-schema.js
echo "Sincronizando schema PostgreSQL do Merli360..."
npx prisma db push --schema prisma/schema.postgres.prisma
node prisma/ensure-defaults.js
node scripts/migrate-financial-legacy.js

exec "$@"
