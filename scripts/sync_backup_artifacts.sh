#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT=${BACKUP_ROOT:-backups}
ROOMPIRE_BACKUP_OFFSITE_MODE=${ROOMPIRE_BACKUP_OFFSITE_MODE:-disabled}
ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE=${ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE:-ops/status/backup-offsite.json}
ROOMPIRE_BACKUP_OFFSITE_ALLOW_SAME_FILESYSTEM=${ROOMPIRE_BACKUP_OFFSITE_ALLOW_SAME_FILESYSTEM:-false}

case "$ROOMPIRE_BACKUP_OFFSITE_MODE" in
  disabled | local | rclone) ;;
  *)
    echo "ROOMPIRE_BACKUP_OFFSITE_MODE must be 'disabled', 'local', or 'rclone'." >&2
    exit 2
    ;;
esac

write_status() {
  local status=$1
  local mode=$2
  local target=$3
  local artifact_count=$4
  local total_bytes=$5
  local latest_artifact=$6
  local error=$7
  local source_device_id=${8:-}
  local target_device_id=${9:-}
  local same_filesystem=${10:-unknown}

  STATUS_FILE="$ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE" \
    STATUS="$status" \
    MODE="$mode" \
    TARGET="$target" \
    ARTIFACT_COUNT="$artifact_count" \
    TOTAL_BYTES="$total_bytes" \
    LATEST_ARTIFACT="$latest_artifact" \
    ERROR_MESSAGE="$error" \
    SOURCE_DEVICE_ID="$source_device_id" \
    TARGET_DEVICE_ID="$target_device_id" \
    SAME_FILESYSTEM="$same_filesystem" \
    SAME_FILESYSTEM_ALLOWED="$ROOMPIRE_BACKUP_OFFSITE_ALLOW_SAME_FILESYSTEM" \
    node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function nullableString(value) {
  return value && value !== "unknown" ? value : null;
}

function nullableBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

const statusFile = process.env.STATUS_FILE;
const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: process.env.MODE,
  configured: process.env.MODE !== "disabled",
  target: process.env.TARGET || null,
  artifactCount: Number(process.env.ARTIFACT_COUNT || "0"),
  totalBytes: Number(process.env.TOTAL_BYTES || "0"),
  latestArtifact: process.env.LATEST_ARTIFACT || null,
  status: process.env.STATUS,
  error: process.env.ERROR_MESSAGE || null,
  sourceDeviceId: nullableString(process.env.SOURCE_DEVICE_ID),
  targetDeviceId: nullableString(process.env.TARGET_DEVICE_ID),
  sameFilesystem: nullableBoolean(process.env.SAME_FILESYSTEM),
  sameFilesystemAllowed: process.env.SAME_FILESYSTEM_ALLOWED === "true",
};

