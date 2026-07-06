import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/api/errors";
import {
  EcbFxProvider,
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

  it("parses ECB historical rates and cross-converts through EUR", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dataSets: [
            {
              series: {
                "0:0:0:0:0": {
                  observations: {
                    "1": [7.7612, 0, 0, null, null],
                  },
                },
                "0:1:0:0:0": {
                  observations: {
                    "1": [1.1456, 0, 0, null, null],
                  },
                },
              },
            },
          ],
          structure: {
            dimensions: {
              series: [
                { id: "FREQ", values: [{ id: "D" }] },
                { id: "CURRENCY", values: [{ id: "CNY" }, { id: "USD" }] },
                { id: "CURRENCY_DENOM", values: [{ id: "EUR" }] },
                { id: "EXR_TYPE", values: [{ id: "SP00" }] },
                { id: "EXR_SUFFIX", values: [{ id: "A" }] },
              ],
              observation: [
                {
                  id: "TIME_PERIOD",
                  values: [{ id: "2026-06-21" }, { id: "2026-06-22" }],
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const quote = await new EcbFxProvider().getRate({
      baseCurrency: "usd",
      quoteCurrency: "cny",
      date: "2026-06-22",
    });
    const url = fetchMock.mock.calls[0]?.[0] as URL;

    expect(url.toString()).toBe(
      "https://data-api.ecb.europa.eu/service/data/EXR/D.USD+CNY.EUR.SP00.A?startPeriod=2026-06-15&endPeriod=2026-06-22&format=jsondata",
    );
    expect(quote.provider).toBe("ecb");
    expect(quote.rate.toFixed(12)).toBe("6.774790502793");
    expect(quote.rateDate).toBe("2026-06-22");
    expect(quote.sourceMeta).toMatchObject({
      requestedBaseCurrency: "USD",
      requestedQuoteCurrency: "CNY",
      requestedDate: "2026-06-22",
      providerBaseUrl: "https://data-api.ecb.europa.eu/service/data/EXR/",
      referenceCurrency: "EUR",
      basePerEur: "1.1456",
      quotePerEur: "7.7612",
    });
  });

  it("uses ECB direct EUR reference rates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dataSets: [
            {
              series: {
                "0:0:0:0:0": {
                  observations: {
                    "0": [1.1456],
                  },
                },
              },
            },
          ],
          structure: {
            dimensions: {
              series: [
                { id: "FREQ", values: [{ id: "D" }] },
                { id: "CURRENCY", values: [{ id: "USD" }] },
                { id: "CURRENCY_DENOM", values: [{ id: "EUR" }] },
                { id: "EXR_TYPE", values: [{ id: "SP00" }] },
                { id: "EXR_SUFFIX", values: [{ id: "A" }] },
              ],
              observation: [
                {
                  id: "TIME_PERIOD",
                  values: [{ id: "2026-06-22" }],
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    );

    const quote = await new EcbFxProvider().getRate({
      baseCurrency: "eur",
      quoteCurrency: "usd",
      date: "2026-06-22",
    });

    expect((fetchMock.mock.calls[0]?.[0] as URL).toString()).toContain("/D.USD.EUR.SP00.A?");
    expect(quote.rate.toString()).toBe("1.1456");
    expect(quote.rateDate).toBe("2026-06-22");
  });

  it("falls back across configured FX provider families", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dataSets: [
              {
                series: {
                  "0:0:0:0:0": {
                    observations: {
                      "0": [7.7612],
                    },
                  },
                  "0:1:0:0:0": {
                    observations: {
                      "0": [1.1456],
                    },
                  },
                },
              },
            ],
            structure: {
              dimensions: {
                series: [
                  { id: "FREQ", values: [{ id: "D" }] },
                  { id: "CURRENCY", values: [{ id: "CNY" }, { id: "USD" }] },
                  { id: "CURRENCY_DENOM", values: [{ id: "EUR" }] },
                  { id: "EXR_TYPE", values: [{ id: "SP00" }] },
                  { id: "EXR_SUFFIX", values: [{ id: "A" }] },
                ],
                observation: [
                  {
                    id: "TIME_PERIOD",
                    values: [{ id: "2026-06-22" }],
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
      );

    const provider = resolveConfiguredFxProvider({
      ROOMPIRE_FX_PROVIDER: "frankfurter,ecb",
      ROOMPIRE_FX_FRANKFURTER_BASE_URLS: "https://primary-fx.example/",
      ROOMPIRE_FX_ECB_BASE_URLS: "https://data-api.example/service/data/EXR",
    });

    expect(provider).toBeInstanceOf(FallbackFxProvider);

    const quote = await provider!.getRate({
      baseCurrency: "USD",
      quoteCurrency: "CNY",
      date: "2026-06-22",
    });

    expect((fetchMock.mock.calls[0]?.[0] as URL).toString()).toBe(
      "https://primary-fx.example/2026-06-22?from=USD&to=CNY",
    );
    expect((fetchMock.mock.calls[1]?.[0] as URL).toString()).toBe(
      "https://data-api.example/service/data/EXR/D.USD+CNY.EUR.SP00.A?startPeriod=2026-06-15&endPeriod=2026-06-22&format=jsondata",
    );
    expect(quote.provider).toBe("ecb");
    expect(quote.rate.toFixed(12)).toBe("6.774790502793");
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
    expect(() =>
      resolveConfiguredFxProvider({
        ROOMPIRE_FX_PROVIDER: "ecb",
        ROOMPIRE_FX_ECB_BASE_URLS: "not a url",
      }),
    ).toThrow(ApiError);
  });
});
