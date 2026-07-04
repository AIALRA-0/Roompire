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

Later enhancement:

- Hash chain audit events with `prev_hash` and `event_hash`.

## Backup strategy

### Minimum MVP

- Daily PostgreSQL dump.
- Daily object storage manifest/export.
- Retention policy: at least 14 daily backups for early MVP.
- Encrypted backup storage.
- Restore instructions in repo docs.

### Production recommended

- PostgreSQL continuous archiving/WAL with point-in-time recovery, or managed PostgreSQL PITR.
- Daily base backup.
- Object storage versioning.
- Offsite backup copy.
- Monthly restore drill.

Private receipts can be stored locally for development or in S3-compatible object storage for production. Production buckets must be private, should use versioning or provider snapshots, and should be covered by an object inventory/manifest export that can be reconciled against the database `File` rows.

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

Apply to:

- auth requests
- invite creation/acceptance
- file presign endpoints
- comment endpoints
- approval endpoints if abuse detected

## Compliance posture

Roompire is a household coordination tool, not a bank or payment processor. It records obligations and settlements but should not custody money or process regulated payments in MVP.
