"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type EditableSplitMethod = "EQUAL" | "EXACT" | "PERCENTAGE" | "SHARES";
type SplitMethod = EditableSplitMethod | "ADJUSTMENT";

type RevisionMember = {
  userId: string;
  displayName: string;
};

type RevisionProposal = {
  id: string;
  title: string;
  description: string | null;
  merchant: string | null;
  category: { id: string } | null;
  expenseDate: string | null;
  dueDate: string | null;
  originalAmount: string;
  originalCurrency: string;
  fxRate: string | null;
  splitMethod: SplitMethod;
  createdByUserId: string;
  shares: Array<{
    debtorUserId: string;
    shareOriginalAmount: string;
    percentage: string | null;
    shareUnits: string | null;
  }>;
  files: Array<{
    id: string;
  }>;
};

type RevisionLabels = {
  reviseTitle: string;
  reviseHint: string;
  revisionReason: string;
  proposalTitle: string;
  merchant: string;
  expenseDate: string;
  dueDate: string;
  originalAmount: string;
  originalCurrency: string;
  fxRate: string;
  splitMethod: string;
  splitMethodEqual: string;
  splitMethodExact: string;
  splitMethodPercentage: string;
  splitMethodShares: string;
  splitValueExact: string;
  splitValuePercentage: string;
  splitValueShares: string;
  debtors: string;
  submitRevision: string;
  revisionSubmitted: string;
  errorFallback: string;
  working: string;
};

