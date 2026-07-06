# Roompire

Roompire is a PWA-first shared-house operations system for approval-based roommate expenses, locked historical FX, append-only debt ledger, settlements, calendar-like tasks/events, recurring bills, audit logs, statistics, backups, and bilingual zh-CN/en-US UX.

Production domain target: `roompire.aialra.online`

## Current Status

Phase 0 bootstrap is implemented:

- pnpm workspace + Turborepo.
- Next.js App Router app in `apps/web`.
- TypeScript strict, ESLint, Prettier, Tailwind CSS, shadcn/ui-style primitives, lucide icons.
- next-intl with `en-US` and `zh-CN` routes.
- Landing page at `/` via locale redirect, localized pages at `/en-US` and `/zh-CN`.
- Dashboard shell at `/en-US/app` and `/zh-CN/app`.
- Protected-state example at `/[locale]/app/forbidden`.
- PWA manifest, icon, service worker registration, dashboard install prompt, safe offline shell
  caching, and optional browser push notifications without caching API/financial data.
- Prisma/PostgreSQL schema, initial migration, deterministic seed data.
- Docker Compose for Postgres and Redis.
- Vitest money split unit tests.
- Playwright desktop and mobile real-browser smoke tests.
- GitHub Actions CI/E2E workflow templates.

Phase 1 identity/RBAC slice is implemented:

- Dev-session auth for local MVP testing through the `roompire_session` cookie.
- Prisma-backed current session, active household switching, household list, household creation, household settings update, household category/tag management, member list, member role update/removal, invite creation, and invite acceptance APIs.
- Server-side membership and role checks for every implemented household-scoped route.
- Dashboard now loads seeded household/user/member data from PostgreSQL instead of static fixtures.
- Browser UI can switch dev users, switch the active household, create households, edit household settings plus active categories/tags, create invite codes/links, accept invite codes or tokenized links, open member directory pages, update member roles, and remove members.
- Viewer invite attempts are rejected by the API and verified in browser.
- Non-members cannot view member directory pages before accepting an invite.
- OpenAPI covers the current Phase 1 household, category/tag, member, invite, and settings endpoints.

Phase 2 expense proposal approval/ledger slice is implemented:

- Owners, admins, and members can create submitted expense proposals from the dashboard.
- Proposal creation records the proposal, primary payer, pending debtor shares, locked FX metadata, and an audit event.
- Cross-currency proposals can omit `fxRate` under the default household FX policy; Roompire locks the expense-date rate from the `FxRate` cache or configured FX provider. Households can switch to manual FX approval, which requires a reviewed `fxRate` for every cross-currency proposal.
- Dashboard proposal creation supports equal, exact-amount, percentage, and share-unit splits with a live split preview; owners/admins can maintain household proposal tags, proposals can attach multiple active tags, and proposal queues/details/exports show stored tags.
- Proposal creation supports private receipt attachments through local disk in development or S3-compatible storage in production, with short-lived signed download URLs on proposal detail.
- Proposal detail pages support member comments, receipt attachment/download, revision submission for disputed/rejected proposals, and a submitted/approval/rejection/change-request/receipt/comment timeline.
- Household audit events are available through a dedicated audit page and cursor-paginated API, with actor/entity/time, before/after/metadata JSON, hash-chain status, and full-history export support for review.
- Household approval policies control share maturity: the default lets each debtor-approved share enter the ledger, all-participants approval waits until every share is approved, and payer-only approval lets the primary payer confirm shares from the proposal detail page.
- Rejection and request-changes feedback remain debtor-owned actions for a debtor's own pending share.
- Matured shares create append-only `LedgerTransaction` and `DebtObligation` rows exactly once, with repayment due events created when the proposal has a due date.
- Proposal creation and share approve/reject persist `Idempotency-Key` records, replay matching duplicate requests, and reject key reuse with changed request bodies.
- Rejected shares and pending proposals do not affect formal balances.
- Dashboard formal balances render from open `DebtObligation` rows, not proposal totals.
- Dedicated formal ledger page lists net balances, cursor-expandable open obligations and transactions, settlement actions, pending settlement confirmations, and month close/reopen controls.
- Read-only formal ledger APIs expose balances plus cursor-paginated obligations and transactions derived from `DebtObligation` and settlement allocations.
- Settlement APIs expose cursor-paginated history and let debtors submit payments against one obligation or a suggested transfer; creditor confirmation creates one or more allocations and reduces remaining balances.
- Settlement create/confirm/reject mutations persist `Idempotency-Key` records with replay/conflict behavior.
- Settlement suggestion API/page section nets open obligations by currency and returns optimized debtor-to-creditor transfers.
- Owner/admin ledger period APIs support closing/reopening months; closed periods block approval maturity, settlements, adjustments, and reversals for posting dates in that month.
- Owner/admin ledger correction APIs support manual adjustments and reversal of unallocated open obligations with append-only ledger transactions.
- Calendar/task APIs and `/[locale]/app/calendar` page expose cursor-expandable, URL-filterable event/task lists, let owners/admins/members create, edit, and delete one-off or finite recurring calendar events, switch event list/day/week/month views, create/assign/edit/delete categorized one-off or recurring tasks, switch task list/board/calendar views, auto-link due tasks to `TASK` calendar events, complete tasks with linked event status updates, create linked pending expense proposals from tasks, and configure recurring expense events that auto-generate one pending proposal when due.
- The dashboard notification center shows proposal assignments plus idempotent scheduled jobs for recurring expense proposal generation and reminders for due/overdue tasks, due/overdue repayments, and stale settlement confirmations; optional Web Push can mirror those in-app notifications through user-owned browser subscriptions, and notification/dashboard proposal lists include cursor pagination metadata plus load-more controls.
- API abuse controls rate-limit private site-gate failures, local dev-session switching, invite creation/acceptance, file upload intents, proposal comments, and share approve/reject/request-changes endpoints; unsafe browser-style API mutations with cross-site request metadata are rejected before route handlers run.
- Dashboard proposal queue and proposal detail pages are localized in `en-US` and `zh-CN`.
- OpenAPI covers the current paginated list/create/detail/revision proposal, advanced proposal split inputs, private file upload/download, proposal comments, share approve/reject/request-changes idempotency, notification list/update and browser push subscription endpoints, balance, paginated obligation and ledger transaction lists, ledger period close, paginated settlement history, settlement suggestion, ledger correction, filtered paginated calendar event create/update/delete with recurring expense templates, filtered paginated categorized task create/update/delete/complete, health, and task-to-expense proposal endpoints.

## Development

```bash
pnpm install
pnpm dev
```

Open:

- `http://localhost:3000/en-US`
- `http://localhost:3000/zh-CN`
- `http://localhost:3000/en-US/app`

## Database

Start local services:

```bash
docker compose up -d postgres redis
```

If another Redis already uses port 6379, override the host port:

```bash
REDIS_PORT=6380 docker compose up -d postgres redis
```

Run schema and seed:

```bash
pnpm db:validate
pnpm db:migrate
pnpm db:seed
```

Seed data creates the deterministic `USC 3B2B` household with Alice, Bob, Chen, Dana, default categories, and a pending grocery proposal with locked USD/CNY FX metadata.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

`pnpm e2e` starts the real Next.js dev server and runs Playwright against Chromium desktop and mobile projects.
Because Phase 1 routes read PostgreSQL, run `docker compose up -d postgres redis` before local E2E runs. Playwright runs `pnpm e2e:prepare` before starting the dev server; that command refuses production databases, resets the local dev/test/e2e database, applies migrations, and loads deterministic seed data so browser runs do not accumulate test households.
Playwright uses port `3100` by default to avoid colliding with server-level nginx or other local services, and runs one worker by default for stable database/file-flow isolation. Override with `ROOMPIRE_E2E_PORT` or `ROOMPIRE_E2E_WORKERS` only when needed.
Set `ROOMPIRE_E2E_SKIP_DB_RESET=true` only when reusing an already-prepared database/server intentionally.

