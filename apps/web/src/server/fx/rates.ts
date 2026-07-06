import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";

export type FxRateQuote = {
  rate: Decimal;
  rateDate: string;
  provider: string;
  fetchedAt: Date;
  sourceMeta?: Prisma.InputJsonValue;
};

export type FxRateLock = {
  rate: Decimal;
  rateDate: Date;
  provider: string;
  lockedAt: Date;
};

export type FxProvider = {
  name: string;
  getRate(input: {
    baseCurrency: string;
    quoteCurrency: string;
    date: string;
  }): Promise<FxRateQuote>;
};

type CachedRateRow = {
  provider: string;
  baseCurrency: string;
  quoteCurrency: string;
  rateDate: Date;
  rate: Decimal.Value;
  fetchedAt: Date;
};

const frankfurterResponseSchema = z.object({
  amount: z.number(),
  base: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.record(z.string(), z.number()),
});

const ecbObservationValueSchema = z.union([z.number(), z.string(), z.null()]);
const ecbResponseSchema = z.object({
  dataSets: z.array(
    z.object({
      series: z
        .record(
          z.string(),
          z.object({
            observations: z.record(z.string(), z.array(ecbObservationValueSchema)),
          }),
        )
        .optional(),
    }),
  ),
  structure: z.object({
    dimensions: z.object({
      series: z.array(
        z.object({
          id: z.string(),
          values: z.array(
            z.object({
              id: z.string(),
            }),
          ),
        }),
      ),
      observation: z.array(
        z.object({
          id: z.string(),
          values: z.array(
            z.object({
              id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            }),
          ),
        }),
      ),
    }),
  }),
});

const DEFAULT_FRANKFURTER_BASE_URL = "https://api.frankfurter.app";
const DEFAULT_ECB_BASE_URL = "https://data-api.ecb.europa.eu/service/data/EXR";
const ECB_REFERENCE_CURRENCY = "EUR";

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateToDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateOnlyDaysBefore(value: string, days: number) {
  const date = dateOnlyToUtc(value);

  date.setUTCDate(date.getUTCDate() - days);

  return dateToDateOnly(date);
}

function currency(value: string) {
  return value.trim().toUpperCase();
}

function maxCacheBackfillDate(date: Date) {
  const lowerBound = new Date(date);

  lowerBound.setUTCDate(lowerBound.getUTCDate() - 7);

  return lowerBound;
}

function parseList(value: string | undefined, fallback: string[]) {
  const rawItems = value ? value.split(",") : fallback;
  const items = rawItems.map((item) => item.trim()).filter(Boolean);

  return items.length > 0 ? items : fallback;
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);

  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  url.search = "";
  url.hash = "";

  return url.toString();
}

function cachedRateToLock(
  row: CachedRateRow,
  input: { baseCurrency: string; quoteCurrency: string },
) {
  const requestedBase = currency(input.baseCurrency);
  const requestedQuote = currency(input.quoteCurrency);
  const inverted = row.baseCurrency !== requestedBase || row.quoteCurrency !== requestedQuote;
  const rate = new Decimal(row.rate.toString());

  return {
    rate: inverted ? new Decimal(1).div(rate) : rate,
    rateDate: row.rateDate,
    provider: inverted ? `${row.provider}-inverse` : row.provider,
    lockedAt: new Date(),
  } satisfies FxRateLock;
}

export class FrankfurterFxProvider implements FxProvider {
  readonly baseUrl: string;
  readonly name: string;

  constructor(input: { baseUrl?: string; name?: string } = {}) {
    this.baseUrl = normalizeBaseUrl(input.baseUrl ?? DEFAULT_FRANKFURTER_BASE_URL);
    this.name = input.name ?? "frankfurter";
  }

