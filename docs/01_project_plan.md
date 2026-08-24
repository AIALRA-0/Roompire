# 01 — Project Plan

## Mission

Build Roompire, a PWA-first roommate operations system with approval-gated expense ledger, locked historical FX, calendar/task integration, bilingual UI, auditability, and reliable backups.

## Success definition

MVP is successful when a roommate group can:

1. Create a household.
2. Invite members.
3. Submit an expense with category, payers, debtors, split method, receipt, and currency.
4. Lock expense-date FX conversion.
5. Have required parties approve/reject shares.
6. Generate formal debts only for approved shares.
7. View who owes whom.
8. Record settlements.
9. See due dates, recurring bills, chores, and group activities on a calendar.
10. Use the app comfortably on mobile and desktop.
11. Switch between Chinese and English.
12. Restore data from backup in a tested recovery drill.

## Phases

### Phase 0 — Repository bootstrap and project skeleton

**Goal:** establish a professional baseline.

Deliverables:

- Clone/create GitHub repo from `https://github.com/AIALRA-0/Roompire.git`.
- Add docs from this package.
- Initialize pnpm workspace + Turbo.
- Create Next.js App Router app with TypeScript.
- Add Tailwind CSS and shadcn/ui.
- Add Prisma + PostgreSQL local Docker Compose.
- Add Playwright, Vitest, Testing Library, ESLint, Prettier.
- Add GitHub Actions CI.
- Add `.env.example`.
- Add initial landing page at `/` and app shell at `/app`.

Exit criteria:

- `pnpm install` works.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm e2e` all run.
- Playwright opens the real web app and validates landing/app shell in desktop and mobile viewports.
- CI runs on GitHub.

### Phase 1 — Identity, household, membership, RBAC

Deliverables:

- Auth foundation: email magic link or dev-password mode for MVP; Google OAuth optional.
- User profile.
- Household creation.
- Member invitation with expiring invite token.
- Roles: owner, admin, member, viewer.
- Household settings: locale, settlement currency, timezone, FX policy, approval policy.
- Member list UI and permission checks.

Exit criteria:

- Real web flow: create account, create household, invite member, accept invite, view dashboard.
- Unauthorized users cannot access household data.
- RBAC tested in API and Playwright.

### Phase 2 — Expense proposal workflow

Deliverables:

- Expense proposal create/edit screen.
- Categories and tags.
- Multiple payers and debtors.
- Split methods: equal, exact, percentage, shares.
- Receipt upload placeholder or real object storage integration.
- Pending proposal detail page.
- Approval/rejection/comment flow.
- Audit event emission for every state transition.

Exit criteria:

- Proposal does not change formal balance before approval.
- Debtor can approve/reject own share.
- Payer/creditor can confirm submitted amount.
- Partial approval behavior works.
- E2E tests cover create proposal, approve, reject, and edit/re-submit flows.

### Phase 3 — FX lock and formal ledger

Deliverables:

- FX provider abstraction.
- Historical FX lookup and cache.
- Manual fallback with approval.
- Formal ledger transaction generation for approved shares.
- Debt obligations and balance summaries.
- Settlement suggestion algorithm.
- Settlement record flow.
- Reversal/adjustment flow.

Exit criteria:

- USD expense can lock CNY debt using expense date.
- Later FX changes do not alter original ledger debt.
- Approved shares become ledger obligations; rejected/pending shares do not.
- Settlement reduces obligations and appears in audit log.
- Ledger invariants tested with unit, integration, and E2E tests.

### Phase 4 — Calendar, recurring bills, tasks

Deliverables:

- Calendar views: month, week, day/list.
- Task board: list/kanban/calendar modes.
- Recurrence rules for chores and bills.
- Expense due date and repayment date events.
- Recurring expense templates that generate proposals.
- Event-to-expense and task-to-expense linking.
- Notifications foundation.

Exit criteria:

- Real browser user can create chore, recurring bill, and group activity.
- A recurring bill generates a pending expense proposal at the right time.
- Approved expense generates repayment deadline event.
- Mobile calendar is usable.

### Phase 5 — Statistics, audit, export, admin

Deliverables:

- Statistics by person, category, date range, currency, status.
- Audit timeline per expense, member, household, ledger transaction.
- CSV/JSON export.
- Household lock-month/finalize-month behavior.
- Admin controls and data retention settings.

Exit criteria:

- Owner can inspect full audit timeline.
- Member can inspect own obligations and approvals.
- Export is deterministic and documented.
- Locked months can only be corrected by adjustment/reversal.

### Phase 6 — PWA hardening and mobile UX

Deliverables:

- Web app manifest.
- Service worker strategy for safe shell caching.
- Install prompts.
- Offline/poor-network states.
- Push notification groundwork.
- Responsive polishing for phone/tablet/desktop.

Exit criteria:

- Installable PWA works on Chrome desktop and mobile browser.
- Mobile viewport Playwright tests pass for primary flows.
- Offline mode does not corrupt financial data.

### Phase 7 — Deployment, backup, recovery

Deliverables:

- Docker production deployment.
- Cloudflare DNS/domain configuration notes.
- HTTPS reverse proxy config.
- PostgreSQL backup scripts.
- WAL/PITR or managed equivalent strategy.
- Object storage backup/versioning strategy.
- Restore drill documentation.
- Monitoring/logging foundation.

Exit criteria:

- Staging deployment accessible.
- Production domain remains private; public documentation uses `roompire.example.invalid`.
- Backup and restore drill succeeds.
- No secrets committed.

### Phase 8 — Optional clients and enhancements

Possible work:

- WeChat Mini Program via shared API.
- Capacitor iOS/Android wrappers.
- Tauri desktop wrapper.
- OCR receipt parsing.
- AI categorization.
- Venmo/Zelle/WeChat payment reference tracking without storing sensitive payment credentials.

## Milestone cadence

Each milestone should produce:

- One or more small commits.
- Updated docs if design changes.
- Updated `PROJECT_MEMORY.md`.
- Passing automated tests.
- Real webpage screenshots/traces or Playwright artifacts when useful.
- Pushed branch or PR on GitHub.

## Risk register

| Risk                              | Impact                   | Mitigation                                                                         |
| --------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Ledger complexity grows too early | Slows MVP                | Keep MVP ledger narrow: proposals, approvals, obligations, settlements, reversals. |
| FX source unavailable             | Users blocked            | Cache rates, support manual rate with approval, background retry.                  |
| Users ignore approvals            | Pending debt accumulates | Add reminders, partial maturity, overdue approval states.                          |
| UI becomes accounting-heavy       | Poor adoption            | Use plain language, visual debt graph, clean defaults.                             |
| E2E test flakiness                | Slow development         | Use stable selectors, seed data, deterministic clocks where possible.              |
| Backup untested                   | False security           | Require restore drill before production use.                                       |
