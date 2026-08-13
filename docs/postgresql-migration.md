# Migracao para PostgreSQL

Este projeto ainda pode rodar em SQLite, mas ja tem um caminho seguro para virar PostgreSQL na VPS.

## 1. Gerar backup e exportar SQLite

No servidor:

```bash
cd /opt/novo-saas
mkdir -p /opt/backups/merli360
docker cp merli360_app:/app/data/dev.db /opt/backups/merli360/dev-$(date +%F-%H%M%S)-before-postgres.db
docker compose --env-file .env.production -p novo_saas exec merli360_app node scripts/export-sqlite-json.js /app/data/sqlite-export.json
docker cp merli360_app:/app/data/sqlite-export.json /opt/backups/merli360/sqlite-export.json
```

## 2. Configurar variaveis

Adicione no `.env.production`:

```bash
POSTGRES_DB=merli360
POSTGRES_USER=merli360
POSTGRES_PASSWORD=uma_senha_forte
AUTH_SECRET=um_secret_longo
```

Para push nos celulares:

```bash
docker compose --env-file .env.production -p novo_saas run --rm merli360_app node scripts/generate-vapid.js
```

Copie as chaves geradas para `.env.production`.

## 3. Subir PostgreSQL

```bash
docker compose -f docker-compose.postgres.yml --env-file .env.production -p novo_saas up -d --build
```

## 4. Importar dados

Copie o JSON exportado para o novo container e importe:

```bash
docker cp /opt/backups/merli360/sqlite-export.json merli360_app:/app/data/sqlite-export.json
docker compose -f docker-compose.postgres.yml --env-file .env.production -p novo_saas exec merli360_app node scripts/import-json-to-postgres.js /app/data/sqlite-export.json
```

## 5. Validar

```bash
docker compose -f docker-compose.postgres.yml --env-file .env.production -p novo_saas ps
curl -I http://127.0.0.1:3100/login
curl -I https://gestao.evolyncagenda.com/login
curl -I https://agro.evolyncagenda.com/login
```
