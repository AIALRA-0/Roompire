import { describe, expect, it } from "vitest";
import {
  classifyDateOnlyReminder,
  classifyDateTimeReminder,
  reminderDedupeKey,
  shouldCreateInAppNotification,
} from "./service";

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

  it("classifies date-time and date-only reminders", () => {
    const now = new Date("2026-07-05T12:00:00.000Z");
    const today = new Date("2026-07-05T00:00:00.000Z");

    expect(
      classifyDateTimeReminder(new Date("2026-07-05T11:59:00.000Z"), now, 24 * 60 * 60 * 1000),
    ).toBe("OVERDUE");
    expect(
      classifyDateTimeReminder(new Date("2026-07-06T11:00:00.000Z"), now, 24 * 60 * 60 * 1000),
    ).toBe("DUE_SOON");
    expect(
      classifyDateTimeReminder(new Date("2026-07-07T12:00:00.000Z"), now, 24 * 60 * 60 * 1000),
    ).toBeNull();

    expect(classifyDateOnlyReminder(new Date("2026-07-04T00:00:00.000Z"), today, 3)).toBe(
      "OVERDUE",
    );
    expect(classifyDateOnlyReminder(new Date("2026-07-08T00:00:00.000Z"), today, 3)).toBe(
      "DUE_SOON",
    );
    expect(classifyDateOnlyReminder(new Date("2026-07-09T00:00:00.000Z"), today, 3)).toBeNull();
  });

  it("deduplicates reminders per recipient", () => {
    expect(reminderDedupeKey("task", "task-id", "TASK_OVERDUE", "alice")).toBe(
      "task:task-id:task_overdue:alice",
    );
    expect(reminderDedupeKey("task", "task-id", "TASK_OVERDUE", "alice")).not.toBe(
      reminderDedupeKey("task", "task-id", "TASK_OVERDUE", "bob"),
    );
  });
});
