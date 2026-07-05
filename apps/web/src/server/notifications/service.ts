import type { Notification, NotificationPreference, Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { listHouseholdsForUser } from "@/server/households/service";
import { defaultNotificationPreferences } from "@/server/users/service";

export type NotificationTopic = "proposal" | "settlement" | "task";

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
