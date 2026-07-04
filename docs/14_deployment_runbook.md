# 14 — Deployment Runbook

Roompire's current production baseline is a Docker Compose deployment on a VPS or self-hosted server for `roompire.aialra.online`.

## Prerequisites

- DNS `A` record for `roompire.aialra.online` points at the deployment server.
- Ports `80/tcp`, `443/tcp`, and `443/udp` are open to the public internet.
- Docker Engine and the Docker Compose plugin are installed on the server.
- The repository checkout on the server matches the branch or tag being deployed.

## Environment

Create the production environment file from the template:

```bash
cp .env.production.example .env.production
```

Set these values in `.env.production` through the server's secret-management workflow:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `ROOMPIRE_FILE_SIGNING_SECRET`
- `ROOMPIRE_SITE_GATE_USERNAME`
- `ROOMPIRE_SITE_GATE_PASSWORD`
- `ROOMPIRE_SITE_GATE_SESSION_EMAIL` if the gate username is not the app user email

Do not commit real production credentials. The public site gate stays enabled when both `ROOMPIRE_SITE_GATE_USERNAME` and `ROOMPIRE_SITE_GATE_PASSWORD` are set. Verified gate requests become the Roompire app user identified by `ROOMPIRE_SITE_GATE_SESSION_EMAIL`, or by the gate username when the username is already an email address.

## First Deploy

Build images and start the data services:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile migrate --profile seed build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
```

Run database migrations:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile migrate run --rm migrate
```

For demo or staging data only, seed the database:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile seed run --rm seed
```

Start the web and Caddy reverse proxy:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d web caddy
```

## Smoke Test

Run the production smoke checks from a machine that can reach the domain:

```bash
./scripts/smoke_production.sh
```

The smoke test verifies:

- localized app shell at `/en-US`
- authenticated API health at `/api/v1/health`
- PWA manifest at `/manifest.webmanifest`

If TLS is being bootstrapped and the certificate is not valid yet, `CURL_INSECURE=true ./scripts/smoke_production.sh` can be used for diagnosis only.

## Backups

Create a PostgreSQL backup:

```bash
./scripts/backup_postgres.sh
```

Create an upload-volume backup:

```bash
./scripts/backup_uploads.sh
```

Backups are written under `backups/` and are ignored by git.

## Restore Drill

Restores are destructive and require an explicit confirmation variable:

```bash
ROOMPIRE_RESTORE_CONFIRM=restore ./scripts/restore_postgres.sh backups/postgres/<backup>.dump
```

Run a restore drill before production use and after any backup-script change.

## Current Live-Site Notes

The last probe from this development environment found:

- `roompire.aialra.online` resolves to `213.136.74.126`.
- Plain HTTP returns an nginx `500`.
- HTTPS certificate verification fails for the hostname.
- This Codex environment does not have a usable SSH key or hosting-platform CLI session for publishing to the server.

Fix the server access path and TLS/nginx state before treating the public site as live.
