# PROJECT_MEMORY.md — Persistent Project Memory

Codex and future agents must update this file after every meaningful session. Keep it concise but complete enough that a new session can recover context without asking the human to repeat decisions.

## Project

- Name: Roompire
- Repo: https://github.com/AIALRA-0/Roompire.git
- Domain: roompire.aialra.online
- Current strategy: self-developed PWA-first shared-house ledger + calendar/task system.

## Immutable decisions

- Do not fork a Splitwise/Flatastic clone as the final product.
- Expense submissions are proposals; only approved shares become official ledger obligations.
- Default FX policy is expense-date lock to household settlement currency.
- Formal ledger is append-only.
- UI style: Notion / Linear / Vercel / shadcn-ui.
- Real browser E2E tests are required for user-facing completion.
- zh-CN and en-US are mandatory from MVP.
- Use mature libraries and MCP/skills whenever they improve reliability.

## Current implementation status

- Phase 0 bootstrap implemented on branch `feat/phase-0-bootstrap`.
- Repository now contains a pnpm/Turborepo monorepo with `apps/web` Next.js App Router app.
- Web app includes Tailwind CSS, shadcn/ui-style `Button`/`Badge` primitives, lucide icons, PWA manifest/icon, localized landing page, localized dashboard shell, and protected/forbidden state page.
- i18n implemented with next-intl for `en-US` and `zh-CN` locale routes.
- Prisma/PostgreSQL schema validated and initial SQL migration generated under `db/migrations/20260704000000_init`.
- Docker Compose defines Postgres 18 and Redis 8 with overrideable host ports.
- Deterministic seed script creates `USC 3B2B`, Alice/Bob/Chen/Dana, 11 categories, one submitted grocery proposal, two pending shares, and one audit event.
- Vitest covers decimal equal split behavior using `decimal.js`.
- Playwright E2E covers real browser desktop and mobile landing/dashboard navigation, zh-CN protected-route failure state, owner household creation, household settings update, owner invite code/link creation, non-member isolation before invite acceptance, invite code/link acceptance, member role update/removal, viewer invite denial, submitted expense proposal creation without formal ledger impact, debtor approval maturity, duplicate approval safety, formal ledger API/page visibility, debtor settlement submission, creditor settlement confirmation, persisted idempotency replay/conflict checks for proposal/approval/rejection/settlement mutations, and debtor rejection without ledger impact.
- Phase 1 identity/RBAC slice implemented on branch `feat/phase-1-identity-rbac`: dev session cookie, Prisma-backed session/household/member/invite APIs, household settings API, member role/removal API, RBAC helpers, database-backed dashboard, member directory page, tokenized invite page, localized identity management UI, and updated OpenAPI contract.
- Phase 2 expense proposal creation slice implemented on branch `feat/expense-proposals`: dashboard proposal form, proposal queue, proposal detail page, list/create/detail proposal APIs, expense proposal service/serializers, RBAC creator guard, locked FX metadata, audit event emission, localized en-US/zh-CN copy, and updated OpenAPI contract.
- Phase 2 approval/ledger slice implemented on branch `feat/expense-approvals-ledger`: debtor-only approve/reject share APIs, proposal detail share actions, approved-share maturity into append-only `LedgerTransaction` + `DebtObligation`, duplicate maturity guard through unique `sourceShareId`, formal balance list from open obligations, localized copy, OpenAPI updates, and real-browser E2E coverage.
- Phase 2 ledger balances slice implemented on branch `feat/ledger-balances`: read-only `/balances`, `/ledger/obligations`, and `/ledger/transactions` APIs, formal ledger service/serializers, dedicated localized ledger page, dashboard navigation to the ledger page, OpenAPI updates, and real-browser E2E/API coverage.
- Phase 2 idempotency slice implemented on branch `feat/idempotency-keys`: `IdempotencyRecord` schema/migration, persisted user/key request hashing and replayable responses, 409 conflicts for key reuse with changed endpoint/body, proposal create idempotency, share approve/reject idempotency, OpenAPI/docs updates, and real-browser E2E/API coverage.
- Phase 2 settlements slice implemented on branch `feat/settlements`: debtor settlement submission, creditor confirmation/rejection, allocation rows that reduce `DebtObligation.remainingAmount`, localized ledger-page settlement workbench, settlement APIs with persisted idempotency, OpenAPI/docs updates, and real-browser E2E/API coverage.

