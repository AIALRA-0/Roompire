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
- Vitest covers decimal equal and weighted split behavior using `decimal.js`.
- Playwright E2E covers real browser desktop and mobile landing/dashboard navigation, zh-CN protected-route failure state, owner household creation, household settings update, owner invite code/link creation, non-member isolation before invite acceptance, invite code/link acceptance, member role update/removal, viewer invite denial, submitted expense proposal creation without formal ledger impact, exact/percentage/share-unit split methods, proposal comments/timeline, debtor approval maturity, duplicate approval safety, automatic repayment due events for matured obligations, formal ledger API/page visibility, settlement suggestion API/page visibility, debtor settlement submission, creditor settlement confirmation, suggested-transfer settlement submission with multi-obligation allocation, recurring calendar event/task creation, task-event recurrence links, task-generated pending expense proposals with no ledger impact, owner/admin ledger adjustment creation, obligation reversal, persisted idempotency replay/conflict checks for proposal/comment/approval/rejection/settlement/correction/task-expense mutations, and debtor rejection without ledger impact.
- Phase 1 identity/RBAC slice implemented on branch `feat/phase-1-identity-rbac`: dev session cookie, Prisma-backed session/household/member/invite APIs, household settings API, member role/removal API, RBAC helpers, database-backed dashboard, member directory page, tokenized invite page, localized identity management UI, and updated OpenAPI contract.
- Phase 2 expense proposal creation slice implemented on branch `feat/expense-proposals`: dashboard proposal form, proposal queue, proposal detail page, list/create/detail proposal APIs, expense proposal service/serializers, RBAC creator guard, locked FX metadata, audit event emission, localized en-US/zh-CN copy, and updated OpenAPI contract.
- Phase 2 approval/ledger slice implemented on branch `feat/expense-approvals-ledger`: debtor-only approve/reject share APIs, proposal detail share actions, approved-share maturity into append-only `LedgerTransaction` + `DebtObligation`, duplicate maturity guard through unique `sourceShareId`, formal balance list from open obligations, localized copy, OpenAPI updates, and real-browser E2E coverage.
- Phase 2 ledger balances slice implemented on branch `feat/ledger-balances`: read-only `/balances`, `/ledger/obligations`, and `/ledger/transactions` APIs, formal ledger service/serializers, dedicated localized ledger page, dashboard navigation to the ledger page, OpenAPI updates, and real-browser E2E/API coverage.
- Phase 2 idempotency slice implemented on branch `feat/idempotency-keys`: `IdempotencyRecord` schema/migration, persisted user/key request hashing and replayable responses, 409 conflicts for key reuse with changed endpoint/body, proposal create idempotency, share approve/reject idempotency, OpenAPI/docs updates, and real-browser E2E/API coverage.
- Phase 2 settlements slice implemented on branch `feat/settlements`: debtor settlement submission, creditor confirmation/rejection, allocation rows that reduce `DebtObligation.remainingAmount`, localized ledger-page settlement workbench, settlement APIs with persisted idempotency, OpenAPI/docs updates, and real-browser E2E/API coverage.
- Phase 2 ledger corrections slice implemented on branch `feat/ledger-corrections`: owner/admin manual adjustment API/UI, reversal API/UI for unallocated open obligations, append-only `ADJUSTMENT`/`REVERSAL` ledger transactions, persisted idempotency for correction mutations, OpenAPI/docs updates, and real-browser E2E/API coverage.
- Phase 2 settlement suggestions slice implemented on branch `feat/settlement-suggestions`: read-only settlement optimizer that nets open obligations by currency, `/settlement-suggestions` API, ledger-page suggestion section, OpenAPI/docs updates, unit tests for chained/multi-currency netting, and real-browser E2E/API coverage.
- Phase 2 calendar/task shell slice implemented on branch `feat/calendar-tasks`: localized `/[locale]/app/calendar` workspace, calendar event list/create API/UI, task list/create/assignment API/UI, due-task auto-linking to `TASK` calendar events through `EventLink`, task completion that also completes linked events, viewer read-only guard, OpenAPI/docs updates, and real-browser desktop/mobile E2E coverage.
- Phase 2 multi-obligation settlement slice implemented on branch `feat/multi-obligation-settlements`: settlement create API now accepts either legacy `debtObligationId` or suggested-transfer `payeeUserId + currency`, ledger UI exposes actionable direct suggested-transfer forms for debtors, creditor confirmation allocates one settlement across matching open obligations in oldest-first order, docs/OpenAPI/i18n updated, and real-browser desktop/mobile E2E covers two obligations settled by one confirmed transfer.
- Phase 2 recurring calendar/task slice implemented on branch `feat/recurring-calendar-rules`: event/task create APIs and UI support finite daily/weekly/monthly recurrence, recurrence rules are stored in `RecurrenceRule`, generated event/task instances are materialized immediately, generated task instances copy assignments and create linked `TASK` calendar events, recurrence-linked events use `EventLink`, docs/OpenAPI/i18n updated, and real-browser desktop/mobile E2E covers recurring events/tasks plus task completion of one generated series member.
- Phase 2 repayment deadline events slice implemented on branch `feat/repayment-deadline-events`: share approval maturity now creates a `REPAYMENT_DUE` calendar event when the proposal has `dueDate`, links that event to the created `DebtObligation` through `EventLink`, records the event ID in the maturity audit payload, docs/OpenAPI updated, and real-browser desktop/mobile E2E covers the automatic event.
- Phase 2 calendar views slice implemented on branch `feat/calendar-views`: the localized calendar workspace now lets users switch event display between list, week, and month views derived from the loaded event set, includes localized empty/day labels, keeps the existing task workflow on the same page, updates docs/backlog, and real-browser desktop/mobile E2E covers the new view tabs.
- Phase 2 task-to-expense proposal slice implemented on branch `feat/task-expense-proposals`: added `TaskExpenseProposalLink` with migration `20260704020000_add_task_expense_proposal_links`, a persisted-idempotency `POST /tasks/{taskId}/create-expense-proposal` API, task/event/proposal linking, row-level calendar UI for creating linked pending proposals from tasks, viewer and member/manager guards, docs/OpenAPI/i18n updates, and real-browser desktop/mobile E2E coverage proving task-generated proposals stay out of formal balances until approval.
- Phase 2 expense split methods slice implemented on branch `feat/expense-split-methods`: proposal creation now supports `EQUAL`, `EXACT`, `PERCENTAGE`, and `SHARES` split methods, stores debtor `percentage`/`shareUnits` basis values, treats the payer's share as implicit remainder or one share unit, exposes split method/detail serialization in API and proposal detail UI, updates docs/OpenAPI/i18n, and real-browser desktop/mobile E2E covers exact UI creation plus percentage/share-unit API creation.
- Phase 2 proposal comments/timeline slice implemented on branch `feat/proposal-comments-timeline`: added persisted-idempotency proposal comment API, viewer read-only guard for comments, audit events for comment creation, proposal detail comment form/list, submitted/approval/rejection/comment timeline, docs/OpenAPI/i18n updates, and real-browser desktop/mobile E2E coverage for UI comments plus API replay/conflict behavior.
- Phase 2 proposal receipt attachment slice implemented on branch `feat/proposal-receipts`: added private file metadata/storage tables, a local private file adapter with upload intent/byte upload/complete/download-url APIs, proposal `fileIds` attachment support, signed short-lived receipt download links on proposal detail, docs/OpenAPI/i18n updates, and real-browser desktop/mobile E2E coverage for uploading and downloading an attached receipt.
- Phase 2 proposal revision/request-changes slice implemented on branch `feat/proposal-revisions`: added debtor request-changes API/UI that moves pending shares and proposals to `DISPUTED`, creator revision/resubmit API/UI for disputed or rejected proposals without ledger obligations, version links through `supersedesProposalId`/`revisionNumber`, old-proposal cancellation, task/event link migration to the new revision, docs/OpenAPI/i18n updates, and real-browser desktop/mobile E2E coverage.
- Deployment gate slice added on branch `feat/proposal-revisions`: `ROOMPIRE_SITE_GATE_USERNAME` and `ROOMPIRE_SITE_GATE_PASSWORD` enable site-level Basic Auth for localized pages and `/api/v1` routes, default off when unset; real credentials must be configured only through deployment secrets/server env, never committed.
- Deployment foundation slice implemented on branch `feat/deployment-foundation`: production Docker Compose adds Postgres, Redis, standalone Next.js web, Caddy TLS reverse proxy, migration and demo-seed profiles, authenticated `/api/v1/health`, production environment template, backup/restore scripts, upload-volume backup script, smoke-test script, and `docs/14_deployment_runbook.md`.
- Production site-gate session slice implemented on branch `feat/production-site-gate-session`: production requests no longer trust unsigned dev-session cookies or dev-user headers; verified site-gate Basic Auth maps to the app user email from the gate username or `ROOMPIRE_SITE_GATE_SESSION_EMAIL`, auto-creating that user when needed.

