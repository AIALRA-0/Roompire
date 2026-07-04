# 02 — Product Requirements Document

## Product name

Roompire

## Product summary

Roompire is a bilingual PWA-first shared-house system that helps roommates manage expenses, approvals, debts, settlements, recurring bills, chores, household tasks, and group calendar events with auditability and historical FX correctness.

## Users and personas

### Household owner/admin

- Creates household.
- Invites members.
- Sets currency, timezone, approval rules, categories, and permissions.
- Reviews audit logs and statistics.
- Manages backups/deployment when self-hosting.

### Payer / recording party

- Pays for something on behalf of the household.
- Submits expense proposal with receipt and split rules.
- Needs debtor approval before formal debt is created.
- Tracks who owes them what.

### Debtor / participant

- Reviews assigned expenses.
- Approves, rejects, or comments on their share.
- Sees due dates, repayment amounts, and settlement options.
- Needs transparency into how amount was calculated.

### Task owner

- Completes chores, fixed tasks, or event responsibilities.
- May link task completion to expense reimbursement.

### Viewer

- Can view shared information but cannot create/approve financial obligations.

## Core user stories

### Expense proposal

- As a payer, I can record a USD grocery purchase, assign it to selected roommates, attach receipt, choose equal split, and submit it for approval.
- As a debtor, I can see my exact share in both original currency and household settlement currency.
- As a debtor, I can approve my assigned share, reject it, or ask for clarification.
- As a payer, I can revise a rejected proposal and resubmit without deleting the history.
- As a household member, I can see pending, approved, rejected, disputed, settled, and reversed states.

### FX

- As a household admin, I can choose a household settlement currency, e.g. CNY.
- As a payer, when I enter a USD expense dated July 1, the system locks the USD/CNY rate for July 1.
- As a debtor, I can see rate date, provider, original currency, conversion, and locked amount.
- As a household, later exchange-rate changes do not mutate old formal debts.

### Ledger and settlement

- As a member, I can see who owes whom.
- As a debtor, I can record a repayment to a creditor.
- As a creditor, I can approve/confirm repayment if household policy requires it.
- As a member, I can view settlement suggestions that minimize number of transfers.
- As an admin, I can close a month and prevent direct edits to formal ledger entries.

### Calendar and tasks

- As a household member, I can view a calendar like Google Calendar with bills, repayment deadlines, chores, fixed tasks, and group events.
- As an admin/member, I can create recurring tasks such as weekly bathroom cleaning.
- As an admin/member, I can create recurring expenses such as rent or internet bill.
- As a task assignee, I can complete a task, add evidence, and create an expense proposal if reimbursement is needed.
- As a member, I can filter calendar by person, category, event type, and status.

### Audit and stats

- As an admin, I can trace every state change of an expense from creation through approval and settlement.
- As a member, I can see how much I spent/owed/paid by month/category/member.
- As a member, I can export my data.

### Internationalization

- As a user, I can switch between Simplified Chinese and English.
- Amounts, dates, numbers, statuses, categories, and validation messages are localized.

## Functional requirements

### FR-1 Household and membership

- Create household.
- Invite via expiring link/code.
- Roles: owner, admin, member, viewer.
- Per-household settings:
  - default locale
  - timezone
  - settlement currency
  - FX policy
  - approval policy
  - default due days
  - categories

### FR-2 Expense proposal

Fields:

- title
- description
- category
- tags
- merchant
- expense date
- due date
- original amount
- original currency
- settlement currency
- payer(s)
- debtor/participants
- split method
- share details
- receipt attachments
- linked calendar event/task
- comments

States:

- `DRAFT`
- `SUBMITTED`
- `PARTIALLY_APPROVED`
- `APPROVED`
- `REJECTED`
- `DISPUTED`
- `CANCELLED`
- `MATURED_TO_LEDGER`
- `PARTIALLY_MATURED`

### FR-3 Approval rules

- Payer/creditor confirmation required.
- Each debtor confirms own share.
- Approved share can mature independently if household setting allows partial maturity.
- Rejection requires reason/comment.
- All approval decisions are audited.

### FR-4 FX

- Fetch current and historical rates.
- Cache FX rates.
- Lock rate on proposal submission or approval depending on policy; default lock at proposal submission based on expense date.
- Store provider and timestamp.
- Support manual rate fallback with approval.
- Do not recalculate formal ledger entries when rates change.

### FR-5 Formal ledger

- Generate formal obligations only for approved shares.
- Store original and settlement currency amounts.
- Support settlements, reversals, adjustments.
- No physical delete of ledger entries.
- Balance summary derived from formal ledger only.

### FR-6 Calendar and tasks

- Month, week, day/list views.
- Event types:
  - chore
  - fixed task
  - group activity
  - bill due
  - repayment due
  - settlement reminder
  - recurring expense generation
- Assign one or multiple users.
- Recurrence rules.
- Event links to expenses/tasks/settlements.
- Drag/drop may be Phase 2 but should be designed for.

### FR-7 Notifications

MVP:

- In-app notification center.
- Email optional if auth provider supports.

Later:

- Web Push.
- WeChat subscription messages.

Notification events:

- proposal assigned
- approval needed
- rejection/comment
- due date approaching
- repayment overdue
- recurring task assigned
- task overdue

### FR-8 Search/statistics/export

- Search expenses by title, category, member, date, amount, status.
- Stats by category, member, month, currency.
- Export CSV/JSON for expenses, ledger, settlements, audit logs.

## Non-functional requirements

### Usability

- Primary flows must complete in under 60 seconds on phone.
- Common expense entry should require minimal typing.
- Clear empty states and next actions.
- Mobile-first detail screens; desktop uses denser tables.

### Security

- Household-scoped authorization on every query.
- Role checks on every mutation.
- Private attachments.
- Secrets never committed.
- Audit events immutable from app layer.

### Reliability

- PostgreSQL backups.
- Object storage backups/versioning.
- Restore drill before production.
- Migration rollback plan.

### Performance

- Dashboard p95 load under 2 seconds on normal connection after auth.
- List pages paginated.
- Search indexed.
- Background jobs for recurring generation and notifications.

### Accessibility

- Keyboard navigable.
- Visible focus states.
- Proper labels and ARIA where needed.
- Color is not the only status indicator.

### Localization

- zh-CN and en-US at MVP.
- No hard-coded user-facing strings in components.

## MVP scope

Included:

- Auth/dev auth, household, membership.
- Expense proposals, approvals, locked FX, ledger, settlement.
- Calendar/task basics.
- Audit logs.
- Stats basics.
- PWA shell.
- Tests and backup scripts.

Excluded initially:

- Bank import.
- Real payment processing.
- OCR receipt parsing.
- AI categorization.
- Full WeChat Mini Program.
- Native app store releases.

## Acceptance criteria summary

- Pending proposal has zero effect on formal balance.
- Approved share creates formal obligation exactly once.
- Rejected/pending share never creates obligation.
- FX lock persists unchanged after rate update.
- User can complete primary expense and task flows from mobile viewport.
- Every major mutation generates audit event.
- UI passes bilingual smoke tests.
