import Decimal from "decimal.js";
import {
  ApprovalDecision,
  CalendarEventType,
  ExpenseProposalStatus,
  LedgerTransactionType,
  Prisma,
  Role,
  ShareStatus,
  SplitMethod,
} from "@prisma/client";
import { z } from "zod";
import { splitByWeights, splitEqual } from "@/lib/money/split";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { assertFilesReadyForProposal } from "@/server/files/service";
import { resolveFxRateLock } from "@/server/fx/rates";
import { assertLedgerPeriodOpen } from "@/server/ledger/service";
import { createExpenseProposalAssignedNotifications } from "@/server/notifications/service";
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

const fxRateStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,12})?$/)
  .refine((value) => new Decimal(value).isPositive(), "FX rate must be greater than zero.");

const supportedSplitMethods = ["EQUAL", "EXACT", "PERCENTAGE", "SHARES"] as const;
const expenseProposalEventTypes = new Set<CalendarEventType>([
  CalendarEventType.CHORE,
  CalendarEventType.GROUP_ACTIVITY,
  CalendarEventType.BILL_DUE,
  CalendarEventType.RECURRING_EXPENSE_GENERATION,
]);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nullableUuidSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().uuid().optional(),
);

const optionalDecimalStringSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  decimalStringSchema.optional(),
);

const participantShareSchema = z.object({
  userId: z.string().uuid(),
  exactAmountOriginal: optionalDecimalStringSchema,
  percentage: optionalDecimalStringSchema,
  shareUnits: optionalDecimalStringSchema,
});

const createExpenseProposalBaseSchema = z.object({
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
    fxRateStringSchema.optional(),
  ),
  participantUserIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  participantShares: z.array(participantShareSchema).min(1).max(20).optional(),
  fileIds: z.array(z.string().uuid()).max(10).optional(),
  splitMethod: z.enum(supportedSplitMethods).default("EQUAL"),
});

type SplitInputData = {
  participantUserIds?: string[];
  participantShares?: Array<z.infer<typeof participantShareSchema>>;
  splitMethod: (typeof supportedSplitMethods)[number];
};

function validateSplitInputs(data: SplitInputData, context: z.RefinementCtx) {
  const participantShares = data.participantShares ?? [];

  if (data.splitMethod === "EQUAL") {
    if ((data.participantUserIds?.length ?? 0) === 0 && participantShares.length === 0) {
      context.addIssue({
        code: "custom",
        message: "At least one debtor is required.",
        path: ["participantUserIds"],
      });
    }

    return;
  }

  if (participantShares.length === 0) {
    context.addIssue({
      code: "custom",
      message: "participantShares are required for this split method.",
      path: ["participantShares"],
    });

    return;
  }

  for (const [index, share] of participantShares.entries()) {
    const hasRequiredValue =
      (data.splitMethod === "EXACT" && share.exactAmountOriginal) ||
      (data.splitMethod === "PERCENTAGE" && share.percentage) ||
      (data.splitMethod === "SHARES" && share.shareUnits);

    if (!hasRequiredValue) {
      context.addIssue({
        code: "custom",
        message: `${data.splitMethod} split values are required for every debtor.`,
        path: ["participantShares", index],
      });
    }
  }
}

export const createExpenseProposalSchema =
  createExpenseProposalBaseSchema.superRefine(validateSplitInputs);

export const createTaskExpenseProposalSchema = createExpenseProposalBaseSchema
  .omit({
    description: true,
    title: true,
  })
  .extend({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .superRefine(validateSplitInputs);

export const createEventExpenseProposalSchema = createExpenseProposalBaseSchema
  .omit({
    description: true,
    dueDate: true,
    expenseDate: true,
    title: true,
  })
  .extend({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    expenseDate: dateOnlySchema.optional(),
    dueDate: dateOnlySchema.optional(),
  })
  .superRefine(validateSplitInputs);

export const listExpenseProposalQuerySchema = z.object({
  status: z.nativeEnum(ExpenseProposalStatus).optional(),
});

export const approveExpenseShareSchema = z.object({
  comment: z.string().trim().max(1000).optional(),
});

export const rejectExpenseShareSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const requestChangesExpenseShareSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const createExpenseProposalCommentSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  shareId: nullableUuidSchema,
});

