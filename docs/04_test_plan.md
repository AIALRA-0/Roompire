# 04 — Test Plan

## Testing philosophy

Roompire handles money-like obligations and shared-house trust. Tests must prove behavior through the actual product surface, not only through internal functions.

The highest-priority rule:

> A user-facing feature is not complete until it is validated by real browser interaction tests.

API and unit tests are necessary but insufficient.

## Test layers

### 1. Unit tests

Tooling: Vitest.

Targets:

- split calculation
- decimal rounding
- FX lock selection
- approval state machine
- ledger idempotency checks
- settlement minimization algorithm
- recurrence expansion helpers
- permission helpers
- i18n key coverage

### 2. Integration tests

Targets:

- database transactions
- Prisma repositories
- API route handlers
- auth middleware
- object storage mock/integration
- queue jobs
- FX provider fallback/cache

### 3. E2E real browser tests

Tooling: Playwright.

Required browsers/viewports:

- Chromium desktop
- Chromium mobile viewport
- Optional: Firefox/WebKit smoke runs for critical flows

E2E must interact with the real webpage using accessible selectors and stable `data-testid` only where necessary.

### 4. Accessibility tests

- Basic axe checks on primary pages.
- Keyboard navigation for dialogs, command menus, forms, tables, and calendar controls.
- Visible focus states.

### 5. Visual/regression checks

- Playwright screenshots for critical states where useful.
- Avoid overfitting snapshots early.

### 6. Backup/restore tests

- Automated or documented restore drill.
- Verify restored database preserves ledger/audit invariants.

## Required E2E flows

### Auth and household

- User signs in.
- Creates household.
- Invites another member.
- Member accepts invite.
- Viewer cannot create expense.
- Member cannot access another household by URL guessing.

### Expense proposal happy path

1. Payer creates USD expense.
2. Selects category.
3. Assigns debtor(s).
4. Chooses split method.
5. Uploads or attaches receipt mock.
6. System locks FX rate by expense date.
7. Debtor sees pending approval.
8. Debtor approves share.
9. Payer confirmation exists.
10. Formal ledger obligation appears.
11. Dashboard shows updated who-owes-whom.

### Expense proposal rejection path

1. Debtor rejects share with reason.
2. No formal obligation is created.
3. Payer sees dispute/rejection.
4. Payer revises and resubmits.
5. Audit timeline shows original submission, rejection, revision, resubmission.

### Partial approval path

1. Proposal has B, C, D.
2. B approves.
3. C rejects.
4. D pending.
5. Only B share matures if partial maturity enabled.
6. C/D do not affect formal balance.

### FX lock path

1. Create USD expense on historical date.
2. Confirm locked CNY amount.
3. Change mocked FX provider rate.
4. Reload dashboard.
5. Existing obligation remains unchanged.
6. New expense uses new applicable rate.

### Settlement path

1. Debtor records repayment.
2. Creditor confirms if required.
3. Balance decreases.
4. Settlement appears in ledger and calendar/history.

### Calendar/task path

1. Create recurring chore.
2. Assign member.
3. Calendar shows event.
4. Complete task.
5. Create reimbursement proposal from task.
6. Linked records show both task and expense relationship.

### Recurring bill path

1. Create monthly internet bill template.
2. Worker or manual generation creates upcoming bill event/proposal.
3. Proposal follows approval workflow.

### Responsive/mobile path

- Create proposal on mobile viewport.
- Approve share on mobile viewport.
- Use calendar on mobile viewport.
- Navigation remains accessible.

### i18n path

- Switch to zh-CN.
- Core navigation, statuses, form labels, validation messages show Chinese.
- Switch to en-US.
- Same pages show English.

## Ledger invariant tests

Every implementation phase touching ledger must test:

- Pending proposal has no balance effect.
- Rejected share has no balance effect.
- Approved share creates exactly one obligation.
- Duplicate approval/maturity request is idempotent.
- Settlement cannot overpay beyond allowed tolerance unless explicit credit balance is supported.
- Reversal references original transaction.
- Locked month cannot be edited directly.
- Ledger amounts use decimal arithmetic.

## Test data strategy

Use deterministic seeded households:

- Household A: Alice owner, Bob member, Chen member, Dana viewer.
- Currencies: USD and CNY.
- Timezone: America/Los_Angeles.
- Settlement currency: CNY for FX tests.
- Date fixtures use fixed clock where possible.

## CI test matrix

Minimum on every PR/branch push:

- install
- lint
- typecheck
- unit tests
- build
- database migration check
- Playwright smoke E2E

Nightly or manual:

- full Playwright suite
- accessibility checks
- backup restore drill
- dependency audit

## Definition of Done for features

A feature is done only when:

- Unit tests cover core logic.
- Integration tests cover database/API where relevant.
- Playwright covers real user flow.
- Mobile viewport coverage exists for user-facing flows.
- i18n keys exist.
- Audit behavior is tested if mutation is financial/task-critical.
- Docs and `PROJECT_MEMORY.md` are updated.

## Anti-patterns

- Do not mark done with only `curl` or Postman/API tests.
- Do not rely on mocked UI states without checking the actual browser.
- Do not skip mobile checks for forms/dialogs.
- Do not hard-code current dates in tests without a controlled clock.
- Do not use floating point for expected money values.