## Current phase

Phase 2: expense proposals, formal ledger, and first calendar/task shell. Current scope creates submitted proposals with equal/exact/percentage/share-unit split methods, supports private receipt attachments, supports proposal comments and a basic submitted/approval/rejection/change-request/comment timeline, lets debtors decide only their own shares, lets debtors request proposal changes before ledger maturity, lets original creators revise/resubmit disputed or rejected proposals without ledger obligations, matures approved shares into append-only ledger obligations exactly once, creates repayment due calendar events for matured obligations with due dates, suggests optimized transfers by currency from open obligations, lets debtors submit settlements against one open obligation or a direct suggested-transfer pair, lets creditors confirm or reject those settlements, lets confirmed suggested transfers allocate across multiple matching open obligations, lets owners/admins create manual adjustments or reverse unallocated open obligations, persists idempotency keys for current financial mutations, exposes formal ledger/balance/settlement/suggestion/correction APIs and page, provides one-off and finite recurring calendar event/task creation plus task completion with task-event links, offers list/week/month calendar views over loaded events, lets eligible users create one linked pending expense proposal from a task, and keeps rejected/pending/disputed proposals out of formal balances. Remaining Phase 2 work should add production object storage, richer timeline/audit/file surfaces, event-to-expense creation beyond task links, and production auth/session semantics.

