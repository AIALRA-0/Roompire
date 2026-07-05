"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Check, ChevronDown } from "lucide-react";
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
  loadMore: string;
  markRead: string;
  read: string;
  working: string;
  pushEnabled: string;
  pushDisabled: string;
  pushEnable: string;
  pushDisable: string;
  pushUnsupported: string;
  pushNotConfigured: string;
  pushPermissionDenied: string;
  pushError: string;
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
  page: PageInfo;
  unreadCount: number;
  labels: NotificationLabels;
};

type PageInfo = {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
};

type NotificationsListResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
  page: PageInfo;
};

type PushSettingsResponse = {
  configured: boolean;
  publicKey: string | null;
};

type PushStatus =
  | "checking"
  | "active"
  | "inactive"
  | "unsupported"
  | "not-configured"
  | "permission-denied"
  | "error";

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

function browserSupportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

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

export function NotificationCenter({
  locale,
  notifications,
  page,
  unreadCount,
  labels,
}: NotificationCenterProps) {
  const [items, setItems] = useState(notifications);
  const [pagination, setPagination] = useState(page);
  const [currentUnreadCount, setCurrentUnreadCount] = useState(unreadCount);
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);
  const [isPushBusy, setIsPushBusy] = useState(false);
  const unreadLabel = formatTemplate(labels.unread, {
    count: String(currentUnreadCount),
  });

  async function pushRegistration() {
    const existing = await navigator.serviceWorker.getRegistration("/");

    return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }

  async function saveBrowserPushSubscription(subscription: PushSubscription) {
    const json = subscription.toJSON();

    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error(labels.pushError);
    }

    const response = await fetch("/api/v1/notifications/push-subscriptions", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        expirationTime: json.expirationTime ?? null,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
      }),
    });

    if (!response.ok) {
      const payload: unknown = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : null;
      const errorPayload =
        payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;

      throw new Error(errorPayload?.error?.message ?? labels.pushError);
    }
  }

  async function loadPushStatus() {
    if (!browserSupportsPush()) {
      setPushStatus("unsupported");
      return;
    }

    const response = await fetch("/api/v1/notifications/push-subscriptions", {
      credentials: "same-origin",
    });
    const settings = (await response.json()) as PushSettingsResponse;

    if (!response.ok) {
      setPushStatus("error");
      return;
    }

    if (!settings.configured || !settings.publicKey) {
      setPushPublicKey(null);
      setPushStatus("not-configured");
      return;
    }

    setPushPublicKey(settings.publicKey);

    if (Notification.permission === "denied") {
      setPushStatus("permission-denied");
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      await saveBrowserPushSubscription(subscription);
      setPushStatus("active");
      return;
    }

    setPushStatus("inactive");
  }

  useEffect(() => {
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      void loadPushStatus().catch(() => {
        if (isMounted) {
          setPushStatus("error");
        }
      });
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushStatusText() {
    if (pushStatus === "active") {
      return labels.pushEnabled;
    }

    if (pushStatus === "inactive") {
      return labels.pushDisabled;
    }

    if (pushStatus === "unsupported") {
      return labels.pushUnsupported;
    }

    if (pushStatus === "not-configured") {
      return labels.pushNotConfigured;
    }

    if (pushStatus === "permission-denied") {
      return labels.pushPermissionDenied;
    }

    if (pushStatus === "error") {
      return labels.pushError;
    }

    return labels.working;
  }

  async function enablePush() {
    if (!pushPublicKey || !browserSupportsPush()) {
      return;
    }

    setIsPushBusy(true);

    try {
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;

      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "permission-denied" : "inactive");
        return;
      }

      const registration = await pushRegistration();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          applicationServerKey: base64UrlToUint8Array(pushPublicKey),
          userVisibleOnly: true,
        }));

      await saveBrowserPushSubscription(subscription);
      setPushStatus("active");
    } catch (error) {
      console.error(error);
      setPushStatus("error");
    } finally {
      setIsPushBusy(false);
    }
  }

  async function disablePush() {
    if (!browserSupportsPush()) {
      return;
    }

    setIsPushBusy(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription?.endpoint) {
        await fetch("/api/v1/notifications/push-subscriptions", {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });
        await subscription.unsubscribe();
      }

      setPushStatus("inactive");
    } catch (error) {
      console.error(error);
      setPushStatus("error");
    } finally {
      setIsPushBusy(false);
    }
  }

  async function loadMore() {
    if (!pagination.nextCursor) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const params = new URLSearchParams({
        cursor: pagination.nextCursor,
        limit: String(pagination.limit),
      });
      const response = await fetch(`/api/v1/notifications?${params.toString()}`, {
        credentials: "same-origin",
      });
      const payload: unknown = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : null;

      if (!response.ok) {
        const errorPayload =
          payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
        throw new Error(errorPayload?.error?.message ?? "Notification fetch failed.");
      }

      const result = payload as NotificationsListResponse;
      setItems((current) => [...current, ...result.notifications]);
      setPagination(result.page);
      setCurrentUnreadCount(result.unreadCount);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function markRead(notificationId: string) {
    setPendingNotificationId(notificationId);
    const wasUnread = items.some(
      (notification) => notification.id === notificationId && !notification.readAt,
    );

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
        if (wasUnread && updated.readAt) {
          setCurrentUnreadCount((count) => Math.max(count - 1, 0));
        }
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

  function handleLoadMore() {
    void loadMore().catch((error: unknown) => {
      console.error(error);
    });
  }

  const canEnablePush = pushStatus === "inactive" && Boolean(pushPublicKey);
  const canDisablePush = pushStatus === "active";

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
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={currentUnreadCount > 0 ? "warning" : "neutral"}>{unreadLabel}</Badge>
          <Badge
            data-testid="push-status"
            variant={pushStatus === "active" ? "success" : "neutral"}
          >
            {pushStatusText()}
          </Badge>
          <Button
            data-testid="push-toggle"
            disabled={isPushBusy || (!canEnablePush && !canDisablePush)}
            onClick={() => {
              if (canDisablePush) {
                void disablePush();
                return;
              }

              void enablePush();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {canDisablePush ? (
              <BellOff aria-hidden="true" className="h-4 w-4" />
            ) : (
              <BellRing aria-hidden="true" className="h-4 w-4" />
            )}
            {isPushBusy ? labels.working : canDisablePush ? labels.pushDisable : labels.pushEnable}
          </Button>
        </div>
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
      {pagination.hasMore ? (
        <div className="border-t border-border p-4">
          <Button
            className="w-full"
            data-testid="notifications-load-more"
            disabled={isLoadingMore}
            onClick={handleLoadMore}
            type="button"
            variant="outline"
          >
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
            {isLoadingMore ? labels.working : labels.loadMore}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
