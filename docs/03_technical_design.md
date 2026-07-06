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

## PWA shell caching

The web app registers a conservative service worker from `/sw.js`. It precaches only
the offline shell, app icon, manifest, and immutable Next.js static assets. Navigation
requests are network-first and fall back to `/offline` only when the browser is
offline. API routes, signed downloads, and image optimization requests are
network-only so household, ledger, settlement, and audit data are never served from a
stale client cache. The same worker handles Web Push `push` and `notificationclick`
events without broadening the HTTP cache surface.

The dashboard exposes a small install action only after the browser emits
`beforeinstallprompt`. The client keeps the deferred prompt in memory, calls the
browser-native prompt on user click, and switches to an installed status after
`appinstalled` or standalone display-mode detection.

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
- Recurring expense templates
- Reminders

### Audit/statistics/export

- Audit event log
- Derived statistics
- Export jobs

## Domain flow: expense to debt

```text
1. User creates proposal
2. System validates split math and permissions
3. System locks FX rate for expense date, or requires a manual rate when the household uses manual FX approval
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
- share state is approved by the required actor for the household approval policy;
- payer/creditor confirmation exists, with proposal submission counting as primary-payer confirmation under the default policy;
- FX lock is present if currency conversion required;
- share has not already created a ledger obligation;
- `PAYER_AND_EACH_DEBTOR` allows each debtor-approved share to mature independently, `ALL_PARTICIPANTS` waits until every share is approved before any share matures, and `PAYER_ONLY` lets the primary payer mature shares directly.

Use persisted idempotency keys and unique constraints to prevent duplicate ledger creation. Current financial mutations store one `IdempotencyRecord` per user/key with a request hash and replayable response; a reused key with a different endpoint or body is rejected with `409`.

## Ledger design

Formal ledger must be append-only.

Recommended abstraction:

- `ledger_transactions`: group of formal ledger effects, e.g. debt creation, settlement, reversal.
- `debt_obligations`: concrete "debtor owes creditor" records from approved shares.
- `settlements`: repayment records that reduce obligations.
- `settlement_files`: optional evidence files attached to submitted settlements.
- `ledger_period_closes`: household month close/reopen state that blocks formal ledger writes for closed posting months.
- `ledger_links`: references source proposal/share/settlement/reversal.

Balances should be computed from obligations minus settlements. Store cached/materialized summaries for performance only if they can be rebuilt.
The ledger service owns period-close checks so approval maturity, settlements, adjustments, and reversals return the same `LEDGER_PERIOD_CLOSED` error when their posting date falls in a closed month.

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
3. Secondary provider or compatible endpoint failover.
4. Manual rate with approval.

The locked rate used by a proposal must be copied into the proposal/share/ledger context, not merely referenced as mutable external state. Current live lookup uses a provider chain after cache misses: `ROOMPIRE_FX_PROVIDER=frankfurter,ecb` tries configured providers in order. `ROOMPIRE_FX_FRANKFURTER_BASE_URLS` lists Frankfurter-compatible endpoints, while `ROOMPIRE_FX_ECB_BASE_URLS` lists ECB Data Portal EXR endpoints; the ECB provider computes non-EUR pairs by cross-converting official EUR reference rates across a 7-day lookback window and stores the successful provider name with the copied rate. Proposal list/detail surfaces classify that copied provider as manual entry, provider/cache, same-currency, original-currency debt, or unknown source so reviewers can tell whether a rate was human-entered or system-derived. Current household settings expose `LOCK_AT_EXPENSE_DATE`, `ORIGINAL_CURRENCY_DEBT`, `MANUAL_RATE_WITH_APPROVAL`, and `FX_DIFFERENCE_ADJUSTMENT`. Under original-currency debt, the proposal's settlement currency becomes the entered original currency and the stored FX lock is `1` with `fxProvider=original-currency-debt`; settlement suggestions and balances then group that debt by original currency. Under FX-difference adjustment, proposals still mature at the expense-date locked settlement-currency amount, and any later payment-date FX variance is appended as an audited `FX_ADJUSTMENT` ledger transaction through the owner/admin correction workflow instead of mutating the original debt.

## Calendar/task design

Use backend-stored recurrence rules with materialized event/task instances for the current MVP. The localized calendar workspace renders list/day/week/month views from the loaded materialized events.

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

Task due dates create linked `TASK` calendar events. Updating a task creates, updates, or removes that linked event so the task stays authoritative. Direct calendar edits are allowed for standalone materialized events; task-linked and debt-obligation-linked events are locked and must be changed from their source record.

The task workspace derives list, status-board, and due-date calendar modes from the loaded task window. List and board modes preserve the same task actions, while calendar mode keeps a compact due-date scan. Calendar/task filters are server-side and URL-backed so paginated windows do not hide matches outside the currently loaded client data; event filters support type/status/member/template-category, and task filters support status/priority/assignee/category.

`RECURRING_EXPENSE_GENERATION` events can own a `RecurringExpenseTemplate` that stores the proposal title, merchant/category, original amount/currency, optional locked FX rate, and debtor participant IDs. Finite recurrence copies the template onto each materialized occurrence. The idempotent `pnpm recurring-expenses:generate` job scans due open template-backed events without an existing expense-proposal link and creates one pending proposal through the same event-to-proposal service path used by manual calendar actions.

## Notifications

Initial notification model:

- `notifications`
- `notification_preferences` for per-user in-app/email/proposal/settlement/task reminder defaults
- `notification_push_subscriptions` for user-owned browser PushManager subscriptions

Delivery channels:

- in-app MVP, gated by preferences
- Web Push optional progressive enhancement, gated by VAPID configuration and browser permission
- email later
- WeChat subscription message later

Current implemented subset:

- `GET /api/v1/notifications` lists the current user's in-app notifications across active household memberships with cursor pagination metadata for dashboard load-more behavior.
- `PATCH /api/v1/notifications/{notificationId}` marks one scoped notification read or unread.
- `GET/POST/DELETE /api/v1/notifications/push-subscriptions` exposes Web Push readiness, registers or refreshes the current browser subscription, and disables a subscription for the current user.
- Creating an expense proposal writes `EXPENSE_PROPOSAL_ASSIGNED` notifications for debtor shares when the target user's in-app and proposal preferences allow it.
- `pnpm recurring-expenses:generate` is an idempotent recurring-expense job. It emits one pending proposal per due open template-backed recurring expense event, then leaves debtor approval to the normal expense flow.
- `pnpm notifications:send-reminders` is an idempotent reminder job. It emits task due/overdue, debt due/overdue, and stale settlement confirmation notifications through fixed `dedupeKey` values, respects in-app/topic preferences, only targets currently active household members, and best-effort dispatches Web Push for newly created notification rows when configured.

Use queue workers for future higher-volume scheduled work. The current self-hosted production deployment runs recurring expense generation first and reminder delivery second through the same systemd timer, then surfaces timer/service health in the ops snapshot.

## Auth strategy

MVP options:

- Auth.js/NextAuth or Lucia-style lightweight session model.
- Email magic link in production.
- Dev-only password or mocked auth for test setup.
- Google OAuth optional.

Rules:

- Session must resolve current user.
- The active household is a browser-session preference stored in an HttpOnly cookie and revalidated against active membership on every dashboard/session read.
- Every household-scoped request must check membership.
- Every mutation must check role/permission.
- Never rely only on client-side checks.

## API design

- REST-first with OpenAPI 3.x.
- Server validates input with zod or equivalent.
- API responses use consistent envelope for errors.
- Growing list endpoints should expose cursor pagination metadata while preserving stable array fields for existing clients.
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
- `settlementConfirmationReminder.send`
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
  - Web Push VAPID configuration

## Security architecture

- RBAC on every mutation.
- Household isolation in queries.
- Private object storage keys.
- Signed URLs for attachments.
- CSRF origin guard for cookie-based unsafe API mutations. The proxy rejects cross-site `Origin`, `Referer`, or `Sec-Fetch-Site` metadata before route handlers run while preserving non-browser operational clients that do not send browser origin headers.
- Fixed-window rate limiting for site-gate failures, dev-session switching, invite creation/acceptance, file upload intents, proposal comments, and share decisions.
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
