#!/usr/bin/env bash
set -euo pipefail

CONFIRM=${ROOMPIRE_HOUSEKEEPING_CONFIRM:-}
ROOT_PATH=${ROOMPIRE_HOUSEKEEPING_ROOT:-/}
TMP_MAX_AGE_DAYS=${ROOMPIRE_TMP_MAX_AGE_DAYS:-1}
JOURNAL_VACUUM_SIZE=${ROOMPIRE_JOURNAL_VACUUM_SIZE:-200M}
CLEAN_UV_CACHE=${ROOMPIRE_HOUSEKEEPING_CLEAN_UV_CACHE:-false}
MANAGE_REPO_ARTIFACTS=${ROOMPIRE_HOUSEKEEPING_CLEAN_REPO_ARTIFACTS:-true}
REPO_ARTIFACT_MIN_AVAILABLE_BYTES=${ROOMPIRE_HOUSEKEEPING_REPO_ARTIFACT_MIN_AVAILABLE_BYTES:-6442450944}
MANAGE_TMP_ARTIFACTS=${ROOMPIRE_HOUSEKEEPING_CLEAN_TMP:-true}
MANAGE_DOCKER_PRUNE=${ROOMPIRE_HOUSEKEEPING_DOCKER_PRUNE:-true}
MANAGE_ROOMPIRE_EPHEMERAL_IMAGES=${ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGES:-true}
ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES=${ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGE_REPOSITORIES:-roompire-migrator}
MANAGE_JOURNAL_VACUUM=${ROOMPIRE_HOUSEKEEPING_JOURNAL_VACUUM:-true}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
WORKSPACES_ROOT=${ROOMPIRE_HOUSEKEEPING_WORKSPACES_ROOT:-$(dirname -- "$REPO_ROOT")}
CLEAN_BROWSER_WORKSPACES=${ROOMPIRE_HOUSEKEEPING_CLEAN_BROWSER_WORKSPACES:-false}

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

  if [ "$CLEAN_UV_CACHE" != "true" ]; then
    echo "Skipping uv caches; set ROOMPIRE_HOUSEKEEPING_CLEAN_UV_CACHE=true to remove them."
    return
  fi

  run_or_print rm -rf /root/.cache/uv /home/aialra/.cache/uv
}

remove_workspace_path() {
  local candidate=$1

  case "$candidate" in
    "$REPO_ROOT" | "$REPO_ROOT"/*)
      return
      ;;
  esac

  run_or_print rm -rf "$candidate"
}

clean_browser_workspace_artifacts() {
  section "old browser workspace artifacts"

  if [ "$CLEAN_BROWSER_WORKSPACES" != "true" ]; then
    echo "Skipping browser workspaces; set ROOMPIRE_HOUSEKEEPING_CLEAN_BROWSER_WORKSPACES=true to remove generated artifacts outside this checkout."
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
  run_or_print docker builder prune -f
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

if [ "$DRY_RUN" = true ]; then
  echo "Dry run. Set ROOMPIRE_HOUSEKEEPING_CONFIRM=cleanup to delete safe artifacts."
else
  echo "Cleanup confirmed."
fi

report_disk
clean_repo_artifacts
clean_tmp_artifacts
clean_optional_caches
clean_browser_workspace_artifacts
clean_roompire_ephemeral_images
clean_docker_safely
clean_journal
collect_ops_status
report_disk
