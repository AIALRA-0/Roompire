"use client";

import { RotateCcw, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SerializedLedgerObligation } from "@/server/ledger/serializers";

type LedgerCorrectionMember = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
};

type LedgerCorrectionLabels = {
  corrections: string;
  correctionsHint: string;
  manualAdjustment: string;
  reverseObligation: string;
  debtor: string;
  creditor: string;
  amount: string;
  currency: string;
  occurred: string;
  dueDate: string;
  reason: string;
  createAdjustment: string;
  reverse: string;
  adjustmentCreated: string;
  obligationReversed: string;
  noReversibleObligations: string;
  cannotCorrectLedger: string;
  working: string;
  errorFallback: string;
  remaining: string;
};

type LedgerCorrectionActionsProps = {
  householdId: string;
  settlementCurrency: string;
  canCorrectLedger: boolean;
  members: LedgerCorrectionMember[];
  obligations: SerializedLedgerObligation[];
  memberNamesByUserId: Record<string, string>;
  labels: LedgerCorrectionLabels;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

async function postLedgerCorrection<T>(
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

function memberName(memberNamesByUserId: Record<string, string>, userId: string) {
  return memberNamesByUserId[userId] ?? userId;
}

function Field({
  label,
  children,
}: Readonly<{
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function LedgerCorrectionActions({
  householdId,
  settlementCurrency,
  canCorrectLedger,
  members,
  obligations,
  memberNamesByUserId,
  labels,
}: LedgerCorrectionActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const activeWritableMembers = members.filter((member) => member.role !== "VIEWER");
  const reversibleObligations = obligations.filter(
    (obligation) => obligation.status === "OPEN" && obligation.allocations.length === 0,
  );

  if (!canCorrectLedger) {
    return (
      <section className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{labels.corrections}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{labels.cannotCorrectLedger}</p>
      </section>
    );
  }

  async function createAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId("adjustment");

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await postLedgerCorrection(
        `/api/v1/households/${householdId}/ledger/adjustments`,
        {
          debtorUserId: String(formData.get("debtorUserId") ?? ""),
          creditorUserId: String(formData.get("creditorUserId") ?? ""),
          amount: String(formData.get("amount") ?? ""),
          currency: String(formData.get("currency") ?? "").toUpperCase(),
          occurredAt: String(formData.get("occurredAt") ?? ""),
          dueDate: String(formData.get("dueDate") ?? ""),
          reason: String(formData.get("reason") ?? ""),
        },
        labels.errorFallback,
      );
      form.reset();
      setMessage(labels.adjustmentCreated);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  async function reverseObligation(event: FormEvent<HTMLFormElement>, obligationId: string) {
    event.preventDefault();
    setMessage(null);
    setBusyActionId(`reverse-${obligationId}`);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await postLedgerCorrection(
        `/api/v1/households/${householdId}/ledger/obligations/${obligationId}/reverse`,
        {
          reason: String(formData.get("reason") ?? ""),
          occurredAt: String(formData.get("occurredAt") ?? ""),
        },
        labels.errorFallback,
      );
      form.reset();
      setMessage(labels.obligationReversed);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : labels.errorFallback);
    } finally {
      setBusyActionId(null);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">{labels.corrections}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{labels.correctionsHint}</p>
      </div>
      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form className="grid gap-3" onSubmit={createAdjustment}>
          <div>
            <h3 className="text-sm font-semibold">{labels.manualAdjustment}</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={labels.debtor}>
              <select
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="ledger-adjustment-debtor"
                name="debtorUserId"
                required
              >
                <option value="" />
                {activeWritableMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName} · {member.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={labels.creditor}>
              <select
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="ledger-adjustment-creditor"
                name="creditorUserId"
                required
              >
                <option value="" />
                {activeWritableMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName} · {member.email}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={labels.amount}>
              <input
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="ledger-adjustment-amount"
                min="0.000001"
                name="amount"
                required
                step="0.000001"
                type="number"
              />
            </Field>
            <Field label={labels.currency}>
              <input
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
                data-testid="ledger-adjustment-currency"
                defaultValue={settlementCurrency}
                maxLength={3}
                minLength={3}
                name="currency"
                required
              />
            </Field>
            <Field label={labels.occurred}>
              <input
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="ledger-adjustment-occurred"
                defaultValue={today}
                name="occurredAt"
                required
                type="date"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <Field label={labels.dueDate}>
              <input
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="ledger-adjustment-due-date"
                name="dueDate"
                type="date"
              />
            </Field>
            <Field label={labels.reason}>
              <input
                className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                data-testid="ledger-adjustment-reason"
                maxLength={500}
                name="reason"
                required
              />
            </Field>
          </div>
          <Button
            className="w-fit"
            data-testid="ledger-adjustment-submit"
            disabled={isPending || busyActionId === "adjustment"}
            type="submit"
          >
            <Scale aria-hidden="true" className="h-4 w-4" />
            {busyActionId === "adjustment" ? labels.working : labels.createAdjustment}
          </Button>
        </form>

        <div className="grid content-start gap-3">
          <h3 className="text-sm font-semibold">{labels.reverseObligation}</h3>
          {reversibleObligations.length > 0 ? (
            <div className="grid gap-3">
              {reversibleObligations.map((obligation) => (
                <form
                  className="grid gap-3 rounded-md border border-border bg-background p-3"
                  data-testid={`ledger-reversal-form-${obligation.id}`}
                  key={obligation.id}
                  onSubmit={(event) => reverseObligation(event, obligation.id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {memberName(memberNamesByUserId, obligation.debtorUserId)} ·{" "}
                        {memberName(memberNamesByUserId, obligation.creditorUserId)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {labels.remaining}: {obligation.settlementCurrency}{" "}
                        {obligation.remainingAmount}
                      </p>
                    </div>
                    <Badge variant="warning">{obligation.status}</Badge>
                  </div>
                  <input
                    className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-ring"
                    data-testid={`ledger-reversal-reason-${obligation.id}`}
                    maxLength={500}
                    name="reason"
                    placeholder={labels.reason}
                    required
                  />
                  <input
                    data-testid={`ledger-reversal-occurred-${obligation.id}`}
                    defaultValue={today}
                    name="occurredAt"
                    type="hidden"
                  />
                  <Button
                    className="w-fit"
                    data-testid={`ledger-reversal-submit-${obligation.id}`}
                    disabled={isPending || busyActionId === `reverse-${obligation.id}`}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    <RotateCcw aria-hidden="true" className="h-4 w-4" />
                    {busyActionId === `reverse-${obligation.id}` ? labels.working : labels.reverse}
                  </Button>
                </form>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{labels.noReversibleObligations}</p>
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
