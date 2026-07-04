"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { splitByWeights, splitEqual } from "@/lib/money/split";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
type SplitMethod = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
type ProposalStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "PARTIALLY_MATURED"
  | "MATURED_TO_LEDGER"
  | "REJECTED"
  | "DISPUTED"
  | "CANCELLED";

type ExpenseCategorySummary = {
  id: string;
  name: string;
};

type ExpenseMemberSummary = {
  userId: string;
  displayName: string;
  email: string;
  role: Role;
};

type ExpenseProposalSummary = {
  id: string;
  title: string;
  merchant: string | null;
  categoryName: string | null;
  expenseDate: string | null;
  originalAmount: string;
  originalCurrency: string;
  settlementAmount: string;
  settlementCurrency: string;
  fxRate: string | null;
  status: ProposalStatus;
  debtorCount: number;
};

type ExpenseLabels = {
  title: string;
  hint: string;
  formTitle: string;
  formHint: string;
  proposalTitle: string;
  merchant: string;
  category: string;
  uncategorized: string;
  expenseDate: string;
  dueDate: string;
  originalAmount: string;
  originalCurrency: string;
  settlementCurrency: string;
  fxRate: string;
  debtors: string;
  payerShareIncluded: string;
  splitMethod: string;
  splitMethodEqual: string;
  splitMethodExact: string;
  splitMethodPercentage: string;
  splitMethodShares: string;
  splitValueExact: string;
  splitValuePercentage: string;
  splitValueShares: string;
  splitPreview: string;
  splitPreviewEmpty: string;
  splitPreviewInvalid: string;
  receipt: string;
  receiptHint: string;
  selectedReceipt: string;
  submitProposal: string;
  proposalSubmitted: string;
  noProposals: string;
  queueTitle: string;
  queueHint: string;
  openDetail: string;
  cannotCreate: string;
  noHousehold: string;
  errorFallback: string;
  working: string;
  statuses: Record<ProposalStatus, string>;
};

type ExpenseWorkspaceProps = {
  locale: string;
  currentUserEmail: string;
  activeHouseholdId: string | null;
  settlementCurrency: string | null;
  canCreateExpenseProposals: boolean;
  categories: ExpenseCategorySummary[];
  members: ExpenseMemberSummary[];
  proposals: ExpenseProposalSummary[];
  labels: ExpenseLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type FileUploadIntentResponse = {
  file: {
    id: string;
  };
  upload: {
    uploadUrl: string;
    headers: Record<string, string>;
  };
};

async function postProposal<T>(url: string, body: unknown, errorFallback: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
    throw new Error(errorPayload?.error?.message ?? errorFallback);
  }

  return payload as T;
}

async function uploadReceiptFile(
  householdId: string,
  file: File,
  errorFallback: string,
): Promise<string> {
  const intent = await postProposal<FileUploadIntentResponse>(
    `/api/v1/households/${householdId}/files/presign-upload`,
    {
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    },
    errorFallback,
  );
  const uploadResponse = await fetch(intent.upload.uploadUrl, {
    method: "PUT",
    credentials: "same-origin",
    headers: intent.upload.headers,
    body: file,
  });
  const isJson = uploadResponse.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await uploadResponse.json() : null;

  if (!uploadResponse.ok) {
    const errorPayload =
      payload && typeof payload === "object" ? (payload as ApiErrorPayload) : null;
    throw new Error(errorPayload?.error?.message ?? errorFallback);
  }

  return intent.file.id;
}

