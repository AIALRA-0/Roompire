#!/usr/bin/env bash
set -euo pipefail

if [ "${ROOMPIRE_E2E_SKIP_DB_RESET:-false}" = "true" ]; then
  echo "Skipping E2E database reset because ROOMPIRE_E2E_SKIP_DB_RESET=true"
  exit 0
fi

export DATABASE_URL=${DATABASE_URL:-postgresql://roompire:roompire@localhost:5432/roompire_dev}

node <<'NODE'
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for E2E database setup.");
}

const parsed = new URL(databaseUrl);
const databaseName = parsed.pathname.replace(/^\//, "");
const allowedHosts = new Set(["localhost", "127.0.0.1", "postgres"]);

if (!allowedHosts.has(parsed.hostname)) {
  throw new Error(`Refusing to reset E2E database on host ${parsed.hostname}.`);
}

if (!/^roompire_(dev|test|e2e)(?:[_-][a-zA-Z0-9]+)?$/.test(databaseName)) {
  throw new Error(`Refusing to reset database ${databaseName}; expected a Roompire dev/test/e2e database.`);
}
NODE

pnpm db:generate
pnpm exec prisma migrate reset --schema db/schema.prisma --force --skip-generate --skip-seed
pnpm exec tsx scripts/seed.ts
