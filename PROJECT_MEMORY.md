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
- Playwright E2E covers real browser desktop and mobile landing/dashboard navigation, zh-CN protected-route failure state, owner household creation, household settings update, owner invite code/link creation, non-member isolation before invite acceptance, invite code/link acceptance, member role update/removal, viewer invite denial, submitted expense proposal creation without formal ledger impact, exact/percentage/share-unit split methods, proposal comments/timeline, debtor approval maturity, duplicate approval safety, automatic repayment due events for matured obligations, formal ledger API/page visibility, settlement suggestion API/page visibility/actionability, debtor settlement submission, creditor settlement confirmation, suggested-transfer settlement submission with multi-obligation allocation, recurring calendar event/task creation, task-event recurrence links, task-generated pending expense proposals with no ledger impact, event-generated pending expense proposals with no ledger impact, owner/admin ledger adjustment creation, obligation reversal, persisted idempotency replay/conflict checks for proposal/comment/approval/rejection/settlement/correction/task-expense/event-expense mutations, cross-site browser mutation rejection by the CSRF origin guard, and debtor rejection without ledger impact.
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
- Calendar day view slice implemented on branch `feat/calendar-day-view`: the localized calendar workspace now includes an event day view alongside list/week/month, with date heading, ordered same-day events, event time/all-day text, type/status badges, and desktop/mobile E2E plus live-domain validation.
- Phase 2 task-to-expense proposal slice implemented on branch `feat/task-expense-proposals`: added `TaskExpenseProposalLink` with migration `20260704020000_add_task_expense_proposal_links`, a persisted-idempotency `POST /tasks/{taskId}/create-expense-proposal` API, task/event/proposal linking, row-level calendar UI for creating linked pending proposals from tasks, viewer and member/manager guards, docs/OpenAPI/i18n updates, and real-browser desktop/mobile E2E coverage proving task-generated proposals stay out of formal balances until approval.
- Phase 2 expense split methods slice implemented on branch `feat/expense-split-methods`: proposal creation now supports `EQUAL`, `EXACT`, `PERCENTAGE`, and `SHARES` split methods, stores debtor `percentage`/`shareUnits` basis values, treats the payer's share as implicit remainder or one share unit, exposes split method/detail serialization in API and proposal detail UI, updates docs/OpenAPI/i18n, and real-browser desktop/mobile E2E covers exact UI creation plus percentage/share-unit API creation.
- Phase 2 proposal comments/timeline slice implemented on branch `feat/proposal-comments-timeline`: added persisted-idempotency proposal comment API, viewer read-only guard for comments, audit events for comment creation, proposal detail comment form/list, submitted/approval/rejection/comment timeline, docs/OpenAPI/i18n updates, and real-browser desktop/mobile E2E coverage for UI comments plus API replay/conflict behavior.
- Phase 2 proposal receipt attachment slice implemented on branch `feat/proposal-receipts`: added private file metadata/storage tables, a local private file adapter with upload intent/byte upload/complete/download-url APIs, proposal `fileIds` attachment support, signed short-lived receipt download links on proposal detail, docs/OpenAPI/i18n updates, and real-browser desktop/mobile E2E coverage for uploading and downloading an attached receipt.
- Proposal receipt timeline upload slice implemented on branch `feat/proposal-receipt-timeline`: submitted proposal detail pages now let eligible members attach additional receipt files after submission, record receipt attachments in the proposal timeline, preserve signed receipt downloads, and cover the flow with desktop/mobile E2E plus live-domain validation.
- API abuse rate limiting slice implemented on branch `feat/api-rate-limits`: failed private site-gate Basic Auth attempts now rate-limit per client, high-risk API mutations enforce fixed-window 429 responses with standard rate-limit headers, env templates expose limit/window overrides, OpenAPI/docs are updated, and unit/E2E/live-domain validation cover limiter behavior.
- CSRF origin guard slice implemented on branch `feat/csrf-origin-guard`: the Next proxy rejects unsafe `/api/v1` browser-style mutations with cross-site `Sec-Fetch-Site`, mismatched `Origin`, mismatched `Referer`, or opaque `Origin: null`, while same-origin browser requests and no-origin operational clients still reach route handlers.
- Phase 2 proposal revision/request-changes slice implemented on branch `feat/proposal-revisions`: added debtor request-changes API/UI that moves pending shares and proposals to `DISPUTED`, creator revision/resubmit API/UI for disputed or rejected proposals without ledger obligations, version links through `supersedesProposalId`/`revisionNumber`, old-proposal cancellation, task/event link migration to the new revision, docs/OpenAPI/i18n updates, and real-browser desktop/mobile E2E coverage.
- Deployment gate slice added on branch `feat/proposal-revisions`: `ROOMPIRE_SITE_GATE_USERNAME` and `ROOMPIRE_SITE_GATE_PASSWORD` enable site-level Basic Auth for localized pages and `/api/v1` routes, default off when unset; real credentials must be configured only through deployment secrets/server env, never committed.
- Deployment foundation slice implemented on branch `feat/deployment-foundation`: production Docker Compose adds Postgres, Redis, standalone Next.js web, Caddy TLS reverse proxy, migration and demo-seed profiles, authenticated `/api/v1/health`, production environment template, backup/restore scripts, upload-volume backup script, smoke-test script, and `docs/14_deployment_runbook.md`.
- Production site-gate session slice implemented on branch `feat/production-site-gate-session`: production requests no longer trust unsigned dev-session cookies or dev-user headers; verified site-gate Basic Auth maps to the app user email from the gate username or `ROOMPIRE_SITE_GATE_SESSION_EMAIL`, auto-creating that user when needed.
- Production object storage slice implemented on branch `feat/object-storage-adapter`: private receipt storage now resolves either local disk or S3-compatible storage (Cloudflare R2, AWS S3, MinIO) from environment, records the provider/bucket/object key behind the existing file API, validates storage config in `/api/v1/health`, and keeps upload/download client contracts stable.
- FX lock/cache slice implemented on branch `feat/fx-rate-locks`: cross-currency proposal creation, revision, and task-to-expense creation can omit a manual `fxRate`; the server first uses cached `FxRate` rows, then the configured Frankfurter provider, and still accepts explicit manual rates as fallback while copying rate, rate date, provider, and lock timestamp into the proposal.
- Household manual FX policy slice implemented on branch `feat/household-fx-policy`: household settings now expose only implemented FX policies, `MANUAL_RATE_WITH_APPROVAL` requires an explicit manual `fxRate` for every cross-currency proposal/revision/task-expense/event-expense path, and unsupported original-currency debt / FX-difference policies stay in the backlog until their ledger semantics are designed.
- Household audit log slice implemented on branch `feat/audit-log`: active household members can read the latest audit events through `GET /api/v1/households/{householdId}/audit-events` and the localized `/[locale]/app/audit` page, with dashboard/mobile entry, actor/entity/time display, and before/after/metadata JSON review.
- Household statistics slice implemented on branch `feat/household-statistics`: active household members can read `stats/summary`, `stats/categories`, and `stats/members` API responses and use the localized `/[locale]/app/stats` page to review proposal volume, currency totals, open balances, task counts, audit/receipt evidence, category totals, and member activity.
- Household export slice implemented on branch `feat/household-exports`: active household members can create signed short-lived CSV/JSON downloads for expense proposals, ledger obligations, settlements, audit events, and members through the `/exports` API and localized statistics page export panel; export creation emits an audit event and production requires `ROOMPIRE_EXPORT_SIGNING_SECRET`.
- Audit filter slice implemented on branch `feat/audit-filters`: active household members can filter `GET /api/v1/households/{householdId}/audit-events` and the localized audit page by action, actor, entity type, entity ID, date window, and limit.
- Event-to-expense proposal slice implemented on branch `feat/event-expense-proposals`: bill, chore, group activity, and recurring-expense calendar events can create one linked pending expense proposal through a persisted-idempotency API and row-level calendar UI; event links point back to the proposal, proposal audit metadata records the source event, and pending event-generated proposals stay out of formal balances until approval.
- Statistics date-window slice implemented on branch `feat/stat-date-filters`: `stats/summary`, `stats/categories`, and `stats/members` accept `from`/`to` filters, the summary response includes the active window plus daily non-cancelled proposal trend rows, and the localized stats page exposes a date filter form and trend view backed by the same services.
- Live deployment active on the self-hosted server: host nginx terminates TLS for `roompire.aialra.online` and proxies to the production Compose web service on `127.0.0.1:18300`; Postgres, Redis, migrations, web health checks, and the private site gate are managed from the local server without SSH to a separate VPS.
- Audit hash-chain slice implemented on branch `feat/audit-hash-chain`: PostgreSQL migration `20260704050000_add_audit_hash_chain` enables `pgcrypto`, backfills existing `AuditEvent` rows, installs a per-household advisory-locked insert trigger that writes `prevHash`/`eventHash`, and the audit API/page expose hash-chain verification status and event hashes.
- Backup/restore drill slice implemented on branch `ops/backup-restore-drill`: `backup_all.sh` creates PostgreSQL and upload-volume backups, `verify_postgres_backup.sh` restores dumps into a temporary database and verifies Prisma migrations plus audit hash-chain integrity, production backups are written under `/srv/aialra/backups/roompire`, and `roompire-backup.timer` is enabled on the server for daily runs.
- E2E database isolation slice implemented on branch `test/e2e-db-isolation`: `pnpm e2e:prepare` safely refuses production database names, resets only local Roompire dev/test/e2e databases, reapplies migrations, seeds deterministic fixtures, clears stale Next dev route manifests, and Playwright runs this setup before starting the dev server so repeated browser runs do not accumulate test households.
- Settlement suggestion actionability slice implemented on branch `feat/netted-settlement-policy`: settlement suggestions now include direct obligation count/remaining amount plus `DIRECTLY_SETTLEABLE` or `GUIDANCE_ONLY`; ledger UI labels both states, direct suggestions remain debtor-submit-able, and fully netted suggestions without direct obligations stay read-only guidance until a household clearing policy exists.
- Household clearing policy slice implemented on branch `feat/household-clearing-policy`: households now have `DIRECT_ONLY`/`HOUSEHOLD_NETTING` policy, owner/admin settings UI and APIs expose it, non-direct optimized transfers become `CLEARING_SETTLEABLE` only when household netting is enabled, and confirmed clearing settlements allocate one payment across payer outgoing plus payee incoming obligations with audited allocation rows.
- User profile and notification preferences slice implemented on branch `feat/profile-notification-settings`: authenticated users can update display name, preferred locale, and in-app/email/proposal/settlement/task reminder preferences through `/api/v1/users/me` and the dashboard profile settings UI; `/api/v1/session` now returns the same preference summary.
- In-app notification center slice implemented on branch `feat/in-app-notification-center`: creating an expense proposal writes `EXPENSE_PROPOSAL_ASSIGNED` notifications for debtor shares inside the proposal transaction, `GET /api/v1/notifications` lists current-user in-app notifications across active households, `PATCH /api/v1/notifications/{notificationId}` marks them read/unread, and the dashboard renders a localized notification center with proposal links and unread counts.
- In-app reminder jobs slice implemented on branch `feat/in-app-reminder-jobs`: scheduled reminder delivery creates deduped `TASK_DUE_SOON`/`TASK_OVERDUE`, `DEBT_DUE_SOON`/`DEBT_OVERDUE`, and `SETTLEMENT_CONFIRMATION_REMINDER` notifications from open tasks, open obligations, and stale submitted settlements while respecting in-app/topic preferences; `roompire-reminders.timer` is represented in ops status.
- Web Push notifications slice implemented on branch `feat/web-push-notifications`: current users can register/disable browser PushManager subscriptions from the dashboard notification center, `/api/v1/notifications/push-subscriptions` exposes readiness and subscription state, assignment/reminder notification rows best-effort dispatch Web Push when VAPID keys are configured, and `/api/v1/health` reports Web Push configuration status.
- Calendar/task edit-delete slice implemented on branch `feat/calendar-task-edit-delete`: calendar events now have idempotent update/delete APIs and inline UI actions, editable standalone events stay separate from locked task/debt-linked system events, tasks now have idempotent update/delete APIs plus inline assignment/due-date/priority/description editing, task due-date changes keep linked `TASK` calendar events synchronized, and deletion cleans up task-linked calendar events while protecting linked expense-proposal tasks.
- Recurring expense auto-proposals slice implemented on branch `feat/recurring-expense-auto-proposals`: `RecurringExpenseTemplate` rows attach auto-proposal inputs to `RECURRING_EXPENSE_GENERATION` calendar events, finite recurrence copies templates to generated occurrences, the calendar UI can configure templates, and `pnpm recurring-expenses:generate` creates at most one pending proposal per due open template-backed event before the reminder job runs.
- Settlement evidence attachment slice implemented on branch `feat/settlement-evidence`: settlements can attach up to five completed private upload files through `fileIds`, serialize signed evidence download links, show/download evidence from pending settlement rows before creditor confirmation, include settlement evidence in stats evidence counts, and harden ledger form controls against long member labels.
- Active household switcher slice implemented on branch `feat/household-switcher`: `/api/v1/session` now reads/sets a revalidated HttpOnly active-household cookie, household creation makes the new household active, the identity workspace lets users switch active households, and dashboard/app pages resolve their household from that browser-session selection instead of always using the first membership.
- PWA safe shell caching slice implemented on branch `feat/pwa-safe-shell-cache`: the app registers `/sw.js`, precaches `/offline`, the icon, manifest, and immutable Next static assets, serves a bilingual offline shell for failed navigations, and keeps `/api/`, signed download, and image optimization requests network-only so household/ledger data is not served from stale client cache.
- PWA install prompt slice implemented on branch `feat/pwa-install-prompt`: the dashboard listens for the browser `beforeinstallprompt` event, exposes a localized install action only when the browser marks the PWA installable, calls the deferred native prompt from the visible button, and switches to an installed status after `appinstalled` or standalone display-mode detection.
- Owner transfer governance slice implemented on branch `feat/owner-transfer-policy`: owners can explicitly transfer ownership to another active member through a dedicated API/UI action, the previous owner is demoted to admin, self-removal/self-role changes remain forbidden, transfer attempts by admins are rejected, and the ownership transfer emits an audit event.
- Ops health dashboard slice implemented on branch `feat/ops-health-dashboard`: host-generated `ops/status` JSON exposes disk headroom, `roompire-backup.timer`/service state, and the latest real-domain smoke result through owner/admin-gated `/api/v1/ops/status` and localized `/[locale]/app/ops`; the web container reads the status directory through a read-only bind mount and never executes host system commands during web requests.
- Server disk housekeeping slice implemented on branch `ops/disk-headroom-housekeeping`: `scripts/server_housekeeping.sh` provides dry-run-by-default cleanup for Roompire build artifacts, targeted `/tmp` leftovers, dangling Docker/build cache, journal vacuuming, optional `uv` caches, and optional generated artifacts from old Codex browser workspaces; root headroom recovered from about 2GB/100% usage to about 6.5GB free/97% usage after cleaning old generated workspaces and Docker build cache.
- Automated ops refresh slice implemented on branch `ops/automated-health-refresh`: systemd units now refresh `ops/status/ops-status.json` every 15 minutes and run authenticated real-domain smoke tests hourly at minute 7, folding the result into the ops dashboard without requiring web-request-time host commands.
- Encrypted backup storage slice implemented on branch `ops/encrypted-backups`: backup artifacts can be encrypted with OpenSSL/PBKDF2 using a passphrase file kept outside git, plaintext artifacts are removed by default after successful restore-drill verification, encrypted dumps can be verified/restored directly, and the production backup timer now writes only `.enc` artifacts plus `.sha256` sidecars.
- Backup encryption visibility slice implemented on branch `ops/backup-encryption-status`: `collect_ops_status.sh` now records backup encryption configuration, passphrase-file presence, encrypted/plaintext artifact counts, checksum sidecar coverage, and latest encrypted artifact; `/api/v1/ops/status` and `/[locale]/app/ops` expose those fields without leaking secret values.
- File manifest backup slice implemented on branch `ops/file-storage-manifest-backups`: `scripts/backup_file_manifest.sh` exports database `File` rows and storage configuration into a JSON manifest, `backup_all.sh` includes that manifest with PostgreSQL and upload-volume backups, and encrypted production runs write only `.json.enc` manifest artifacts plus `.sha256` sidecars.
- Scheduled housekeeping slice implemented on branch `ops/scheduled-housekeeping`: `server_housekeeping.sh` has category switches for unattended cleanup, and `roompire-housekeeping.timer` runs conservative daily cleanup for targeted `/tmp` leftovers, Docker/build cache, journal archives, and ops status refresh while skipping current checkout artifacts by default.
- Housekeeping ops visibility slice implemented on branch `ops/housekeeping-status`: `collect_ops_status.sh` records `roompire-housekeeping.timer` and service state, `/api/v1/ops/status` and `/[locale]/app/ops` expose the housekeeping card, OpenAPI and E2E fixtures cover the new fields, and the live site shows housekeeping as OK while disk high-usage remains the only expected ops warning.
- CI workflow hardening slice implemented on branch `chore/ci-workflow-hardening`: GitHub Actions now use pnpm `11.9.0`, CI/E2E push triggers include `ops/**`, E2E runs on feature/ops/chore pushes with explicit worker/port settings, workflow permissions/timeouts are constrained, and Playwright ops-status fixtures are isolated under `test-results/` instead of overwriting the live host ops snapshot.
- Disk headroom auto-cleanup slice implemented on branch `ops/disk-headroom-auto-cleanup`: `server_housekeeping.sh` supports `ROOMPIRE_HOUSEKEEPING_CLEAN_REPO_ARTIFACTS=auto`, which removes current-checkout `.next`, `.turbo`, Playwright reports, and test outputs only when root free bytes fall below the configured threshold and no active build/test process is detected; the installed housekeeping timer now uses this mode.
- Offsite backup status slice implemented on branch `ops/offsite-backup-status`: `scripts/sync_backup_artifacts.sh` can copy encrypted backup artifacts and `.sha256` sidecars to a configured local mount or `rclone` remote, `backup_all.sh` records disabled/offsite-sync status after backup retention, and `/api/v1/ops/status` plus `/[locale]/app/ops` expose whether an offsite copy is configured and healthy without storing credentials.
- Docker storage ops visibility slice implemented on branch `ops/docker-storage-status`: `collect_ops_status.sh` records `docker system df` image/container/volume/build-cache totals and reclaimable bytes, `/api/v1/ops/status` and `/[locale]/app/ops` expose a Docker storage card, and the summary warns when reclaimable Docker storage exceeds the configured threshold.
- Ops automation status slice implemented on branch `ops/automation-timer-status`: `collect_ops_status.sh` records `roompire-ops-status` and `roompire-smoke` timer/service health, and `/api/v1/ops/status` plus `/[locale]/app/ops` expose whether the snapshot refresh and real-domain smoke automation are active and succeeding.
- Ledger month close slice implemented on branch `feat/month-close-lock`: owner/admin users can close or reopen a ledger month through persisted-idempotent API/UI actions, closed months block new formal ledger writes by posting date across approvals, adjustments, reversals, and settlements, and the ledger page displays recent period status with bilingual copy.
- Dashboard list pagination slice implemented on branch `feat/list-pagination`: `/notifications` and `/expenses/proposals` now accept `cursor`/`limit`, return `page` metadata alongside existing arrays, and the dashboard notification center plus proposal queue expose load-more controls backed by the real APIs.
- Audit pagination slice implemented on branch `feat/audit-pagination`: `/audit-events` now returns `page` metadata with cursor support, the localized audit page can expand loaded result windows, and audit exports use a full-history query separate from the paginated page API.
- Ledger list pagination slice implemented on branch `feat/ledger-list-pagination`: ledger obligation, ledger transaction, and settlement list APIs return `page` metadata with cursor support, the ledger page can expand obligation/transaction result windows, and balance/action/export paths use full-history queries instead of paginated display slices.
- Calendar/task pagination slice implemented on branch `feat/calendar-task-pagination`: calendar event and task list APIs return `page` metadata with cursor support while the calendar page can expand loaded event/task windows without changing create/update/delete/complete workflows.
- Household category management slice implemented on branch `feat/category-management`: owners/admins can create, update, and archive active expense categories through API/UI while active members keep read-only category access and archived categories disappear from new proposal flows without losing historical proposal references.
- Expense tags slice implemented on branch `feat/expense-tags`: adds household proposal tags, active-member tag listing, owner/admin create/update/archive management, proposal `tagIds`, proposal queue/detail/export tag display, and historical tag retention after archive.

