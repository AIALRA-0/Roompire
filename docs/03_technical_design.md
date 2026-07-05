# 03 — Technical Design Document

## Architecture overview

Roompire is a monorepo with a PWA-first Next.js application, PostgreSQL database, Prisma data access, optional background worker, Redis queue, object storage, and OpenAPI-defined REST endpoints.

Recommended topology for MVP:

```text
Browser/PWA
   |
   | HTTPS
   v
Next.js App Router
   |-- Server Components / Route Handlers
   |-- API layer with zod validation
   |-- Auth/session middleware
   |
   +--> PostgreSQL via Prisma
   +--> Redis/BullMQ for jobs
   +--> S3/R2/MinIO for attachments
   +--> FX provider abstraction
```

If the app grows, split API/worker into separate services while preserving OpenAPI contract.

## Monorepo structure

```text
Roompire/
  apps/
    web/                    # Next.js PWA
  packages/
    db/                     # Prisma schema, client, migrations helpers
    ui/                     # shared shadcn/ui wrappers if needed
    config/                 # eslint, tsconfig, tailwind presets
    core/                   # money, fx, ledger, approval state machine
    test-utils/             # seed helpers, fixtures
  docs/
  specs/
    openapi.roompire.v1.yaml
  db/
  seed-data/
  .github/workflows/
  AGENTS.md
  PROJECT_MEMORY.md
```

For a smaller first implementation, `apps/web` can contain route handlers and server-side domain services. Extract packages as soon as duplicated logic appears.

## Core bounded contexts

### Identity and access

- Users
- Sessions/accounts
- Households
- Memberships
- Roles and permissions
- Invite tokens

### Expenses and approvals

- Expense proposals
- Expense shares
- Payers/creditors
- Debtors
- Approval decisions
- Comments/disputes
- Attachments

### FX

- FX rates
- FX locks
- FX provider abstraction
- Manual-rate approval

### Ledger

- Ledger transactions
- Ledger lines/obligations
- Settlements
- Reversals/adjustments
- Balance calculation

### Calendar/tasks

- Events
- Tasks
- Recurrence rules
- Event links
- Reminders

### Audit/statistics/export

- Audit event log
- Derived statistics
- Export jobs

## Domain flow: expense to debt

```text
1. User creates proposal
2. System validates split math and permissions
3. System locks FX rate for expense date
4. Proposal is submitted
5. Required parties review
6. Debtor B approves B share
7. Creditor/payer confirmation exists
8. System creates formal obligation for B share
9. Audit events are emitted
10. Balance summary updates from formal ledger only
```

Rejected or pending shares stay outside the formal ledger.

## Approval state machine

### Proposal-level states

- `DRAFT`
- `SUBMITTED`
- `PARTIALLY_APPROVED`
- `APPROVED`
- `PARTIALLY_MATURED`
- `MATURED_TO_LEDGER`
- `REJECTED`
- `DISPUTED`
- `CANCELLED`

### Share-level states

- `PENDING`
- `APPROVED`
- `REJECTED`
- `DISPUTED`
- `MATURED_TO_LEDGER`

### Required conditions for share maturity

A share can mature when:

- proposal is submitted and not cancelled;
- share state is approved by debtor;
- payer/creditor confirmation exists;
- FX lock is present if currency conversion required;
- share has not already created a ledger obligation;
- household settings allow partial maturity or all shares are approved.

Use persisted idempotency keys and unique constraints to prevent duplicate ledger creation. Current financial mutations store one `IdempotencyRecord` per user/key with a request hash and replayable response; a reused key with a different endpoint or body is rejected with `409`.

## Ledger design

Formal ledger must be append-only.

Recommended abstraction:

- `ledger_transactions`: group of formal ledger effects, e.g. debt creation, settlement, reversal.
- `debt_obligations`: concrete "debtor owes creditor" records from approved shares.
- `settlements`: repayment records that reduce obligations.
- `settlement_files`: optional evidence files attached to submitted settlements.
- `ledger_links`: references source proposal/share/settlement/reversal.

Balances should be computed from obligations minus settlements. Store cached/materialized summaries for performance only if they can be rebuilt.

## Money and decimal handling

- Use `Decimal` in Prisma/PostgreSQL numeric columns.
- Use a decimal library in TypeScript for calculations.
- Never use JavaScript floating point for money.
- Store minor units only if currencies are simple; because FX and fractional rates are required, use numeric decimal with strict rounding rules.
- Store rounding mode and scale.

Recommended numeric fields:

- Amounts: `numeric(20, 6)` internal.
- Display rounding: currency-specific, e.g. CNY/USD 2 decimals.
- FX rates: `numeric(24, 12)`.

## FX provider abstraction

Interface:

```ts
interface FxProvider {
  name: string;
  getRate(input: {
    baseCurrency: string;
    quoteCurrency: string;
    date: string; // YYYY-MM-DD
  }): Promise<{
    rate: Decimal;
    rateDate: string;
    provider: string;
    fetchedAt: Date;
    sourceMeta?: Record<string, unknown>;
  }>;
}
```

Implementation priorities:

1. Cached internal `fx_rates` table.
2. Primary public provider.
3. Secondary provider.
4. Manual rate with approval.

The locked rate used by a proposal must be copied into the proposal/share/ledger context, not merely referenced as mutable external state.

## Calendar/task design

Use FullCalendar in the frontend and recurrence rules stored in the backend.

Event types:

- `TASK`
- `CHORE`
- `GROUP_ACTIVITY`
- `BILL_DUE`
- `REPAYMENT_DUE`
- `SETTLEMENT_REMINDER`
- `RECURRING_EXPENSE_GENERATION`

Events link to domain records via polymorphic `event_links`:

- expense proposal
- expense share
- debt obligation
- settlement
- task
- recurring template

Background jobs generate upcoming recurrence instances.

## Notifications

Initial notification model:

- `notifications`
- `notification_preferences` for per-user in-app/email/proposal/settlement/task reminder defaults

Delivery channels:

- in-app MVP, gated by preferences
- email later
- Web Push later
- WeChat subscription message later

Current implemented subset:

- `GET /api/v1/notifications` lists the current user's recent in-app notifications across active household memberships.
- `PATCH /api/v1/notifications/{notificationId}` marks one scoped notification read or unread.
- Creating an expense proposal writes `EXPENSE_PROPOSAL_ASSIGNED` notifications for debtor shares when the target user's in-app and proposal preferences allow it.

Use queue workers for scheduled reminders and recurring generation.

## Auth strategy

MVP options:

- Auth.js/NextAuth or Lucia-style lightweight session model.
- Email magic link in production.
- Dev-only password or mocked auth for test setup.
- Google OAuth optional.

Rules:

- Session must resolve current user.
- Every household-scoped request must check membership.
- Every mutation must check role/permission.
- Never rely only on client-side checks.

## API design

- REST-first with OpenAPI 3.x.
- Server validates input with zod or equivalent.
- API responses use consistent envelope for errors.
- All mutation endpoints support idempotency key where duplicate submission is possible.
- Pagination for list endpoints.
- Audit event created in same transaction as mutation where possible.

## Background jobs

Use BullMQ/Redis or a simple cron worker for MVP.

Job types:

- `fx.prefetch`
- `recurringExpense.generate`
- `taskReminder.send`
- `debtDueReminder.send`
- `export.generate`
- `backup.verify` optional

Jobs must be idempotent.

## Deployment design

MVP recommended deployment:

- Docker Compose on the self-hosted server, with host nginx terminating TLS for the current live deployment.
- Services:
  - web
  - postgres
  - redis
  - worker
  - object storage or external R2
  - reverse proxy
- Cloudflare DNS and TLS for `roompire.aialra.online`.

Alternative:

- Cloudflare Workers/OpenNext for web/API.
- Managed PostgreSQL.
- Cloudflare R2.

Use Docker-first as the stable baseline. Optimize edge deployment later if needed.

## Observability

- Structured logs.
- Request IDs.
- Audit IDs.
- Error tracking optional.
- Health endpoints:
  - app health
  - database health
  - queue health
  - storage health

## Security architecture

- RBAC on every mutation.
- Household isolation in queries.
- Private object storage keys.
- Signed URLs for attachments.
- CSRF protection for cookie-based auth.
- Rate limiting for auth/invite endpoints.
- No secrets in client bundle.
- No sensitive payment credentials.

## Backup and restore

- Daily base backup at minimum.
- WAL/PITR or managed equivalent for production.
- Object storage versioning or scheduled mirror.
- Restore drill documented and tested.
- Backup status visible to admin later.

## Build-vs-buy policy

Reuse mature libraries for:

- UI primitives
- calendar views
- recurrence rules
- validation
- auth/session
- ORM/migrations
- queues
- object storage clients
- E2E testing
- i18n

Custom build only:

- approval-gated expense domain
- FX lock policy
- formal ledger invariants
- household-specific calendar/task/expense integration
