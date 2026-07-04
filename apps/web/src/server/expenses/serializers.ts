import type {
  ExpenseCategory,
  ExpensePayer,
  ExpenseProposal,
  ExpenseShare,
  ProposalApproval,
  ProposalComment,
} from "@prisma/client";

type ProposalRelations = {
  category?: ExpenseCategory | null;
  payers?: ExpensePayer[];
  shares?: ExpenseShare[];
  approvals?: ProposalApproval[];
  comments?: ProposalComment[];
};

function dateToDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function serializeExpenseProposal(proposal: ExpenseProposal & ProposalRelations) {
  return {
    id: proposal.id,
    householdId: proposal.householdId,
    createdByUserId: proposal.createdByUserId,
    title: proposal.title,
    description: proposal.description,
    merchant: proposal.merchant,
    category: proposal.category
      ? {
          id: proposal.category.id,
          key: proposal.category.key,
          nameEn: proposal.category.nameEn,
          nameZhCn: proposal.category.nameZhCn,
          icon: proposal.category.icon,
          colorToken: proposal.category.colorToken,
        }
      : null,
    expenseDate: dateToDateOnly(proposal.expenseDate),
    dueDate: dateToDateOnly(proposal.dueDate),
    originalAmount: proposal.originalAmount.toString(),
    originalCurrency: proposal.originalCurrency,
    settlementAmount: proposal.settlementAmount.toString(),
    settlementCurrency: proposal.settlementCurrency,
    splitMethod: proposal.splitMethod,
    fxPolicy: proposal.fxPolicy,
    fxRate: proposal.fxRate?.toString() ?? null,
    fxRateDate: dateToDateOnly(proposal.fxRateDate),
    fxProvider: proposal.fxProvider,
    fxLockedAt: proposal.fxLockedAt?.toISOString() ?? null,
    status: proposal.status,
    revisionNumber: proposal.revisionNumber,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    payers:
      proposal.payers?.map((payer) => ({
        id: payer.id,
        userId: payer.userId,
        amountOriginal: payer.amountOriginal.toString(),
        amountSettlement: payer.amountSettlement.toString(),
        isPrimary: payer.isPrimary,
      })) ?? [],
    shares:
      proposal.shares?.map((share) => ({
        id: share.id,
        debtorUserId: share.debtorUserId,
        creditorUserId: share.creditorUserId,
        shareOriginalAmount: share.shareOriginalAmount.toString(),
        shareSettlementAmount: share.shareSettlementAmount.toString(),
        shareCurrency: share.shareCurrency,
        settlementCurrency: share.settlementCurrency,
        percentage: share.percentage?.toString() ?? null,
        shareUnits: share.shareUnits?.toString() ?? null,
        status: share.status,
        ledgerObligationId: share.ledgerObligationId,
      })) ?? [],
    approvals:
      proposal.approvals?.map((approval) => ({
        id: approval.id,
        shareId: approval.shareId,
        approverUserId: approval.approverUserId,
        decision: approval.decision,
        comment: approval.comment,
        createdAt: approval.createdAt.toISOString(),
      })) ?? [],
    comments:
      proposal.comments?.map((comment) => ({
        id: comment.id,
        shareId: comment.shareId,
        authorUserId: comment.authorUserId,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      })) ?? [],
  };
}