## Current phase

Phase 2/3 combined MVP: expense proposals, formal ledger, FX locks, audit log, statistics, exports, and first calendar/task shell. Current scope creates submitted proposals with equal/exact/percentage/share-unit split methods, supports private receipt/evidence attachments on local disk or S3-compatible production object storage including post-submission proposal receipt uploads, locks cross-currency FX from cached/provider rates or manual override under the default policy and lets owner/admin settings require manual FX approval for every cross-currency proposal path, supports proposal comments and a submitted/approval/rejection/change-request/receipt/comment timeline, exposes household audit, statistics, export, and ops-health API/pages with audit filtering, tamper-evident audit hash-chain verification, host-generated production health snapshots, Docker/disk pressure visibility, automation timer visibility, backup-encryption/offsite-copy visibility, encrypted file/object manifest backups, and scheduled conservative housekeeping, lets users maintain display name, preferred locale, notification preferences, and a browser-session active household, lets owners/admins manage active household expense categories and proposal tags, renders a cursor-paginated in-app notification center for assigned proposal shares with read/unread state plus scheduled task/debt/settlement reminders and optional Web Push delivery, provides a PWA manifest, dashboard install prompt, and safe offline shell caching while keeping financial/API data network-only, lets debtors decide only their own shares, lets debtors request proposal changes before ledger maturity, lets original creators revise/resubmit disputed or rejected proposals without ledger obligations, matures approved shares into append-only ledger obligations exactly once, creates repayment due calendar events for matured obligations with due dates, suggests optimized transfers by currency from open obligations, marks direct suggestions as directly settleable, keeps fully netted non-direct suggestions guidance-only by default, lets owners/admins enable household netting to make eligible non-direct suggestions clearing-settleable, lets debtors submit settlements against one open obligation, a directly settleable suggested-transfer pair, or an enabled household-clearing transfer with optional uploaded evidence, lets creditors confirm or reject those settlements after viewing evidence downloads, lets confirmed direct suggested transfers allocate across multiple matching open obligations and confirmed clearing transfers allocate across payer outgoing plus payee incoming obligations, lets owners/admins create manual adjustments or reverse unallocated open obligations, supports explicit owner transfer while preserving self-removal guards, persists idempotency keys for current financial mutations, exposes formal ledger/balance/settlement/suggestion/correction APIs and page, provides one-off and finite recurring calendar event/task creation plus task completion with task-event links, offers list/day/week/month calendar views over loaded events, lets eligible users create one linked pending expense proposal from a task or eligible calendar event, auto-generates one linked pending proposal for due recurring expense template events, serves growing proposal, notification, audit, ledger obligation, ledger transaction, settlement, calendar event, and task lists through cursor pagination, exposes dashboard load-more controls for proposals/notifications, expandable audit result windows, expandable ledger obligation/transaction windows, and expandable calendar/task windows, filters statistics by date window with proposal trend rows, runs on the real `roompire.aialra.online` site behind the private gate with fixed-window abuse controls for failed gate attempts and high-risk API mutations plus a proxy-level CSRF origin guard for unsafe browser API mutations, schedules encrypted daily production backup/restore drills, resets E2E databases for repeatable browser testing, and keeps rejected/pending/disputed proposals out of formal balances. Remaining MVP hardening work should add a long-term multi-user auth provider decision and remaining household governance polish.

## Decisions log

