import type { NotificationPreference, User } from "@prisma/client";
import { z } from "zod";
import { validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";

export type NotificationPreferenceSummary = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  proposalUpdatesEnabled: boolean;
  settlementUpdatesEnabled: boolean;
  taskRemindersEnabled: boolean;
};

export type UserSettingsSummary = {
  id: string;
  email: string;
  displayName: string;
  preferredLocale: "en-US" | "zh-CN";
  notificationPreferences: NotificationPreferenceSummary;
};

export const updateCurrentUserSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  preferredLocale: z.enum(["en-US", "zh-CN"]),
  notificationPreferences: z.object({
    inAppEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    proposalUpdatesEnabled: z.boolean(),
    settlementUpdatesEnabled: z.boolean(),
    taskRemindersEnabled: z.boolean(),
  }),
});

export function defaultNotificationPreferences(): NotificationPreferenceSummary {
  return {
    inAppEnabled: true,
    emailEnabled: false,
    proposalUpdatesEnabled: true,
    settlementUpdatesEnabled: true,
    taskRemindersEnabled: true,
  };
}

export function serializeNotificationPreferences(
  preferences: NotificationPreference | null | undefined,
): NotificationPreferenceSummary {
  if (!preferences) {
    return defaultNotificationPreferences();
  }

  return {
    inAppEnabled: preferences.inAppEnabled,
    emailEnabled: preferences.emailEnabled,
    proposalUpdatesEnabled: preferences.proposalUpdatesEnabled,
    settlementUpdatesEnabled: preferences.settlementUpdatesEnabled,
    taskRemindersEnabled: preferences.taskRemindersEnabled,
  };
}

export function serializeUserSettings(
  user: Pick<User, "id" | "email" | "displayName" | "preferredLocale">,
  preferences?: NotificationPreference | null,
): UserSettingsSummary {
  const preferredLocale = user.preferredLocale === "zh-CN" ? "zh-CN" : "en-US";

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    preferredLocale,
    notificationPreferences: serializeNotificationPreferences(preferences),
  };
}

export async function getUserSettings(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      notificationPreference: true,
    },
  });

  return serializeUserSettings(user, user.notificationPreference);
}

export async function updateCurrentUser(userId: string, input: unknown) {
  const parsed = updateCurrentUserSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("User settings input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        displayName: data.displayName,
        preferredLocale: data.preferredLocale,
      },
    });

    const notificationPreference = await tx.notificationPreference.upsert({
      where: { userId },
      update: data.notificationPreferences,
      create: {
        userId,
        ...data.notificationPreferences,
      },
    });

    return serializeUserSettings(user, notificationPreference);
  });
}
