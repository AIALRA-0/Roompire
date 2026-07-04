"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type ExpenseShareActionLabels = {
  approveShare: string;
  rejectShare: string;
  rejectionReason: string;
  shareApproved: string;
  shareRejected: string;
  errorFallback: string;
  working: string;
};

type ExpenseShareActionsProps = {
  householdId: string;
  shareId: string;
  labels: ExpenseShareActionLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

async function postShareDecision(url: string, body: unknown, errorFallback: string): Promise<void> {
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
}

export function ExpenseShareActions({ householdId, shareId, labels }: ExpenseShareActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function approveShare() {
    setMessage(null);

    try {
      await postShareDecision(
        `/api/v1/households/${householdId}/expenses/shares/${shareId}/approve`,
        {},
        labels.errorFallback,
      );
      setMessage(labels.shareApproved);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  async function rejectShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    try {
      await postShareDecision(
        `/api/v1/households/${householdId}/expenses/shares/${shareId}/reject`,
        { reason },
        labels.errorFallback,
      );
      setMessage(labels.shareRejected);
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
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={rejectShare}>
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
        >
          {labels.rejectShare}
        </Button>
      </form>
      {message ? (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