| Date       | Decision                                                     | Rationale                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-03 | Choose custom PWA-first system                               | Existing tools do not satisfy approval-gated ledger + locked FX + calendar-linked tasks + bilingual self-hosting.                                                                                      |
| 2026-07-03 | Use proposal/ledger split                                    | Pending expenses must be auditable but must not affect debt balances.                                                                                                                                  |
| 2026-07-03 | Use expense-date FX lock by default                          | More predictable for RMB repayment and avoids repayment-date FX disputes.                                                                                                                              |
| 2026-07-03 | Use Playwright as primary E2E gate                           | User explicitly requires real webpage interaction testing.                                                                                                                                             |
| 2026-07-04 | Pin Prisma to 6.x                                            | The supplied schema uses the stable Prisma datasource URL style; Prisma 7 requires a config migration that is not needed for Phase 0.                                                                  |
| 2026-07-04 | Pin TypeScript to 5.x and ESLint to 9.x                      | Current Next.js ecosystem is stable on these major versions; TS 6 and ESLint 10 introduced avoidable bootstrap friction.                                                                               |
| 2026-07-04 | Use Postgres 18 volume mount at `/var/lib/postgresql`        | Postgres 18 Docker image expects the newer major-version-specific data layout.                                                                                                                         |
| 2026-07-04 | Use dev-session cookie for MVP auth foundation               | Keeps Phase 1 browser-testable while leaving production auth provider selection open.                                                                                                                  |
| 2026-07-04 | Obscure inaccessible household APIs with 404                 | Avoids leaking household existence to non-members.                                                                                                                                                     |
| 2026-07-04 | Ship submitted proposal creation before approvals            | Gives users a real expense intake loop while preserving the proposal/ledger split until approval logic is implemented.                                                                                 |
| 2026-07-04 | Enable partial share maturity by default                     | Current MVP has no household partial-maturity flag, so each debtor-approved share can create its own formal obligation immediately.                                                                    |
| 2026-07-04 | Treat payer submission as payer confirmation                 | Proposal creation creates the primary payer record; debtor approval then satisfies the current maturity gate for that share.                                                                           |
| 2026-07-04 | Persist idempotency per user and key                         | Duplicate-prone financial mutations must replay identical requests and reject key reuse with changed endpoint/body.                                                                                    |
| 2026-07-04 | Require creditor confirmation before settlement allocation   | A debtor-submitted payment should be auditable immediately but should not reduce formal balances until the creditor confirms receipt.                                                                  |
| 2026-07-04 | Restrict ledger corrections to owner/admin                   | Manual adjustments and reversals are high-trust audit actions and should not be available to ordinary members or viewers.                                                                              |
| 2026-07-04 | Keep settlement suggestion API read-only                     | Suggestions guide repayment without directly mutating balances; actual balance changes still require submitted and confirmed settlements.                                                              |
| 2026-07-04 | Auto-link due tasks to calendar events                       | The first calendar/task shell should give users one operational surface immediately; task recurrence and task-to-expense proposal links can follow later.                                              |
| 2026-07-04 | Make direct suggested transfers actionable                   | A debtor can submit one settlement for a suggested debtor/payee/currency pair when matching direct open obligations exist; creditor confirmation allocates oldest-first across those obligations.      |
| 2026-07-04 | Keep fully netted non-direct suggestions guidance-only       | Without an explicit household clearing policy, optimized transfers that do not match direct obligations should not create settlement records or reduce balances.                                       |
| 2026-07-05 | Gate non-direct net settlement behind household policy       | A non-direct optimized transfer changes multiple obligations with one cash payment, so executable clearing requires explicit owner/admin household policy and audited allocations.                     |
| 2026-07-05 | Persist notification preferences before delivery workers     | Users need durable notification defaults now, while actual email/web-push delivery should remain dormant until provider and queue choices are configured.                                              |
| 2026-07-05 | Write assignment notifications in the proposal transaction   | A debtor's in-app notification should exist exactly when the proposal/share exists, obey preference gates, and stay covered by existing proposal idempotency replay semantics.                         |
| 2026-07-05 | Deduplicate scheduled reminders by recipient and subject     | Reminder jobs can run repeatedly or overlap with retries, so each task/debt/settlement reminder type must create at most one notification per recipient while still supporting multiple assignees.     |
| 2026-07-05 | Store active household as a revalidated session cookie       | The selected household is a browser preference, but every request must still re-check active membership and fall back safely if the cookie is stale or inaccessible.                                   |
| 2026-07-05 | Keep PWA caching shell-only and API network-only             | Offline support should make the app launchable without risking stale household, ledger, settlement, or audit data being served from a client cache.                                                    |
| 2026-07-05 | Treat Web Push as a progressive delivery channel             | Notification rows remain the durable source of truth; browser push can be enabled by VAPID keys, fail best-effort, and soft-disable expired endpoints without blocking financial writes.               |
| 2026-07-04 | Materialize finite recurrence for MVP                        | Daily/weekly/monthly recurrences are capped at 12 instances and written as concrete event/task rows so current list APIs, linked task events, and E2E flows stay simple and auditable.                 |
| 2026-07-04 | Create repayment due events at ledger maturity               | Proposal due dates should become operational reminders only after a debt is real; pending/rejected shares still stay out of calendar repayment obligations.                                            |
| 2026-07-04 | Derive calendar views client-side from loaded events         | Week/month/list views add useful planning affordances without expanding the API surface before filtering/windowed event queries are needed.                                                            |
| 2026-07-05 | Add day view without expanding calendar API                  | A single-day agenda is required for usable daily planning, and deriving it from already-loaded events keeps the current API simple until date-window queries become necessary.                         |
| 2026-07-04 | Link tasks to proposals with a dedicated table               | Task reimbursement should work even without a due-date calendar event, while linked TASK events can still point to the generated pending proposal for calendar context.                                |
| 2026-07-04 | Link eligible calendar events to proposals with EventLink    | Bill/chore/group/recurring-expense events should be able to spawn one pending proposal without adding a new join table, while task reimbursements keep their stricter task-specific ownership link.    |
| 2026-07-04 | Treat payer share as implicit for advanced splits            | Debtor rows are the only pending approval/debt rows; exact and percentage splits keep the payer's remainder implicit, while share-unit splits give the payer one implicit unit.                        |
| 2026-07-04 | Start receipt files with a local private storage adapter     | The MVP needs browser-testable private attachments now; keeping metadata and signed download APIs stable lets production object storage replace local disk later without changing clients.             |
| 2026-07-05 | Reuse private file uploads for settlement evidence           | Settlement receipts should share the same metadata, storage provider, SHA validation, and signed-download contract as proposal receipts instead of introducing a parallel attachment pipeline.         |
| 2026-07-05 | Show post-submission proposal receipts in timeline           | Additional receipts attached after submission are audit-relevant proposal activity, so the detail page should show them next to submitted/approval/rejection/change-request/comment events.            |
| 2026-07-04 | Revise proposals by superseding, not mutating                | Requested changes should preserve the old submitted proposal for audit; a new submitted revision carries `supersedesProposalId` and old task/event links move to the latest proposal.                  |
| 2026-07-04 | Use env-configured site gate for public deployments          | The requested public-site gate should protect pages and APIs without committing shared credentials; deployment secrets provide the username/password and leaving either unset disables the gate.       |
| 2026-07-05 | Use in-process fixed-window limits for single-web deployment | The live topology is one web container behind host nginx, so an in-memory limiter gives immediate protection and standard 429 headers; Redis/shared counters can replace it before horizontal scaling. |
| 2026-07-05 | Reject cross-site unsafe API mutations at the proxy          | Cookie-backed private deployments should block browser CSRF attempts before route handlers while preserving no-origin operational clients such as smoke tests, scripts, and server jobs.               |
| 2026-07-04 | Use Docker Compose as the production baseline                | Compose keeps Postgres, Redis, Next.js, migration, backup, and smoke-test flows repeatable on the self-hosted server without choosing an edge platform yet.                                            |
| 2026-07-04 | Bridge private site gate to production app identity          | Until a full auth provider is selected, verified Basic Auth can safely identify the single private deployment user while dev-session cookies and dev-user headers stay disabled in production.         |
| 2026-07-04 | Add S3-compatible storage behind the stable file API         | Receipts must work on real deployments without relying on a local container volume, while preserving the existing upload intent, byte upload, completion, and signed-download contracts.               |
| 2026-07-04 | Resolve FX locks from cache before live provider lookup      | Proposal creation should work offline in tests and on cache-only deployments, while production can still fetch historical rates from a configured provider and retain manual fallback.                 |
| 2026-07-05 | Expose only implemented FX policies in settings              | `ORIGINAL_CURRENCY_DEBT` and `FX_DIFFERENCE_ADJUSTMENT` require additional ledger semantics, so household settings accept only expense-date lock and manual FX approval until those workflows ship.    |
| 2026-07-04 | Expose household audit events as a read-only review surface  | The database already records critical mutations; members need a dedicated API/page to inspect actor, action, entity, timestamp, and JSON context without editing history.                              |
| 2026-07-04 | Expose household statistics as read-only derived data        | Summary/category/member stats should derive from proposal, ledger, settlement, task, file, and audit tables without creating new mutable financial state.                                              |
| 2026-07-04 | Generate exports on demand with signed IDs                   | CSV/JSON downloads should be scoped by active membership, expire quickly, avoid new mutable financial tables, and leave an audit trail when created.                                                   |
| 2026-07-04 | Keep audit filters URL-addressable                           | Audit review should be shareable and testable through query parameters, while the API and page use the same validated server-side filter service.                                                      |
| 2026-07-04 | Keep statistics filters URL-addressable                      | Statistics review should use the same `from`/`to` query parameters across APIs and page rendering so windowed reports are shareable and browser-testable.                                              |
| 2026-07-04 | Use host nginx for the current live site                     | The server already runs nginx for multiple domains, so Roompire should bind only to localhost from Compose and let nginx terminate TLS and route `roompire.aialra.online`.                             |
| 2026-07-04 | Compute audit hashes in PostgreSQL                           | A trigger covers every `AuditEvent` insert, including future direct Prisma writes, and uses a per-household advisory lock to avoid concurrent append races.                                            |
| 2026-07-04 | Verify backups by restoring into a temporary database        | A backup is not trusted until `pg_restore` can rebuild it without touching production and audit hash-chain verification reports zero broken events.                                                    |
| 2026-07-04 | Reset the E2E database before browser runs                   | Browser tests mutate many household records; resetting only approved dev/test/e2e databases keeps local and CI runs deterministic while refusing production database names.                            |
| 2026-07-05 | Transfer ownership explicitly, not through role edit         | Owner handoff changes two memberships atomically, keeps a clear audit event, and avoids hidden self-demotion/removal edge cases.                                                                       |
| 2026-07-05 | Read ops health from host-generated JSON                     | The web container should not need systemd or host command privileges; a local script can collect disk, backup, and smoke status, then mount a read-only snapshot into production.                      |
| 2026-07-05 | Keep server housekeeping dry-run by default                  | Disk cleanup may touch shared server areas, so generated artifacts can be reported safely first and only removed after explicit confirmation/env switches.                                             |
| 2026-07-05 | Automate ops snapshots with host timers                      | The ops page should stay current even when nobody manually runs smoke/status scripts; systemd timers can refresh host status and real-domain smoke artifacts outside the web request path.             |
| 2026-07-05 | Encrypt local production backups before retention            | Backup files contain private household data, so production artifacts should be encrypted at rest, integrity-checked with sidecars, and restored through the same drill path before trusting them.      |
| 2026-07-05 | Surface backup encryption health in ops snapshots            | Encrypted backups are only useful if drift is visible; the ops page should show config/artifact health from host-generated JSON while keeping secret values outside web requests and repo files.       |
| 2026-07-05 | Export file metadata manifests with daily backups            | Receipt object recovery needs more than bytes in a volume or bucket; each backup should carry a DB-derived file manifest that can reconcile provider, bucket, object key, MIME, size, and hashes.      |
| 2026-07-05 | Schedule conservative housekeeping on the server             | Disk pressure has repeatedly affected builds/tests; routine cache and journal cleanup should run under systemd, avoid live data/volumes, and skip current checkout artifacts unless manual.            |
| 2026-07-05 | Surface housekeeping health in ops snapshots                 | Scheduled cleanup only helps if timer/service drift is visible to the owner; the host snapshot can expose systemd state without giving the web container host command privileges.                      |
| 2026-07-05 | Run CI and E2E on ops branches                               | Production-hardening branches change the real server contract, so GitHub Actions must cover `ops/**` pushes instead of only feature/fix/docs/test/chore branches.                                      |
| 2026-07-05 | Isolate E2E ops-status fixtures from production snapshots    | The live web container reads `ops/status` from this checkout; browser tests must use a test-only status file so local E2E cannot replace the host-generated production snapshot.                       |
| 2026-07-05 | Auto-clean checkout artifacts only under low disk pressure   | `.next` and `.turbo` are safe to regenerate, but unattended cleanup should remove them only under low disk and after active process checks.                                                            |
| 2026-07-05 | Keep offsite backup sync explicit and disabled by default    | Copying backup artifacts to the same root filesystem is not real offsite protection, so the system should expose a warning until a true mounted/off-host target or `rclone` remote is configured.      |
| 2026-07-05 | Expose Docker storage before expanding cleanup               | Docker image and volume cleanup can affect other services on this shared server, so the ops snapshot should show storage pressure and reclaimable estimates before any broader pruning policy.         |
| 2026-07-05 | Surface ops automation health in ops snapshots               | A stale/failed snapshot refresh or production smoke timer should be visible to the owner from the real site before web requests need host command privileges.                                          |
| 2026-07-05 | Treat settlement payment metadata as reviewable evidence     | Submitted settlements should carry method, optional payment reference, optional note, and optional evidence files so creditors can review context before confirmation without processing payments.     |
| 2026-07-05 | Close ledger months by posting date                          | Formal ledger writes must not mutate closed accounting periods; checking the relevant occurrence/settlement/original transaction month keeps close and reopen auditable.                               |
| 2026-07-05 | Paginate growing lists without breaking clients              | Returning `page` metadata alongside existing arrays lets current UI and API consumers keep working while high-growth pages add load-more controls and exports/actions keep full-history query paths.   |

## Open questions for later human review

- Whether WeChat Mini Program is Phase 2 or Phase 3.
- Whether household settlement currency defaults to CNY, USD, or per-household selection.
- Whether partial approvals should immediately create formal obligations or wait for all shares by default. Recommended default: partial maturity enabled, household-configurable.
- Whether to keep receipt storage on the local Docker upload volume for the private deployment or move it to S3/R2 before heavier real use.

## Next recommended tasks

1. Select the long-term production auth provider and replace the private site-gate bridge when multi-user public access is needed.
2. Design and implement the remaining FX policies (`ORIGINAL_CURRENCY_DEBT` and `FX_DIFFERENCE_ADJUSTMENT`) only after their ledger, settlement, and reporting semantics are explicit.
3. Continue root-disk capacity planning; production build/test runs can still push root usage above 99%, and the latest PWA install prompt deploy ended around 6.9GB free / 97% used after removing regenerated checkout artifacts and Docker build cache.
4. Configure a real off-host backup copy target plus passphrase escrow once private production data grows beyond the initial household; the sync/status mechanism now exists and intentionally warns while disabled.

## Last session verification

- 2026-07-05 PWA install prompt:
  - Branch/commit: `feat/pwa-install-prompt` / `7c04f78 feat: add pwa install prompt`, pushed to `origin/feat/pwa-install-prompt`.
  - Verification passed before deployment: `pnpm format:check`, `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (12 files, 50 tests), `pnpm build`, targeted `ROOMPIRE_E2E_PORT=3101 pnpm e2e --grep "dashboard install prompt uses the browser PWA install event"` (desktop/mobile, 2 passed), and full `ROOMPIRE_E2E_PORT=3101 pnpm e2e` (48 passed across Chromium desktop/mobile).
  - GitHub Actions passed for the pushed implementation commit: CI https://github.com/AIALRA-0/Roompire/actions/runs/28755368458 and E2E https://github.com/AIALRA-0/Roompire/actions/runs/28755368486.
  - Production deployment from the self-hosted server used Docker Compose only, without SSH: ran safe housekeeping before build, built `web` and `migrate`, ran `prisma migrate deploy` with no pending migrations, recreated `roompire-web-1`, and confirmed the container healthy on `127.0.0.1:18300`.
  - Real-domain smoke passed for `https://roompire.aialra.online`: `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`.
  - Live production validation through the real site gate opened `/en-US/app` on the real domain, injected a synthetic `beforeinstallprompt` browser event at the browser boundary, verified the visible dashboard install button called the deferred prompt, confirmed the installed badge after `appinstalled`, and captured `output/playwright/roompire-pwa-install-live.png`.
  - Ops status was refreshed, post-deploy housekeeping reclaimed 2.534GB of Docker build cache, and the server ended around 6.9GB free / 97% used with Docker build cache at 0B.
