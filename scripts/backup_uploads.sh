#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-backups/uploads}
UPLOADS_VOLUME=${UPLOADS_VOLUME:-roompire_uploads}

case "$BACKUP_DIR" in
  /*) host_backup_dir="$BACKUP_DIR" ;;
  *) host_backup_dir="$(pwd)/$BACKUP_DIR" ;;
esac

mkdir -p "$host_backup_dir"
timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
output="$BACKUP_DIR/roompire_uploads_${timestamp}.tar.gz"

docker run --rm \
  -v "${UPLOADS_VOLUME}:/uploads:ro" \
  -v "${host_backup_dir}:/backup" \
  alpine:3.22 \
  tar -czf "/backup/$(basename "$output")" -C /uploads .

echo "$output"
