#!/bin/sh
set -eu

APP_DIR="/opt/novo-saas"
COMPOSE_FILE="docker-compose.postgres.yml"
SERVICE="merli360_app"
LOG_FILE="$APP_DIR/deploy.log"

cd "$APP_DIR"

log() {
  printf '%s %s\n' "$(date -Is)" "$*" >> "$LOG_FILE"
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "abort: $APP_DIR is not a git repository"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  log "abort: local working tree has uncommitted changes"
  git status --short >> "$LOG_FILE"
  exit 1
fi

git fetch origin main >> "$LOG_FILE" 2>&1

LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "no change: $LOCAL_SHA"
  exit 0
fi

log "deploy start: $LOCAL_SHA -> $REMOTE_SHA"
git merge --ff-only origin/main >> "$LOG_FILE" 2>&1

docker compose --env-file .env.production -f "$COMPOSE_FILE" up -d --build --no-deps "$SERVICE" >> "$LOG_FILE" 2>&1

NEW_SHA="$(git rev-parse HEAD)"
log "deploy complete: $NEW_SHA"
