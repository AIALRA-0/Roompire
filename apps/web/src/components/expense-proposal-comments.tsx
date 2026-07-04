"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type ExpenseProposalCommentLabels = {
  addComment: string;
  commentPlaceholder: string;
  commentAdded: string;
  errorFallback: string;
  working: string;
};

type ExpenseProposalCommentsProps = {
  householdId: string;
  proposalId: string;
  labels: ExpenseProposalCommentLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

async function postProposalComment(
  url: string,
  body: unknown,
  errorFallback: string,
): Promise<void> {
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

export function ExpenseProposalComments({
  householdId,
  proposalId,
  labels,
}: ExpenseProposalCommentsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    try {
      await postProposalComment(
        `/api/v1/households/${householdId}/expenses/proposals/${proposalId}/comments`,
        { body },
        labels.errorFallback,
      );
      setBody("");
      setMessage(labels.commentAdded);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    }
  }

  return (
    <form className="grid gap-2" onSubmit={submitComment}>
      <textarea
        className="min-h-24 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-ring"
        data-testid="proposal-comment-body"
        maxLength={1000}
        onChange={(event) => setBody(event.target.value)}
        placeholder={labels.commentPlaceholder}
        required
        value={body}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          data-testid="proposal-comment-submit"
          disabled={isPending || body.trim().length === 0}
          size="sm"
          type="submit"
        >
          {isPending ? labels.working : labels.addComment}
        </Button>
        {message ? (
          <p className="text-xs text-muted-foreground" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
