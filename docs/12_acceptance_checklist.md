# 12 — Acceptance Checklist

Use this checklist before declaring a milestone complete.

## General

- [ ] Feature matches PRD and relevant docs.
- [ ] No unreviewed architectural drift.
- [ ] `PROJECT_MEMORY.md` updated.
- [ ] Git branch pushed.
- [ ] Commit messages use Conventional Commits.

## Code quality

- [ ] TypeScript strict passes.
- [ ] Lint passes.
- [ ] Unit tests pass.
- [ ] Build passes.
- [ ] No `any` without justification.
- [ ] No hard-coded user-facing strings.
- [ ] No secrets committed.

## UI/UX

- [ ] UI follows modern minimal SaaS direction.
- [ ] Responsive desktop and mobile layouts.
- [ ] Empty/loading/error states present.
- [ ] Keyboard and focus behavior works.
- [ ] zh-CN and en-US strings present.

## Real browser verification

- [ ] Playwright test interacts with actual webpage.
- [ ] Desktop viewport covered.
- [ ] Mobile viewport covered.
- [ ] Happy path covered.
- [ ] At least one edge/failure path covered where relevant.
- [ ] Screenshots/traces retained if debugging needed.

## Financial/ledger safety

- [ ] Pending proposals do not affect formal balances.
- [ ] Rejected shares do not affect formal balances.
- [ ] Approved shares mature exactly once.
- [ ] Ledger rows are append-only.
- [ ] Corrections use reversal/adjustment.
- [x] Month close blocks formal ledger writes in closed periods until reopened.
- [ ] Money uses decimal arithmetic.
- [x] FX locks store provider/rate/rate date/locked timestamp.
- [ ] Audit event emitted for critical mutation.

## Security

- [ ] Household isolation enforced server-side.
- [ ] RBAC enforced server-side.
- [ ] User can only approve/reject their own share.
- [x] CSRF origin guard rejects cross-site browser mutations before route handlers.
- [ ] File access is private/signed.
- [ ] Idempotency used for duplicate-prone mutations.

## Database/migrations

- [ ] Migration is forward-safe.
- [ ] Destructive migration avoided or explicitly documented.
- [ ] Indexes added for new list/filter queries.
- [ ] Constraints added for ledger invariants where possible.

## API

- [ ] Endpoint documented.
- [ ] OpenAPI updated.
- [ ] Validation errors standardized.
- [ ] Permission errors standardized.
- [ ] Pagination used for lists.
- [x] Household category management APIs and settings UI let owners/admins create, update, and archive active categories while members can only read them.
- [x] Dashboard proposal and notification lists expose cursor pagination metadata and load-more controls.
- [x] Audit event API returns cursor pagination metadata, the audit page can load larger result windows, and audit exports keep a full-history query path.
- [x] Ledger obligation, ledger transaction, and settlement list APIs return cursor pagination metadata; the ledger page can load larger obligation/transaction result windows while balances/actions/exports keep full-history query paths.
- [x] Calendar event and task list APIs return cursor pagination metadata; the calendar page can load larger event/task windows.

## Deployment/backup

- [ ] Docker/local environment still works.
- [ ] CI passes.
- [ ] Backup implications considered for schema changes.
- [ ] Restore drill updated when backup behavior changes.
