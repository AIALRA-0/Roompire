# 14 — Deployment Runbook

Roompire's current production baseline is a Docker Compose deployment on the self-hosted server for `roompire.aialra.online`. The current live host already runs nginx for multiple sites, so Roompire runs behind that host nginx on a localhost-only web port. The bundled Caddy service remains available as an optional profile for a dedicated host where Roompire owns ports 80/443.

## Prerequisites

- DNS `A` record for `roompire.aialra.online` points at the deployment server.
- Ports `80/tcp` and `443/tcp` are open to the public internet on the host reverse proxy. Use the optional Caddy profile only when Roompire owns `80/tcp`, `443/tcp`, and `443/udp` directly.
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
- `ROOMPIRE_EXPORT_SIGNING_SECRET`
- `ROOMPIRE_FX_PROVIDER`
- `ROOMPIRE_FILE_STORAGE_PROVIDER`
- `ROOMPIRE_S3_BUCKET`
- `ROOMPIRE_S3_REGION`
- `ROOMPIRE_S3_ENDPOINT`
- `ROOMPIRE_S3_ACCESS_KEY_ID`
- `ROOMPIRE_S3_SECRET_ACCESS_KEY`
- `ROOMPIRE_SITE_GATE_USERNAME`
- `ROOMPIRE_SITE_GATE_PASSWORD`
- `ROOMPIRE_SITE_GATE_SESSION_EMAIL` if the gate username is not the app user email

Do not commit real production credentials. The public site gate stays enabled when both `ROOMPIRE_SITE_GATE_USERNAME` and `ROOMPIRE_SITE_GATE_PASSWORD` are set. Verified gate requests become the Roompire app user identified by `ROOMPIRE_SITE_GATE_SESSION_EMAIL`, or by the gate username when the username is already an email address.

`ROOMPIRE_FILE_STORAGE_PROVIDER=local` stores private receipts in the Docker `roompire_uploads` volume. `ROOMPIRE_FILE_STORAGE_PROVIDER=s3` stores private receipts in an S3-compatible bucket such as Cloudflare R2, AWS S3, or MinIO. Use `ROOMPIRE_S3_FORCE_PATH_STYLE=true` for MinIO/path-style endpoints when required by the provider.

`ROOMPIRE_EXPORT_SIGNING_SECRET` signs short-lived export download IDs. Use a random secret separate from the site gate password and file signing secret.

`ROOMPIRE_FX_PROVIDER=frankfurter` enables automatic public historical FX lookup after the local `FxRate` cache misses. Set `ROOMPIRE_FX_PROVIDER=cache-only` when a deployment must avoid outbound FX calls; cross-currency proposals then require either a preloaded `FxRate` row for the expense date window or an explicit manual `fxRate`.

## First Deploy

Build images and start the data services. On the current nginx host, include the nginx override so only `127.0.0.1:${ROOMPIRE_WEB_HOST_PORT:-18300}` is exposed by Compose:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.nginx.example.yml --profile migrate build web migrate
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.nginx.example.yml up -d postgres redis
```

Run database migrations:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.nginx.example.yml --profile migrate run --rm migrate
```

For demo or staging data only, seed the database:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile seed run --rm seed
```

Start the web service behind host nginx:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.nginx.example.yml up -d web
```

The host nginx vhost should terminate TLS and proxy to `http://127.0.0.1:${ROOMPIRE_WEB_HOST_PORT:-18300}` while preserving the `Authorization` header for the site gate.

On a dedicated host without an existing reverse proxy, Caddy can be started explicitly:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile caddy up -d web caddy
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

Run the combined backup plus non-destructive restore drill:

```bash
BACKUP_ROOT=/srv/aialra/backups/roompire ./scripts/backup_all.sh
```

Create a PostgreSQL backup:

```bash
./scripts/backup_postgres.sh
```

Create an upload-volume backup:

```bash
./scripts/backup_uploads.sh
```

Backups are written under `backups/` and are ignored by git. For S3-compatible production storage, enable bucket versioning or provider snapshots and export an object inventory/manifest alongside the PostgreSQL backup; file metadata in PostgreSQL stores the provider, bucket, object key, MIME type, size, and SHA-256 hash.

`scripts/verify_postgres_backup.sh <backup.dump>` restores a custom-format dump into a temporary database, verifies Prisma migration metadata, checks the audit hash chain, and drops the temporary database. This is the preferred daily restore drill because it does not touch the live database.

To schedule daily backups on a systemd host, copy `ops/systemd/roompire-backup.service` and `ops/systemd/roompire-backup.timer` to `/etc/systemd/system/`, adjust `WorkingDirectory` to the live checkout path, then run:

```bash
systemctl daemon-reload
systemctl enable --now roompire-backup.timer
systemctl list-timers roompire-backup.timer
```

## Restore Drill

Restores are destructive and require an explicit confirmation variable:

```bash
ROOMPIRE_RESTORE_CONFIRM=restore ./scripts/restore_postgres.sh backups/postgres/<backup>.dump
```

Run a restore drill before production use and after any backup-script change.

## Current Live-Site Notes

The current live site is served directly from this host; no SSH hop to another VPS is required.

- `roompire.aialra.online` terminates HTTPS through host nginx with a Let's Encrypt certificate.
- The nginx vhost proxies to the Compose web service on `127.0.0.1:18300`.
- The production `.env.production` file is local, ignored by git, and contains the private site-gate credentials and signing secrets.
- `./scripts/smoke_production.sh` passed against the real domain after authentication.
