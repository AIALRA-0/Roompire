"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type ExpenseShareActionLabels = {
  approveShare: string;
  rejectShare: string;
  requestChanges: string;
  rejectionReason: string;
  shareApprovalRecorded: string;
  shareApproved: string;
  shareRejected: string;
  changesRequested: string;
  errorFallback: string;
  working: string;
};

type ExpenseShareActionsProps = {
  allowFeedback?: boolean;
  householdId: string;
  shareId: string;
  labels: ExpenseShareActionLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type ShareDecisionPayload = {
  proposal?: {
    shares?: Array<{
      id?: string;
      status?: string;
    }>;
  };
};

async function postShareDecision(
  url: string,
  body: unknown,
  errorFallback: string,
): Promise<ShareDecisionPayload> {
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

  return payload && typeof payload === "object" ? (payload as ShareDecisionPayload) : {};
}

export function ExpenseShareActions({
  allowFeedback = true,
  householdId,
  shareId,
  labels,
}: ExpenseShareActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function approveShare() {
    setMessage(null);

    try {
      const payload = await postShareDecision(
        `/api/v1/households/${householdId}/expenses/shares/${shareId}/approve`,
        {},
        labels.errorFallback,
      );
      const updatedShare = payload.proposal?.shares?.find((share) => share.id === shareId);
      setMessage(
        updatedShare?.status === "MATURED_TO_LEDGER"
          ? labels.shareApproved
          : labels.shareApprovalRecorded,
      );
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function submitShareFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const isChangeRequest = submitter?.value === "request-changes";
    const url = `/api/v1/households/${householdId}/expenses/shares/${shareId}/${
      isChangeRequest ? "request-changes" : "reject"
    }`;

    try {
      await postShareDecision(url, { reason }, labels.errorFallback);
      setMessage(isChangeRequest ? labels.changesRequested : labels.shareRejected);
      setReason("");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  return (
    <div className="grid gap-2" data-testid={`share-actions-${shareId}`}>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid={`share-approve-${shareId}`}
          disabled={isPending}
          onClick={approveShare}
          size="sm"
          type="button"
        >
          {isPending ? labels.working : labels.approveShare}
        </Button>
      </div>
      {allowFeedback ? (
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
          onSubmit={submitShareFeedback}
        >
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-ring"
            data-testid={`share-reject-reason-${shareId}`}
            onChange={(event) => setReason(event.target.value)}
            placeholder={labels.rejectionReason}
            required
            value={reason}
          />
          <Button
            data-testid={`share-reject-${shareId}`}
            disabled={isPending || reason.trim().length === 0}
            size="sm"
            type="submit"
            variant="outline"
            value="reject"
          >
            {labels.rejectShare}
          </Button>
          <Button
            data-testid={`share-request-changes-${shareId}`}
            disabled={isPending || reason.trim().length === 0}
            size="sm"
            type="submit"
            variant="outline"
            value="request-changes"
          >
            {labels.requestChanges}
          </Button>
        </form>
      ) : null}
      {message ? (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
