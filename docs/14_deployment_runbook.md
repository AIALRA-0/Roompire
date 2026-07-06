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
- `ROOMPIRE_RATE_LIMITS_ENABLED`
- `ROOMPIRE_RATE_LIMIT_*_LIMIT` / `ROOMPIRE_RATE_LIMIT_*_WINDOW_SECONDS` optional abuse-control overrides

Do not commit real production credentials. The public site gate stays enabled when both `ROOMPIRE_SITE_GATE_USERNAME` and `ROOMPIRE_SITE_GATE_PASSWORD` are set. Verified gate requests become the Roompire app user identified by `ROOMPIRE_SITE_GATE_SESSION_EMAIL`, or by the gate username when the username is already an email address.

API route rate limits are enabled by default for invite creation/acceptance, local dev-session switching, file upload intents, proposal comments, and share approve/reject/request-changes. A failed site-gate Basic Auth limiter also protects the private gate before app routes execute. The current self-hosted deployment runs one web container, so counters live in process memory; keep `ROOMPIRE_RATE_LIMITS_ENABLED=true` unless emergency maintenance requires a temporary bypass.

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

Generate the host ops snapshot before and after deployment so `/en-US/app/ops` can read disk, backup, and smoke status from the read-only `ops/status` bind mount:

```bash
./scripts/collect_ops_status.sh
```

The snapshot refresh also appends root filesystem samples to `ops/status/disk-history.json` and folds a disk-capacity trend into `ops/status/ops-status.json`. Tune the retention with `ROOMPIRE_OPS_DISK_HISTORY_MAX_SAMPLES`, the minimum projection window with `ROOMPIRE_OPS_DISK_TREND_MIN_WINDOW_HOURS`, and the projected-full warning window with `ROOMPIRE_OPS_DISK_TREND_WARNING_DAYS`.

The snapshot also records a fast root storage inventory for selected high-signal host paths so the ops page can show likely capacity sources without granting the web container host command privileges. The default path set focuses on stable, bounded sources such as `/var/lib/containerd`, `/var/lib/docker`, `/var/lib/snapd`, `/var/log`, `/var/cache`, the Codex app state directory, Roompire backups, and `/home`. Tune the recorded paths with whitespace-separated `ROOMPIRE_ROOT_STORAGE_INVENTORY_PATHS`, the displayed rows with `ROOMPIRE_ROOT_STORAGE_INVENTORY_LIMIT`, and the scan cap with `ROOMPIRE_ROOT_STORAGE_INVENTORY_TIMEOUT_MS` (default `60000`). Keep broad paths such as `/srv/aialra/apps` out of unattended 15-minute snapshots unless the scan time has been measured; use manual `du -xh --max-depth=1 /srv/aialra/apps` checks for deeper shared-server capacity audits.

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

Browser E2E separately verifies service worker registration and the offline shell. The
service worker caches only the offline shell, manifest/icon, and immutable Next.js
static assets; `/api/` requests remain network-only so household and ledger data are
not served from stale cache. It also handles Web Push notification events; this does
not change the cache allowlist.

It also writes `ops/status/latest-smoke.json` without credentials. Run `./scripts/collect_ops_status.sh` after a successful smoke test to fold that result into `ops/status/ops-status.json` for the authenticated ops dashboard.

If TLS is being bootstrapped and the certificate is not valid yet, `CURL_INSECURE=true ./scripts/smoke_production.sh` can be used for diagnosis only.

## Disk Housekeeping

Check disk headroom before every production image build:

```bash
df -h /
docker system df
./scripts/server_housekeeping.sh
```

`scripts/server_housekeeping.sh` defaults to a dry run. To remove low-risk generated artifacts, old targeted `/tmp` leftovers, unused Roompire one-shot images such as `roompire-migrator`, dangling Docker image/build layers, and excess systemd journal archives, run:

```bash
ROOMPIRE_HOUSEKEEPING_CONFIRM=cleanup ./scripts/server_housekeeping.sh
```

For unattended runs, set `ROOMPIRE_HOUSEKEEPING_CLEAN_REPO_ARTIFACTS=auto` so the current checkout's `.next`, `.turbo`, Playwright report, and test-output directories are removed only when available root-disk bytes fall below `ROOMPIRE_HOUSEKEEPING_REPO_ARTIFACT_MIN_AVAILABLE_BYTES` and no active Next/Playwright/Turbo/pnpm build or test process is detected.

To also clear Python `uv` package caches, add `ROOMPIRE_HOUSEKEEPING_CLEAN_UV_CACHE=true`. The housekeeping script intentionally avoids Docker volumes, running-container data, production backups, and images that any current or stopped container still references. `ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGES=true` removes only configured one-shot Roompire image repositories, defaulting to `roompire-migrator`; the next deploy rebuilds that image before running migrations.

When the server root disk pressure comes from old Codex browser workspaces, add `ROOMPIRE_HOUSEKEEPING_CLEAN_BROWSER_WORKSPACES=true` to remove generated dependency/build/test-output directories outside the current checkout while preserving source files and git history.

For routine unattended cleanup, install the conservative housekeeping timer. It prunes targeted `/tmp` leftovers, unused Roompire one-shot images, dangling Docker/build cache, and excess journal archives, auto-cleans current-checkout build/test artifacts only under low-disk conditions, then refreshes the ops snapshot:

```bash
cp ops/systemd/roompire-housekeeping.service /etc/systemd/system/
cp ops/systemd/roompire-housekeeping.timer /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/roompire-housekeeping.service /etc/systemd/system/roompire-housekeeping.timer
systemctl daemon-reload
systemctl enable --now roompire-housekeeping.timer
systemctl start roompire-housekeeping.service
systemctl list-timers 'roompire-*'
```

## Recurring Expenses and Reminders

Run recurring expense proposal generation and task/debt/settlement reminder delivery manually when validating a deployment. In production, run them through the Compose migrator container so `DATABASE_URL=postgres:5432` resolves inside the Docker network:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.nginx.example.yml --profile migrate run --rm migrate sh -lc "pnpm recurring-expenses:generate && pnpm notifications:send-reminders"
```

For local development, `pnpm recurring-expenses:generate` and `pnpm notifications:send-reminders` are still fine. Recurring expense generation creates at most one pending proposal per due template-backed event; reminder delivery emits in-app notifications, respects user notification preferences, targets active household members, and uses unique notification `dedupeKey` values so repeated runs do not duplicate reminders. When `ROOMPIRE_WEB_PUSH_PUBLIC_KEY` and `ROOMPIRE_WEB_PUSH_PRIVATE_KEY` are configured together, newly created assignment/reminder rows are also dispatched to active browser PushManager subscriptions. Leave both VAPID keys empty to keep Web Push disabled; partial or invalid Web Push configuration makes `/api/v1/health` unhealthy.

Web Push production configuration is optional:

```bash
ROOMPIRE_WEB_PUSH_PUBLIC_KEY=...
ROOMPIRE_WEB_PUSH_PRIVATE_KEY=...
ROOMPIRE_WEB_PUSH_SUBJECT=mailto:admin@example.com
ROOMPIRE_WEB_PUSH_DELIVERY_MODE=send
```

Use `ROOMPIRE_WEB_PUSH_DELIVERY_MODE=dry-run` only for E2E or deployment validation where subscriptions should be accepted without sending through a push service.

Install the hourly recurring expense and reminder timer on the self-hosted server:

```bash
cp ops/systemd/roompire-reminders.service /etc/systemd/system/
cp ops/systemd/roompire-reminders.timer /etc/systemd/system/
```

Adjust the copied service `WorkingDirectory` and `EnvironmentFile` to the live checkout path, then verify and enable:

```bash
systemd-analyze verify /etc/systemd/system/roompire-reminders.service /etc/systemd/system/roompire-reminders.timer
systemctl daemon-reload
systemctl enable --now roompire-reminders.timer
systemctl start roompire-reminders.service
systemctl list-timers 'roompire-*'
```

## Backups

Run the combined backup plus non-destructive restore drill:

```bash
BACKUP_ROOT=/srv/aialra/backups/roompire ./scripts/backup_all.sh
```

To encrypt generated backup artifacts after the PostgreSQL restore drill succeeds, create a passphrase file outside the repository and enable encryption:

```bash
install -m 0700 -d /srv/aialra/secrets
openssl rand -base64 48 > /srv/aialra/secrets/roompire-backup-passphrase
chmod 0600 /srv/aialra/secrets/roompire-backup-passphrase
ROOMPIRE_BACKUP_ENCRYPTION=enabled \
  ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE=/srv/aialra/secrets/roompire-backup-passphrase \
  BACKUP_ROOT=/srv/aialra/backups/roompire \
  ./scripts/backup_all.sh
