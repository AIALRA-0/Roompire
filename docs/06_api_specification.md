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
- `POST /auth/login-link`
- `POST /auth/dev-login` in development only
- `POST /auth/logout`

### Households

- `GET /households`
- `POST /households`
- `GET /households/{householdId}`
- `PATCH /households/{householdId}`
- `GET /households/{householdId}/members`
- `POST /households/{householdId}/invites`
- `POST /invites/{token}/accept`

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

### Calendar and tasks

- `GET /households/{householdId}/calendar/events`
- `POST /households/{householdId}/calendar/events`
- `PATCH /households/{householdId}/calendar/events/{eventId}`
- `DELETE /households/{householdId}/calendar/events/{eventId}` soft cancel
- `GET /households/{householdId}/tasks`
- `POST /households/{householdId}/tasks`
- `PATCH /households/{householdId}/tasks/{taskId}`
- `POST /households/{householdId}/tasks/{taskId}/complete`
- `POST /households/{householdId}/tasks/{taskId}/create-expense-proposal`

Current implementation supports list/create calendar event, list/create task, assign task at creation, and complete task. Creating a task with `dueAt` automatically creates a linked `TASK` calendar event. Recurrence, event editing/deletion, task editing, and task-to-expense proposal creation remain backlog items.

### Files

- `POST /households/{householdId}/files/presign-upload`
- `POST /households/{householdId}/files/complete-upload`
- `GET /households/{householdId}/files/{fileId}/download-url`

### Stats/export/audit

- `GET /households/{householdId}/stats/summary`
- `GET /households/{householdId}/stats/categories`
- `GET /households/{householdId}/audit-events`
- `POST /households/{householdId}/exports`
- `GET /households/{householdId}/exports/{exportId}`

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
  "payers": [{ "userId": "alice", "amountOriginal": "120.00" }],
  "participants": [{ "userId": "alice" }, { "userId": "bob" }, { "userId": "chen" }],
  "tagIds": ["tag_household"],
  "fileIds": ["file_receipt_1"]
}
```

### Approve share

```json
{
  "comment": "Looks correct."
}
```

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
  "note": "Paid via WeChat."
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
  "note": "Paid via WeChat."
}
```

Current implementation records either one submitted settlement against a single open debt obligation or one suggested-transfer settlement for a debtor/payee/currency pair.
Only the debtor can submit it. The creditor must confirm it before the service creates settlement allocations and reduces obligation remaining amounts. Suggested-transfer confirmation allocates across matching open obligations in deterministic oldest-first order. Rejection leaves obligation balances unchanged.

### Settlement suggestions

`GET /households/{householdId}/settlement-suggestions` returns a read-only list of optimized transfers. Current implementation nets all open obligations per currency, then emits the minimal debtor-to-creditor transfer set for each currency. Pending/rejected proposals and settled/reversed obligations are excluded.

### Create calendar event

```json
{
  "title": "Rent review",
  "type": "BILL_DUE",
  "startAt": "2026-07-09T09:00:00.000Z",
  "endAt": "2026-07-09T09:30:00.000Z",
  "allDay": false,
  "description": "Check rent transfer status."
}
```

### Create task

```json
{
  "title": "Kitchen reset",
  "priority": "HIGH",
  "dueAt": "2026-07-09T10:00:00.000Z",
  "assignedUserIds": ["user_bob"],
  "description": "Clean counters and take out recycling."
}
```

If `dueAt` is present, the current implementation creates a `TASK` calendar event and an `EventLink` from the event to the task.

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
