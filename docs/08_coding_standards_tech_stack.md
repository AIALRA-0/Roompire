# 08 — Coding Standards and Tech Stack

## Default tech stack

| Area            | Choice                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| Package manager | pnpm                                                                           |
| Monorepo        | Turborepo                                                                      |
| Language        | TypeScript strict mode                                                         |
| Frontend        | Next.js App Router + React                                                     |
| Styling         | Tailwind CSS                                                                   |
| UI components   | shadcn/ui                                                                      |
| Icons           | lucide-react                                                                   |
| Forms           | react-hook-form + zod                                                          |
| i18n            | next-intl or i18next; default recommendation: next-intl for Next.js App Router |
| Calendar        | FullCalendar + rrule/rrule-es                                                  |
| ORM             | Prisma                                                                         |
| Database        | PostgreSQL                                                                     |
| Queue           | BullMQ + Redis                                                                 |
| Object storage  | S3-compatible, Cloudflare R2 or MinIO                                          |
| Unit tests      | Vitest                                                                         |
| Component tests | Testing Library                                                                |
| E2E tests       | Playwright                                                                     |
| API contract    | OpenAPI 3.x                                                                    |
| CI              | GitHub Actions                                                                 |
| Deployment      | Docker-first; Cloudflare DNS/domain                                            |

## TypeScript rules

- `strict: true`.
- Avoid `any`; use `unknown` and narrow.
- Domain values must have explicit types.
- Use discriminated unions for state machines.
- Centralize enum/string literal definitions.
- Money values should use `Decimal` or string at API boundary.

## Money rules

- Never use JS floating-point arithmetic for money.
- API money fields are decimal strings.
- DB money fields use `numeric`.
- Conversion/rounding rules must be centralized.
- Tests must cover rounding and split remainders.

## Date/time rules

- Store timestamps as UTC.
- Store household timezone in settings.
- Store expense date as date-only where appropriate.
- Calendar events use timezone-aware start/end fields.
- Avoid implicit `new Date()` in domain tests; use injected clock.

## API rules

- Validate all input server-side.
- Use zod schemas or equivalent.
- Return consistent error envelopes.
- Check household membership for every household-scoped request.
- Check role/permission for every mutation.
- Use idempotency keys for financial mutations.
- Do not leak existence of resources in other households.

## Database rules

- Add indexes for list filters.
- Use transactions for proposal approval -> ledger maturity.
- Emit audit event in same transaction where possible.
- Formal ledger records are append-only.
- Prefer soft-delete for user-facing records.
- Do not create migrations that destroy financial data.

## UI rules

- Use shadcn/ui and Tailwind tokens.
- Do not invent a custom component library unless necessary.
- Every interactive control must be accessible.
- Use responsive-first components.
- No hard-coded user-facing strings; use i18n keys.
- Use semantic status tokens.

## Testing rules

- Write unit tests for domain logic before or alongside implementation.
- Write Playwright E2E for user-visible flows.
- Do not mark user-facing work complete without browser tests.
- Use seeded deterministic test data.
- Prefer user-visible selectors in Playwright: role, label, text.
- Use `data-testid` for ambiguous dynamic controls.

## Git rules

- Branch names:
  - `feat/<scope>`
  - `fix/<scope>`
  - `docs/<scope>`
  - `test/<scope>`
  - `chore/<scope>`
- Commit format: Conventional Commits.
- Examples:
  - `feat(expenses): add proposal approval state machine`
  - `test(e2e): cover mobile expense approval flow`
  - `fix(ledger): prevent duplicate share maturity`
- Push after each coherent milestone.
- Keep commits small enough to review.

## Documentation rules

- Update docs when behavior changes.
- Update OpenAPI when endpoints change.
- Update `PROJECT_MEMORY.md` after each session.
- Maintain migration notes.

## Security rules

- Never commit `.env`.
- Keep `.env.example` updated.
- Never log secrets.
- Never store full payment credentials.
- Use signed URLs for private files.
- Keep fixed-window rate limiting on site-gate failures, dev-session switching, invite creation/acceptance, file upload intents, proposal comments, and share decisions.
- Keep proxy-level CSRF origin checks on cookie-authenticated unsafe API mutations.

## Build-vs-buy rules

Use established libraries for:

- auth
- forms
- validation
- UI primitives
- calendar
- recurrence
- queues
- file storage clients
- OpenAPI tooling
- tests
- i18n

Build custom only for Roompire-specific domain:

- approval-gated debts
- FX lock behavior
- ledger invariants
- household-linked task/calendar/expense flows

## Code organization suggestion

```text
apps/web/src/
  app/                  # Next.js routes
  components/           # feature-level components
  features/
    expenses/
    ledger/
    calendar/
    tasks/
    households/
    auth/
  lib/
    auth/
    db/
    money/
    fx/
    permissions/
    audit/
  server/
    services/
    repositories/
    jobs/
  i18n/
    messages/en-US.json
    messages/zh-CN.json
```

## Domain service naming

- `ExpenseProposalService`
- `ApprovalService`
- `LedgerService`
- `FxService`
- `SettlementService`
- `CalendarService`
- `TaskService`
- `AuditService`

Keep services small and testable.
