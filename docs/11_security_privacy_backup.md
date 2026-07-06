# 11 — Security, Privacy, Backup, and Recovery

## Security goals

- Protect household data from other households.
- Prevent unauthorized financial mutations.
- Preserve formal ledger integrity.
- Keep attachments private.
- Avoid storing sensitive payment credentials.
- Ensure recoverability after operator mistake or server failure.

## Threat model

### Risks

- User guesses another household URL.
- Member tries to approve another person's share.
- Viewer attempts mutation.
- Duplicate submit creates duplicate debt.
- Attacker replays invite token.
- File URL leaks receipt.
- Floating point/rounding bug changes money.
- Admin accidentally deletes data.
- Database failure without usable backup.

### Mitigations

- Household membership check on every query.
- RBAC on every mutation.
- Per-share approval authorization.
- Idempotency keys and unique constraints.
- Expiring hashed invite tokens.
- Signed URLs and private buckets.
- Decimal arithmetic and invariant tests.
- Append-only ledger and audit events.
- Backups and restore drills.

## Authentication

MVP:

- Secure session cookies.
- Email magic link or development auth.
- Optional Google OAuth.
- Private MVP deployments may bridge verified site-level Basic Auth to the app user while production auth provider selection remains open.

Requirements:

- HttpOnly cookies.
- Secure cookies in production.
- SameSite settings appropriate for app.
- Do not trust unsigned dev-session cookies or dev-user headers in production.
- CSRF protection for cookie-based mutations.
- Rate limit login/invite endpoints.

Current CSRF implementation: the Next proxy checks unsafe `/api/v1` methods before route handlers run. Browser-style requests with cross-site `Sec-Fetch-Site`, mismatched `Origin`, mismatched `Referer`, or opaque `Origin: null` are rejected with `403 CSRF_ORIGIN_MISMATCH`. Same-origin browser requests and non-browser operational clients that omit browser origin metadata remain supported.

## Authorization

Every request must check:

1. Is user authenticated?
2. Is user a member of the household?
3. Does user role permit this action?
4. If approval/settlement, is user a valid party to this action?

Do not trust client-provided household/member IDs.

## Data privacy

Do not store:

- SSN.
- Passport/driver license.
- Full bank/card account numbers.
- Payment account credentials.
- Raw OAuth tokens without encryption/secure provider handling.

Allow storing:

- Payment method label, e.g. Venmo/Zelle/WeChat/manual.
- Non-sensitive settlement note.
- Receipt image if user uploads it.

## File security

- Use private bucket.
- Store object keys, not public URLs.
- Generate short-lived signed download URLs.
- Validate MIME type and size.
- Compute SHA-256 to deduplicate/verify.
- Consider virus scanning later.

## Audit integrity

Audit events should include:

- actor
- action
- entity type/id
- before/after snapshot where safe
- metadata
- timestamp
- request ID

Current implementation hash-chains audit events with `prev_hash` and `event_hash`. A PostgreSQL trigger computes the hash before insert, migration backfills existing rows, and the audit API/page expose verification status so backups can be checked for tampering after restore.

## Backup strategy

### Minimum MVP

- Daily PostgreSQL dump.
- Daily object storage manifest/export. `scripts/backup_file_manifest.sh` exports the database `File` rows, configured storage provider, bucket, object keys, MIME types, sizes, SHA-256 hashes, and pending/completed counts so stored receipt objects can be reconciled after backup or restore.
- Retention policy: at least 14 daily backups for early MVP.
- Encrypted backup storage. `scripts/backup_all.sh` supports optional OpenSSL-based backup encryption through `ROOMPIRE_BACKUP_ENCRYPTION=enabled` and a passphrase file kept outside git.
- Optional offsite copy. `scripts/sync_backup_artifacts.sh` copies encrypted backup artifacts and `.sha256` sidecars to a configured mounted directory or `rclone` remote after the local backup and retention pass succeeds.
- Daily non-destructive restore drill with `scripts/verify_postgres_backup.sh` to validate dump readability, migration metadata, and audit hash-chain integrity. The script writes `ops/status/latest-restore-drill.json` so the authenticated ops dashboard can warn when the latest recovery proof failed, is missing, or is stale.
- Restore instructions in repo docs.

