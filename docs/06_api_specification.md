# 06 — API Specification

## API style

REST API with OpenAPI 3.x contract.

Base path:

```text
/api/v1
```

Authentication:

- Session cookie for web/PWA.
- Optional bearer token later for Mini Program/native clients.

Error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable localized or localizable message",
    "details": {}
  }
}
```

Pagination envelope:

```json
{
  "data": [],
  "page": {
    "cursor": "next-cursor",
    "hasMore": true
  }
}
```

Mutation headers:

- `Idempotency-Key`: required for proposal submit, approval, maturity, settlement, file finalize.
- Implemented financial mutations persist the key per user. Repeating the same key with the same endpoint and body replays the stored response; reusing the key with a changed request returns `409`.
- Implemented calendar/task mutations also require `Idempotency-Key` for event creation, task creation, and task completion.

## Endpoint groups

### Auth/session

- `GET /session`
- `GET /users/me`
- `PATCH /users/me`
- `POST /auth/login-link`
- `POST /auth/dev-login` in development only
- `POST /auth/logout`

Current private-deployment MVP: when site-level Basic Auth is configured, verified Basic Auth requests map to the app session email from `ROOMPIRE_SITE_GATE_SESSION_EMAIL`, or from the gate username when it is already an email address. Development session headers/cookies are accepted only while dev auth is enabled.

Current user settings implementation: `GET /users/me` returns the authenticated user's display name, preferred locale, and notification preferences. `PATCH /users/me` updates display name, preferred locale, and in-app/email/proposal/settlement/task reminder preference switches. Email delivery remains dormant until an email provider is configured.

### Notifications

- `GET /notifications`
- `PATCH /notifications/{notificationId}`

Current implementation: `GET /notifications` returns recent in-app notifications for households where the current user is still active, plus an unread count. `PATCH /notifications/{notificationId}` toggles the scoped notification read state. Expense proposal creation emits `EXPENSE_PROPOSAL_ASSIGNED` notifications for debtor shares when the recipient's in-app and proposal preference switches are enabled.

### Households

- `GET /households`
- `POST /households`
- `GET /households/{householdId}`
- `PATCH /households/{householdId}`
- `GET /households/{householdId}/members`
- `PATCH /households/{householdId}/members/{membershipId}`
- `DELETE /households/{householdId}/members/{membershipId}`
- `POST /households/{householdId}/members/{membershipId}/transfer-ownership`
- `POST /households/{householdId}/invites`
- `POST /invites/{token}/accept`

Current implementation lets owners and admins manage non-self member roles and removals, with admins limited to regular members and viewers. Ownership transfer is an owner-only explicit action: the selected active member becomes `OWNER`, the transferring owner becomes `ADMIN`, and a `household_owner.transferred` audit event records both membership role changes.

### Categories and tags

- `GET /households/{householdId}/categories`
- `POST /households/{householdId}/categories`
- `PATCH /households/{householdId}/categories/{categoryId}`
- `GET /households/{householdId}/tags`
- `POST /households/{householdId}/tags`

### Expense proposals

- `GET /households/{householdId}/expenses/proposals`
- `POST /households/{householdId}/expenses/proposals`
- `GET /households/{householdId}/expenses/proposals/{proposalId}`
- `PATCH /households/{householdId}/expenses/proposals/{proposalId}`
- `POST /households/{householdId}/expenses/proposals/{proposalId}/submit`
- `POST /households/{householdId}/expenses/proposals/{proposalId}/cancel`
- `POST /households/{householdId}/expenses/proposals/{proposalId}/comments`
- `POST /households/{householdId}/expenses/shares/{shareId}/approve`
- `POST /households/{householdId}/expenses/shares/{shareId}/reject`
- `POST /households/{householdId}/expenses/shares/{shareId}/request-changes`

### FX

- `GET /fx/rates?base=USD&quote=CNY&date=2026-07-01`
- `POST /households/{householdId}/fx/manual-rate-approvals`

### Ledger and balances

- `GET /households/{householdId}/ledger/transactions`
- `GET /households/{householdId}/ledger/obligations`
- `GET /households/{householdId}/balances`
- `POST /households/{householdId}/ledger/obligations/{obligationId}/reverse`
- `POST /households/{householdId}/ledger/adjustments`

### Settlements

- `GET /households/{householdId}/settlements`
- `POST /households/{householdId}/settlements`
- `POST /households/{householdId}/settlements/{settlementId}/confirm`
- `POST /households/{householdId}/settlements/{settlementId}/reject`
- `GET /households/{householdId}/settlement-suggestions`

Current implementation: debtors can submit a settlement against one open obligation, a directly settleable suggested transfer, or an enabled household-clearing transfer. The request can include completed uploaded `fileIds` as settlement evidence; the files must belong to the household, be uploaded by the submitting user, and have completed byte upload. Settlement responses include evidence metadata plus short-lived signed download URLs so creditors can review attachments before confirming.

### Calendar and tasks

- `GET /households/{householdId}/calendar/events`
- `POST /households/{householdId}/calendar/events`
- `PATCH /households/{householdId}/calendar/events/{eventId}`
- `DELETE /households/{householdId}/calendar/events/{eventId}` soft cancel
- `POST /households/{householdId}/calendar/events/{eventId}/create-expense-proposal`
- `GET /households/{householdId}/tasks`
- `POST /households/{householdId}/tasks`
- `PATCH /households/{householdId}/tasks/{taskId}`
- `POST /households/{householdId}/tasks/{taskId}/complete`
- `POST /households/{householdId}/tasks/{taskId}/create-expense-proposal`

Current implementation supports list/create calendar event, list/create task, assign task at creation, complete task, finite daily/weekly/monthly recurrence, list/week/month calendar UI views, creating one linked submitted expense proposal from a task, and creating one linked submitted expense proposal from bill/chore/group/recurring-expense calendar events. Creating a task with `dueAt` automatically creates a linked `TASK` calendar event, and task/event-generated expense proposals remain pending until the normal debtor approval flow. Event editing/deletion and task editing remain backlog items.

### Files

- `POST /households/{householdId}/files/presign-upload`
- `POST /households/{householdId}/files/complete-upload`
- `GET /households/{householdId}/files/{fileId}/download-url`

Current MVP implements private receipt/evidence storage behind a stable API shape: presign creates a file intent, clients upload bytes to the returned private `PUT` URL, proposal creation can attach uploaded `fileIds` as receipt files, settlement creation can attach uploaded `fileIds` as evidence files, and download-url returns a short-lived signed Roompire URL. Supported receipt/evidence MIME types are PDF, PNG, JPG, and WebP up to 5 MB. Development defaults to the local private adapter; production can use S3-compatible object storage through `ROOMPIRE_FILE_STORAGE_PROVIDER=s3` and `ROOMPIRE_S3_*` settings without changing the client API.

### Stats/export/audit

- `GET /households/{householdId}/stats/summary`
- `GET /households/{householdId}/stats/categories`
- `GET /households/{householdId}/stats/members`
- `GET /households/{householdId}/audit-events`
- `POST /households/{householdId}/exports`
- `GET /households/{householdId}/exports/{exportId}`

Current implementation exposes read-only active-member statistics endpoints for household summary totals, category totals, and member totals. Optional `from`/`to` query parameters select an inclusive statistics window. Summary covers the selected window, proposal status counts, non-cancelled proposal totals by currency, open obligation totals, confirmed settlement totals, open/completed task counts, audit event count, attached evidence file count across proposal receipts and settlement evidence, and daily proposal trend rows grouped by `expenseDate`. Category stats group proposal totals and matured share totals by expense category. Member stats group created proposals, payer totals, owed/receivable formal obligations, remaining open obligations, and confirmed settlement paid/received totals by active member. The localized statistics page uses the same service and keeps data scoped to the active household.

Current implementation exposes synchronous read-only export creation for active members. `POST /exports` accepts `dataset` (`expense_proposals`, `ledger_obligations`, `settlements`, `audit_events`, or `members`) plus `format` (`json` or `csv`), records an `export.created` audit event, and returns a signed short-lived `downloadUrl`. `GET /exports/{exportId}` verifies the signed ID and active membership before generating the selected JSON or CSV attachment.

Current implementation also exposes `GET /households/{householdId}/audit-events` as a read-only active-member endpoint returning household audit events with actor, action, entity, timestamp, before/after/metadata JSON, `prevHash`, and `eventHash`. The response includes a `chain` summary with `VERIFIED`, `MISSING_HASHES`, or `BROKEN` status, event/hash counts, the first broken event when applicable, and the latest event hash. Optional query parameters are `action`, `actorUserId`, `entityType`, `entityId`, `from`, `to`, and `limit` (1-100). The localized audit page uses the same service, shows the chain status, and keeps events scoped to the active household.

## Core request examples

### Create expense proposal

```json
{
  "title": "Costco groceries",
  "merchant": "Costco",
  "categoryId": "cat_groceries",
  "expenseDate": "2026-07-01",
  "dueDate": "2026-07-08",
  "originalAmount": "120.00",
  "originalCurrency": "USD",
  "settlementCurrency": "CNY",
  "splitMethod": "EQUAL",
  "participantUserIds": ["bob", "chen"],
  "fileIds": ["uploaded_receipt_file_id"]
}
```

For cross-currency proposals, `fxRate` is optional. When it is omitted, the server locks the expense-date rate from the `FxRate` cache or configured provider and copies `fxRate`, `fxRateDate`, `fxProvider`, and `fxLockedAt` into the proposal. Clients may still send `fxRate` as a manual override when provider lookup is unavailable or a reviewed manual rate is required.

Current implementation also accepts advanced split inputs through `participantShares`:

- `EXACT`: each debtor row includes `exactAmountOriginal`; debtor exact amounts may not exceed `originalAmount`, and the payer's own remainder is implicit.
- `PERCENTAGE`: each debtor row includes `percentage`; debtor percentages may not exceed `100`, and the payer's remaining percentage is implicit.
- `SHARES`: each debtor row includes `shareUnits`; the payer contributes one implicit share unit.

```json
{
  "title": "Utilities",
  "expenseDate": "2026-07-02",
  "originalAmount": "100.00",
  "originalCurrency": "CNY",
  "splitMethod": "PERCENTAGE",
  "participantShares": [{ "userId": "bob", "percentage": "25" }]
}
```

### Request changes and submit a revision

`POST /households/{householdId}/expenses/shares/{shareId}/request-changes` lets the assigned debtor move a pending share and its proposal into `DISPUTED` without creating ledger obligations:

```json
{
  "reason": "Please split the paper towels separately."
}
```

The original creator can then call `POST /households/{householdId}/expenses/proposals/{proposalId}/revisions` with the same create-proposal shape plus an optional `revisionReason`. The old proposal is marked `CANCELLED`; the new proposal is `SUBMITTED`, has `revisionNumber + 1`, and stores `supersedesProposalId`.

### Add proposal comment

```json
{
  "body": "Receipt total includes household paper towels.",
  "shareId": "optional_share_uuid"
}
```

Current implementation lets owners, admins, and members comment on an expense proposal; viewers can read detail but cannot comment. Comments are returned on proposal detail and are also shown in the proposal timeline. The mutation requires `Idempotency-Key` and records an audit event.

### Approve share

```json
{
  "comment": "Looks correct."
}
```

If the proposal has `dueDate`, current implementation creates a `REPAYMENT_DUE` calendar event when the approved share matures into a `DebtObligation`, then links the event to that obligation with an `EventLink`.

### Reject share

```json
{
  "reason": "I was not part of this purchase."
}
```

### Create ledger adjustment

```json
{
  "debtorUserId": "bob",
  "creditorUserId": "alice",
  "amount": "15.00",
  "currency": "CNY",
  "occurredAt": "2026-07-08",
  "dueDate": "2026-07-15",
  "reason": "Utility correction."
}
```

Current implementation allows only household owners and admins to create adjustment obligations.

### Reverse obligation

```json
{
  "reason": "Duplicate approved share.",
  "occurredAt": "2026-07-08"
}
```

Current implementation allows only household owners and admins to reverse open obligations with no confirmed settlement allocations. The original ledger transaction remains in history; a `REVERSAL` transaction references it and the obligation is excluded from balances.

### Record settlement

Single obligation:

```json
{
  "debtObligationId": "obl_123",
  "amount": "287.20",
  "settlementDate": "2026-07-08",
  "method": "WECHAT",
  "note": "Paid via WeChat.",
  "fileIds": ["uploaded_receipt_file_id"]
}
```

Suggested transfer across matching obligations:

```json
{
  "payeeUserId": "alice",
  "amount": "302.20",
  "currency": "CNY",
  "settlementDate": "2026-07-08",
  "method": "WECHAT",
  "note": "Paid via WeChat.",
  "fileIds": ["uploaded_receipt_file_id"]
}
```

Current implementation records either one submitted settlement against a single open debt obligation or one suggested-transfer settlement for a debtor/payee/currency pair.
Only the debtor can submit it. Optional `fileIds` attach completed uploads as settlement evidence for creditor review. The creditor must confirm it before the service creates settlement allocations and reduces obligation remaining amounts. Suggested-transfer confirmation allocates across matching open obligations in deterministic oldest-first order. Rejection leaves obligation balances unchanged.

### Settlement suggestions

`GET /households/{householdId}/settlement-suggestions` returns a read-only list of optimized transfers. Current implementation nets all open obligations per currency, then emits the minimal debtor-to-creditor transfer set for each currency. Pending/rejected proposals and settled/reversed obligations are excluded. Suggestions include `actionability`: `DIRECTLY_SETTLEABLE` when enough direct open obligations already exist from the suggested payer to payee, `CLEARING_SETTLEABLE` when the household has enabled `HOUSEHOLD_NETTING` for a non-direct netted transfer, or `GUIDANCE_ONLY` when the recommendation is informational only. Confirmed clearing settlements allocate the payment across the payer's outgoing obligations and the payee's incoming obligations without editing historical ledger rows.

### Create calendar event

```json
{
  "title": "Rent review",
  "type": "BILL_DUE",
  "startAt": "2026-07-09T09:00:00.000Z",
  "endAt": "2026-07-09T09:30:00.000Z",
  "allDay": false,
  "recurrenceFrequency": "WEEKLY",
  "recurrenceCount": 3,
  "description": "Check rent transfer status."
}
```

`recurrenceCount` is finite and includes the first created instance. Current implementation materializes the additional event rows immediately and links them to a stored recurrence rule.

### Create task

```json
{
  "title": "Kitchen reset",
  "priority": "HIGH",
  "dueAt": "2026-07-09T10:00:00.000Z",
  "assignedUserIds": ["user_bob"],
  "recurrenceFrequency": "WEEKLY",
  "recurrenceCount": 2,
  "description": "Clean counters and take out recycling."
}
```

If `dueAt` is present, the current implementation creates a `TASK` calendar event and an `EventLink` from the event to the task. Recurring tasks require `dueAt`; the service materializes additional task rows, copies assignments, creates linked `TASK` events for each generated task, and links those events to a stored recurrence rule.

### Complete task

```json
{
  "completedAt": "2026-07-09T11:00:00.000Z"
}
```

The current implementation marks the task and assignments completed, updates linked `TASK` calendar events to completed, and records an audit event.

## Authorization matrix

| Action                           | Owner | Admin |         Member |     Viewer |
| -------------------------------- | ----: | ----: | -------------: | ---------: |
| View household                   |    ✅ |    ✅ |             ✅ |         ✅ |
| Invite member                    |    ✅ |    ✅ |             ❌ |         ❌ |
| Transfer ownership               |    ✅ |    ❌ |             ❌ |         ❌ |
| Create proposal                  |    ✅ |    ✅ |             ✅ |         ❌ |
| Approve own share                |    ✅ |    ✅ |             ✅ |         ❌ |
| Approve others' share            |    ❌ |    ❌ |             ❌ |         ❌ |
| Record settlement involving self |    ✅ |    ✅ |             ✅ |         ❌ |
| Reverse ledger entry             |    ✅ |    ✅ |             ❌ |         ❌ |
| View calendar/tasks              |    ✅ |    ✅ |             ✅ |         ✅ |
| Create calendar event/task       |    ✅ |    ✅ |             ✅ |         ❌ |
| Complete task                    |    ✅ |    ✅ |             ✅ |         ❌ |
| View full audit                  |    ✅ |    ✅ | ⚠️ own-related | ❌/limited |
| Edit household settings          |    ✅ |    ✅ |             ❌ |         ❌ |

## OpenAPI file

See `specs/openapi.roompire.v1.yaml` for the initial machine-readable contract. It is intentionally incomplete but establishes naming, schemas, and endpoint patterns.
