import webPush from "web-push";
import type { Notification, NotificationPushSubscription, User } from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";

type Env = Record<string, string | undefined>;

type PushLocale = "en-US" | "zh-CN";

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
  deliveryMode: "send" | "dry-run";
};

export type WebPushDispatchSummary = {
  configured: boolean;
  deliveryMode: "send" | "dry-run" | "disabled";
  attempted: number;
  sent: number;
  failed: number;
  disabledSubscriptions: number;
};

const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url().max(2048),
  expirationTime: z.number().int().nonnegative().nullable().optional(),
  keys: z.object({
    p256dh: z.string().trim().min(16).max(512),
    auth: z.string().trim().min(8).max(512),
  }),
});

const deletePushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url().max(2048),
});

function trimEnv(env: Env, key: string) {
  return env[key]?.trim() || "";
}

function emptyDispatchSummary(): WebPushDispatchSummary {
  return {
    configured: false,
    deliveryMode: "disabled",
    attempted: 0,
    sent: 0,
    failed: 0,
    disabledSubscriptions: 0,
  };
}

function normalizeLocale(locale: string): PushLocale {
  return locale === "zh-CN" ? "zh-CN" : "en-US";
}

function resolveDeliveryMode(value: string | undefined) {
  return value?.trim().toLowerCase() === "dry-run" ? "dry-run" : "send";
}

export function resolveWebPushConfig(env: Env = process.env): WebPushConfig | null {
  const publicKey = trimEnv(env, "ROOMPIRE_WEB_PUSH_PUBLIC_KEY");
  const privateKey = trimEnv(env, "ROOMPIRE_WEB_PUSH_PRIVATE_KEY");
  const subject =
    trimEnv(env, "ROOMPIRE_WEB_PUSH_SUBJECT") ||
    trimEnv(env, "NEXT_PUBLIC_APP_URL") ||
    "mailto:admin@roompire.local";

  if (!publicKey && !privateKey) {
    return null;
  }

  if (!publicKey || !privateKey) {
    throw new ApiError(
      500,
      "WEB_PUSH_CONFIG_INVALID",
      "ROOMPIRE_WEB_PUSH_PUBLIC_KEY and ROOMPIRE_WEB_PUSH_PRIVATE_KEY must be configured together.",
    );
  }

  if (!subject.startsWith("mailto:") && !/^https?:\/\//.test(subject)) {
    throw new ApiError(
      500,
      "WEB_PUSH_CONFIG_INVALID",
      "ROOMPIRE_WEB_PUSH_SUBJECT must be a mailto: or http(s) contact URI.",
    );
  }

  return {
    publicKey,
    privateKey,
    subject,
    deliveryMode: resolveDeliveryMode(env.ROOMPIRE_WEB_PUSH_DELIVERY_MODE),
  };
}

export async function getPushSubscriptionSettingsForUser(userId: string) {
  const config = resolveWebPushConfig();
  const activeSubscriptionCount = await prisma.notificationPushSubscription.count({
    where: {
      userId,
      disabledAt: null,
    },
  });

  return {
    configured: Boolean(config),
    publicKey: config?.publicKey ?? null,
    deliveryMode: config?.deliveryMode ?? "disabled",
    activeSubscriptionCount,
  };
}

export async function savePushSubscriptionForUser(
  userId: string,
  input: unknown,
  userAgent?: string | null,
) {
  const config = resolveWebPushConfig();

  if (!config) {
    throw new ApiError(503, "WEB_PUSH_NOT_CONFIGURED", "Browser push is not configured.");
  }

  const parsed = pushSubscriptionSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Push subscription input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const expiresAt = typeof data.expirationTime === "number" ? new Date(data.expirationTime) : null;
  const trimmedUserAgent = userAgent?.trim().slice(0, 500) || null;
  const subscription = await prisma.notificationPushSubscription.upsert({
    where: {
      endpoint: data.endpoint,
    },
    update: {
      userId,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      expiresAt,
      userAgent: trimmedUserAgent,
      disabledAt: null,
      lastSeenAt: new Date(),
    },
    create: {
      userId,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      expiresAt,
      userAgent: trimmedUserAgent,
    },
  });

  return {
    id: subscription.id,
    endpoint: subscription.endpoint,
    active: subscription.disabledAt === null,
  };
}

export async function deletePushSubscriptionForUser(userId: string, input: unknown) {
  const parsed = deletePushSubscriptionSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Push subscription input is invalid.", parsed.error.flatten());
  }

  const result = await prisma.notificationPushSubscription.updateMany({
    where: {
      endpoint: parsed.data.endpoint,
      userId,
      disabledAt: null,
    },
    data: {
      disabledAt: new Date(),
    },
  });

  return {
    disabledCount: result.count,
  };
}

function formatDateTime(locale: PushLocale, value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatDate(locale: PushLocale, value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(timestamp));
}

function payloadRecord(notification: Notification) {
  return notification.payload && typeof notification.payload === "object"
    ? (notification.payload as Record<string, unknown>)
    : {};
}

