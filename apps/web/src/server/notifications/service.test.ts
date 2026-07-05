import { describe, expect, it } from "vitest";
import { shouldCreateInAppNotification } from "./service";

describe("notification service", () => {
  it("uses default preferences to allow in-app proposal notifications", () => {
    expect(shouldCreateInAppNotification(null, "proposal")).toBe(true);
  });

  it("respects global in-app and topic-specific switches", () => {
    const basePreference = {
      id: "preference-id",
      userId: "user-id",
      inAppEnabled: true,
      emailEnabled: false,
      proposalUpdatesEnabled: true,
      settlementUpdatesEnabled: true,
      taskRemindersEnabled: true,
      createdAt: new Date("2026-07-05T00:00:00.000Z"),
      updatedAt: new Date("2026-07-05T00:00:00.000Z"),
    };

    expect(
      shouldCreateInAppNotification(
        {
          ...basePreference,
          inAppEnabled: false,
        },
        "proposal",
      ),
    ).toBe(false);
    expect(
      shouldCreateInAppNotification(
        {
          ...basePreference,
          proposalUpdatesEnabled: false,
        },
        "proposal",
      ),
    ).toBe(false);
    expect(
      shouldCreateInAppNotification(
        {
          ...basePreference,
          taskRemindersEnabled: false,
        },
        "settlement",
      ),
    ).toBe(true);
  });
});