export const reviseExpenseProposalSchema = createExpenseProposalBaseSchema
  .extend({
    revisionReason: z.string().trim().min(1).max(1000).optional(),
  })
  .superRefine(validateSplitInputs);

type CreateExpenseProposalData = z.infer<typeof createExpenseProposalSchema>;
type ReviseExpenseProposalData = z.infer<typeof reviseExpenseProposalSchema>;
type ExpenseCreatorMembership = Awaited<ReturnType<typeof requireExpenseProposalCreator>>;

type PreparedExpenseProposalCreate = {
  userId: string;
  householdId: string;
  data: CreateExpenseProposalData;
  household: ExpenseCreatorMembership["household"];
  debtorUserIds: string[];
  originalAmount: Decimal;
  originalCurrency: string;
  settlementAmount: Decimal;
  settlementCurrency: string;
  fxRate: Decimal;
  fxRateDate: Date;
  fxProvider: string;
  fxLockedAt: Date;
  expenseDate: Date;
  dueDate?: Date;
  fileIds: string[];
  revisionNumber?: number;
  supersedesProposalId?: string;
  shareRows: Array<{
    debtorUserId: string;
    creditorUserId: string;
    shareOriginalAmount: string;
    shareSettlementAmount: string;
    shareCurrency: string;
    settlementCurrency: string;
    percentage?: string;
    shareUnits?: string;
  }>;
  sourceTaskId?: string;
  sourceCalendarEventId?: string;
};