- 2026-07-05 Web Push notifications:
  - Branch/commit: `feat/web-push-notifications` / `9475c94 feat: add web push notifications`, pushed to `origin/feat/web-push-notifications`.
  - Verification passed before deployment: OpenAPI YAML parse with `python3`, `pnpm db:validate`, `git diff --check`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (12 files, 50 tests), `pnpm db:generate`, `pnpm db:migrate`, `pnpm build`, and targeted `pnpm e2e --grep "expense proposal assignment creates an in-app notification"` (desktop/mobile, 2 passed).
  - GitHub Actions passed for the pushed commit: CI https://github.com/AIALRA-0/Roompire/actions/runs/28754046381 and E2E https://github.com/AIALRA-0/Roompire/actions/runs/28754046399.
  - Production deployment from the self-hosted server used Docker Compose only, without SSH: generated VAPID keys in `.env.production` without committing secrets, built `web` and `migrate`, applied migration `20260705150000_add_web_push_subscriptions`, recreated `roompire-web-1`, and confirmed the container healthy on `127.0.0.1:18300`.
  - Real-domain smoke passed for `https://roompire.aialra.online`: `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated `/api/v1/health` returned `webPush=ok`.
  - Live production validation through the real site gate opened the dashboard on the real domain, mocked browser PushManager only at the browser boundary, registered a temporary push endpoint through the visible notification center UI, confirmed `/api/v1/notifications/push-subscriptions` reported `deliveryMode=send` and active count `0 -> 1`, captured `output/playwright/roompire-web-push-live.png`, disabled the endpoint through the UI, and confirmed active count returned to `0`.
  - Production reminder CLI dry-run passed through the migrator container with `--dry-run --max-items=1`, ops status was refreshed, post-deploy housekeeping reclaimed 4.597GB of Docker build cache, and the server ended around 8.4GB free / 96% used with Docker build cache at 0B.
- 2026-07-05 Expense tags:
  - Branch/commit: `feat/expense-tags` / `e587a69 feat: add expense tags`, pushed to `origin/feat/expense-tags`.
  - Verification passed before deployment: `pnpm db:generate && pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (11 files, 45 tests), `pnpm db:migrate`, `pnpm build`, `git diff --check`, `jq empty`, OpenAPI YAML parse with `python3`, and targeted `pnpm e2e --grep "owner updates settings and manages a linked invitee"` (desktop/mobile, 2 passed).
  - Production deployment from the self-hosted server used Docker Compose only, without SSH: built `web` and `migrate`, applied migration `20260705140000_add_expense_tags`, recreated `roompire-web-1`, and confirmed the container healthy on `127.0.0.1:18300`.
  - Real-domain smoke passed for `https://roompire.aialra.online`: `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`.
  - Live production validation through the site gate created an isolated temporary household, added a synthetic member, created and updated a tag through the public API, submitted a tagged proposal from the real `/en-US/app` UI, verified proposal response tags, queue badges, and proposal detail `proposal-tags`, archived the tag through the UI, confirmed archived tags disappear from the active API/form while historical proposal detail keeps the tag, downgraded the temporary owner membership to `MEMBER` and confirmed tag creation returns 403, then cleaned temporary household/tag/proposal/proposal-tag/membership/audit/notification/invite/idempotency rows with zero remaining counts.
  - GitHub Actions passed for the pushed commit: CI https://github.com/AIALRA-0/Roompire/actions/runs/28752436825 and E2E https://github.com/AIALRA-0/Roompire/actions/runs/28752436814.
  - Post-deploy housekeeping reclaimed 2.527GB of Docker build cache plus 454MB of unused image layers, removed regenerated checkout artifacts, left Docker build cache at 0B, confirmed no `Live Tags` temporary rows remained, and ended around 8.6GB free / 96% used.
- 2026-07-05 Household category management:
  - Branch/commit: `feat/category-management` / `7b3eda1 feat: manage household categories`, pushed to `origin/feat/category-management`.
  - Verification passed before deployment: `pnpm db:generate && pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (11 files, 45 tests), `pnpm build`, `git diff --check`, `jq empty`, OpenAPI YAML parse with `python3`, and targeted `pnpm e2e --grep "owner updates settings and manages a linked invitee"` (desktop/mobile, 2 passed).
  - Production deployment from the self-hosted server used Docker Compose only, without SSH: built `web` and `migrate`, ran `prisma migrate deploy` with no pending migrations, recreated `roompire-web-1`, and confirmed the container healthy on `127.0.0.1:18300`.
  - Real-domain smoke passed for `https://roompire.aialra.online`: `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`.
  - Live production validation through the site gate created an isolated temporary household, created/listed/updated a custom expense category through the public API, verified the updated row and expense category dropdown on `/en-US/app` with a real browser, archived the category from the UI, confirmed archived categories are hidden from the API/dropdown, downgraded the temporary owner membership to `MEMBER` and confirmed category creation returns 403, then cleaned the temporary household/category/membership/audit/notification/invite rows with zero remaining counts.
  - GitHub Actions passed for the pushed commit: CI https://github.com/AIALRA-0/Roompire/actions/runs/28751516935 and E2E https://github.com/AIALRA-0/Roompire/actions/runs/28751516981.
- 2026-07-05 Calendar/task pagination:
  - Branch/commit: `feat/calendar-task-pagination` / `5fee9c4 feat: paginate calendar task lists`, pushed to `origin/feat/calendar-task-pagination`.
  - Verification passed before deployment: `pnpm db:generate && pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (11 files, 45 tests), `pnpm build`, `git diff --check`, `jq empty`, OpenAPI YAML parse with `python3`, and targeted `pnpm e2e --grep "member creates calendar work and completes an assigned task"` (desktop/mobile, 2 passed).
  - Production deployment from the self-hosted server used Docker Compose only, without SSH: built `web` and `migrate`, ran `prisma migrate deploy` with no pending migrations, recreated `roompire-web-1`, and confirmed the container healthy on `127.0.0.1:18300`.
  - Real-domain smoke passed for `https://roompire.aialra.online`: `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`.
  - Live production validation through the gate created isolated temporary calendar data, verified event/task `limit=1` first pages with `hasMore=true`, matching `nextCursor`, distinct second cursor pages, invalid cursor `400`, session active-household switching, and `/en-US/app/calendar?eventLimit=1&taskLimit=1` load-more controls. A second real-browser production check used the live HTTP APIs to create a temporary household plus event/task rows, opened the production calendar page with Playwright, confirmed both load-more controls visible, and cleaned temporary rows with zero remaining household/event/task counts.
  - GitHub Actions passed for the pushed commit: CI https://github.com/AIALRA-0/Roompire/actions/runs/28750725912 and E2E https://github.com/AIALRA-0/Roompire/actions/runs/28750725963.
- 2026-07-05 Ledger list pagination:
  - Branch/commit: `feat/ledger-list-pagination` / `c2a2aeb feat: paginate ledger lists`, pushed to `origin/feat/ledger-list-pagination`.
  - Verification passed before final deployment: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (11 files, 45 tests), `pnpm build`, `git diff --check`, `jq empty`, OpenAPI YAML parse with `python3`, and targeted `pnpm e2e --grep "debtor settles a suggested transfer across multiple obligations"` (desktop/mobile, 2 passed).
  - Production deployment from the self-hosted server used Docker Compose only, without SSH: built `web` and `migrate`, ran `prisma migrate deploy` with no pending migrations, recreated `roompire-web-1`, and confirmed the container healthy on `127.0.0.1:18300`.
  - Real-domain smoke passed for `https://roompire.aialra.online`: `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`.
  - Live validation through the production gate created an isolated temporary household, verified obligation/transaction/settlement `limit=1` first pages with `hasMore=true`, matching `nextCursor`, distinct second cursor pages, valid-but-missing cursor `400`, ledger page load-more controls for obligations and transactions, and full-history exports returning 2 ledger obligations and 2 settlements despite paginated display windows; temporary validation users/households were cleaned up and follow-up counts returned zero.
  - GitHub Actions passed for the final pushed commit: CI https://github.com/AIALRA-0/Roompire/actions/runs/28749890156 and E2E https://github.com/AIALRA-0/Roompire/actions/runs/28749890153.
- 2026-07-05 Audit pagination:
  - Branch/commit: `feat/audit-pagination` / `dd7546e feat: paginate audit events`, pushed to `origin/feat/audit-pagination`.
  - Verification passed before deployment: `pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (11 files, 45 tests), `pnpm build`, `git diff --check`, and full `pnpm e2e` (46 browser tests across desktop/mobile).
  - Production deployment from the self-hosted server used Docker Compose only, without SSH: built `web` and `migrate`, ran `prisma migrate deploy` with no pending migrations, recreated `roompire-web-1`, and confirmed the container healthy on `127.0.0.1:18300`.
  - Real-domain smoke passed for `https://roompire.aialra.online`: `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`. Live audit pagination validation through the production gate returned session 200, `GET /audit-events?limit=1` with `page.hasMore=true`, a matching `nextCursor`, a second cursor page with a different event, invalid cursor 400, verified audit hash chain, and `/en-US/app/audit?limit=1` rendered the load-more control.
  - GitHub Actions passed for the pushed commit: CI https://github.com/AIALRA-0/Roompire/actions/runs/28748173882 and E2E https://github.com/AIALRA-0/Roompire/actions/runs/28748173901.
  - Docker build cache was pruned after deployment (`2.552GB` reclaimed); root disk was back to about `6.5G` free / `97%` used afterward.
- 2026-07-05 Dashboard list pagination:
  - Added `apps/web/src/server/pagination.ts` plus unit coverage for `limit + 1` cursor paging; proposal and notification list services now accept `cursor`/`limit`, validate UUID cursors, and return `page` metadata while preserving the existing `proposals` and `notifications` arrays.
  - Dashboard proposal queue and in-app notification center now start with five rows and expose localized en-US/zh-CN load-more controls that call the real paginated APIs.
  - Updated README, OpenAPI, technical/API/backlog docs, and the acceptance checklist; no database migration or new environment variable was required.
  - Verification passed before deployment work: `pnpm typecheck`, targeted `pnpm test -- --run src/server/pagination.test.ts`, `jq empty`, OpenAPI YAML parse, `pnpm lint`, `pnpm format:check`, full `pnpm test` (11 files, 45 tests), `pnpm build`, targeted Playwright pagination test, and full `pnpm e2e` (46 browser tests across desktop/mobile).
  - Production web and migrator images were rebuilt on the local self-hosted server with `docker-compose.nginx.example.yml`; no pending migrations were found, `roompire-web-1` was recreated healthy on `127.0.0.1:18300`, and no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation on `https://roompire.aialra.online` created a temporary household plus synthetic member, verified proposal pagination (`limit=1`, `nextCursor`, distinct second page), inserted scoped temporary notifications for the gate user, verified notification pagination and invalid cursor `400`, fetched dashboard HTML with status `200`, and removed the temporary production rows.
  - Disk pressure returned after build/E2E; housekeeping removed current checkout `.next`/`.turbo`/test outputs, then regenerated `node_modules`, `/home/aialra/.cache/codex-runtimes`, and old Babbledeck Tauri/Android build targets were removed before deployment. Post-deploy housekeeping reclaimed 2.551GB of Docker build cache and production ended around 5.8GB free / 98% used with expected Docker reclaimable-storage warnings.
- 2026-07-05 CSRF origin guard:
  - Added `apps/web/src/server/security/csrf.ts` and proxy integration so unsafe `/api/v1` methods reject browser-style cross-site request metadata with `403 CSRF_ORIGIN_MISMATCH` before route handlers run.
  - Same-origin browser mutations and no-origin operational clients still reach route handlers, preserving Playwright API helpers, smoke scripts, and server-side jobs.
  - Updated README, OpenAPI, technical/API/security/coding/backlog docs, and the acceptance checklist; no new environment variables or database migrations were required.
  - Verification passed before deployment: `pnpm typecheck`, `pnpm lint`, `pnpm test` (10 files, 43 tests), `pnpm format:check`, `git diff --check`, `jq empty`, OpenAPI YAML parse, tightened secret-diff scan, `pnpm build`, targeted Playwright CSRF test, and full `pnpm e2e` (44 browser tests).
  - Production web and migrator images were rebuilt on the local self-hosted server with `docker-compose.nginx.example.yml`; no pending migrations were found, `roompire-web-1` was recreated healthy on `127.0.0.1:18300`, and no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation on `https://roompire.aialra.online` confirmed cross-site unsafe mutation requests return `CSRF_ORIGIN_MISMATCH`, same-origin and no-origin unsafe mutation probes reach the disabled dev-session route with `DEV_AUTH_DISABLED`, health remains 200, and desktop/mobile app pages render without horizontal overflow.
  - Live screenshots saved under `output/playwright/roompire-csrf-live-desktop-1783264433178.png` and `output/playwright/roompire-csrf-live-mobile-1783264433178.png`; post-deploy housekeeping reclaimed 2.547GB of Docker build cache and production ended around 6.5GB free / 97% used with expected disk/Docker/offsite warnings.
- 2026-07-05 Household manual FX policy:
  - Restricted household settings/API updates to the currently implemented FX policies: `LOCK_AT_EXPENSE_DATE` and `MANUAL_RATE_WITH_APPROVAL`; full `FxPolicy` remains in response schemas while original-currency debt and FX-difference adjustment stay backlog policies.
  - Added service-layer enforcement so cross-currency proposal creation, proposal revisions, task-generated expense proposals, and event-generated expense proposals require explicit `fxRate` under `MANUAL_RATE_WITH_APPROVAL`, returning `FX_MANUAL_RATE_REQUIRED` when omitted and recording `fxProvider=manual-entry` when supplied.
  - Updated the dashboard expense form to mark FX rate required only for cross-currency manual-policy households, removed unsupported options from settings UI, and refreshed en-US/zh-CN copy plus README/OpenAPI/API/technical/database/backlog docs.
  - Verification passed before deployment: `pnpm typecheck`, `pnpm lint`, `pnpm test` (9 files, 34 tests), `pnpm format:check`, `git diff --check`, `jq empty`, OpenAPI YAML parse, tightened secret-diff scan, `pnpm build`, targeted Playwright manual-FX policy test, and full `pnpm e2e` (42 browser tests).
  - Production web and migrator images were rebuilt on the local self-hosted server with `docker-compose.nginx.example.yml`; no pending migrations were found, `roompire-web-1` was recreated healthy on `127.0.0.1:18300`, and no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation on `https://roompire.aialra.online` created a temporary household plus synthetic member, confirmed unsupported FX policy updates are rejected, confirmed manual FX policy persists, verified missing cross-currency `fxRate` returns `FX_MANUAL_RATE_REQUIRED`, verified a manual-rate proposal records `fxProvider=manual-entry`, and removed the temporary production rows.
  - Live screenshots saved under `output/playwright/roompire-fx-policy-live-desktop-1783262218987.png` and `output/playwright/roompire-fx-policy-live-mobile-1783262218987.png`; post-deploy housekeeping reclaimed 2.541GB of Docker build cache and production ended around 6.8GB free / 97% used with expected disk/Docker/offsite warnings.
