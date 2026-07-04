import Link from "next/link";
import { ArrowLeft, ReceiptText, ShieldAlert, WalletCards } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExpenseShareActions } from "@/components/expense-share-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { requirePageUser } from "@/server/auth/session";
import { getExpenseProposalForUser } from "@/server/expenses/service";
import { serializeExpenseProposal } from "@/server/expenses/serializers";
import { listMembersForHousehold } from "@/server/households/service";

type PageProps = {
  params: Promise<{ locale: Locale; householdId: string; proposalId: string }>;
};

type SerializedProposal = ReturnType<typeof serializeExpenseProposal>;
type ProposalStatus = SerializedProposal["status"];
type ShareStatus = SerializedProposal["shares"][number]["status"];

function statusVariant(status: ProposalStatus) {
  if (status === "APPROVED" || status === "MATURED_TO_LEDGER") {
    return "success" as const;
  }

  if (status === "REJECTED" || status === "CANCELLED" || status === "DISPUTED") {
    return "danger" as const;
  }

  return "warning" as const;
}

function statusLabel(
  status: ProposalStatus,
  expense: Awaited<ReturnType<typeof getTranslations>>,
  common: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (status === "SUBMITTED") {
    return common("submitted");
  }

  if (status === "APPROVED") {
    return common("approved");
  }

  if (status === "REJECTED") {
    return common("rejected");
  }

  const labels: Record<Exclude<ProposalStatus, "SUBMITTED" | "APPROVED" | "REJECTED">, string> = {
    DRAFT: expense("statusDraft"),
    PARTIALLY_APPROVED: expense("statusPartiallyApproved"),
    PARTIALLY_MATURED: expense("statusPartiallyMatured"),
    MATURED_TO_LEDGER: expense("statusMatured"),
    DISPUTED: expense("statusDisputed"),
    CANCELLED: expense("statusCancelled"),
  };

  return labels[status];
}

function shareStatusVariant(status: ShareStatus) {
  if (status === "APPROVED" || status === "MATURED_TO_LEDGER") {
    return "success" as const;
  }

  if (status === "REJECTED" || status === "DISPUTED") {
    return "danger" as const;
  }

  return "warning" as const;
}

function shareStatusLabel(
  status: ShareStatus,
  expense: Awaited<ReturnType<typeof getTranslations>>,
  common: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (status === "PENDING") {
    return common("pending");
  }

  if (status === "APPROVED") {
    return common("approved");
  }

  if (status === "REJECTED") {
    return common("rejected");
  }

  if (status === "MATURED_TO_LEDGER") {
    return expense("statusMatured");
  }

  return expense("statusDisputed");
}

function splitMethodLabel(
  splitMethod: SerializedProposal["splitMethod"],
  expense: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (splitMethod === "EQUAL") {
    return expense("splitMethodEqual");
  }

  if (splitMethod === "EXACT") {
    return expense("splitMethodExact");
  }

  if (splitMethod === "PERCENTAGE") {
    return expense("splitMethodPercentage");
  }

  if (splitMethod === "SHARES") {
    return expense("splitMethodShares");
  }

  return splitMethod;
}

function shareBasisLabel(
  share: SerializedProposal["shares"][number],
  expense: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (share.percentage) {
    return `${expense("splitValuePercentage")}: ${share.percentage}%`;
  }

  if (share.shareUnits) {
    return `${expense("splitValueShares")}: ${share.shareUnits}`;
  }

  return null;
}

function ForbiddenState({
  locale,
  title,
  body,
  back,
}: Readonly<{
  locale: Locale;
  title: string;
  body: string;
  back: string;
}>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center shadow-soft">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <ShieldAlert aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link href={`/${locale}/app`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {back}
          </Link>
        </Button>
      </section>
    </main>
  );
}

