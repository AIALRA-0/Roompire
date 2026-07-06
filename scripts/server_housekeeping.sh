#!/usr/bin/env bash
set -euo pipefail

CONFIRM=${ROOMPIRE_HOUSEKEEPING_CONFIRM:-}
ROOT_PATH=${ROOMPIRE_HOUSEKEEPING_ROOT:-/}
TMP_MAX_AGE_DAYS=${ROOMPIRE_TMP_MAX_AGE_DAYS:-1}
JOURNAL_VACUUM_SIZE=${ROOMPIRE_JOURNAL_VACUUM_SIZE:-200M}
CLEAN_UV_CACHE=${ROOMPIRE_HOUSEKEEPING_CLEAN_UV_CACHE:-false}
CLEAN_NODE_CACHES=${ROOMPIRE_HOUSEKEEPING_CLEAN_NODE_CACHES:-false}
MANAGE_REPO_ARTIFACTS=${ROOMPIRE_HOUSEKEEPING_CLEAN_REPO_ARTIFACTS:-true}
REPO_ARTIFACT_MIN_AVAILABLE_BYTES=${ROOMPIRE_HOUSEKEEPING_REPO_ARTIFACT_MIN_AVAILABLE_BYTES:-6442450944}
WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES=${ROOMPIRE_HOUSEKEEPING_WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES:-10737418240}
MANAGE_TMP_ARTIFACTS=${ROOMPIRE_HOUSEKEEPING_CLEAN_TMP:-true}
MANAGE_DOCKER_PRUNE=${ROOMPIRE_HOUSEKEEPING_DOCKER_PRUNE:-true}
DOCKER_BUILDER_PRUNE_ALL=${ROOMPIRE_HOUSEKEEPING_DOCKER_BUILDER_PRUNE_ALL:-false}
MANAGE_ROOMPIRE_EPHEMERAL_IMAGES=${ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGES:-true}
ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES=${ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES:-roompire-migrator}
MANAGE_JOURNAL_VACUUM=${ROOMPIRE_HOUSEKEEPING_JOURNAL_VACUUM:-true}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
WORKSPACES_ROOT=${ROOMPIRE_HOUSEKEEPING_WORKSPACES_ROOT:-$(dirname -- "$REPO_ROOT")}
CLEAN_BROWSER_WORKSPACES=${ROOMPIRE_HOUSEKEEPING_CLEAN_BROWSER_WORKSPACES:-false}
STATUS_FILE=${ROOMPIRE_HOUSEKEEPING_STATUS_FILE:-ops/status/latest-housekeeping.json}
STARTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
START_AVAILABLE_BYTES=""
CURRENT_STAGE="initializing"
STATUS_WRITTEN=false

if [ "$CONFIRM" = "cleanup" ]; then
  DRY_RUN=false
else
  DRY_RUN=true
fi

section() {
  printf '\n== %s ==\n' "$1"
}

run_or_print() {
  if [ "$DRY_RUN" = true ]; then
    printf 'dry-run:'
    printf ' %q' "$@"
    printf '\n'
    return
  fi

  "$@"
}

report_disk() {
  section "disk"
  df -h "$ROOT_PATH"

  section "common server paths"
  du -sh \
    "$REPO_ROOT/apps/web/.next" \
    "$REPO_ROOT/.turbo" \
    "$REPO_ROOT/playwright-report" \
    "$REPO_ROOT/test-results" \
    /tmp \
    /var/log \
    /root/.cache \
    /home/aialra/.cache \
    2>/dev/null || true

  if command -v docker >/dev/null 2>&1; then
    section "docker"
    docker system df || true
  fi

  if command -v journalctl >/dev/null 2>&1; then
    section "journald"
    journalctl --disk-usage || true
  fi
}

available_bytes() {
  df -PB1 "$ROOT_PATH" | awk 'NR == 2 { print $4 }'
}

