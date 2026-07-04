#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup.dump>" >&2
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

timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
drill_db="roompire_restore_drill_${timestamp}_$$"

cleanup() {
  docker compose "${compose_args[@]}" exec -T postgres \
    dropdb --if-exists -U "$POSTGRES_USER" "$drill_db" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose "${compose_args[@]}" exec -T postgres \
  createdb -U "$POSTGRES_USER" "$drill_db"

cat "$backup_file" | docker compose "${compose_args[@]}" exec -T postgres \
  pg_restore --no-owner --no-privileges -U "$POSTGRES_USER" -d "$drill_db"

docker compose "${compose_args[@]}" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$drill_db" -v ON_ERROR_STOP=1 -Atc \
  'SELECT count(*) FROM "_prisma_migrations";' >/dev/null

audit_result=$(
  docker compose "${compose_args[@]}" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$drill_db" -v ON_ERROR_STOP=1 -Atc \
    "WITH ordered AS (
      SELECT
        id,
        \"prevHash\",
        \"eventHash\",
        LAG(\"eventHash\") OVER (PARTITION BY \"householdId\" ORDER BY \"occurredAt\" ASC, id ASC) AS expected_prev,
        encode(
          digest(
            roompire_audit_event_hash_payload(
              id,
              \"householdId\",
              \"actorUserId\",
              action,
              \"entityType\",
              \"entityId\",
              before,
              after,
              metadata,
              \"prevHash\",
              \"occurredAt\"
            ),
            'sha256'
          ),
          'hex'
        ) AS expected_hash
      FROM \"AuditEvent\"
    )
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE \"eventHash\" IS NOT NULL) AS hashed,
      count(*) FILTER (
        WHERE \"prevHash\" IS DISTINCT FROM expected_prev
          OR \"eventHash\" IS DISTINCT FROM expected_hash
      ) AS broken
    FROM ordered;"
)

IFS="|" read -r total hashed broken <<<"$audit_result"

if [ "${broken:-0}" != "0" ]; then
  echo "Audit hash chain failed in restore drill: total=$total hashed=$hashed broken=$broken" >&2
  exit 1
fi

echo "restore drill ok: database=$drill_db audit_total=$total audit_hashed=$hashed audit_broken=$broken"
