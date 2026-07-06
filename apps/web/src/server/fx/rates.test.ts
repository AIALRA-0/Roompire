import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/errors";
import {
  FrankfurterFxProvider,
  FallbackFxProvider,
  resolveConfiguredFxProvider,
  resolveConfiguredFxProviders,
} from "./rates";

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
      providerBaseUrl: "https://api.frankfurter.app/",
    });
  });

  it("falls back across configured Frankfurter-compatible endpoints", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            amount: 1,
            base: "USD",
            date: "2026-07-03",
            rates: {
              CNY: 7.125,
            },
          }),
          { status: 200 },
        ),
      );

    const provider = resolveConfiguredFxProvider({
      ROOMPIRE_FX_PROVIDER: "frankfurter",
      ROOMPIRE_FX_FRANKFURTER_BASE_URLS:
        "https://primary-fx.example/api, https://secondary-fx.example/",
    });

    expect(provider).toBeInstanceOf(FallbackFxProvider);

    const quote = await provider!.getRate({
      baseCurrency: "USD",
      quoteCurrency: "CNY",
      date: "2026-07-04",
    });

    expect((fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "https://primary-fx.example/api/2026-07-04?from=USD&to=CNY",
    );
    expect((fetchMock.mock.calls[1]?.[0] as URL).toString()).toBe(
      "https://secondary-fx.example/2026-07-04?from=USD&to=CNY",
    );
    expect(quote.provider).toBe("frankfurter-2");
    expect(quote.rate.toString()).toBe("7.125");
    expect(quote.sourceMeta).toMatchObject({
      providerBaseUrl: "https://secondary-fx.example/",
    });
  });

  it("can disable live provider lookup for cache-only deployments", () => {
    expect(resolveConfiguredFxProvider({ ROOMPIRE_FX_PROVIDER: "cache-only" })).toBeNull();
    expect(resolveConfiguredFxProvider({ ROOMPIRE_FX_PROVIDER: "none" })).toBeNull();
    expect(resolveConfiguredFxProviders({ ROOMPIRE_FX_PROVIDER: "cache-only" })).toBeNull();
  });

  it("rejects unsupported provider configuration", () => {
    expect(() => resolveConfiguredFxProvider({ ROOMPIRE_FX_PROVIDER: "made-up" })).toThrow(
      ApiError,
    );
    expect(() =>
      resolveConfiguredFxProvider({ ROOMPIRE_FX_PROVIDER: "frankfurter,cache-only" }),
    ).toThrow(ApiError);
    expect(() =>
      resolveConfiguredFxProvider({
        ROOMPIRE_FX_PROVIDER: "frankfurter",
        ROOMPIRE_FX_FRANKFURTER_BASE_URLS: "not a url",
      }),
    ).toThrow(ApiError);
  });
});
