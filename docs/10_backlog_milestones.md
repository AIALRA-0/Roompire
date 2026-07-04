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

## Epic 3 — FX

### P0

- FX provider interface.
- Historical rate cache.
- USD/CNY conversion.
- FX lock display.
- Manual fallback.
- FX tests.

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

Current implemented subset across calendar branches: calendar/task page shell, event list/create, event list/week/month views, task list/create, assignment at creation, task completion, task-to-calendar-event linking, repayment due events, and finite recurrence. Proposal/task/expense linking and task-generated reimbursement proposals remain backlog items.

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

### P1

- Category stats.
- Member stats.
- CSV/JSON export.
- Advanced filters.

## Epic 8 — PWA and deployment

### P0

- Web manifest.
- Safe shell caching.
- Docker production setup.
- `.env.example`.
- Backup script.
- Restore script/drill.

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