const expenseProposalDetailInclude = {
  category: true,
  payers: true,
  shares: true,
  approvals: {
    orderBy: {
      createdAt: "asc",
    },
  },
  comments: {
    orderBy: {
      createdAt: "asc",
    },
  },
  proposalFiles: {
    include: {
      file: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
} satisfies Prisma.ExpenseProposalInclude;

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalToFixed6(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

function decimalToFixed12(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(12, Decimal.ROUND_HALF_UP).toFixed(12);
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function assertCanParticipate(role: Role) {
  return role === Role.OWNER || role === Role.ADMIN || role === Role.MEMBER;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function assertUniqueDebtors(userIds: string[]) {
  if (uniqueValues(userIds).length !== userIds.length) {
    throw new ApiError(400, "DUPLICATE_PARTICIPANT", "Each debtor can appear only once.");
  }
}

function participantSharesForInput(data: CreateExpenseProposalData) {
  if (data.splitMethod === "EQUAL") {
    return (data.participantShares?.length ? data.participantShares : data.participantUserIds)!.map(
      (participant) =>
        typeof participant === "string"
          ? {
              userId: participant,
            }
          : participant,
    );
  }

  return data.participantShares!;
}

function assertAmountDoesNotExceedTotal({
  amount,
  total,
  code,
  message,
}: {
  amount: Decimal;
  total: Decimal;
  code: string;
  message: string;
}) {
  if (amount.gt(total)) {
    throw new ApiError(400, code, message, {
      total: total.toFixed(6),
      actual: amount.toFixed(6),
    });
  }
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

  if (shares.some((share) => share.status === ShareStatus.DISPUTED)) {
    return ExpenseProposalStatus.DISPUTED;
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
    status === ExpenseProposalStatus.DISPUTED ||
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
      proposalFiles: {
        include: {
          file: true,
        },
      },
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
    include: expenseProposalDetailInclude,
  });

  if (!proposal) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  return proposal;
}

async function prepareExpenseProposalCreate(
  userId: string,
  householdId: string,
  creatorMembership: ExpenseCreatorMembership,
  data: CreateExpenseProposalData,
  sourceTaskId?: string,
  revision?: {
    supersedesProposalId: string;
    revisionNumber: number;
  },
  sourceCalendarEventId?: string,
) {
  const household = creatorMembership.household;
  const participantShares = participantSharesForInput(data);
  const debtorUserIds = participantShares.map((participant) => participant.userId);

  assertUniqueDebtors(debtorUserIds);

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

  const fileIds = data.fileIds ?? [];

  await assertFilesReadyForProposal({
    userId,
    householdId,
    fileIds,
  });

  const debtorMemberships = await getParticipantMemberships(householdId, debtorUserIds);
  const originalAmount = new Decimal(data.originalAmount);
  const settlementCurrency = household.settlementCurrency;
  const originalCurrency = data.originalCurrency;
  const expenseDate = dateOnlyToUtc(data.expenseDate);
  const dueDate = data.dueDate ? dateOnlyToUtc(data.dueDate) : undefined;
  const fxLock = await resolveFxRateLock({
    baseCurrency: originalCurrency,
    quoteCurrency: settlementCurrency,
    date: expenseDate,
    manualRate: data.fxRate,
  });
  const fxRate = fxLock.rate;
  const settlementAmount = originalAmount.mul(fxRate);
  let shareRows: PreparedExpenseProposalCreate["shareRows"];

  if (data.splitMethod === "EQUAL") {
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

    shareRows = debtorMemberships.map((membership, index) => ({
      debtorUserId: membership.userId,
      creditorUserId: userId,
      shareOriginalAmount: originalSplit.shares[index]!,
      shareSettlementAmount: settlementSplit.shares[index]!,
      shareCurrency: originalCurrency,
      settlementCurrency,
    }));
  } else if (data.splitMethod === "EXACT") {
    const originalShares = participantShares.map(
      (participant) => new Decimal(participant.exactAmountOriginal!),
    );
    const originalShareTotal = originalShares.reduce(
      (sum, amount) => sum.plus(amount),
      new Decimal(0),
    );

    assertAmountDoesNotExceedTotal({
      amount: originalShareTotal,
      total: originalAmount,
      code: "SPLIT_TOTAL_EXCEEDS_AMOUNT",
      message: "Exact debtor shares cannot exceed the original amount.",
    });

    shareRows = debtorMemberships.map((membership, index) => {
      const shareOriginalAmount = originalShares[index]!;

      return {
        debtorUserId: membership.userId,
        creditorUserId: userId,
        shareOriginalAmount: decimalToFixed6(shareOriginalAmount),
        shareSettlementAmount: decimalToFixed6(shareOriginalAmount.mul(fxRate)),
        shareCurrency: originalCurrency,
        settlementCurrency,
      };
    });
  } else if (data.splitMethod === "PERCENTAGE") {
    const percentages = participantShares.map(
      (participant) => new Decimal(participant.percentage!),
    );
    const percentageTotal = percentages.reduce((sum, amount) => sum.plus(amount), new Decimal(0));

    assertAmountDoesNotExceedTotal({
      amount: percentageTotal,
      total: new Decimal(100),
      code: "PERCENTAGE_TOTAL_EXCEEDS_100",
      message: "Debtor percentages cannot exceed 100.",
    });

    const payerPercentage = new Decimal(100).minus(percentageTotal);
    const weights = [
      ...percentages.map((percentage) => decimalToFixed6(percentage)),
      payerPercentage.toFixed(6),
    ];
    const originalSplit = splitByWeights({
      amount: decimalToFixed6(originalAmount),
      weights,
      scale: 6,
    });
    const settlementSplit = splitByWeights({
      amount: decimalToFixed6(settlementAmount),
      weights,
      scale: 6,
    });

    shareRows = debtorMemberships.map((membership, index) => ({
      debtorUserId: membership.userId,
      creditorUserId: userId,
      shareOriginalAmount: originalSplit.shares[index]!,
      shareSettlementAmount: settlementSplit.shares[index]!,
      shareCurrency: originalCurrency,
      settlementCurrency,
      percentage: decimalToFixed6(percentages[index]!),
    }));
  } else {
    const debtorUnits = participantShares.map(
      (participant) => new Decimal(participant.shareUnits!),
    );
    const weights = [...debtorUnits.map((unit) => decimalToFixed6(unit)), "1.000000"];
    const originalSplit = splitByWeights({
      amount: decimalToFixed6(originalAmount),
      weights,
      scale: 6,
    });
    const settlementSplit = splitByWeights({
      amount: decimalToFixed6(settlementAmount),
      weights,
      scale: 6,
    });

    shareRows = debtorMemberships.map((membership, index) => ({
      debtorUserId: membership.userId,
      creditorUserId: userId,
      shareOriginalAmount: originalSplit.shares[index]!,
      shareSettlementAmount: settlementSplit.shares[index]!,
      shareCurrency: originalCurrency,
      settlementCurrency,
      shareUnits: decimalToFixed6(debtorUnits[index]!),
    }));
  }
  return {
    userId,
    householdId,
    data,
    household,
    debtorUserIds,
    originalAmount,
    originalCurrency,
    settlementAmount,
    settlementCurrency,
    fxRate,
    fxRateDate: fxLock.rateDate,
    fxProvider: fxLock.provider,
    fxLockedAt: fxLock.lockedAt,
    expenseDate,
    dueDate,
    fileIds,
    revisionNumber: revision?.revisionNumber,
    supersedesProposalId: revision?.supersedesProposalId,
    shareRows,
    sourceTaskId,
    sourceCalendarEventId,
  };
}

async function createExpenseProposalRecord(
  tx: Prisma.TransactionClient,
  prepared: PreparedExpenseProposalCreate,
) {
  const proposal = await tx.expenseProposal.create({
    data: {
      householdId: prepared.householdId,
      createdByUserId: prepared.userId,
      title: prepared.data.title,
      description: prepared.data.description,
      merchant: prepared.data.merchant,
      categoryId: prepared.data.categoryId,
      expenseDate: prepared.expenseDate,
      dueDate: prepared.dueDate,
      originalAmount: decimalToFixed6(prepared.originalAmount),
      originalCurrency: prepared.originalCurrency,
      settlementCurrency: prepared.settlementCurrency,
      settlementAmount: decimalToFixed6(prepared.settlementAmount),
      splitMethod: prepared.data.splitMethod as SplitMethod,
      fxPolicy: prepared.household.fxPolicy,
      fxRate: decimalToFixed12(prepared.fxRate),
      fxRateDate: prepared.fxRateDate,
      fxProvider: prepared.fxProvider,
      fxLockedAt: prepared.fxLockedAt,
      status: ExpenseProposalStatus.SUBMITTED,
      revisionNumber: prepared.revisionNumber ?? 1,
      supersedesProposalId: prepared.supersedesProposalId,
      payers: {
        create: [
          {
            userId: prepared.userId,
            amountOriginal: decimalToFixed6(prepared.originalAmount),
            amountSettlement: decimalToFixed6(prepared.settlementAmount),
            isPrimary: true,
          },
        ],
      },
      shares: {
        create: prepared.shareRows,
      },
    },
    include: {
      category: true,
      payers: true,
      shares: true,
    },
  });

  if (prepared.fileIds.length > 0) {
    await tx.proposalFile.createMany({
      data: prepared.fileIds.map((fileId) => ({
        proposalId: proposal.id,
        fileId,
        purpose: "receipt",
        createdByUserId: prepared.userId,
      })),
    });
  }

  await tx.auditEvent.create({
    data: {
      householdId: prepared.householdId,
      actorUserId: prepared.userId,
      action: "expense_proposal.submitted",
      entityType: "ExpenseProposal",
      entityId: proposal.id,
      after: {
        title: proposal.title,
        status: proposal.status,
        originalAmount: proposal.originalAmount.toString(),
        originalCurrency: prepared.originalCurrency,
        settlementAmount: proposal.settlementAmount.toString(),
        settlementCurrency: prepared.settlementCurrency,
        fxRate: decimalToFixed12(prepared.fxRate),
        fxRateDate: prepared.fxRateDate.toISOString().slice(0, 10),
        fxProvider: prepared.fxProvider,
        splitMethod: proposal.splitMethod,
        shareStatus: ShareStatus.PENDING,
        debtorUserIds: prepared.debtorUserIds,
        fileIds: prepared.fileIds,
        revisionNumber: prepared.revisionNumber ?? 1,
        supersedesProposalId: prepared.supersedesProposalId ?? null,
        sourceTaskId: prepared.sourceTaskId ?? null,
        sourceCalendarEventId: prepared.sourceCalendarEventId ?? null,
      },
    },
  });

  await createExpenseProposalAssignedNotifications(tx, {
    householdId: prepared.householdId,
    proposalId: proposal.id,
    proposalTitle: proposal.title,
    actorUserId: prepared.userId,
    shares: proposal.shares.map((share) => ({
      debtorUserId: share.debtorUserId,
      shareSettlementAmount: share.shareSettlementAmount,
      settlementCurrency: share.settlementCurrency,
    })),
  });

  return tx.expenseProposal.findUniqueOrThrow({
    where: {
      id: proposal.id,
    },
    include: expenseProposalDetailInclude,
  });
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

  const prepared = await prepareExpenseProposalCreate(
    userId,
    householdId,
    creatorMembership,
    parsed.data,
  );

  return prisma.$transaction((tx) => createExpenseProposalRecord(tx, prepared));
}

export async function createExpenseProposalCommentForHousehold(
  userId: string,
  householdId: string,
  proposalId: string,
  input: unknown,
) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!assertCanParticipate(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot comment on expense proposals.");
  }

  const parsed = createExpenseProposalCommentSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense proposal comment input is invalid.", parsed.error.flatten());
  }

  const proposal = await prisma.expenseProposal.findFirst({
    where: {
      id: proposalId,
      householdId,
    },
    include: {
      shares: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!proposal) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  if (parsed.data.shareId && !proposal.shares.some((share) => share.id === parsed.data.shareId)) {
    throw new ApiError(400, "INVALID_SHARE", "Comment shareId must belong to the proposal.");
  }

  return prisma.$transaction(async (tx) => {
    const comment = await tx.proposalComment.create({
      data: {
        proposalId,
        shareId: parsed.data.shareId,
        authorUserId: userId,
        body: parsed.data.body,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_proposal.commented",
        entityType: "ProposalComment",
        entityId: comment.id,
        after: {
          proposalId,
          shareId: parsed.data.shareId ?? null,
        },
      },
    });

    return tx.expenseProposal.findUniqueOrThrow({
      where: {
        id: proposalId,
      },
      include: expenseProposalDetailInclude,
    });
  });
}

export async function createExpenseProposalFromTaskForHousehold(
  userId: string,
  householdId: string,
  taskId: string,
  input: unknown,
) {
  const creatorMembership = await requireExpenseProposalCreator(userId, householdId);
  const parsed = createTaskExpenseProposalSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Task expense proposal input is invalid.", parsed.error.flatten());
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      householdId,
    },
    include: {
      assignments: true,
      expenseProposalLinks: {
        select: {
          proposalId: true,
        },
      },
    },
  });

  if (!task) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  const isManager = creatorMembership.role === Role.OWNER || creatorMembership.role === Role.ADMIN;
  const isTaskParticipant =
    task.createdByUserId === userId ||
    task.assignments.some((assignment) => assignment.assignedUserId === userId);

  if (!isManager && !isTaskParticipant) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Members can create expense proposals only for tasks they created or are assigned to.",
    );
  }

  if (task.expenseProposalLinks.length > 0) {
    throw new ApiError(
      409,
      "TASK_EXPENSE_PROPOSAL_EXISTS",
      "This task already has a linked expense proposal.",
      {
        proposalId: task.expenseProposalLinks[0]?.proposalId,
      },
    );
  }

  const taskDate = task.dueAt?.toISOString().slice(0, 10);
  const data = {
    ...parsed.data,
    description: parsed.data.description ?? task.description ?? undefined,
    dueDate: parsed.data.dueDate ?? taskDate,
    title: parsed.data.title ?? task.title,
  };
  const prepared = await prepareExpenseProposalCreate(
    userId,
    householdId,
    creatorMembership,
    data,
    task.id,
  );

  try {
    return await prisma.$transaction(async (tx) => {
      const existingLink = await tx.taskExpenseProposalLink.findUnique({
        where: {
          taskId,
        },
      });

      if (existingLink) {
        throw new ApiError(
          409,
          "TASK_EXPENSE_PROPOSAL_EXISTS",
          "This task already has a linked expense proposal.",
          {
            proposalId: existingLink.proposalId,
          },
        );
      }

      const proposal = await createExpenseProposalRecord(tx, prepared);
      const link = await tx.taskExpenseProposalLink.create({
        data: {
          taskId,
          proposalId: proposal.id,
          createdByUserId: userId,
        },
      });
      const linkedTaskEvents = await tx.eventLink.findMany({
        where: {
          linkedType: "task",
          linkedId: taskId,
        },
      });

      if (linkedTaskEvents.length > 0) {
        await tx.eventLink.createMany({
          data: linkedTaskEvents.map((eventLink) => ({
            eventId: eventLink.eventId,
            linkedType: "expense_proposal",
            linkedId: proposal.id,
          })),
        });
      }

      await tx.auditEvent.create({
        data: {
          householdId,
          actorUserId: userId,
          action: "task.expense_proposal_created",
          entityType: "TaskExpenseProposalLink",
          entityId: link.id,
          after: {
            taskId,
            proposalId: proposal.id,
            linkedEventIds: linkedTaskEvents.map((eventLink) => eventLink.eventId),
          },
        },
      });

      return proposal;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(
        409,
        "TASK_EXPENSE_PROPOSAL_EXISTS",
        "This task already has a linked expense proposal.",
      );
    }

    throw error;
  }
}