## Deployment

Docker-first deployment is the current production baseline for `roompire.aialra.online`.
Use [`docs/14_deployment_runbook.md`](docs/14_deployment_runbook.md) for the self-hosted Docker/PostgreSQL/Redis deployment flow behind host nginx, backup commands, restore drill, and smoke checks.
For public/staging deployments, configure site-level Basic Auth and private file storage through deployment secrets:

- `ROOMPIRE_SITE_GATE_USERNAME`
- `ROOMPIRE_SITE_GATE_PASSWORD`
- `ROOMPIRE_SITE_GATE_SESSION_EMAIL` when the gate username is not the desired app user email
- `ROOMPIRE_FX_PROVIDER=frankfurter` for live historical FX lookup, or `cache-only` to require preloaded `FxRate` rows/manual rates
- `ROOMPIRE_FILE_STORAGE_PROVIDER=s3` plus `ROOMPIRE_S3_*` settings for R2/S3/MinIO private receipt storage
- `ROOMPIRE_RATE_LIMITS_ENABLED=true` plus optional `ROOMPIRE_RATE_LIMIT_*` limits/window overrides for invite, upload-intent, comment, and share-decision abuse controls

Leave either username or password unset to disable the gate locally. In production, a verified site-gate request maps to the app user email from `ROOMPIRE_SITE_GATE_SESSION_EMAIL`, or from the gate username when the username is already an email address. Do not commit real gate credentials; set the shared deployment credentials only in the target server, CI, or hosting platform secret store.

## Document Map

| File                                     | Purpose                                                |
| ---------------------------------------- | ------------------------------------------------------ |
| `AGENTS.md`                              | Non-negotiable agent rules and project constitution.   |
| `PROJECT_MEMORY.md`                      | Persistent repo memory for Codex/context restoration.  |
| `docs/00_context_decisions.md`           | Product context, hard decisions, constraints.          |
| `docs/01_project_plan.md`                | Milestones, phases, gates, risks.                      |
| `docs/02_prd.md`                         | Product requirements document.                         |
| `docs/03_technical_design.md`            | Architecture and system design.                        |
| `docs/04_test_plan.md`                   | Testing strategy with real-browser E2E priority.       |
| `docs/05_database_design.md`             | Data model, invariants, ledger rules.                  |
| `docs/06_api_specification.md`           | REST API design narrative.                             |
| `specs/openapi.roompire.v1.yaml`         | Initial OpenAPI contract skeleton.                     |
| `docs/07_ui_ux_spec.md`                  | UI/UX specification and design system.                 |
| `docs/08_coding_standards_tech_stack.md` | Stack, code quality, conventions.                      |
| `docs/09_agent_instructions_workflow.md` | Detailed agent workflow and GitHub process.            |
| `docs/10_backlog_milestones.md`          | Prioritized backlog and release slices.                |
| `docs/11_security_privacy_backup.md`     | Security, privacy, backup, recovery.                   |
| `docs/12_acceptance_checklist.md`        | Definition of Done and acceptance gates.               |
| `docs/14_deployment_runbook.md`          | Self-hosted Docker deployment, smoke, backup, restore. |

## Core Product Invariants

- Submitted expense is a proposal, not formal debt.
- Pending and rejected shares do not affect formal balances.
- Each debtor approves or rejects only their own share.
- Formal ledger is append-only; owner/admin corrections use reversal or adjustment.
- Closed ledger months reject formal ledger writes until owner/admin reopen the month.
- Money uses decimal arithmetic, never JavaScript floating point.
- FX default policy is `LOCK_AT_EXPENSE_DATE`.
- zh-CN and en-US ship from MVP.
- Household isolation and RBAC are mandatory for all household-scoped data.