function Field({
  label,
  children,
}: Readonly<{
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function statusVariant(status: ProposalStatus) {
  if (status === "APPROVED" || status === "MATURED_TO_LEDGER") {
    return "success" as const;
  }

  if (status === "REJECTED" || status === "CANCELLED" || status === "DISPUTED") {
    return "danger" as const;
  }

  return "warning" as const;
}

function decimalOrNull(value: string) {
  try {
    const decimal = new Decimal(value);

    return decimal.isFinite() && decimal.isPositive() ? decimal : null;
  } catch {
    return null;
  }
}

function formatPreviewAmount(value: Decimal.Value) {
  const fixed = new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);

  return fixed.replace(/\.?0+$/, "") || "0";
}

export function ExpenseWorkspace({
  locale,
  currentUserEmail,
  activeHouseholdId,
  settlementCurrency,
  canCreateExpenseProposals,
  categories,
  members,
  proposals,
  labels,
}: ExpenseWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("EQUAL");
  const [selectedDebtorIds, setSelectedDebtorIds] = useState<string[]>([]);
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [originalAmountInput, setOriginalAmountInput] = useState("");
  const [originalCurrencyInput, setOriginalCurrencyInput] = useState("USD");
  const [fxRateInput, setFxRateInput] = useState(settlementCurrency === "USD" ? "1" : "");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const debtorOptions = useMemo(
    () => members.filter((member) => member.role !== "VIEWER" && member.email !== currentUserEmail),
    [currentUserEmail, members],
  );
  const isDisabled = !activeHouseholdId || !canCreateExpenseProposals || debtorOptions.length === 0;
  const splitPreview = useMemo(() => {
    const selectedDebtors = debtorOptions.filter((member) =>
      selectedDebtorIds.includes(member.userId),
    );

    if (selectedDebtors.length === 0) {
      return {
        rows: [],
        error: null,
      };
    }

    const originalAmount = decimalOrNull(originalAmountInput);
    const originalCurrency = originalCurrencyInput.trim().toUpperCase();
    const fxRate =
      settlementCurrency && originalCurrency === settlementCurrency
        ? new Decimal(1)
        : decimalOrNull(fxRateInput);

    if (!originalAmount || !settlementCurrency || !fxRate) {
      return {
        rows: [],
        error: labels.splitPreviewInvalid,
      };
    }

    try {
      if (splitMethod === "EQUAL") {
        const originalSplit = splitEqual({
          amount: formatPreviewAmount(originalAmount),
          participants: selectedDebtors.length + 1,
          scale: 6,
        });
        const settlementSplit = splitEqual({
          amount: formatPreviewAmount(originalAmount.mul(fxRate)),
          participants: selectedDebtors.length + 1,
          scale: 6,
        });

        return {
          rows: selectedDebtors.map((member, index) => ({
            member,
            originalAmount: originalSplit.shares[index]!,
            settlementAmount: settlementSplit.shares[index]!,
          })),
          error: null,
        };
      }

      if (splitMethod === "EXACT") {
        const exactShares = selectedDebtors.map((member) =>
          decimalOrNull(splitValues[member.userId] ?? ""),
        );
        const parsedExactShares = exactShares.filter((share): share is Decimal => share !== null);

        if (parsedExactShares.length !== selectedDebtors.length) {
          return {
            rows: [],
            error: labels.splitPreviewInvalid,
          };
        }

        const exactTotal = parsedExactShares.reduce(
          (sum, share) => sum.plus(share),
          new Decimal(0),
        );

        if (exactTotal.gt(originalAmount)) {
          return {
            rows: [],
            error: labels.splitPreviewInvalid,
          };
        }

        return {
          rows: selectedDebtors.map((member, index) => ({
            member,
            originalAmount: formatPreviewAmount(parsedExactShares[index]!),
            settlementAmount: formatPreviewAmount(parsedExactShares[index]!.mul(fxRate)),
          })),
          error: null,
        };
      }

      const weights = selectedDebtors.map((member) =>
        decimalOrNull(splitValues[member.userId] ?? ""),
      );
      const parsedWeights = weights.filter((weight): weight is Decimal => weight !== null);

      if (parsedWeights.length !== selectedDebtors.length) {
        return {
          rows: [],
          error: labels.splitPreviewInvalid,
        };
      }

      const debtorWeightTotal = parsedWeights.reduce(
        (sum, weight) => sum.plus(weight),
        new Decimal(0),
      );
      const allWeights =
        splitMethod === "PERCENTAGE"
          ? (() => {
              if (debtorWeightTotal.gt(100)) {
                return null;
              }

              return [
                ...parsedWeights.map((weight) => formatPreviewAmount(weight)),
                new Decimal(100).minus(debtorWeightTotal).toFixed(6),
              ];
            })()
          : [...parsedWeights.map((weight) => formatPreviewAmount(weight)), "1.000000"];

      if (!allWeights) {
        return {
          rows: [],
          error: labels.splitPreviewInvalid,
        };
      }

      const originalSplit = splitByWeights({
        amount: formatPreviewAmount(originalAmount),
        weights: allWeights,
        scale: 6,
      });
      const settlementSplit = splitByWeights({
        amount: formatPreviewAmount(originalAmount.mul(fxRate)),
        weights: allWeights,
        scale: 6,
      });

      return {
        rows: selectedDebtors.map((member, index) => ({
          member,
          originalAmount: originalSplit.shares[index]!,
          settlementAmount: settlementSplit.shares[index]!,
        })),
        error: null,
      };
    } catch {
      return {
        rows: [],
        error: labels.splitPreviewInvalid,
      };
    }
  }, [
    debtorOptions,
    fxRateInput,
    labels.splitPreviewInvalid,
    originalAmountInput,
    originalCurrencyInput,
    selectedDebtorIds,
    settlementCurrency,
    splitMethod,
    splitValues,
  ]);

  function toggleDebtor(userId: string, checked: boolean) {
    setSelectedDebtorIds((current) =>
      checked
        ? [...current, userId]
        : current.filter((selectedUserId) => selectedUserId !== userId),
    );

    if (!checked) {
      setSplitValues((current) => {
        const next = { ...current };

        delete next[userId];

        return next;
      });
    }
  }

  function splitValueLabel() {
    if (splitMethod === "EXACT") {
      return labels.splitValueExact;
    }

    if (splitMethod === "PERCENTAGE") {
      return labels.splitValuePercentage;
    }

    return labels.splitValueShares;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!activeHouseholdId) {
      setMessage(labels.noHousehold);
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const participantUserIds = selectedDebtorIds;
    const participantShares = selectedDebtorIds.map((userId) => ({
      userId,
      exactAmountOriginal: splitMethod === "EXACT" ? (splitValues[userId] ?? "") : undefined,
      percentage: splitMethod === "PERCENTAGE" ? (splitValues[userId] ?? "") : undefined,
      shareUnits: splitMethod === "SHARES" ? (splitValues[userId] ?? "") : undefined,
    }));

    try {
      const fileIds = receiptFile
        ? [await uploadReceiptFile(activeHouseholdId, receiptFile, labels.errorFallback)]
        : undefined;

      await postProposal(
        `/api/v1/households/${activeHouseholdId}/expenses/proposals`,
        {
          title: String(formData.get("title") ?? ""),
          merchant: String(formData.get("merchant") ?? ""),
          categoryId: String(formData.get("categoryId") ?? ""),
          expenseDate: String(formData.get("expenseDate") ?? ""),
          dueDate: String(formData.get("dueDate") ?? ""),
          originalAmount: originalAmountInput,
          originalCurrency: originalCurrencyInput.toUpperCase(),
          fxRate: fxRateInput,
          participantUserIds,
          participantShares: splitMethod === "EQUAL" ? undefined : participantShares,
          fileIds,
          splitMethod,
        },
        labels.errorFallback,
      );
      form.reset();
      setSplitMethod("EQUAL");
      setSelectedDebtorIds([]);
      setSplitValues({});
      setOriginalAmountInput("");
      setOriginalCurrencyInput("USD");
      setFxRateInput(settlementCurrency === "USD" ? "1" : "");
      setReceiptFile(null);
      setMessage(labels.proposalSubmitted);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <form className="rounded-lg border border-border bg-card p-5" onSubmit={onSubmit}>
        <h2 className="text-lg font-semibold">{labels.formTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.formHint}</p>
        {!canCreateExpenseProposals ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {labels.cannotCreate}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3">
          <Field label={labels.proposalTitle}>
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
              data-testid="expense-title"
              disabled={isDisabled}
              name="title"
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={labels.merchant}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="expense-merchant"
                disabled={isDisabled}
                name="merchant"
              />
            </Field>
            <Field label={labels.category}>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="expense-category"
                disabled={isDisabled}
                name="categoryId"
              >
                <option value="">{labels.uncategorized}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={labels.expenseDate}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="expense-date"
                disabled={isDisabled}
                name="expenseDate"
                required
                type="date"
              />
            </Field>
            <Field label={labels.dueDate}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="expense-due-date"
                disabled={isDisabled}
                name="dueDate"
                type="date"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={labels.originalAmount}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="expense-amount"
                disabled={isDisabled}
                min="0.01"
                name="originalAmount"
                onChange={(event) => setOriginalAmountInput(event.target.value)}
                required
                step="0.01"
                type="number"
                value={originalAmountInput}
              />
            </Field>
            <Field label={labels.originalCurrency}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
                data-testid="expense-original-currency"
                disabled={isDisabled}
                maxLength={3}
                minLength={3}
                name="originalCurrency"
                onChange={(event) => setOriginalCurrencyInput(event.target.value)}
                required
                value={originalCurrencyInput}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={labels.settlementCurrency}>
              <input
                className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
                data-testid="expense-settlement-currency"
                disabled
                value={settlementCurrency ?? ""}
              />
            </Field>
            <Field label={labels.fxRate}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="expense-fx-rate"
                disabled={isDisabled}
                min="0.000001"
                name="fxRate"
                onChange={(event) => setFxRateInput(event.target.value)}
                step="0.000001"
                type="number"
                value={fxRateInput}
              />
            </Field>
          </div>

          <Field label={labels.splitMethod}>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
              data-testid="expense-split-method"
              disabled={isDisabled}
              name="splitMethod"
              onChange={(event) => {
                setSplitMethod(event.target.value as SplitMethod);
                setSplitValues({});
              }}
              value={splitMethod}
            >
              <option value="EQUAL">{labels.splitMethodEqual}</option>
              <option value="EXACT">{labels.splitMethodExact}</option>
              <option value="PERCENTAGE">{labels.splitMethodPercentage}</option>
              <option value="SHARES">{labels.splitMethodShares}</option>
            </select>
          </Field>

          <fieldset className="rounded-lg border border-border bg-background p-3">
            <legend className="px-1 text-sm font-medium">{labels.debtors}</legend>
            <p className="mt-1 text-xs text-muted-foreground">{labels.payerShareIncluded}</p>
            <div className="mt-3 grid gap-2">
              {debtorOptions.map((member) => (
                <div
                  className="grid gap-2 rounded-md border border-border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center"
                  key={member.userId}
                >
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={selectedDebtorIds.includes(member.userId)}
                      className="h-4 w-4 rounded border-input"
                      data-testid={`expense-debtor-${member.email}`}
                      disabled={isDisabled}
                      name="participantUserIds"
                      onChange={(event) => toggleDebtor(member.userId, event.target.checked)}
                      type="checkbox"
                      value={member.userId}
                    />
                    <span className="min-w-0 truncate">
                      {member.displayName} · {member.email}
                    </span>
                  </label>
                  {splitMethod !== "EQUAL" ? (
                    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                      <span>{splitValueLabel()}</span>
                      <input
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
                        data-testid={`expense-split-value-${member.email}`}
                        disabled={isDisabled || !selectedDebtorIds.includes(member.userId)}
                        min="0.000001"
                        onChange={(event) =>
                          setSplitValues((current) => ({
                            ...current,
                            [member.userId]: event.target.value,
                          }))
                        }
                        step="0.000001"
                        type="number"
                        value={splitValues[member.userId] ?? ""}
                      />
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
            <div
              className="mt-3 rounded-md border border-border bg-card px-3 py-2"
              data-testid="expense-split-preview"
            >
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                {labels.splitPreview}
              </p>
              {splitPreview.error ? (
                <p className="mt-2 text-xs text-muted-foreground">{splitPreview.error}</p>
              ) : splitPreview.rows.length > 0 ? (
                <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
                  {splitPreview.rows.map((row) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2"
                      data-testid={`expense-split-preview-${row.member.email}`}
                      key={row.member.userId}
                    >
                      <span className="font-medium text-foreground">{row.member.displayName}</span>
                      <span>
                        {originalCurrencyInput.toUpperCase()}{" "}
                        {formatPreviewAmount(row.originalAmount)} · {settlementCurrency}{" "}
                        {formatPreviewAmount(row.settlementAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{labels.splitPreviewEmpty}</p>
              )}
            </div>
          </fieldset>

          <Field label={labels.receipt}>
            <input
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
              data-testid="expense-receipt-file"
              disabled={isDisabled}
              name="receipt"
              onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <span className="text-xs text-muted-foreground">
              {receiptFile ? `${labels.selectedReceipt}: ${receiptFile.name}` : labels.receiptHint}
            </span>
          </Field>

          <Button disabled={isPending || isDisabled} type="submit">
            {isPending ? labels.working : labels.submitProposal}
          </Button>
          {message ? (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </form>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">{labels.queueTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.queueHint}</p>
        </div>
        <div className="divide-y divide-border">
          {proposals.map((proposal) => (
            <div className="grid gap-3 p-4" key={proposal.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{proposal.title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {proposal.merchant ?? proposal.categoryName ?? labels.uncategorized}
                  </p>
                </div>
                <Badge variant={statusVariant(proposal.status)}>
                  {labels.statuses[proposal.status]}
                </Badge>
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <span>
                  {proposal.originalCurrency} {proposal.originalAmount} ·{" "}
                  {proposal.settlementCurrency} {proposal.settlementAmount}
                </span>
                <span>
                  {proposal.expenseDate} · {proposal.debtorCount} {labels.debtors}
                </span>
              </div>
              {activeHouseholdId ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    aria-label={`${labels.openDetail}: ${proposal.title}`}
                    href={`/${locale}/app/households/${activeHouseholdId}/expenses/proposals/${proposal.id}`}
                  >
                    {labels.openDetail}
                  </Link>
                </Button>
              ) : null}
            </div>
          ))}
          {proposals.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">{labels.noProposals}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