export default async function ExpenseProposalDetailPage({ params }: PageProps) {
  const { locale, householdId, proposalId } = await params;
  const expense = await getTranslations({ locale, namespace: "Expense" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const forbidden = await getTranslations({ locale, namespace: "Forbidden" });
  const user = await requirePageUser();

  let proposal: SerializedProposal | null = null;
  let memberNames = new Map<string, string>();

  try {
    const [proposalRecord, members] = await Promise.all([
      getExpenseProposalForUser(user.id, householdId, proposalId),
      listMembersForHousehold(user.id, householdId),
    ]);
    proposal = serializeExpenseProposal(proposalRecord);
    memberNames = new Map(
      members.map((member) => [
        member.userId,
        member.displayNameOverride ?? member.user.displayName,
      ]),
    );
  } catch {
    return (
      <ForbiddenState
        back={forbidden("back")}
        body={forbidden("body")}
        locale={locale}
        title={forbidden("title")}
      />
    );
  }

  const categoryName = proposal.category
    ? locale === "zh-CN"
      ? proposal.category.nameZhCn
      : proposal.category.nameEn
    : expense("uncategorized");
  const hasLedgerObligation = proposal.shares.some((share) => share.ledgerObligationId);
  const shareActionLabels = {
    approveShare: expense("approveShare"),
    rejectShare: expense("rejectShare"),
    rejectionReason: expense("rejectionReason"),
    shareApproved: expense("shareApproved"),
    shareRejected: expense("shareRejected"),
    errorFallback: expense("errorFallback"),
    working: common("working"),
  };

  return (
    <main className="min-h-svh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl">
        <Button asChild className="mb-5" variant="outline">
          <Link href={`/${locale}/app`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {forbidden("back")}
          </Link>
        </Button>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText aria-hidden="true" className="h-5 w-5 text-primary" />
                  <h1 className="text-2xl font-semibold">{proposal.title}</h1>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {hasLedgerObligation ? expense("ledgerDetailHint") : expense("detailHint")}
                </p>
              </div>
              <Badge variant={statusVariant(proposal.status)}>
                {statusLabel(proposal.status, expense, common)}
              </Badge>
            </div>
          </div>

          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{expense("merchant")}</p>
                  <p className="mt-1 text-sm font-medium">{proposal.merchant ?? categoryName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{expense("expenseDate")}</p>
                  <p className="mt-1 text-sm font-medium">{proposal.expenseDate}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{expense("originalAmount")}</p>
                  <p className="mt-1 text-sm font-medium">
                    {proposal.originalCurrency} {proposal.originalAmount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{expense("settlementCurrency")}</p>
                  <p className="mt-1 text-sm font-medium">
                    {proposal.settlementCurrency} {proposal.settlementAmount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{expense("splitMethod")}</p>
                  <p className="mt-1 text-sm font-medium">
                    {splitMethodLabel(proposal.splitMethod, expense)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <h2 className="text-sm font-semibold">{expense("debtors")}</h2>
                <div className="mt-3 divide-y divide-border">
                  {proposal.shares.map((share) => {
                    const basisLabel = shareBasisLabel(share, expense);

                    return (
                      <div className="grid gap-3 py-3" key={share.id}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {memberNames.get(share.debtorUserId) ?? share.debtorUserId}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {share.shareCurrency} {share.shareOriginalAmount} ·{" "}
                                {share.settlementCurrency} {share.shareSettlementAmount}
                              </p>
                              {basisLabel ? (
                                <p className="mt-1 text-xs text-muted-foreground">{basisLabel}</p>
                              ) : null}
                            </div>
                            <Badge variant={shareStatusVariant(share.status)}>
                              {shareStatusLabel(share.status, expense, common)}
                            </Badge>
                          </div>
                        </div>
                        {share.debtorUserId === user.id && share.status === "PENDING" ? (
                          <ExpenseShareActions
                            householdId={householdId}
                            labels={shareActionLabels}
                            shareId={share.id}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-4 content-start">
              <div className="rounded-lg border border-border bg-background p-4">
                <h2 className="text-sm font-semibold">{expense("payer")}</h2>
                <div className="mt-3 grid gap-2">
                  {proposal.payers.map((payer) => (
                    <div key={payer.id}>
                      <p className="text-sm font-medium">
                        {memberNames.get(payer.userId) ?? payer.userId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {proposal.originalCurrency} {payer.amountOriginal}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <h2 className="text-sm font-semibold">{expense("fxLock")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {proposal.originalCurrency}/{proposal.settlementCurrency} · {proposal.fxRate}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {proposal.fxRateDate} · {proposal.fxProvider}
                </p>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <div className="flex gap-2">
                  <WalletCards aria-hidden="true" className="mt-0.5 h-4 w-4" />
                  <p className="text-sm font-medium">
                    {hasLedgerObligation
                      ? expense("formalLedgerCreated")
                      : expense("formalLedgerGuard")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