export async function createExpenseProposalFromCalendarEventForHousehold(
  userId: string,
  householdId: string,
  eventId: string,
  input: unknown,
) {
  const creatorMembership = await requireExpenseProposalCreator(userId, householdId);
  const parsed = createEventExpenseProposalSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError(
      "Calendar event expense proposal input is invalid.",
      parsed.error.flatten(),
    );
  }

  const calendarEvent = await prisma.calendarEvent.findFirst({
    where: {
      id: eventId,
      householdId,
    },
  });

  if (!calendarEvent) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  if (!expenseProposalEventTypes.has(calendarEvent.type)) {
    throw new ApiError(
      400,
      "EVENT_EXPENSE_PROPOSAL_NOT_SUPPORTED",
      "Only bill, chore, group activity, or recurring expense events can create expense proposals.",
      { eventType: calendarEvent.type },
    );
  }

  const existingProposalLink = await prisma.eventLink.findFirst({
    where: {
      eventId,
      linkedType: "expense_proposal",
    },
  });

  if (existingProposalLink) {
    throw new ApiError(
      409,
      "EVENT_EXPENSE_PROPOSAL_EXISTS",
      "This calendar event already has a linked expense proposal.",
      {
        proposalId: existingProposalLink.linkedId,
      },
    );
  }

  const eventDate = calendarEvent.startAt.toISOString().slice(0, 10);
  const data: CreateExpenseProposalData = {
    ...parsed.data,
    description: parsed.data.description ?? calendarEvent.description ?? undefined,
    dueDate: parsed.data.dueDate ?? eventDate,
    expenseDate: parsed.data.expenseDate ?? eventDate,
    title: parsed.data.title ?? calendarEvent.title,
  };
  const prepared = await prepareExpenseProposalCreate(
    userId,
    householdId,
    creatorMembership,
    data,
    undefined,
    undefined,
    calendarEvent.id,
  );

  return prisma.$transaction(async (tx) => {
    const existingLink = await tx.eventLink.findFirst({
      where: {
        eventId,
        linkedType: "expense_proposal",
      },
    });

    if (existingLink) {
      throw new ApiError(
        409,
        "EVENT_EXPENSE_PROPOSAL_EXISTS",
        "This calendar event already has a linked expense proposal.",
        {
          proposalId: existingLink.linkedId,
        },
      );
    }

    const proposal = await createExpenseProposalRecord(tx, prepared);
    const link = await tx.eventLink.create({
      data: {
        eventId,
        linkedType: "expense_proposal",
        linkedId: proposal.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "calendar_event.expense_proposal_created",
        entityType: "EventLink",
        entityId: link.id,
        after: {
          eventId,
          proposalId: proposal.id,
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
        include: expenseProposalDetailInclude,
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
    const ledgerOccurredAt = new Date();
    await assertLedgerPeriodOpen(tx, householdId, ledgerOccurredAt);

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
          occurredAt: ledgerOccurredAt,
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
      let repaymentEventId: string | null = null;

      if (share.proposal.dueDate) {
        const repaymentEvent = await tx.calendarEvent.create({
          data: {
            householdId,
            type: CalendarEventType.REPAYMENT_DUE,
            title: `Repayment due: ${share.proposal.title}`,
            description: `${obligation.settlementCurrency} ${obligation.remainingAmount.toString()} due for approved share.`,
            startAt: share.proposal.dueDate,
            allDay: true,
            timezone: membership.household.timezone,
            createdByUserId: userId,
          },
        });

        await tx.eventLink.create({
          data: {
            eventId: repaymentEvent.id,
            linkedType: "debt_obligation",
            linkedId: obligation.id,
          },
        });
        repaymentEventId = repaymentEvent.id;
      }

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
            repaymentEventId,
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
        ...expenseProposalDetailInclude,
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
        include: expenseProposalDetailInclude,
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
        ...expenseProposalDetailInclude,
      },
    });
  });
}