- 2026-07-05 API abuse rate limiting:
  - Added fixed-window in-process API rate limiting for dev-session switching, invite creation/acceptance, file upload intents, proposal comments, and share approve/reject/request-changes mutations; 429 responses include `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`.
  - Dev-session defaults to 120 attempts per 5 minutes because production disables dev auth and E2E/dev flows repeatedly switch the seeded user; stricter real-surface controls remain on the private gate, invites, uploads, comments, and share decisions.
  - Added failed private site-gate Basic Auth attempt limiting in the Next proxy, with correct credentials still allowed after failures from another client; production defaults remain configured only through `.env.production`.
  - Updated OpenAPI, README, API/security/deployment/technical/backlog docs, env templates, and E2E coverage for the 429 contract; unit tests cover fixed-window counters, reset behavior, subject isolation, and headers.
  - Verification passed before deployment: `pnpm typecheck`, `pnpm lint`, `pnpm test` (9 files, 34 tests), `pnpm format:check`, `git diff --check`, `jq empty`, OpenAPI YAML parse, production `pnpm build`, targeted Playwright rate-limit test, full `pnpm e2e` (40 browser tests), and secret-diff scans for the production gate strings.
  - Production web and migrator images rebuilt on this self-hosted server with `docker-compose.nginx.example.yml`; no pending migrations were found, `roompire-web-1` was recreated healthy on `127.0.0.1:18300`, and no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; live validation on `https://roompire.aialra.online` confirmed 20 failed gate attempts return 401, the 21st returns 429 with rate-limit headers, correct gate credentials still return health 200, and authenticated desktop/mobile ops pages render without horizontal overflow.
  - Live screenshots saved under `output/playwright/roompire-rate-limit-live-desktop-mr7ukqps.png` and `output/playwright/roompire-rate-limit-live-mobile-mr7ukqps.png`; post-deploy housekeeping reclaimed 2.54GB of Docker build cache and production ended around 7.3GB free / 97% used with expected disk/Docker/offsite warnings.
- 2026-07-05 Proposal receipt timeline uploads:
  - Added a proposal-detail receipt upload form for eligible owners/admins/members, using the existing private upload intent, byte upload, complete-upload, and signed-download contract.
  - Proposal detail timelines now include attached receipt file events alongside submitted/approval/rejection/change-request/comment activity, with localized en-US/zh-CN copy and docs/OpenAPI/backlog updates.
  - E2E now covers initial proposal receipt upload, post-submission follow-up receipt attachment, timeline rendering, proposal detail API serialization of both files, signed download URL generation, and downloaded-byte equality.
  - Verification passed before deployment: `jq empty`, OpenAPI YAML parse, `git diff --check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (8 files, 30 tests), `pnpm format:check`, `pnpm build`, targeted Playwright receipt flow, and full `pnpm e2e` (38 browser tests).
  - Production web and migrator images rebuilt on the local self-hosted server with `docker-compose.nginx.example.yml`; no pending migrations were found, `roompire-web-1` was recreated healthy on `127.0.0.1:18300`, and no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation on `https://roompire.aialra.online` created a temporary household plus synthetic member, submitted a proposal with an initial receipt, attached a second receipt from the real proposal detail UI, verified timeline/API/download bytes, checked desktop/mobile rendering with zero horizontal overflow, and saved screenshots under `output/playwright/roompire-proposal-receipt-timeline-live-*.png`.
  - Cleanup removed the temporary production household, synthetic debtor user, two file rows, one notification row, and the scoped local upload directory; post-deploy housekeeping reclaimed 2.538GB of Docker build cache and production ended around 8.0GB free / 96% used.
- 2026-07-05 Recurring expense auto-proposals:
  - Added `RecurringExpenseTemplate` with migration `20260705120000_add_recurring_expense_templates`, calendar event serialization, template validation for active non-viewer debtor memberships, category validation, and template copying across finite recurrence occurrences.
  - Added `generateRecurringExpenseProposals`, `scripts/generate_recurring_expenses.ts`, and `pnpm recurring-expenses:generate`; `roompire-reminders.service` now runs recurring expense generation before in-app reminders through the Compose migrator container.
  - Added localized calendar UI fields for automatic proposal templates on `RECURRING_EXPENSE_GENERATION` events, API/OpenAPI/docs/backlog updates, and E2E coverage proving one due event generates one pending proposal while a future occurrence remains unlinked and repeated job runs are idempotent.
  - Verification passed: Prisma format/generate/validate, `jq empty`, OpenAPI YAML parse, `git diff --check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (8 files, 30 tests), `pnpm format:check`, `pnpm build`, and full `pnpm e2e` (38 browser tests).
  - Production migration applied and web/migrator images rebuilt on the local self-hosted server with no SSH or external VPS access; `roompire-web-1` is healthy on `127.0.0.1:18300`, the private gate default credentials are configured through `.env.production`, and `roompire-reminders.service` latest result is `success`.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation created a temporary household plus synthetic member, created a recurring expense template through the real calendar UI, ran the production recurring-expense job twice, verified the generated pending proposal and event link via live APIs/UI, checked desktop/mobile rendering with zero horizontal overflow, saved screenshots under `output/playwright/roompire-recurring-expense-live-*.png`, and removed all temporary production rows.
  - Post-deploy housekeeping reclaimed 2.537GB of Docker build cache and refreshed ops status; production ended around 8.4GB free / 96% used with the expected Docker reclaimable-storage warning still visible.
- 2026-07-05 Calendar/task edit-delete:
  - Added idempotent `PATCH`/`DELETE` routes for `/calendar/events/{eventId}` and `/tasks/{taskId}`, with RBAC, audit events, linked-event synchronization, protected system-linked calendar events, and protected deletion for tasks with linked expense proposals.
  - Added localized inline edit/delete controls to the calendar workspace for standalone events and tasks, including assignment updates, due-date changes, task-linked calendar event creation/update/removal, and destructive-action confirmation.
  - Updated OpenAPI, README, API/technical/backlog docs, and en-US/zh-CN copy; E2E now covers event edit/delete, task edit/delete, linked task event synchronization, viewer denial, and desktop/mobile layouts.
  - Verification passed: `git diff --check`, `jq empty`, OpenAPI YAML parse, `pnpm db:validate`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (8 files, 30 tests), `pnpm build`, targeted Playwright desktop/mobile calendar/viewer flows, and full `pnpm e2e` (38 browser tests).
  - Production build/deploy completed on the local self-hosted server with `docker-compose.nginx.example.yml`, no SSH or external VPS access; `roompire-web-1` was rebuilt/recreated healthy on `127.0.0.1:18300`, with no pending migrations.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation on `https://roompire.aialra.online` created a temporary household/event/task, edited event/task through the real UI, verified task-linked calendar-event synchronization via API, checked desktop/mobile rendering with zero horizontal overflow, deleted the event/task through the UI, saved screenshots under `output/playwright/roompire-calendar-task-edit-delete-live-*.png`, and removed all temporary production rows.
  - Post-deploy housekeeping reclaimed 2.535GB of Docker build cache and refreshed ops status; production ended around 8.9GB free / 96% used with the web, Postgres, and Redis containers healthy.
- 2026-07-05 In-app reminder jobs:
  - Added `Notification.dedupeKey` with migration `20260705110000_add_notification_dedupe_key`, plus idempotent task due/overdue, debt due/overdue, and settlement confirmation reminder generation that respects in-app/topic preferences.
  - Added `scripts/send_reminders.ts`, `pnpm notifications:send-reminders`, localized notification-center rendering for reminder types, ops-status fields/cards for `roompire-reminders.timer`/service, and systemd units that run the reminder job through the Compose migrator container.
  - Updated Docker migrator stage so production reminder jobs can execute Prisma-backed TypeScript scripts inside the Compose network, with generated Prisma Client and app source available.
  - Verification passed: `prisma format`, `pnpm db:generate`, `pnpm db:validate`, `jq empty`, OpenAPI YAML parse, `git diff --check`, `pnpm typecheck`, `pnpm test` (8 files, 30 tests), `pnpm lint`, `pnpm format:check`, `pnpm build`, targeted Playwright desktop/mobile reminder and ops flows, full `pnpm e2e` (38 browser tests), systemd unit verification, Docker web/migrator builds, and secret scans for the production gate strings.
  - Production migration applied on the local self-hosted server; `roompire-web-1` was rebuilt/recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`; `roompire-reminders.timer` is enabled and its latest oneshot service result is `success`.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation created a temporary household/task, ran the production reminder job twice to prove idempotency, verified `TASK_OVERDUE` through the live notifications API and desktop/mobile dashboard UI with zero horizontal overflow, saved screenshots under `output/playwright/roompire-reminders-live-*.png`, and deleted all temporary production rows.
  - Post-deploy housekeeping reclaimed 2.534GB of Docker build cache and refreshed ops status; production ended around 9.5GB free / 96% used with reminder timer/service and latest smoke marked OK.
- 2026-07-05 Ledger month close:
  - Added `LedgerPeriodClose`/`LedgerPeriodStatus` with migration `20260705100000_add_ledger_period_closes`, period close/reopen services, serializers, idempotent APIs, owner/admin ledger UI, docs/OpenAPI/i18n updates, and E2E coverage.
  - Closed ledger months now return `409 LEDGER_PERIOD_CLOSED` for formal writes in that month, including approval maturity, manual adjustments, obligation reversals, and settlement submit/confirm/reject posting dates.
  - Verification passed: `prisma format`, `pnpm db:generate`, `pnpm db:validate`, `jq empty`, OpenAPI YAML parse, `pnpm typecheck`, `pnpm test` (8 files, 28 tests), `pnpm lint`, `pnpm format:check`, `pnpm build`, `git diff --check`, full `pnpm e2e` (38 browser tests), and secret scans for the production gate strings.
  - Production migration applied on the local self-hosted server; `roompire-web-1` was rebuilt/recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`; no SSH or separate VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation created a temporary household, closed `2026-07`, verified API/UI status, confirmed adjustment and settlement writes were blocked with `LEDGER_PERIOD_CLOSED`, reopened the month, checked desktop/mobile ledger overflow, saved screenshots under `output/playwright/roompire-month-close-live-*.png`, and deleted all temporary production rows.
  - Post-deploy housekeeping reclaimed 2.445GB of Docker build cache and refreshed ops status; production ended around 7.9GB free / 96% used with expected Docker storage visibility still active.
- 2026-07-05 Settlement payment metadata:
  - Added nullable `Settlement.paymentReference` with migration `20260705090000_add_settlement_payment_reference`, settlement create validation/serialization, ledger transaction settlement serialization, OpenAPI/API/database docs, backlog updates, and en-US/zh-CN labels.
  - Ledger settlement forms now collect payment reference for direct and suggested settlements; pending settlement review displays method, reference, note, and evidence before creditor confirmation.
  - Hardened ledger mobile layouts around settlement actions, correction forms, reversal rows, transactions, and the ledger header so long member names, emails, and payment references do not create page-level horizontal overflow.
  - Verification passed: `prisma format`, `pnpm db:generate`, `pnpm db:validate`, `jq empty`, OpenAPI YAML parse, `git diff --check`, `pnpm typecheck`, `pnpm test` (8 files, 28 tests), `pnpm lint`, `pnpm format:check`, `pnpm build`, targeted Playwright desktop/mobile settlement metadata flows, full `pnpm e2e` (38 browser tests), and secret scans for the production gate strings.
  - Production migration `20260705090000_add_settlement_payment_reference` applied on the local self-hosted server; `roompire-web-1` was rebuilt/recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`; no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation created a temporary household, synthetic member, ledger adjustments, an API-created settlement with payment reference, and a pending review settlement, verified settlement API metadata plus desktop/mobile ledger rendering with zero horizontal overflow, and deleted all temporary production rows.
  - Post-deploy housekeeping reclaimed 2.853GB of Docker build cache and refreshed ops status; production ended around 8.9GB free / 96% used with expected Docker storage visibility still active.
- 2026-07-05 Calendar day view:
  - Added a localized Day tab to the calendar event view switcher, with same-day event grouping, date heading, event time/all-day display, type/status badges, and responsive desktop/mobile layout.
  - Updated README, API specification narrative, backlog, and en-US/zh-CN copy; the calendar E2E flow now checks list, day, week, and month event views.
  - Verification passed: `jq empty`, `pnpm typecheck`, targeted Playwright desktop/mobile calendar flow, `pnpm test` (8 files, 28 tests), `pnpm lint`, `pnpm format:check`, `pnpm build`, `git diff --check`, and secret scans for the production gate strings.
  - Production Docker build completed on the local self-hosted server, and `roompire-web-1` was recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`; no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live desktop/mobile validation created a temporary household/event, switched active household, verified the Day tab/event text, zero horizontal overflow, screenshots under `output/playwright/roompire-calendar-day-live-*.png`, and then removed all temporary production rows.
  - Post-deploy housekeeping reclaimed 2.013GB of Docker build cache and refreshed ops status; production ended around 11GB free / 95% used with expected Docker storage visibility still active.
