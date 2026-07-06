#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE=${ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_STATUS_FILE:-ops/status/backup-passphrase-escrow.json}
CONFIRM=${ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_CONFIRM:-}
METHOD=${ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_METHOD:-}
CUSTODIAN=${ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_CUSTODIAN:-}

if [ "$CONFIRM" != "recorded" ]; then
  echo "Set ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_CONFIRM=recorded after the passphrase has been escrowed outside this server." >&2
  exit 2
fi

if [ -z "$METHOD" ]; then
  echo "ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_METHOD is required, for example password-manager or sealed-paper." >&2
  exit 2
fi

STATUS_FILE="$STATUS_FILE" \
  METHOD="$METHOD" \
  CUSTODIAN="$CUSTODIAN" \
  node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const statusFile = process.env.STATUS_FILE;
const now = new Date().toISOString();
const payload = {
  schemaVersion: 1,
  generatedAt: now,
  status: "ok",
  method: process.env.METHOD,
  custodian: process.env.CUSTODIAN || null,
  lastVerifiedAt: now,
  error: null,
};

fs.mkdirSync(path.dirname(statusFile), { recursive: true });
const tmpPath = `${statusFile}.tmp`;
fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 });
fs.renameSync(tmpPath, statusFile);
NODE

echo "ok $STATUS_FILE"
