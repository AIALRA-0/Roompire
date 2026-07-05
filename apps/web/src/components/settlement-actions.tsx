"use client";

import { Check, Download, Paperclip, SendHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  SerializedLedgerObligation,
  SerializedSettlementSuggestion,
} from "@/server/ledger/serializers";
import type { SerializedSettlement } from "@/server/settlements/serializers";

type SettlementLabels = {
  settlementActions: string;
  settlementActionsHint: string;
  recordSettlement: string;
  amount: string;
  date: string;
  method: string;
  note: string;
  evidence: string;
  evidenceHint: string;
  evidenceDownload: string;
  submitSettlement: string;
  settlementSubmitted: string;
  pendingSettlements: string;
  pendingSettlementsHint: string;
  confirmSettlement: string;
  rejectSettlement: string;
  settlementConfirmed: string;
  settlementRejected: string;
  noSettlementActions: string;
  noPendingSettlements: string;
  suggestedTransfer: string;
  clearingSettlement: string;
  suggestedTransfersHint: string;
  clearingTransfersHint: string;
  directObligations: string;
  manualMethod: string;
  payer: string;
  payee: string;
  remaining: string;
  working: string;
  errorFallback: string;
};

type SettlementActionsProps = {
  householdId: string;
  currentUserId: string;
  memberNamesByUserId: Record<string, string>;
  obligations: SerializedLedgerObligation[];
  suggestions: SerializedSettlementSuggestion[];
  settlements: SerializedSettlement[];
  labels: SettlementLabels;
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

async function postSettlementMutation<T>(
  url: string,
  body: unknown,
  errorFallback: string,
): Promise<T> {
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

async function uploadSettlementEvidenceFile(
  householdId: string,
  file: File,
  errorFallback: string,
) {
  const intent = await postSettlementMutation<FileUploadIntentResponse>(
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

function evidenceFileFromForm(formData: FormData) {
  const file = formData.get("evidence");

  return file instanceof File && file.size > 0 ? file : null;
}

function memberName(memberNamesByUserId: Record<string, string>, userId: string) {
  return memberNamesByUserId[userId] ?? userId;
}

function transferKey(suggestion: SerializedSettlementSuggestion) {
  return `${suggestion.debtorUserId}-${suggestion.creditorUserId}-${suggestion.currency}`;
}

function decimalInputValue(value: number) {
  const formatted = value.toFixed(6).replace(/\.?0+$/, "");

  return formatted || "0";
}

export function SettlementActions({
  householdId,
  currentUserId,
  memberNamesByUserId,
  obligations,
  suggestions,
  settlements,
  labels,
}: SettlementActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const recordableObligations = obligations.filter(
    (obligation) => obligation.status === "OPEN" && obligation.debtorUserId === currentUserId,
  );
  const recordableSuggestions = suggestions.filter(
    (suggestion) =>
      suggestion.debtorUserId === currentUserId && suggestion.actionability !== "GUIDANCE_ONLY",
  );
  const pendingSettlements = settlements.filter(
    (settlement) => settlement.status === "SUBMITTED" && settlement.payeeUserId === currentUserId,
  );
  const obligationsById = new Map(obligations.map((obligation) => [obligation.id, obligation]));

  async function submitSuggestedSettlement(
    event: FormEvent<HTMLFormElement>,
    suggestion: (typeof recordableSuggestions)[number],
  ) {
    event.preventDefault();
    setMessage(null);
    const key = transferKey(suggestion);
    setBusyActionId(`submit-suggestion-${key}`);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const evidenceFile = evidenceFileFromForm(formData);
      const fileIds = evidenceFile
        ? [await uploadSettlementEvidenceFile(householdId, evidenceFile, labels.errorFallback)]
        : [];

      await postSettlementMutation(
        `/api/v1/households/${householdId}/settlements`,
        {
          payeeUserId: suggestion.creditorUserId,
          amount: String(formData.get("amount") ?? ""),
          currency: suggestion.currency,
          settlementDate: String(formData.get("settlementDate") ?? ""),
          method: String(formData.get("method") ?? ""),
          note: String(formData.get("note") ?? ""),
          fileIds,
        },
        labels.errorFallback,
      );
      form.reset();
      setMessage(labels.settlementSubmitted);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function submitSettlement(event: FormEvent<HTMLFormElement>, obligationId: string) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId(`submit-${obligationId}`);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const evidenceFile = evidenceFileFromForm(formData);
      const fileIds = evidenceFile
        ? [await uploadSettlementEvidenceFile(householdId, evidenceFile, labels.errorFallback)]
        : [];

      await postSettlementMutation(
        `/api/v1/households/${householdId}/settlements`,
        {
          debtObligationId: obligationId,
          amount: String(formData.get("amount") ?? ""),
          settlementDate: String(formData.get("settlementDate") ?? ""),
          method: String(formData.get("method") ?? ""),
          note: String(formData.get("note") ?? ""),
          fileIds,
        },
        labels.errorFallback,
      );
      form.reset();
      setMessage(labels.settlementSubmitted);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function decideSettlement(settlementId: string, decision: "confirm" | "reject") {
    setMessage(null);
    setBusyActionId(`${decision}-${settlementId}`);

    try {
      await postSettlementMutation(
        `/api/v1/households/${householdId}/settlements/${settlementId}/${decision}`,
        {},
        labels.errorFallback,
      );
      setMessage(decision === "confirm" ? labels.settlementConfirmed : labels.settlementRejected);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">{labels.settlementActions}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.settlementActionsHint}</p>
        </div>
        {recordableSuggestions.length > 0 || recordableObligations.length > 0 ? (
          <div className="divide-y divide-border">
            {recordableSuggestions.map((suggestion) => {
              const key = transferKey(suggestion);
              const busyId = `submit-suggestion-${key}`;

              return (
                <form
                  className="grid gap-3 bg-muted/25 p-4"
                  data-testid={`suggested-settlement-form-${key}`}
                  key={key}
                  onSubmit={(event) => submitSuggestedSettlement(event, suggestion)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {memberName(memberNamesByUserId, suggestion.debtorUserId)} {labels.payer} ·{" "}
                        {memberName(memberNamesByUserId, suggestion.creditorUserId)} {labels.payee}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {suggestion.actionability === "CLEARING_SETTLEABLE"
                          ? labels.clearingSettlement
                          : labels.suggestedTransfer}
                        : {suggestion.currency} {suggestion.amount} ·{" "}
                        {suggestion.directOpenObligationCount} {labels.directObligations}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {suggestion.actionability === "CLEARING_SETTLEABLE"
                          ? labels.clearingTransfersHint
                          : labels.suggestedTransfersHint}
                      </p>
                    </div>
                    <Badge variant="success">
                      {suggestion.currency} {suggestion.amount}
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px]">
                    <label className="grid gap-1.5 text-sm font-medium">
                      <span>{labels.amount}</span>
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                        data-testid={`suggested-settlement-amount-${key}`}
                        defaultValue={suggestion.amount}
                        max={
                          suggestion.actionability === "CLEARING_SETTLEABLE"
                            ? suggestion.amount
                            : decimalInputValue(Number(suggestion.directRemainingAmount))
                        }
                        min="0.000001"
                        name="amount"
                        required
                        step="0.000001"
                        type="number"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      <span>{labels.date}</span>
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                        data-testid={`suggested-settlement-date-${key}`}
                        defaultValue={today}
                        name="settlementDate"
                        required
                        type="date"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      <span>{labels.method}</span>
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                        data-testid={`suggested-settlement-method-${key}`}
                        defaultValue={labels.manualMethod}
                        maxLength={60}
                        name="method"
                        required
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                    <label className="grid gap-1.5 text-sm font-medium">
                      <span>{labels.note}</span>
                      <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                        data-testid={`suggested-settlement-note-${key}`}
                        maxLength={500}
                        name="note"
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      <span>{labels.evidence}</span>
                      <input
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium focus-ring"
                        data-testid={`suggested-settlement-evidence-${key}`}
                        name="evidence"
                        type="file"
                      />
                      <span className="text-xs font-normal text-muted-foreground">
                        {labels.evidenceHint}
                      </span>
                    </label>
                    <Button
                      data-testid={`suggested-settlement-submit-${key}`}
                      disabled={isPending || busyActionId === busyId}
                      type="submit"
                    >
                      <SendHorizontal aria-hidden="true" className="h-4 w-4" />
                      {busyActionId === busyId ? labels.working : labels.submitSettlement}
                    </Button>
                  </div>
                </form>
              );
            })}
            {recordableObligations.map((obligation) => (
              <form
                className="grid gap-3 p-4"
                data-testid={`settlement-form-${obligation.id}`}
                key={obligation.id}
                onSubmit={(event) => submitSettlement(event, obligation.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {memberName(memberNamesByUserId, obligation.debtorUserId)} {labels.payer} ·{" "}
                      {memberName(memberNamesByUserId, obligation.creditorUserId)} {labels.payee}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {labels.remaining}: {obligation.settlementCurrency}{" "}
                      {obligation.remainingAmount}
                    </p>
                  </div>
                  <Badge variant="warning">{obligation.status}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px]">
                  <label className="grid gap-1.5 text-sm font-medium">
                    <span>{labels.amount}</span>
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      data-testid={`settlement-amount-${obligation.id}`}
                      defaultValue={obligation.remainingAmount}
                      max={obligation.remainingAmount}
                      min="0.000001"
                      name="amount"
                      required
                      step="0.000001"
                      type="number"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    <span>{labels.date}</span>
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      data-testid={`settlement-date-${obligation.id}`}
                      defaultValue={today}
                      name="settlementDate"
                      required
                      type="date"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    <span>{labels.method}</span>
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      data-testid={`settlement-method-${obligation.id}`}
                      defaultValue={labels.manualMethod}
                      maxLength={60}
                      name="method"
                      required
                    />
                  </label>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                  <label className="grid gap-1.5 text-sm font-medium">
                    <span>{labels.note}</span>
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                      data-testid={`settlement-note-${obligation.id}`}
                      maxLength={500}
                      name="note"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    <span>{labels.evidence}</span>
                    <input
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium focus-ring"
                      data-testid={`settlement-evidence-${obligation.id}`}
                      name="evidence"
                      type="file"
                    />
                    <span className="text-xs font-normal text-muted-foreground">
                      {labels.evidenceHint}
                    </span>
                  </label>
                  <Button
                    data-testid={`settlement-submit-${obligation.id}`}
                    disabled={isPending || busyActionId === `submit-${obligation.id}`}
                    type="submit"
                  >
                    <SendHorizontal aria-hidden="true" className="h-4 w-4" />
                    {busyActionId === `submit-${obligation.id}`
                      ? labels.working
                      : labels.submitSettlement}
                  </Button>
                </div>
              </form>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">{labels.noSettlementActions}</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">{labels.pendingSettlements}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.pendingSettlementsHint}</p>
        </div>
        {pendingSettlements.length > 0 ? (
          <div className="divide-y divide-border">
            {pendingSettlements.map((settlement) => {
              const sourceObligation = settlement.sourceTransaction.sourceId
                ? obligationsById.get(settlement.sourceTransaction.sourceId)
                : null;

              return (
                <div
                  className="grid gap-3 p-4"
                  data-testid={`pending-settlement-${settlement.id}`}
                  key={settlement.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {settlement.currency} {settlement.amount}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {memberName(memberNamesByUserId, settlement.payerUserId)} {labels.payer}
                        {sourceObligation
                          ? ` · ${labels.remaining}: ${sourceObligation.settlementCurrency} ${sourceObligation.remainingAmount}`
                          : settlement.sourceTransaction.sourceType === "SettlementClearing"
                            ? ` · ${labels.clearingSettlement}`
                            : settlement.sourceTransaction.sourceType === "SettlementSuggestion"
                              ? ` · ${labels.suggestedTransfer}`
                              : ""}
                      </p>
                    </div>
                    <Badge variant="warning">{settlement.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {settlement.files.map((file) => (
                      <Button asChild key={file.id} size="sm" variant="outline">
                        <a
                          data-testid={`settlement-file-download-${file.id}`}
                          href={file.downloadUrl}
                        >
                          <Download aria-hidden="true" className="h-4 w-4" />
                          {labels.evidenceDownload}
                        </a>
                      </Button>
                    ))}
                    <Button
                      data-testid={`settlement-confirm-${settlement.id}`}
                      disabled={isPending || busyActionId === `confirm-${settlement.id}`}
                      onClick={() => decideSettlement(settlement.id, "confirm")}
                      size="sm"
                      type="button"
                    >
                      <Check aria-hidden="true" className="h-4 w-4" />
                      {busyActionId === `confirm-${settlement.id}`
                        ? labels.working
                        : labels.confirmSettlement}
                    </Button>
                    <Button
                      data-testid={`settlement-reject-${settlement.id}`}
                      disabled={isPending || busyActionId === `reject-${settlement.id}`}
                      onClick={() => decideSettlement(settlement.id, "reject")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                      {labels.rejectSettlement}
                    </Button>
                  </div>
                  {settlement.files.length > 0 ? (
                    <div className="grid gap-1 text-xs text-muted-foreground">
                      {settlement.files.map((file) => (
                        <p
                          className="flex max-w-full min-w-0 items-center gap-2 overflow-hidden"
                          key={file.id}
                        >
                          <Paperclip aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{file.originalFilename}</span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">{labels.noPendingSettlements}</p>
        )}
      </div>
      {message ? (
        <p className="text-sm text-muted-foreground xl:col-span-2" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