- 2026-07-05 PWA safe shell caching:
  - Added `ServiceWorkerRegistrar`, public `/sw.js`, static `/offline`, manifest `id`/`scope`, README/deployment/technical/test/backlog docs, and Playwright coverage proving offline shell behavior.
  - The service worker precaches only `/offline`, `/icon.svg`, `/manifest.webmanifest`, and immutable Next static assets; navigation is network-first with offline fallback, while `/api/`, signed downloads, and image optimization requests remain network-only.
  - Verification passed: `pnpm typecheck`, targeted Playwright desktop/mobile PWA flow, full `pnpm e2e` (38 browser tests), `pnpm test` (8 files, 28 tests), `pnpm lint`, `pnpm format:check`, `pnpm build`, `git diff --check`, and secret scans for the production gate strings.
  - Production Docker build completed on the local self-hosted server, and `roompire-web-1` was recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`; no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live desktop/mobile validation confirmed `/sw.js`, active service worker registration, offline API rejection, `/offline` cached, no cached `/api/v1/session`, offline navigation fallback, zero horizontal overflow, and screenshots under `output/playwright/roompire-pwa-offline-live-*.png`.
  - Post-deploy housekeeping reclaimed 2.187GB of Docker build cache and refreshed ops status; production ended around 11GB free / 95% used with expected Docker reclaimable storage visibility still active.
- 2026-07-05 Active household switcher:
  - Added a shared active-household helper, `PATCH /api/v1/session` with membership validation, `GET /api/v1/session` active-household serialization, and HttpOnly cookie persistence for the browser-selected household.
  - Household creation now marks the new household active, and the localized identity workspace renders a household switch action that refreshes dashboard/app pages against the selected household.
  - Updated OpenAPI, README, technical/API/backlog docs, and en-US/zh-CN copy; dashboard model now chooses the active membership from the session cookie and falls back to the first accessible household.
  - Verification passed: `jq empty`, `pnpm typecheck`, targeted Playwright desktop/mobile active-household switch flow, `pnpm test` (8 files, 28 tests), `pnpm lint`, `pnpm format:check`, `pnpm build`, `git diff --check`, and secret scans for the production gate strings.
  - Production Docker build completed on the local self-hosted server, and `roompire-web-1` was recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`; no SSH or external VPS access was used.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live desktop/mobile validation created temporary production households, verified auto-active creation, invalid switch 404, active switch persistence across `/en-US/app` and `/en-US/app/ledger`, zero horizontal overflow, and then deleted temporary households/notifications.
  - Post-deploy housekeeping reclaimed about 1.8GB of Docker build cache and refreshed ops status; production ended around 12GB free / 95% used with expected high-usage monitoring still active.
- 2026-07-05 Settlement evidence attachments:
  - Added `SettlementFile` with migration `20260705080000_add_settlement_files`, settlement `fileIds` input, settlement file audit events, signed download serialization, ledger UI evidence upload/download controls, stats evidence counting, OpenAPI/docs/i18n updates, and E2E coverage for upload/download bytes.
  - Hardened ledger correction form controls and pending settlement evidence filenames so long member labels or filenames cannot create horizontal overflow on ledger pages.
  - Verification passed: `prisma format`, `pnpm db:generate`, `pnpm db:validate`, `jq empty`, `git diff --check`, `pnpm typecheck`, `pnpm test` (8 files, 28 tests), targeted Playwright desktop/mobile settlement-evidence flow, `pnpm format:check`, `pnpm lint`, production Docker/Next build, and secret scans for the production gate strings.
  - Production migration `20260705080000_add_settlement_files` applied on the local self-hosted server; `roompire-web-1` was rebuilt/recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live validation uploaded a temporary PDF through the real file API, linked it to a temporary pending settlement in production, verified settlement API metadata, signed download bytes, desktop/mobile ledger rendering, and zero horizontal overflow, then deleted all temporary DB rows and the local upload object.
  - Post-deploy housekeeping reclaimed 3.245GB of Docker build cache and refreshed ops status; production ended around 8.8GB free / 96% used with expected Docker storage and disabled offsite-backup warnings.
- 2026-07-05 In-app notification center:
  - Added `GET /api/v1/notifications`, `PATCH /api/v1/notifications/{notificationId}`, a dashboard `NotificationCenter`, localized notification copy, OpenAPI/docs updates, and proposal-creation `EXPENSE_PROPOSAL_ASSIGNED` rows gated by user notification preferences.
  - Verification passed: `jq empty`, `pnpm typecheck`, `pnpm test` (8 files, 28 tests), Playwright desktop/mobile targeted notification flow, `git diff --check`, `pnpm db:validate`, `pnpm format:check`, `pnpm lint`, `pnpm build`, and secret scan for the production gate strings.
  - Production Docker build completed on the local self-hosted server with `docker-compose.nginx.example.yml`; no pending migrations were found, and `roompire-web-1` was recreated healthy with `127.0.0.1:18300->3000` preserved.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated live API/UI smoke inserted a temporary notification for the current gate session, verified desktop/mobile dashboard rendering and zero horizontal overflow, marked it read through the real PATCH route, and deleted the temporary row.
  - Post-deploy housekeeping reclaimed 2.438GB of Docker build cache and refreshed ops status; production ended around 9.1GB free / 96% used with expected Docker storage and disabled offsite-backup warnings.
- 2026-07-05 User profile and notification preferences:
  - Added `NotificationPreference` with migration `20260705070000_add_notification_preferences`, plus `/api/v1/users/me` GET/PATCH for display name, preferred locale, and in-app/email/proposal/settlement/task reminder switches.
  - `/api/v1/session` now returns the same user settings summary; the dashboard Identity workspace renders a profile settings form before household management.
  - Updated OpenAPI, API docs, database design, technical design, backlog, i18n, and Playwright coverage for the profile/preference flow.
  - Verification passed: `prisma format`, `pnpm db:generate`, `jq empty`, `pnpm db:validate`, `git diff --check`, `pnpm typecheck`, `pnpm test` (7 files, 26 tests), targeted Playwright desktop/mobile for profile preferences, `pnpm format:check`, `pnpm lint`, and `pnpm build`.
  - Production Docker build completed on the local server, migration `20260705070000_add_notification_preferences` applied to `roompire_prod`, and `roompire-web-1` was recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated `/api/v1/users/me` returned default notification preferences.
  - Authenticated real-browser smoke temporarily updated the production profile, verified persistence through `/api/v1/users/me`, restored the original values, checked desktop/mobile horizontal overflow at `0`, and saved screenshots under `output/playwright/roompire-profile-settings-live-desktop.png` and `roompire-profile-settings-live-mobile.png`.
  - Post-deploy housekeeping reclaimed Docker build cache and refreshed ops status; production ended around 6.4GB free / 97% used with expected warnings for disk pressure, high Docker reclaimable storage, and disabled real offsite backup.
- 2026-07-05 Household clearing policy:
  - Added `Household.clearingPolicy` with `DIRECT_ONLY` default and `HOUSEHOLD_NETTING` opt-in, exposed it through household create/list/update/session serializers, OpenAPI, localized settings UI, and docs.
  - Settlement suggestions now distinguish `DIRECTLY_SETTLEABLE`, `CLEARING_SETTLEABLE`, and `GUIDANCE_ONLY`; clearing-settleable non-direct transfers are executable only when household netting is enabled.
  - Settlement creation/confirmation now supports `SettlementClearing`, revalidates the enabled clearing suggestion, and writes audited allocation rows across payer outgoing obligations plus payee incoming obligations.
  - Verification passed: `prisma format`, `pnpm db:generate`, `jq empty`, `pnpm db:validate`, `git diff --check`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm lint`, `pnpm build`, and targeted Playwright desktop/mobile coverage for household settings, household-netting clearing, direct suggested settlement, and the default guidance-only path.
  - Production Docker build completed on the local server, migration `20260705060000_add_household_clearing_policy` applied to `roompire_prod`, and `roompire-web-1` was recreated with `docker-compose.nginx.example.yml` preserving `127.0.0.1:18300->3000`.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated production API returned the smoke household with `clearingPolicy=HOUSEHOLD_NETTING`.
  - Authenticated real-browser smoke opened `https://roompire.aialra.online/en-US/app` and `/en-US/app/ledger`, verified the clearing policy select shows `Household netting`, checked desktop/mobile horizontal overflow at `0`, and saved screenshots under `output/playwright/roompire-clearing-policy-live-desktop.png`, `roompire-ledger-live-desktop.png`, and `roompire-clearing-policy-live-mobile.png`.
  - Post-deploy housekeeping reclaimed Docker build cache and refreshed ops status; production ended around 6.7GB free / 97% used with expected warnings for disk pressure, high Docker reclaimable storage, and disabled real offsite backup.
- 2026-07-05 Ops automation timer status:
  - Updated `scripts/collect_ops_status.sh` so host snapshots include `roompire-ops-status.timer`/service and `roompire-smoke.timer`/service state, result, exit code, and timestamps.
  - Extended `OpsStatusSnapshot`, `/api/v1/ops/status`, OpenAPI, localized ops UI, docs, and targeted Playwright fixture/assertions to expose snapshot-refresh and production-smoke automation health.
  - Verification passed: `bash -n`, `jq empty`, `git diff --check`, direct host snapshot generation to a temp JSON file, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and targeted Playwright desktop/mobile owner ops review plus viewer denial.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local server with the nginx override preserving `127.0.0.1:18300->3000`; Postgres and Redis stayed healthy and no migration was needed.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated `/api/v1/ops/status` returned `opsStatusTimer`, `opsStatusService`, `smokeTimer`, and `smokeService` all `ok`, latest smoke `passed`, and expected warnings `disk_high_usage`, `docker_reclaimable_high`, and `backup_offsite_disabled`.
  - Authenticated real-browser smoke opened `https://roompire.aialra.online/en-US/app/ops` on desktop and mobile, verified snapshot refresh `OK`, smoke timer `OK`, smoke `Passed`, and no horizontal overflow; screenshots saved to `output/playwright/roompire-ops-automation-live-desktop.png` and `output/playwright/roompire-ops-automation-live-mobile.png`.
  - Post-deploy housekeeping reclaimed about 1.767GB of Docker build cache and refreshed the ops snapshot; root disk ended around 7.3GB free / 97% used while Docker image/volume reclaimable warnings remain for future capacity policy review.
- 2026-07-05 Docker storage ops visibility:
  - Updated `scripts/collect_ops_status.sh` to parse `docker system df --format '{{json .}}'` into image, container, local-volume, and build-cache counts, size bytes, reclaimable bytes, and reclaimable percentages, with `ROOMPIRE_DOCKER_RECLAIMABLE_WARNING_BYTES` defaulting to 5GiB.
  - Extended `OpsStatusSnapshot`, `/api/v1/ops/status`, OpenAPI, localized ops UI, and Playwright fixtures to expose a Docker storage card and `docker_reclaimable_high` / `docker_storage_unknown` summary warnings.
  - Verification passed: `bash -n`, `jq empty`, `git diff --check`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, direct host snapshot generation to a temp JSON file, and targeted Playwright desktop/mobile owner ops review plus viewer denial.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local server with the nginx override preserving `127.0.0.1:18300->3000`; Postgres and Redis stayed healthy and no migration was needed.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated `/api/v1/ops/status` returned `dockerStorage.status=warning`, about 30.9GB total Docker reclaimable, latest smoke `passed`, and expected warnings `disk_low`, `disk_high_usage`, `docker_reclaimable_high`, and `backup_offsite_disabled`.
  - Authenticated real-browser smoke opened `https://roompire.aialra.online/en-US/app/ops` on desktop and mobile, verified the Docker storage card, reclaimable GB total, image active/total summary, smoke `Passed`, and no horizontal overflow; screenshot saved to `output/playwright/roompire-ops-docker-live.png`.
  - Post-deploy housekeeping reclaimed about 2.17GB of Docker build cache and refreshed the ops snapshot; root disk ended around 4.3GB free / 98% used while Docker image/volume reclaimable warnings remain for future capacity policy review.
- 2026-07-05 Offsite backup status:
  - Added `scripts/sync_backup_artifacts.sh` with `disabled`, `local`, and `rclone` modes. It copies only encrypted backup artifacts and `.sha256` sidecars, preserves relative backup paths, writes `ops/status/backup-offsite.json`, and refuses local targets inside the backup root.
  - Updated `scripts/backup_all.sh` to run the offsite sync/status step after backup retention, defaulting to a disabled status until a true off-host target is configured.
  - Updated `scripts/collect_ops_status.sh`, `OpsStatusSnapshot`, `/api/v1/ops/status`, OpenAPI, localized ops UI, and Playwright fixtures to expose `backupOffsite` mode, target, latest sync, copied artifact count/bytes, status, and errors without leaking credentials.
  - Updated `ops/systemd/roompire-backup.service` in the repo and the installed local server unit with explicit `ROOMPIRE_BACKUP_OFFSITE_MODE=disabled` and status-file environment lines; `systemctl daemon-reload` and `systemd-analyze verify` passed.
  - Verification passed: `bash -n`, `jq empty` for i18n JSON, `git diff --check`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, temporary local offsite-sync copy test, temporary ops-status collection test, `systemd-analyze verify`, and targeted Playwright desktop/mobile owner ops review plus viewer denial.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local server with the nginx override preserving `127.0.0.1:18300->3000`; Postgres and Redis stayed healthy and no migration was needed.
  - During deployment, a first `up -d web` without `docker-compose.nginx.example.yml` recreated web without the host port and caused a transient real-domain 502; rerunning the documented Compose command with the nginx override immediately restored `127.0.0.1:18300->3000`, and real-domain smoke then passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`.
  - Authenticated real-domain `/api/v1/ops/status` returned `backupOffsite.mode=disabled`, `backupOffsite.status=warning`, `latestSmoke.status=passed`, `backupEncryption.status=ok`, housekeeping timer/service `ok`, and expected warnings `disk_low`, `disk_high_usage`, and `backup_offsite_disabled`.
  - Authenticated real-browser smoke opened `https://roompire.aialra.online/en-US/app/ops` on desktop and mobile, verified the offsite warning, mode `Not configured`, smoke `Passed`, and no horizontal overflow; screenshot saved to `output/playwright/roompire-ops-offsite-live.png`.
  - Post-deploy housekeeping reclaimed about 1.8GB of Docker build cache and refreshed the ops snapshot; root disk ended around 4.4GB free / 98% used with expected disk-pressure warnings.
