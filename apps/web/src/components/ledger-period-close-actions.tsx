"use client";

import { Lock, Unlock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SerializedLedgerPeriodClose } from "@/server/ledger/serializers";

type LedgerPeriodCloseLabels = {
  periodCloses: string;
  periodClosesHint: string;
  closeMonth: string;
  recentPeriods: string;
  month: string;
  note: string;
  closePeriod: string;
  reopenPeriod: string;
  closed: string;
  reopened: string;
  periodClosed: string;
  periodReopened: string;
  noPeriodCloses: string;
  cannotClosePeriod: string;
  working: string;
  errorFallback: string;
};

type LedgerPeriodCloseActionsProps = {
  householdId: string;
  canCorrectLedger: boolean;
  periodCloses: SerializedLedgerPeriodClose[];
  labels: LedgerPeriodCloseLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

async function postLedgerPeriodMutation<T>(
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

function Field({
  label,
  children,
}: Readonly<{
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <label className="grid min-w-0 max-w-full gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function LedgerPeriodCloseActions({
  householdId,
  canCorrectLedger,
  periodCloses,
  labels,
}: LedgerPeriodCloseActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  if (!canCorrectLedger) {
    return (
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{labels.periodCloses}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{labels.cannotClosePeriod}</p>
      </section>
    );
  }

  async function closePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId("close");

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await postLedgerPeriodMutation(
        `/api/v1/households/${householdId}/ledger/period-closes`,
        {
          periodMonth: String(formData.get("periodMonth") ?? ""),
          note: String(formData.get("note") ?? ""),
        },
        labels.errorFallback,
      );
      form.reset();
      setMessage(labels.periodClosed);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function reopenPeriod(periodCloseId: string) {
    setMessage(null);
    setBusyActionId(`reopen-${periodCloseId}`);

    try {
      await postLedgerPeriodMutation(
        `/api/v1/households/${householdId}/ledger/period-closes/${periodCloseId}/reopen`,
        {},
        labels.errorFallback,
      );
      setMessage(labels.periodReopened);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <section className="mt-6 min-w-0 rounded-lg border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">{labels.periodCloses}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.periodClosesHint}</p>
      </div>
      <div className="grid min-w-0 gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <form className="grid min-w-0 content-start gap-3" onSubmit={closePeriod}>
          <h3 className="text-sm font-semibold">{labels.closeMonth}</h3>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <Field label={labels.month}>
              <input
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="ledger-period-close-month"
                defaultValue={currentMonth}
                name="periodMonth"
                required
                type="month"
              />
            </Field>
            <Field label={labels.note}>
              <input
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="ledger-period-close-note"
                maxLength={500}
                name="note"
              />
            </Field>
          </div>
          <Button
            className="w-fit"
            data-testid="ledger-period-close-submit"
            disabled={isPending || busyActionId === "close"}
            type="submit"
          >
            <Lock aria-hidden="true" className="h-4 w-4" />
            {busyActionId === "close" ? labels.working : labels.closePeriod}
          </Button>
        </form>

        <div className="grid min-w-0 content-start gap-3">
          <h3 className="text-sm font-semibold">{labels.recentPeriods}</h3>
          {periodCloses.length > 0 ? (
            <div className="divide-y divide-border rounded-md border border-border bg-background">
              {periodCloses.map((periodClose) => {
                const isClosed = periodClose.status === "CLOSED";
                const reopenBusyId = `reopen-${periodClose.id}`;

                return (
                  <div
                    className="grid min-w-0 gap-3 p-3"
                    data-testid={`ledger-period-close-${periodClose.periodMonth}`}
                    key={periodClose.id}
                  >
                    <div className="flex min-w-0 max-w-full flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 max-w-full">
                        <p className="truncate text-sm font-medium">{periodClose.periodMonth}</p>
                        {periodClose.note ? (
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {periodClose.note}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant={isClosed ? "warning" : "neutral"}>
                        {isClosed ? labels.closed : labels.reopened}
                      </Badge>
                    </div>
                    {isClosed ? (
                      <Button
                        className="w-fit"
                        data-testid={`ledger-period-reopen-${periodClose.id}`}
                        disabled={isPending || busyActionId === reopenBusyId}
                        onClick={() => reopenPeriod(periodClose.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Unlock aria-hidden="true" className="h-4 w-4" />
                        {busyActionId === reopenBusyId ? labels.working : labels.reopenPeriod}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{labels.noPeriodCloses}</p>
          )}
        </div>
      </div>
      {message ? (
        <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
