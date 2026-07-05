#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
BACKUP_DIR=${BACKUP_DIR:-backups/file-manifests}

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

storage_provider=${ROOMPIRE_FILE_STORAGE_PROVIDER:-local}
storage_bucket=${ROOMPIRE_S3_BUCKET:-}

mkdir -p "$BACKUP_DIR"
timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
output="$BACKUP_DIR/roompire_file_manifest_${timestamp}.json"

docker compose "${compose_args[@]}" exec -T postgres \
  psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -X \
    -q \
    -t \
    -A \
    -v storage_provider="$storage_provider" \
    -v storage_bucket="$storage_bucket" \
    <<'SQL' > "$output"
WITH files AS (
  SELECT
    "id",
    "householdId",
    "uploadedByUserId",
    "storageProvider",
    "bucket",
    "objectKey",
    "originalFilename",
    "mimeType",
    "sizeBytes",
    "sha256",
    "createdAt"
  FROM "File"
  ORDER BY "createdAt", "id"
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'configuredStorageProvider', :'storage_provider',
    'configuredBucket', nullif(:'storage_bucket', ''),
    'summary', jsonb_build_object(
      'fileCount', count(*),
      'completedFileCount', count(*) FILTER (WHERE "sha256" <> 'pending'),
      'pendingFileCount', count(*) FILTER (WHERE "sha256" = 'pending'),
      'totalSizeBytes', coalesce(sum("sizeBytes"), 0)
    ),
    'files', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', "id",
          'householdId', "householdId",
          'uploadedByUserId', "uploadedByUserId",
          'storageProvider', "storageProvider",
          'bucket', "bucket",
          'objectKey', "objectKey",
          'originalFilename', "originalFilename",
          'mimeType', "mimeType",
          'sizeBytes', "sizeBytes",
          'sha256', "sha256",
          'createdAt', "createdAt"
        )
        ORDER BY "createdAt", "id"
      ) FILTER (WHERE "id" IS NOT NULL),
      '[]'::jsonb
    )
  )
)
FROM files;
SQL

node -e "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'))" "$output"

echo "$output"