## Decisions log

| Date       | Decision                                                   | Rationale                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-03 | Choose custom PWA-first system                             | Existing tools do not satisfy approval-gated ledger + locked FX + calendar-linked tasks + bilingual self-hosting.                                                                                       |
| 2026-07-03 | Use proposal/ledger split                                  | Pending expenses must be auditable but must not affect debt balances.                                                                                                                                   |
| 2026-07-03 | Use expense-date FX lock by default                        | More predictable for RMB repayment and avoids repayment-date FX disputes.                                                                                                                               |
| 2026-07-03 | Use Playwright as primary E2E gate                         | User explicitly requires real webpage interaction testing.                                                                                                                                              |
| 2026-07-04 | Pin Prisma to 6.x                                          | The supplied schema uses the stable Prisma datasource URL style; Prisma 7 requires a config migration that is not needed for Phase 0.                                                                   |
| 2026-07-04 | Pin TypeScript to 5.x and ESLint to 9.x                    | Current Next.js ecosystem is stable on these major versions; TS 6 and ESLint 10 introduced avoidable bootstrap friction.                                                                                |
| 2026-07-04 | Use Postgres 18 volume mount at `/var/lib/postgresql`      | Postgres 18 Docker image expects the newer major-version-specific data layout.                                                                                                                          |
| 2026-07-04 | Use dev-session cookie for MVP auth foundation             | Keeps Phase 1 browser-testable while leaving production auth provider selection open.                                                                                                                   |
| 2026-07-04 | Obscure inaccessible household APIs with 404               | Avoids leaking household existence to non-members.                                                                                                                                                      |
| 2026-07-04 | Ship submitted proposal creation before approvals          | Gives users a real expense intake loop while preserving the proposal/ledger split until approval logic is implemented.                                                                                  |
| 2026-07-04 | Enable partial share maturity by default                   | Current MVP has no household partial-maturity flag, so each debtor-approved share can create its own formal obligation immediately.                                                                     |
| 2026-07-04 | Treat payer submission as payer confirmation               | Proposal creation creates the primary payer record; debtor approval then satisfies the current maturity gate for that share.                                                                            |
| 2026-07-04 | Persist idempotency per user and key                       | Duplicate-prone financial mutations must replay identical requests and reject key reuse with changed endpoint/body.                                                                                     |
| 2026-07-04 | Require creditor confirmation before settlement allocation | A debtor-submitted payment should be auditable immediately but should not reduce formal balances until the creditor confirms receipt.                                                                   |
| 2026-07-04 | Restrict ledger corrections to owner/admin                 | Manual adjustments and reversals are high-trust audit actions and should not be available to ordinary members or viewers.                                                                               |
| 2026-07-04 | Keep settlement suggestion API read-only                   | Suggestions guide repayment without directly mutating balances; actual balance changes still require submitted and confirmed settlements.                                                               |
| 2026-07-04 | Auto-link due tasks to calendar events                     | The first calendar/task shell should give users one operational surface immediately; task recurrence and task-to-expense proposal links can follow later.                                               |
| 2026-07-04 | Make direct suggested transfers actionable                 | A debtor can submit one settlement for a suggested debtor/payee/currency pair when matching direct open obligations exist; creditor confirmation allocates oldest-first across those obligations.       |
| 2026-07-04 | Materialize finite recurrence for MVP                      | Daily/weekly/monthly recurrences are capped at 12 instances and written as concrete event/task rows so current list APIs, linked task events, and E2E flows stay simple and auditable.                  |
| 2026-07-04 | Create repayment due events at ledger maturity             | Proposal due dates should become operational reminders only after a debt is real; pending/rejected shares still stay out of calendar repayment obligations.                                             |
| 2026-07-04 | Derive calendar views client-side from loaded events       | Week/month/list views add useful planning affordances without expanding the API surface before filtering/windowed event queries are needed.                                                             |
| 2026-07-04 | Link tasks to proposals with a dedicated table             | Task reimbursement should work even without a due-date calendar event, while linked TASK events can still point to the generated pending proposal for calendar context.                                 |
| 2026-07-04 | Treat payer share as implicit for advanced splits          | Debtor rows are the only pending approval/debt rows; exact and percentage splits keep the payer's remainder implicit, while share-unit splits give the payer one implicit unit.                         |
| 2026-07-04 | Start receipt files with a local private storage adapter   | The MVP needs browser-testable private attachments now; keeping metadata and signed download APIs stable lets production object storage replace local disk later without changing clients.              |
| 2026-07-04 | Revise proposals by superseding, not mutating              | Requested changes should preserve the old submitted proposal for audit; a new submitted revision carries `supersedesProposalId` and old task/event links move to the latest proposal.                   |
| 2026-07-04 | Use env-configured site gate for public deployments        | The requested public-site gate should protect pages and APIs without committing shared credentials; deployment secrets provide the username/password and leaving either unset disables the gate.        |
| 2026-07-04 | Use Docker Compose/Caddy as the VPS production baseline    | The current domain already points at a server, and Compose keeps Postgres, Redis, Next.js, TLS reverse proxy, migration, backup, and smoke-test flows repeatable without choosing an edge platform yet. |
| 2026-07-04 | Bridge private site gate to production app identity        | Until a full auth provider is selected, verified Basic Auth can safely identify the single private deployment user while dev-session cookies and dev-user headers stay disabled in production.          |

