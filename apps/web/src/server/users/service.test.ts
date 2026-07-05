import { describe, expect, it } from "vitest";
import {
  defaultNotificationPreferences,
  serializeNotificationPreferences,
  updateCurrentUserSchema,
} from "./service";

describe("user settings service", () => {
  it("uses conservative notification defaults before preferences are saved", () => {
    expect(defaultNotificationPreferences()).toEqual({
      inAppEnabled: true,
      emailEnabled: false,
      proposalUpdatesEnabled: true,
      settlementUpdatesEnabled: true,
      taskRemindersEnabled: true,
    });
    expect(serializeNotificationPreferences(null)).toEqual(defaultNotificationPreferences());
  });

  it("validates profile and notification preference updates", () => {
    expect(
      updateCurrentUserSchema.safeParse({
        displayName: "Profile User",
        preferredLocale: "zh-CN",
        notificationPreferences: {
          inAppEnabled: true,
          emailEnabled: false,
          proposalUpdatesEnabled: true,
          settlementUpdatesEnabled: true,
          taskRemindersEnabled: false,
        },
      }).success,
    ).toBe(true);

    expect(
      updateCurrentUserSchema.safeParse({
        displayName: "",
        preferredLocale: "fr-FR",
        notificationPreferences: {
          inAppEnabled: true,
          emailEnabled: false,
          proposalUpdatesEnabled: true,
          settlementUpdatesEnabled: true,
          taskRemindersEnabled: true,
        },
      }).success,
    ).toBe(false);
  });
});