  async getRate(input: {
    baseCurrency: string;
    quoteCurrency: string;
    date: string;
  }): Promise<FxRateQuote> {
    const baseCurrency = currency(input.baseCurrency);
    const quoteCurrency = currency(input.quoteCurrency);
    const url = new URL(input.date, this.baseUrl);

    url.searchParams.set("from", baseCurrency);
    url.searchParams.set("to", quoteCurrency);

    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Frankfurter returned ${response.status}`);
    }

    const parsed = frankfurterResponseSchema.safeParse(await response.json());

    if (!parsed.success) {
      throw new Error("Frankfurter response was invalid.");
    }

    const rate = parsed.data.rates[quoteCurrency];

    if (!rate || rate <= 0) {
      throw new Error("Frankfurter response did not contain the requested quote currency.");
    }

    return {
      rate: new Decimal(rate),
      rateDate: parsed.data.date,
      provider: this.name,
      fetchedAt: new Date(),
      sourceMeta: {
        amount: parsed.data.amount,
        base: parsed.data.base,
        requestedBaseCurrency: baseCurrency,
        requestedQuoteCurrency: quoteCurrency,
        requestedDate: input.date,
        providerBaseUrl: this.baseUrl,
      },
    };
  }
}

function decimalFromObservation(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  try {
    const decimal = new Decimal(value);

    return decimal.isFinite() && decimal.gt(0) ? decimal : null;
  } catch {
    return null;
  }
}

function parseEcbRatesByCurrency(input: {
  data: unknown;
  expectedCurrencies: string[];
}): Map<string, Map<string, Decimal>> {
  const parsed = ecbResponseSchema.safeParse(input.data);

  if (!parsed.success) {
    throw new Error("ECB response was invalid.");
  }

  const seriesDimensions = parsed.data.structure.dimensions.series;
  const currencyDimensionIndex = seriesDimensions.findIndex(
    (dimension) => dimension.id === "CURRENCY",
  );
  const timeDimension = parsed.data.structure.dimensions.observation.find(
    (dimension) => dimension.id === "TIME_PERIOD",
  );

  if (currencyDimensionIndex < 0 || !timeDimension) {
    throw new Error("ECB response did not include currency/time dimensions.");
  }

  const ratesByCurrency = new Map<string, Map<string, Decimal>>();
  const expectedCurrencies = new Set(input.expectedCurrencies);

  for (const dataset of parsed.data.dataSets) {
    for (const [seriesKey, series] of Object.entries(dataset.series ?? {})) {
      const currencyIndex = Number(seriesKey.split(":")[currencyDimensionIndex]);
      const seriesCurrency = currency(
        seriesDimensions[currencyDimensionIndex]?.values[currencyIndex]?.id ?? "",
      );

      if (!expectedCurrencies.has(seriesCurrency)) {
        continue;
      }

      const currencyRates = ratesByCurrency.get(seriesCurrency) ?? new Map<string, Decimal>();

      for (const [observationIndex, observation] of Object.entries(series.observations)) {
        const date = timeDimension.values[Number(observationIndex)]?.id;
        const rate = decimalFromObservation(observation[0]);

        if (date && rate) {
          currencyRates.set(date, rate);
        }
      }

      if (currencyRates.size > 0) {
        ratesByCurrency.set(seriesCurrency, currencyRates);
      }
    }
  }

  return ratesByCurrency;
}

function latestCommonEcbRate(input: {
  baseCurrency: string;
  quoteCurrency: string;
  ratesByCurrency: Map<string, Map<string, Decimal>>;
}) {
  const baseCurrency = currency(input.baseCurrency);
  const quoteCurrency = currency(input.quoteCurrency);
  const candidateDates = new Set<string>();

  for (const ratesByDate of input.ratesByCurrency.values()) {
    for (const date of ratesByDate.keys()) {
      candidateDates.add(date);
    }
  }

  for (const date of Array.from(candidateDates).sort().reverse()) {
    const basePerEur =
      baseCurrency === ECB_REFERENCE_CURRENCY
        ? new Decimal(1)
        : (input.ratesByCurrency.get(baseCurrency)?.get(date) ?? null);
    const quotePerEur =
      quoteCurrency === ECB_REFERENCE_CURRENCY
        ? new Decimal(1)
        : (input.ratesByCurrency.get(quoteCurrency)?.get(date) ?? null);

    if (!basePerEur || !quotePerEur) {
      continue;
    }

    return {
      rate: quotePerEur.div(basePerEur),
      rateDate: date,
      basePerEur,
      quotePerEur,
    };
  }

  return null;
}

export class EcbFxProvider implements FxProvider {
  readonly baseUrl: string;
  readonly name: string;

  constructor(input: { baseUrl?: string; name?: string } = {}) {
    this.baseUrl = normalizeBaseUrl(input.baseUrl ?? DEFAULT_ECB_BASE_URL);
    this.name = input.name ?? "ecb";
  }

  async getRate(input: {
    baseCurrency: string;
    quoteCurrency: string;
    date: string;
  }): Promise<FxRateQuote> {
    const baseCurrency = currency(input.baseCurrency);
    const quoteCurrency = currency(input.quoteCurrency);
    const requestedCurrencies = Array.from(
      new Set([baseCurrency, quoteCurrency].filter((item) => item !== ECB_REFERENCE_CURRENCY)),
    );

    if (requestedCurrencies.length === 0) {
      return {
        rate: new Decimal(1),
        rateDate: input.date,
        provider: this.name,
        fetchedAt: new Date(),
        sourceMeta: {
          requestedBaseCurrency: baseCurrency,
          requestedQuoteCurrency: quoteCurrency,
          requestedDate: input.date,
          providerBaseUrl: this.baseUrl,
          referenceCurrency: ECB_REFERENCE_CURRENCY,
        },
      };
    }

    const url = new URL(`D.${requestedCurrencies.join("+")}.EUR.SP00.A`, this.baseUrl);

    url.searchParams.set("startPeriod", dateOnlyDaysBefore(input.date, 7));
    url.searchParams.set("endPeriod", input.date);
    url.searchParams.set("format", "jsondata");

    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`ECB returned ${response.status}`);
    }

    const ratesByCurrency = parseEcbRatesByCurrency({
      data: await response.json(),
      expectedCurrencies: requestedCurrencies,
    });
    const crossRate = latestCommonEcbRate({
      baseCurrency,
      quoteCurrency,
      ratesByCurrency,
    });

    if (!crossRate) {
      throw new Error("ECB response did not contain a usable quote for the requested currencies.");
    }

    return {
      rate: crossRate.rate,
      rateDate: crossRate.rateDate,
      provider: this.name,
      fetchedAt: new Date(),
      sourceMeta: {
        requestedBaseCurrency: baseCurrency,
        requestedQuoteCurrency: quoteCurrency,
        requestedDate: input.date,
        providerBaseUrl: this.baseUrl,
        referenceCurrency: ECB_REFERENCE_CURRENCY,
        basePerEur: crossRate.basePerEur.toString(),
        quotePerEur: crossRate.quotePerEur.toString(),
      },
    };
  }
}

export class FallbackFxProvider implements FxProvider {
  readonly name: string;

  constructor(readonly providers: FxProvider[]) {
    if (providers.length === 0) {
      throw new ApiError(
        500,
        "FX_PROVIDER_CONFIG_INVALID",
        "At least one FX provider is required.",
      );
    }

    this.name = providers.map((provider) => provider.name).join(",");
  }

  async getRate(input: {
    baseCurrency: string;
    quoteCurrency: string;
    date: string;
  }): Promise<FxRateQuote> {
    const failures: Array<{ provider: string; message: string }> = [];

    for (const provider of this.providers) {
      try {
        return await provider.getRate(input);
      } catch (error) {
        failures.push({
          provider: provider.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error(
      `All configured FX providers failed: ${failures
        .map((failure) => `${failure.provider}: ${failure.message}`)
        .join("; ")}`,
    );
  }
}

export function resolveConfiguredFxProviders(
  env: Record<string, string | undefined> = process.env,
) {
  const providerConfig = (env.ROOMPIRE_FX_PROVIDER ?? "frankfurter").trim().toLowerCase();

  if (!providerConfig || providerConfig === "none" || providerConfig === "cache-only") {
    return null;
  }

  const providerNames = parseList(providerConfig, ["frankfurter"]);

  if (providerNames.some((provider) => provider === "none" || provider === "cache-only")) {
    throw new ApiError(
      500,
      "FX_PROVIDER_CONFIG_INVALID",
      "ROOMPIRE_FX_PROVIDER cannot mix live providers with none/cache-only.",
    );
  }

  const providers: FxProvider[] = [];
  const seenProviders = new Set<string>();

  for (const providerName of providerNames) {
    if (providerName === "frankfurter") {
      let baseUrls: string[];

      try {
        baseUrls = Array.from(
          new Set(
            parseList(env.ROOMPIRE_FX_FRANKFURTER_BASE_URLS, [DEFAULT_FRANKFURTER_BASE_URL]).map(
              (baseUrl) => normalizeBaseUrl(baseUrl),
            ),
          ),
        );
      } catch (error) {
        throw new ApiError(
          500,
          "FX_PROVIDER_CONFIG_INVALID",
          `Invalid ROOMPIRE_FX_FRANKFURTER_BASE_URLS: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      baseUrls.forEach((baseUrl, index) => {
        const name = index === 0 ? "frankfurter" : `frankfurter-${index + 1}`;
        const key = `${name}:${baseUrl}`;

        if (seenProviders.has(key)) {
          return;
        }

        seenProviders.add(key);
        providers.push(new FrankfurterFxProvider({ baseUrl, name }));
      });

      continue;
    }

