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

### Record settlement

```json
{
  "debtObligationId": "obl_123",
  "amount": "287.20",
  "settlementDate": "2026-07-08",
  "method": "WECHAT",
  "note": "Paid via WeChat."
}
```

Current implementation records one submitted settlement against one open debt obligation.
Only the debtor for that obligation can submit it. The creditor must confirm it before the service creates a settlement allocation and reduces the obligation remaining amount. Rejection leaves obligation balances unchanged.

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
| View full audit                  |    ✅ |    ✅ | ⚠️ own-related | ❌/limited |
| Edit household settings          |    ✅ |    ✅ |             ❌ |         ❌ |

## OpenAPI file

See `specs/openapi.roompire.v1.yaml` for the initial machine-readable contract. It is intentionally incomplete but establishes naming, schemas, and endpoint patterns.
