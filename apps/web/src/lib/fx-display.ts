export type FxPolicyCode =
  | "LOCK_AT_EXPENSE_DATE"
  | "ORIGINAL_CURRENCY_DEBT"
  | "MANUAL_RATE_WITH_APPROVAL"
  | "FX_DIFFERENCE_ADJUSTMENT";

export type FxSourceKind =
  "manual" | "provider" | "sameCurrency" | "originalCurrencyDebt" | "unknown";

export type FxSourceInput = {
  originalCurrency: string;
  settlementCurrency: string;
  fxProvider: string | null;
  fxPolicy?: FxPolicyCode | string | null;
};

export type FxSourceLabels = {
  fxSourceManual: string;
  fxSourceProvider: string;
  fxSourceSameCurrency: string;
  fxSourceOriginalCurrencyDebt: string;
  fxSourceUnknown: string;
};

export type FxPolicyLabels = {
  fxPolicyLockAtExpenseDate: string;
  fxPolicyOriginalCurrencyDebt: string;
  fxPolicyManualApproval: string;
  fxPolicyDifferenceAdjustment: string;
};

export function classifyFxSource(input: FxSourceInput): FxSourceKind {
  const provider = input.fxProvider?.trim().toLowerCase() ?? "";

  if (!provider) {
    return "unknown";
  }

  if (provider === "manual-entry") {
    return "manual";
  }

  if (provider === "original-currency-debt" || input.fxPolicy === "ORIGINAL_CURRENCY_DEBT") {
    return "originalCurrencyDebt";
  }

  if (
    provider === "same-currency" ||
    input.originalCurrency.trim().toUpperCase() === input.settlementCurrency.trim().toUpperCase()
  ) {
    return "sameCurrency";
  }

  return "provider";
}

export function fxSourceLabel(input: FxSourceInput, labels: FxSourceLabels) {
  const source = classifyFxSource(input);

  if (source === "manual") {
    return labels.fxSourceManual;
  }

  if (source === "provider") {
    return labels.fxSourceProvider;
  }

  if (source === "sameCurrency") {
    return labels.fxSourceSameCurrency;
  }

  if (source === "originalCurrencyDebt") {
    return labels.fxSourceOriginalCurrencyDebt;
  }

  return labels.fxSourceUnknown;
}

export function fxPolicyLabel(
  policy: FxPolicyCode | string | null | undefined,
  labels: FxPolicyLabels,
) {
  if (policy === "ORIGINAL_CURRENCY_DEBT") {
    return labels.fxPolicyOriginalCurrencyDebt;
  }

  if (policy === "MANUAL_RATE_WITH_APPROVAL") {
    return labels.fxPolicyManualApproval;
  }

  if (policy === "FX_DIFFERENCE_ADJUSTMENT") {
    return labels.fxPolicyDifferenceAdjustment;
  }

  return labels.fxPolicyLockAtExpenseDate;
}
