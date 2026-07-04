# 09 — Agent Instructions and Workflow

## Purpose

This document tells Codex or any coding agent how to execute Roompire development over many sessions with GitHub version control, persistent memory, real browser verification, and documentation maintenance.

## Golden rules

1. Use GitHub as source of truth.
2. Assume push permission exists.
3. Read `AGENTS.md` and `PROJECT_MEMORY.md` at the beginning of every session.
4. Update `PROJECT_MEMORY.md` at the end of every session.
5. Prefer real browser interaction tests over API-only validation.
6. Keep UI modern, minimal, and shadcn-like.
7. Use mature libraries, MCPs, and skills.
8. Do not break ledger invariants.

## Session start protocol

Run or perform equivalent checks:

```bash
git status --short
git branch --show-current
git remote -v
```

Then read:

- `AGENTS.md`
- `PROJECT_MEMORY.md`
- relevant docs under `docs/`
- package files and current source structure
- open issues/PRs if GitHub MCP/API is available

Then summarize internally:

- current phase
- last completed work
- known blockers
- next atomic target

Do not ask the human for information already present in repo memory/docs.

## Planning protocol

For each task:

1. Define the user-visible outcome.
2. Identify affected domain invariants.
3. Identify files/modules to change.
4. Identify tests to add.
5. Implement in small steps.
6. Run checks.
7. Use browser/PWA tests.
8. Update docs/memory.
9. Commit and push.

## GitHub workflow

### Branching

- Small feature: create `feat/<short-scope>`.
- Bug fix: create `fix/<short-scope>`.
- Docs: create `docs/<short-scope>`.

Example:

```bash
git checkout -b feat/expense-proposals
```

### Commit

Use Conventional Commits.

Examples:

```bash
git commit -m "feat(expenses): create proposal form and split preview"
git commit -m "test(e2e): cover approval-gated ledger maturity"
git commit -m "docs(memory): update phase status"
```

### Push

Push after a coherent milestone:

```bash
git push -u origin feat/expense-proposals
```

If a PR workflow is available, open/update PR. If not, push branch and report branch name.

Never force-push main without explicit instruction.

## Testing workflow

### Required local checks before pushing

Use project scripts once defined:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

If a command is not yet available, create it as part of bootstrap.

### E2E requirement

For every user-facing feature:

- Start the dev server.
- Use Playwright to interact with the actual webpage.
- Cover desktop and mobile viewport.
- Verify UI state and persisted state.
- Do not substitute API-only checks for UI flow.

### Browser/MCP usage

When available, use:

- Playwright MCP/browser tools for real interaction.
- GitHub MCP/API for issues, PRs, branches.
- Context/documentation MCP for up-to-date framework docs.
- Figma MCP if a design file later exists.
- Cloudflare MCP/API for deployment validation if configured.
- Database MCP/admin tools for schema inspection when safe.

## Implementation priority order

1. Repo bootstrap and CI.
2. Design system/app shell.
3. Auth/households/members/RBAC.
4. Expense proposal form.
5. Approval state machine.
6. FX lock.
7. Formal ledger and balances.
8. Settlements.
9. Calendar/task foundation.
10. Recurrence and reminders.
11. Audit/stats/export.
12. Backup/restore/deployment.

## How to handle uncertainty

- Prefer official docs and current project code over memory.
- Use mature library defaults unless they conflict with product invariants.
- If multiple valid choices exist, choose the simplest reversible path and document the decision.
- Do not block on human clarification for minor implementation choices; proceed with a documented reasonable default.
- Ask the human only for product/business choices that materially change direction.

## Documentation maintenance

After each task, update:

- `PROJECT_MEMORY.md`
- relevant docs if architecture/API/DB changes
- OpenAPI spec if endpoint shape changes
- Prisma schema/migration notes if DB changes
- test plan if a new test pattern is introduced

## Agent handoff summary format

At the end of each session, report:

```markdown
## Completed

- ...

## Changed files

- ...

## Tests run

- ...

## Browser verification

- ...

## GitHub

- Branch: ...
- Commit(s): ...
- Pushed: yes/no
- PR: ...

## Known issues

- ...

## Next recommended task

- ...
```

## Do not do

- Do not declare success without real browser testing for UI flows.
- Do not mutate formal ledger rows to "fix" history.
- Do not use floats for money.
- Do not skip i18n strings.
- Do not invent custom calendar/recurrence engine unless mature libraries fail.
- Do not commit secrets.
- Do not rely on screenshots only; assert actual UI/data behavior.
