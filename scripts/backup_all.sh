#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT=${BACKUP_ROOT:-backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
ROOMPIRE_BACKUP_ENCRYPTION=${ROOMPIRE_BACKUP_ENCRYPTION:-disabled}
ROOMPIRE_BACKUP_REMOVE_PLAINTEXT=${ROOMPIRE_BACKUP_REMOVE_PLAINTEXT:-true}

case "$ROOMPIRE_BACKUP_ENCRYPTION" in
  enabled | disabled) ;;
  *)
    echo "ROOMPIRE_BACKUP_ENCRYPTION must be 'enabled' or 'disabled'." >&2
    exit 2
    ;;
esac

case "$ROOMPIRE_BACKUP_REMOVE_PLAINTEXT" in
  true | false) ;;
  *)
    echo "ROOMPIRE_BACKUP_REMOVE_PLAINTEXT must be 'true' or 'false'." >&2
    exit 2
    ;;
esac

postgres_dir="$BACKUP_ROOT/postgres"
uploads_dir="$BACKUP_ROOT/uploads"

postgres_backup=$(BACKUP_DIR="$postgres_dir" ./scripts/backup_postgres.sh)
uploads_backup=$(BACKUP_DIR="$uploads_dir" ./scripts/backup_uploads.sh)

./scripts/verify_postgres_backup.sh "$postgres_backup"

encrypted_postgres_backup=""
encrypted_uploads_backup=""

if [ "$ROOMPIRE_BACKUP_ENCRYPTION" = "enabled" ]; then
  encrypted_postgres_backup=$(./scripts/encrypt_backup_file.sh "$postgres_backup")
  encrypted_uploads_backup=$(./scripts/encrypt_backup_file.sh "$uploads_backup")

  if [ "$ROOMPIRE_BACKUP_REMOVE_PLAINTEXT" = "true" ]; then
    rm -f "$postgres_backup" "$uploads_backup"
  fi
fi

find "$postgres_dir" -type f -name "roompire_*.dump" -mtime +"$RETENTION_DAYS" -delete
find "$postgres_dir" -type f -name "roompire_*.dump.enc" -mtime +"$RETENTION_DAYS" -delete
find "$postgres_dir" -type f -name "roompire_*.dump.enc.sha256" -mtime +"$RETENTION_DAYS" -delete
find "$uploads_dir" -type f -name "roompire_uploads_*.tar.gz" -mtime +"$RETENTION_DAYS" -delete
find "$uploads_dir" -type f -name "roompire_uploads_*.tar.gz.enc" -mtime +"$RETENTION_DAYS" -delete
find "$uploads_dir" -type f -name "roompire_uploads_*.tar.gz.enc.sha256" -mtime +"$RETENTION_DAYS" -delete

echo "postgres backup: $postgres_backup"
echo "uploads backup: $uploads_backup"
if [ -n "$encrypted_postgres_backup" ]; then
  echo "encrypted postgres backup: $encrypted_postgres_backup"
  echo "encrypted uploads backup: $encrypted_uploads_backup"
  if [ "$ROOMPIRE_BACKUP_REMOVE_PLAINTEXT" = "true" ]; then
    echo "plaintext backups removed after encryption: true"
  fi
fi
