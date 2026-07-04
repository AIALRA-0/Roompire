#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT=${BACKUP_ROOT:-backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}

postgres_dir="$BACKUP_ROOT/postgres"
uploads_dir="$BACKUP_ROOT/uploads"

postgres_backup=$(BACKUP_DIR="$postgres_dir" ./scripts/backup_postgres.sh)
uploads_backup=$(BACKUP_DIR="$uploads_dir" ./scripts/backup_uploads.sh)

./scripts/verify_postgres_backup.sh "$postgres_backup"

find "$postgres_dir" -type f -name "roompire_*.dump" -mtime +"$RETENTION_DAYS" -delete
find "$uploads_dir" -type f -name "roompire_uploads_*.tar.gz" -mtime +"$RETENTION_DAYS" -delete

echo "postgres backup: $postgres_backup"
echo "uploads backup: $uploads_backup"