- 2026-07-05 Disk headroom auto-cleanup:
  - Added `ROOMPIRE_HOUSEKEEPING_CLEAN_REPO_ARTIFACTS=auto` and `ROOMPIRE_HOUSEKEEPING_REPO_ARTIFACT_MIN_AVAILABLE_BYTES` to `scripts/server_housekeeping.sh`.
  - Auto mode removes current-checkout `.next`, `.turbo`, Playwright report, and test-output directories only when root available bytes are below the configured threshold and no active Next/Playwright/Turbo/pnpm/Vitest/TypeScript process is detected.
  - Updated `ops/systemd/roompire-housekeeping.service` to use auto mode with a 6GiB threshold, installed the updated unit on the local self-hosted server, reloaded systemd, and manually started `roompire-housekeeping.service`; it exited with status 0.
  - `bash -n`, `systemd-analyze verify`, `pnpm format:check`, dry-run low-disk cleanup, and simulated active-process skip checks passed.
  - The manual housekeeping run detected low disk, cleaned current checkout artifacts, refreshed `ops/status/ops-status.json`, and raised root availability from about 4.0GB to about 4.8GiB while preserving Docker volumes, backups, and production containers.
  - Production Compose services remained healthy on `127.0.0.1:18300`; real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated `/api/v1/ops/status` returned housekeeping timer/service `ok`, latest smoke `passed`, and expected disk-pressure warnings.
- 2026-07-05 CI workflow hardening:
  - Updated `.github/workflows/ci.yml` and `.github/workflows/e2e.yml` to use pnpm `11.9.0`, include `ops/**` push triggers, add manual CI dispatch, set read-only workflow permissions, add job timeouts, generate the Prisma client before CI typecheck, and make the E2E Postgres health check explicit.
  - Added E2E push coverage for feature/fix/test/chore/ops branches with explicit `ROOMPIRE_E2E_PORT=3100` and `ROOMPIRE_E2E_WORKERS=1`.
  - Moved Playwright ops-status fixtures to `test-results/e2e-ops-status/ops-status.json` through `ROOMPIRE_OPS_STATUS_FILE`, preventing local E2E from overwriting the production `ops/status` bind mount used by the live web container.
  - Updated README/backlog/technical design wording so deployment docs describe the current self-hosted server with host nginx rather than a separate VPS.
  - Local CI-equivalent chain passed: `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; forced `pnpm typecheck --force` also passed after adding the CI Prisma generation step.
  - Targeted Playwright desktop/mobile ops test passed and proved host `ops/status/ops-status.json` stayed at the real host disk value while the test fixture contained the expected fake 42% disk data.
  - Full `pnpm e2e` passed after the isolation change: 28 browser tests across Chromium desktop and mobile in 7.8 minutes.
  - Real-domain smoke passed again for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; `collect_ops_status.sh` restored/refreshed the live host snapshot and authenticated `/api/v1/ops/status` returned `latestSmoke.status=passed` with disk-pressure warnings.
  - Remote GitHub Actions push runs succeeded after the Prisma generation fix: both `CI` and `E2E` completed with `success` on `chore/ci-workflow-hardening`.
- 2026-07-05 Housekeeping ops visibility:
  - Updated `scripts/collect_ops_status.sh` so host snapshots include `roompire-housekeeping.timer` active/enabled state, next/last run, and `roompire-housekeeping.service` result/exit/timestamps.
  - Extended `OpsStatusSnapshot`, `/api/v1/ops/status`, OpenAPI, localized ops UI, and targeted Playwright fixture/assertions to expose housekeeping health without web-request-time host commands.
  - Fixed the live ops card layout after screenshot review by using a 2-column desktop grid with 4 columns only on very wide screens and by truncating long metric values inside their cards.
  - `bash -n`, `git diff --check`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and targeted Playwright on Chromium desktop/mobile for owner ops review plus viewer denial all passed.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local self-hosted server behind host nginx at `127.0.0.1:18300`; Postgres and Redis stayed healthy and no migration was needed.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated `/api/v1/ops/status` returned `housekeepingTimer.status=ok`, `housekeepingService.status=ok`, `latestSmoke.status=passed`, and warnings only for `disk_high_usage`.
  - Authenticated real-browser smoke opened `https://roompire.aialra.online/en-US/app/ops`, verified housekeeping `OK`, smoke `Passed`, no card overlap or horizontal overflow at 1440px, and refreshed screenshot `output/playwright/roompire-ops-housekeeping-live.png`.
  - Conservative housekeeping reclaimed 2.566GB of Docker build cache after deployment; root disk ended around 5.4GB free / 98% used.
- 2026-07-05 Scheduled housekeeping:
  - Added category switches to `scripts/server_housekeeping.sh` so unattended runs can skip current checkout artifacts while still managing targeted `/tmp` leftovers, Docker prune, builder cache, journal vacuuming, optional uv cache cleanup, optional old browser-workspace artifacts, and ops-status refresh.
  - Added `ops/systemd/roompire-housekeeping.service` and `.timer`; the timer is daily with randomized delay and uses conservative cleanup defaults.
  - `bash -n` and `systemd-analyze verify` passed for the housekeeping script and units.
  - Installed the units on the local production server under `/etc/systemd/system`, enabled `roompire-housekeeping.timer`, and manually started `roompire-housekeeping.service`; the service exited with status 0.
  - `systemctl list-timers 'roompire*'` showed `roompire-ops-status.timer`, `roompire-smoke.timer`, `roompire-housekeeping.timer`, and `roompire-backup.timer`.
  - Housekeeping service logs confirmed current checkout artifacts were skipped, Docker prune and journald vacuum ran safely, and `collect_ops_status.sh` refreshed `ops/status/ops-status.json`.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; production web/Postgres/Redis remained healthy on the local server.
  - Root disk remained around 5.3GB free / 98% used because no reclaimable build cache or journal archives were available at that moment; ops still intentionally warns with `disk_high_usage`.
- 2026-07-05 File manifest backups:
  - Added `scripts/backup_file_manifest.sh`, which exports `File` rows from production Postgres into a JSON manifest with configured storage provider/bucket, object keys, filenames, MIME types, sizes, SHA-256 hashes, and summary counts.
  - Updated `scripts/backup_all.sh` so combined backups now include PostgreSQL, upload volume, and file manifest artifacts; encrypted runs produce `.json.enc` manifest files with `.sha256` sidecars and remove plaintext by default.
  - Updated `scripts/collect_ops_status.sh` so backup encryption health counts encrypted/plaintext file-manifest artifacts alongside PostgreSQL and upload-volume artifacts.
  - Temporary encrypted `backup_all.sh` drill passed: PostgreSQL restore drill succeeded, manifest decrypted and parsed, and no plaintext backup artifacts remained.
  - Production `backup_all.sh` ran on the local server with encryption enabled; it created `/srv/aialra/backups/roompire/file-manifests/roompire_file_manifest_20260705T001849Z.json.enc`, verified its sidecar, decrypted/parsed the manifest, and left no plaintext manifest/dump/tar artifacts.
  - Authenticated real-domain `/api/v1/ops/status` returned `backupEncryption.status=ok`, 10 encrypted artifacts, 0 plaintext artifacts, 0 missing sidecars, and latest encrypted artifact pointing at the new file manifest.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; no web container rebuild was needed because this slice changed host backup scripts and docs only.
- 2026-07-05 Backup encryption visibility:
  - Extended `collect_ops_status.sh` to read `roompire-backup.service` encryption configuration and scan `/srv/aialra/backups/roompire` for encrypted artifacts, plaintext leftovers, missing `.sha256` sidecars, passphrase-file presence, and latest encrypted artifact by backup timestamp.
  - Extended `OpsStatusSnapshot`, `/api/v1/ops/status`, OpenAPI, localized ops UI, and the targeted Playwright fixture to expose backup encryption health without printing or committing secret values.
  - `./scripts/collect_ops_status.sh` passed on the local production server and reported `configured=enabled`, passphrase file present, 7 encrypted artifacts, 0 plaintext artifacts, 0 missing sidecars, and encryption status `ok`.
  - `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `bash -n`, and `git diff --check` passed.
  - Targeted Playwright passed on Chromium desktop and mobile for owner ops-health review plus viewer denial, including encryption status `OK`, mode `Enabled`, and plaintext artifact count `0`.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local server behind host nginx at `127.0.0.1:18300`; Postgres and Redis remained healthy and no migration was needed.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated `/api/v1/ops/status` returned `backupEncryption.status=ok`, 7 encrypted artifacts, 0 plaintext artifacts, 0 missing sidecars, and warnings only for disk pressure.
  - Authenticated real-browser smoke opened `https://roompire.aialra.online/en-US/app/ops` and verified the new backup encryption rows on the live page.
  - Docker builder cache was pruned after deployment, reclaiming about 1.8GB; root disk ended around 5.4GB free / 98% used with expected `disk_high_usage`.
- 2026-07-05 Encrypted backup storage:
  - Added `scripts/encrypt_backup_file.sh` and `scripts/decrypt_backup_file.sh` with OpenSSL AES-256-CBC defaults, PBKDF2 iterations, SHA-256 digest, passphrase file/env support, and `.sha256` ciphertext sidecars.
  - Updated `backup_all.sh` to run the PostgreSQL restore drill before encryption, encrypt PostgreSQL/upload artifacts, remove plaintext artifacts by default, and retain encrypted artifacts and sidecars.
  - Updated `verify_postgres_backup.sh` and `restore_postgres.sh` so encrypted PostgreSQL dumps can be verified/restored directly through temporary decrypted files that are cleaned on exit.
  - Created the production backup passphrase file under `/srv/aialra/secrets/` on the local server with `0600` permissions; the secret value was not printed or committed.
  - Installed the updated `roompire-backup.service` on the local server; `systemd-analyze verify` passed, `roompire-backup.service` completed with status 0, and `roompire-backup.timer` remains active.
  - Existing plaintext production backup files under `/srv/aialra/backups/roompire` were encrypted in place and removed; a follow-up `find` confirmed no plaintext `.dump` or `.tar.gz` backup artifacts remained.
  - Verified the latest encrypted production PostgreSQL dump directly with `verify_postgres_backup.sh`; the temporary restore database passed migration and audit hash-chain checks.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`, then `collect_ops_status.sh` refreshed `ops/status/ops-status.json`.
  - Authenticated real-browser smoke opened `https://roompire.aialra.online/en-US/app/ops`, confirmed the host status file was loaded, backup timer was OK, latest smoke was Passed, and `/api/v1/ops/status` returned `source=host_status_file`.
  - `bash -n`, `git diff --check`, `pnpm format:check`, and `pnpm typecheck` passed; invalid `ROOMPIRE_BACKUP_REMOVE_PLAINTEXT` values fail before backup work starts.
- 2026-07-05 Automated ops refresh:
  - Added `ops/systemd/roompire-ops-status.service` and `.timer`; the timer refreshes host ops status every 15 minutes.
  - Added `ops/systemd/roompire-smoke.service` and `.timer`; the timer runs authenticated real-domain smoke checks hourly at minute 7, then refreshes the ops snapshot.
  - `systemd-analyze verify` passed for the new units and existing backup units using the live checkout path.
  - Installed the new units on the local production server under `/etc/systemd/system`, replacing the template `WorkingDirectory` with `/srv/aialra/apps/codexapp/state/browser-workspaces/2026-07-04-roompire`.
  - `systemctl enable --now roompire-ops-status.timer roompire-smoke.timer` passed; `systemctl list-timers 'roompire*'` showed `roompire-ops-status.timer`, `roompire-smoke.timer`, and `roompire-backup.timer`.
  - Manual `systemctl start roompire-ops-status.service` and `systemctl start roompire-smoke.service` passed; journald showed `ok ops/status/ops-status.json`, `ok /en-US`, `ok /api/v1/health`, and `ok /manifest.webmanifest`.
  - Authenticated `GET https://roompire.aialra.online/api/v1/ops/status` returned a systemd-refreshed snapshot with `latestSmoke.status=passed`, real-domain check HTTP 200s, and `warnings=["disk_high_usage"]`.
  - `pnpm format:check` passed.
- 2026-07-05 Server disk housekeeping:
  - Root disk was audited on the local production server; `docker system df` showed most image size belonged to active running workloads, while old Codex browser workspaces contained reclaimable generated artifacts.
  - Conservative cleanup removed old `/tmp` readlayer/playwright/codex-pack leftovers, `uv` package caches, excess journal archives, and generated artifacts from old non-Roompire browser workspaces (`node_modules`, `.next`, `.turbo`, Playwright output, and one old readlayer tmp sqlite copy); source directories, git history, Docker volumes, production backups, and running service data were preserved.
  - Root filesystem headroom improved from about 2GB free / 100% usage to about 6.5GB free / 97% usage after Docker build-cache pruning.
  - Added `scripts/server_housekeeping.sh`; `bash -n` passed and dry-run output showed the cleanup categories without deleting.
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 23 tests.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/[locale]/app/ops` and `/api/v1/ops/status` in the Next route manifest.
  - Targeted Playwright passed on Chromium desktop and mobile for owner ops-health review plus viewer denial.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local server with the nginx override preserving `127.0.0.1:18300->3000`; Postgres and Redis stayed healthy and no database migration was needed.
  - Real-domain smoke passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; authenticated `/api/v1/ops/status` returned `warnings=["disk_high_usage"]`, `availableBytes` around 6.9GB before final rounding, `usedPercent=97`, and `latestSmoke.status=passed`.
  - Authenticated Playwright browser smoke opened `https://roompire.aialra.online/en-US/app/ops`, verified the high-usage warning text, summary `Attention`, disk card around 6.4GB available, and smoke `Passed`.