### Production recommended

- PostgreSQL continuous archiving/WAL with point-in-time recovery, or managed PostgreSQL PITR.
- Daily base backup.
- Object storage versioning.
- Offsite backup copy to storage that is not the same server root filesystem.
- Monthly restore drill.

Private receipts can be stored locally for development or in S3-compatible object storage for production. Production buckets must be private, should use versioning or provider snapshots, and should be covered by an object inventory/manifest export that can be reconciled against the database `File` rows. The combined backup flow writes the Roompire file manifest beside the PostgreSQL and upload-volume backups, then encrypts it with the other artifacts when backup encryption is enabled.

When encrypted local backups are enabled, the passphrase file must be backed up separately in the server secret-management workflow. The encrypted `.enc` artifacts include `.sha256` sidecars for ciphertext integrity checks; restore drills can verify encrypted PostgreSQL dumps directly after decryption and record the verified artifact path plus audit hash-chain counts in the latest restore-drill status file.

Offsite backup sync is disabled by default until a real target is configured. When enabled, the sync status is written to `ops/status/backup-offsite.json` and folded into the authenticated ops dashboard without exposing storage credentials. Local offsite targets are rejected when they are on the same filesystem as the backup root unless `ROOMPIRE_BACKUP_OFFSITE_ALLOW_SAME_FILESYSTEM=true` is explicitly set for a non-offsite drill, and the dashboard records the source/target device ids so missing mounts are visible. The offsite copy does not replace passphrase escrow; the backup encryption passphrase still needs a separate secret-management backup.

Reminder delivery is run by the host systemd timer, not by a public API. Reminder notifications use nullable unique `Notification.dedupeKey` values so repeated or retried jobs do not generate duplicate task/debt/settlement reminders, and delivery is still scoped to active household memberships plus per-user notification preferences. Web Push subscriptions are user-owned endpoint/key records; delivery is best-effort, disabled by missing VAPID keys, and expired or gone endpoints are soft-disabled instead of deleting audit-relevant notification rows.

## Restore drill

At least before production launch:

1. Create sample household with expenses, approvals, ledger, files.
2. Take backup.
3. Destroy local database/container.
4. Restore from backup.
5. Verify:
   - users/household exist
   - proposals exist
   - formal ledger balances match expected
   - audit events exist
   - attachments metadata exists
   - app can load restored data
6. Document result in `PROJECT_MEMORY.md`.

## Secret management

- Use `.env.local` for local.
- Use deployment secrets for production.
- Provide `.env.example` only.
- Never commit real secrets.
- Rotate secrets if leaked.

## Rate limiting

Current implementation uses fixed-window limits for the single-container self-hosted deployment. Failed site-gate Basic Auth attempts are limited in the Next proxy before pages/API routes are reached. API routes return `429 RATE_LIMITED` with `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers when a scoped limit is exceeded. Limits are enabled by default and can be disabled with `ROOMPIRE_RATE_LIMITS_ENABLED=false` during emergency maintenance; per-scope `ROOMPIRE_RATE_LIMIT_*_LIMIT` and `ROOMPIRE_RATE_LIMIT_*_WINDOW_SECONDS` variables tune thresholds.

Applied to:

- auth requests
- invite creation/acceptance
- file presign endpoints
- comment endpoints
- share approve/reject/request-changes endpoints

Future horizontal scaling should move the counter store from the current in-process map to Redis or another shared low-latency store so limits remain global across multiple web instances.

## Compliance posture

Roompire is a household coordination tool, not a bank or payment processor. It records obligations and settlements but should not custody money or process regulated payments in MVP.