write_housekeeping_status() {
  local exit_code=$1
  local finished_at
  local end_available_bytes
  local reclaimed_bytes=""
  local status
  local message

  if [ "$DRY_RUN" = true ]; then
    return
  fi

  finished_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  end_available_bytes=$(available_bytes 2>/dev/null || true)

  if [[ "$START_AVAILABLE_BYTES" =~ ^[0-9]+$ ]] && [[ "$end_available_bytes" =~ ^[0-9]+$ ]]; then
    reclaimed_bytes=$((end_available_bytes - START_AVAILABLE_BYTES))
  fi

  if [ "$exit_code" -eq 0 ]; then
    status="ok"
    message="Housekeeping completed."
  else
    status="warning"
    message="Housekeeping failed during $CURRENT_STAGE."
  fi

  STATUS_FILE="$STATUS_FILE" \
    STATUS="$status" \
    MESSAGE="$message" \
    STARTED_AT="$STARTED_AT" \
    FINISHED_AT="$finished_at" \
    EXIT_CODE="$exit_code" \
    ROOT_PATH="$ROOT_PATH" \
    AVAILABLE_BYTES_BEFORE="$START_AVAILABLE_BYTES" \
    AVAILABLE_BYTES_AFTER="$end_available_bytes" \
    RECLAIMED_BYTES="$reclaimed_bytes" \
    REPO_ARTIFACTS_MODE="$MANAGE_REPO_ARTIFACTS" \
    REPO_ARTIFACT_MIN_AVAILABLE_BYTES="$REPO_ARTIFACT_MIN_AVAILABLE_BYTES" \
    TMP_CLEANUP_ENABLED="$MANAGE_TMP_ARTIFACTS" \
    UV_CACHE_CLEANUP_ENABLED="$CLEAN_UV_CACHE" \
    NODE_CACHE_CLEANUP_ENABLED="$CLEAN_NODE_CACHES" \
    DOCKER_PRUNE_ENABLED="$MANAGE_DOCKER_PRUNE" \
    ROOMPIRE_EPHEMERAL_IMAGES_ENABLED="$MANAGE_ROOMPIRE_EPHEMERAL_IMAGES" \
    ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES="$ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES" \
    JOURNAL_VACUUM_ENABLED="$MANAGE_JOURNAL_VACUUM" \
    BROWSER_WORKSPACES_MODE="$CLEAN_BROWSER_WORKSPACES" \
    WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES="$WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES" \
    node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value) {
  return value === "true";
}

const statusFile = process.env.STATUS_FILE;
const payload = {
  schemaVersion: 1,
  generatedAt: process.env.FINISHED_AT,
  status: process.env.STATUS,
  cleanupConfirmed: true,
  message: process.env.MESSAGE,
  startedAt: process.env.STARTED_AT,
  finishedAt: process.env.FINISHED_AT,
  exitCode: nullableNumber(process.env.EXIT_CODE),
  rootPath: process.env.ROOT_PATH || "/",
  availableBytesBefore: nullableNumber(process.env.AVAILABLE_BYTES_BEFORE),
  availableBytesAfter: nullableNumber(process.env.AVAILABLE_BYTES_AFTER),
  reclaimedBytes: nullableNumber(process.env.RECLAIMED_BYTES),
  repoArtifactsMode: process.env.REPO_ARTIFACTS_MODE || "unknown",
  repoArtifactMinAvailableBytes: nullableNumber(
    process.env.REPO_ARTIFACT_MIN_AVAILABLE_BYTES,
  ),
  tmpCleanupEnabled: booleanValue(process.env.TMP_CLEANUP_ENABLED),
  uvCacheCleanupEnabled: booleanValue(process.env.UV_CACHE_CLEANUP_ENABLED),
  nodeCacheCleanupEnabled: booleanValue(process.env.NODE_CACHE_CLEANUP_ENABLED),
  dockerPruneEnabled: booleanValue(process.env.DOCKER_PRUNE_ENABLED),
  roompireEphemeralImagesEnabled: booleanValue(
    process.env.ROOMPIRE_EPHEMERAL_IMAGES_ENABLED,
  ),
  roompireEphemeralImageRepositories: String(
    process.env.ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES || "",
  )
    .split(/\s+/)
    .filter(Boolean),
  journalVacuumEnabled: booleanValue(process.env.JOURNAL_VACUUM_ENABLED),
  browserWorkspacesMode: process.env.BROWSER_WORKSPACES_MODE || "unknown",
  workspaceArtifactMinAvailableBytes: nullableNumber(
    process.env.WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES,
  ),
  error: process.env.STATUS === "ok" ? null : process.env.MESSAGE,
};

