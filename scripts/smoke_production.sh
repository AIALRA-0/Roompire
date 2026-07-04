#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${ENV_FILE:-.env.production}
BASE_URL=${BASE_URL:-https://roompire.aialra.online}
CURL_INSECURE=${CURL_INSECURE:-false}
SMOKE_STATUS_FILE=${ROOMPIRE_SMOKE_STATUS_FILE:-ops/status/latest-smoke.json}
SMOKE_RESULTS_TMP=$(mktemp)

cleanup() {
  rm -f "$SMOKE_RESULTS_TMP"
}

trap cleanup EXIT

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

append_smoke_result() {
  local path=$1
  local status=$2
  local http_status=$3
  local message=${4:-}

  CHECK_PATH="$path" \
    CHECK_STATUS="$status" \
    CHECK_HTTP_STATUS="$http_status" \
    CHECK_MESSAGE="$message" \
    node <<'NODE' >> "$SMOKE_RESULTS_TMP"
const httpStatus = Number(process.env.CHECK_HTTP_STATUS);

console.log(
  JSON.stringify({
    path: process.env.CHECK_PATH,
    status: process.env.CHECK_STATUS === "failed" ? "failed" : "passed",
    httpStatus: Number.isFinite(httpStatus) ? httpStatus : null,
    message: process.env.CHECK_MESSAGE || null,
  }),
);
NODE
}

write_smoke_status() {
  local status=$1
  local failed_path=${2:-}
  local message=${3:-}

  ROOMPIRE_SMOKE_STATUS_FILE="$SMOKE_STATUS_FILE" \
    ROOMPIRE_SMOKE_RESULTS_TMP="$SMOKE_RESULTS_TMP" \
    ROOMPIRE_SMOKE_STATUS="$status" \
    ROOMPIRE_SMOKE_FAILED_PATH="$failed_path" \
    ROOMPIRE_SMOKE_MESSAGE="$message" \
    ROOMPIRE_SMOKE_BASE_URL="$BASE_URL" \
    node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const outputPath = process.env.ROOMPIRE_SMOKE_STATUS_FILE;
const resultsPath = process.env.ROOMPIRE_SMOKE_RESULTS_TMP;
const checks = fs.existsSync(resultsPath)
  ? fs
      .readFileSync(resultsPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  : [];
const payload = {
  schemaVersion: 1,
  status: process.env.ROOMPIRE_SMOKE_STATUS === "failed" ? "failed" : "passed",
  generatedAt: new Date().toISOString(),
  baseUrl: process.env.ROOMPIRE_SMOKE_BASE_URL,
  checks,
  failedPath: process.env.ROOMPIRE_SMOKE_FAILED_PATH || null,
  message: process.env.ROOMPIRE_SMOKE_MESSAGE || null,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const tmpPath = `${outputPath}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, outputPath);
NODE
}

check() {
  local path=$1
  local stderr_file
  local http_status
  local exit_code
  local message

  stderr_file=$(mktemp)
  set +e
  http_status=$(
    curl "${curl_args[@]}" "${auth_args[@]}" \
      --output /dev/null \
      --write-out "%{http_code}" \
      "$BASE_URL$path" \
      2>"$stderr_file"
  )
  exit_code=$?
  set -e
  message=$(tr '\n' ' ' <"$stderr_file" | sed 's/[[:space:]]\+/ /g' | cut -c1-400)
  rm -f "$stderr_file"

  if [[ "$exit_code" -eq 0 && "$http_status" =~ ^[0-9]+$ && "$http_status" -ge 200 && "$http_status" -lt 400 ]]; then
    append_smoke_result "$path" "passed" "$http_status" ""
    echo "ok $path"
    return
  fi

  append_smoke_result "$path" "failed" "$http_status" "$message"
  write_smoke_status "failed" "$path" "$message"
  echo "failed $path status=$http_status" >&2
  exit 1
}

check "/en-US"
check "/api/v1/health"
check "/manifest.webmanifest"
write_smoke_status "passed"