    if (providerName === "ecb") {
      let baseUrls: string[];

      try {
        baseUrls = Array.from(
          new Set(
            parseList(env.ROOMPIRE_FX_ECB_BASE_URLS, [DEFAULT_ECB_BASE_URL]).map((baseUrl) =>
              normalizeBaseUrl(baseUrl),
            ),
          ),
        );
      } catch (error) {
        throw new ApiError(
          500,
          "FX_PROVIDER_CONFIG_INVALID",
          `Invalid ROOMPIRE_FX_ECB_BASE_URLS: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      baseUrls.forEach((baseUrl, index) => {
        const name = index === 0 ? "ecb" : `ecb-${index + 1}`;
        const key = `${name}:${baseUrl}`;

        if (seenProviders.has(key)) {
          return;
        }

        seenProviders.add(key);
        providers.push(new EcbFxProvider({ baseUrl, name }));
      });

      continue;
    }

    throw new ApiError(
      500,
      "FX_PROVIDER_CONFIG_INVALID",
      `Unsupported ROOMPIRE_FX_PROVIDER: ${providerName}.`,
    );
  }

  return providers;
}

export function resolveConfiguredFxProvider(env: Record<string, string | undefined> = process.env) {
  const providers = resolveConfiguredFxProviders(env);

  if (!providers) {
    return null;
  }

  return providers.length === 1 ? providers[0] : new FallbackFxProvider(providers);
}

async function findCachedFxRate(input: {
  baseCurrency: string;
  quoteCurrency: string;
  date: Date;
}) {
  const baseCurrency = currency(input.baseCurrency);
  const quoteCurrency = currency(input.quoteCurrency);
  const rateDateWindow = {
    gte: maxCacheBackfillDate(input.date),
    lte: input.date,
  };
  const direct = await prisma.fxRate.findFirst({
    where: {
      baseCurrency,
      quoteCurrency,
      rateDate: rateDateWindow,
    },
    orderBy: [{ rateDate: "desc" }, { fetchedAt: "desc" }],
  });

  if (direct) {
    return cachedRateToLock(direct, { baseCurrency, quoteCurrency });
  }

  const inverse = await prisma.fxRate.findFirst({
    where: {
      baseCurrency: quoteCurrency,
      quoteCurrency: baseCurrency,
      rateDate: rateDateWindow,
    },
    orderBy: [{ rateDate: "desc" }, { fetchedAt: "desc" }],
  });

  return inverse ? cachedRateToLock(inverse, { baseCurrency, quoteCurrency }) : null;
}

async function writeFetchedFxRate(input: {
  baseCurrency: string;
  quoteCurrency: string;
  quote: FxRateQuote;
}) {
  const baseCurrency = currency(input.baseCurrency);
  const quoteCurrency = currency(input.quoteCurrency);
  const rateDate = dateOnlyToUtc(input.quote.rateDate);

  await prisma.fxRate.upsert({
    where: {
      provider_baseCurrency_quoteCurrency_rateDate: {
        provider: input.quote.provider,
        baseCurrency,
        quoteCurrency,
        rateDate,
      },
    },
    update: {
      rate: input.quote.rate.toFixed(12),
      fetchedAt: input.quote.fetchedAt,
      sourceMeta: input.quote.sourceMeta ?? Prisma.JsonNull,
    },
    create: {
      provider: input.quote.provider,
      baseCurrency,
      quoteCurrency,
      rateDate,
      rate: input.quote.rate.toFixed(12),
      fetchedAt: input.quote.fetchedAt,
      sourceMeta: input.quote.sourceMeta ?? Prisma.JsonNull,
    },
  });

  return {
    rate: input.quote.rate,
    rateDate,
    provider: input.quote.provider,
    lockedAt: new Date(),
  } satisfies FxRateLock;
}

export async function resolveFxRateLock(input: {
  baseCurrency: string;
  quoteCurrency: string;
  date: Date;
  manualRate?: Decimal.Value | null;
}) {
  const baseCurrency = currency(input.baseCurrency);
  const quoteCurrency = currency(input.quoteCurrency);

  if (baseCurrency === quoteCurrency) {
    return {
      rate: new Decimal(1),
      rateDate: input.date,
      provider: "same-currency",
      lockedAt: new Date(),
    } satisfies FxRateLock;
  }

  if (input.manualRate) {
    return {
      rate: new Decimal(input.manualRate),
      rateDate: input.date,
      provider: "manual-entry",
      lockedAt: new Date(),
    } satisfies FxRateLock;
  }

  const cachedRate = await findCachedFxRate({
    baseCurrency,
    quoteCurrency,
    date: input.date,
  });

  if (cachedRate) {
    return cachedRate;
  }

  const provider = resolveConfiguredFxProvider();

  if (!provider) {
    throw new ApiError(
      400,
      "FX_RATE_REQUIRED",
      "FX rate is required when original currency differs from settlement currency and no cached provider rate is available.",
    );
  }

  try {
    const quote = await provider.getRate({
      baseCurrency,
      quoteCurrency,
      date: dateToDateOnly(input.date),
    });

    return await writeFetchedFxRate({ baseCurrency, quoteCurrency, quote });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      400,
      "FX_RATE_REQUIRED",
      "FX rate could not be resolved automatically; provide a manual fxRate.",
    );
  }
}
