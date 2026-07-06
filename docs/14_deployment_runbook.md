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
- `ROOMPIRE_FX_FRANKFURTER_BASE_URLS`
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

`ROOMPIRE_FX_PROVIDER=frankfurter` enables automatic public historical FX lookup after the local `FxRate` cache misses. Set `ROOMPIRE_FX_PROVIDER=cache-only` when a deployment must avoid outbound FX calls; cross-currency proposals then require either a preloaded `FxRate` row for the expense date window or an explicit manual `fxRate`. `ROOMPIRE_FX_FRANKFURTER_BASE_URLS` accepts a comma-separated list of Frankfurter-compatible endpoints; Roompire tries them in order and stores the endpoint that succeeds as `frankfurter`, `frankfurter-2`, and so on in the copied FX lock/cache metadata.

## First Deploy

Build images and start the data services. On the current nginx host, include the nginx override so only `127.0.0.1:${ROOMPIRE_WEB_HOST_PORT:-18300}` is exposed by Compose:

```bash
./scripts/check_deploy_headroom.sh
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

The snapshot refresh also appends root filesystem samples to `ops/status/disk-history.json`, folds a disk-capacity trend into `ops/status/ops-status.json`, and records whether root disk free space satisfies the production deploy headroom gate. Tune the retention with `ROOMPIRE_OPS_DISK_HISTORY_MAX_SAMPLES`, the minimum projection window with `ROOMPIRE_OPS_DISK_TREND_MIN_WINDOW_HOURS`, and the projected-full warning window with `ROOMPIRE_OPS_DISK_TREND_WARNING_DAYS`. Tune the deployment gate with `ROOMPIRE_DEPLOY_MIN_AVAILABLE_BYTES` (default `6442450944`, 6 GiB); `scripts/check_deploy_headroom.sh` uses the same threshold and exits non-zero before production image builds when the server is below it.

The snapshot also records a fast root storage inventory for selected high-signal host paths so the ops page can show likely capacity sources without granting the web container host command privileges. The default path set focuses on stable, bounded sources such as `/var/lib/containerd`, `/var/lib/docker`, `/var/lib/snapd`, `/var/log`, `/var/cache`, the Codex app state directory, Roompire backups, and `/home`. Tune the recorded paths with whitespace-separated `ROOMPIRE_ROOT_STORAGE_INVENTORY_PATHS`, the displayed rows with `ROOMPIRE_ROOT_STORAGE_INVENTORY_LIMIT`, and the scan cap with `ROOMPIRE_ROOT_STORAGE_INVENTORY_TIMEOUT_MS` (default `60000`). Keep broad paths such as `/srv/aialra/apps` out of unattended 15-minute snapshots.

For deeper shared-server capacity evidence, run the slower shared app storage collector separately. It scans immediate children of configured roots with per-path and total timeouts, writes `ops/status/shared-app-storage.json`, and lets the normal ops snapshot read that status file without doing the slow scan itself:

```bash
ROOMPIRE_SHARED_APP_STORAGE_ROOTS=/srv/aialra/apps \
  ROOMPIRE_SHARED_APP_STORAGE_SKIP_PATHS=/srv/aialra/apps/opencode-turn-engine \
  ROOMPIRE_SHARED_APP_STORAGE_TOTAL_TIMEOUT_MS=240000 \
  ROOMPIRE_SHARED_APP_STORAGE_PATH_TIMEOUT_MS=45000 \
  ./scripts/collect_shared_app_storage.sh
