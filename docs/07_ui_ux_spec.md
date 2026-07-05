# 07 — UI/UX Spec and Design System

## Design direction

Roompire should look and feel like a modern minimal SaaS product influenced by:

- Notion: calm, document-like clarity, low-friction editing.
- Linear: crisp workflows, command palette energy, precise status language.
- Vercel: clean layouts, high contrast typography, confident empty states.
- shadcn/ui: accessible primitives, composable components, neutral design tokens.

## Experience principles

1. **Trust before speed.** Expense flows must be fast, but calculation and approval must be transparent.
2. **Everything has a state.** Pending, approved, rejected, disputed, due, overdue, settled, reversed must be visible.
3. **Explain the math.** Every converted amount and split should have an inspectable breakdown.
4. **Mobile first for daily actions.** Submit, approve, reject, complete task, and record settlement must be easy on phone.
5. **Desktop dense for review.** Tables, filters, audit logs, and stats should be efficient on desktop.
6. **Bilingual from the start.** No hard-coded English-only flows.

## Information architecture

Primary navigation:

- Dashboard
- Expenses
- Approvals
- Balances
- Calendar
- Tasks
- Stats
- Audit
- Settings

Mobile navigation:

- Home
- Add
- Approvals
- Calendar
- More

Global quick actions:

- Add expense
- Add task
- Add event
- Record settlement
- Invite member

## Key pages

### Landing page `/`

Purpose:

- Explain Roompire.
- Direct user to sign in/app.

Sections:

- Hero: "Shared house expenses and tasks, finally accountable."
- Three pillars: approval ledger, locked FX, calendar tasks.
- Bilingual note.
- CTA.

### App dashboard `/app`

Components:

- Household switcher.
- Net balance card.
- Pending approvals card.
- Upcoming due dates.
- Recent activity.
- Quick add buttons.
- Mini calendar strip.

### Expenses list

Views:

- Table/list on desktop.
- Cards on mobile.

Filters:

- status
- category
- payer
- debtor
- date range
- currency
- tag

Columns/card content:

- title
- amount original/settlement
- status badge
- category
- payer
- participants
- date
- due date
- approval progress

### Expense proposal detail

Sections:

- Header: title, status, total, category.
- FX lock box: original amount, rate, rate date, provider, settlement amount.
- Split breakdown table.
- Approval timeline.
- Comments/dispute.
- Receipt attachments.
- Linked calendar/task.
- Audit preview.

Primary actions:

- submit
- approve my share
- reject/request changes
- revise
- cancel
- create settlement

### Add expense flow

Recommended layout:

- Single responsive form with progressive sections.
- Sticky bottom action bar on mobile.

Fields:

1. What was paid?
2. When and where?
3. Who paid?
4. Who participates?
5. How to split?
6. Currency/FX preview.
7. Receipt/evidence.
8. Due date and calendar link.
9. Submit.

UX details:

- Show live split preview.
- Warn if split total mismatches.
- Show "This will not affect balances until approved."
- Show FX lock explanation.

### Approvals inbox

Purpose:

- One place to approve/reject assigned shares.

Cards:

- Who submitted.
- Your amount.
- Original and settlement currency.
- Category and receipt.
- Due date.
- Approve / Reject / Ask.

### Balances

Views:

- Who owes whom graph/list.
- My obligations.
- Settlement suggestions.
- Open obligations.
- Settlement history.

Important note:

- Pending proposals displayed separately from formal balance.

### Calendar

Views:

- Month.
- Week.
- List.
- Mobile agenda.

Event visual status:

- Pending approval.
- Due soon.
- Overdue.
- Completed.
- Disputed.

Filters:

- member
- event type
- category
- status

Current implementation keeps these filters in the page URL and applies them through the list APIs so refresh, load-more, desktop, and mobile views share the same result window.

### Tasks

Views:

- Board/list/calendar.
- Assigned to me.
- Recurring tasks.

Task card:

- title
- assignee(s)
- due date
- recurrence
- category
- status
- linked expense/event

### Audit

Use a timeline/table hybrid.

Filters:

- entity type
- actor
- action
- date range
- status

Each audit item:

- actor
- action
- entity
- before/after summary
- timestamp
- link to detail

### Settings

Sections:

- Household profile.
- Members and roles.
- Currency and FX policy.
- Approval policy.
- Categories/tags.
- Notifications.
- Export/backup.
- Danger zone.

## Component system

Use shadcn/ui primitives and wrappers:

- Button
- Input
- Select
- Combobox
- Dialog
- Sheet
- Drawer on mobile
- Popover
- Calendar/date picker
- Table
- Card
- Badge
- Tabs
- Command palette
- Toast/Sonner
- Form with react-hook-form + zod

## Visual language

### Layout

- Max-width content areas for forms.
- Full-width tables for desktop review pages.
- Sticky header/subnav for app shell.
- Mobile bottom nav.
- Use sheets/drawers for quick detail on desktop; full pages on mobile when complexity is high.

### Typography

- Use system or Geist-like sans font.
- Prefer clear size hierarchy.
- Use tabular numerals for money.

### Color/status tokens

Use semantic tokens rather than raw colors in components.

Statuses:

- pending
- approved
- rejected
- disputed
- matured
- settled
- overdue
- reversed

Each status must have:

- badge style
- icon or text marker
- localized label
- accessible contrast

### Empty states

Every primary page needs an empty state:

- Expenses: "No expenses yet. Add the first shared expense."
- Approvals: "You're all caught up."
- Calendar: "No events in this period."
- Tasks: "No tasks assigned."
- Audit: "No audit events match these filters."

### Loading states

- Skeleton cards for dashboard.
- Table skeleton rows.
- Form submit loading state.
- Avoid spinners as only feedback.

### Error states

- Inline validation for forms.
- Toast for mutation failures.
- Recoverable error panels for data loading.
- Include retry action.

## Mobile UX requirements

- Primary action buttons must be reachable by thumb.
- Dialogs that contain forms should become full-screen drawers/sheets on small screens.
- Tables collapse to cards.
- Calendar mobile default is agenda/list, with month option.
- Approval cards must show receipt preview and amount without horizontal scrolling.

## Accessibility

- All form controls have labels.
- Dialog focus trap works.
- Keyboard navigation for command palette and dropdowns.
- No status indicated only by color.
- Money values have text labels.
- Calendar events have accessible names.

## Bilingual UX

Locale switcher:

- available in user menu and settings.
- route-aware if using locale-prefixed routes.

Naming examples:

| Key                       | en-US                                         | zh-CN                        |
| ------------------------- | --------------------------------------------- | ---------------------------- |
| `nav.expenses`            | Expenses                                      | 开销                         |
| `nav.approvals`           | Approvals                                     | 审批                         |
| `status.pending`          | Pending                                       | 待确认                       |
| `status.matured`          | In ledger                                     | 已入账                       |
| `fx.lockedRate`           | Locked rate                                   | 锁定汇率                     |
| `expense.noBalanceEffect` | This will not affect balances until approved. | 通过确认前不会影响正式余额。 |

## UX copy rules

Use roommate-friendly language:

- Prefer "You owe Alice ¥287.20" over "Debit balance generated."
- Prefer "Pending approval" over "Unmatured liability."
- Explain FX with a short expandable note.

## Critical interaction details

### Approval

Approval screen must show:

- submitted by
- payer/creditor
- your assigned amount
- how split was calculated
- FX conversion if any
- due date
- receipt
- approve/reject actions

### FX explanation

Example copy:

> This expense was paid in USD. Your household settles in CNY. Roompire locked the USD/CNY rate for the expense date, so later exchange-rate changes will not change this debt.

### Pending vs formal balance

Always separate:

- Formal balance: approved ledger obligations only.
- Pending impact: proposals awaiting approval.

Do not mix these numbers without explicit labels.
