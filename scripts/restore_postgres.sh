#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup.dump>" >&2
  exit 2
fi

if [ "${ROOMPIRE_RESTORE_CONFIRM:-}" != "restore" ]; then
  echo "Set ROOMPIRE_RESTORE_CONFIRM=restore to confirm destructive restore." >&2
  exit 2
fi

backup_file=$1
if [ ! -f "$backup_file" ]; then
  echo "Backup file not found: $backup_file" >&2
  exit 2
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  compose_args=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
else
  compose_args=(-f "$COMPOSE_FILE")
fi

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

cat "$backup_file" | docker compose "${compose_args[@]}" exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"
