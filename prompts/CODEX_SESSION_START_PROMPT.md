# CODEX SESSION START PROMPT

Use this for subsequent Codex sessions after the master prompt has already been used.

---

Continue Roompire development in `https://github.com/AIALRA-0/Roompire.git`.

You have GitHub push permission. Start by reading `AGENTS.md`, `PROJECT_MEMORY.md`, and the docs relevant to the next task. Inspect git status, current branch, package scripts, CI, and current implementation.

Follow the Roompire rules:

- Real webpage testing with Playwright/browser interaction is required for user-facing work.
- UI style: Notion / Linear / Vercel / shadcn-ui modern minimal SaaS.
- Use mature libraries; do not reinvent solved infrastructure.
- Use available MCP/skills/tools generously, especially docs, GitHub, browser, database, and Cloudflare tools.
- Preserve ledger invariants: pending proposals do not affect formal balances; only approved shares mature to ledger; ledger is append-only; money uses decimal arithmetic; FX is locked by expense date by default.
- Maintain zh-CN and en-US.

Pick the next task from `PROJECT_MEMORY.md` and `docs/10_backlog_milestones.md`. Implement it end-to-end, add tests, run checks, verify through the real web UI, update docs/memory, commit, and push.