export function webPushPayloadForNotification(
  notification: Notification,
  user: Pick<User, "preferredLocale">,
) {
  const locale = normalizeLocale(user.preferredLocale);
  const payload = payloadRecord(notification);
  const fallbackTitle = locale === "zh-CN" ? "Roompire 更新" : "Roompire update";
  const fallbackBody =
    locale === "zh-CN" ? "有一条家庭动态可查看。" : "A household update is ready.";

  if (notification.type === "EXPENSE_PROPOSAL_ASSIGNED") {
    const proposalTitle =
      typeof payload.proposalTitle === "string" ? payload.proposalTitle : fallbackTitle;
    const amount = typeof payload.amount === "string" ? payload.amount : "";
    const currency = typeof payload.currency === "string" ? payload.currency : "";
    const proposalId = typeof payload.proposalId === "string" ? payload.proposalId : null;

    return {
      title: locale === "zh-CN" ? "需要审批" : "Approval needed",
      body:
        locale === "zh-CN"
          ? `${proposalTitle} 分配给你 ${amount} ${currency}。`
          : `${proposalTitle} assigned you ${amount} ${currency}.`,
      url: proposalId
        ? `/${locale}/app/households/${notification.householdId}/expenses/proposals/${proposalId}`
        : `/${locale}/app`,
    };
  }

  if (notification.type === "TASK_DUE_SOON" || notification.type === "TASK_OVERDUE") {
    const taskTitle = typeof payload.taskTitle === "string" ? payload.taskTitle : fallbackTitle;
    const due = formatDateTime(locale, payload.dueAt);
    const isOverdue = notification.type === "TASK_OVERDUE";

    return {
      title:
        locale === "zh-CN"
          ? isOverdue
            ? "任务已逾期"
            : "任务即将到期"
          : isOverdue
            ? "Task overdue"
            : "Task due soon",
      body:
        locale === "zh-CN"
          ? `${taskTitle} ${isOverdue ? "已于" : "将于"} ${due} 到期。`
          : `${taskTitle} ${isOverdue ? "was due" : "is due"} ${due}.`,
      url: `/${locale}/app/calendar`,
    };
  }

  if (notification.type === "DEBT_DUE_SOON" || notification.type === "DEBT_OVERDUE") {
    const amount = typeof payload.amount === "string" ? payload.amount : "";
    const currency = typeof payload.currency === "string" ? payload.currency : "";
    const due = formatDate(locale, payload.dueDate);
    const isOverdue = notification.type === "DEBT_OVERDUE";

    return {
      title:
        locale === "zh-CN"
          ? isOverdue
            ? "还款已逾期"
            : "还款即将到期"
          : isOverdue
            ? "Repayment overdue"
            : "Repayment due soon",
      body:
        locale === "zh-CN"
          ? `${amount} ${currency} ${isOverdue ? "已于" : "将于"} ${due} 到期。`
          : `${amount} ${currency} ${isOverdue ? "was due" : "is due"} ${due}.`,
      url: `/${locale}/app/ledger`,
    };
  }

  if (notification.type === "SETTLEMENT_CONFIRMATION_REMINDER") {
    const amount = typeof payload.amount === "string" ? payload.amount : "";
    const currency = typeof payload.currency === "string" ? payload.currency : "";

    return {
      title: locale === "zh-CN" ? "还款待确认" : "Settlement waiting",
      body:
        locale === "zh-CN"
          ? `${amount} ${currency} 正等待你确认。`
          : `${amount} ${currency} is waiting for your confirmation.`,
      url: `/${locale}/app/ledger`,
    };
  }

  return {
    title: fallbackTitle,
    body: fallbackBody,
    url: `/${locale}/app`,
  };
}

function webPushStatusCode(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;

    return typeof statusCode === "number" ? statusCode : null;
  }

  return null;
}

async function disableSubscription(subscription: NotificationPushSubscription) {
  await prisma.notificationPushSubscription.updateMany({
    where: {
      id: subscription.id,
      disabledAt: null,
    },
    data: {
      disabledAt: new Date(),
    },
  });
}

export async function dispatchWebPushForNotifications(
  notificationIds: string[],
): Promise<WebPushDispatchSummary> {
  const uniqueIds = [...new Set(notificationIds)];

  if (uniqueIds.length === 0) {
    return emptyDispatchSummary();
  }

  let config: WebPushConfig | null = null;

  try {
    config = resolveWebPushConfig();
  } catch {
    return {
      ...emptyDispatchSummary(),
      failed: uniqueIds.length,
    };
  }

  if (!config) {
    return emptyDispatchSummary();
  }

  const notifications = await prisma.notification.findMany({
    where: {
      id: {
        in: uniqueIds,
      },
    },
  });
  const userIds = [...new Set(notifications.map((notification) => notification.userId))];
  const [users, subscriptions] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
      select: {
        id: true,
        preferredLocale: true,
      },
    }),
    prisma.notificationPushSubscription.findMany({
      where: {
        userId: {
          in: userIds,
        },
        disabledAt: null,
      },
    }),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const subscriptionsByUserId = new Map<string, NotificationPushSubscription[]>();
  const summary: WebPushDispatchSummary = {
    configured: true,
    deliveryMode: config.deliveryMode,
    attempted: 0,
    sent: 0,
    failed: 0,
    disabledSubscriptions: 0,
  };

  for (const subscription of subscriptions) {
    subscriptionsByUserId.set(subscription.userId, [
      ...(subscriptionsByUserId.get(subscription.userId) ?? []),
      subscription,
    ]);
  }

  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  for (const notification of notifications) {
    const user = usersById.get(notification.userId);

    if (!user) {
      continue;
    }

    const userSubscriptions = subscriptionsByUserId.get(notification.userId) ?? [];
    const text = webPushPayloadForNotification(notification, user);
    const payload = JSON.stringify({
      notificationId: notification.id,
      title: text.title,
      body: text.body,
      url: text.url,
      tag: `roompire:${notification.id}`,
    });

    for (const subscription of userSubscriptions) {
      summary.attempted += 1;

      if (config.deliveryMode === "dry-run") {
        summary.sent += 1;
        continue;
      }

      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          {
            TTL: 60 * 60 * 24,
          },
        );
        summary.sent += 1;
      } catch (error) {
        summary.failed += 1;
        const statusCode = webPushStatusCode(error);

        if (statusCode === 404 || statusCode === 410) {
          await disableSubscription(subscription);
          summary.disabledSubscriptions += 1;
        }
      }
    }
  }

  return summary;
}
