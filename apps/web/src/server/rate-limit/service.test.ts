import { describe, expect, it } from "vitest";
import {
  checkRateLimit,
  createMemoryRateLimitStore,
  rateLimitHeaders,
} from "@/server/rate-limit/service";

describe("rate limit service", () => {
  it("blocks requests after the fixed-window limit", () => {
    const store = createMemoryRateLimitStore();
    const input = {
      nowMs: 1_000,
      scope: "inviteCreate" as const,
      subject: "User@example.test",
    };

    for (let count = 0; count < 20; count += 1) {
      expect(checkRateLimit(input, store).allowed).toBe(true);
    }

    const blocked = checkRateLimit(input, store);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(3600);
  });

  it("resets the counter after the window expires", () => {
    const store = createMemoryRateLimitStore();
    const input = {
      scope: "inviteAccept" as const,
      subject: "user-1",
    };

    for (let count = 0; count < 120; count += 1) {
      checkRateLimit({ ...input, nowMs: 1_000 }, store);
    }

    expect(checkRateLimit({ ...input, nowMs: 1_000 }, store).allowed).toBe(false);
    expect(checkRateLimit({ ...input, nowMs: 602_000 }, store).allowed).toBe(true);
  });

  it("separates subjects and households", () => {
    const store = createMemoryRateLimitStore();

    for (let count = 0; count < 20; count += 1) {
      checkRateLimit(
        {
          householdId: "household-a",
          nowMs: 1_000,
          scope: "inviteCreate",
          subject: "user-1",
        },
        store,
      );
    }

    expect(
      checkRateLimit(
        {
          householdId: "household-a",
          nowMs: 1_000,
          scope: "inviteCreate",
          subject: "user-1",
        },
        store,
      ).allowed,
    ).toBe(false);
    expect(
      checkRateLimit(
        {
          householdId: "household-b",
          nowMs: 1_000,
          scope: "inviteCreate",
          subject: "user-1",
        },
        store,
      ).allowed,
    ).toBe(true);
  });

  it("returns standard rate limit headers", () => {
    const store = createMemoryRateLimitStore();

    for (let count = 0; count < 120; count += 1) {
      checkRateLimit(
        {
          nowMs: 1_000,
          scope: "devSession",
          subject: "127.0.0.1",
        },
        store,
      );
    }

    const blocked = checkRateLimit(
      {
        nowMs: 1_000,
        scope: "devSession",
        subject: "127.0.0.1",
      },
      store,
    );

    expect(rateLimitHeaders(blocked)).toMatchObject({
      "RateLimit-Limit": "120",
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": "301",
      "Retry-After": "300",
    });
  });
});
