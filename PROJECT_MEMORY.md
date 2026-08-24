# PROJECT_MEMORY.md — Persistent Project Memory

Codex and future agents must update this file after every meaningful session. Keep it concise but complete enough that a new session can recover context without asking the human to repeat decisions.

## Project

- Name: Roompire
- Repo: https://github.com/AIALRA-0/Roompire.git
- Domain placeholder: roompire.example.invalid
- Current strategy: self-developed PWA-first shared-house ledger + calendar/task system.

## Immutable decisions

- Do not fork a Splitwise/Flatastic clone as the final product.
- Expense submissions are proposals; only approved shares become official ledger obligations.
- Default FX policy is expense-date lock to household settlement currency.
- Formal ledger is append-only.
- UI style: Notion / Linear / Vercel / shadcn-ui.
- Real browser E2E tests are required for user-facing completion.
- zh-CN and en-US are mandatory from MVP.
- Use mature libraries and MCP/skills whenever they improve reliability.

## Current implementation status

- Phase 0 bootstrap implemented on branch `feat/phase-0-bootstrap`.
- Repository now contains a pnpm/Turborepo monorepo with `apps/web` Next.js App Router app.
- Web app includes Tailwind CSS, shadcn/ui-style `Button`/`Badge` primitives, lucide icons, PWA manifest/icon, localized landing page, localized dashboard shell, and protected/forbidden state page.
- i18n implemented with next-intl for `en-US` and `zh-CN` locale routes.
- Prisma/PostgreSQL schema validated and initial SQL migration generated under `db/migrations/20260704000000_init`.
- Docker Compose defines Postgres 18 and Redis 8 with overrideable host ports.
- Deterministic seed script creates `USC 3B2B`, Alice/Bob/Chen/Dana, 11 categories, one submitted grocery proposal, two pending shares, and one audit event.
- Vitest covers decimal equal split behavior using `decimal.js`.
- Playwright E2E covers real browser desktop and mobile landing/dashboard navigation plus zh-CN protected-route failure state.
- Chinese-first `README.md` and English `README.en.md` now document implemented scope, future scope, invariants, setup, verification, security boundaries, and the complete document map.
- README visuals include an original SVG hero and an anonymized real-browser landing-page screenshot under `assets/readme`.
- The current branch uses `roompire.example.invalid` wherever public documentation needs a deployment-domain placeholder; the real deployment domain belongs only in private configuration.

## Current phase

Phase 0: repository bootstrap. Baseline is implemented and verified locally; next work should start Phase 1 identity/household/RBAC unless Phase 0 CI/push housekeeping is requested first.

## Decisions log

| Date       | Decision                                              | Rationale                                                                                                                             |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-03 | Choose custom PWA-first system                        | Existing tools do not satisfy approval-gated ledger + locked FX + calendar-linked tasks + bilingual self-hosting.                     |
| 2026-07-03 | Use proposal/ledger split                             | Pending expenses must be auditable but must not affect debt balances.                                                                 |
| 2026-07-03 | Use expense-date FX lock by default                   | More predictable for RMB repayment and avoids repayment-date FX disputes.                                                             |
| 2026-07-03 | Use Playwright as primary E2E gate                    | User explicitly requires real webpage interaction testing.                                                                            |
| 2026-07-04 | Pin Prisma to 6.x                                     | The supplied schema uses the stable Prisma datasource URL style; Prisma 7 requires a config migration that is not needed for Phase 0. |
| 2026-07-04 | Pin TypeScript to 5.x and ESLint to 9.x               | Current Next.js ecosystem is stable on these major versions; TS 6 and ESLint 10 introduced avoidable bootstrap friction.              |
| 2026-07-04 | Use Postgres 18 volume mount at `/var/lib/postgresql` | Postgres 18 Docker image expects the newer major-version-specific data layout.                                                        |
| 2026-08-24 | Publish a Chinese-first bilingual repository landing page | The repository needs a factual, visual, privacy-safe entry point that distinguishes Phase 0 implementation from future product scope. |
| 2026-08-24 | Read the pnpm version from `packageManager` in GitHub workflows | Keeping a second workflow version caused CI to select pnpm 10 while the repository requires pnpm 11.9.0. |
| 2026-08-24 | Keep deployment identifiers out of tracked public material | Public examples now use the reserved `.invalid` namespace while real deployment values remain private. |

## Open questions for later human review

- Whether production backend should be self-hosted Docker VPS or Cloudflare Workers/OpenNext + managed Postgres.
- Whether WeChat Mini Program is Phase 2 or Phase 3.
- Whether household settlement currency defaults to CNY, USD, or per-household selection.
- Whether partial approvals should immediately create formal obligations or wait for all shares by default. Recommended default: partial maturity enabled, household-configurable.

## Next recommended tasks

1. Push `feat/phase-0-bootstrap` and open/merge a Phase 0 PR after CI confirms.
2. Implement Phase 1 auth/session foundation, household CRUD, membership list, invites, and RBAC middleware.
3. Replace static dashboard sample data with server-loaded seeded household data.
4. Add API route handlers for `/api/v1/session`, households, members, and permission errors aligned with OpenAPI.
5. Add Playwright flows for create household, invite/accept member, viewer forbidden mutation, and URL-guess isolation.
6. Begin Phase 2 expense proposal form only after household/RBAC invariants are enforced server-side.

## Last session verification

### 2026-08-24 README and repository validation

- `pnpm install --frozen-lockfile` passed and installed 538 workspace packages; the lockfile supply-chain policy passed for 677 entries.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed: 1 test file and 3 tests.
- `pnpm build` passed with Next.js 16.2.10.
- Prisma schema validation passed using an equivalent private Windows environment injection command because the root helper uses POSIX shell syntax.
- `pnpm exec playwright test` passed: 4 real-browser tests across Chromium desktop and mobile.
- Browser console verification found 0 errors and 0 warnings after adding explicit application icon metadata.
- Both README files passed the repository README audit; the Chinese README passed the human-readable Chinese validator.
- Repository privacy scan found no current-working-tree occurrence of the removed production domain.
- GitHub workflow configuration now lets the pnpm action read version 11.9.0 from `packageManager`; remote CI confirmation is pending the next push.
- `pnpm format:check` reports tracked CRLF working-tree line endings on Windows, so no broad formatting rewrite was applied during this documentation change.

### Prior Phase 0 database verification

- Local Postgres and Redis services started successfully with a private host-port override.
- Migration `20260704000000_init` applied successfully.
- `pnpm db:seed` passed twice, confirming idempotency.
- The development database contained the deterministic fictional Phase 0 sample set described by the seed script.
