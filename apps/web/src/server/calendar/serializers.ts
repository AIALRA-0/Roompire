import type {
  CalendarEvent,
  EventLink,
  RecurringExpenseTemplate,
  Task,
  TaskAssignment,
  TaskExpenseProposalLink,
} from "@prisma/client";

export type CalendarEventWithLinks = CalendarEvent & {
  links: EventLink[];
  recurringExpenseTemplate?: RecurringExpenseTemplate | null;
};

export type TaskWithAssignmentsAndLinks = Task & {
  assignments: TaskAssignment[];
  expenseProposalLinks?: TaskExpenseProposalLink[];
  linkedEventIds: string[];
  linkedProposalIds: string[];
};

export function serializeCalendarEvent(event: CalendarEventWithLinks) {
  return {
    id: event.id,
    householdId: event.householdId,
    type: event.type,
    title: event.title,
    description: event.description,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt?.toISOString() ?? null,
    allDay: event.allDay,
    timezone: event.timezone,
    status: event.status,
    createdByUserId: event.createdByUserId,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    recurringExpenseTemplate: event.recurringExpenseTemplate
      ? {
          id: event.recurringExpenseTemplate.id,
          eventId: event.recurringExpenseTemplate.eventId,
          title: event.recurringExpenseTemplate.title,
          description: event.recurringExpenseTemplate.description,
          merchant: event.recurringExpenseTemplate.merchant,
          categoryId: event.recurringExpenseTemplate.categoryId,
          originalAmount: event.recurringExpenseTemplate.originalAmount.toString(),
          originalCurrency: event.recurringExpenseTemplate.originalCurrency,
          fxRate: event.recurringExpenseTemplate.fxRate?.toString() ?? null,
          participantUserIds: event.recurringExpenseTemplate.participantUserIds,
        }
      : null,
    links: event.links.map((link) => ({
      id: link.id,
      eventId: link.eventId,
      linkedType: link.linkedType,
      linkedId: link.linkedId,
      createdAt: link.createdAt.toISOString(),
    })),
  };
}

export function serializeTask(task: TaskWithAssignmentsAndLinks) {
  return {
    id: task.id,
    householdId: task.householdId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    categoryId: task.categoryId,
    dueAt: task.dueAt?.toISOString() ?? null,
    createdByUserId: task.createdByUserId,
    completedByUserId: task.completedByUserId,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    assignments: task.assignments.map((assignment) => ({
      id: assignment.id,
      taskId: assignment.taskId,
      assignedUserId: assignment.assignedUserId,
      role: assignment.role,
      status: assignment.status,
    })),
    linkedEventIds: task.linkedEventIds,
    linkedProposalIds:
      task.linkedProposalIds ?? task.expenseProposalLinks?.map((link) => link.proposalId) ?? [],
  };
}

export type SerializedCalendarEvent = ReturnType<typeof serializeCalendarEvent>;
export type SerializedTask = ReturnType<typeof serializeTask>;
