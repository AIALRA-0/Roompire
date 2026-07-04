import { CalendarEventType, type CalendarEvent, type Prisma, type Task } from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import {
  requireActiveMembership,
  requireHouseholdWorkItemCreator,
} from "@/server/permissions/rbac";
import type { CalendarEventWithLinks, TaskWithAssignmentsAndLinks } from "./serializers";

type PrismaReader = typeof prisma | Prisma.TransactionClient;

const optionalDescriptionSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().trim().max(1000).optional(),
);

const optionalDateTimeSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().trim().min(1).optional(),
);

const eventQuerySchema = z.object({
  start: optionalDateTimeSchema,
  end: optionalDateTimeSchema,
});

const taskQuerySchema = z.object({
  status: z.enum(["OPEN", "COMPLETED"]).optional(),
});

const recurrenceFrequencySchema = z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]);

const recurrenceCountSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).max(12).default(1),
);

export const createCalendarEventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: optionalDescriptionSchema,
  type: z.nativeEnum(CalendarEventType).default(CalendarEventType.GROUP_ACTIVITY),
  startAt: z.string().trim().min(1),
  endAt: optionalDateTimeSchema,
  allDay: z.boolean().default(false),
  recurrenceFrequency: recurrenceFrequencySchema.default("NONE"),
  recurrenceCount: recurrenceCountSchema,
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: optionalDescriptionSchema,
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  dueAt: optionalDateTimeSchema,
  assignedUserIds: z.array(z.string().uuid()).max(20).default([]),
  recurrenceFrequency: recurrenceFrequencySchema.default("NONE"),
  recurrenceCount: recurrenceCountSchema,
});

export const completeTaskSchema = z.object({
  completedAt: optionalDateTimeSchema,
});

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function dateTimeInputToUtc(value: string, fieldName: string) {
  const trimmed = value.trim();
  const hasTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(trimmed);
  const normalized = hasTimezone
    ? trimmed
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
      ? `${trimmed}:00.000Z`
      : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)
        ? `${trimmed}.000Z`
        : `${trimmed}Z`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw validationError(`${fieldName} must be a valid date-time.`);
  }

  return date;
}

type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;

type RecurrenceSettings = {
  frequency: Exclude<RecurrenceFrequency, "NONE">;
  count: number;
};

function normalizeRecurrence(
  frequency: RecurrenceFrequency,
  count: number,
): RecurrenceSettings | null {
  if (frequency === "NONE" || count <= 1) {
    return null;
  }

  return {
    frequency,
    count,
  };
}

function addRecurrenceInterval(
  date: Date,
  frequency: RecurrenceSettings["frequency"],
  index: number,
) {
  const next = new Date(date);

  if (frequency === "DAILY") {
    next.setUTCDate(next.getUTCDate() + index);
  } else if (frequency === "WEEKLY") {
    next.setUTCDate(next.getUTCDate() + index * 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + index);
  }

  return next;
}

function recurrenceRuleText(recurrence: RecurrenceSettings) {
  return `FREQ=${recurrence.frequency};COUNT=${recurrence.count}`;
}

