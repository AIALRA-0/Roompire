"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
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
  const debtorOptions = useMemo(
    () => members.filter((member) => member.role !== "VIEWER" && member.email !== currentUserEmail),
    [currentUserEmail, members],
  );
  const isDisabled = !activeHouseholdId || !canCreateExpenseProposals || debtorOptions.length === 0;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!activeHouseholdId) {
      setMessage(labels.noHousehold);
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const participantUserIds = formData.getAll("participantUserIds").map(String);

    try {
      await postProposal(
        `/api/v1/households/${activeHouseholdId}/expenses/proposals`,
        {
          title: String(formData.get("title") ?? ""),
          merchant: String(formData.get("merchant") ?? ""),
          categoryId: String(formData.get("categoryId") ?? ""),
          expenseDate: String(formData.get("expenseDate") ?? ""),
          dueDate: String(formData.get("dueDate") ?? ""),
          originalAmount: String(formData.get("originalAmount") ?? ""),
          originalCurrency: String(formData.get("originalCurrency") ?? "").toUpperCase(),
          fxRate: String(formData.get("fxRate") ?? ""),
          participantUserIds,
          splitMethod: "EQUAL",
        },
        labels.errorFallback,
      );
      form.reset();
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
                required
                step="0.01"
                type="number"
              />
            </Field>
            <Field label={labels.originalCurrency}>
              <input
                className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase focus-ring"
                data-testid="expense-original-currency"
                defaultValue="USD"
                disabled={isDisabled}
                maxLength={3}
                minLength={3}
                name="originalCurrency"
                required
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
                defaultValue={settlementCurrency === "USD" ? "1" : ""}
                disabled={isDisabled}
                min="0.000001"
                name="fxRate"
                step="0.000001"
                type="number"
              />
            </Field>
          </div>

          <fieldset className="rounded-lg border border-border bg-background p-3">
            <legend className="px-1 text-sm font-medium">{labels.debtors}</legend>
            <p className="mt-1 text-xs text-muted-foreground">{labels.payerShareIncluded}</p>
            <div className="mt-3 grid gap-2">
              {debtorOptions.map((member) => (
                <label className="flex items-center gap-2 text-sm" key={member.userId}>
                  <input
                    className="h-4 w-4 rounded border-input"
                    data-testid={`expense-debtor-${member.email}`}
                    disabled={isDisabled}
                    name="participantUserIds"
                    type="checkbox"
                    value={member.userId}
                  />
                  <span className="min-w-0 truncate">
                    {member.displayName} · {member.email}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

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
