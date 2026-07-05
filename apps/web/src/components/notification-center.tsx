"use client";

import { useMemo, useState } from "react";
import { Bell, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type NotificationItem = {
  id: string;
  householdId: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
};

type NotificationLabels = {
  title: string;
  hint: string;
  unread: string;
  noNotifications: string;
  markRead: string;
  read: string;
  openProposal: string;
  openCalendar: string;
  openLedger: string;
  expenseProposalAssignedTitle: string;
  expenseProposalAssignedBody: string;
  taskDueSoonTitle: string;
  taskDueSoonBody: string;
  taskOverdueTitle: string;
  taskOverdueBody: string;
  debtDueSoonTitle: string;
  debtDueSoonBody: string;
  debtOverdueTitle: string;
  debtOverdueBody: string;
  settlementConfirmationReminderTitle: string;
  settlementConfirmationReminderBody: string;
  unknownTitle: string;
  unknownBody: string;
};

type NotificationCenterProps = {
  locale: string;
  notifications: NotificationItem[];
  labels: NotificationLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

function asPayloadRecord(payload: unknown) {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function formatTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

function formatDateTime(locale: string, value: unknown) {
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

function formatDate(locale: string, value: unknown) {
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

function notificationText(
  notification: NotificationItem,
  labels: NotificationLabels,
  locale: string,
) {
  const payload = asPayloadRecord(notification.payload);

  if (notification.type === "EXPENSE_PROPOSAL_ASSIGNED") {
    const proposalTitle =
      typeof payload.proposalTitle === "string" ? payload.proposalTitle : labels.unknownTitle;
    const amount = typeof payload.amount === "string" ? payload.amount : "";
    const currency = typeof payload.currency === "string" ? payload.currency : "";

    return {
      title: labels.expenseProposalAssignedTitle,
      body: formatTemplate(labels.expenseProposalAssignedBody, {
        title: proposalTitle,
        amount,
        currency,
      }),
      href:
        typeof payload.proposalId === "string"
          ? `/${locale}/app/households/${notification.householdId}/expenses/proposals/${payload.proposalId}`
          : null,
      actionLabel: labels.openProposal,
    };
  }

  if (notification.type === "TASK_DUE_SOON" || notification.type === "TASK_OVERDUE") {
    const title = typeof payload.taskTitle === "string" ? payload.taskTitle : labels.unknownTitle;
    const due = formatDateTime(locale, payload.dueAt);
    const isOverdue = notification.type === "TASK_OVERDUE";

    return {
      title: isOverdue ? labels.taskOverdueTitle : labels.taskDueSoonTitle,
      body: formatTemplate(isOverdue ? labels.taskOverdueBody : labels.taskDueSoonBody, {
        title,
        due,
      }),
      href: `/${locale}/app/calendar`,
      actionLabel: labels.openCalendar,
    };
  }

  if (notification.type === "DEBT_DUE_SOON" || notification.type === "DEBT_OVERDUE") {
    const amount = typeof payload.amount === "string" ? payload.amount : "";
    const currency = typeof payload.currency === "string" ? payload.currency : "";
    const due = formatDate(locale, payload.dueDate);
    const isOverdue = notification.type === "DEBT_OVERDUE";

    return {
      title: isOverdue ? labels.debtOverdueTitle : labels.debtDueSoonTitle,
      body: formatTemplate(isOverdue ? labels.debtOverdueBody : labels.debtDueSoonBody, {
        amount,
        currency,
        due,
      }),
      href: `/${locale}/app/ledger`,
      actionLabel: labels.openLedger,
    };
  }

  if (notification.type === "SETTLEMENT_CONFIRMATION_REMINDER") {
    const amount = typeof payload.amount === "string" ? payload.amount : "";
    const currency = typeof payload.currency === "string" ? payload.currency : "";

    return {
      title: labels.settlementConfirmationReminderTitle,
      body: formatTemplate(labels.settlementConfirmationReminderBody, {
        amount,
        currency,
      }),
      href: `/${locale}/app/ledger`,
      actionLabel: labels.openLedger,
    };
  }

  return {
    title: labels.unknownTitle,
    body: labels.unknownBody,
    href: null,
    actionLabel: null,
  };
}

export function NotificationCenter({ locale, notifications, labels }: NotificationCenterProps) {
  const [items, setItems] = useState(notifications);
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);
  const currentUnreadCount = useMemo(
    () => items.filter((notification) => !notification.readAt).length,
    [items],
  );
  const unreadLabel = formatTemplate(labels.unread, {
    count: String(currentUnreadCount),
  });

  async function markRead(notificationId: string) {
    setPendingNotificationId(notificationId);

    try {
      const response = await fetch(`/api/v1/notifications/${notificationId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ read: true }),
      });
      const payload: unknown = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : null;

      if (!response.ok) {
        const errorPayload =
          payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
        throw new Error(errorPayload?.error?.message ?? "Notification update failed.");
      }

      const updated =
        payload && typeof payload === "object"
          ? (payload as { notification?: NotificationItem }).notification
          : null;

      if (updated) {
        setItems((current) =>
          current.map((notification) =>
            notification.id === notificationId ? updated : notification,
          ),
        );
      }
    } finally {
      setPendingNotificationId(null);
    }
  }

  function handleMarkRead(notificationId: string) {
    void markRead(notificationId).catch((error: unknown) => {
      console.error(error);
      setItems((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                readAt: null,
              }
            : notification,
        ),
      );
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="notification-center">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell aria-hidden="true" className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">{labels.title}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{labels.hint}</p>
        </div>
        <Badge variant={currentUnreadCount > 0 ? "warning" : "neutral"}>{unreadLabel}</Badge>
      </div>
      <div className="divide-y divide-border">
        {items.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{labels.noNotifications}</p>
        ) : (
          items.map((notification) => {
            const text = notificationText(notification, labels, locale);
            const isUnread = !notification.readAt;

            return (
              <article
                className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                data-testid={`notification-row-${notification.type}`}
                key={notification.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{text.title}</h3>
                    <Badge variant={isUnread ? "success" : "neutral"}>
                      {isUnread ? labels.unread.replace("{count}", "1") : labels.read}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{text.body}</p>
                  <time className="mt-2 block text-xs text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString()}
                  </time>
                </div>
                <div className="flex flex-wrap gap-2">
                  {text.href && text.actionLabel ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={text.href}>{text.actionLabel}</a>
                    </Button>
                  ) : null}
                  <Button
                    disabled={!isUnread || pendingNotificationId !== null}
                    onClick={() => {
                      handleMarkRead(notification.id);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Check aria-hidden="true" className="h-4 w-4" />
                    {isUnread ? labels.markRead : labels.read}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