```

When encryption is enabled, `backup_all.sh` verifies the plaintext PostgreSQL dump first, writes `.enc` files plus `.sha256` sidecars, and removes plaintext artifacts by default. The combined flow includes PostgreSQL, the upload volume, and a Roompire file manifest export under `file-manifests/`. Set `ROOMPIRE_BACKUP_REMOVE_PLAINTEXT=false` only for a controlled local drill.

Create a PostgreSQL backup:

```bash
./scripts/backup_postgres.sh
```

Create an upload-volume backup:

```bash
./scripts/backup_uploads.sh
```

Create a Roompire file/object manifest backup:

```bash
./scripts/backup_file_manifest.sh
```

Backups are written under `backups/` and are ignored by git. For S3-compatible production storage, enable bucket versioning or provider snapshots and keep the generated Roompire file manifest alongside the PostgreSQL backup; file metadata in PostgreSQL stores the provider, bucket, object key, MIME type, size, and SHA-256 hash.

`scripts/verify_postgres_backup.sh <backup.dump>` restores a custom-format dump into a temporary database, verifies Prisma migration metadata, checks the audit hash chain, and drops the temporary database. This is the preferred daily restore drill because it does not touch the live database. Encrypted PostgreSQL dumps can be verified directly:

```bash
ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE=/srv/aialra/secrets/roompire-backup-passphrase \
  ./scripts/verify_postgres_backup.sh /srv/aialra/backups/roompire/postgres/<backup>.dump.enc
```

For a destructive restore from an encrypted dump, keep the same passphrase variable and set the explicit restore confirmation:

```bash
ROOMPIRE_RESTORE_CONFIRM=restore \
  ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE=/srv/aialra/secrets/roompire-backup-passphrase \
  ./scripts/restore_postgres.sh /srv/aialra/backups/roompire/postgres/<backup>.dump.enc