export async function requestChangesExpenseShareForHousehold(
  userId: string,
  householdId: string,
  shareId: string,
  input: unknown,
) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!assertCanParticipate(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot request expense share changes.");
  }

  const parsed = requestChangesExpenseShareSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense share change request input is invalid.", parsed.error.flatten());
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
      throw new ApiError(403, "FORBIDDEN", "Users can only request changes for their own shares.");
    }

    if (share.status === ShareStatus.DISPUTED) {
      return tx.expenseProposal.findUniqueOrThrow({
        where: { id: share.proposalId },
        include: expenseProposalDetailInclude,
      });
    }

    assertProposalCanReceiveShareDecision(share.proposal.status);

    if (share.status !== ShareStatus.PENDING) {
      throw new ApiError(409, "SHARE_NOT_ACTIONABLE", "Only pending shares can request changes.");
    }

    await tx.proposalApproval.create({
      data: {
        proposalId: share.proposalId,
        shareId: share.id,
        approverUserId: userId,
        decision: ApprovalDecision.REQUEST_CHANGES,
        comment: parsed.data.reason,
      },
    });

    await tx.expenseShare.update({
      where: { id: share.id },
      data: {
        status: ShareStatus.DISPUTED,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_share.changes_requested",
        entityType: "ExpenseShare",
        entityId: share.id,
        after: {
          proposalId: share.proposalId,
          debtorUserId: share.debtorUserId,
          creditorUserId: share.creditorUserId,
          status: ShareStatus.DISPUTED,
          reason: parsed.data.reason,
        },
      },
    });

    return tx.expenseProposal.update({
      where: { id: share.proposalId },
      data: {
        status: ExpenseProposalStatus.DISPUTED,
      },
      include: {
        ...expenseProposalDetailInclude,
      },
    });
  });
}

