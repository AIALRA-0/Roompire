import Decimal from "decimal.js";
import {
  ApprovalDecision,
  ExpenseProposalStatus,
  LedgerTransactionType,
  Role,
  ShareStatus,
  SplitMethod,
} from "@prisma/client";
import { z } from "zod";
import { splitEqual } from "@/lib/money/split";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership, requireExpenseProposalCreator } from "@/server/permissions/rbac";

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/);

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((value) => new Decimal(value).isPositive(), "Amount must be greater than zero.");

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nullableUuidSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().uuid().optional(),
);

export const createExpenseProposalSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  merchant: z.string().trim().max(120).optional(),
  categoryId: nullableUuidSchema,
  expenseDate: dateOnlySchema,
  dueDate: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    dateOnlySchema.optional(),
  ),
  originalAmount: decimalStringSchema,
  originalCurrency: currencySchema,
  fxRate: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    decimalStringSchema.optional(),
  ),
  participantUserIds: z.array(z.string().uuid()).min(1).max(20),
  splitMethod: z.literal("EQUAL").default("EQUAL"),
});

export const listExpenseProposalQuerySchema = z.object({
  status: z.nativeEnum(ExpenseProposalStatus).optional(),
});

export const approveExpenseShareSchema = z.object({
  comment: z.string().trim().max(1000).optional(),
});

