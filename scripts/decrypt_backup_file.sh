#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "Usage: $0 <encrypted-file> [output-file]" >&2
  exit 2
fi

input=$1
if [[ "$input" == *.enc ]]; then
  output=${2:-"${input%.enc}"}
else
  output=${2:-"$input.decrypted"}
fi
cipher=${ROOMPIRE_BACKUP_ENCRYPTION_CIPHER:-aes-256-cbc}
iterations=${ROOMPIRE_BACKUP_ENCRYPTION_ITERATIONS:-200000}

if [ ! -f "$input" ]; then
  echo "Encrypted file not found: $input" >&2
  exit 2
fi

if [ -e "$output" ]; then
  echo "Output already exists: $output" >&2
  exit 2
fi

pass_args=()
if [ -n "${ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE:-}" ]; then
  if [ ! -f "$ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE" ]; then
    echo "Passphrase file not found: $ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE" >&2
    exit 2
  fi
  pass_args=(-pass "file:$ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE")
elif [ -n "${ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  pass_args=(-pass env:ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE)
else
  echo "Set ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE or ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE." >&2
  exit 2
fi

if [ -f "$input.sha256" ]; then
  (
    cd "$(dirname "$input")"
    sha256sum -c "$(basename "$input").sha256" >&2
  )
fi

mkdir -p "$(dirname "$output")"
tmp_output=$(mktemp "${output}.tmp.XXXXXX")
cleanup() {
  rm -f "$tmp_output"
}
trap cleanup EXIT

openssl enc -d "-$cipher" \
  -pbkdf2 \
  -iter "$iterations" \
  -md sha256 \
  -in "$input" \
  -out "$tmp_output" \
  "${pass_args[@]}"

mv "$tmp_output" "$output"
trap - EXIT
echo "$output"