```

To schedule daily backups on a systemd host, copy `ops/systemd/roompire-backup.service` and `ops/systemd/roompire-backup.timer` to `/etc/systemd/system/`, adjust `WorkingDirectory` to the live checkout path, then run:

```bash
systemctl daemon-reload
systemctl enable --now roompire-backup.timer
systemctl list-timers roompire-backup.timer
```

To enable encrypted scheduled backups, also add these environment lines to the copied `/etc/systemd/system/roompire-backup.service`:

```ini
Environment=ROOMPIRE_BACKUP_ENCRYPTION=enabled
Environment=ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE=/srv/aialra/secrets/roompire-backup-passphrase
Environment=ROOMPIRE_BACKUP_REMOVE_PLAINTEXT=true
```

Offsite backup sync is disabled until a real target exists. The sync only copies encrypted artifacts and `.sha256` sidecars, then writes `ops/status/backup-offsite.json` for the ops dashboard. For a mounted off-host directory, add:

```ini
Environment=ROOMPIRE_BACKUP_OFFSITE_MODE=local
Environment=ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR=/mnt/roompire-offsite
Environment=ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE=ops/status/backup-offsite.json
```

For a configured `rclone` remote, use:

```ini
Environment=ROOMPIRE_BACKUP_OFFSITE_MODE=rclone
Environment=ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE=roompire-offsite:backups/roompire
Environment=ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE=ops/status/backup-offsite.json
```

Leave `ROOMPIRE_BACKUP_OFFSITE_MODE=disabled` until the target is truly off the server root filesystem. The ops dashboard will show an expected warning while no offsite copy is configured.

## Ops Automation

The ops dashboard reads generated JSON snapshots from `ops/status/`. Install the timer units to keep those snapshots fresh without running host commands from the web request path:

```bash
cp ops/systemd/roompire-ops-status.service /etc/systemd/system/
cp ops/systemd/roompire-ops-status.timer /etc/systemd/system/
cp ops/systemd/roompire-smoke.service /etc/systemd/system/
cp ops/systemd/roompire-smoke.timer /etc/systemd/system/
cp ops/systemd/roompire-reminders.service /etc/systemd/system/
cp ops/systemd/roompire-reminders.timer /etc/systemd/system/
```

Adjust each copied service `WorkingDirectory` to the live checkout path, then verify and enable:

```bash
systemd-analyze verify /etc/systemd/system/roompire-ops-status.service /etc/systemd/system/roompire-ops-status.timer /etc/systemd/system/roompire-smoke.service /etc/systemd/system/roompire-smoke.timer /etc/systemd/system/roompire-reminders.service /etc/systemd/system/roompire-reminders.timer
systemctl daemon-reload
systemctl enable --now roompire-ops-status.timer roompire-smoke.timer roompire-reminders.timer
systemctl start roompire-ops-status.service roompire-smoke.service roompire-reminders.service
systemctl list-timers 'roompire-*'
```

`roompire-ops-status.timer` refreshes disk, root storage inventory, disk-capacity trend, Docker storage, Docker image inventory, its own timer/service state, backup timer/service state, housekeeping timer/service state, reminder timer/service state, backup encryption health, offsite backup copy status, smoke timer/service state, and latest smoke state every 15 minutes. The Docker storage snapshot records image, container, local-volume, and build-cache size/reclaimable totals from `docker system df`, but summary warnings use only conservative safe-cleanup candidates: build cache plus dangling images or configured one-shot Roompire images that no current or stopped container references. Docker-reported image and volume reclaimable totals remain visible as evidence, not as automatic deletion targets. The image inventory records the largest image references, active/inactive image bytes, and safe image candidates so disk-pressure investigations do not require shell access from the web container. The root storage inventory records selected host path sizes as capacity-planning evidence, not as cleanup targets. The inventory is evidence only; it does not prune shared server images or app directories. The encryption health snapshot checks the backup unit configuration, passphrase file presence, encrypted artifact count, plaintext artifact count, and `.sha256` sidecar coverage without exposing secret values. The offsite snapshot checks whether a real sync target is configured and whether the latest sync status is healthy. `roompire-smoke.timer` runs authenticated real-domain checks hourly at minute 7, updates `ops/status/latest-smoke.json`, then refreshes the ops snapshot; `roompire-reminders.timer` runs recurring expense proposal generation followed by in-app reminder delivery hourly at minute 17 and refreshes ops status after each service run. The ops dashboard surfaces these automation timers and their latest service results so stale snapshot, smoke, reminder automation, projected disk exhaustion, safe cleanup candidates, root storage sources, or large Docker images are visible from the real site.

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
- The authenticated ops page is available at `/en-US/app/ops` for the site-gate owner and household owner/admin users; it reads host status files from `ops/status/` and does not execute host commands from the web request path.