./scripts/collect_ops_status.sh
```

Use `ROOMPIRE_SHARED_APP_STORAGE_SKIP_PATHS` only for known shared-server directories that are not managed by Roompire and consistently exceed the per-path scan budget. Skipped paths are not counted in the recorded total, but they are written to `ops/status/shared-app-storage.json` and displayed on the ops dashboard so capacity exceptions stay visible. The dashboard treats a recorded shared app storage inventory as stale after `ROOMPIRE_SHARED_APP_STORAGE_STATUS_STALE_MS`, defaulting to 48 hours. Missing shared-app inventory is not a warning because this collector is optional, but unexpected timeouts, errors, or stale recorded inventory are surfaced.

The same host snapshot checks the production Compose containers named by `ROOMPIRE_CONTAINER_HEALTH_CONTAINERS`, defaulting to `roompire-web-1 roompire-postgres-1 roompire-redis-1`. It records each container's running state, Docker health-check status, restart count, image, and start/finish timestamps so `/en-US/app/ops` can flag a stopped, unhealthy, starting, or unreadable service without giving the web app Docker socket access.

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

The smoke script also writes `ops/status/latest-smoke.json` without credentials. Run `./scripts/collect_ops_status.sh` after a successful smoke test to fold that result into `ops/status/ops-status.json` for the authenticated ops dashboard. The dashboard treats a passed or failed latest smoke result as stale after `ROOMPIRE_SMOKE_STATUS_STALE_MS`, defaulting to two hours, so an old green result cannot mask a broken smoke timer.

If TLS is being bootstrapped and the certificate is not valid yet, `CURL_INSECURE=true ./scripts/smoke_production.sh` can be used for diagnosis only.

## Disk Housekeeping

Check disk headroom before every production image build:

```bash
./scripts/check_deploy_headroom.sh
df -h /
docker system df
./scripts/server_housekeeping.sh
```

`scripts/server_housekeeping.sh` defaults to a dry run. To remove low-risk generated artifacts, old targeted `/tmp` leftovers, unused Roompire one-shot images such as `roompire-migrator`, dangling Docker image/build layers, and excess systemd journal archives, run:

```bash
ROOMPIRE_HOUSEKEEPING_CONFIRM=cleanup ./scripts/server_housekeeping.sh
```

Confirmed cleanup runs write `ops/status/latest-housekeeping.json` with the start/end time, exit code, root free bytes before/after cleanup, net reclaimed bytes, and the active cleanup modes. The ops snapshot reads that file so `/en-US/app/ops` can show the last cleanup outcome, not just whether the systemd service exited successfully. Dry runs do not update this status file.

For unattended runs, set `ROOMPIRE_HOUSEKEEPING_CLEAN_REPO_ARTIFACTS=auto` so the current checkout's `.next`, `.turbo`, Playwright report, and test-output directories are removed only when available root-disk bytes fall below `ROOMPIRE_HOUSEKEEPING_REPO_ARTIFACT_MIN_AVAILABLE_BYTES` and no active Next/Playwright/Turbo/pnpm build or test process is detected.

To also clear Python `uv` package caches, add `ROOMPIRE_HOUSEKEEPING_CLEAN_UV_CACHE=true`. To clear regenerated Node/pnpm caches during low-headroom maintenance, add `ROOMPIRE_HOUSEKEEPING_CLEAN_NODE_CACHES=true`; this removes cache directories such as `/root/.cache/pnpm`, `/root/.cache/node`, and temporary TSX/Playwright transform caches, not source trees or package manifests. The housekeeping script intentionally avoids Docker volumes, running-container data, production backups, and images that any current or stopped container still references. `ROOMPIRE_HOUSEKEEPING_ROOMPIRE_EPHEMERAL_IMAGES=true` removes only configured one-shot Roompire image repositories, defaulting to `roompire-migrator`; the next deploy rebuilds that image before running migrations.

When the server root disk pressure comes from old Codex browser workspaces, add `ROOMPIRE_HOUSEKEEPING_CLEAN_BROWSER_WORKSPACES=true` to remove generated dependency/build/test-output directories outside the current checkout while preserving source files and git history. For routine unattended cleanup, use `ROOMPIRE_HOUSEKEEPING_CLEAN_BROWSER_WORKSPACES=auto`; this removes only generated workspace artifacts when root free bytes fall below `ROOMPIRE_HOUSEKEEPING_WORKSPACE_ARTIFACT_MIN_AVAILABLE_BYTES` and no active Next/Playwright/Turbo/pnpm build or test process is detected.

For routine unattended cleanup, install the conservative housekeeping timer. It prunes targeted `/tmp` leftovers, unused Roompire one-shot images, dangling Docker/build cache, and excess journal archives, auto-cleans current-checkout build/test artifacts and old browser-workspace generated artifacts only under low-disk conditions, then refreshes the ops snapshot:

```bash
ROOMPIRE_SYSTEMD_INSTALL_UNITS="roompire-housekeeping.service roompire-housekeeping.timer" ./scripts/install_systemd_units.sh
ROOMPIRE_SYSTEMD_INSTALL_CONFIRM=install ROOMPIRE_SYSTEMD_INSTALL_UNITS="roompire-housekeeping.service roompire-housekeeping.timer" ./scripts/install_systemd_units.sh
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
ROOMPIRE_SYSTEMD_INSTALL_UNITS="roompire-reminders.service roompire-reminders.timer roompire-shared-app-storage.service roompire-shared-app-storage.timer" ./scripts/install_systemd_units.sh
ROOMPIRE_SYSTEMD_INSTALL_CONFIRM=install ROOMPIRE_SYSTEMD_INSTALL_UNITS="roompire-reminders.service roompire-reminders.timer roompire-shared-app-storage.service roompire-shared-app-storage.timer" ./scripts/install_systemd_units.sh
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

After the backup passphrase has been copied into an external secret-management workflow outside this server, record the escrow proof metadata without storing the secret:

```bash
ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_CONFIRM=recorded \
  ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_METHOD=password-manager \
  ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_CUSTODIAN=owner \
  ./scripts/write_backup_passphrase_escrow_status.sh
./scripts/collect_ops_status.sh
```

`write_backup_passphrase_escrow_status.sh` records only method, optional custodian, and verification time in `ops/status/backup-passphrase-escrow.json`; it does not read, write, print, or store the passphrase. The default freshness window is 180 days (`ROOMPIRE_BACKUP_PASSPHRASE_ESCROW_STALE_MS=15552000000`). Leave the status file absent until escrow has truly happened so the real-site ops dashboard keeps warning.

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

`scripts/verify_postgres_backup.sh <backup.dump>` restores a custom-format dump into a temporary database, verifies Prisma migration metadata, checks the audit hash chain, drops the temporary database, and writes `ops/status/latest-restore-drill.json`. This is the preferred daily restore drill because it does not touch the live database. Encrypted PostgreSQL dumps can be verified directly:

```bash
ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE=/srv/aialra/secrets/roompire-backup-passphrase \
  ROOMPIRE_RESTORE_DRILL_STATUS_FILE=ops/status/latest-restore-drill.json \
  ./scripts/verify_postgres_backup.sh /srv/aialra/backups/roompire/postgres/<backup>.dump.enc
```

Run `./scripts/collect_ops_status.sh` after a manual restore drill so `/en-US/app/ops` folds the latest result into the main host snapshot. The dashboard treats a passed or failed restore-drill result as stale after `ROOMPIRE_RESTORE_DRILL_STATUS_STALE_MS`, defaulting to 36 hours, so an old recovery proof cannot mask a broken backup timer. The same snapshot also checks backup freshness with `ROOMPIRE_BACKUP_FRESHNESS_STALE_MS`, defaulting to 36 hours, and warns when the latest complete local backup set is missing or stale across PostgreSQL dump, upload-volume archive, and file manifest categories.

For a destructive restore from an encrypted dump, keep the same passphrase variable and set the explicit restore confirmation:

```bash
ROOMPIRE_RESTORE_CONFIRM=restore \
  ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE=/srv/aialra/secrets/roompire-backup-passphrase \
  ./scripts/restore_postgres.sh /srv/aialra/backups/roompire/postgres/<backup>.dump.enc
```

To schedule daily backups on a systemd host, render and install the backup units from the live checkout, then enable the timer:

```bash
ROOMPIRE_SYSTEMD_INSTALL_UNITS="roompire-backup.service roompire-backup.timer" ./scripts/install_systemd_units.sh
ROOMPIRE_SYSTEMD_INSTALL_CONFIRM=install ROOMPIRE_SYSTEMD_INSTALL_UNITS="roompire-backup.service roompire-backup.timer" ./scripts/install_systemd_units.sh
systemctl enable --now roompire-backup.timer
systemctl list-timers roompire-backup.timer
```

The tracked Roompire backup service template enables encrypted scheduled backups for the current self-hosted deployment. For another deployment, ensure these environment lines are present in the rendered `/etc/systemd/system/roompire-backup.service`:

```ini
Environment=ROOMPIRE_BACKUP_ENCRYPTION=enabled
Environment=ROOMPIRE_BACKUP_ENCRYPTION_PASSPHRASE_FILE=/srv/aialra/secrets/roompire-backup-passphrase
Environment=ROOMPIRE_BACKUP_REMOVE_PLAINTEXT=true
Environment=ROOMPIRE_RESTORE_DRILL_STATUS_FILE=ops/status/latest-restore-drill.json
```

Offsite backup sync is disabled until a real target exists. The sync only copies encrypted artifacts and `.sha256` sidecars, then writes `ops/status/backup-offsite.json` for the ops dashboard. For a mounted off-host directory, add:

```ini
Environment=ROOMPIRE_BACKUP_OFFSITE_MODE=local
Environment=ROOMPIRE_BACKUP_OFFSITE_TARGET_DIR=/mnt/roompire-offsite
Environment=ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE=ops/status/backup-offsite.json
Environment=ROOMPIRE_BACKUP_OFFSITE_ALLOW_SAME_FILESYSTEM=false
```

Local offsite mode rejects targets whose `stat` device id matches the backup root by default. This catches missing mounts such as an empty `/mnt/roompire-offsite` directory silently falling back to the server root disk. Set `ROOMPIRE_BACKUP_OFFSITE_ALLOW_SAME_FILESYSTEM=true` only for a controlled non-offsite drill; the ops dashboard will still surface a same-filesystem warning.

For a configured `rclone` remote, use:

