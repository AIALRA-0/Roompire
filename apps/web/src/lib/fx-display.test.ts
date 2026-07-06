import { describe, expect, it } from "vitest";
import { classifyFxSource, fxPolicyLabel, fxSourceLabel } from "./fx-display";

const sourceLabels = {
  fxSourceManual: "Manual entry",
  fxSourceProvider: "Provider/cache rate",
  fxSourceSameCurrency: "Same currency",
  fxSourceOriginalCurrencyDebt: "Original-currency debt",
  fxSourceUnknown: "Unknown source",
};

const policyLabels = {
  fxPolicyLockAtExpenseDate: "Lock at expense date",
  fxPolicyOriginalCurrencyDebt: "Original-currency debt",
  fxPolicyManualApproval: "Manual rate with approval",
  fxPolicyDifferenceAdjustment: "FX difference adjustment",
};

describe("FX display helpers", () => {
  it("classifies manual, provider, same-currency, and original-currency sources", () => {
    expect(
      classifyFxSource({
        originalCurrency: "USD",
        settlementCurrency: "CNY",
        fxProvider: "manual-entry",
      }),
    ).toBe("manual");
    expect(
      classifyFxSource({
        originalCurrency: "USD",
        settlementCurrency: "CNY",
        fxProvider: "seed-static",
      }),
    ).toBe("provider");
    expect(
      classifyFxSource({
        originalCurrency: "CNY",
        settlementCurrency: "CNY",
        fxProvider: "same-currency",
      }),
    ).toBe("sameCurrency");
    expect(
      classifyFxSource({
        originalCurrency: "USD",
        settlementCurrency: "USD",
        fxPolicy: "ORIGINAL_CURRENCY_DEBT",
        fxProvider: "original-currency-debt",
      }),
    ).toBe("originalCurrencyDebt");
  });

  it("formats localized source and policy labels", () => {
    expect(
      fxSourceLabel(
        {
          originalCurrency: "USD",
          settlementCurrency: "CNY",
          fxProvider: "frankfurter-2",
        },
        sourceLabels,
      ),
    ).toBe("Provider/cache rate");
    expect(fxPolicyLabel("MANUAL_RATE_WITH_APPROVAL", policyLabels)).toBe(
      "Manual rate with approval",
    );
  });
});
