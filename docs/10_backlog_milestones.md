# 10 — Backlog and Milestones

## Priority labels

- P0: required for MVP trust/safety.
- P1: required for usable MVP.
- P2: important but can follow MVP.
- P3: future enhancement.

## Epic 0 — Bootstrap

### P0 tasks

- Initialize monorepo.
- Add Next.js app.
- Add Tailwind and shadcn/ui.
- Add i18n skeleton.
- Add app shell.
- Add Prisma and Docker Compose.
- Add Playwright.
- Add CI.
- Add seed/test data.

## Epic 1 — Identity and household

### P0

- Auth/session.
- Household create/read/update.
- Membership model.
- Invite token flow.
- RBAC middleware.
- Household switcher.

### P1

- Member role management.
- Profile settings.
- Notification preferences.

Current implemented subset for identity/household: dev-session and site-gate-backed MVP auth, household create/read/update, membership directory, invite token/code acceptance, owner/admin role management and removal guards, explicit owner-only ownership transfer that demotes the previous owner to admin, and RBAC checks across household-scoped APIs. Profile settings, notification preferences, and long-term multi-user auth provider selection remain backlog items.

## Epic 2 — Expense proposals

### P0

- Category model and seed defaults.
- Expense proposal create form.
- Equal split.
- Exact split.
- Payer/debtor selection.
- Proposal submit.
- Approval inbox.
- Approve/reject share.
- Comments.
- Proposal detail timeline.

### P1

- Percentage split.
- Share-unit split.
- Receipt upload.
- Revision flow.
- Dispute state.

Current implemented subset across expense branches: category defaults, dashboard proposal creation, payer/debtor selection, equal/exact/percentage/share-unit split calculation with live preview, receipt upload/attachment with private signed download URLs on local disk or S3-compatible storage, proposal submission, debtor-only approve/reject/request-changes actions, disputed/rejected proposal revision/resubmit with supersedes links, proposal comments, proposal detail pages with split basis and a submitted/approval/change-request/comment timeline, ledger maturity for approved shares, task-generated pending proposals, and event-generated pending proposals. Richer audit/file timeline events remain backlog items.

## Epic 3 — FX

### P0

- FX provider interface.
- Historical rate cache.
- USD/CNY conversion.
- FX lock display.
- Manual fallback.
- FX tests.

Current implemented subset for FX: proposal/revision/task-expense creation locks same-currency rates as `1`, resolves cross-currency rates from cached `FxRate` rows, fetches and stores Frankfurter historical rates when configured and cache misses, preserves explicit manual `fxRate` fallback, stores provider/rate/rate date/locked timestamp on proposals, validates provider configuration in health checks, and covers provider parsing plus cached USD/CNY locking in browser E2E. Provider failover and manual-rate approval workflow remain backlog items.

### P1

- Provider failover.
- More currencies.
- Household FX policy settings.

## Epic 4 — Formal ledger

### P0

- Ledger transaction model.
- Debt obligation generation.
- Idempotent share maturity.
- Balance summary.
- Audit events.

### P1

- Settlement suggestions.
- Reversal/adjustment flow.
- Month close/lock.

Current implementation for settlement suggestions exposes optimized net transfers with explicit actionability. Direct debtor/payee/currency suggestions are `DIRECTLY_SETTLEABLE` and can be submitted by the debtor when enough matching open obligations exist. Fully netted suggestions that would require clearing through a third party are `GUIDANCE_ONLY` until a household clearing policy is designed.

## Epic 5 — Settlements

### P0

- Record settlement.
- Apply to obligation(s).
- Confirm/reject settlement if policy requires.
- Settlement history.

### P1

- Settlement suggestion optimizer.
- Payment method metadata.
- Settlement receipt/evidence.

## Epic 6 — Calendar and tasks

### P0

- Calendar shell.
- Month/list views.
- Create event.
- Create task.
- Assign task.
- Complete task.
- Link proposal/task/event.

Current implemented subset across calendar branches: calendar/task page shell, event list/create, event list/week/month views, task list/create, assignment at creation, task completion, task-to-calendar-event linking, repayment due events, finite recurrence, task-generated pending expense proposals linked back to the task and any linked task event, and event-generated pending expense proposals from bill/chore/group/recurring-expense events.

### P1

- Week/day views.
- Recurring task.
- Recurring bill template.
- Auto-generate proposal from recurring bill.
- Reminders.

## Epic 7 — Audit and statistics

### P0

- Audit event table.
- Audit timeline for proposal.
- Basic household audit list.
- Basic dashboard stats.

Current implemented subset for audit/statistics: mutation flows emit `AuditEvent` rows, proposal detail renders a proposal-scoped timeline, dashboard shows basic operational stats plus an audit preview, the localized audit page/API expose household audit events with actor/action/entity/time, before/after/metadata JSON, tamper-evident hash-chain fields/status, and filters for action, actor, entity type/id, date window, and limit, the localized statistics page/API expose household summary, category, and member totals with date-window filters plus daily proposal trend rows, and active members can create signed CSV/JSON downloads for proposals, ledger obligations, settlements, audit events, and members.

### P1

- Audit hash chaining.

## Epic 8 — PWA and deployment

### P0

- Web manifest.
- Safe shell caching.
- Docker production setup.
- `.env.example`.
- Backup script.
- Restore script/drill.

Current implemented subset for deployment: production Docker Compose with Postgres, Redis, standalone Next.js web image, optional Caddy reverse proxy profile, host-nginx localhost binding for the live self-hosted server, migration and demo-seed profiles, authenticated `/api/v1/health`, S3-compatible private receipt storage wiring, production environment template, backup/restore scripts, upload-volume backup script, smoke-test script, encrypted backup/restore drills, ops health snapshots, scheduled housekeeping, and real-domain smoke tests against `roompire.aialra.online`. Remaining deployment hardening is capacity planning, off-host backup copy/passphrase escrow, and eventual long-term auth provider selection.

### P1

- Web Push.
- Cloudflare deployment guide.
- Monitoring/error tracking.

## Epic 9 — Future clients/features

### P2/P3

- WeChat Mini Program.
- Capacitor mobile wrapper.
- Tauri desktop wrapper.
- OCR receipt parsing.
- AI categorization.
- Advanced reimbursement workflows.

## Suggested first 10 implementation PRs

1. `chore/bootstrap-monorepo`: pnpm/Turbo/Next.js/CI.
2. `feat/design-shell`: shadcn app shell, responsive nav, i18n switcher.
3. `feat/db-foundation`: Prisma schema, migrations, Docker Compose, seeds.
4. `feat/auth-household`: auth, household, membership, RBAC.
5. `feat/expense-proposals`: create/list/detail proposal without ledger.
6. `feat/approval-flow`: approval/rejection/comment state machine.
7. `feat/fx-lock`: FX lookup/cache/lock and UI explanation.
8. `feat/ledger-balances`: formal obligations and who-owes-whom.
9. `feat/settlements`: record/confirm settlements.
10. `feat/calendar-tasks`: calendar/task shell and linked events.
