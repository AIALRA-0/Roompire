import { CalendarEventType, type CalendarEvent, type Prisma, type Task } from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { paginateRows, paginationQueryFields } from "@/server/pagination";
import {
  requireActiveMembership,
  requireHouseholdWorkItemCreator,
} from "@/server/permissions/rbac";
import type { CalendarEventWithLinks, TaskWithAssignmentsAndLinks } from "./serializers";

type PrismaReader = typeof prisma | Prisma.TransactionClient;
const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

const optionalDescriptionSchema = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(1000).optional(),
);

const optionalDateTimeSchema = z.preprocess(emptyToUndefined, z.string().trim().min(1).optional());

const nullableUuidSchema = z.preprocess(emptyToUndefined, z.string().uuid().optional());

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/);

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((value) => Number(value) > 0, "Amount must be greater than zero.");

const fxRateStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,12})?$/)
  .refine((value) => Number(value) > 0, "FX rate must be greater than zero.");

const optionalFxRateStringSchema = z.preprocess(emptyToUndefined, fxRateStringSchema.optional());

const eventQuerySchema = z.object({
  start: optionalDateTimeSchema,
  end: optionalDateTimeSchema,
  type: z.preprocess(emptyToUndefined, z.nativeEnum(CalendarEventType).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(["OPEN", "COMPLETED"]).optional()),
  categoryId: nullableUuidSchema,
  memberUserId: nullableUuidSchema,
  ...paginationQueryFields(50),
});

const taskQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(["OPEN", "COMPLETED"]).optional()),
  priority: z.preprocess(emptyToUndefined, z.enum(["LOW", "NORMAL", "HIGH"]).optional()),
  categoryId: nullableUuidSchema,
  assignedUserId: nullableUuidSchema,
  ...paginationQueryFields(50),
});

const recurrenceFrequencySchema = z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]);

const recurrenceCountSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).max(12).default(1),
);

const recurringExpenseTemplateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: optionalDescriptionSchema,
  merchant: z.string().trim().max(120).optional(),
  categoryId: nullableUuidSchema,
  originalAmount: decimalStringSchema,
  originalCurrency: currencySchema,
  fxRate: optionalFxRateStringSchema,
  participantUserIds: z.array(z.string().uuid()).min(1).max(20),
});

type CalendarEventQuery = z.infer<typeof eventQuerySchema>;
type TaskQuery = z.infer<typeof taskQuerySchema>;

type CalendarEventFilterIds = {
  categoryEventIds?: string[];
  memberLinkedEventIds?: string[];
};

const calendarEventOrderBy = [
  { startAt: "asc" as const },
  { createdAt: "asc" as const },
  { id: "asc" as const },
] satisfies Prisma.CalendarEventOrderByWithRelationInput[];

const taskOrderBy = [
  { status: "desc" as const },
  { dueAt: { sort: "asc" as const, nulls: "last" as const } },
  { createdAt: "desc" as const },
  { id: "asc" as const },
] satisfies Prisma.TaskOrderByWithRelationInput[];

export const createCalendarEventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: optionalDescriptionSchema,
  type: z.nativeEnum(CalendarEventType).default(CalendarEventType.GROUP_ACTIVITY),
  startAt: z.string().trim().min(1),
  endAt: optionalDateTimeSchema,
  allDay: z.boolean().default(false),
  recurrenceFrequency: recurrenceFrequencySchema.default("NONE"),
  recurrenceCount: recurrenceCountSchema,
  recurringExpenseTemplate: z.preprocess(
    (value) => (value === null ? undefined : value),
    recurringExpenseTemplateSchema.optional(),
  ),
});

export const updateCalendarEventSchema = createCalendarEventSchema.omit({
  recurrenceFrequency: true,
  recurrenceCount: true,
  recurringExpenseTemplate: true,
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: optionalDescriptionSchema,
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  categoryId: nullableUuidSchema,
  dueAt: optionalDateTimeSchema,
  assignedUserIds: z.array(z.string().uuid()).max(20).default([]),
  recurrenceFrequency: recurrenceFrequencySchema.default("NONE"),
  recurrenceCount: recurrenceCountSchema,
});