## Open questions for later human review

- Whether production backend should be self-hosted Docker VPS or Cloudflare Workers/OpenNext + managed Postgres.
- Whether WeChat Mini Program is Phase 2 or Phase 3.
- Whether household settlement currency defaults to CNY, USD, or per-household selection.
- Whether partial approvals should immediately create formal obligations or wait for all shares by default. Recommended default: partial maturity enabled, household-configurable.
- Production deployment needs a safe remote path: `roompire.aialra.online` currently resolves and serves nginx, but HTTPS certificate verification fails for the hostname, HTTP returns 500, and this Codex environment has no SSH key/platform CLI for publishing.

## Next recommended tasks

1. Add production object storage for private files.
2. Complete live server rollout for `roompire.aialra.online`: remote access, TLS/nginx cleanup, production env secrets including site gate credentials, and online smoke tests.
3. Decide whether fully netted suggestions without matching direct obligations should stay guidance-only or gain a separate clearing policy.
4. Add CI-friendly database reset/fixture isolation for E2E so repeated local runs do not accumulate test households.
5. Select the long-term production auth provider and replace the private site-gate bridge when multi-user public access is needed.
6. Decide owner transfer and self-removal semantics; current UI disables self mutation and owner-row mutation while server preserves last-owner guard.
7. Add event-to-expense creation beyond task-linked reimbursement proposals.

