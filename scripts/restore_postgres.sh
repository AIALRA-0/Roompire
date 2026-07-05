#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup.dump|backup.dump.enc>" >&2
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
decrypted_backup=""
cleanup() {
  rm -f "$decrypted_backup"
}
trap cleanup EXIT

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

if [[ "$backup_file" == *.enc ]]; then
  decrypted_backup=$(mktemp "${TMPDIR:-/tmp}/roompire_restore.XXXXXX.dump")
  rm -f "$decrypted_backup"
  "$SCRIPT_DIR/decrypt_backup_file.sh" "$backup_file" "$decrypted_backup" >/dev/null
  backup_file="$decrypted_backup"
fi

cat "$backup_file" | docker compose "${compose_args[@]}" exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"
