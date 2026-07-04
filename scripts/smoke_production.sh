#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
BASE_URL=${BASE_URL:-https://roompire.aialra.online}
CURL_INSECURE=${CURL_INSECURE:-false}

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

curl_args=(--fail --silent --show-error --location --max-time 20)
if [ "$CURL_INSECURE" = "true" ]; then
  curl_args+=("--insecure")
fi

auth_args=()
if [ -n "${ROOMPIRE_SITE_GATE_USERNAME:-}" ] && [ -n "${ROOMPIRE_SITE_GATE_PASSWORD:-}" ]; then
  auth_args+=(--user "${ROOMPIRE_SITE_GATE_USERNAME}:${ROOMPIRE_SITE_GATE_PASSWORD}")
fi

check() {
  local path=$1
  curl "${curl_args[@]}" "${auth_args[@]}" "$BASE_URL$path" >/dev/null
  echo "ok $path"
}

check "/en-US"
check "/api/v1/health"
check "/manifest.webmanifest"