## Last session verification

- 2026-07-04 Production site-gate session:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm test` passed: 4 test files, 14 tests, including site-gate credential mapping tests.
  - `pnpm build` passed with `/api/v1/session` and `/api/v1/health` in the Next route manifest.
  - `docker build -f apps/web/Dockerfile -t roompire-web:test .` passed.
  - Production container smoke passed with temporary credentials: verified Basic Auth email auto-created and returned the app user through `/api/v1/session`.
  - Production container smoke confirmed `x-roompire-dev-user-email` is ignored when dev auth is disabled.
  - Production container smoke confirmed unauthenticated and wrong-password `/api/v1/session` requests return 401.
  - Production container page smoke confirmed authenticated `/en-US/app` returns 200.
  - `pnpm e2e` passed: 24 Playwright tests across Chromium desktop and mobile.
- 2026-07-04 Deployment foundation:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm test` passed: 3 test files, 10 tests.
  - `pnpm build` passed with `/api/v1/health` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:generate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - `docker compose --env-file .env.production.example -f docker-compose.prod.yml --profile migrate --profile seed config` passed.
  - `docker run caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile` passed for `ops/Caddyfile`.
  - Docker BuildKit was unavailable because the local Docker install lacks buildx, so legacy `docker build` was used.
  - `docker build -f apps/web/Dockerfile --target migrator -t roompire-migrator:test .` passed.
  - `docker run --rm ... roompire-migrator:test pnpm db:validate` passed.
  - `docker build -f apps/web/Dockerfile -t roompire-web:test .` passed.
  - Local dev-server smoke with temporary gate credentials passed: unauthenticated `/api/v1/health` returned 401; authenticated `/en-US`, `/api/v1/health`, and `/manifest.webmanifest` returned success.
  - Docker web-container smoke with temporary gate credentials passed against `roompire-web:test`: unauthenticated `/api/v1/health` returned 401; authenticated smoke script passed `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`.
  - `bash -n` passed for production backup/restore/smoke scripts; `shellcheck` was unavailable in this environment.
  - `scripts/backup_postgres.sh` produced a local custom-format dump against the dev Postgres container, and `postgres:18 pg_restore --list` read the dump successfully.
  - `pnpm e2e` passed: 24 Playwright tests across Chromium desktop and mobile.
  - Live-domain probe still shows server-side rollout blockers: HTTP `roompire.aialra.online` returns 500 from `213.136.74.126`, normal HTTPS fails hostname certificate verification, and HTTPS only returns 200 with certificate verification disabled.
