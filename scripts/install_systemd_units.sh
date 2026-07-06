#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=${ROOMPIRE_SYSTEMD_WORKING_DIRECTORY:-$(cd "$SCRIPT_DIR/.." && pwd)}
SOURCE_DIR=${ROOMPIRE_SYSTEMD_SOURCE_DIR:-"$REPO_ROOT/ops/systemd"}
TARGET_DIR=${ROOMPIRE_SYSTEMD_TARGET_DIR:-/etc/systemd/system}
CONFIRM=${ROOMPIRE_SYSTEMD_INSTALL_CONFIRM:-}
UNIT_LIST=${ROOMPIRE_SYSTEMD_INSTALL_UNITS:-}

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[\\&|]/\\&/g'
}

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Systemd source directory does not exist: $SOURCE_DIR" >&2
  exit 2
fi

if [ ! -d "$REPO_ROOT" ]; then
  echo "Working directory does not exist: $REPO_ROOT" >&2
  exit 2
fi

if [ -n "$UNIT_LIST" ]; then
  read -r -a unit_names <<<"$UNIT_LIST"
else
  mapfile -t unit_names < <(
    find "$SOURCE_DIR" -maxdepth 1 -type f \( -name "roompire-*.service" -o -name "roompire-*.timer" \) \
      -printf "%f\n" | sort
  )
fi

if [ "${#unit_names[@]}" -eq 0 ]; then
  echo "No systemd units selected." >&2
  exit 2
fi

render_unit() {
  local source_file=$1
  local repo_root_sed
  repo_root_sed=$(escape_sed_replacement "$REPO_ROOT")

  sed \
    -e "s|WorkingDirectory=.*|WorkingDirectory=$repo_root_sed|" \
    -e "s|/srv/roompire/current|$repo_root_sed|g" \
    "$source_file"
}

tmp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

for unit_name in "${unit_names[@]}"; do
  case "$unit_name" in
    roompire-*.service | roompire-*.timer) ;;
    *)
      echo "Refusing to install non-Roompire unit: $unit_name" >&2
      exit 2
      ;;
  esac

  source_file="$SOURCE_DIR/$unit_name"
  rendered_file="$tmp_dir/$unit_name"

  if [ ! -f "$source_file" ]; then
    echo "Selected unit does not exist: $source_file" >&2
    exit 2
  fi

  render_unit "$source_file" >"$rendered_file"

  if grep -q "/srv/roompire/current" "$rendered_file"; then
    echo "Rendered unit still contains template path: $unit_name" >&2
    exit 2
  fi
done

systemd-analyze verify "$tmp_dir"/roompire-* >/dev/null

if [ "$CONFIRM" != "install" ]; then
  echo "dry-run: rendered ${#unit_names[@]} unit(s) for $REPO_ROOT"
  echo "dry-run: set ROOMPIRE_SYSTEMD_INSTALL_CONFIRM=install to copy them to $TARGET_DIR"
  printf '%s\n' "${unit_names[@]}"
  exit 0
fi

install -m 0755 -d "$TARGET_DIR"

for unit_name in "${unit_names[@]}"; do
  install -m 0644 "$tmp_dir/$unit_name" "$TARGET_DIR/$unit_name"
done

systemctl daemon-reload

echo "installed ${#unit_names[@]} unit(s) to $TARGET_DIR"
printf '%s\n' "${unit_names[@]}"