- 2026-07-05 Ops health dashboard:
  - `bash -n scripts/collect_ops_status.sh scripts/smoke_production.sh` passed.
  - `./scripts/collect_ops_status.sh` passed on the local production server and generated ignored `ops/status/ops-status.json`; it reported root disk pressure at 99% usage.
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 23 tests, including the configured site-gate session-email helper.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/[locale]/app/ops` and `/api/v1/ops/status` in the Next route manifest.
  - Targeted Playwright passed on Chromium desktop and mobile for owner ops-health review plus viewer denial: owner loads the dashboard ops link, verifies status/disk/backup/smoke cards and `GET /api/v1/ops/status`, Dana viewer receives API 403 and the ops forbidden page.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local server with the nginx override preserving `127.0.0.1:18300->3000`; no database migration was needed.
  - Real-domain checks passed: `./scripts/smoke_production.sh` returned ok for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; unauthenticated `/api/v1/health` and `/api/v1/ops/status` returned 401; authenticated `/api/v1/ops/status` returned `source=host_status_file`, `summary=warning`, `warnings=["disk_low"]`, and `latestSmoke.status=passed`.
  - Authenticated Playwright browser smoke opened `https://roompire.aialra.online/en-US/app/ops`, verified the ops heading, disk/backup/smoke cards, summary `Attention`, and smoke `Passed`.
  - Docker builder cache was pruned after deployment, reclaiming about 1.8GB; root disk remained critically tight at about 2.3GB free.
- 2026-07-05 Owner transfer governance:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 22 tests, including the ownership-transfer RBAC helper.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/api/v1/households/[householdId]/members/[membershipId]/transfer-ownership` in the Next route manifest.
  - Targeted Playwright passed for owner transfer and self-removal guard on Chromium desktop and mobile: owner creates a household, invites a member, transfers ownership through the UI, verifies the previous owner becomes admin and the next member becomes owner, verifies the previous owner cannot transfer again, verifies the new owner cannot remove themself, then verifies the new owner can remove the previous admin.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local server with the nginx override preserving `127.0.0.1:18300->3000`; no database migration was needed.
  - Real-domain checks passed: `./scripts/smoke_production.sh` returned ok for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; unauthenticated `/api/v1/health` and `/en-US` returned 401; authenticated Playwright browser smoke opened `/en-US/app` and verified the members forbidden page for an inaccessible household.
  - Docker builder cache was pruned after deployment, reclaiming about 2.2GB; root disk remained tight at roughly 3.2GB free.
- 2026-07-04 Settlement suggestion actionability:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests, including settlement suggestion actionability expectations.
  - `pnpm lint` passed.
  - `pnpm build` passed with settlement suggestions, settlements, stats APIs, and `/[locale]/app/ledger` in the Next route manifest.
  - `bash -n scripts/e2e_prepare_db.sh` passed after adding Next dev-cache cleanup.
  - Targeted Playwright passed twice for the dashboard/stats/audit smoke path on Chromium desktop and mobile; the covered path creates a Bob -> Alice -> Chen obligation chain, verifies the Bob -> Chen CNY suggestion is `GUIDANCE_ONLY`, confirms no suggested-transfer settlement form is rendered for it, and verifies direct settlement submission returns `NO_SETTLEABLE_OBLIGATIONS`.
  - During verification, stale `.next/dev` route manifests caused stats API 404s after build/branch churn; `e2e_prepare_db.sh` now removes `apps/web/.next/dev` before starting the E2E dev server, and the rerun passed.
  - Production web image was rebuilt and `roompire-web-1` was recreated on the local server with the nginx override restoring `127.0.0.1:18300->3000`; Postgres/Redis were not restarted and no database migration was needed.
  - Real-domain checks passed: `./scripts/smoke_production.sh` returned ok for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`; unauthenticated `/api/v1/health` and `/en-US` returned 401; an authenticated Playwright browser smoke opened `https://roompire.aialra.online/en-US`, `/en-US/app/ledger`, and `/api/v1/session`.
  - Disk headroom was tight; generated repo caches were removed and the unused `roompire-migrator:latest` image was deleted before the production web rebuild.
- 2026-07-04 E2E database isolation:
  - `bash -n scripts/e2e_prepare_db.sh` passed.
  - `pnpm e2e:prepare` passed locally, reset `roompire_dev`, reapplied all 6 migrations, and seeded `USC 3B2B`.
  - Safety refusal passed: `DATABASE_URL=postgresql://roompire:roompire@localhost:5432/roompire_prod pnpm e2e:prepare` failed before touching the database.
  - Targeted Playwright passed on Chromium desktop and mobile for the dashboard/stats/audit smoke path; Playwright webServer output confirmed `e2e_prepare_db.sh` ran before Next dev server startup.
  - Re-running `pnpm e2e:prepare` after browser tests restored the seed baseline: 1 household, 4 users, 1 audit event, and 1 expense proposal.
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests.
  - `pnpm lint` passed.
  - `pnpm build` passed with the existing app/API route manifest.
- 2026-07-04 Production backup/restore drill:
  - `bash -n` passed for backup, restore, upload, combined backup, and verify scripts.
  - `systemd-analyze verify` passed for `ops/systemd/roompire-backup.service` and `ops/systemd/roompire-backup.timer`.
  - Production `BACKUP_ROOT=/srv/aialra/backups/roompire ./scripts/backup_all.sh` passed: PostgreSQL dump and upload-volume tarball were created outside the repo.
  - Non-destructive restore drill passed by restoring the PostgreSQL dump into a temporary production Postgres database and verifying Prisma migration metadata plus audit hash-chain status: 0 total audit events, 0 hashed, 0 broken.
  - `roompire-backup.service` was manually started through systemd and completed successfully; `roompire-backup.timer` is enabled on the server and the next scheduled run is 2026-07-05 06:31:09 CEST after randomized delay.
- 2026-07-04 Audit hash chain:
  - `pnpm db:migrate` passed locally and applied `20260704050000_add_audit_hash_chain`.
  - `pnpm db:generate` passed.
  - `pnpm db:validate` passed.
  - Local database hash verification passed: 4902 total audit events, 4902 hashed, 0 broken after migration backfill and seed.
  - `pnpm typecheck` passed.
  - `pnpm format:check` passed.
  - `pnpm test` passed: 6 test files, 21 tests.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/api/v1/households/[householdId]/audit-events` and `/[locale]/app/audit` in the Next route manifest.
  - Targeted Playwright passed for dashboard/stats/audit navigation on Chromium desktop and mobile, including audit API `chain.status=VERIFIED`, 64-character event hashes, and audit page hash-chain status rendering.
  - Production migration applied successfully on the local server through the Compose migrator; production DB currently has 0 audit events, so chain verification is 0 total, 0 hashed, 0 broken with the trigger installed for future events.
  - Production web image was rebuilt and redeployed behind host nginx; `roompire-web-1` is healthy, unauthenticated `/api/v1/health` returns 401, authenticated `/api/v1/health` and `/en-US/app` return 200, and `./scripts/smoke_production.sh` passed against the real domain.
  - Docker image build initially hit `ENOSPC` while exporting the migrator image; `docker builder prune -f` reclaimed 2.6GB and the migration/deploy completed afterward.
- 2026-07-04 Statistics date-window filters + live deployment:
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests.
  - `pnpm lint` passed.
  - `pnpm format:check` passed.
  - `pnpm build` passed with stats APIs, stats page, and event-expense API routes in the Next route manifest.
  - Targeted Playwright passed for dashboard/stats navigation on Chromium desktop and mobile, including date-window stats APIs, invalid date 400 validation, stats page filter form behavior, proposal trend rows, empty future-window handling, and clearing filters.
  - Production Compose build/start/migrate ran on the local server; `roompire-web-1` is healthy after binding Next to `0.0.0.0` for container health checks.
  - Final production web image was rebuilt after the date-validation patch and the real site was updated through the nginx Compose override.
  - Host nginx terminates HTTPS for `roompire.aialra.online` and proxies to `127.0.0.1:18300`; Let's Encrypt certificate issuance succeeded and the site gate is configured through ignored local production env only.
  - Real-domain checks passed: unauthenticated `/api/v1/health` returned 401, authenticated `/api/v1/health` returned 200, authenticated `/en-US/app` returned 200, and `./scripts/smoke_production.sh` passed for `/en-US`, `/api/v1/health`, and `/manifest.webmanifest`.
- 2026-07-04 Event-to-expense proposals:
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests.
  - `pnpm lint` passed.
  - `pnpm format:check` passed.
  - `pnpm build` passed with `/api/v1/households/[householdId]/calendar/events/[eventId]/create-expense-proposal` in the Next route manifest.
  - Targeted Playwright passed for calendar/task work on Chromium desktop and mobile, including creating linked pending proposals from an eligible bill-due event and from a completed assigned task, proposal/event links, event-expense idempotency replay/conflict, and no formal balance impact before debtor approval.
  - Full `pnpm e2e` was intentionally not rerun to keep disk headroom; project caches and Playwright artifacts were removed afterward, leaving roughly 4.7GB free.
  - Superseded by the live deployment entry above: the earlier rollout probe incorrectly treated this host as a separate VPS instead of the server itself.
- 2026-07-04 Audit filters:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/[locale]/app/audit` and `/api/v1/households/[householdId]/audit-events` in the Next route manifest.
  - Targeted Playwright passed for dashboard-to-stats/audit smoke on Chromium desktop and mobile, including filtered audit-events API queries and filtered audit page rendering for `export.created`/`Export`.
  - Full `pnpm e2e` was intentionally not rerun because the host filesystem still has roughly 615MB free; project caches were removed afterward.
  - Superseded by the live deployment entry above: the earlier rollout probe incorrectly treated this host as a separate VPS instead of the server itself.
- 2026-07-04 Household exports:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/api/v1/households/[householdId]/exports` and `/api/v1/households/[householdId]/exports/[exportId]` in the Next route manifest.
  - `docker compose --env-file .env.production.example -f docker-compose.prod.yml --profile migrate --profile seed config` passed with `ROOMPIRE_EXPORT_SIGNING_SECRET` wiring present.
  - Targeted Playwright passed for dashboard-to-stats/audit smoke on Chromium desktop and mobile, including export panel rendering, signed JSON audit export creation/download, and signed CSV expense proposal export creation/download.
  - Full `pnpm e2e` was intentionally not rerun because the host filesystem dropped below 1GB free after targeted verification; project caches were removed afterward.
  - Superseded by the live deployment entry above: the earlier rollout probe incorrectly treated this host as a separate VPS instead of the server itself.
- 2026-07-04 Household statistics:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/[locale]/app/stats` and `/api/v1/households/[householdId]/stats/{summary,categories,members}` in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:seed` passed and preserved the deterministic `USC 3B2B` household.
  - Targeted Playwright passed for dashboard-to-stats/audit smoke on Chromium desktop and mobile, including the three stats APIs and stats page rendering.
  - Full `pnpm e2e` was intentionally not rerun because the host filesystem still has roughly 1GB free and prior full-suite reruns hit `ENOSPC`; project caches were removed after the targeted run.
  - Superseded by the live deployment entry above: the earlier rollout probe incorrectly treated this host as a separate VPS instead of the server itself.
- 2026-07-04 Household audit log:
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/[locale]/app/audit` and `/api/v1/households/[householdId]/audit-events` in the Next route manifest.
  - `pnpm format:check` passed after formatting new audit files.
  - Targeted Playwright passed for dashboard-to-audit coverage on Chromium desktop and mobile, including the audit-events API and audit page rendering seeded `expense_proposal.seeded`.
  - Targeted Playwright passed for the two previously flaky full-suite paths after stabilizing the settings assertion and increasing the long financial-flow timeout: owner settings/invite and proposal approval/ledger on Chromium desktop and mobile.
  - A full `pnpm e2e` rerun reached the mobile half after all desktop tests passed, but the host ran out of disk space (`ENOSPC`) while Next/Turbopack and Playwright were writing artifacts; this is an environment capacity issue, not an app assertion failure. Generated caches were removed afterward.
- 2026-07-04 FX lock/cache:
  - `pnpm typecheck` passed.
  - `pnpm test` passed: 6 test files, 21 tests, including Frankfurter provider parsing/config tests.
  - `pnpm lint` passed.
  - `pnpm build` passed with `/api/v1/health` and proposal routes in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed and upserted the deterministic USD/CNY FX cache row for offline E2E.
  - `docker compose --env-file .env.production.example -f docker-compose.prod.yml --profile migrate --profile seed config` passed with `ROOMPIRE_FX_PROVIDER` wiring present.
  - Targeted Playwright passed for the owner proposal/approval/ledger flow on Chromium desktop and mobile, including cross-currency proposal creation without manual `fxRate` using the seeded `FxRate` cache.
  - `pnpm e2e` passed: 24 Playwright tests across Chromium desktop and mobile.
  - Superseded by the live deployment entry above: the earlier rollout probe incorrectly treated this host as a separate VPS instead of the server itself.
- 2026-07-04 Production object storage adapter:
  - `pnpm format:check` passed.
  - `pnpm typecheck` passed.
  - `pnpm lint` passed.
  - `pnpm test` passed: 5 test files, 18 tests, including storage config tests.
  - `pnpm build` passed with receipt upload/download routes in the Next route manifest.
  - `pnpm db:validate` passed.
  - `pnpm db:generate` passed.
  - `pnpm db:migrate` passed with no pending migrations.
  - `pnpm db:seed` passed.
  - `docker compose --env-file .env.production.example -f docker-compose.prod.yml --profile migrate --profile seed config` passed with S3/R2 environment wiring present.
  - `docker build -f apps/web/Dockerfile --target migrator -t roompire-migrator:storage-test .` passed and was removed afterward to reclaim disk.
  - Targeted Playwright passed for receipt upload/proposal submission/download on Chromium desktop and mobile after E2E config moved to port 3100 and one worker by default.
  - Manual browser reproduction passed against a local dev server on port 3101: presign returned 201, file PUT upload returned 200, proposal creation returned 201, the UI rendered submitted status, and a bad-size upload returned `FILE_SIZE_MISMATCH`.
  - `pnpm e2e` passed: 24 Playwright tests across Chromium desktop and mobile.
  - Full production web-image rebuild was not repeated in this slice because the host filesystem had limited free space after Docker dependency layer creation; the production migrator target verified frozen installs and Prisma wiring.
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
  - Superseded by the live deployment entry above: the earlier rollout probe correctly found broken host routing/TLS, later fixed directly on this server through nginx and Compose.
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
  - Superseded by the live deployment entry above: the earlier rollout probe correctly found broken host routing/TLS, later fixed directly on this server through nginx and Compose.
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