- 2026-07-04 Phase 2 proposal revisions/request-changes + deployment gate:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm test` passed: 3 test files, 10 tests.
  - `pnpm build` passed with proposal revision/request-changes API routes and Proxy middleware in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:generate` passed.
  - `pnpm db:migrate` passed with no pending migrations after applying `20260704040000_add_proposal_revision_links`.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for the existing proposal approval/maturity flow on Chromium desktop and mobile after wrapping API GET probes with retry.
  - Targeted Playwright passed for creator revision after debtor-requested changes on Chromium desktop and mobile.
  - Site gate smoke passed with temporary local credentials: unauthenticated page/API requests returned 401, authenticated page/API requests returned 200.
  - `pnpm e2e` passed from a clean `.next`/`.turbo`/Playwright cache: 24 Playwright tests across Chromium desktop and mobile, including request-changes/revision, receipt attachment, split methods, comment/timeline, ledger, settlement, calendar/task, invite, viewer, and rejection flows.
  - Live-domain probe: `roompire.aialra.online` resolves to `213.136.74.126`; HTTP returns nginx 500, HTTPS returns content only with certificate verification disabled, and normal HTTPS fails hostname validation. SSH deployment was not possible from this environment because no usable SSH key/platform deployment CLI is configured.
- 2026-07-04 Phase 2 proposal receipt attachments:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm test` passed: 3 test files, 10 tests.
  - `pnpm db:validate` passed.
  - `pnpm db:generate` passed.
  - `pnpm db:migrate` passed with no pending migrations after applying `20260704030000_add_proposal_files`.
  - `pnpm db:seed` passed.
  - `pnpm build` passed with `/api/v1/households/[householdId]/files/presign-upload`, `/files/[fileId]/upload`, `/files/complete-upload`, `/files/[fileId]/download-url`, and `/files/[fileId]/download` in the Next route manifest and no Turbopack NFT warnings.
  - Targeted Playwright passed for uploading a proposal receipt, rendering it on proposal detail, fetching a signed download URL, and downloading matching bytes on Chromium desktop and mobile.
  - `pnpm e2e` passed from a clean `.next`/`.turbo`/Playwright cache: 22 Playwright tests across Chromium desktop and mobile, including the new receipt attachment flow plus existing proposal, split, comment/timeline, ledger, settlement, calendar/task, invite, viewer, and rejection flows.
- 2026-07-04 Phase 2 proposal comments/timeline:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm test` passed: 3 test files, 10 tests.
  - `pnpm db:validate` passed.
  - `pnpm db:generate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - `pnpm build` passed with `/api/v1/households/[householdId]/expenses/proposals/[proposalId]/comments` in the Next route manifest.
  - Targeted Playwright passed for the expense approval flow on Chromium desktop and mobile, including owner UI comment creation, proposal timeline rendering, and proposal comment API replay/conflict behavior.
  - `pnpm e2e` passed from a clean `.next` cache: 20 Playwright tests across Chromium desktop and mobile, including the new proposal comments/timeline assertions plus existing ledger, settlement, calendar/task, invite, viewer, split, and rejection flows.
- 2026-07-04 Phase 2 expense split methods:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm test` passed: 3 test files, 10 tests, including weighted split rounding and zero-weight rejection.
  - `pnpm db:validate` passed.
  - `pnpm db:generate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - `pnpm build` passed with the expense proposal create/detail API/page routes in the Next route manifest.
  - Targeted Playwright passed for the expense approval flow on Chromium desktop and mobile, including exact split UI preview/submission plus percentage/share-unit API proposal creation.
  - `pnpm e2e` passed from a clean `.next` cache: 20 Playwright tests across Chromium desktop and mobile, including the advanced split assertions and all existing ledger, settlement, calendar/task, invite, viewer, and rejection flows.
- 2026-07-04 Phase 2 task-to-expense proposal links:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 3 test files, 7 tests.
  - `pnpm build` passed with `/api/v1/households/[householdId]/tasks/[taskId]/create-expense-proposal` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:generate` passed.
  - `pnpm db:migrate` applied `20260704020000_add_task_expense_proposal_links`.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for calendar/task work on Chromium desktop and mobile, including creating a linked pending proposal from a completed assigned task.
  - `pnpm e2e` passed from a clean `.next` cache: 20 Playwright tests across Chromium desktop and mobile, including task-generated pending proposal creation, task/event/proposal links, idempotency replay/conflict, viewer denial, and no formal balance impact before debtor approval.