## Current phase

Phase 2: expense proposals and formal ledger. Proposal creation plus debtor approval/rejection are implemented and verified locally. Current scope creates submitted proposals, lets debtors decide only their own shares, matures approved shares into append-only ledger obligations exactly once, lets debtors submit settlements against open obligations, lets creditors confirm or reject those settlements, persists idempotency keys for current financial mutations, exposes formal ledger/balance/settlement APIs and page, and keeps rejected/pending proposals out of formal balances. Remaining Phase 2 work should add reversal/adjustment flows, settlement suggestions, broader split methods, and production auth/session semantics.

## Decisions log

| Date       | Decision                                                   | Rationale                                                                                                                             |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-03 | Choose custom PWA-first system                             | Existing tools do not satisfy approval-gated ledger + locked FX + calendar-linked tasks + bilingual self-hosting.                     |
| 2026-07-03 | Use proposal/ledger split                                  | Pending expenses must be auditable but must not affect debt balances.                                                                 |
| 2026-07-03 | Use expense-date FX lock by default                        | More predictable for RMB repayment and avoids repayment-date FX disputes.                                                             |
| 2026-07-03 | Use Playwright as primary E2E gate                         | User explicitly requires real webpage interaction testing.                                                                            |
| 2026-07-04 | Pin Prisma to 6.x                                          | The supplied schema uses the stable Prisma datasource URL style; Prisma 7 requires a config migration that is not needed for Phase 0. |
| 2026-07-04 | Pin TypeScript to 5.x and ESLint to 9.x                    | Current Next.js ecosystem is stable on these major versions; TS 6 and ESLint 10 introduced avoidable bootstrap friction.              |
| 2026-07-04 | Use Postgres 18 volume mount at `/var/lib/postgresql`      | Postgres 18 Docker image expects the newer major-version-specific data layout.                                                        |
| 2026-07-04 | Use dev-session cookie for MVP auth foundation             | Keeps Phase 1 browser-testable while leaving production auth provider selection open.                                                 |
| 2026-07-04 | Obscure inaccessible household APIs with 404               | Avoids leaking household existence to non-members.                                                                                    |
| 2026-07-04 | Ship submitted proposal creation before approvals          | Gives users a real expense intake loop while preserving the proposal/ledger split until approval logic is implemented.                |
| 2026-07-04 | Enable partial share maturity by default                   | Current MVP has no household partial-maturity flag, so each debtor-approved share can create its own formal obligation immediately.   |
| 2026-07-04 | Treat payer submission as payer confirmation               | Proposal creation creates the primary payer record; debtor approval then satisfies the current maturity gate for that share.          |
| 2026-07-04 | Persist idempotency per user and key                       | Duplicate-prone financial mutations must replay identical requests and reject key reuse with changed endpoint/body.                   |
| 2026-07-04 | Require creditor confirmation before settlement allocation | A debtor-submitted payment should be auditable immediately but should not reduce formal balances until the creditor confirms receipt. |

## Open questions for later human review

- Whether production backend should be self-hosted Docker VPS or Cloudflare Workers/OpenNext + managed Postgres.
- Whether WeChat Mini Program is Phase 2 or Phase 3.
- Whether household settlement currency defaults to CNY, USD, or per-household selection.
- Whether partial approvals should immediately create formal obligations or wait for all shares by default. Recommended default: partial maturity enabled, household-configurable.

## Next recommended tasks

1. Implement reversal/adjustment flows for append-only corrections.
2. Add settlement suggestions and optional multi-obligation settlement allocation policy.
3. Extend persisted idempotency to reversal/adjustment mutations as those endpoints are added.
4. Add CI-friendly database reset/fixture isolation for E2E so repeated local runs do not accumulate test households.
5. Add production-ready auth provider decision and session persistence plan; dev auth must remain disabled by default in production.
6. Decide owner transfer and self-removal semantics; current UI disables self mutation and owner-row mutation while server preserves last-owner guard.
7. Add exact, percentage, and share-unit split methods plus receipt upload/revision/comment flows.