export const updateTaskSchema = createTaskSchema.omit({
  recurrenceFrequency: true,
  recurrenceCount: true,
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
  const templates = await client.recurringExpenseTemplate.findMany({
    where: {
      eventId: {
        in: events.map((event) => event.id),
      },
    },
  });
  const templatesByEventId = new Map(templates.map((template) => [template.eventId, template]));

  for (const link of links) {
    const eventLinks = linksByEventId.get(link.eventId) ?? [];

    eventLinks.push(link);
    linksByEventId.set(link.eventId, eventLinks);
  }

  return events.map((event) => ({
    ...event,
    links: linksByEventId.get(event.id) ?? [],
    recurringExpenseTemplate: templatesByEventId.get(event.id) ?? null,
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

function assertEventCanBeEdited(event: CalendarEvent, links: Array<{ linkedType: string }>) {
  const lockedLink = links.find(
    (link) => link.linkedType === "task" || link.linkedType === "debt_obligation",
  );

  if (lockedLink) {
    throw new ApiError(
      409,
      "CALENDAR_EVENT_LOCKED",
      "Linked task and repayment events must be changed from their source record.",
      {
        eventId: event.id,
        linkedType: lockedLink.linkedType,
      },
    );
  }
}

async function assertTemplateCategoryBelongsToHousehold(categoryId: string, householdId: string) {
  const category = await prisma.expenseCategory.findFirst({
    where: {
      id: categoryId,
      householdId,
      isActive: true,
    },
    select: { id: true },
  });

  if (!category) {
    throw new ApiError(400, "INVALID_CATEGORY", "Category is not active in this household.");
  }
}

async function assertFilterMemberBelongsToHousehold(
  userId: string,
  householdId: string,
  fieldName: "memberUserId" | "assignedUserId",
) {
  const membership = await prisma.householdMembership.findFirst({
    where: {
      householdId,
      userId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!membership) {
    throw validationError("Calendar filter is invalid.", {
      fieldErrors: {
        [fieldName]: ["Member must be active in this household."],
      },
    });
  }
}

async function resolveCalendarEventFilterIds(
  householdId: string,
  query: Pick<CalendarEventQuery, "categoryId" | "memberUserId">,
): Promise<CalendarEventFilterIds> {
  const categoryEventsPromise = query.categoryId
    ? prisma.recurringExpenseTemplate.findMany({
        where: {
          householdId,
          categoryId: query.categoryId,
        },
        select: { eventId: true },
      })
    : Promise.resolve([]);
  const memberLinkedEventsPromise = query.memberUserId
    ? prisma.task
        .findMany({
          where: {
            householdId,
            assignments: {
              some: {
                assignedUserId: query.memberUserId,
              },
            },
          },
          select: { id: true },
        })
        .then((assignedTasks) =>
          assignedTasks.length > 0
            ? prisma.eventLink.findMany({
                where: {
                  linkedType: "task",
                  linkedId: {
                    in: assignedTasks.map((task) => task.id),
                  },
                },
                select: { eventId: true },
              })
            : [],
        )
    : Promise.resolve([]);
  const [categoryEvents, memberLinkedEvents] = await Promise.all([
    categoryEventsPromise,
    memberLinkedEventsPromise,
  ]);

  return {
    categoryEventIds: query.categoryId ? categoryEvents.map((event) => event.eventId) : undefined,
    memberLinkedEventIds: query.memberUserId
      ? memberLinkedEvents.map((event) => event.eventId)
      : undefined,
  };
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

async function assertRecurringExpenseTemplateForEvent(
  userId: string,
  householdId: string,
  data: z.infer<typeof createCalendarEventSchema>,
) {
  if (!data.recurringExpenseTemplate) {
    return null;
  }

  if (data.type !== CalendarEventType.RECURRING_EXPENSE_GENERATION) {
    throw validationError("Automatic proposal templates require a recurring expense event.");
  }

  const participantUserIds = uniqueValues(data.recurringExpenseTemplate.participantUserIds);

  if (participantUserIds.length !== data.recurringExpenseTemplate.participantUserIds.length) {
    throw new ApiError(400, "DUPLICATE_PARTICIPANT", "Each debtor can appear only once.");
  }

  if (participantUserIds.includes(userId)) {
    throw new ApiError(
      400,
      "PAYER_AS_DEBTOR_FORBIDDEN",
      "The payer share is implicit; debtor list cannot include the payer.",
    );
  }

  await getAssignableMemberships(householdId, participantUserIds);

  if (data.recurringExpenseTemplate.categoryId) {
    await assertTemplateCategoryBelongsToHousehold(
      data.recurringExpenseTemplate.categoryId,
      householdId,
    );
  }

  return {
    ...data.recurringExpenseTemplate,
    participantUserIds,
  };
}

function recurringExpenseTemplateCreateData({
  eventId,
  householdId,
  template,
  userId,
}: {
  eventId: string;
  householdId: string;
  template: NonNullable<Awaited<ReturnType<typeof assertRecurringExpenseTemplateForEvent>>>;
  userId: string;
}) {
  return {
    householdId,
    eventId,
    createdByUserId: userId,
    title: template.title,
    description: template.description,
    merchant: template.merchant,
    categoryId: template.categoryId,
    originalAmount: template.originalAmount,
    originalCurrency: template.originalCurrency,
    fxRate: template.fxRate,
    participantUserIds: template.participantUserIds,
  };
}

function buildCalendarEventBaseWhere(
  householdId: string,
  range: { start?: Date; end?: Date },
  query: Pick<CalendarEventQuery, "type" | "status" | "categoryId" | "memberUserId">,
  filterIds: CalendarEventFilterIds,
) {
  const andFilters: Prisma.CalendarEventWhereInput[] = [];

  if (query.categoryId) {
    andFilters.push({ id: { in: filterIds.categoryEventIds ?? [] } });
  }

  if (query.memberUserId) {
    andFilters.push({
      OR: [
        { createdByUserId: query.memberUserId },
        { id: { in: filterIds.memberLinkedEventIds ?? [] } },
      ],
    });
  }

  return {
    householdId,
    ...(range.start || range.end
      ? {
          startAt: {
            gte: range.start,
            lte: range.end,
          },
        }
      : {}),
    type: query.type,
    status: query.status,
    AND: andFilters.length > 0 ? andFilters : undefined,
  } satisfies Prisma.CalendarEventWhereInput;
}

function buildCalendarEventWhere(
  householdId: string,
  range: { start?: Date; end?: Date },
  query: Pick<CalendarEventQuery, "type" | "status" | "categoryId" | "memberUserId">,
  filterIds: CalendarEventFilterIds,
  cursorEvent?: Pick<CalendarEvent, "id" | "startAt" | "createdAt">,
) {
  const cursorWindow: Prisma.CalendarEventWhereInput | undefined = cursorEvent
    ? {
        OR: [
          {
            startAt: {
              gt: cursorEvent.startAt,
            },
          },
          {
            startAt: cursorEvent.startAt,
            createdAt: {
              gt: cursorEvent.createdAt,
            },
          },
          {
            startAt: cursorEvent.startAt,
            createdAt: cursorEvent.createdAt,
            id: {
              gt: cursorEvent.id,
            },
          },
        ],
      }
    : undefined;
  const baseWhere = buildCalendarEventBaseWhere(householdId, range, query, filterIds);
  const baseAnd = Array.isArray(baseWhere.AND)
    ? baseWhere.AND
    : baseWhere.AND
      ? [baseWhere.AND]
      : [];

  return {
    ...baseWhere,
    AND: cursorWindow ? [...baseAnd, cursorWindow] : baseWhere.AND,
  } satisfies Prisma.CalendarEventWhereInput;
}

function buildTaskDueCursorWindow(cursorTask: Pick<Task, "id" | "dueAt" | "createdAt">) {
  if (!cursorTask.dueAt) {
    return {
      dueAt: null,
      OR: [
        {
          createdAt: {
            lt: cursorTask.createdAt,
          },
        },
        {
          createdAt: cursorTask.createdAt,
          id: {
            gt: cursorTask.id,
          },
        },
      ],
    } satisfies Prisma.TaskWhereInput;
  }

  return {
    OR: [
      {
        dueAt: {
          gt: cursorTask.dueAt,
        },
      },
      {
        dueAt: null,
      },
      {
        dueAt: cursorTask.dueAt,
        createdAt: {
          lt: cursorTask.createdAt,
        },
      },
      {
        dueAt: cursorTask.dueAt,
        createdAt: cursorTask.createdAt,
        id: {
          gt: cursorTask.id,
        },
      },
    ],
  } satisfies Prisma.TaskWhereInput;
}

function buildTaskBaseWhere(
  householdId: string,
  query: Pick<TaskQuery, "status" | "priority" | "categoryId" | "assignedUserId">,
) {
  return {
    householdId,
    status: query.status,
    priority: query.priority,
    categoryId: query.categoryId,
    assignments: query.assignedUserId
      ? {
          some: {
            assignedUserId: query.assignedUserId,
          },
        }
      : undefined,
  } satisfies Prisma.TaskWhereInput;
}

function buildTaskWhere(
  householdId: string,
  query: Pick<TaskQuery, "status" | "priority" | "categoryId" | "assignedUserId">,
  cursorTask?: Pick<Task, "id" | "status" | "dueAt" | "createdAt">,
) {
  const cursorWindow: Prisma.TaskWhereInput | undefined = cursorTask
    ? {
        OR: [
          ...(cursorTask.status === "OPEN" && !query.status ? [{ status: "COMPLETED" }] : []),
          {
            status: cursorTask.status,
            AND: [buildTaskDueCursorWindow(cursorTask)],
          },
        ],
      }
    : undefined;
  const baseWhere = buildTaskBaseWhere(householdId, query);

  return {
    ...baseWhere,
    AND: cursorWindow ? [cursorWindow] : undefined,
  } satisfies Prisma.TaskWhereInput;
}

async function resolveCalendarEventCursor(
  householdId: string,
  range: { start?: Date; end?: Date },
  query: Pick<CalendarEventQuery, "type" | "status" | "categoryId" | "memberUserId">,
  filterIds: CalendarEventFilterIds,
  cursor: string | undefined,
) {
  if (!cursor) {
    return undefined;
  }

  const cursorEvent = await prisma.calendarEvent.findFirst({
    where: {
      ...buildCalendarEventBaseWhere(householdId, range, query, filterIds),
      id: cursor,
    },
    select: { id: true, householdId: true, startAt: true, createdAt: true },
  });

  if (!cursorEvent) {
    throw validationError("Calendar event query is invalid.", {
      fieldErrors: {
        cursor: ["Invalid cursor."],
      },
    });
  }

  return cursorEvent;
}

async function resolveTaskCursor(
  householdId: string,
  query: Pick<TaskQuery, "status" | "priority" | "categoryId" | "assignedUserId">,
  cursor: string | undefined,
) {
  if (!cursor) {
    return undefined;
  }

  const cursorTask = await prisma.task.findFirst({
    where: {
      ...buildTaskBaseWhere(householdId, query),
      id: cursor,
    },
    select: { id: true, householdId: true, status: true, dueAt: true, createdAt: true },
  });

  if (!cursorTask) {
    throw validationError("Task query is invalid.", {
      fieldErrors: {
        cursor: ["Invalid cursor."],
      },
    });
  }

  return cursorTask;
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
  if (parsed.data.memberUserId) {
    await assertFilterMemberBelongsToHousehold(
      parsed.data.memberUserId,
      householdId,
      "memberUserId",
    );
  }
  const filterIds = await resolveCalendarEventFilterIds(householdId, parsed.data);
  const cursorEvent = await resolveCalendarEventCursor(
    householdId,
    { start, end },
    parsed.data,
    filterIds,
    parsed.data.cursor,
  );
  const events = await prisma.calendarEvent.findMany({
    where: buildCalendarEventWhere(
      householdId,
      { start, end },
      parsed.data,
      filterIds,
      cursorEvent,
    ),
    orderBy: calendarEventOrderBy,
    take: parsed.data.limit + 1,
  });
  const page = paginateRows(events, parsed.data.limit);

  return {
    items: await attachLinksToEvents(prisma, page.items),
    page: page.page,
  };
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

  if (parsed.data.assignedUserId) {
    await assertFilterMemberBelongsToHousehold(
      parsed.data.assignedUserId,
      householdId,
      "assignedUserId",
    );
  }
  const cursorTask = await resolveTaskCursor(householdId, parsed.data, parsed.data.cursor);
  const tasks = await prisma.task.findMany({
    where: buildTaskWhere(householdId, parsed.data, cursorTask),
    include: {
      assignments: true,
    },
    orderBy: taskOrderBy,
    take: parsed.data.limit + 1,
  });
  const page = paginateRows(tasks, parsed.data.limit);

  return {
    items: await attachLinkedEventIdsToTasks(prisma, page.items),
    page: page.page,
  };
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
  const recurringExpenseTemplate = await assertRecurringExpenseTemplateForEvent(
    userId,
    householdId,
    data,
  );

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
    const generatedTemplateEventIds: string[] = [];

    if (recurringExpenseTemplate) {
      await tx.recurringExpenseTemplate.create({
        data: recurringExpenseTemplateCreateData({
          eventId: event.id,
          householdId,
          template: recurringExpenseTemplate,
          userId,
        }),
      });
    }

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

        if (recurringExpenseTemplate) {
          await tx.recurringExpenseTemplate.create({
            data: recurringExpenseTemplateCreateData({
              eventId: occurrence.id,
              householdId,
              template: recurringExpenseTemplate,
              userId,
            }),
          });
          generatedTemplateEventIds.push(occurrence.id);
        }
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
          recurringExpenseTemplateEnabled: Boolean(recurringExpenseTemplate),
          recurringExpenseTemplateEventIds: recurringExpenseTemplate
            ? [event.id, ...generatedTemplateEventIds]
            : [],
        },
      },
    });

    const [linkedEvent] = await attachLinksToEvents(tx, [event]);

    return linkedEvent!;
  });
}

export async function updateCalendarEventForHousehold(
  userId: string,
  householdId: string,
  eventId: string,
  input: unknown,
) {
  const membership = await requireHouseholdWorkItemCreator(userId, householdId);
  const parsed = updateCalendarEventSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Calendar event input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const startAt = dateTimeInputToUtc(data.startAt, "startAt");
  const endAt = data.endAt ? dateTimeInputToUtc(data.endAt, "endAt") : undefined;

  if (endAt && endAt < startAt) {
    throw validationError("Event end time cannot be before the start time.");
  }

  return prisma.$transaction(async (tx) => {
    const event = await tx.calendarEvent.findFirst({
      where: {
        id: eventId,
        householdId,
      },
    });

    if (!event) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    const links = await tx.eventLink.findMany({
      where: {
        eventId,
      },
    });

    assertEventCanBeEdited(event, links);

    const updatedEvent = await tx.calendarEvent.update({
      where: {
        id: eventId,
      },
      data: {
        title: data.title,
        description: data.description ?? null,
        type: data.type,
        startAt,
        endAt: endAt ?? null,
        allDay: data.allDay,
        timezone: membership.household.timezone,
      },
    });

    if (updatedEvent.type !== CalendarEventType.RECURRING_EXPENSE_GENERATION) {
      await tx.recurringExpenseTemplate.deleteMany({
        where: {
          eventId,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "calendar_event.updated",
        entityType: "CalendarEvent",
        entityId: eventId,
        before: {
          title: event.title,
          type: event.type,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt?.toISOString() ?? null,
          allDay: event.allDay,
          description: event.description,
        },
        after: {
          title: updatedEvent.title,
          type: updatedEvent.type,
          startAt: updatedEvent.startAt.toISOString(),
          endAt: updatedEvent.endAt?.toISOString() ?? null,
          allDay: updatedEvent.allDay,
          description: updatedEvent.description,
        },
      },
    });

    const [linkedEvent] = await attachLinksToEvents(tx, [updatedEvent]);

    return linkedEvent!;
  });
}

export async function deleteCalendarEventForHousehold(
  userId: string,
  householdId: string,
  eventId: string,
) {
  await requireHouseholdWorkItemCreator(userId, householdId);

  return prisma.$transaction(async (tx) => {
    const event = await tx.calendarEvent.findFirst({
      where: {
        id: eventId,
        householdId,
      },
    });

    if (!event) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    const links = await tx.eventLink.findMany({
      where: {
        eventId,
      },
    });

    assertEventCanBeEdited(event, links);

    await tx.eventLink.deleteMany({
      where: {
        eventId,
      },
    });
    await tx.calendarEvent.delete({
      where: {
        id: eventId,
      },
    });
    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "calendar_event.deleted",
        entityType: "CalendarEvent",
        entityId: eventId,
        before: {
          title: event.title,
          type: event.type,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt?.toISOString() ?? null,
          allDay: event.allDay,
          linkedTypes: links.map((link) => link.linkedType),
        },
      },
    });

    return {
      eventId,
      deleted: true,
    };
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
    categoryId?: string;
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
      categoryId: input.categoryId,
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
  if (data.categoryId) {
    await assertTemplateCategoryBelongsToHousehold(data.categoryId, householdId);
  }

  return prisma.$transaction(async (tx) => {
    const { task, calendarEventId } = await createTaskInstance(tx, {
      householdId,
      userId,
      timezone: membership.household.timezone,
      title: data.title,
      description: data.description,
      priority: data.priority,
      categoryId: data.categoryId,
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
          categoryId: data.categoryId,
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
          categoryId: task.categoryId,
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

export async function updateTaskForHousehold(
  userId: string,
  householdId: string,
  taskId: string,
  input: unknown,
) {
  const membership = await requireHouseholdWorkItemCreator(userId, householdId);
  const parsed = updateTaskSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Task input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const assignedUserIds = uniqueValues(
    data.assignedUserIds.length > 0 ? data.assignedUserIds : [userId],
  );
  const dueAt = data.dueAt ? dateTimeInputToUtc(data.dueAt, "dueAt") : undefined;

  await getAssignableMemberships(householdId, assignedUserIds);
  if (data.categoryId) {
    await assertTemplateCategoryBelongsToHousehold(data.categoryId, householdId);
  }

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

    const linkedEventLinks = await tx.eventLink.findMany({
      where: {
        linkedType: "task",
        linkedId: taskId,
      },
    });
    const linkedEventIds = linkedEventLinks.map((link) => link.eventId);
    const createdLinkedEventIds: string[] = [];
    const deletedLinkedEventIds: string[] = [];

    if (dueAt && linkedEventIds.length > 0) {
      await tx.calendarEvent.updateMany({
        where: {
          id: {
            in: linkedEventIds,
          },
          householdId,
          type: CalendarEventType.TASK,
        },
        data: {
          title: data.title,
          description: data.description ?? null,
          startAt: dueAt,
          timezone: membership.household.timezone,
          status: task.status,
        },
      });
    } else if (dueAt) {
      const linkedEvent = await tx.calendarEvent.create({
        data: {
          householdId,
          type: CalendarEventType.TASK,
          title: data.title,
          description: data.description ?? null,
          startAt: dueAt,
          timezone: membership.household.timezone,
          status: task.status,
          createdByUserId: userId,
        },
      });

      await tx.eventLink.create({
        data: {
          eventId: linkedEvent.id,
          linkedType: "task",
          linkedId: taskId,
        },
      });
      createdLinkedEventIds.push(linkedEvent.id);
    } else if (linkedEventIds.length > 0) {
      await tx.eventLink.deleteMany({
        where: {
          eventId: {
            in: linkedEventIds,
          },
        },
      });
      await tx.calendarEvent.deleteMany({
        where: {
          id: {
            in: linkedEventIds,
          },
          householdId,
          type: CalendarEventType.TASK,
        },
      });
      deletedLinkedEventIds.push(...linkedEventIds);
    }

    await tx.taskAssignment.deleteMany({
      where: {
        taskId,
      },
    });
    await tx.taskAssignment.createMany({
      data: assignedUserIds.map((assignedUserId) => ({
        taskId,
        assignedUserId,
        status: task.status === "COMPLETED" ? "COMPLETED" : "ASSIGNED",
      })),
    });

    const updatedTask = await tx.task.update({
      where: {
        id: taskId,
      },
      data: {
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        categoryId: data.categoryId ?? null,
        dueAt: dueAt ?? null,
      },
      include: {
        assignments: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "task.updated",
        entityType: "Task",
        entityId: taskId,
        before: {
          title: task.title,
          description: task.description,
          priority: task.priority,
          categoryId: task.categoryId,
          dueAt: task.dueAt?.toISOString() ?? null,
          assignedUserIds: task.assignments.map((assignment) => assignment.assignedUserId),
          linkedEventIds,
        },
        after: {
          title: updatedTask.title,
          description: updatedTask.description,
          priority: updatedTask.priority,
          categoryId: updatedTask.categoryId,
          dueAt: updatedTask.dueAt?.toISOString() ?? null,
          assignedUserIds,
          createdLinkedEventIds,
          deletedLinkedEventIds,
        },
      },
    });

    const [linkedTask] = await attachLinkedEventIdsToTasks(tx, [updatedTask]);

    return linkedTask!;
  });
}

export async function deleteTaskForHousehold(userId: string, householdId: string, taskId: string) {
  await requireHouseholdWorkItemCreator(userId, householdId);

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

    const proposalLinks = await tx.taskExpenseProposalLink.findMany({
      where: {
        taskId,
      },
    });

    if (proposalLinks.length > 0) {
      throw new ApiError(
        409,
        "TASK_HAS_LINKED_PROPOSAL",
        "Tasks with linked expense proposals cannot be deleted.",
        {
          taskId,
          linkedProposalIds: proposalLinks.map((link) => link.proposalId),
        },
      );
    }

    const linkedEventLinks = await tx.eventLink.findMany({
      where: {
        linkedType: "task",
        linkedId: taskId,
      },
    });
    const linkedEventIds = linkedEventLinks.map((link) => link.eventId);

    if (linkedEventIds.length > 0) {
      await tx.eventLink.deleteMany({
        where: {
          eventId: {
            in: linkedEventIds,
          },
        },
      });
      await tx.calendarEvent.deleteMany({
        where: {
          id: {
            in: linkedEventIds,
          },
          householdId,
          type: CalendarEventType.TASK,
        },
      });
    }

    await tx.task.delete({
      where: {
        id: taskId,
      },
    });
    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "task.deleted",
        entityType: "Task",
        entityId: taskId,
        before: {
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          dueAt: task.dueAt?.toISOString() ?? null,
          assignedUserIds: task.assignments.map((assignment) => assignment.assignedUserId),
          linkedEventIds,
        },
      },
    });

    return {
      taskId,
      deleted: true,
    };
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
