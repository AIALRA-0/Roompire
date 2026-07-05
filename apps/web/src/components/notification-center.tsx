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
  expenseProposalAssignedTitle: string;
  expenseProposalAssignedBody: string;
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

function notificationText(notification: NotificationItem, labels: NotificationLabels) {
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
      proposalId: typeof payload.proposalId === "string" ? payload.proposalId : null,
    };
  }

  return {
    title: labels.unknownTitle,
    body: labels.unknownBody,
    proposalId: null,
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
            const text = notificationText(notification, labels);
            const isUnread = !notification.readAt;
            const proposalHref = text.proposalId
              ? `/${locale}/app/households/${notification.householdId}/expenses/proposals/${text.proposalId}`
              : null;

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
                  {proposalHref ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={proposalHref}>{labels.openProposal}</a>
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