- 2026-07-04 Phase 2 calendar views:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 3 test files, 7 tests.
  - `pnpm build` passed with `/[locale]/app/calendar`, `/api/v1/households/[householdId]/calendar/events`, and `/api/v1/households/[householdId]/tasks` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for calendar work on Chromium desktop and mobile, including switching recurring events through month/week/list views.
  - `pnpm e2e` passed from a clean `.next` cache: 20 Playwright tests across Chromium desktop and mobile, including the new calendar event list/week/month view assertions.
- 2026-07-04 Phase 2 repayment deadline events:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 3 test files, 7 tests.
  - `pnpm build` passed with expense approval and calendar event routes in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for approval maturity creating a linked `REPAYMENT_DUE` event on Chromium desktop and mobile.
  - `pnpm e2e` passed from a clean `.next` cache: 20 Playwright tests across Chromium desktop and mobile, including approval maturity creating a `REPAYMENT_DUE` calendar event linked to the generated `DebtObligation`.
- 2026-07-04 Phase 2 recurring calendar/task rules:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 3 test files, 7 tests.
  - `pnpm build` passed with `/[locale]/app/calendar`, `/api/v1/households/[householdId]/calendar/events`, `/api/v1/households/[householdId]/tasks`, and `/tasks/[taskId]/complete` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for recurring calendar/task creation and existing approval refresh stability on Chromium desktop and mobile.
  - `pnpm e2e` passed from a clean `.next` cache: 20 Playwright tests across Chromium desktop and mobile, including weekly recurring calendar events, weekly recurring tasks with copied assignments, linked `TASK` events for each generated task, recurrence-rule event links, and completing one task instance without completing the next recurrence.
- 2026-07-04 Phase 2 multi-obligation settlements:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 3 test files, 7 tests.
  - `pnpm build` passed with settlement routes and `/[locale]/app/ledger` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for suggested-transfer multi-obligation settlement on Chromium desktop and mobile.
  - `pnpm e2e` passed from a clean `.next` cache: 20 Playwright tests across Chromium desktop and mobile, including one suggested transfer settling two direct obligations through two settlement allocation rows.
- 2026-07-04 Phase 2 calendar/task shell:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 3 test files, 7 tests.
  - `pnpm build` passed with `/[locale]/app/calendar`, `/api/v1/households/[householdId]/calendar/events`, `/api/v1/households/[householdId]/tasks`, and `/tasks/[taskId]/complete` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for calendar/task desktop and mobile flows.
  - `pnpm e2e` passed from a clean `.next` cache: 18 Playwright tests across Chromium desktop and mobile, including calendar event creation, task assignment, linked `TASK` calendar event creation, assigned-member task completion, linked event completion, and viewer read-only calendar/task guards.
- 2026-07-04 Phase 2 settlement suggestions:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 3 test files, 7 tests, including settlement suggestion netting.
  - `pnpm build` passed with `/api/v1/households/[householdId]/settlement-suggestions` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for the expanded approval/settlement/correction/suggestion flow on Chromium desktop.
  - `pnpm e2e` passed from a clean `.next` cache: 16 Playwright tests across Chromium desktop and mobile, including settlement suggestion API/page assertions before settlement, after confirmed settlement, and after adjustment creation.
- 2026-07-04 Phase 2 ledger corrections:
  - `pnpm format:check` passed.
  - `pnpm lint` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 2 test files, 5 tests.
  - `pnpm build` passed with `/api/v1/households/[householdId]/ledger/adjustments` and `/ledger/obligations/[obligationId]/reverse` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - Targeted Playwright passed for the expanded approval/settlement/correction flow on Chromium desktop.
  - `pnpm e2e` passed from a clean `.next` cache: 16 Playwright tests across Chromium desktop and mobile, including owner/admin adjustment creation, obligation reversal, confirmed settlement balance reduction, and correction idempotency replay/conflict assertions.
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
