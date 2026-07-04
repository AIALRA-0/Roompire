# 00 — Context and Product Decisions

## Problem

Roommates often share many small and large obligations: rent, utilities, groceries, household supplies, furniture, cleaning, repairs, social events, chores, recurring tasks, and repayment deadlines. Normal split-bill apps are good at quick expense entry but weak at consent, disputes, auditability, recurring operations, bilingual UX, and integration with a real task/calendar workflow.

Roompire solves this as a shared-house operating system.

## Target context

- USC / Los Angeles student roommate groups.
- 3B2B or similar shared apartments.
- Mixed English/Chinese users.
- Payments may happen in USD, RMB, Venmo, Zelle, WeChat, Alipay, cash, or manual transfer.
- Users need trust, traceability, and simple daily usage.

## Hard requirements from human owner

1. All expenses can be categorized.
2. Expenses can be assigned to one or multiple users.
3. Real-time/historical FX conversion: USD debt on the recorded date should convert to RMB using that date's rate when the household uses RMB settlement.
4. The system must record who owes whom.
5. Both recording party/creditor and debtor must agree before formal debt is written into the ledger.
6. Everything must be categorized, traceable, auditable, and statistically analyzable.
7. UI must support at least Chinese and English.
8. There must be a Google Calendar-like task board/calendar.
9. Calendar/tasks must link to expenses, due dates, repayment dates, recurring bills, fixed tasks, and assignees.
10. Multi-device usage must be easy: mobile, desktop, web, PWA, and future app/Mini Program.
11. Stable backup and recovery are mandatory.
12. Agent development must use GitHub version control and real webpage testing.

## Selected solution

**Self-developed PWA-first Roompire system.**

Existing mature applications can inspire flows and components, but they do not meet the combined hard requirements: approval-gated formal ledger, locked historical FX, deep calendar-task-ledger linkage, bilingual-first UX, full auditability, and self-hostability.

## Core architectural decision

Separate the system into two layers:

1. **Proposal layer**: submitted expenses, shares, attachments, approvals, disputes.
2. **Formal ledger layer**: approved obligations, settlements, reversals, adjustments, immutable audit events.

A proposal can exist in the database before approval, but it must not affect formal balances. This reconciles the user's wording "both sides agree before written to database" with the technical need to persist pending proposals for review.

## FX policy decision

Default FX policy is `LOCK_AT_EXPENSE_DATE`.

- Store original currency and amount.
- Store household settlement currency and converted amount.
- Store rate, rate date, provider, and lock timestamp.
- Do not recalculate historical debts using repayment-date rates.
- If repayment currency differs, record a separate settlement conversion event.

Optional policies may be added later:

- `ORIGINAL_CURRENCY_DEBT`
- `MANUAL_RATE_WITH_APPROVAL`
- `FX_DIFFERENCE_ADJUSTMENT`

## Product principle

Roompire should feel like:

- Splitwise-level bill splitting speed.
- Notion/Linear-level clarity and structure.
- Google Calendar-like task visibility.
- Accounting-lite auditability without making roommates feel like accountants.