fs.mkdirSync(path.dirname(statusFile), { recursive: true });
const tmpPath = `${statusFile}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, statusFile);
NODE
}

on_exit() {
  local exit_code=$?

  if [ "$STATUS_WRITTEN" != true ]; then
    write_housekeeping_status "$exit_code" || true
  fi

  exit "$exit_code"
}

trap on_exit EXIT

repo_artifact_activity() {
  if ! command -v ps >/dev/null 2>&1; then
    return 1
  fi

  ps -eo args= |
    grep -E "(next (dev|build)|playwright test|turbo (build|dev|test|lint|typecheck)|pnpm (build|dev|e2e|test|lint|typecheck)|vitest|tsc --noEmit)" |
    grep -v -E "(grep|server_housekeeping)" || true
}

clean_current_repo_artifacts() {
  run_or_print rm -rf \
    "$REPO_ROOT/apps/web/.next" \
    "$REPO_ROOT/.turbo" \
    "$REPO_ROOT/playwright-report" \
    "$REPO_ROOT/test-results"
}

clean_repo_artifacts() {
  section "repo artifacts"

  if [ "$MANAGE_REPO_ARTIFACTS" = "false" ]; then
    echo "Skipping current checkout artifacts; set ROOMPIRE_HOUSEKEEPING_CLEAN_REPO_ARTIFACTS=true to remove them."
    return
  fi

  if [ "$MANAGE_REPO_ARTIFACTS" = "auto" ]; then
    local available
    local active_processes

    available=$(available_bytes)

    if ! [[ "$available" =~ ^[0-9]+$ ]]; then
      echo "Skipping current checkout artifacts; could not read available bytes."
      return
    fi

    if [ "$available" -ge "$REPO_ARTIFACT_MIN_AVAILABLE_BYTES" ]; then
      echo "Skipping current checkout artifacts; available bytes $available is above threshold $REPO_ARTIFACT_MIN_AVAILABLE_BYTES."
      return
    fi

    active_processes=$(repo_artifact_activity)

    if [ -n "$active_processes" ]; then
      echo "Skipping current checkout artifacts; active build/test processes were detected:"
      printf '%s\n' "$active_processes"
      return
    fi

    echo "Available bytes $available is below threshold $REPO_ARTIFACT_MIN_AVAILABLE_BYTES; cleaning current checkout artifacts."
    clean_current_repo_artifacts
    return
  fi

  if [ "$MANAGE_REPO_ARTIFACTS" = "true" ]; then
    clean_current_repo_artifacts
    return
  fi

  echo "Skipping current checkout artifacts; unsupported ROOMPIRE_HOUSEKEEPING_CLEAN_REPO_ARTIFACTS=$MANAGE_REPO_ARTIFACTS."
}

clean_tmp_artifacts() {
  section "temporary artifacts"

  if [ "$MANAGE_TMP_ARTIFACTS" != "true" ]; then
    echo "Skipping /tmp artifacts; set ROOMPIRE_HOUSEKEEPING_CLEAN_TMP=true to remove them."
    return
  fi

  if [ "$DRY_RUN" = true ]; then
    find /tmp -xdev -maxdepth 1 \
      \( -name "readlayer-soak" -o -name "codex-pack-*" -o -name "playwright_chromiumdev_profile-*" \) \
      -mtime +"$TMP_MAX_AGE_DAYS" \
      -print 2>/dev/null || true
    return
  fi

  find /tmp -xdev -maxdepth 1 \
    \( -name "readlayer-soak" -o -name "codex-pack-*" -o -name "playwright_chromiumdev_profile-*" \) \
    -mtime +"$TMP_MAX_AGE_DAYS" \
    -print \
    -exec rm -rf -- {} + 2>/dev/null || true
}

clean_optional_caches() {
  section "optional caches"

  if [ "$CLEAN_UV_CACHE" != "true" ] && [ "$CLEAN_NODE_CACHES" != "true" ]; then
    echo "Skipping uv caches; set ROOMPIRE_HOUSEKEEPING_CLEAN_UV_CACHE=true to remove them."
    echo "Skipping Node/pnpm caches; set ROOMPIRE_HOUSEKEEPING_CLEAN_NODE_CACHES=true to remove them."
    return
  fi

  if [ "$CLEAN_UV_CACHE" = "true" ]; then
    run_or_print rm -rf /root/.cache/uv /home/aialra/.cache/uv || true
  else
    echo "Skipping uv caches; set ROOMPIRE_HOUSEKEEPING_CLEAN_UV_CACHE=true to remove them."
  fi

  if [ "$CLEAN_NODE_CACHES" = "true" ]; then
    run_or_print rm -rf \
      /root/.cache/node \
      /root/.cache/pnpm \
      /home/aialra/.cache/node \
      /home/aialra/.cache/pnpm \
      /tmp/node-compile-cache \
      /tmp/playwright-transform-cache-* \
      /tmp/tsx-* || true
  else
    echo "Skipping Node/pnpm caches; set ROOMPIRE_HOUSEKEEPING_CLEAN_NODE_CACHES=true to remove them."
  fi
}

remove_workspace_path() {
  local candidate=$1

  case "$candidate" in
    "$REPO_ROOT" | "$REPO_ROOT"/*)
      return
      ;;
  esac

  if [ "$DRY_RUN" = true ]; then
    echo "Would remove generated workspace artifact: $candidate"
  else
    echo "Removing generated workspace artifact: $candidate"
  fi

  run_or_print rm -rf "$candidate"
}

clean_browser_workspace_artifacts() {
  section "old browser workspace artifacts"

  if [ "$CLEAN_BROWSER_WORKSPACES" = "false" ]; then
    echo "Skipping browser workspaces; set ROOMPIRE_HOUSEKEEPING_CLEAN_BROWSER_WORKSPACES=true or auto to remove generated artifacts outside this checkout."
    return
  fi

  if [ "$CLEAN_BROWSER_WORKSPACES" = "auto" ]; then
    local available
    local active_processes

    available=$(available_bytes)

    if ! [[ "$available" =~ ^[0-9]+$ ]]; then
      echo "Skipping browser workspaces; could not read available bytes."
      return
    fi

    if [ "$available" -ge "$WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES" ]; then
      echo "Skipping browser workspaces; available bytes $available is above threshold $WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES."
      return
    fi

    active_processes=$(repo_artifact_activity)

    if [ -n "$active_processes" ]; then
      echo "Skipping browser workspaces; active build/test processes were detected:"
      printf '%s\n' "$active_processes"
      return
    fi

    echo "Available bytes $available is below threshold $WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES; cleaning generated browser workspace artifacts."
  elif [ "$CLEAN_BROWSER_WORKSPACES" != "true" ]; then
    echo "Skipping browser workspaces; unsupported ROOMPIRE_HOUSEKEEPING_CLEAN_BROWSER_WORKSPACES=$CLEAN_BROWSER_WORKSPACES."
    return
  fi

  if [ ! -d "$WORKSPACES_ROOT" ]; then
    echo "Workspace root is unavailable: $WORKSPACES_ROOT"
    return
  fi

  while IFS= read -r -d '' candidate; do
    remove_workspace_path "$candidate"
  done < <(
    find "$WORKSPACES_ROOT" -xdev -mindepth 2 -type d \
      \( -name "node_modules" -o -name ".next" -o -name ".turbo" -o -name "playwright-report" -o -name "test-results" -o -name "dist" -o -name "build" \) \
      -prune \
      -print0 2>/dev/null
  )

  while IFS= read -r -d '' candidate; do
    remove_workspace_path "$candidate"
  done < <(
    find "$WORKSPACES_ROOT" -xdev -mindepth 2 -type d \
      \( -path "*/output/playwright" -o -path "*/output/playwright-report" \) \
      -prune \
      -print0 2>/dev/null
  )
}

clean_roompire_ephemeral_images() {
  section "Roompire ephemeral Docker images"

  if [ "$MANAGE_ROOMPIRE_EPHEMERAL_IMAGES" != "true" ]; then
    echo "Skipping Roompire ephemeral images; set ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGES=true to remove unused one-shot images."
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed."
    return
  fi

  local found=false
  local reference
  local image_id
  local repository

  for repository in $ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES; do
    while read -r reference image_id; do
      if [ -z "${reference:-}" ] || [ "$reference" = "<none>:<none>" ]; then
        continue
      fi

      found=true

      if docker ps -a --filter "ancestor=$reference" --format '{{.ID}}' | grep -q .; then
        echo "Skipping $reference ($image_id); one or more containers still reference it."
        continue
      fi

      run_or_print docker image rm "$reference"
    done < <(docker image ls "$repository" --format '{{.Repository}}:{{.Tag}} {{.ID}}' | sort -u)
  done

  if [ "$found" = false ]; then
    echo "No matching Roompire ephemeral images found."
  fi
}

clean_docker_safely() {
  section "docker safe prune"

  if [ "$MANAGE_DOCKER_PRUNE" != "true" ]; then
    echo "Skipping Docker prune; set ROOMPIRE_HOUSEKEEPING_DOCKER_PRUNE=true to prune dangling images and builder cache."
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed."
    return
  fi

  run_or_print docker image prune -f

  if [ "$DOCKER_BUILDER_PRUNE_ALL" = "true" ]; then
    run_or_print docker builder prune -af
  else
    run_or_print docker builder prune -f
  fi
}

clean_journal() {
  section "journald vacuum"

  if [ "$MANAGE_JOURNAL_VACUUM" != "true" ]; then
    echo "Skipping journald vacuum; set ROOMPIRE_HOUSEKEEPING_JOURNAL_VACUUM=true to vacuum journal archives."
    return
  fi

  if ! command -v journalctl >/dev/null 2>&1; then
    echo "journalctl is not installed."
    return
  fi

  run_or_print journalctl --vacuum-size="$JOURNAL_VACUUM_SIZE"
}

collect_ops_status() {
  section "ops status"

  if [ ! -x "$REPO_ROOT/scripts/collect_ops_status.sh" ]; then
    echo "collect_ops_status.sh is unavailable."
    return
  fi

  run_or_print "$REPO_ROOT/scripts/collect_ops_status.sh"
}

START_AVAILABLE_BYTES=$(available_bytes 2>/dev/null || true)

if [ "$DRY_RUN" = true ]; then
  echo "Dry run. Set ROOMPIRE_HOUSEKEEPING_CONFIRM=cleanup to delete safe artifacts."
else
  echo "Cleanup confirmed."
fi

CURRENT_STAGE="initial disk report"
report_disk
CURRENT_STAGE="repo artifacts"
clean_repo_artifacts
CURRENT_STAGE="temporary artifacts"
clean_tmp_artifacts
CURRENT_STAGE="optional caches"
clean_optional_caches
CURRENT_STAGE="old browser workspace artifacts"
clean_browser_workspace_artifacts
CURRENT_STAGE="Roompire ephemeral Docker images"
clean_roompire_ephemeral_images
CURRENT_STAGE="docker safe prune"
clean_docker_safely
CURRENT_STAGE="journald vacuum"
clean_journal
CURRENT_STAGE="final disk report"
report_disk
CURRENT_STAGE="status write"
write_housekeeping_status 0
CURRENT_STAGE="ops status"
collect_ops_status
STATUS_WRITTEN=true
