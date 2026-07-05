# 05 — Database Design

## Database

PostgreSQL.

## Principles

- Formal ledger is append-only.
- Proposal records can be edited only through versioned revisions or audited updates.
- Audit events are append-only.
- Money uses decimal numeric fields.
- Every household-scoped table contains `household_id` unless globally scoped.
- Soft-delete for user-facing records; no physical deletion of financial history.
- Derived balances can be cached but must be rebuildable from formal ledger tables.

## Naming conventions

- Tables: snake_case plural.
- Primary key: `id` UUID.
- Foreign keys: `<entity>_id`.
- Timestamps: `created_at`, `updated_at`, `deleted_at` where applicable.
- Audit timestamp: `occurred_at`.

## Core enums

### Role

- `OWNER`
- `ADMIN`
- `MEMBER`
- `VIEWER`

### ExpenseProposalStatus

- `DRAFT`
- `SUBMITTED`
- `PARTIALLY_APPROVED`
- `APPROVED`
- `PARTIALLY_MATURED`
- `MATURED_TO_LEDGER`
- `REJECTED`
- `DISPUTED`
- `CANCELLED`

### ShareStatus

- `PENDING`
- `APPROVED`
- `REJECTED`
- `DISPUTED`
- `MATURED_TO_LEDGER`

### ApprovalDecision

- `APPROVED`
- `REJECTED`
- `REQUEST_CHANGES`

### FxPolicy

- `LOCK_AT_EXPENSE_DATE`
- `ORIGINAL_CURRENCY_DEBT`
- `MANUAL_RATE_WITH_APPROVAL`
- `FX_DIFFERENCE_ADJUSTMENT`

### SplitMethod

- `EQUAL`
- `EXACT`
- `PERCENTAGE`
- `SHARES`
- `ADJUSTMENT`

### LedgerTransactionType

- `DEBT_CREATED`
- `SETTLEMENT_RECORDED`
- `REVERSAL`
- `ADJUSTMENT`
- `FX_ADJUSTMENT`

### CalendarEventType

- `TASK`
- `CHORE`
- `GROUP_ACTIVITY`
- `BILL_DUE`
- `REPAYMENT_DUE`
- `SETTLEMENT_REMINDER`
- `RECURRING_EXPENSE_GENERATION`

## Tables

### users

Purpose: global user identity.

Fields:

- `id`
- `email`
- `display_name`
- `avatar_url`
- `preferred_locale`
- `created_at`
- `updated_at`
- `deleted_at`

Constraints:

- unique lowercased email.

### households

Fields:

- `id`
- `name`
- `slug`
- `default_locale`
- `timezone`
- `settlement_currency`
- `fx_policy`
- `approval_policy`
- `created_by_user_id`
- `created_at`
- `updated_at`

### household_memberships

Fields:

- `id`
- `household_id`
- `user_id`
- `role`
- `display_name_override`
- `status` active/invited/removed
- `joined_at`
- `created_at`
- `updated_at`

Constraints:

- unique `(household_id, user_id)`.

### household_invites

Fields:

- `id`
- `household_id`
- `email_nullable`
- `token_hash`
- `role`
- `expires_at`
- `accepted_at`
- `created_by_user_id`
- `created_at`

### expense_categories

Fields:

- `id`
- `household_id` nullable for system defaults
- `key`
- `name_en`
- `name_zh_cn`
- `icon`
- `color_token`
- `sort_order`
- `is_active`

Examples:

- rent
- utilities
- groceries
- household_supplies
- furniture
- cleaning
- repair
- internet
- parking
- social
- other

### tags

Fields:

- `id`
- `household_id`
- `name`
- `color_token`

### expense_proposals

Fields:

- `id`
- `household_id`
- `created_by_user_id`
- `title`
- `description`
- `merchant`
- `category_id`
- `expense_date`
- `due_date`
- `original_amount numeric(20,6)`
- `original_currency char(3)`
- `settlement_currency char(3)`
- `settlement_amount numeric(20,6)`
- `split_method`
- `fx_policy`
- `fx_rate numeric(24,12)` nullable
- `fx_rate_date date` nullable
- `fx_provider` nullable
- `fx_locked_at` nullable
- `status`
- `revision_number`
- `supersedes_proposal_id` nullable
- `created_at`
- `updated_at`
- `cancelled_at`

Important:

- `settlement_amount` is locked proposal conversion under default FX policy.
- Editing after submission should create a new revision or audited update depending on phase.

### expense_payers

Fields:

- `id`
- `proposal_id`
- `user_id`
- `amount_original numeric(20,6)`
- `amount_settlement numeric(20,6)`
- `is_primary`

Supports multi-payer expenses.

### expense_shares

Fields:

- `id`
- `proposal_id`
- `debtor_user_id`
- `creditor_user_id`
- `share_original_amount numeric(20,6)`
- `share_settlement_amount numeric(20,6)`
- `share_currency char(3)`
- `settlement_currency char(3)`
- `percentage numeric(10,6)` nullable
- `share_units numeric(20,6)` nullable
- `status`
- `ledger_obligation_id` nullable
- `created_at`
- `updated_at`

Constraints:

- share amounts sum to proposal total within rounding tolerance.
- unique maturity linkage to prevent duplicate formal obligations.

### proposal_approvals

Fields:

- `id`
- `proposal_id`
- `share_id` nullable
- `approver_user_id`
- `decision`
- `comment`
- `created_at`

Rules:

- Debtor approval should reference `share_id`.
- Payer/creditor confirmation may reference proposal or share depending on implementation.

### proposal_comments

Fields:

- `id`
- `proposal_id`
- `share_id` nullable
- `author_user_id`
- `body`
- `created_at`

