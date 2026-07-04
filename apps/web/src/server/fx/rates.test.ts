import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/errors";
import { FrankfurterFxProvider, resolveConfiguredFxProvider } from "./rates";

describe("FX rate providers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a Frankfurter historical rate response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          amount: 1,
          base: "USD",
          date: "2026-07-03",
          rates: {
            CNY: 6.7814,
          },
        }),
        { status: 200 },
      ),
    );

    const quote = await new FrankfurterFxProvider().getRate({
      baseCurrency: "usd",
      quoteCurrency: "cny",
      date: "2026-07-04",
    });
    const url = fetchMock.mock.calls[0]?.[0] as URL;

    expect(url.toString()).toBe("https://api.frankfurter.app/2026-07-04?from=USD&to=CNY");
    expect(quote.provider).toBe("frankfurter");
    expect(quote.rate.toString()).toBe("6.7814");
    expect(quote.rateDate).toBe("2026-07-03");
    expect(quote.sourceMeta).toMatchObject({
      requestedBaseCurrency: "USD",
      requestedQuoteCurrency: "CNY",
      requestedDate: "2026-07-04",
    });
  });

  it("can disable live provider lookup for cache-only deployments", () => {
    expect(resolveConfiguredFxProvider({ ROOMPIRE_FX_PROVIDER: "cache-only" })).toBeNull();
    expect(resolveConfiguredFxProvider({ ROOMPIRE_FX_PROVIDER: "none" })).toBeNull();
  });

  it("rejects unsupported provider configuration", () => {
    expect(() => resolveConfiguredFxProvider({ ROOMPIRE_FX_PROVIDER: "made-up" })).toThrow(
      ApiError,
    );
  });
});
