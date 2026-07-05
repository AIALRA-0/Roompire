import type { Notification, NotificationPreference, Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { listHouseholdsForUser } from "@/server/households/service";
import { defaultNotificationPreferences } from "@/server/users/service";

export type NotificationTopic = "proposal" | "settlement" | "task";
export type ReminderClassification = "DUE_SOON" | "OVERDUE";

type ReminderNotificationRow = {
  householdId: string;
  userId: string;
  type: string;
  dedupeKey: string;
  titleKey: string;
  bodyKey: string;
  payload: Prisma.InputJsonValue;
};

type ReminderRunOptions = {
  now?: Date;
  taskLookaheadHours?: number;
  debtLookaheadDays?: number;
  settlementConfirmationHours?: number;
  maxItems?: number;
  dryRun?: boolean;
};

type ReminderRunSummary = {
  attempted: number;
  created: number;
  dryRun: boolean;
  byType: Record<string, { attempted: number; created: number }>;
};

export type NotificationSummary = {
  id: string;
  householdId: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  payload: Prisma.JsonValue | null;
  readAt: string | null;
  createdAt: string;
};

export const updateNotificationSchema = z.object({
  read: z.boolean(),
});

const defaultTaskLookaheadHours = 24;
const defaultDebtLookaheadDays = 3;
const defaultSettlementConfirmationHours = 24;
const defaultReminderMaxItems = 500;

function serializeNotification(notification: Notification): NotificationSummary {
  return {
    id: notification.id,
    householdId: notification.householdId,
    type: notification.type,
    titleKey: notification.titleKey,
    bodyKey: notification.bodyKey,
    payload: notification.payload ?? null,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

function activeHouseholdIdsForMemberships(
  memberships: Awaited<ReturnType<typeof listHouseholdsForUser>>,
) {
  return memberships.map((membership) => membership.householdId);
}

function clampPositiveNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

export function classifyDateTimeReminder(
  dueAt: Date,
  now: Date,
  lookaheadMs: number,
): ReminderClassification | null {
  if (dueAt.getTime() <= now.getTime()) {
    return "OVERDUE";
  }

  if (dueAt.getTime() <= now.getTime() + lookaheadMs) {
    return "DUE_SOON";
  }

  return null;
}

export function classifyDateOnlyReminder(
  dueDate: Date,
  today: Date,
  lookaheadDays: number,
): ReminderClassification | null {
  const dueDay = startOfUtcDay(dueDate);

  if (dueDay.getTime() < today.getTime()) {
    return "OVERDUE";
  }

  if (dueDay.getTime() <= addUtcDays(today, lookaheadDays).getTime()) {
    return "DUE_SOON";
  }

  return null;
}

export function reminderDedupeKey(
  scope: "task" | "debt" | "settlement",
  id: string,
  type: string,
  userId: string,
) {
  return `${scope}:${id}:${type.toLowerCase()}:${userId}`;
}

function createEmptyReminderSummary(dryRun: boolean): ReminderRunSummary {
  return {
    attempted: 0,
    created: 0,
    dryRun,
    byType: {},
  };
}

function addAttemptedReminder(summary: ReminderRunSummary, type: string) {
  summary.attempted += 1;
  summary.byType[type] = summary.byType[type] ?? { attempted: 0, created: 0 };
  summary.byType[type].attempted += 1;
}

function addCreatedReminders(summary: ReminderRunSummary, type: string, count: number) {
  summary.created += count;
  summary.byType[type] = summary.byType[type] ?? { attempted: 0, created: 0 };
  summary.byType[type].created += count;
}

async function activeMembershipUserKeys(
  userHouseholdPairs: Array<{ householdId: string; userId: string }>,
) {
  if (userHouseholdPairs.length === 0) {
    return new Set<string>();
  }

  const householdIds = [...new Set(userHouseholdPairs.map((pair) => pair.householdId))];
  const userIds = [...new Set(userHouseholdPairs.map((pair) => pair.userId))];
  const memberships = await prisma.householdMembership.findMany({
    where: {
      householdId: {
        in: householdIds,
      },
      userId: {
        in: userIds,
      },
      status: "ACTIVE",
    },
    select: {
      householdId: true,
      userId: true,
    },
  });

  return new Set(memberships.map((membership) => `${membership.householdId}:${membership.userId}`));
}

async function preferenceMapForUserIds(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, NotificationPreference>();
  }

  const preferences = await prisma.notificationPreference.findMany({
    where: {
      userId: {
        in: [...new Set(userIds)],
      },
    },
  });

  return new Map(preferences.map((preference) => [preference.userId, preference]));
}

function taskReminderType(classification: ReminderClassification) {
  return classification === "OVERDUE" ? "TASK_OVERDUE" : "TASK_DUE_SOON";
}

function debtReminderType(classification: ReminderClassification) {
  return classification === "OVERDUE" ? "DEBT_OVERDUE" : "DEBT_DUE_SOON";
}

async function createReminderRows(rows: ReminderNotificationRow[], summary: ReminderRunSummary) {
  const rowsByType = new Map<string, ReminderNotificationRow[]>();

  for (const row of rows) {
    addAttemptedReminder(summary, row.type);
    rowsByType.set(row.type, [...(rowsByType.get(row.type) ?? []), row]);
  }

  if (summary.dryRun) {
    return;
  }

  for (const [type, typeRows] of rowsByType.entries()) {
    const result = await prisma.notification.createMany({
      data: typeRows,
      skipDuplicates: true,
    });

    addCreatedReminders(summary, type, result.count);
  }
}

export function shouldCreateInAppNotification(
  preferences: NotificationPreference | null | undefined,
  topic: NotificationTopic,
) {
  const summary = preferences
    ? {
        inAppEnabled: preferences.inAppEnabled,
        proposalUpdatesEnabled: preferences.proposalUpdatesEnabled,
        settlementUpdatesEnabled: preferences.settlementUpdatesEnabled,
        taskRemindersEnabled: preferences.taskRemindersEnabled,
      }
    : defaultNotificationPreferences();

  if (!summary.inAppEnabled) {
    return false;
  }

  if (topic === "proposal") {
    return summary.proposalUpdatesEnabled;
  }

  if (topic === "settlement") {
    return summary.settlementUpdatesEnabled;
  }

  return summary.taskRemindersEnabled;
}

export async function createExpenseProposalAssignedNotifications(
  tx: Prisma.TransactionClient,
  input: {
    householdId: string;
    proposalId: string;
    proposalTitle: string;
    actorUserId: string;
    shares: Array<{
      debtorUserId: string;
      shareSettlementAmount: { toString(): string };
      settlementCurrency: string;
    }>;
  },
) {
  const debtorUserIds = [...new Set(input.shares.map((share) => share.debtorUserId))];

  if (debtorUserIds.length === 0) {
    return;
  }

  const preferences = await tx.notificationPreference.findMany({
    where: {
      userId: {
        in: debtorUserIds,
      },
    },
  });
  const preferencesByUserId = new Map(
    preferences.map((preference) => [preference.userId, preference]),
  );
  const rows = input.shares
    .filter((share) =>
      shouldCreateInAppNotification(preferencesByUserId.get(share.debtorUserId), "proposal"),
    )
    .map((share) => ({
      householdId: input.householdId,
      userId: share.debtorUserId,
      type: "EXPENSE_PROPOSAL_ASSIGNED",
      dedupeKey: null,
      titleKey: "expenseProposalAssignedTitle",
      bodyKey: "expenseProposalAssignedBody",
      payload: {
        proposalId: input.proposalId,
        proposalTitle: input.proposalTitle,
        actorUserId: input.actorUserId,
        amount: share.shareSettlementAmount.toString(),
        currency: share.settlementCurrency,
      },
    }));

  if (rows.length === 0) {
    return;
  }

  await tx.notification.createMany({
    data: rows,
  });
}

export async function sendReminderNotifications(
  options: ReminderRunOptions = {},
): Promise<ReminderRunSummary> {
  const now = options.now ?? new Date();
  const taskLookaheadHours = clampPositiveNumber(
    options.taskLookaheadHours,
    defaultTaskLookaheadHours,
  );
  const debtLookaheadDays = clampPositiveNumber(
    options.debtLookaheadDays,
    defaultDebtLookaheadDays,
  );
  const settlementConfirmationHours = clampPositiveNumber(
    options.settlementConfirmationHours,
    defaultSettlementConfirmationHours,
  );
  const maxItems = Math.min(
    2000,
    Math.max(1, Math.trunc(clampPositiveNumber(options.maxItems, defaultReminderMaxItems))),
  );
  const summary = createEmptyReminderSummary(Boolean(options.dryRun));
  const taskLookaheadMs = taskLookaheadHours * 60 * 60 * 1000;
  const today = startOfUtcDay(now);
  const taskDueEnd = new Date(now.getTime() + taskLookaheadMs);
  const debtDueEnd = addUtcDays(today, debtLookaheadDays);
  const staleSettlementCutoff = new Date(
    now.getTime() - settlementConfirmationHours * 60 * 60 * 1000,
  );
  const [tasks, obligations, settlements] = await Promise.all([
    prisma.task.findMany({
      where: {
        status: "OPEN",
        dueAt: {
          not: null,
          lte: taskDueEnd,
        },
      },
      include: {
        assignments: true,
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: maxItems,
    }),
    prisma.debtObligation.findMany({
      where: {
        status: "OPEN",
        dueDate: {
          not: null,
          lte: debtDueEnd,
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: maxItems,
    }),
    prisma.settlement.findMany({
      where: {
        status: "SUBMITTED",
        createdAt: {
          lte: staleSettlementCutoff,
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: maxItems,
    }),
  ]);
  const userHouseholdPairs = [
    ...tasks.flatMap((task) =>
      task.assignments.map((assignment) => ({
        householdId: task.householdId,
        userId: assignment.assignedUserId,
      })),
    ),
    ...obligations.map((obligation) => ({
      householdId: obligation.householdId,
      userId: obligation.debtorUserId,
    })),
    ...settlements.map((settlement) => ({
      householdId: settlement.householdId,
      userId: settlement.payeeUserId,
    })),
  ];
  const activeUserKeys = await activeMembershipUserKeys(userHouseholdPairs);
  const preferencesByUserId = await preferenceMapForUserIds(
    userHouseholdPairs.map((pair) => pair.userId),
  );
  const rows: ReminderNotificationRow[] = [];

  for (const task of tasks) {
    if (!task.dueAt) {
      continue;
    }

    const classification = classifyDateTimeReminder(task.dueAt, now, taskLookaheadMs);

    if (!classification) {
      continue;
    }

    const type = taskReminderType(classification);
    const assignedUserIds = [
      ...new Set(task.assignments.map((assignment) => assignment.assignedUserId)),
    ];

    for (const userId of assignedUserIds) {
      if (!activeUserKeys.has(`${task.householdId}:${userId}`)) {
        continue;
      }

      if (!shouldCreateInAppNotification(preferencesByUserId.get(userId), "task")) {
        continue;
      }

      rows.push({
        householdId: task.householdId,
        userId,
        type,
        dedupeKey: reminderDedupeKey("task", task.id, type, userId),
        titleKey: classification === "OVERDUE" ? "taskOverdueTitle" : "taskDueSoonTitle",
        bodyKey: classification === "OVERDUE" ? "taskOverdueBody" : "taskDueSoonBody",
        payload: {
          taskId: task.id,
          taskTitle: task.title,
          dueAt: task.dueAt.toISOString(),
        },
      });
    }
  }

  for (const obligation of obligations) {
    if (!obligation.dueDate) {
      continue;
    }

    const classification = classifyDateOnlyReminder(obligation.dueDate, today, debtLookaheadDays);

    if (!classification) {
      continue;
    }

    if (!activeUserKeys.has(`${obligation.householdId}:${obligation.debtorUserId}`)) {
      continue;
    }

    if (
      !shouldCreateInAppNotification(preferencesByUserId.get(obligation.debtorUserId), "settlement")
    ) {
      continue;
    }

    const type = debtReminderType(classification);

    rows.push({
      householdId: obligation.householdId,
      userId: obligation.debtorUserId,
      type,
      dedupeKey: reminderDedupeKey("debt", obligation.id, type, obligation.debtorUserId),
      titleKey: classification === "OVERDUE" ? "debtOverdueTitle" : "debtDueSoonTitle",
      bodyKey: classification === "OVERDUE" ? "debtOverdueBody" : "debtDueSoonBody",
      payload: {
        debtObligationId: obligation.id,
        dueDate: obligation.dueDate.toISOString().slice(0, 10),
        amount: obligation.remainingAmount.toString(),
        currency: obligation.settlementCurrency,
        creditorUserId: obligation.creditorUserId,
      },
    });
  }

  for (const settlement of settlements) {
    if (!activeUserKeys.has(`${settlement.householdId}:${settlement.payeeUserId}`)) {
      continue;
    }

    if (
      !shouldCreateInAppNotification(preferencesByUserId.get(settlement.payeeUserId), "settlement")
    ) {
      continue;
    }

    rows.push({
      householdId: settlement.householdId,
      userId: settlement.payeeUserId,
      type: "SETTLEMENT_CONFIRMATION_REMINDER",
      dedupeKey: reminderDedupeKey(
        "settlement",
        settlement.id,
        "confirmation",
        settlement.payeeUserId,
      ),
      titleKey: "settlementConfirmationReminderTitle",
      bodyKey: "settlementConfirmationReminderBody",
      payload: {
        settlementId: settlement.id,
        payerUserId: settlement.payerUserId,
        amount: settlement.amount.toString(),
        currency: settlement.currency,
        submittedAt: settlement.createdAt.toISOString(),
      },
    });
  }

  await createReminderRows(rows, summary);

  return summary;
}

export async function listNotificationsForUser(userId: string) {
  const memberships = await listHouseholdsForUser(userId);
  const householdIds = activeHouseholdIdsForMemberships(memberships);

  if (householdIds.length === 0) {
    return {
      notifications: [],
      unreadCount: 0,
    };
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId,
        householdId: {
          in: householdIds,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
    prisma.notification.count({
      where: {
        userId,
        householdId: {
          in: householdIds,
        },
        readAt: null,
      },
    }),
  ]);

  return {
    notifications: notifications.map(serializeNotification),
    unreadCount,
  };
}

export async function updateNotificationForUser(
  userId: string,
  notificationId: string,
  input: unknown,
) {
  const parsed = updateNotificationSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Notification input is invalid.", parsed.error.flatten());
  }

  const memberships = await listHouseholdsForUser(userId);
  const householdIds = activeHouseholdIdsForMemberships(memberships);
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
      householdId: {
        in: householdIds,
      },
    },
  });

  if (!notification) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  const updated = await prisma.notification.update({
    where: {
      id: notification.id,
    },
    data: {
      readAt: parsed.data.read ? new Date() : null,
    },
  });

  return serializeNotification(updated);
}
