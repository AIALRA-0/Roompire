import Link from "next/link";
import { ArrowLeft, ReceiptText, ShieldAlert, WalletCards } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExpenseProposalComments } from "@/components/expense-proposal-comments";
import { ExpenseProposalRevisionForm } from "@/components/expense-proposal-revision-form";
import { ExpenseShareActions } from "@/components/expense-share-actions";
import { ProposalReceiptUpload } from "@/components/proposal-receipt-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { requirePageUser } from "@/server/auth/session";
import { getExpenseProposalForUser } from "@/server/expenses/service";
import { serializeExpenseProposal } from "@/server/expenses/serializers";
import { createFileDownloadPath } from "@/server/files/service";
import { listMembersForHousehold } from "@/server/households/service";

type PageProps = {
  params: Promise<{ locale: Locale; householdId: string; proposalId: string }>;
};

type SerializedProposal = ReturnType<typeof serializeExpenseProposal>;
type ProposalStatus = SerializedProposal["status"];
type ShareStatus = SerializedProposal["shares"][number]["status"];
type MemberSummary = Awaited<ReturnType<typeof listMembersForHousehold>>[number];
type TimelineItem = {
  id: string;
  actorName: string;
  label: string;
  body?: string | null;
  occurredAt: string;
};

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

function formatTimestamp(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
  let members: MemberSummary[] = [];

  try {
    const [proposalRecord, memberRecords] = await Promise.all([
      getExpenseProposalForUser(user.id, householdId, proposalId),
      listMembersForHousehold(user.id, householdId),
    ]);
    proposal = serializeExpenseProposal(proposalRecord);
    members = memberRecords;
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

  const currentMembership = members.find((member) => member.userId === user.id);
  const canComment = currentMembership?.role !== "VIEWER";
  const categoryName = proposal.category
    ? locale === "zh-CN"
      ? proposal.category.nameZhCn
      : proposal.category.nameEn
    : expense("uncategorized");
  const hasLedgerObligation = proposal.shares.some((share) => share.ledgerObligationId);
  const canRevise =
    proposal.createdByUserId === user.id &&
    !hasLedgerObligation &&
    (proposal.status === "DISPUTED" || proposal.status === "REJECTED");
  const shareActionLabels = {
    approveShare: expense("approveShare"),
    rejectShare: expense("rejectShare"),
    requestChanges: expense("requestChanges"),
    rejectionReason: expense("rejectionReason"),
    shareApproved: expense("shareApproved"),
    shareRejected: expense("shareRejected"),
    changesRequested: expense("changesRequested"),
    errorFallback: expense("errorFallback"),
    working: common("working"),
  };
  const commentLabels = {
    addComment: expense("addComment"),
    commentPlaceholder: expense("commentPlaceholder"),
    commentAdded: expense("commentAdded"),
    errorFallback: expense("errorFallback"),
    working: common("working"),
  };
  const receiptUploadLabels = {
    attachReceipt: expense("attachReceipt"),
    receiptHint: expense("receiptHint"),
    receiptAttached: expense("receiptAttached"),
    selectedReceipt: expense("selectedReceipt"),
    errorFallback: expense("errorFallback"),
    working: common("working"),
  };
  const revisionLabels = {
    reviseTitle: expense("reviseTitle"),
    reviseHint: expense("reviseHint"),
    revisionReason: expense("revisionReason"),
    proposalTitle: expense("proposalTitle"),
    merchant: expense("merchant"),
    expenseDate: expense("expenseDate"),
    dueDate: expense("dueDate"),
    originalAmount: expense("originalAmount"),
    originalCurrency: expense("originalCurrency"),
    fxRate: expense("fxRate"),
    splitMethod: expense("splitMethod"),
    splitMethodEqual: expense("splitMethodEqual"),
    splitMethodExact: expense("splitMethodExact"),
    splitMethodPercentage: expense("splitMethodPercentage"),
    splitMethodShares: expense("splitMethodShares"),
    splitValueExact: expense("splitValueExact"),
    splitValuePercentage: expense("splitValuePercentage"),
    splitValueShares: expense("splitValueShares"),
    debtors: expense("debtors"),
    submitRevision: expense("submitRevision"),
    revisionSubmitted: expense("revisionSubmitted"),
    errorFallback: expense("errorFallback"),
    working: common("working"),
  };
  const timelineItems: TimelineItem[] = [
    {
      id: `submitted-${proposal.id}`,
      actorName: memberNames.get(proposal.createdByUserId) ?? proposal.createdByUserId,
      label: expense("timelineSubmitted"),
      occurredAt: proposal.createdAt,
    },
    ...proposal.approvals.map((approval) => ({
      id: `approval-${approval.id}`,
      actorName: memberNames.get(approval.approverUserId) ?? approval.approverUserId,
      label:
        approval.decision === "APPROVED"
          ? expense("timelineApproved")
          : approval.decision === "REQUEST_CHANGES"
            ? expense("timelineRequestedChanges")
            : expense("timelineRejected"),
      body: approval.comment,
      occurredAt: approval.createdAt,
    })),
    ...proposal.comments.map((comment) => ({
      id: `comment-${comment.id}`,
      actorName: memberNames.get(comment.authorUserId) ?? comment.authorUserId,
      label: expense("timelineCommented"),
      body: comment.body,
      occurredAt: comment.createdAt,
    })),
    ...proposal.files.map((file) => ({
      id: `file-${file.id}`,
      actorName: memberNames.get(file.uploadedByUserId) ?? file.uploadedByUserId,
      label: expense("timelineAttachedReceipt"),
      body: file.originalFilename,
      occurredAt: file.createdAt,
    })),
  ].sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );

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

              <div className="rounded-lg border border-border bg-background p-4">
                <h2 className="text-sm font-semibold">{expense("timeline")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{expense("timelineHint")}</p>
                <div className="mt-3 grid gap-3" data-testid="proposal-timeline">
                  {timelineItems.map((item) => (
                    <div className="border-l border-border pl-3" key={item.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {item.actorName} · {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(locale, item.occurredAt)}
                        </p>
                      </div>
                      {item.body ? (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                          {item.body}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 content-start">
              {canRevise ? (
                <div className="rounded-lg border border-border bg-background p-4">
                  <ExpenseProposalRevisionForm
                    householdId={householdId}
                    labels={revisionLabels}
                    locale={locale}
                    members={members
                      .filter((member) => member.role !== "VIEWER")
                      .map((member) => ({
                        userId: member.userId,
                        displayName: member.displayNameOverride ?? member.user.displayName,
                      }))}
                    proposal={proposal}
                  />
                </div>
              ) : null}

              <div className="rounded-lg border border-border bg-background p-4">
                <h2 className="text-sm font-semibold">{expense("receipts")}</h2>
                {canComment ? (
                  <ProposalReceiptUpload
                    householdId={householdId}
                    labels={receiptUploadLabels}
                    proposalId={proposal.id}
                  />
                ) : null}
                <div className="mt-3 divide-y divide-border" data-testid="proposal-files">
                  {proposal.files.length > 0 ? (
                    proposal.files.map((file) => {
                      const { downloadUrl } = createFileDownloadPath(householdId, file.id);

                      return (
                        <div className="py-3 first:pt-0 last:pb-0" key={file.id}>
                          <p className="truncate text-sm font-medium">{file.originalFilename}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {file.mimeType} · {Math.ceil(file.sizeBytes / 1024)} KB
                          </p>
                          <Button asChild className="mt-2" size="sm" variant="outline">
                            <a data-testid={`proposal-file-download-${file.id}`} href={downloadUrl}>
                              {expense("receiptDownload")}
                            </a>
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground">{expense("noReceipts")}</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <h2 className="text-sm font-semibold">{expense("comments")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{expense("commentHint")}</p>
                <div className="mt-3">
                  {canComment ? (
                    <ExpenseProposalComments
                      householdId={householdId}
                      labels={commentLabels}
                      proposalId={proposal.id}
                    />
                  ) : (
                    <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                      {expense("commentReadOnly")}
                    </p>
                  )}
                </div>
                <div className="mt-4 divide-y divide-border" data-testid="proposal-comments">
                  {proposal.comments.length > 0 ? (
                    proposal.comments.map((comment) => (
                      <div className="py-3 first:pt-0 last:pb-0" key={comment.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {memberNames.get(comment.authorUserId) ?? comment.authorUserId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTimestamp(locale, comment.createdAt)}
                          </p>
                        </div>
                        <p
                          className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground"
                          data-testid={`proposal-comment-${comment.id}`}
                        >
                          {comment.body}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">{expense("noComments")}</p>
                  )}
                </div>
              </div>

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