export async function reviseExpenseProposalForHousehold(
  userId: string,
  householdId: string,
  proposalId: string,
  input: unknown,
) {
  const creatorMembership = await requireExpenseProposalCreator(userId, householdId);
  const parsed = reviseExpenseProposalSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense proposal revision input is invalid.", parsed.error.flatten());
  }

  const existingProposal = await prisma.expenseProposal.findFirst({
    where: {
      id: proposalId,
      householdId,
    },
    include: {
      shares: true,
      proposalFiles: true,
      taskLinks: true,
    },
  });

  if (!existingProposal) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  if (existingProposal.createdByUserId !== userId) {
    throw new ApiError(403, "FORBIDDEN", "Only the original proposal creator can revise it.");
  }

  if (
    existingProposal.status !== ExpenseProposalStatus.DISPUTED &&
    existingProposal.status !== ExpenseProposalStatus.REJECTED
  ) {
    throw new ApiError(
      409,
      "PROPOSAL_NOT_REVISIONABLE",
      "Only disputed or rejected proposals can be revised.",
    );
  }

  if (
    existingProposal.shares.some(
      (share) => share.status === ShareStatus.MATURED_TO_LEDGER || share.ledgerObligationId,
    )
  ) {
    throw new ApiError(
      409,
      "PROPOSAL_LEDGER_IMMUTABLE",
      "Proposals with ledger obligations cannot be revised.",
    );
  }

  const revisionData: ReviseExpenseProposalData = {
    ...parsed.data,
    fileIds: parsed.data.fileIds ?? existingProposal.proposalFiles.map((file) => file.fileId),
  };
  const prepared = await prepareExpenseProposalCreate(
    userId,
    householdId,
    creatorMembership,
    revisionData,
    undefined,
    {
      supersedesProposalId: existingProposal.id,
      revisionNumber: existingProposal.revisionNumber + 1,
    },
  );

  return prisma.$transaction(async (tx) => {
    const alreadyRevised = await tx.expenseProposal.findFirst({
      where: {
        householdId,
        supersedesProposalId: existingProposal.id,
      },
      select: {
        id: true,
      },
    });

    if (alreadyRevised) {
      throw new ApiError(
        409,
        "PROPOSAL_ALREADY_REVISED",
        "This proposal already has a newer revision.",
        { proposalId: alreadyRevised.id },
      );
    }

    const revision = await createExpenseProposalRecord(tx, prepared);

    await tx.expenseProposal.update({
      where: {
        id: existingProposal.id,
      },
      data: {
        status: ExpenseProposalStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    if (existingProposal.taskLinks.length > 0) {
      await tx.taskExpenseProposalLink.updateMany({
        where: {
          proposalId: existingProposal.id,
        },
        data: {
          proposalId: revision.id,
        },
      });
    }

    await tx.eventLink.updateMany({
      where: {
        linkedType: "expense_proposal",
        linkedId: existingProposal.id,
      },
      data: {
        linkedId: revision.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_proposal.revised",
        entityType: "ExpenseProposal",
        entityId: revision.id,
        before: {
          proposalId: existingProposal.id,
          status: existingProposal.status,
          revisionNumber: existingProposal.revisionNumber,
        },
        after: {
          proposalId: revision.id,
          status: revision.status,
          revisionNumber: revision.revisionNumber,
          supersedesProposalId: existingProposal.id,
          reason: parsed.data.revisionReason ?? null,
        },
      },
    });

    return revision;
  });
}

export type ExpenseProposalWithRelations = Awaited<
  ReturnType<typeof listExpenseProposalsForHousehold>
>[number];

export type ExpenseProposalDetail = Awaited<ReturnType<typeof getExpenseProposalForUser>>;
export type ExpenseCategorySummary = Awaited<
  ReturnType<typeof listExpenseCategoriesForHousehold>
>[number];
