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
- Debtors can approve or reject only their own pending shares from the proposal detail page.
- Approved shares mature into append-only `LedgerTransaction` and `DebtObligation` rows exactly once.
- Proposal creation and share approve/reject persist `Idempotency-Key` records, replay matching duplicate requests, and reject key reuse with changed request bodies.
- Rejected shares and pending proposals do not affect formal balances.
- Dashboard formal balances render from open `DebtObligation` rows, not proposal totals.
- Dedicated formal ledger page lists net balances, open obligations, and append-only ledger transactions.
- Read-only formal ledger APIs expose balances, obligations, and transactions derived from `DebtObligation` and settlement allocations.
- Dashboard proposal queue and proposal detail pages are localized in `en-US` and `zh-CN`.
- OpenAPI covers the current list/create/detail proposal, share approve/reject idempotency, balance, obligation, and ledger transaction endpoints.

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

## Core Product Invariants

- Submitted expense is a proposal, not formal debt.
- Pending and rejected shares do not affect formal balances.
- Each debtor approves or rejects only their own share.
- Formal ledger is append-only; corrections use reversal or adjustment.
- Money uses decimal arithmetic, never JavaScript floating point.
- FX default policy is `LOCK_AT_EXPENSE_DATE`.
- zh-CN and en-US ship from MVP.
- Household isolation and RBAC are mandatory for all household-scoped data.