### files

Fields:

- `id`
- `household_id`
- `uploaded_by_user_id`
- `storage_provider`
- `bucket`
- `object_key`
- `original_filename`
- `mime_type`
- `size_bytes`
- `sha256`
- `created_at`

### proposal_files

Fields:

- `proposal_id`
- `file_id`
- `purpose` receipt/evidence/other
- `created_by_user_id`
- `created_at`

### settlement_files

Fields:

- `settlement_id`
- `file_id`
- `purpose` evidence
- `created_by_user_id`
- `created_at`

### fx_rates

Fields:

- `id`
- `provider`
- `base_currency`
- `quote_currency`
- `rate_date`
- `rate numeric(24,12)`
- `fetched_at`
- `source_meta jsonb`

Constraint:

- unique `(provider, base_currency, quote_currency, rate_date)`.

### ledger_transactions

Fields:

- `id`
- `household_id`
- `type`
- `description`
- `source_type`
- `source_id`
- `created_by_user_id`
- `occurred_at`
- `created_at`
- `reverses_transaction_id` nullable

### debt_obligations

Fields:

- `id`
- `household_id`
- `ledger_transaction_id`
- `source_share_id`
- `debtor_user_id`
- `creditor_user_id`
- `original_amount numeric(20,6)`
- `original_currency char(3)`
- `settlement_amount numeric(20,6)`
- `settlement_currency char(3)`
- `remaining_amount numeric(20,6)`
- `status` open/settled/reversed
- `due_date`
- `created_at`
- `settled_at` nullable

Constraints:

- unique `source_share_id` where not null.

### settlements

Fields:

- `id`
- `household_id`
- `ledger_transaction_id`
- `payer_user_id` debtor
- `payee_user_id` creditor
- `amount numeric(20,6)`
- `currency char(3)`
- `settlement_date`
- `method` manual/venmo/zelle/wechat/alipay/cash/other
- `payment_reference`
- `status` submitted/confirmed/rejected/cancelled
- `note`
- `created_by_user_id`
- `created_at`

### settlement_allocations

Fields:

- `id`
- `settlement_id`
- `debt_obligation_id`
- `amount_applied numeric(20,6)`

### calendar_events

Fields:

- `id`
- `household_id`
- `type`
- `title`
- `description`
- `start_at`
- `end_at`
- `all_day`
- `timezone`
- `status`
- `created_by_user_id`
- `created_at`
- `updated_at`

### recurrence_rules

Fields:

- `id`
- `household_id`
- `owner_type`
- `owner_id`
- `rrule_text`
- `dtstart`
- `timezone`
- `until` nullable
- `count` nullable
- `created_at`

### tasks

Fields:

- `id`
- `household_id`
- `title`
- `description`
- `status` open/in_progress/completed/cancelled/overdue
- `priority`
- `category_id` nullable
- `due_at`
- `created_by_user_id`
- `completed_by_user_id` nullable
- `completed_at` nullable
- `created_at`
- `updated_at`

### task_assignments

Fields:

- `id`
- `task_id`
- `assigned_user_id`
- `role` owner/helper/reviewer
- `status`

### event_links

Fields:

- `id`
- `event_id`
- `linked_type` proposal/share/obligation/settlement/task/template
- `linked_id`
- `created_at`

### notifications

Fields:

- `id`
- `household_id`
- `user_id`
- `type`
- `title_key`
- `body_key`
- `payload jsonb`
- `read_at` nullable
- `created_at`

### notification_preferences

Fields:

- `id`
- `user_id` unique
- `in_app_enabled`
- `email_enabled`
- `proposal_updates_enabled`
- `settlement_updates_enabled`
- `task_reminders_enabled`
- `created_at`
- `updated_at`

### audit_events

Fields:

- `id`
- `household_id`
- `actor_user_id` nullable for system jobs
- `action`
- `entity_type`
- `entity_id`
- `before jsonb` nullable
- `after jsonb` nullable
- `metadata jsonb`
- `prev_hash` nullable
- `event_hash` nullable
- `occurred_at`

Current implementation stores tamper-evident `prev_hash` and `event_hash` values. Migration `20260704050000_add_audit_hash_chain` installs a PostgreSQL trigger that computes hashes before insert, backfills existing rows, and uses a per-household advisory lock so concurrent inserts append to a deterministic household chain ordered by `occurred_at, id`.

## Derived views

### member_balances

Derived from `debt_obligations` and `settlement_allocations`.

Columns:

- household_id
- debtor_user_id
- creditor_user_id
- settlement_currency
- net_amount

### category_spend_monthly

Derived from matured obligations/proposals.

### approval_queue

Pending approval items per user.

## Important database invariants

1. `debt_obligations.source_share_id` unique prevents duplicate share maturity.
2. `expense_shares.status = MATURED_TO_LEDGER` requires non-null `ledger_obligation_id`.
3. Formal debt balances only use `debt_obligations` and `settlements`, not proposal totals.
4. Ledger transaction reversal never updates original transaction; it references original.
5. FX fields must be non-null when original currency differs from settlement currency under `LOCK_AT_EXPENSE_DATE`.
6. Every mutating transaction emits an `audit_events` row.
7. Audit event hashes must verify against the previous household event hash before the audit chain is considered intact.
8. Month lock prevents direct mutation of proposals/obligations in locked period except via adjustment/reversal.

## Migration guidance

- Use Prisma migrations for normal schema evolution.
- Use raw SQL migrations for partial indexes, generated columns, triggers, check constraints, or audit hash constraints.
- Never run destructive migrations without backup and downgrade plan.

## Starter Prisma schema

See `db/schema.prisma`. It is intentionally a starter schema and must evolve with implementation.