fs.mkdirSync(path.dirname(statusFile), { recursive: true });
const tmpPath = `${statusFile}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, statusFile);
NODE
}

collect_artifacts() {
  local source_root=$1

  find "$source_root" -type f \( -name "*.enc" -o -name "*.sha256" \) -print0 | sort -z
}

if [ "$ROOMPIRE_BACKUP_OFFSITE_MODE" = "disabled" ]; then
  write_status "warning" "disabled" "" 0 0 "" "Offsite backup sync is disabled."
  echo "offsite backup sync disabled"
  exit 0
fi

if [ ! -d "$BACKUP_ROOT" ]; then
  write_status "warning" "$ROOMPIRE_BACKUP_OFFSITE_MODE" "" 0 0 "" "Backup root does not exist."
  echo "Backup root does not exist: $BACKUP_ROOT" >&2
  exit 1
fi

source_abs=$(realpath -m "$BACKUP_ROOT")
mapfile -d "" -t artifacts < <(collect_artifacts "$source_abs")

if [ "${#artifacts[@]}" -eq 0 ]; then
  write_status "warning" "$ROOMPIRE_BACKUP_OFFSITE_MODE" "" 0 0 "" "No encrypted backup artifacts were found."
  echo "No encrypted backup artifacts were found under $source_abs." >&2
  exit 1
fi

artifact_count=0
total_bytes=0
latest_artifact=""
latest_mtime=0

for artifact in "${artifacts[@]}"; do
  artifact_count=$((artifact_count + 1))
  size=$(stat -c "%s" "$artifact")
  mtime=$(stat -c "%Y" "$artifact")
  total_bytes=$((total_bytes + size))

  if [ "$mtime" -ge "$latest_mtime" ]; then
    latest_mtime=$mtime
    latest_artifact="$artifact"
  fi
done

if [ "$ROOMPIRE_BACKUP_OFFSITE_MODE" = "local" ]; then
  if [ -z "${ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR:-}" ]; then
    write_status "warning" "local" "" "$artifact_count" "$total_bytes" "$latest_artifact" "ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR is required for local mode."
    echo "ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR is required for local mode." >&2
    exit 2
  fi

  target_abs=$(realpath -m "$ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR")

  if [ "$target_abs" = "$source_abs" ] || [[ "$target_abs" == "$source_abs/"* ]]; then
    write_status "warning" "local" "local:$target_abs" "$artifact_count" "$total_bytes" "$latest_artifact" "Offsite target must not be the backup root or a child of it."
    echo "Offsite target must not be the backup root or a child of it: $target_abs" >&2
    exit 2
  fi

  install -m 0700 -d "$target_abs"

  source_device_id=$(stat -c "%d" "$source_abs")
  target_device_id=$(stat -c "%d" "$target_abs")

  if [ "$source_device_id" = "$target_device_id" ] && [ "$ROOMPIRE_BACKUP_OFFSITE_ALLOW_SAME_FILESYSTEM" != "true" ]; then
    write_status "warning" "local" "local:$target_abs" "$artifact_count" "$total_bytes" "$latest_artifact" "Offsite target is on the same filesystem as the backup root. Mount a real off-host target or set ROOMPIRE_BACKUP_OFFSITE_ALLOW_SAME_FILESYSTEM=true for a non-offsite drill only." "$source_device_id" "$target_device_id" "true"
    echo "Offsite target is on the same filesystem as the backup root: $target_abs" >&2
    exit 2
  fi

  for artifact in "${artifacts[@]}"; do
    relative_path=${artifact#"$source_abs/"}
    destination="$target_abs/$relative_path"
    install -m 0700 -d "$(dirname "$destination")"
    cp -p "$artifact" "$destination"
  done

  if [ "$source_device_id" = "$target_device_id" ]; then
    same_filesystem=true
  else
    same_filesystem=false
  fi

  write_status "ok" "local" "local:$target_abs" "$artifact_count" "$total_bytes" "$latest_artifact" "" "$source_device_id" "$target_device_id" "$same_filesystem"
  echo "offsite backup sync ok: local:$target_abs artifacts=$artifact_count bytes=$total_bytes"
  exit 0
fi

if [ -z "${ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE:-}" ]; then
  write_status "warning" "rclone" "" "$artifact_count" "$total_bytes" "$latest_artifact" "ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE is required for rclone mode."
  echo "ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE is required for rclone mode." >&2
  exit 2
fi

if ! command -v rclone >/dev/null 2>&1; then
  write_status "warning" "rclone" "rclone:$ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE" "$artifact_count" "$total_bytes" "$latest_artifact" "rclone is not installed."
  echo "rclone is not installed." >&2
  exit 2
fi

if ! rclone_output=$(rclone copy "$source_abs" "$ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE" \
  --include "*.enc" \
  --include "*.sha256" \
  --exclude "*" \
  --checksum 2>&1); then
  write_status "warning" "rclone" "rclone:$ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE" "$artifact_count" "$total_bytes" "$latest_artifact" "$rclone_output"
  echo "$rclone_output" >&2
  exit 1
fi

write_status "ok" "rclone" "rclone:$ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE" "$artifact_count" "$total_bytes" "$latest_artifact" ""
echo "offsite backup sync ok: rclone:$ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE artifacts=$artifact_count bytes=$total_bytes"
