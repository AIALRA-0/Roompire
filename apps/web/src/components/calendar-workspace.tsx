"use client";

import {
  CalendarDays,
  Check,
  Kanban,
  ListChecks,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SerializedCalendarEvent, SerializedTask } from "@/server/calendar/serializers";

const eventTypeKeys = [
  "TASK",
  "CHORE",
  "GROUP_ACTIVITY",
  "BILL_DUE",
  "REPAYMENT_DUE",
  "SETTLEMENT_REMINDER",
  "RECURRING_EXPENSE_GENERATION",
] as const;

const priorityKeys = ["LOW", "NORMAL", "HIGH"] as const;
const recurrenceKeys = ["NONE", "DAILY", "WEEKLY", "MONTHLY"] as const;
const expenseProposalEventTypes = new Set<EventTypeKey>([
  "CHORE",
  "GROUP_ACTIVITY",
  "BILL_DUE",
  "RECURRING_EXPENSE_GENERATION",
]);

type EventTypeKey = (typeof eventTypeKeys)[number];
type PriorityKey = (typeof priorityKeys)[number];
type RecurrenceKey = (typeof recurrenceKeys)[number];
type StatusKey = "OPEN" | "COMPLETED";
type EventViewMode = "LIST" | "DAY" | "WEEK" | "MONTH";
type TaskViewMode = "LIST" | "BOARD" | "CALENDAR";

type CalendarWorkspaceMember = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
};

type ExpenseCategorySummary = {
  id: string;
  name: string;
};

type CalendarWorkspaceLabels = {
  events: string;
  eventsHint: string;
  tasks: string;
  tasksHint: string;
  newEvent: string;
  newTask: string;
  eventTitle: string;
  taskTitle: string;
  type: string;
  priority: string;
  startAt: string;
  endAt: string;
  dueAt: string;
  description: string;
  assignees: string;
  allDay: string;
  recurrence: string;
  recurrenceCount: string;
  createEvent: string;
  createTask: string;
  completeTask: string;
  editEvent: string;
  saveEvent: string;
  deleteEvent: string;
  deleteEventConfirm: string;
  editTask: string;
  saveTask: string;
  deleteTask: string;
  deleteTaskConfirm: string;
  cancelEdit: string;
  eventCreated: string;
  eventUpdated: string;
  eventDeleted: string;
  taskCreated: string;
  taskUpdated: string;
  taskDeleted: string;
  taskCompleted: string;
  noEvents: string;
  noEventsInView: string;
  noTasks: string;
  loadMore: string;
  noDueDate: string;
  cannotCreate: string;
  noHousehold: string;
  working: string;
  errorFallback: string;
  linkedTask: string;
  linkedExpenseProposal: string;
  autoProposalTemplate: string;
  autoProposalTemplateConfigured: string;
  autoProposalTitle: string;
  createExpenseProposal: string;
  expenseProposalCreated: string;
  openProposal: string;
  proposalTitle: string;
  merchant: string;
  category: string;
  uncategorized: string;
  expenseDate: string;
  dueDate: string;
  originalAmount: string;
  originalCurrency: string;
  settlementCurrency: string;
  fxRate: string;
  debtors: string;
  payerShareIncluded: string;
  submitProposal: string;
  eventViewList: string;
  eventViewDay: string;
  eventViewWeek: string;
  eventViewMonth: string;
  taskViewList: string;
  taskViewBoard: string;
  taskViewCalendar: string;
  taskBoardOpen: string;
  taskBoardCompleted: string;
  taskCalendarUnscheduled: string;
  noTasksInView: string;
  eventTypes: Record<EventTypeKey, string>;
  priorities: Record<PriorityKey, string>;
  recurrences: Record<RecurrenceKey, string>;
  statuses: Record<StatusKey, string>;
};

type CalendarWorkspaceProps = {
  activeHouseholdId: string | null;
  canCreateWorkItems: boolean;
  canCreateExpenseProposals: boolean;
  categories: ExpenseCategorySummary[];
  currentUserId: string;
  eventLoadMoreHref: string | null;
  events: SerializedCalendarEvent[];
  taskLoadMoreHref: string | null;
  tasks: SerializedTask[];
  members: CalendarWorkspaceMember[];
  labels: CalendarWorkspaceLabels;
  locale: string;
  settlementCurrency: string | null;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

async function postCalendarMutation<T>(
  url: string,
  body: unknown,
  errorFallback: string,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
    throw new Error(errorPayload?.error?.message ?? errorFallback);
  }

  return payload as T;
}

function Field({
  label,
  children,
}: Readonly<{
  label: string;
  children: ReactNode;
}>) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatDateTime(value: string | null, locale: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dateTimeLocalInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 16);
}

function dateOnly(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function statusVariant(status: string) {
  return status === "COMPLETED" ? "success" : "neutral";
}

function memberName(memberNamesByUserId: Map<string, string>, userId: string) {
  return memberNamesByUserId.get(userId) ?? userId;
}

function utcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function startOfUtcWeek(value: Date) {
  return addUtcDays(startOfUtcDay(value), -value.getUTCDay());
}

function buildWeekDays(referenceDate: Date) {
  const start = startOfUtcWeek(referenceDate);

  return Array.from({ length: 7 }, (_, index) => addUtcDays(start, index));
}

function buildMonthDays(referenceDate: Date) {
  const firstOfMonth = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
  );
  const start = startOfUtcWeek(firstOfMonth);

  return Array.from({ length: 42 }, (_, index) => addUtcDays(start, index));
}

