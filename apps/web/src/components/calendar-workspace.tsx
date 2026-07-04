"use client";

import { CalendarDays, Check, ListChecks, Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type EventTypeKey = (typeof eventTypeKeys)[number];
type PriorityKey = (typeof priorityKeys)[number];
type RecurrenceKey = (typeof recurrenceKeys)[number];
type StatusKey = "OPEN" | "COMPLETED";
type EventViewMode = "LIST" | "WEEK" | "MONTH";

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
  eventCreated: string;
  taskCreated: string;
  taskCompleted: string;
  noEvents: string;
  noEventsInView: string;
  noTasks: string;
  noDueDate: string;
  cannotCreate: string;
  noHousehold: string;
  working: string;
  errorFallback: string;
  linkedTask: string;
  linkedExpenseProposal: string;
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
  eventViewWeek: string;
  eventViewMonth: string;
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
  events: SerializedCalendarEvent[];
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
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
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
  events,
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
  const [expandedExpenseTaskId, setExpandedExpenseTaskId] = useState<string | null>(null);
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

    try {
      await postCalendarMutation(
        `/api/v1/households/${activeHouseholdId}/calendar/events`,
        {
          title: String(formData.get("title") ?? ""),
          type: String(formData.get("type") ?? "GROUP_ACTIVITY"),
          startAt: String(formData.get("startAt") ?? ""),
          endAt: String(formData.get("endAt") ?? ""),
          allDay: formData.get("allDay") === "on",
          recurrenceFrequency: String(formData.get("recurrenceFrequency") ?? "NONE"),
          recurrenceCount: Number(formData.get("recurrenceCount") ?? 1),
          description: String(formData.get("description") ?? ""),
        },
        labels.errorFallback,
      );
      form.reset();
      setMessage(labels.eventCreated);
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
                  defaultValue="GROUP_ACTIVITY"
                  disabled={!canCreateWorkItems}
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
                  {sortedEvents.map((event) => (
                    <div
                      className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      data-testid={`calendar-event-row-${event.id}`}
                      key={event.id}
                    >
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
                        <Badge variant="neutral">
                          {labels.eventTypes[event.type as EventTypeKey]}
                        </Badge>
                        <Badge variant={statusVariant(event.status)}>
                          {labels.statuses[(event.status as StatusKey) ?? "OPEN"] ?? event.status}
                        </Badge>
                        {event.links.some((link) => link.linkedType === "task") ? (
                          <Badge>{labels.linkedTask}</Badge>
                        ) : null}
                        {event.links.some((link) => link.linkedType === "expense_proposal") ? (
                          <Badge>{labels.linkedExpenseProposal}</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
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
            </>
          )}
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <h2 className="text-lg font-semibold">{labels.tasks}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{labels.tasksHint}</p>
          </div>
          {tasks.length > 0 ? (
            <div className="divide-y divide-border">
              {tasks.map((task) => {
                const assigneeNames = taskAssignmentsByTaskId.get(task.id) ?? [];
                const taskStatus = task.status as StatusKey;
                const hasLinkedProposal = task.linkedProposalIds.length > 0;
                const isExpenseFormOpen = expandedExpenseTaskId === task.id;
                const canCreateTaskExpenseProposal =
                  canCreateExpenseProposals &&
                  !hasLinkedProposal &&
                  expenseDebtorOptions.length > 0;
                const isTaskExpenseBusy = busyActionId === `task-expense-${task.id}`;

                return (
                  <div
                    className="grid min-w-0 gap-3 p-4"
                    data-testid={`task-row-${task.id}`}
                    key={task.id}
                  >
                    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 break-words text-sm font-medium">
                            {task.title}
                          </p>
                          <Badge variant={statusVariant(task.status)}>
                            {labels.statuses[taskStatus] ?? task.status}
                          </Badge>
                          <Badge variant="neutral">
                            {labels.priorities[(task.priority as PriorityKey) ?? "NORMAL"] ??
                              task.priority}
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
                          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                            {task.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                          onClick={() =>
                            setExpandedExpenseTaskId(isExpenseFormOpen ? null : task.id)
                          }
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
                          {busyActionId === `complete-${task.id}`
                            ? labels.working
                            : labels.completeTask}
                        </Button>
                      </div>
                    </div>
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
              })}
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">{labels.noTasks}</p>
          )}
        </div>
      </div>
    </section>
  );
}
