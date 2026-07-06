#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
CHECK_PATH=${ROOMPIRE_DEPLOY_HEADROOM_PATH:-${ROOMPIRE_OPS_DISK_PATH:-/}}
MIN_AVAILABLE_BYTES=${ROOMPIRE_DEPLOY_MIN_AVAILABLE_BYTES:-6442450944}

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  CHECK_PATH=${ROOMPIRE_DEPLOY_HEADROOM_PATH:-${ROOMPIRE_OPS_DISK_PATH:-$CHECK_PATH}}
  MIN_AVAILABLE_BYTES=${ROOMPIRE_DEPLOY_MIN_AVAILABLE_BYTES:-$MIN_AVAILABLE_BYTES}
fi

if ! [[ "$MIN_AVAILABLE_BYTES" =~ ^[0-9]+$ ]] || [ "$MIN_AVAILABLE_BYTES" -le 0 ]; then
  echo "ROOMPIRE_DEPLOY_MIN_AVAILABLE_BYTES must be a positive integer." >&2
  exit 2
fi

available_bytes=$(df -PB1 "$CHECK_PATH" | awk 'NR == 2 { print $4 }')

if ! [[ "$available_bytes" =~ ^[0-9]+$ ]]; then
  echo "Could not read available bytes for $CHECK_PATH." >&2
  exit 2
fi

missing_bytes=0
if [ "$available_bytes" -lt "$MIN_AVAILABLE_BYTES" ]; then
  missing_bytes=$((MIN_AVAILABLE_BYTES - available_bytes))
  echo "deploy-headroom=failed path=$CHECK_PATH availableBytes=$available_bytes requiredAvailableBytes=$MIN_AVAILABLE_BYTES missingBytes=$missing_bytes" >&2
  echo "Run confirmed housekeeping or add capacity before building production images." >&2
  exit 1
fi

echo "deploy-headroom=ok path=$CHECK_PATH availableBytes=$available_bytes requiredAvailableBytes=$MIN_AVAILABLE_BYTES missingBytes=$missing_bytes"