type RevisionResponse = {
  proposal: {
    id: string;
  };
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

async function postRevision<T>(url: string, body: unknown, errorFallback: string): Promise<T> {
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

function splitValueForShare(proposal: RevisionProposal, share: RevisionProposal["shares"][number]) {
  if (proposal.splitMethod === "EXACT") {
    return share.shareOriginalAmount;
  }

  if (proposal.splitMethod === "PERCENTAGE") {
    return share.percentage ?? "";
  }

  if (proposal.splitMethod === "SHARES") {
    return share.shareUnits ?? "";
  }

  return "";
}

function splitValueLabel(splitMethod: EditableSplitMethod, labels: RevisionLabels) {
  if (splitMethod === "EXACT") {
    return labels.splitValueExact;
  }

  if (splitMethod === "PERCENTAGE") {
    return labels.splitValuePercentage;
  }

  return labels.splitValueShares;
}

export function ExpenseProposalRevisionForm({
  householdId,
  locale,
  labels,
  members,
  proposal,
}: Readonly<{
  householdId: string;
  locale: string;
  labels: RevisionLabels;
  members: RevisionMember[];
  proposal: RevisionProposal;
}>) {
  const router = useRouter();
  const initialSplitMethod = proposal.splitMethod === "ADJUSTMENT" ? "EQUAL" : proposal.splitMethod;
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [splitMethod, setSplitMethod] = useState<EditableSplitMethod>(initialSplitMethod);
  const [selectedDebtorIds, setSelectedDebtorIds] = useState(
    proposal.shares.map((share) => share.debtorUserId),
  );
  const [splitValues, setSplitValues] = useState<Record<string, string>>(
    Object.fromEntries(
      proposal.shares.map((share) => [share.debtorUserId, splitValueForShare(proposal, share)]),
    ),
  );
  const debtorMembers = members.filter((member) => member.userId !== proposal.createdByUserId);

  function toggleDebtor(userId: string, checked: boolean) {
    setSelectedDebtorIds((current) =>
      checked
        ? [...current, userId]
        : current.filter((selectedUserId) => selectedUserId !== userId),
    );
  }

  async function submitRevision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const participantShares = selectedDebtorIds.map((userId) => ({
      userId,
      exactAmountOriginal: splitMethod === "EXACT" ? (splitValues[userId] ?? "") : undefined,
      percentage: splitMethod === "PERCENTAGE" ? (splitValues[userId] ?? "") : undefined,
      shareUnits: splitMethod === "SHARES" ? (splitValues[userId] ?? "") : undefined,
    }));

    try {
      const payload = await postRevision<RevisionResponse>(
        `/api/v1/households/${householdId}/expenses/proposals/${proposal.id}/revisions`,
        {
          title: String(formData.get("title") ?? ""),
          description: proposal.description ?? undefined,
          merchant: String(formData.get("merchant") ?? ""),
          categoryId: proposal.category?.id ?? "",
          expenseDate: String(formData.get("expenseDate") ?? ""),
          dueDate: String(formData.get("dueDate") ?? ""),
          originalAmount: String(formData.get("originalAmount") ?? ""),
          originalCurrency: String(formData.get("originalCurrency") ?? "").toUpperCase(),
          fxRate: String(formData.get("fxRate") ?? ""),
          participantUserIds: selectedDebtorIds,
          participantShares: splitMethod === "EQUAL" ? undefined : participantShares,
          fileIds: proposal.files.map((file) => file.id),
          splitMethod,
          revisionReason: String(formData.get("revisionReason") ?? ""),
        },
        labels.errorFallback,
      );

      setMessage(labels.revisionSubmitted);
      startTransition(() => {
        router.push(
          `/${locale}/app/households/${householdId}/expenses/proposals/${payload.proposal.id}`,
        );
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  return (
    <form className="grid gap-3" data-testid="proposal-revision-form" onSubmit={submitRevision}>
      <div>
        <h2 className="text-sm font-semibold">{labels.reviseTitle}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.reviseHint}</p>
      </div>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        <span>{labels.revisionReason}</span>
        <textarea
          className="min-h-20 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-ring"
          data-testid="proposal-revision-reason"
          name="revisionReason"
          required
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        <span>{labels.proposalTitle}</span>
        <input
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
          data-testid="proposal-revision-title"
          defaultValue={proposal.title}
          name="title"
          required
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        <span>{labels.merchant}</span>
        <input
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
          data-testid="proposal-revision-merchant"
          defaultValue={proposal.merchant ?? ""}
          name="merchant"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          <span>{labels.expenseDate}</span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
            data-testid="proposal-revision-expense-date"
            defaultValue={proposal.expenseDate ?? ""}
            name="expenseDate"
            required
            type="date"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          <span>{labels.dueDate}</span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
            data-testid="proposal-revision-due-date"
            defaultValue={proposal.dueDate ?? ""}
            name="dueDate"
            type="date"
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          <span>{labels.originalAmount}</span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
            data-testid="proposal-revision-amount"
            defaultValue={proposal.originalAmount}
            min="0.01"
            name="originalAmount"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          <span>{labels.originalCurrency}</span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm uppercase text-foreground focus-ring"
            data-testid="proposal-revision-original-currency"
            defaultValue={proposal.originalCurrency}
            maxLength={3}
            minLength={3}
            name="originalCurrency"
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          <span>{labels.fxRate}</span>
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
            data-testid="proposal-revision-fx-rate"
            defaultValue={proposal.fxRate ?? ""}
            min="0.000001"
            name="fxRate"
            step="0.000001"
            type="number"
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        <span>{labels.splitMethod}</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
          data-testid="proposal-revision-split-method"
          onChange={(event) => setSplitMethod(event.target.value as EditableSplitMethod)}
          value={splitMethod}
        >
          <option value="EQUAL">{labels.splitMethodEqual}</option>
          <option value="EXACT">{labels.splitMethodExact}</option>
          <option value="PERCENTAGE">{labels.splitMethodPercentage}</option>
          <option value="SHARES">{labels.splitMethodShares}</option>
        </select>
      </label>
      <fieldset className="rounded-md border border-border px-3 py-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">{labels.debtors}</legend>
        <div className="grid gap-2">
          {debtorMembers.map((member) => (
            <div
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center"
              key={member.userId}
            >
              <label className="flex min-w-0 items-center gap-2 text-sm">
                <input
                  checked={selectedDebtorIds.includes(member.userId)}
                  className="h-4 w-4 rounded border-input"
                  data-testid={`proposal-revision-debtor-${member.userId}`}
                  onChange={(event) => toggleDebtor(member.userId, event.target.checked)}
                  type="checkbox"
                />
                <span className="truncate">{member.displayName}</span>
              </label>
              {splitMethod !== "EQUAL" ? (
                <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                  <span>{splitValueLabel(splitMethod, labels)}</span>
                  <input
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring"
                    data-testid={`proposal-revision-split-value-${member.userId}`}
                    disabled={!selectedDebtorIds.includes(member.userId)}
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
      </fieldset>
      <Button data-testid="proposal-revision-submit" disabled={isPending} size="sm" type="submit">
        {isPending ? labels.working : labels.submitRevision}
      </Button>
      {message ? (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
