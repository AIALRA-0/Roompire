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
- PWA manifest and icon.
- Prisma/PostgreSQL schema, initial migration, deterministic seed data.
- Docker Compose for Postgres and Redis.
- Vitest money split unit tests.
- Playwright desktop and mobile real-browser smoke tests.
- GitHub Actions CI/E2E workflow templates.

Phase 1 identity/RBAC slice is implemented:

- Dev-session auth for local MVP testing through the `roompire_session` cookie.
- Prisma-backed current session, household list, household creation, household settings update, member list, member role update/removal, invite creation, and invite acceptance APIs.
- Server-side membership and role checks for every implemented household-scoped route.
- Dashboard now loads seeded household/user/member data from PostgreSQL instead of static fixtures.
- Browser UI can switch dev users, create households, edit household settings, create invite codes/links, accept invite codes or tokenized links, open member directory pages, update member roles, and remove members.
- Viewer invite attempts are rejected by the API and verified in browser.
- Non-members cannot view member directory pages before accepting an invite.
- OpenAPI covers the current Phase 1 household, member, invite, and settings endpoints.

Phase 2 expense proposal approval/ledger slice is implemented:

- Owners, admins, and members can create submitted expense proposals from the dashboard.
- Proposal creation records the proposal, primary payer, pending debtor shares, locked FX metadata, and an audit event.
- Dashboard proposal creation supports equal, exact-amount, percentage, and share-unit splits with a live split preview; proposal detail pages show the chosen method and stored split basis.
- Proposal creation supports private receipt attachments through local disk in development or S3-compatible storage in production, with short-lived signed download URLs on proposal detail.
- Proposal detail pages support member comments, revision submission for disputed/rejected proposals, and a submitted/approval/rejection/change-request/comment timeline.
- Debtors can approve, reject, or request changes only for their own pending shares from the proposal detail page.
- Approved shares mature into append-only `LedgerTransaction` and `DebtObligation` rows exactly once, with repayment due events created when the proposal has a due date.
- Proposal creation and share approve/reject persist `Idempotency-Key` records, replay matching duplicate requests, and reject key reuse with changed request bodies.
- Rejected shares and pending proposals do not affect formal balances.
- Dashboard formal balances render from open `DebtObligation` rows, not proposal totals.
- Dedicated formal ledger page lists net balances, open obligations, settlement actions, pending settlement confirmations, and append-only ledger transactions.
- Read-only formal ledger APIs expose balances, obligations, and transactions derived from `DebtObligation` and settlement allocations.
- Settlement APIs let debtors submit payments against one obligation or a suggested transfer; creditor confirmation creates one or more allocations and reduces remaining balances.
- Settlement create/confirm/reject mutations persist `Idempotency-Key` records with replay/conflict behavior.
- Settlement suggestion API/page section nets open obligations by currency and returns optimized debtor-to-creditor transfers.
- Owner/admin ledger correction APIs support manual adjustments and reversal of unallocated open obligations with append-only ledger transactions.
- Calendar/task APIs and `/[locale]/app/calendar` page let owners/admins/members create one-off or finite recurring calendar events, switch event list/week/month views, create/assign one-off or recurring tasks, auto-link due tasks to `TASK` calendar events, complete tasks with linked event status updates, and create linked pending expense proposals from tasks.
- Dashboard proposal queue and proposal detail pages are localized in `en-US` and `zh-CN`.
- OpenAPI covers the current list/create/detail/revision proposal, advanced proposal split inputs, private file upload/download, proposal comments, share approve/reject/request-changes idempotency, balance, obligation, ledger transaction, settlement, settlement suggestion, ledger correction, calendar event, task, and task-to-expense proposal endpoints.

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
Because Phase 1 routes read PostgreSQL, run `docker compose up -d postgres redis`, `pnpm db:migrate`, and `pnpm db:seed` before local E2E runs.
Playwright uses port `3100` by default to avoid colliding with server-level nginx or other local services, and runs one worker by default for stable database/file-flow isolation. Override with `ROOMPIRE_E2E_PORT` or `ROOMPIRE_E2E_WORKERS` only when needed.

## Deployment

Docker-first deployment is the current production baseline for `roompire.aialra.online`.
Use [`docs/14_deployment_runbook.md`](docs/14_deployment_runbook.md) for the VPS/Caddy/PostgreSQL/Redis deployment flow, backup commands, restore drill, and smoke checks.
For public/staging deployments, configure site-level Basic Auth and private file storage through deployment secrets:

- `ROOMPIRE_SITE_GATE_USERNAME`
- `ROOMPIRE_SITE_GATE_PASSWORD`
- `ROOMPIRE_SITE_GATE_SESSION_EMAIL` when the gate username is not the desired app user email
- `ROOMPIRE_FILE_STORAGE_PROVIDER=s3` plus `ROOMPIRE_S3_*` settings for R2/S3/MinIO private receipt storage

Leave either username or password unset to disable the gate locally. In production, a verified site-gate request maps to the app user email from `ROOMPIRE_SITE_GATE_SESSION_EMAIL`, or from the gate username when the username is already an email address. Do not commit real gate credentials; set the shared deployment credentials only in the target server, CI, or hosting platform secret store.

## Document Map

| File                                     | Purpose                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| `AGENTS.md`                              | Non-negotiable agent rules and project constitution.  |
| `PROJECT_MEMORY.md`                      | Persistent repo memory for Codex/context restoration. |
| `docs/00_context_decisions.md`           | Product context, hard decisions, constraints.         |
| `docs/01_project_plan.md`                | Milestones, phases, gates, risks.                     |
| `docs/02_prd.md`                         | Product requirements document.                        |
| `docs/03_technical_design.md`            | Architecture and system design.                       |
| `docs/04_test_plan.md`                   | Testing strategy with real-browser E2E priority.      |
| `docs/05_database_design.md`             | Data model, invariants, ledger rules.                 |
| `docs/06_api_specification.md`           | REST API design narrative.                            |
| `specs/openapi.roompire.v1.yaml`         | Initial OpenAPI contract skeleton.                    |
| `docs/07_ui_ux_spec.md`                  | UI/UX specification and design system.                |
| `docs/08_coding_standards_tech_stack.md` | Stack, code quality, conventions.                     |
| `docs/09_agent_instructions_workflow.md` | Detailed agent workflow and GitHub process.           |
| `docs/10_backlog_milestones.md`          | Prioritized backlog and release slices.               |
| `docs/11_security_privacy_backup.md`     | Security, privacy, backup, recovery.                  |
| `docs/12_acceptance_checklist.md`        | Definition of Done and acceptance gates.              |
| `docs/14_deployment_runbook.md`          | Docker/VPS deployment, smoke, backup, restore.        |

## Core Product Invariants

- Submitted expense is a proposal, not formal debt.
- Pending and rejected shares do not affect formal balances.
- Each debtor approves or rejects only their own share.
- Formal ledger is append-only; owner/admin corrections use reversal or adjustment.
- Money uses decimal arithmetic, never JavaScript floating point.
- FX default policy is `LOCK_AT_EXPENSE_DATE`.
- zh-CN and en-US ship from MVP.
- Household isolation and RBAC are mandatory for all household-scoped data.
