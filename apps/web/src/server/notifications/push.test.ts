import type { Notification } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/api/errors";
import { resolveWebPushConfig, webPushPayloadForNotification } from "./push";

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: "notification-id",
    householdId: "household-id",
    userId: "user-id",
    type: "EXPENSE_PROPOSAL_ASSIGNED",
    dedupeKey: null,
    titleKey: "expenseProposalAssignedTitle",
    bodyKey: "expenseProposalAssignedBody",
    payload: {
      proposalId: "proposal-id",
      proposalTitle: "Groceries",
      amount: "12.34",
      currency: "CNY",
    },
    readAt: null,
    createdAt: new Date("2026-07-05T00:00:00.000Z"),
    ...overrides,
  };
}

describe("web push notifications", () => {
  it("treats missing VAPID keys as disabled", () => {
    expect(resolveWebPushConfig({})).toBeNull();
  });

  it("requires VAPID keys to be configured together", () => {
    expect(() =>
      resolveWebPushConfig({
        ROOMPIRE_WEB_PUSH_PUBLIC_KEY: "public-key",
      }),
    ).toThrow(ApiError);
  });

  it("resolves dry-run delivery mode", () => {
    expect(
      resolveWebPushConfig({
        NEXT_PUBLIC_APP_URL: "https://roompire.example",
        ROOMPIRE_WEB_PUSH_PUBLIC_KEY: "public-key",
        ROOMPIRE_WEB_PUSH_PRIVATE_KEY: "private-key",
        ROOMPIRE_WEB_PUSH_DELIVERY_MODE: "dry-run",
      }),
    ).toEqual({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "https://roompire.example",
      deliveryMode: "dry-run",
    });
  });

  it("formats proposal push payloads by user locale", () => {
    expect(
      webPushPayloadForNotification(notification({}), {
        preferredLocale: "en-US",
      }),
    ).toEqual({
      title: "Approval needed",
      body: "Groceries assigned you 12.34 CNY.",
      url: "/en-US/app/households/household-id/expenses/proposals/proposal-id",
    });
    expect(
      webPushPayloadForNotification(notification({}), {
        preferredLocale: "zh-CN",
      }),
    ).toEqual({
      title: "需要审批",
      body: "Groceries 分配给你 12.34 CNY。",
      url: "/zh-CN/app/households/household-id/expenses/proposals/proposal-id",
    });
  });

  it("formats reminder payloads with safe in-app destinations", () => {
    expect(
      webPushPayloadForNotification(
        notification({
          type: "TASK_OVERDUE",
          payload: {
            taskTitle: "Kitchen reset",
            dueAt: "2026-07-05T12:00:00.000Z",
          },
        }),
        {
          preferredLocale: "en-US",
        },
      ),
    ).toMatchObject({
      title: "Task overdue",
      url: "/en-US/app/calendar",
    });
  });
});
