# AGENTS.md — Roompire Agent Constitution

This file is a hard instruction set for Codex and any other coding agent working in this repository.

## Project identity

- Product name: **Roompire**
- GitHub repository: `https://github.com/AIALRA-0/Roompire.git`
- Production domain: `roompire.aialra.online`
- Product type: PWA-first shared-house operations system.
- Core users: USC / university roommate groups, shared apartments, bilingual Chinese/English households.

## Non-negotiable development rules

1. **Real webpage tests first.** Do not declare a feature complete because only API tests or backend tests pass. Every user-facing feature must be validated through real browser interaction, preferably Playwright, across desktop and mobile viewports.
2. **Modern minimal SaaS UI.** The UI must follow Notion / Linear / Vercel / shadcn-ui style: calm surfaces, clear hierarchy, dense but readable data tables, high-quality empty states, command-friendly workflows, responsive layouts.
3. **Do not reinvent mature wheels.** Prefer stable, well-maintained libraries and established architecture patterns. Reuse and optimize mature components rather than building custom implementations for solved problems.
4. **Use MCP, skills, and mature open resources.** When documentation, browser automation, Figma, GitHub, Cloudflare, database, or testing MCP/skills are available, use them. Do not be stingy with verified tools that improve reliability.

## Product invariants

- A submitted expense is not a debt until required approvals are complete.
- Pending proposals must not affect ledger balances, debt summaries, settlement suggestions, or final statistics.
- Each debtor approval applies only to that debtor's share.
- Multi-person proposals can partially mature: approved shares may become formal obligations while rejected/pending shares remain separate.
- Formal ledger entries are append-only. Never mutate or delete historical ledger records.
- Corrections are reversal/adjustment transactions linked to the original transaction.
- Money uses decimal arithmetic only. Never use floating-point math for currency.
- FX must be locked and auditable: store original currency, settlement currency, rate, rate date, provider, lock timestamp, and lock policy.
- Default FX policy: `LOCK_AT_EXPENSE_DATE`.
- Every important state transition emits an audit event.
- Bilingual UX is first-class: zh-CN and en-US are shipped from MVP, not afterthoughts.

## Default stack

- Monorepo: pnpm workspace + Turborepo
- Frontend/PWA: Next.js App Router + React + TypeScript
- UI: Tailwind CSS + shadcn/ui + lucide-react
- Calendar: FullCalendar + rrule/rrule-es
- API: REST with OpenAPI 3.x contract; Next.js route handlers or separate Fastify/NestJS service if scale requires
- Database: PostgreSQL
- ORM: Prisma with raw SQL migrations for ledger/audit-critical constraints
- Queue/cache: Redis + BullMQ
- Storage: S3-compatible object storage, preferably Cloudflare R2 or MinIO in self-hosted environments
- Testing: Vitest + Testing Library + Playwright + axe/accessibility checks
- CI/CD: GitHub Actions
- Deployment target: Docker-first; Cloudflare domain configured as `roompire.aialra.online`

## Repository workflow

- Always inspect current repo state before changing files:
  - `git status --short`
  - read `PROJECT_MEMORY.md`
  - read relevant docs under `docs/`
  - inspect existing package files and CI workflows
- Use feature branches: `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`, `test/<short-name>`.
- Commit with Conventional Commits.
- Push to GitHub after each coherent milestone. You have push permission by default.
- Never force-push `main` unless the human explicitly instructs it.
- Prefer PRs for large changes; if direct pushes are necessary, keep commits small and well-labeled.
- Update `PROJECT_MEMORY.md` after each session with: completed work, changed files, decisions, tests run, known issues, next tasks.

## Completion standard

A feature is not done until all are true:

- User flow works through the real web UI.
- Playwright test covers the happy path and at least one failure/edge path.
- Desktop and mobile viewport checks pass.
- API tests and unit tests pass.
- Ledger/accounting invariants are preserved.
- Audit events are emitted where required.
- zh-CN and en-US strings exist for new UI.
- Empty, loading, error, forbidden, and offline-ish states are handled where relevant.
- CI passes.
- Relevant docs and `PROJECT_MEMORY.md` are updated.

## Safety and privacy

- Never store bank card numbers, SSNs, passports, full payment credentials, or unnecessary personal data.
- File uploads must be private by default and household-scoped.
- Logs must not contain secrets or payment-sensitive information.
- All destructive user actions must be reversible or represented by formal reversal events.
- Test data must not include real private information.