export const rejectExpenseShareSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalToFixed6(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function assertCanParticipate(role: Role) {
  return role === Role.OWNER || role === Role.ADMIN || role === Role.MEMBER;
}

function proposalStatusFromShares(shares: Array<{ status: ShareStatus }>) {
  if (shares.length === 0) {
    return ExpenseProposalStatus.SUBMITTED;
  }

  if (shares.every((share) => share.status === ShareStatus.MATURED_TO_LEDGER)) {
    return ExpenseProposalStatus.MATURED_TO_LEDGER;
  }

  if (shares.some((share) => share.status === ShareStatus.MATURED_TO_LEDGER)) {
    return ExpenseProposalStatus.PARTIALLY_MATURED;
  }

  if (shares.every((share) => share.status === ShareStatus.REJECTED)) {
    return ExpenseProposalStatus.REJECTED;
  }

  if (shares.some((share) => share.status === ShareStatus.REJECTED)) {
    return ExpenseProposalStatus.DISPUTED;
  }

  if (shares.every((share) => share.status === ShareStatus.APPROVED)) {
    return ExpenseProposalStatus.APPROVED;
  }

  if (shares.some((share) => share.status === ShareStatus.APPROVED)) {
    return ExpenseProposalStatus.PARTIALLY_APPROVED;
  }

  return ExpenseProposalStatus.SUBMITTED;
}

function assertProposalCanReceiveShareDecision(status: ExpenseProposalStatus) {
  if (
    status === ExpenseProposalStatus.CANCELLED ||
    status === ExpenseProposalStatus.REJECTED ||
    status === ExpenseProposalStatus.MATURED_TO_LEDGER
  ) {
    throw new ApiError(
      409,
      "PROPOSAL_NOT_ACTIONABLE",
      "This proposal is no longer accepting share decisions.",
    );
  }
}

function assertFxLockReady(proposal: {
  originalCurrency: string;
  settlementCurrency: string;
  fxRate: Decimal | null;
  fxRateDate: Date | null;
  fxLockedAt: Date | null;
}) {
  if (
    proposal.originalCurrency !== proposal.settlementCurrency &&
    (!proposal.fxRate || !proposal.fxRateDate || !proposal.fxLockedAt)
  ) {
    throw new ApiError(
      409,
      "FX_LOCK_REQUIRED",
      "FX lock must be present before an approved share can mature.",
    );
  }
}

async function assertCategoryBelongsToHousehold(categoryId: string, householdId: string) {
  const category = await prisma.expenseCategory.findFirst({
    where: {
      id: categoryId,
      householdId,
      isActive: true,
    },
  });

  if (!category) {
    throw new ApiError(400, "INVALID_CATEGORY", "Category is not active in this household.");
  }
}

async function getParticipantMemberships(householdId: string, userIds: string[]) {
  const memberships = await prisma.householdMembership.findMany({
    where: {
      householdId,
      userId: {
        in: userIds,
      },
      status: "ACTIVE",
    },
    include: { user: true },
  });

  const membershipsByUserId = new Map(
    memberships.map((membership) => [membership.userId, membership]),
  );

  for (const userId of userIds) {
    const membership = membershipsByUserId.get(userId);

    if (!membership || !assertCanParticipate(membership.role)) {
      throw new ApiError(
        400,
        "INVALID_PARTICIPANT",
        "Every debtor must be an active owner, admin, or member of the household.",
        { userId },
      );
    }
  }

  return userIds.map((userId) => membershipsByUserId.get(userId)!);
}

export async function listExpenseCategoriesForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.expenseCategory.findMany({
    where: {
      householdId,
      isActive: true,
    },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
}

export async function listExpenseProposalsForHousehold(
  userId: string,
  householdId: string,
  query: unknown = {},
) {
  await requireActiveMembership(userId, householdId);
  const parsed = listExpenseProposalQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw validationError("Expense proposal query is invalid.", parsed.error.flatten());
  }

  return prisma.expenseProposal.findMany({
    where: {
      householdId,
      status: parsed.data.status,
    },
    include: {
      category: true,
      payers: true,
      shares: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 20,
  });
}

export async function getExpenseProposalForUser(
  userId: string,
  householdId: string,
  proposalId: string,
) {
  await requireActiveMembership(userId, householdId);

  const proposal = await prisma.expenseProposal.findFirst({
    where: {
      id: proposalId,
      householdId,
    },
    include: {
      category: true,
      payers: true,
      shares: true,
      approvals: true,
      comments: true,
    },
  });

  if (!proposal) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  return proposal;
}

export async function createExpenseProposalForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  const creatorMembership = await requireExpenseProposalCreator(userId, householdId);
  const parsed = createExpenseProposalSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense proposal input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const household = creatorMembership.household;
  const debtorUserIds = uniqueValues(data.participantUserIds);

  if (debtorUserIds.includes(userId)) {
    throw new ApiError(
      400,
      "PAYER_AS_DEBTOR_FORBIDDEN",
      "The payer share is implicit; debtor list cannot include the payer.",
    );
  }

  if (data.categoryId) {
    await assertCategoryBelongsToHousehold(data.categoryId, householdId);
  }

  const debtorMemberships = await getParticipantMemberships(householdId, debtorUserIds);
  const originalAmount = new Decimal(data.originalAmount);
  const settlementCurrency = household.settlementCurrency;
  const originalCurrency = data.originalCurrency;
  const sameCurrency = originalCurrency === settlementCurrency;

  if (!sameCurrency && !data.fxRate) {
    throw new ApiError(
      400,
      "FX_RATE_REQUIRED",
      "FX rate is required when original currency differs from settlement currency.",
    );
  }

  const fxRate = sameCurrency ? new Decimal(1) : new Decimal(data.fxRate!);
  const settlementAmount = originalAmount.mul(fxRate);
  const splitParticipants = debtorMemberships.length + 1;
  const originalSplit = splitEqual({
    amount: decimalToFixed6(originalAmount),
    participants: splitParticipants,
    scale: 6,
  });
  const settlementSplit = splitEqual({
    amount: decimalToFixed6(settlementAmount),
    participants: splitParticipants,
    scale: 6,
  });
  const shareRows = debtorMemberships.map((membership, index) => ({
    debtorUserId: membership.userId,
    creditorUserId: userId,
    shareOriginalAmount: originalSplit.shares[index]!,
    shareSettlementAmount: settlementSplit.shares[index]!,
    shareCurrency: originalCurrency,
    settlementCurrency,
  }));
  const expenseDate = dateOnlyToUtc(data.expenseDate);
  const dueDate = data.dueDate ? dateOnlyToUtc(data.dueDate) : undefined;

  return prisma.$transaction(async (tx) => {
    const proposal = await tx.expenseProposal.create({
      data: {
        householdId,
        createdByUserId: userId,
        title: data.title,
        description: data.description,
        merchant: data.merchant,
        categoryId: data.categoryId,
        expenseDate,
        dueDate,
        originalAmount: decimalToFixed6(originalAmount),
        originalCurrency,
        settlementCurrency,
        settlementAmount: decimalToFixed6(settlementAmount),
        splitMethod: SplitMethod.EQUAL,
        fxPolicy: household.fxPolicy,
        fxRate: decimalToFixed6(fxRate),
        fxRateDate: expenseDate,
        fxProvider: sameCurrency ? "same-currency" : "manual-entry",
        fxLockedAt: new Date(),
        status: ExpenseProposalStatus.SUBMITTED,
        payers: {
          create: [
            {
              userId,
              amountOriginal: decimalToFixed6(originalAmount),
              amountSettlement: decimalToFixed6(settlementAmount),
              isPrimary: true,
            },
          ],
        },
        shares: {
          create: shareRows,
        },
      },
      include: {
        category: true,
        payers: true,
        shares: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_proposal.submitted",
        entityType: "ExpenseProposal",
        entityId: proposal.id,
        after: {
          title: proposal.title,
          status: proposal.status,
          originalAmount: proposal.originalAmount.toString(),
          originalCurrency,
          settlementAmount: proposal.settlementAmount.toString(),
          settlementCurrency,
          splitMethod: proposal.splitMethod,
          shareStatus: ShareStatus.PENDING,
          debtorUserIds,
        },
      },
    });

    return proposal;
  });
}

export async function approveExpenseShareForHousehold(
  userId: string,
  householdId: string,
  shareId: string,
  input: unknown = {},
) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!assertCanParticipate(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot approve expense shares.");
  }

  const parsed = approveExpenseShareSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense share approval input is invalid.", parsed.error.flatten());
  }

  return prisma.$transaction(async (tx) => {
    const share = await tx.expenseShare.findFirst({
      where: {
        id: shareId,
        proposal: {
          householdId,
        },
      },
      include: {
        proposal: {
          include: {
            payers: true,
            shares: true,
          },
        },
      },
    });

    if (!share) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (share.debtorUserId !== userId) {
      throw new ApiError(403, "FORBIDDEN", "Users can only approve their own shares.");
    }

    if (share.status === ShareStatus.MATURED_TO_LEDGER) {
      return tx.expenseProposal.findUniqueOrThrow({
        where: { id: share.proposalId },
        include: {
          category: true,
          payers: true,
          shares: true,
          approvals: true,
          comments: true,
        },
      });
    }

    assertProposalCanReceiveShareDecision(share.proposal.status);

    if (share.status !== ShareStatus.PENDING && share.status !== ShareStatus.APPROVED) {
      throw new ApiError(409, "SHARE_NOT_ACTIONABLE", "Only pending shares can be approved.");
    }

    const hasPayerConfirmation = share.proposal.payers.some(
      (payer) => payer.userId === share.creditorUserId && payer.isPrimary,
    );

    if (!hasPayerConfirmation) {
      throw new ApiError(
        409,
        "PAYER_CONFIRMATION_REQUIRED",
        "Primary payer confirmation is required before a share can mature.",
      );
    }

    assertFxLockReady(share.proposal);

    if (share.status === ShareStatus.PENDING) {
      await tx.proposalApproval.create({
        data: {
          proposalId: share.proposalId,
          shareId: share.id,
          approverUserId: userId,
          decision: ApprovalDecision.APPROVED,
          comment: parsed.data.comment,
        },
      });

      await tx.auditEvent.create({
        data: {
          householdId,
          actorUserId: userId,
          action: "expense_share.approved",
          entityType: "ExpenseShare",
          entityId: share.id,
          after: {
            proposalId: share.proposalId,
            debtorUserId: share.debtorUserId,
            creditorUserId: share.creditorUserId,
            status: ShareStatus.APPROVED,
          },
        },
      });
    }

    const existingObligation = await tx.debtObligation.findUnique({
      where: {
        sourceShareId: share.id,
      },
    });

    if (existingObligation) {
      await tx.expenseShare.update({
        where: { id: share.id },
        data: {
          status: ShareStatus.MATURED_TO_LEDGER,
          ledgerObligationId: existingObligation.id,
        },
      });
    } else {
      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          householdId,
          type: LedgerTransactionType.DEBT_CREATED,
          description: share.proposal.title,
          sourceType: "ExpenseShare",
          sourceId: share.id,
          createdByUserId: userId,
          occurredAt: new Date(),
        },
      });

      const obligation = await tx.debtObligation.create({
        data: {
          householdId,
          ledgerTransactionId: ledgerTransaction.id,
          sourceShareId: share.id,
          debtorUserId: share.debtorUserId,
          creditorUserId: share.creditorUserId,
          originalAmount: share.shareOriginalAmount,
          originalCurrency: share.shareCurrency,
          settlementAmount: share.shareSettlementAmount,
          settlementCurrency: share.settlementCurrency,
          remainingAmount: share.shareSettlementAmount,
          dueDate: share.proposal.dueDate,
        },
      });

      await tx.expenseShare.update({
        where: { id: share.id },
        data: {
          status: ShareStatus.MATURED_TO_LEDGER,
          ledgerObligationId: obligation.id,
        },
      });

      await tx.auditEvent.create({
        data: {
          householdId,
          actorUserId: userId,
          action: "expense_share.matured_to_ledger",
          entityType: "DebtObligation",
          entityId: obligation.id,
          after: {
            proposalId: share.proposalId,
            shareId: share.id,
            ledgerTransactionId: ledgerTransaction.id,
            debtorUserId: share.debtorUserId,
            creditorUserId: share.creditorUserId,
            settlementAmount: obligation.settlementAmount.toString(),
            settlementCurrency: obligation.settlementCurrency,
          },
        },
      });
    }

    const refreshedShares = await tx.expenseShare.findMany({
      where: { proposalId: share.proposalId },
      select: { status: true },
    });

    return tx.expenseProposal.update({
      where: { id: share.proposalId },
      data: {
        status: proposalStatusFromShares(refreshedShares),
      },
      include: {
        category: true,
        payers: true,
        shares: true,
        approvals: true,
        comments: true,
      },
    });
  });
}