async function attachLinksToEvents(
  client: PrismaReader,
  events: CalendarEvent[],
): Promise<CalendarEventWithLinks[]> {
  if (events.length === 0) {
    return [];
  }

  const links = await client.eventLink.findMany({
    where: {
      eventId: {
        in: events.map((event) => event.id),
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const linksByEventId = new Map<string, typeof links>();

  for (const link of links) {
    const eventLinks = linksByEventId.get(link.eventId) ?? [];

    eventLinks.push(link);
    linksByEventId.set(link.eventId, eventLinks);
  }

  return events.map((event) => ({
    ...event,
    links: linksByEventId.get(event.id) ?? [],
  }));
}

async function attachLinkedEventIdsToTasks(
  client: PrismaReader,
  tasks: Array<Task & { assignments: TaskWithAssignmentsAndLinks["assignments"] }>,
): Promise<TaskWithAssignmentsAndLinks[]> {
  if (tasks.length === 0) {
    return [];
  }

  const links = await client.eventLink.findMany({
    where: {
      linkedType: "task",
      linkedId: {
        in: tasks.map((task) => task.id),
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const eventIdsByTaskId = new Map<string, string[]>();

  for (const link of links) {
    const eventIds = eventIdsByTaskId.get(link.linkedId) ?? [];

    eventIds.push(link.eventId);
    eventIdsByTaskId.set(link.linkedId, eventIds);
  }

  const proposalLinks = await client.taskExpenseProposalLink.findMany({
    where: {
      taskId: {
        in: tasks.map((task) => task.id),
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const proposalIdsByTaskId = new Map<string, string[]>();

  for (const link of proposalLinks) {
    const proposalIds = proposalIdsByTaskId.get(link.taskId) ?? [];

    proposalIds.push(link.proposalId);
    proposalIdsByTaskId.set(link.taskId, proposalIds);
  }

  return tasks.map((task) => ({
    ...task,
    linkedEventIds: eventIdsByTaskId.get(task.id) ?? [],
    linkedProposalIds: proposalIdsByTaskId.get(task.id) ?? [],
  }));
}

function sortTasksForWorkQueue(left: Task, right: Task) {
  const leftStatusRank = left.status === "OPEN" ? 0 : 1;
  const rightStatusRank = right.status === "OPEN" ? 0 : 1;

  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank;
  }

  const leftDue = left.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDue = right.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;

  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  return right.createdAt.getTime() - left.createdAt.getTime();
}

async function getAssignableMemberships(householdId: string, userIds: string[]) {
  const memberships = await prisma.householdMembership.findMany({
    where: {
      householdId,
      userId: {
        in: userIds,
      },
      status: "ACTIVE",
      role: {
        in: ["OWNER", "ADMIN", "MEMBER"],
      },
    },
  });
  const membershipsByUserId = new Map(
    memberships.map((membership) => [membership.userId, membership]),
  );

  for (const userId of userIds) {
    if (!membershipsByUserId.has(userId)) {
      throw new ApiError(
        400,
        "INVALID_ASSIGNEE",
        "Every assignee must be an active owner, admin, or member of the household.",
        { userId },
      );
    }
  }

  return userIds.map((userId) => membershipsByUserId.get(userId)!);
}

export async function listCalendarEventsForHousehold(
  userId: string,
  householdId: string,
  query: unknown = {},
) {
  await requireActiveMembership(userId, householdId);
  const parsed = eventQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw validationError("Calendar event query is invalid.", parsed.error.flatten());
  }

  const start = parsed.data.start ? dateTimeInputToUtc(parsed.data.start, "start") : undefined;
  const end = parsed.data.end ? dateTimeInputToUtc(parsed.data.end, "end") : undefined;
  const events = await prisma.calendarEvent.findMany({
    where: {
      householdId,
      startAt: {
        gte: start,
        lte: end,
      },
    },
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    take: 50,
  });

  return attachLinksToEvents(prisma, events);
}

export async function listTasksForHousehold(
  userId: string,
  householdId: string,
  query: unknown = {},
) {
  await requireActiveMembership(userId, householdId);
  const parsed = taskQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw validationError("Task query is invalid.", parsed.error.flatten());
  }

  const tasks = await prisma.task.findMany({
    where: {
      householdId,
      status: parsed.data.status,
    },
    include: {
      assignments: true,
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  return attachLinkedEventIdsToTasks(prisma, tasks.sort(sortTasksForWorkQueue));
}

export async function createCalendarEventForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  const membership = await requireHouseholdWorkItemCreator(userId, householdId);
  const parsed = createCalendarEventSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Calendar event input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const startAt = dateTimeInputToUtc(data.startAt, "startAt");
  const endAt = data.endAt ? dateTimeInputToUtc(data.endAt, "endAt") : undefined;
  const recurrence = normalizeRecurrence(data.recurrenceFrequency, data.recurrenceCount);

  if (endAt && endAt < startAt) {
    throw validationError("Event end time cannot be before the start time.");
  }

  return prisma.$transaction(async (tx) => {
    const durationMs = endAt ? endAt.getTime() - startAt.getTime() : null;
    const event = await tx.calendarEvent.create({
      data: {
        householdId,
        type: data.type,
        title: data.title,
        description: data.description,
        startAt,
        endAt,
        allDay: data.allDay,
        timezone: membership.household.timezone,
        createdByUserId: userId,
      },
    });
    let recurrenceRuleId: string | null = null;
    const generatedEventIds: string[] = [];

    if (recurrence) {
      const recurrenceRule = await tx.recurrenceRule.create({
        data: {
          householdId,
          ownerType: "calendar_event",
          ownerId: event.id,
          rruleText: recurrenceRuleText(recurrence),
          dtstart: startAt,
          timezone: membership.household.timezone,
          count: recurrence.count,
        },
      });

      recurrenceRuleId = recurrenceRule.id;

      await tx.eventLink.create({
        data: {
          eventId: event.id,
          linkedType: "recurrence_rule",
          linkedId: recurrenceRule.id,
        },
      });

      for (let index = 1; index < recurrence.count; index += 1) {
        const occurrenceStartAt = addRecurrenceInterval(startAt, recurrence.frequency, index);
        const occurrenceEndAt =
          durationMs === null ? undefined : new Date(occurrenceStartAt.getTime() + durationMs);
        const occurrence = await tx.calendarEvent.create({
          data: {
            householdId,
            type: data.type,
            title: data.title,
            description: data.description,
            startAt: occurrenceStartAt,
            endAt: occurrenceEndAt,
            allDay: data.allDay,
            timezone: membership.household.timezone,
            createdByUserId: userId,
          },
        });

        generatedEventIds.push(occurrence.id);

        await tx.eventLink.create({
          data: {
            eventId: occurrence.id,
            linkedType: "recurrence_rule",
            linkedId: recurrenceRule.id,
          },
        });
      }
    }

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "calendar_event.created",
        entityType: "CalendarEvent",
        entityId: event.id,
        after: {
          title: event.title,
          type: event.type,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt?.toISOString() ?? null,
          allDay: event.allDay,
          recurrenceRuleId,
          recurrenceFrequency: recurrence?.frequency ?? "NONE",
          recurrenceCount: recurrence?.count ?? 1,
          generatedEventIds,
        },
      },
    });

    const [linkedEvent] = await attachLinksToEvents(tx, [event]);

    return linkedEvent!;
  });
}

async function createTaskInstance(
  tx: Prisma.TransactionClient,
  input: {
    householdId: string;
    userId: string;
    timezone: string;
    title: string;
    description?: string;
    priority: string;
    dueAt?: Date;
    assignedUserIds: string[];
  },
) {
  const task = await tx.task.create({
    data: {
      householdId: input.householdId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueAt: input.dueAt,
      createdByUserId: input.userId,
      assignments: {
        create: input.assignedUserIds.map((assignedUserId) => ({
          assignedUserId,
        })),
      },
    },
    include: {
      assignments: true,
    },
  });
  let calendarEventId: string | null = null;

  if (input.dueAt) {
    const event = await tx.calendarEvent.create({
      data: {
        householdId: input.householdId,
        type: CalendarEventType.TASK,
        title: task.title,
        description: task.description,
        startAt: input.dueAt,
        timezone: input.timezone,
        createdByUserId: input.userId,
      },
    });

    await tx.eventLink.create({
      data: {
        eventId: event.id,
        linkedType: "task",
        linkedId: task.id,
      },
    });
    calendarEventId = event.id;
  }

  return {
    task,
    calendarEventId,
  };
}

export async function createTaskForHousehold(userId: string, householdId: string, input: unknown) {
  const membership = await requireHouseholdWorkItemCreator(userId, householdId);
  const parsed = createTaskSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Task input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const assignedUserIds = uniqueValues(
    data.assignedUserIds.length > 0 ? data.assignedUserIds : [userId],
  );
  const dueAt = data.dueAt ? dateTimeInputToUtc(data.dueAt, "dueAt") : undefined;
  const recurrence = normalizeRecurrence(data.recurrenceFrequency, data.recurrenceCount);

  if (recurrence && !dueAt) {
    throw validationError("Recurring tasks require a due date.");
  }

  await getAssignableMemberships(householdId, assignedUserIds);

  return prisma.$transaction(async (tx) => {
    const { task, calendarEventId } = await createTaskInstance(tx, {
      householdId,
      userId,
      timezone: membership.household.timezone,
      title: data.title,
      description: data.description,
      priority: data.priority,
      dueAt,
      assignedUserIds,
    });
    let recurrenceRuleId: string | null = null;
    const generatedTaskIds: string[] = [];
    const generatedCalendarEventIds: string[] = [];

    if (recurrence && dueAt) {
      const recurrenceRule = await tx.recurrenceRule.create({
        data: {
          householdId,
          ownerType: "task",
          ownerId: task.id,
          rruleText: recurrenceRuleText(recurrence),
          dtstart: dueAt,
          timezone: membership.household.timezone,
          count: recurrence.count,
        },
      });

      recurrenceRuleId = recurrenceRule.id;

      if (calendarEventId) {
        await tx.eventLink.create({
          data: {
            eventId: calendarEventId,
            linkedType: "recurrence_rule",
            linkedId: recurrenceRule.id,
          },
        });
      }

      for (let index = 1; index < recurrence.count; index += 1) {
        const occurrenceDueAt = addRecurrenceInterval(dueAt, recurrence.frequency, index);
        const occurrence = await createTaskInstance(tx, {
          householdId,
          userId,
          timezone: membership.household.timezone,
          title: data.title,
          description: data.description,
          priority: data.priority,
          dueAt: occurrenceDueAt,
          assignedUserIds,
        });

        generatedTaskIds.push(occurrence.task.id);

        if (occurrence.calendarEventId) {
          generatedCalendarEventIds.push(occurrence.calendarEventId);
          await tx.eventLink.create({
            data: {
              eventId: occurrence.calendarEventId,
              linkedType: "recurrence_rule",
              linkedId: recurrenceRule.id,
            },
          });
        }
      }
    }

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "task.created",
        entityType: "Task",
        entityId: task.id,
        after: {
          title: task.title,
          status: task.status,
          priority: task.priority,
          assignedUserIds,
          dueAt: task.dueAt?.toISOString() ?? null,
          calendarEventId,
          recurrenceRuleId,
          recurrenceFrequency: recurrence?.frequency ?? "NONE",
          recurrenceCount: recurrence?.count ?? 1,
          generatedTaskIds,
          generatedCalendarEventIds,
        },
      },
    });

    const [linkedTask] = await attachLinkedEventIdsToTasks(tx, [task]);

    return linkedTask!;
  });
}

export async function completeTaskForHousehold(
  userId: string,
  householdId: string,
  taskId: string,
  input: unknown = {},
) {
  await requireHouseholdWorkItemCreator(userId, householdId);
  const parsed = completeTaskSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Task completion input is invalid.", parsed.error.flatten());
  }

  const completedAt = parsed.data.completedAt
    ? dateTimeInputToUtc(parsed.data.completedAt, "completedAt")
    : new Date();

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: {
        id: taskId,
        householdId,
      },
      include: {
        assignments: true,
      },
    });

    if (!task) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (task.status === "COMPLETED") {
      const [linkedTask] = await attachLinkedEventIdsToTasks(tx, [task]);

      return linkedTask!;
    }

    await tx.taskAssignment.updateMany({
      where: {
        taskId,
      },
      data: {
        status: "COMPLETED",
      },
    });

    const eventLinks = await tx.eventLink.findMany({
      where: {
        linkedType: "task",
        linkedId: taskId,
      },
    });
    const linkedEventIds = eventLinks.map((link) => link.eventId);

    if (linkedEventIds.length > 0) {
      await tx.calendarEvent.updateMany({
        where: {
          id: {
            in: linkedEventIds,
          },
          householdId,
        },
        data: {
          status: "COMPLETED",
        },
      });
    }

    const updatedTask = await tx.task.update({
      where: {
        id: taskId,
      },
      data: {
        status: "COMPLETED",
        completedByUserId: userId,
        completedAt,
      },
      include: {
        assignments: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "task.completed",
        entityType: "Task",
        entityId: taskId,
        before: {
          status: task.status,
        },
        after: {
          status: updatedTask.status,
          completedByUserId: userId,
          completedAt: updatedTask.completedAt?.toISOString() ?? null,
          linkedEventIds,
        },
      },
    });

    const [linkedTask] = await attachLinkedEventIdsToTasks(tx, [updatedTask]);

    return linkedTask!;
  });
}