## Last session verification

- 2026-07-04 Phase 2 settlements:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 2 test files, 5 tests.
  - `pnpm build` passed with `/api/v1/households/[householdId]/settlements`, `/settlements/[settlementId]/confirm`, and `/settlements/[settlementId]/reject` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - `pnpm e2e` passed from a clean `.next` cache: 16 Playwright tests across Chromium desktop and mobile, including debtor settlement submission, creditor confirmation, confirmed settlement balance reduction, and settlement create/confirm idempotency replay/conflict assertions.
- 2026-07-04 Phase 2 persisted idempotency:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 2 test files, 5 tests.
  - `pnpm build` passed with current financial mutation routes in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with the new `20260704010000_add_idempotency_records` migration applied locally and no pending migrations afterward.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for approval/rejection flows across Chromium desktop/mobile, including proposal create replay/conflict, share approval replay/conflict, and share rejection replay/conflict assertions.
  - `pnpm e2e` passed from a clean `.next` cache: 16 Playwright tests across Chromium desktop and mobile.
- 2026-07-04 Phase 2 ledger balances:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 2 test files, 5 tests.
  - `pnpm build` passed with `/[locale]/app/ledger`, `/api/v1/households/[householdId]/balances`, `/ledger/obligations`, and `/ledger/transactions` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for invite isolation plus expense approval/rejection desktop regressions.
  - `pnpm e2e` passed from a clean `.next` cache: 16 Playwright tests across Chromium desktop and mobile, including formal ledger page visibility and balance/obligation/transaction API checks after share maturity.
  - E2E config now uses 2 workers and a 75s per-test timeout to avoid local Next dev server/database contention during ledger-heavy browser flows.
- 2026-07-04 Phase 2 approval and ledger maturity:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 2 test files, 5 tests.
  - `pnpm build` passed with share approve/reject API routes in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for approval maturity and rejection paths across Chromium desktop/mobile.
  - `pnpm e2e` passed from a clean `.next` cache: 16 Playwright tests across Chromium desktop and mobile, including debtor-only approval, duplicate approval safety, ledger maturity, and rejection without ledger impact.
  - Local note still applies: if dynamic App Router API child routes return 404 after branch/cache churn, remove generated `apps/web/.next` and rerun; clean-cache E2E passes.
- 2026-07-04 Phase 2 expense proposal creation:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 2 test files, 5 tests.
  - `pnpm build` passed with the new expense proposal API and detail routes.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - `pnpm e2e` passed from a clean `.next` cache: 14 Playwright tests across Chromium desktop and mobile, including owner proposal creation and viewer creation denial.
  - Local note: if dynamic App Router API child routes return 404 after branch/cache churn, remove generated `apps/web/.next` and rerun; clean-cache E2E passes.
- 2026-07-04 Phase 1 continuation:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 2 test files, 5 tests.
  - `pnpm build` passed with the new API/page routes.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - `pnpm e2e` passed: 12 Playwright tests across Chromium desktop and mobile, including household settings, tokenized invite links, member role update/removal, invite isolation, and viewer RBAC denial.
- 2026-07-04 Phase 0 bootstrap:
- `pnpm install` passed with pnpm 11 build-script approvals recorded in `pnpm-workspace.yaml`.
- `pnpm format:check` passed.
- `pnpm db:validate` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed: 1 test file, 3 tests.
- `pnpm build` passed with Next.js 16.2.10.
- `pnpm e2e` passed: 4 Playwright tests across Chromium desktop and mobile.
- `REDIS_PORT=6380 docker compose up -d postgres redis` started local services successfully on this machine, avoiding an existing Redis on host port 6379.
- `pnpm db:migrate` applied `20260704000000_init`.
- `pnpm db:seed` passed twice, confirming idempotency.
- Database verification query returned 4 users, 1 household, 11 categories, 1 proposal, 2 shares, and 1 audit event.