function formatDayHeading(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatMonthHeading(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(value);
}

export function CalendarWorkspace({
  activeHouseholdId,
  canCreateExpenseProposals,
  canCreateWorkItems,
  categories,
  currentUserId,
  eventLoadMoreHref,
  events,
  taskLoadMoreHref,
  tasks,
  members,
  labels,
  locale,
  settlementCurrency,
}: CalendarWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [eventViewMode, setEventViewMode] = useState<EventViewMode>("LIST");
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>("LIST");
  const [expandedExpenseEventId, setExpandedExpenseEventId] = useState<string | null>(null);
  const [expandedExpenseTaskId, setExpandedExpenseTaskId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newEventType, setNewEventType] = useState<EventTypeKey>("GROUP_ACTIVITY");
  const writableMembers = members.filter((member) => member.role !== "VIEWER");
  const expenseDebtorOptions = members.filter(
    (member) => member.role !== "VIEWER" && member.userId !== currentUserId,
  );
  const memberNamesByUserId = useMemo(
    () => new Map(members.map((member) => [member.userId, member.displayName])),
    [members],
  );
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (left, right) =>
          new Date(left.startAt).getTime() - new Date(right.startAt).getTime() ||
          left.id.localeCompare(right.id),
      ),
    [events],
  );
  const referenceDate = useMemo(
    () => (sortedEvents[0] ? new Date(sortedEvents[0].startAt) : new Date()),
    [sortedEvents],
  );
  const weekDays = useMemo(() => buildWeekDays(referenceDate), [referenceDate]);
  const monthDays = useMemo(() => buildMonthDays(referenceDate), [referenceDate]);
  const eventsByDate = useMemo(() => {
    const groupedEvents = new Map<string, SerializedCalendarEvent[]>();

    for (const event of sortedEvents) {
      const key = utcDateKey(new Date(event.startAt));
      const dayEvents = groupedEvents.get(key) ?? [];

      dayEvents.push(event);
      groupedEvents.set(key, dayEvents);
    }

    return groupedEvents;
  }, [sortedEvents]);
  const dayKey = utcDateKey(startOfUtcDay(referenceDate));
  const dayEvents = eventsByDate.get(dayKey) ?? [];
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === "OPEN" ? -1 : 1;
        }

        if (left.dueAt && right.dueAt) {
          return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
        }

        if (left.dueAt) {
          return -1;
        }

        if (right.dueAt) {
          return 1;
        }

        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }),
    [tasks],
  );
  const taskReferenceDate = useMemo(() => {
    const firstDueTask = sortedTasks.find((task) => task.dueAt);

    return firstDueTask?.dueAt ? new Date(firstDueTask.dueAt) : referenceDate;
  }, [referenceDate, sortedTasks]);
  const taskMonthDays = useMemo(() => buildMonthDays(taskReferenceDate), [taskReferenceDate]);
  const tasksByDueDate = useMemo(() => {
    const groupedTasks = new Map<string, SerializedTask[]>();

    for (const task of sortedTasks) {
      if (!task.dueAt) {
        continue;
      }

      const key = utcDateKey(new Date(task.dueAt));
      const dayTasks = groupedTasks.get(key) ?? [];

      dayTasks.push(task);
      groupedTasks.set(key, dayTasks);
    }

    return groupedTasks;
  }, [sortedTasks]);
  const unscheduledTasks = useMemo(() => sortedTasks.filter((task) => !task.dueAt), [sortedTasks]);
  const taskBoardColumns = useMemo(
    () =>
      [
        {
          id: "OPEN" as const,
          label: labels.taskBoardOpen,
          tasks: sortedTasks.filter((task) => task.status === "OPEN"),
        },
        {
          id: "COMPLETED" as const,
          label: labels.taskBoardCompleted,
          tasks: sortedTasks.filter((task) => task.status === "COMPLETED"),
        },
      ] satisfies Array<{ id: StatusKey; label: string; tasks: SerializedTask[] }>,
    [labels.taskBoardCompleted, labels.taskBoardOpen, sortedTasks],
  );
  const taskAssignmentsByTaskId = useMemo(
    () =>
      new Map(
        tasks.map((task) => [
          task.id,
          task.assignments.map((assignment) =>
            memberName(memberNamesByUserId, assignment.assignedUserId),
          ),
        ]),
      ),
    [memberNamesByUserId, tasks],
  );

  function renderTaskItem(task: SerializedTask, surface: "list" | "board" = "list") {
    const assigneeNames = taskAssignmentsByTaskId.get(task.id) ?? [];
    const taskStatus = task.status as StatusKey;
    const hasLinkedProposal = task.linkedProposalIds.length > 0;
    const isExpenseFormOpen = expandedExpenseTaskId === task.id;
    const isEditingTask = editingTaskId === task.id;
    const canCreateTaskExpenseProposal =
      canCreateExpenseProposals && !hasLinkedProposal && expenseDebtorOptions.length > 0;
    const isTaskExpenseBusy = busyActionId === `task-expense-${task.id}`;
    const isTaskUpdateBusy = busyActionId === `task-update-${task.id}`;
    const isTaskDeleteBusy = busyActionId === `task-delete-${task.id}`;
    const assignedUserIds = new Set(
      task.assignments.map((assignment) => assignment.assignedUserId),
    );

    return (
      <div
        className={cn(
          "grid min-w-0 gap-3",
          surface === "board" ? "rounded-md border border-border bg-background p-3" : "p-4",
        )}
        data-testid={surface === "board" ? `task-board-card-${task.id}` : `task-row-${task.id}`}
        key={task.id}
      >
        <div
          className={cn(
            "grid min-w-0 gap-3",
            surface === "list" && "lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center",
          )}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 break-words text-sm font-medium">{task.title}</p>
              <Badge variant={statusVariant(task.status)}>
                {labels.statuses[taskStatus] ?? task.status}
              </Badge>
              <Badge variant="neutral">
                {labels.priorities[(task.priority as PriorityKey) ?? "NORMAL"] ?? task.priority}
              </Badge>
              {hasLinkedProposal ? <Badge>{labels.linkedExpenseProposal}</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {task.dueAt ? formatDateTime(task.dueAt, locale) : labels.noDueDate}
            </p>
            {assigneeNames.length > 0 ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {assigneeNames.join(", ")}
              </p>
            ) : null}
            {task.description ? (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
            ) : null}
          </div>
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              surface === "list" && "lg:justify-end",
            )}
          >
            {task.linkedProposalIds.map((proposalId) => (
              <Button asChild key={proposalId} size="sm" variant="outline">
                <Link
                  data-testid={`task-proposal-link-${task.id}-${proposalId}`}
                  href={`/${locale}/app/households/${activeHouseholdId}/expenses/proposals/${proposalId}`}
                >
                  {labels.openProposal}
                </Link>
              </Button>
            ))}
            <Button
              data-testid={`task-expense-toggle-${task.id}`}
              disabled={!canCreateTaskExpenseProposal || isTaskExpenseBusy || isPending}
              onClick={() => setExpandedExpenseTaskId(isExpenseFormOpen ? null : task.id)}
              type="button"
              variant="outline"
            >
              <ReceiptText aria-hidden="true" className="h-4 w-4" />
              {labels.createExpenseProposal}
            </Button>
            <Button
              data-testid={`task-complete-${task.id}`}
              disabled={
                !canCreateWorkItems ||
                task.status === "COMPLETED" ||
                busyActionId === `complete-${task.id}` ||
                isPending
              }
              onClick={() => void completeTask(task.id)}
              type="button"
              variant="outline"
            >
              <Check aria-hidden="true" className="h-4 w-4" />
              {busyActionId === `complete-${task.id}` ? labels.working : labels.completeTask}
            </Button>
            <Button
              data-testid={`task-edit-${task.id}`}
              disabled={!canCreateWorkItems || isTaskUpdateBusy || isPending}
              onClick={() => {
                setExpandedExpenseTaskId(null);
                setEditingTaskId(isEditingTask ? null : task.id);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {isEditingTask ? (
                <X aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Pencil aria-hidden="true" className="h-4 w-4" />
              )}
              {isEditingTask ? labels.cancelEdit : labels.editTask}
            </Button>
            <Button
              data-testid={`task-delete-${task.id}`}
              disabled={!canCreateWorkItems || hasLinkedProposal || isTaskDeleteBusy || isPending}
              onClick={() => void deleteTask(task.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {isTaskDeleteBusy ? labels.working : labels.deleteTask}
            </Button>
          </div>
        </div>
        {isEditingTask ? (
          <form
            className="grid gap-3 border-t border-border pt-3"
            data-testid={`task-edit-form-${task.id}`}
            onSubmit={(formEvent) => void updateTask(task.id, formEvent)}
          >
            <Field label={labels.taskTitle}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid={`task-edit-title-${task.id}`}
                defaultValue={task.title}
                maxLength={120}
                name="title"
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.priority}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-edit-priority-${task.id}`}
                  defaultValue={task.priority}
                  name="priority"
                >
                  {priorityKeys.map((priority) => (
                    <option key={priority} value={priority}>
                      {labels.priorities[priority]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.dueAt}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-edit-due-at-${task.id}`}
                  defaultValue={dateTimeLocalInputValue(task.dueAt)}
                  name="dueAt"
                  type="datetime-local"
                />
              </Field>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">{labels.assignees}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {writableMembers.map((member) => (
                  <label
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                    data-testid={`task-edit-assignee-row-${task.id}-${member.email}`}
                    key={member.userId}
                  >
                    <span className="min-w-0 overflow-hidden">
                      <span className="block truncate font-medium">{member.displayName}</span>
                      <span className="block break-all text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </span>
                    <input
                      className="h-4 w-4 rounded border-input focus-ring"
                      data-testid={`task-edit-assignee-${task.id}-${member.email}`}
                      defaultChecked={assignedUserIds.has(member.userId)}
                      name="assignedUserIds"
                      type="checkbox"
                      value={member.userId}
                    />
                  </label>
                ))}
              </div>
            </div>
            <Field label={labels.description}>
              <textarea
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
                data-testid={`task-edit-description-${task.id}`}
                defaultValue={task.description ?? ""}
                maxLength={1000}
                name="description"
              />
            </Field>
            <Button
              data-testid={`task-save-${task.id}`}
              disabled={isTaskUpdateBusy || isPending}
              type="submit"
            >
              <Check aria-hidden="true" className="h-4 w-4" />
              {isTaskUpdateBusy ? labels.working : labels.saveTask}
            </Button>
          </form>
        ) : null}
        {isExpenseFormOpen ? (
          <form
            className="grid gap-3 border-t border-border pt-3"
            data-testid={`task-expense-form-${task.id}`}
            onSubmit={(event) => void createTaskExpenseProposal(task.id, event)}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.proposalTitle}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-expense-title-${task.id}`}
                  defaultValue={task.title}
                  maxLength={120}
                  name="title"
                  required
                />
              </Field>
              <Field label={labels.merchant}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-expense-merchant-${task.id}`}
                  name="merchant"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.category}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-expense-category-${task.id}`}
                  name="categoryId"
                >
                  <option value="">{labels.uncategorized}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.expenseDate}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-expense-date-${task.id}`}
                  defaultValue={dateOnly(new Date())}
                  name="expenseDate"
                  required
                  type="date"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={labels.dueDate}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-expense-due-date-${task.id}`}
                  defaultValue={task.dueAt ? dateOnly(task.dueAt) : ""}
                  name="dueDate"
                  type="date"
                />
              </Field>
              <Field label={labels.originalAmount}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-expense-amount-${task.id}`}
                  min="0.01"
                  name="originalAmount"
                  required
                  step="0.01"
                  type="number"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={labels.originalCurrency}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
                  data-testid={`task-expense-original-currency-${task.id}`}
                  defaultValue={settlementCurrency ?? "USD"}
                  maxLength={3}
                  minLength={3}
                  name="originalCurrency"
                  required
                />
              </Field>
              <Field label={labels.settlementCurrency}>
                <input
                  className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
                  data-testid={`task-expense-settlement-currency-${task.id}`}
                  disabled
                  value={settlementCurrency ?? ""}
                />
              </Field>
              <Field label={labels.fxRate}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid={`task-expense-fx-rate-${task.id}`}
                  defaultValue="1"
                  min="0.000001"
                  name="fxRate"
                  step="0.000001"
                  type="number"
                />
              </Field>
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{labels.debtors}</legend>
              <p className="text-xs text-muted-foreground">{labels.payerShareIncluded}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {expenseDebtorOptions.map((member) => (
                  <label className="flex items-center gap-2 text-sm" key={member.userId}>
                    <input
                      className="h-4 w-4 rounded border-input"
                      data-testid={`task-expense-debtor-${task.id}-${member.email}`}
                      name="participantUserIds"
                      type="checkbox"
                      value={member.userId}
                    />
                    <span className="min-w-0 truncate">
                      {member.displayName} · {member.email}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              data-testid={`task-expense-submit-${task.id}`}
              disabled={isTaskExpenseBusy || isPending}
              type="submit"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {isTaskExpenseBusy ? labels.working : labels.submitProposal}
            </Button>
          </form>
        ) : null}
      </div>
    );
  }

  function renderTaskCalendarItem(task: SerializedTask) {
    const taskStatus = task.status as StatusKey;

    return (
      <div
        className="rounded-md border border-border bg-background px-2 py-1.5"
        data-testid={`task-calendar-item-${task.id}`}
        key={task.id}
      >
        <p className="truncate text-xs font-medium">{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant={statusVariant(task.status)}>
            {labels.statuses[taskStatus] ?? task.status}
          </Badge>
          <Badge variant="neutral">
            {labels.priorities[(task.priority as PriorityKey) ?? "NORMAL"] ?? task.priority}
          </Badge>
        </div>
      </div>
    );
  }

  if (!activeHouseholdId) {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">{labels.noHousehold}</p>
      </section>
    );
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId("event");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const eventType = String(formData.get("type") ?? "GROUP_ACTIVITY") as EventTypeKey;
    const autoProposalParticipantUserIds = formData
      .getAll("autoProposalParticipantUserIds")
      .map(String);
    const recurringExpenseTemplate =
      eventType === "RECURRING_EXPENSE_GENERATION"
        ? {
            title: String(formData.get("autoProposalTitle") ?? "") || undefined,
            merchant: String(formData.get("autoProposalMerchant") ?? "") || undefined,
            categoryId: String(formData.get("autoProposalCategoryId") ?? "") || undefined,
            originalAmount: String(formData.get("autoProposalOriginalAmount") ?? ""),
            originalCurrency: String(formData.get("autoProposalOriginalCurrency") ?? ""),
            fxRate: String(formData.get("autoProposalFxRate") ?? "") || undefined,
            participantUserIds: autoProposalParticipantUserIds,
          }
        : undefined;

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/calendar/events`,
        {
          title: String(formData.get("title") ?? ""),
          type: eventType,
          startAt: String(formData.get("startAt") ?? ""),
          endAt: String(formData.get("endAt") ?? ""),
          allDay: formData.get("allDay") === "on",
          recurrenceFrequency: String(formData.get("recurrenceFrequency") ?? "NONE"),
          recurrenceCount: Number(formData.get("recurrenceCount") ?? 1),
          description: String(formData.get("description") ?? ""),
          recurringExpenseTemplate,
        },
        labels.errorFallback,
      );
      form.reset();
      setNewEventType("GROUP_ACTIVITY");
      setMessage(labels.eventCreated);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function updateEvent(eventId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId(`event-update-${eventId}`);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/calendar/events/${eventId}`,
        {
          title: String(formData.get("title") ?? ""),
          type: String(formData.get("type") ?? "GROUP_ACTIVITY"),
          startAt: String(formData.get("startAt") ?? ""),
          endAt: String(formData.get("endAt") ?? ""),
          allDay: formData.get("allDay") === "on",
          description: String(formData.get("description") ?? ""),
        },
        labels.errorFallback,
        "PATCH",
      );
      setEditingEventId(null);
      setMessage(labels.eventUpdated);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function deleteEvent(eventId: string) {
    if (!window.confirm(labels.deleteEventConfirm)) {
      return;
    }

    setMessage(null);
    setBusyActionId(`event-delete-${eventId}`);

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/calendar/events/${eventId}`,
        {},
        labels.errorFallback,
        "DELETE",
      );
      setExpandedExpenseEventId(null);
      setEditingEventId(null);
      setMessage(labels.eventDeleted);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId("task");

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/tasks`,
        {
          title: String(formData.get("title") ?? ""),
          priority: String(formData.get("priority") ?? "NORMAL"),
          dueAt: String(formData.get("dueAt") ?? ""),
          assignedUserIds: formData.getAll("assignedUserIds").map(String),
          recurrenceFrequency: String(formData.get("recurrenceFrequency") ?? "NONE"),
          recurrenceCount: Number(formData.get("recurrenceCount") ?? 1),
          description: String(formData.get("description") ?? ""),
        },
        labels.errorFallback,
      );
      form.reset();
      setMessage(labels.taskCreated);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function updateTask(taskId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId(`task-update-${taskId}`);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/tasks/${taskId}`,
        {
          title: String(formData.get("title") ?? ""),
          priority: String(formData.get("priority") ?? "NORMAL"),
          dueAt: String(formData.get("dueAt") ?? ""),
          assignedUserIds: formData.getAll("assignedUserIds").map(String),
          description: String(formData.get("description") ?? ""),
        },
        labels.errorFallback,
        "PATCH",
      );
      setEditingTaskId(null);
      setMessage(labels.taskUpdated);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm(labels.deleteTaskConfirm)) {
      return;
    }

    setMessage(null);
    setBusyActionId(`task-delete-${taskId}`);

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/tasks/${taskId}`,
        {},
        labels.errorFallback,
        "DELETE",
      );
      setExpandedExpenseTaskId(null);
      setEditingTaskId(null);
      setMessage(labels.taskDeleted);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function completeTask(taskId: string) {
    setMessage(null);
    setBusyActionId(`complete-${taskId}`);

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/tasks/${taskId}/complete`,
        {},
        labels.errorFallback,
      );
      setMessage(labels.taskCompleted);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function createTaskExpenseProposal(taskId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId(`task-expense-${taskId}`);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/tasks/${taskId}/create-expense-proposal`,
        {
          title: String(formData.get("title") ?? ""),
          merchant: String(formData.get("merchant") ?? ""),
          categoryId: String(formData.get("categoryId") ?? ""),
          expenseDate: String(formData.get("expenseDate") ?? ""),
          dueDate: String(formData.get("dueDate") ?? ""),
          originalAmount: String(formData.get("originalAmount") ?? ""),
          originalCurrency: String(formData.get("originalCurrency") ?? "").toUpperCase(),
          fxRate: String(formData.get("fxRate") ?? ""),
          participantUserIds: formData.getAll("participantUserIds").map(String),
          splitMethod: "EQUAL",
        },
        labels.errorFallback,
      );
      form.reset();
      setExpandedExpenseTaskId(null);
      setMessage(labels.expenseProposalCreated);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function createEventExpenseProposal(eventId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId(`event-expense-${eventId}`);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/calendar/events/${eventId}/create-expense-proposal`,
        {
          title: String(formData.get("title") ?? ""),
          merchant: String(formData.get("merchant") ?? ""),
          categoryId: String(formData.get("categoryId") ?? ""),
          expenseDate: String(formData.get("expenseDate") ?? ""),
          dueDate: String(formData.get("dueDate") ?? ""),
          originalAmount: String(formData.get("originalAmount") ?? ""),
          originalCurrency: String(formData.get("originalCurrency") ?? "").toUpperCase(),
          fxRate: String(formData.get("fxRate") ?? ""),
          participantUserIds: formData.getAll("participantUserIds").map(String),
          splitMethod: "EQUAL",
        },
        labels.errorFallback,
      );
      form.reset();
      setExpandedExpenseEventId(null);
      setMessage(labels.expenseProposalCreated);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-6">
        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays aria-hidden="true" className="h-5 w-5 text-primary" />
              {labels.newEvent}
            </h2>
          </div>
          <form className="grid gap-3 p-5" onSubmit={createEvent}>
            <Field label={labels.eventTitle}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="calendar-event-title"
                disabled={!canCreateWorkItems}
                maxLength={120}
                name="title"
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field label={labels.type}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="calendar-event-type"
                  disabled={!canCreateWorkItems}
                  name="type"
                  onChange={(event) => setNewEventType(event.target.value as EventTypeKey)}
                  value={newEventType}
                >
                  {eventTypeKeys.map((type) => (
                    <option key={type} value={type}>
                      {labels.eventTypes[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.startAt}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="calendar-event-start"
                  disabled={!canCreateWorkItems}
                  name="startAt"
                  required
                  type="datetime-local"
                />
              </Field>
            </div>
            <Field label={labels.endAt}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="calendar-event-end"
                disabled={!canCreateWorkItems}
                name="endAt"
                type="datetime-local"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                className="h-4 w-4 rounded border-input focus-ring"
                data-testid="calendar-event-all-day"
                disabled={!canCreateWorkItems}
                name="allDay"
                type="checkbox"
              />
              {labels.allDay}
            </label>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field label={labels.recurrence}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="calendar-event-recurrence"
                  defaultValue="NONE"
                  disabled={!canCreateWorkItems}
                  name="recurrenceFrequency"
                >
                  {recurrenceKeys.map((recurrence) => (
                    <option key={recurrence} value={recurrence}>
                      {labels.recurrences[recurrence]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.recurrenceCount}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="calendar-event-recurrence-count"
                  defaultValue="1"
                  disabled={!canCreateWorkItems}
                  max="12"
                  min="1"
                  name="recurrenceCount"
                  type="number"
                />
              </Field>
            </div>
            <Field label={labels.description}>
              <textarea
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
                data-testid="calendar-event-description"
                disabled={!canCreateWorkItems}
                maxLength={1000}
                name="description"
              />
            </Field>
            {newEventType === "RECURRING_EXPENSE_GENERATION" ? (
              <fieldset className="grid gap-3 border-t border-border pt-3">
                <legend className="text-sm font-semibold">{labels.autoProposalTemplate}</legend>
                <Field label={labels.autoProposalTitle}>
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                    data-testid="calendar-event-auto-proposal-title"
                    disabled={!canCreateWorkItems}
                    maxLength={120}
                    name="autoProposalTitle"
                    placeholder={labels.eventTitle}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <Field label={labels.merchant}>
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      data-testid="calendar-event-auto-proposal-merchant"
                      disabled={!canCreateWorkItems}
                      maxLength={120}
                      name="autoProposalMerchant"
                    />
                  </Field>
                  <Field label={labels.category}>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      data-testid="calendar-event-auto-proposal-category"
                      disabled={!canCreateWorkItems}
                      name="autoProposalCategoryId"
                    >
                      <option value="">{labels.uncategorized}</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <Field label={labels.originalAmount}>
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      data-testid="calendar-event-auto-proposal-amount"
                      disabled={!canCreateWorkItems}
                      min="0.01"
                      name="autoProposalOriginalAmount"
                      required
                      step="0.01"
                      type="number"
                    />
                  </Field>
                  <Field label={labels.originalCurrency}>
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
                      data-testid="calendar-event-auto-proposal-original-currency"
                      defaultValue={settlementCurrency ?? "USD"}
                      disabled={!canCreateWorkItems}
                      maxLength={3}
                      minLength={3}
                      name="autoProposalOriginalCurrency"
                      required
                    />
                  </Field>
                  <Field label={labels.fxRate}>
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      data-testid="calendar-event-auto-proposal-fx-rate"
                      defaultValue="1"
                      disabled={!canCreateWorkItems}
                      min="0.000001"
                      name="autoProposalFxRate"
                      step="0.000001"
                      type="number"
                    />
                  </Field>
                </div>
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium">{labels.debtors}</legend>
                  <p className="text-xs text-muted-foreground">{labels.payerShareIncluded}</p>
                  <div className="grid gap-2">
                    {expenseDebtorOptions.map((member) => (
                      <label
                        className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                        data-testid={`calendar-event-auto-proposal-debtor-row-${member.email}`}
                        key={member.userId}
                      >
                        <span className="min-w-0 overflow-hidden">
                          <span className="block truncate font-medium">{member.displayName}</span>
                          <span className="block break-all text-xs text-muted-foreground">
                            {member.email}
                          </span>
                        </span>
                        <input
                          className="h-4 w-4 rounded border-input"
                          data-testid={`calendar-event-auto-proposal-debtor-${member.email}`}
                          disabled={!canCreateWorkItems}
                          name="autoProposalParticipantUserIds"
                          type="checkbox"
                          value={member.userId}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              </fieldset>
            ) : null}
            <Button
              data-testid="calendar-event-submit"
              disabled={!canCreateWorkItems || busyActionId === "event" || isPending}
              type="submit"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {busyActionId === "event" ? labels.working : labels.createEvent}
            </Button>
          </form>
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ListChecks aria-hidden="true" className="h-5 w-5 text-primary" />
              {labels.newTask}
            </h2>
          </div>
          <form className="grid gap-3 p-5" onSubmit={createTask}>
            <Field label={labels.taskTitle}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="task-title"
                disabled={!canCreateWorkItems}
                maxLength={120}
                name="title"
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field label={labels.priority}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="task-priority"
                  defaultValue="NORMAL"
                  disabled={!canCreateWorkItems}
                  name="priority"
                >
                  {priorityKeys.map((priority) => (
                    <option key={priority} value={priority}>
                      {labels.priorities[priority]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.dueAt}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="task-due-at"
                  disabled={!canCreateWorkItems}
                  name="dueAt"
                  type="datetime-local"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field label={labels.recurrence}>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="task-recurrence"
                  defaultValue="NONE"
                  disabled={!canCreateWorkItems}
                  name="recurrenceFrequency"
                >
                  {recurrenceKeys.map((recurrence) => (
                    <option key={recurrence} value={recurrence}>
                      {labels.recurrences[recurrence]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.recurrenceCount}>
                <input
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                  data-testid="task-recurrence-count"
                  defaultValue="1"
                  disabled={!canCreateWorkItems}
                  max="12"
                  min="1"
                  name="recurrenceCount"
                  type="number"
                />
              </Field>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">{labels.assignees}</p>
              <div className="grid gap-2">
                {writableMembers.map((member) => (
                  <label
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                    data-testid={`task-assignee-row-${member.email}`}
                    key={member.userId}
                  >
                    <span className="min-w-0 overflow-hidden">
                      <span className="block truncate font-medium">{member.displayName}</span>
                      <span className="block break-all text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </span>
                    <input
                      className="h-4 w-4 rounded border-input focus-ring"
                      data-testid={`task-assignee-${member.email}`}
                      disabled={!canCreateWorkItems}
                      name="assignedUserIds"
                      type="checkbox"
                      value={member.userId}
                    />
                  </label>
                ))}
              </div>
            </div>
            <Field label={labels.description}>
              <textarea
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
                data-testid="task-description"
                disabled={!canCreateWorkItems}
                maxLength={1000}
                name="description"
              />
            </Field>
            <Button
              data-testid="task-submit"
              disabled={!canCreateWorkItems || busyActionId === "task" || isPending}
              type="submit"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {busyActionId === "task" ? labels.working : labels.createTask}
            </Button>
          </form>
        </div>

        {!canCreateWorkItems ? (
          <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            {labels.cannotCreate}
          </div>
        ) : null}
      </div>

      <div className="grid min-w-0 content-start gap-6">
        {message ? (
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{message}</div>
        ) : null}

        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{labels.events}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{labels.eventsHint}</p>
              </div>
              <div
                aria-label={labels.events}
                className="inline-flex rounded-md border border-border bg-background p-1"
                role="tablist"
              >
                {[
                  { mode: "LIST", label: labels.eventViewList },
                  { mode: "DAY", label: labels.eventViewDay },
                  { mode: "WEEK", label: labels.eventViewWeek },
                  { mode: "MONTH", label: labels.eventViewMonth },
                ].map(({ mode, label }) => (
                  <button
                    aria-selected={eventViewMode === mode}
                    className={`focus-ring h-8 rounded px-3 text-sm font-medium transition-colors ${
                      eventViewMode === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    data-testid={`calendar-view-${mode.toLowerCase()}`}
                    key={mode}
                    onClick={() => setEventViewMode(mode as EventViewMode)}
                    role="tab"
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {sortedEvents.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{labels.noEvents}</p>
          ) : (
            <>
              {eventViewMode === "LIST" ? (
                <div className="divide-y divide-border">
                  {sortedEvents.map((event) => {
                    const eventType = event.type as EventTypeKey;
                    const linkedProposalIds = event.links
                      .filter((link) => link.linkedType === "expense_proposal")
                      .map((link) => link.linkedId);
                    const hasLinkedProposal = linkedProposalIds.length > 0;
                    const isExpenseFormOpen = expandedExpenseEventId === event.id;
                    const isEditingEvent = editingEventId === event.id;
                    const isSystemLinkedEvent = event.links.some(
                      (link) => link.linkedType === "task" || link.linkedType === "debt_obligation",
                    );
                    const canCreateEventExpenseProposal =
                      canCreateExpenseProposals &&
                      expenseProposalEventTypes.has(eventType) &&
                      !hasLinkedProposal &&
                      expenseDebtorOptions.length > 0;
                    const canEditEvent = canCreateWorkItems && !isSystemLinkedEvent;
                    const isEventExpenseBusy = busyActionId === `event-expense-${event.id}`;
                    const isEventUpdateBusy = busyActionId === `event-update-${event.id}`;
                    const isEventDeleteBusy = busyActionId === `event-delete-${event.id}`;

                    return (
                      <div
                        className="grid gap-3 p-4"
                        data-testid={`calendar-event-row-${event.id}`}
                        key={event.id}
                      >
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium">{event.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDateTime(event.startAt, locale)}
                            </p>
                            {event.description ? (
                              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                {event.description}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <Badge variant="neutral">{labels.eventTypes[eventType]}</Badge>
                            <Badge variant={statusVariant(event.status)}>
                              {labels.statuses[(event.status as StatusKey) ?? "OPEN"] ??
                                event.status}
                            </Badge>
                            {event.links.some((link) => link.linkedType === "task") ? (
                              <Badge>{labels.linkedTask}</Badge>
                            ) : null}
                            {hasLinkedProposal ? (
                              <Badge>{labels.linkedExpenseProposal}</Badge>
                            ) : null}
                            {event.recurringExpenseTemplate ? (
                              <Badge variant="neutral">
                                {labels.autoProposalTemplateConfigured}
                              </Badge>
                            ) : null}
                            {linkedProposalIds.map((proposalId) => (
                              <Button asChild key={proposalId} size="sm" variant="outline">
                                <Link
                                  data-testid={`event-proposal-link-${event.id}-${proposalId}`}
                                  href={`/${locale}/app/households/${activeHouseholdId}/expenses/proposals/${proposalId}`}
                                >
                                  {labels.openProposal}
                                </Link>
                              </Button>
                            ))}
                            <Button
                              data-testid={`event-expense-toggle-${event.id}`}
                              disabled={
                                !canCreateEventExpenseProposal || isEventExpenseBusy || isPending
                              }
                              onClick={() =>
                                setExpandedExpenseEventId(isExpenseFormOpen ? null : event.id)
                              }
                              type="button"
                              variant="outline"
                            >
                              <ReceiptText aria-hidden="true" className="h-4 w-4" />
                              {labels.createExpenseProposal}
                            </Button>
                            <Button
                              data-testid={`calendar-event-edit-${event.id}`}
                              disabled={!canEditEvent || isEventUpdateBusy || isPending}
                              onClick={() => {
                                setExpandedExpenseEventId(null);
                                setEditingEventId(isEditingEvent ? null : event.id);
                              }}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {isEditingEvent ? (
                                <X aria-hidden="true" className="h-4 w-4" />
                              ) : (
                                <Pencil aria-hidden="true" className="h-4 w-4" />
                              )}
                              {isEditingEvent ? labels.cancelEdit : labels.editEvent}
                            </Button>
                            <Button
                              data-testid={`calendar-event-delete-${event.id}`}
                              disabled={!canEditEvent || isEventDeleteBusy || isPending}
                              onClick={() => void deleteEvent(event.id)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                              {isEventDeleteBusy ? labels.working : labels.deleteEvent}
                            </Button>
                          </div>
                        </div>
                        {isEditingEvent ? (
                          <form
                            className="grid gap-3 border-t border-border pt-3"
                            data-testid={`calendar-event-edit-form-${event.id}`}
                            onSubmit={(formEvent) => void updateEvent(event.id, formEvent)}
                          >
                            <Field label={labels.eventTitle}>
                              <input
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                data-testid={`calendar-event-edit-title-${event.id}`}
                                defaultValue={event.title}
                                maxLength={120}
                                name="title"
                                required
                              />
                            </Field>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field label={labels.type}>
                                <select
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`calendar-event-edit-type-${event.id}`}
                                  defaultValue={event.type}
                                  name="type"
                                >
                                  {eventTypeKeys.map((type) => (
                                    <option key={type} value={type}>
                                      {labels.eventTypes[type]}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label={labels.startAt}>
                                <input
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`calendar-event-edit-start-${event.id}`}
                                  defaultValue={dateTimeLocalInputValue(event.startAt)}
                                  name="startAt"
                                  required
                                  type="datetime-local"
                                />
                              </Field>
                            </div>
                            <Field label={labels.endAt}>
                              <input
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                data-testid={`calendar-event-edit-end-${event.id}`}
                                defaultValue={dateTimeLocalInputValue(event.endAt)}
                                name="endAt"
                                type="datetime-local"
                              />
                            </Field>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                className="h-4 w-4 rounded border-input focus-ring"
                                data-testid={`calendar-event-edit-all-day-${event.id}`}
                                defaultChecked={event.allDay}
                                name="allDay"
                                type="checkbox"
                              />
                              {labels.allDay}
                            </label>
                            <Field label={labels.description}>
                              <textarea
                                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
                                data-testid={`calendar-event-edit-description-${event.id}`}
                                defaultValue={event.description ?? ""}
                                maxLength={1000}
                                name="description"
                              />
                            </Field>
                            <Button
                              data-testid={`calendar-event-save-${event.id}`}
                              disabled={isEventUpdateBusy || isPending}
                              type="submit"
                            >
                              <Check aria-hidden="true" className="h-4 w-4" />
                              {isEventUpdateBusy ? labels.working : labels.saveEvent}
                            </Button>
                          </form>
                        ) : null}
                        {isExpenseFormOpen ? (
                          <form
                            className="grid gap-3 border-t border-border pt-3"
                            data-testid={`event-expense-form-${event.id}`}
                            onSubmit={(formEvent) =>
                              void createEventExpenseProposal(event.id, formEvent)
                            }
                          >
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field label={labels.proposalTitle}>
                                <input
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`event-expense-title-${event.id}`}
                                  defaultValue={event.title}
                                  maxLength={120}
                                  name="title"
                                  required
                                />
                              </Field>
                              <Field label={labels.merchant}>
                                <input
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`event-expense-merchant-${event.id}`}
                                  name="merchant"
                                />
                              </Field>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field label={labels.category}>
                                <select
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`event-expense-category-${event.id}`}
                                  name="categoryId"
                                >
                                  <option value="">{labels.uncategorized}</option>
                                  {categories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label={labels.expenseDate}>
                                <input
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`event-expense-date-${event.id}`}
                                  defaultValue={dateOnly(event.startAt)}
                                  name="expenseDate"
                                  required
                                  type="date"
                                />
                              </Field>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field label={labels.dueDate}>
                                <input
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`event-expense-due-date-${event.id}`}
                                  defaultValue={dateOnly(event.startAt)}
                                  name="dueDate"
                                  type="date"
                                />
                              </Field>
                              <Field label={labels.originalAmount}>
                                <input
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`event-expense-amount-${event.id}`}
                                  min="0.01"
                                  name="originalAmount"
                                  required
                                  step="0.01"
                                  type="number"
                                />
                              </Field>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <Field label={labels.originalCurrency}>
                                <input
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
                                  data-testid={`event-expense-original-currency-${event.id}`}
                                  defaultValue={settlementCurrency ?? "USD"}
                                  maxLength={3}
                                  minLength={3}
                                  name="originalCurrency"
                                  required
                                />
                              </Field>
                              <Field label={labels.settlementCurrency}>
                                <input
                                  className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
                                  data-testid={`event-expense-settlement-currency-${event.id}`}
                                  disabled
                                  value={settlementCurrency ?? ""}
                                />
                              </Field>
                              <Field label={labels.fxRate}>
                                <input
                                  className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                                  data-testid={`event-expense-fx-rate-${event.id}`}
                                  defaultValue="1"
                                  min="0.000001"
                                  name="fxRate"
                                  step="0.000001"
                                  type="number"
                                />
                              </Field>
                            </div>
                            <fieldset className="grid gap-2">
                              <legend className="text-sm font-medium">{labels.debtors}</legend>
                              <p className="text-xs text-muted-foreground">
                                {labels.payerShareIncluded}
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {expenseDebtorOptions.map((member) => (
                                  <label
                                    className="flex items-center gap-2 text-sm"
                                    key={member.userId}
                                  >
                                    <input
                                      className="h-4 w-4 rounded border-input"
                                      data-testid={`event-expense-debtor-${event.id}-${member.email}`}
                                      name="participantUserIds"
                                      type="checkbox"
                                      value={member.userId}
                                    />
                                    <span className="min-w-0 truncate">
                                      {member.displayName} · {member.email}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <Button
                              data-testid={`event-expense-submit-${event.id}`}
                              disabled={isEventExpenseBusy || isPending}
                              type="submit"
                            >
                              <Plus aria-hidden="true" className="h-4 w-4" />
                              {isEventExpenseBusy ? labels.working : labels.submitProposal}
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {eventViewMode === "DAY" ? (
                <div data-testid="calendar-day-view">
                  <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                    {formatDayHeading(referenceDate, locale)}
                  </div>
                  <div
                    className="divide-y divide-border"
                    data-testid={`calendar-day-events-${dayKey}`}
                  >
                    {dayEvents.length > 0 ? (
                      dayEvents.map((event) => {
                        const eventType = event.type as EventTypeKey;
                        const eventStatus = event.status as StatusKey;

                        return (
                          <div
                            className="grid gap-3 p-4 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-start"
                            data-testid={`calendar-day-event-${event.id}`}
                            key={event.id}
                          >
                            <p className="text-sm font-medium text-muted-foreground">
                              {event.allDay ? labels.allDay : formatDateTime(event.startAt, locale)}
                            </p>
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold">{event.title}</p>
                              {event.description ? (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {event.description}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <Badge variant="neutral">{labels.eventTypes[eventType]}</Badge>
                              <Badge variant={statusVariant(event.status)}>
                                {labels.statuses[eventStatus] ?? event.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="p-4 text-sm text-muted-foreground">{labels.noEventsInView}</p>
                    )}
                  </div>
                </div>
              ) : null}
              {eventViewMode === "WEEK" ? (
                <div
                  className="grid gap-px bg-border sm:grid-cols-7"
                  data-testid="calendar-week-view"
                >
                  {weekDays.map((day) => {
                    const dayKey = utcDateKey(day);
                    const dayEvents = eventsByDate.get(dayKey) ?? [];

                    return (
                      <div
                        className="min-h-32 bg-card p-3"
                        data-testid={`calendar-week-day-${dayKey}`}
                        key={dayKey}
                      >
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          {formatDayHeading(day, locale)}
                        </p>
                        <div className="mt-3 grid gap-2">
                          {dayEvents.length > 0 ? (
                            dayEvents.map((event) => (
                              <div
                                className="rounded-md border border-border bg-background px-2 py-1.5"
                                data-testid={`calendar-week-event-${event.id}`}
                                key={event.id}
                              >
                                <p className="line-clamp-2 text-xs font-medium">{event.title}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {labels.eventTypes[event.type as EventTypeKey]}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground">{labels.noEventsInView}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {eventViewMode === "MONTH" ? (
                <div data-testid="calendar-month-view">
                  <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                    {formatMonthHeading(referenceDate, locale)}
                  </div>
                  <div className="grid gap-px bg-border sm:grid-cols-7">
                    {monthDays.map((day) => {
                      const dayKey = utcDateKey(day);
                      const dayEvents = eventsByDate.get(dayKey) ?? [];
                      const isReferenceMonth = day.getUTCMonth() === referenceDate.getUTCMonth();

                      return (
                        <div
                          className={`min-h-28 bg-card p-2 ${isReferenceMonth ? "" : "opacity-55"}`}
                          data-testid={`calendar-month-day-${dayKey}`}
                          key={dayKey}
                        >
                          <p className="text-xs font-semibold text-muted-foreground">
                            {day.getUTCDate()}
                          </p>
                          <div className="mt-2 grid gap-1.5">
                            {dayEvents.slice(0, 3).map((event) => (
                              <div
                                className="truncate rounded bg-muted px-2 py-1 text-[11px] font-medium"
                                data-testid={`calendar-month-event-${event.id}`}
                                key={event.id}
                              >
                                {event.title}
                              </div>
                            ))}
                            {dayEvents.length > 3 ? (
                              <p className="text-[11px] text-muted-foreground">
                                +{dayEvents.length - 3}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {eventLoadMoreHref ? (
                <div className="border-t border-border p-4 text-center">
                  <Button asChild variant="outline">
                    <Link data-testid="calendar-events-load-more" href={eventLoadMoreHref}>
                      {labels.loadMore}
                    </Link>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-col gap-4 border-b border-border p-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{labels.tasks}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{labels.tasksHint}</p>
            </div>
            <div
              aria-label={labels.tasks}
              className="inline-flex w-full rounded-md border border-border bg-background p-1 md:w-auto"
              role="tablist"
            >
              {[
                { mode: "LIST" as const, label: labels.taskViewList, icon: ListChecks },
                { mode: "BOARD" as const, label: labels.taskViewBoard, icon: Kanban },
                { mode: "CALENDAR" as const, label: labels.taskViewCalendar, icon: CalendarDays },
              ].map(({ icon: Icon, label, mode }) => (
                <button
                  aria-selected={taskViewMode === mode}
                  className={cn(
                    "focus-ring inline-flex h-9 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-medium transition-colors md:flex-none",
                    taskViewMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  data-testid={`task-view-${mode.toLowerCase()}`}
                  key={mode}
                  onClick={() => {
                    setExpandedExpenseTaskId(null);
                    setEditingTaskId(null);
                    setTaskViewMode(mode);
                  }}
                  role="tab"
                  type="button"
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          {tasks.length > 0 ? (
            <>
              {taskViewMode === "LIST" ? (
                <div className="divide-y divide-border" data-testid="task-list-view">
                  {sortedTasks.map((task) => renderTaskItem(task))}
                </div>
              ) : null}
              {taskViewMode === "BOARD" ? (
                <div className="grid gap-px bg-border md:grid-cols-2" data-testid="task-board-view">
                  {taskBoardColumns.map((column) => (
                    <section
                      className="min-h-64 bg-card p-4"
                      data-testid={`task-board-column-${column.id.toLowerCase()}`}
                      key={column.id}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold">{column.label}</h3>
                        <Badge variant={column.id === "COMPLETED" ? "success" : "neutral"}>
                          {column.tasks.length}
                        </Badge>
                      </div>
                      {column.tasks.length > 0 ? (
                        <div className="grid gap-3">
                          {column.tasks.map((task) => renderTaskItem(task, "board"))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{labels.noTasksInView}</p>
                      )}
                    </section>
                  ))}
                </div>
              ) : null}
              {taskViewMode === "CALENDAR" ? (
                <div data-testid="task-calendar-view">
                  <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                    {formatMonthHeading(taskReferenceDate, locale)}
                  </div>
                  <div className="grid gap-px bg-border sm:grid-cols-7">
                    {taskMonthDays.map((day) => {
                      const dayKey = utcDateKey(day);
                      const dayTasks = tasksByDueDate.get(dayKey) ?? [];
                      const isReferenceMonth =
                        day.getUTCMonth() === taskReferenceDate.getUTCMonth();

                      return (
                        <div
                          className={cn("min-h-28 bg-card p-2", !isReferenceMonth && "opacity-55")}
                          data-testid={`task-calendar-day-${dayKey}`}
                          key={dayKey}
                        >
                          <p className="text-xs font-semibold text-muted-foreground">
                            {day.getUTCDate()}
                          </p>
                          <div className="mt-2 grid gap-1.5">
                            {dayTasks.length > 0 ? (
                              dayTasks.map((task) => renderTaskCalendarItem(task))
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                {labels.noTasksInView}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {unscheduledTasks.length > 0 ? (
                    <div className="border-t border-border p-4" data-testid="task-unscheduled-list">
                      <h3 className="text-sm font-semibold">{labels.taskCalendarUnscheduled}</h3>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {unscheduledTasks.map((task) => renderTaskCalendarItem(task))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {taskLoadMoreHref ? (
                <div className="border-t border-border p-4 text-center">
                  <Button asChild variant="outline">
                    <Link data-testid="calendar-tasks-load-more" href={taskLoadMoreHref}>
                      {labels.loadMore}
                    </Link>
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">{labels.noTasks}</p>
          )}
        </div>
      </div>
    </section>
  );
}