export async function rejectExpenseShareForHousehold(
  userId: string,
  householdId: string,
  shareId: string,
  input: unknown,
) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!assertCanParticipate(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot reject expense shares.");
  }

  const parsed = rejectExpenseShareSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense share rejection input is invalid.", parsed.error.flatten());
  }

  return prisma.$transaction(async (tx) => {
    const share = await tx.expenseShare.findFirst({
      where: {
        id: shareId,
        proposal: {
          householdId,
        },
      },
      include: {
        proposal: {
          include: {
            shares: true,
          },
        },
      },
    });

    if (!share) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (share.debtorUserId !== userId) {
      throw new ApiError(403, "FORBIDDEN", "Users can only reject their own shares.");
    }

    if (share.status === ShareStatus.REJECTED) {
      return tx.expenseProposal.findUniqueOrThrow({
        where: { id: share.proposalId },
        include: {
          category: true,
          payers: true,
          shares: true,
          approvals: true,
          comments: true,
        },
      });
    }

    assertProposalCanReceiveShareDecision(share.proposal.status);

    if (share.status !== ShareStatus.PENDING) {
      throw new ApiError(409, "SHARE_NOT_ACTIONABLE", "Only pending shares can be rejected.");
    }

    await tx.proposalApproval.create({
      data: {
        proposalId: share.proposalId,
        shareId: share.id,
        approverUserId: userId,
        decision: ApprovalDecision.REJECTED,
        comment: parsed.data.reason,
      },
    });

    await tx.expenseShare.update({
      where: { id: share.id },
      data: {
        status: ShareStatus.REJECTED,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_share.rejected",
        entityType: "ExpenseShare",
        entityId: share.id,
        after: {
          proposalId: share.proposalId,
          debtorUserId: share.debtorUserId,
          creditorUserId: share.creditorUserId,
          status: ShareStatus.REJECTED,
          reason: parsed.data.reason,
        },
      },
    });

    const refreshedShares = await tx.expenseShare.findMany({
      where: { proposalId: share.proposalId },
      select: { status: true },
    });

    return tx.expenseProposal.update({
      where: { id: share.proposalId },
      data: {
        status: proposalStatusFromShares(refreshedShares),
      },
      include: {
        category: true,
        payers: true,
        shares: true,
        approvals: true,
        comments: true,
      },
    });
  });
}

export type ExpenseProposalWithRelations = Awaited<
  ReturnType<typeof listExpenseProposalsForHousehold>
>[number];

export type ExpenseProposalDetail = Awaited<ReturnType<typeof getExpenseProposalForUser>>;
export type ExpenseCategorySummary = Awaited<
  ReturnType<typeof listExpenseCategoriesForHousehold>
>[number];
