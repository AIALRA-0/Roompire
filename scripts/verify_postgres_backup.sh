#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ROOMPIRE_RESTORE_DRILL_STATUS_FILE=${ROOMPIRE_RESTORE_DRILL_STATUS_FILE:-ops/status/latest-restore-drill.json}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup.dump|backup.dump.enc>" >&2
  exit 2
fi

backup_file=$1
requested_backup_file=$backup_file
status_written=false

write_restore_drill_status() {
  local status=$1
  local message=$2
  local audit_total=${3:-}
  local audit_hashed=${4:-}
  local audit_broken=${5:-}
  local drill_database=${6:-}

  STATUS_FILE=$ROOMPIRE_RESTORE_DRILL_STATUS_FILE \
    STATUS=$status \
    MESSAGE=$message \
    BACKUP_FILE=$requested_backup_file \
    DRILL_DATABASE=$drill_database \
    AUDIT_TOTAL=$audit_total \
    AUDIT_HASHED=$audit_hashed \
    AUDIT_BROKEN=$audit_broken \
    node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function numberOrNull(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

const statusFile = process.env.STATUS_FILE;
const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: process.env.STATUS,
  backupFile: process.env.BACKUP_FILE || null,
  drillDatabase: process.env.DRILL_DATABASE || null,
  auditTotal: numberOrNull(process.env.AUDIT_TOTAL),
  auditHashed: numberOrNull(process.env.AUDIT_HASHED),
  auditBroken: numberOrNull(process.env.AUDIT_BROKEN),
  message: process.env.MESSAGE || null,
};

fs.mkdirSync(path.dirname(statusFile), { recursive: true });
const tmpPath = `${statusFile}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, statusFile);
NODE

  status_written=true
}

if [ ! -f "$backup_file" ]; then
  write_restore_drill_status "failed" "Backup file not found."
  echo "Backup file not found: $backup_file" >&2
  exit 2
fi
decrypted_backup=""

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
  local exit_code=$?
  docker compose "${compose_args[@]}" exec -T postgres \
    dropdb --if-exists -U "$POSTGRES_USER" "$drill_db" >/dev/null 2>&1 || true
  rm -f "$decrypted_backup"

  if [ "$exit_code" -ne 0 ] && [ "$status_written" != "true" ]; then
    write_restore_drill_status "failed" "Restore drill failed." "" "" "" "$drill_db" || true
  fi

  return "$exit_code"
}
trap cleanup EXIT

if [[ "$backup_file" == *.enc ]]; then
  decrypted_backup=$(mktemp "${TMPDIR:-/tmp}/roompire_restore_drill.XXXXXX.dump")
  rm -f "$decrypted_backup"
  "$SCRIPT_DIR/decrypt_backup_file.sh" "$backup_file" "$decrypted_backup" >/dev/null
  backup_file="$decrypted_backup"
fi

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
  write_restore_drill_status \
    "failed" \
    "Audit hash chain failed in restore drill." \
    "$total" \
    "$hashed" \
    "$broken" \
    "$drill_db"
  echo "Audit hash chain failed in restore drill: total=$total hashed=$hashed broken=$broken" >&2
  exit 1
fi

write_restore_drill_status \
  "passed" \
  "Restore drill completed successfully." \
  "$total" \
  "$hashed" \
  "$broken" \
  "$drill_db"

echo "restore drill ok: database=$drill_db audit_total=$total audit_hashed=$hashed audit_broken=$broken"