```ini
Environment=ROOMPIRE_BACKUP_OFFSITE_MODE=rclone
Environment=ROOMPIRE_BACKUP_OFFSITE_RCLONE_REMOTE=roompire-offsite:backups/roompire
Environment=ROOMPIRE_BACKUP_OFFSITE_STATUS_FILE=ops/status/backup-offsite.json
```

Leave `ROOMPIRE_BACKUP_OFFSITE_MODE=disabled` until the target is truly off the server root filesystem. The ops dashboard will show an expected warning while no offsite copy is configured, and it records source/target device ids after local syncs so mount-loss checks are visible from the real site.

## Ops Automation

The ops dashboard reads generated JSON snapshots from `ops/status/`. Install the timer units from the live checkout so `WorkingDirectory` and `EnvironmentFile` point at this server's current path without manual editing:

```bash
./scripts/install_systemd_units.sh
ROOMPIRE_SYSTEMD_INSTALL_CONFIRM=install ./scripts/install_systemd_units.sh
```

The first command is a dry-run. The confirmed command renders every `ops/systemd/roompire-*` unit with this server's current checkout path, verifies the rendered units with `systemd-analyze verify`, copies them to `/etc/systemd/system/`, and runs `systemctl daemon-reload`. Then enable the timers and start the low-risk validation services:

```bash
systemctl enable --now roompire-ops-status.timer roompire-smoke.timer roompire-reminders.timer roompire-shared-app-storage.timer roompire-housekeeping.timer roompire-backup.timer
systemctl start roompire-ops-status.service roompire-smoke.service
systemctl list-timers 'roompire-*'
```

`roompire-ops-status.timer` refreshes disk, production deploy headroom, root storage inventory, disk-capacity trend, Docker storage, Docker image inventory, production container health, its own timer/service state, backup timer/service state, housekeeping timer/service state plus latest confirmed cleanup result, reminder timer/service state, backup freshness, backup encryption health, passphrase escrow proof metadata, offsite backup copy status, smoke timer/service state, latest smoke state, latest restore-drill state, and the latest shared app storage status file every 15 minutes. The deploy headroom check compares current free bytes with `ROOMPIRE_DEPLOY_MIN_AVAILABLE_BYTES` so the ops dashboard and `scripts/check_deploy_headroom.sh` enforce the same pre-build capacity gate. The Docker storage snapshot records image, container, local-volume, and build-cache size/reclaimable totals from `docker system df`, but summary warnings use only conservative safe-cleanup candidates: build cache plus dangling images or configured one-shot Roompire images that no current or stopped container references. Docker-reported image and volume reclaimable totals remain visible as evidence, not as automatic deletion targets. The image inventory records the largest image references, active/inactive image bytes, and safe image candidates so disk-pressure investigations do not require shell access from the web container. The production container health snapshot records only configured Compose containers and warns on stopped, unhealthy, starting, or unreadable services. The root storage inventory records selected host path sizes as capacity-planning evidence, not as cleanup targets. The inventory is evidence only; it does not prune shared server images or app directories. `roompire-shared-app-storage.timer` runs the slower shared-server app inventory daily and then refreshes the main ops snapshot; the web status reader raises `shared_app_storage_attention` or `shared_app_storage_stale` only when a recorded shared-app inventory is partial or old. The backup freshness snapshot checks the latest complete local backup set across PostgreSQL, uploads, and file manifest artifacts and warns when any category is missing or stale. The encryption health snapshot checks the backup unit configuration, passphrase file presence, encrypted artifact count, plaintext artifact count, and `.sha256` sidecar coverage without exposing secret values. The passphrase escrow snapshot checks whether non-secret proof metadata exists and whether its latest verification is fresh; it warns while encrypted backups are enabled but escrow proof is missing or stale. The offsite snapshot checks whether a real sync target is configured and whether the latest sync status is healthy. The restore-drill snapshot records the latest verified PostgreSQL backup artifact, temporary drill database name, audit event count, hashed event count, and broken hash count; the web status reader raises `restore_drill_failed`, `restore_drill_missing`, or `restore_drill_stale` when recovery proof is bad, absent, or too old. `roompire-smoke.timer` runs authenticated real-domain checks hourly at minute 7, updates `ops/status/latest-smoke.json`, then refreshes the ops snapshot; the web status reader raises `smoke_stale` when that latest smoke timestamp is older than the configured stale threshold. `roompire-reminders.timer` runs recurring expense proposal generation followed by in-app reminder delivery hourly at minute 17 and refreshes ops status after each service run. The ops dashboard surfaces these automation timers and their latest service results so stale snapshot, stale smoke, stale backup set, stale restore-drill proof, passphrase escrow proof, reminder automation, projected disk exhaustion, deploy headroom shortfall, latest cleanup outcome, safe cleanup candidates, root storage sources, shared app storage sources, large Docker images, or unhealthy production containers are visible from the real site.

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
