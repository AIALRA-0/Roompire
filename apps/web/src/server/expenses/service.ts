import Decimal from "decimal.js";
import {
  ApprovalDecision,
  CalendarEventType,
  type ExpenseProposal,
  ExpenseProposalStatus,
  FxPolicy,
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
import { dispatchWebPushForNotifications } from "@/server/notifications/push";
import { paginateRows, paginationQueryFields } from "@/server/pagination";
import {
  requireActiveMembership,
  requireExpenseProposalCreator,
  requireHouseholdSettingsManager,
} from "@/server/permissions/rbac";

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
const emptyToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : value;
const emptyTrimmedToUndefined = (value: unknown) =>
  typeof value === "string" ? (value.trim() === "" ? undefined : value) : emptyToUndefined(value);

const nullableUuidSchema = z.preprocess(emptyToUndefined, z.string().uuid().optional());

const optionalCategoryTextSchema = z.preprocess(
  emptyTrimmedToUndefined,
  z.string().trim().max(80).optional(),
);

const optionalDecimalStringSchema = z.preprocess(
  emptyTrimmedToUndefined,
  decimalStringSchema.optional(),
);

const nonNegativeDecimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((value) => new Decimal(value).gte(0), "Amount must be zero or greater.");

const optionalAmountFilterSchema = z.preprocess(
  emptyTrimmedToUndefined,
  nonNegativeDecimalStringSchema.optional(),
);

const optionalDateOnlySchema = z.preprocess(emptyToUndefined, dateOnlySchema.optional());

const optionalQueryTextSchema = z.preprocess(
  emptyTrimmedToUndefined,
  z.string().trim().min(1).max(120).optional(),
);

const participantShareSchema = z.object({
  userId: z.string().uuid(),
  exactAmountOriginal: optionalDecimalStringSchema,
  percentage: optionalDecimalStringSchema,
  shareUnits: optionalDecimalStringSchema,
});

const tagIdsSchema = z.array(z.string().uuid()).max(12).optional();

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
  tagIds: tagIdsSchema,
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

export const listExpenseProposalQuerySchema = z
  .object({
    q: optionalQueryTextSchema,
    status: z.preprocess(emptyToUndefined, z.nativeEnum(ExpenseProposalStatus).optional()),
    categoryId: nullableUuidSchema,
    tagId: nullableUuidSchema,
    memberUserId: nullableUuidSchema,
    from: optionalDateOnlySchema,
    to: optionalDateOnlySchema,
    minAmount: optionalAmountFilterSchema,
    maxAmount: optionalAmountFilterSchema,
    ...paginationQueryFields(20),
  })
  .superRefine((data, context) => {
    if (data.from && data.to && data.from > data.to) {
      context.addIssue({
        code: "custom",
        message: "from must be on or before to.",
        path: ["from"],
      });
    }

    if (data.minAmount && data.maxAmount && new Decimal(data.minAmount).gt(data.maxAmount)) {
      context.addIssue({
        code: "custom",
        message: "minAmount must be less than or equal to maxAmount.",
        path: ["minAmount"],
      });
    }
  });

type ListExpenseProposalQuery = z.infer<typeof listExpenseProposalQuerySchema>;

const expenseCategoryInputSchema = z.object({
  nameEn: z.string().trim().min(2).max(80),
  nameZhCn: z.string().trim().min(1).max(80),
  icon: optionalCategoryTextSchema,
  colorToken: optionalCategoryTextSchema,
  sortOrder: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(0).max(10_000).optional(),
  ),
});

const expenseTagInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  colorToken: optionalCategoryTextSchema,
  sortOrder: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(0).max(10_000).optional(),
  ),
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
  tagIds: string[];
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
  household: {
    select: {
      approvalPolicy: true,
    },
  },
  category: true,
  tagLinks: {
    include: {
      tag: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
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

const expenseProposalOrderBy = [
  { updatedAt: "desc" as const },
  { createdAt: "desc" as const },
  { id: "asc" as const },
] satisfies Prisma.ExpenseProposalOrderByWithRelationInput[];

async function assertExpenseFilterMemberBelongsToHousehold(userId: string, householdId: string) {
  const membership = await prisma.householdMembership.findFirst({
    where: {
      householdId,
      userId,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (!membership) {
    throw validationError("Expense proposal query is invalid.", {
      fieldErrors: {
        memberUserId: ["Member must be active in this household."],
      },
    });
  }
}

function buildAmountRangeFilter(query: Pick<ListExpenseProposalQuery, "minAmount" | "maxAmount">) {
  if (!query.minAmount && !query.maxAmount) {
    return undefined;
  }

  return {
    gte: query.minAmount,
    lte: query.maxAmount,
  } satisfies Prisma.DecimalFilter<"ExpenseProposal">;
}

function buildExpenseProposalBaseWhere(
  householdId: string,
  query: Pick<
    ListExpenseProposalQuery,
    | "q"
    | "status"
    | "categoryId"
    | "tagId"
    | "memberUserId"
    | "from"
    | "to"
    | "minAmount"
    | "maxAmount"
  >,
) {
  const andFilters: Prisma.ExpenseProposalWhereInput[] = [];
  const amountFilter = buildAmountRangeFilter(query);

  if (query.q) {
    andFilters.push({
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        { merchant: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  if (query.tagId) {
    andFilters.push({
      tagLinks: {
        some: {
          tagId: query.tagId,
        },
      },
    });
  }

  if (query.memberUserId) {
    andFilters.push({
      OR: [
        { createdByUserId: query.memberUserId },
        {
          payers: {
            some: {
              userId: query.memberUserId,
            },
          },
        },
        {
          shares: {
            some: {
              OR: [{ debtorUserId: query.memberUserId }, { creditorUserId: query.memberUserId }],
            },
          },
        },
      ],
    });
  }

  if (amountFilter) {
    andFilters.push({
      OR: [{ originalAmount: amountFilter }, { settlementAmount: amountFilter }],
    });
  }

  return {
    householdId,
    status: query.status,
    categoryId: query.categoryId,
    expenseDate:
      query.from || query.to
        ? {
            gte: query.from ? dateOnlyToUtc(query.from) : undefined,
            lte: query.to ? dateOnlyToUtc(query.to) : undefined,
          }
        : undefined,
    AND: andFilters.length > 0 ? andFilters : undefined,
  } satisfies Prisma.ExpenseProposalWhereInput;
}

function buildExpenseProposalWhere(
  householdId: string,
  query: Parameters<typeof buildExpenseProposalBaseWhere>[1],
  cursorProposal?: Pick<ExpenseProposal, "id" | "updatedAt" | "createdAt">,
) {
  const cursorWindow: Prisma.ExpenseProposalWhereInput | undefined = cursorProposal
    ? {
        OR: [
          {
            updatedAt: {
              lt: cursorProposal.updatedAt,
            },
          },
          {
            updatedAt: cursorProposal.updatedAt,
            createdAt: {
              lt: cursorProposal.createdAt,
            },
          },
          {
            updatedAt: cursorProposal.updatedAt,
            createdAt: cursorProposal.createdAt,
            id: {
              gt: cursorProposal.id,
            },
          },
        ],
      }
    : undefined;
  const baseWhere = buildExpenseProposalBaseWhere(householdId, query);
  const baseAnd = Array.isArray(baseWhere.AND)
    ? baseWhere.AND
    : baseWhere.AND
      ? [baseWhere.AND]
      : [];

  return {
    ...baseWhere,
    AND: cursorWindow ? [...baseAnd, cursorWindow] : baseWhere.AND,
  } satisfies Prisma.ExpenseProposalWhereInput;
}

async function resolveExpenseProposalCursor(
  householdId: string,
  query: Parameters<typeof buildExpenseProposalBaseWhere>[1],
  cursor: string | undefined,
) {
  if (!cursor) {
    return undefined;
  }

  const cursorProposal = await prisma.expenseProposal.findFirst({
    where: {
      ...buildExpenseProposalBaseWhere(householdId, query),
      id: cursor,
    },
    select: { id: true, householdId: true, updatedAt: true, createdAt: true },
  });

  if (!cursorProposal) {
    throw validationError("Expense proposal query is invalid.", {
      fieldErrors: {
        cursor: ["Invalid cursor."],
      },
    });
  }

  return cursorProposal;
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

type ApprovalPolicy = "PAYER_AND_EACH_DEBTOR" | "ALL_PARTICIPANTS" | "PAYER_ONLY";

function approvalPolicyForProposal(proposal: {
  household?: { approvalPolicy: string } | null;
}): ApprovalPolicy {
  const approvalPolicy = proposal.household?.approvalPolicy;

  if (
    approvalPolicy === "ALL_PARTICIPANTS" ||
    approvalPolicy === "PAYER_ONLY" ||
    approvalPolicy === "PAYER_AND_EACH_DEBTOR"
  ) {
    return approvalPolicy;
  }

  return "PAYER_AND_EACH_DEBTOR";
}

function isPrimaryPayer(
  proposal: { payers: Array<{ userId: string; isPrimary: boolean }> },
  userId: string,
) {
  return proposal.payers.some((payer) => payer.userId === userId && payer.isPrimary);
}

type ShareForMaturity = Prisma.ExpenseShareGetPayload<{
  include: {
    proposal: {
      select: {
        dueDate: true;
        title: true;
      };
    };
  };
}>;

async function matureApprovedShare(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    householdId: string;
    ledgerOccurredAt: Date;
    share: ShareForMaturity;
    timezone: string;
  },
) {
  const existingObligation = await tx.debtObligation.findUnique({
    where: {
      sourceShareId: input.share.id,
    },
  });

  if (existingObligation) {
    await tx.expenseShare.update({
      where: { id: input.share.id },
      data: {
        status: ShareStatus.MATURED_TO_LEDGER,
        ledgerObligationId: existingObligation.id,
      },
    });
    return;
  }

  const ledgerTransaction = await tx.ledgerTransaction.create({
    data: {
      householdId: input.householdId,
      type: LedgerTransactionType.DEBT_CREATED,
      description: input.share.proposal.title,
      sourceType: "ExpenseShare",
      sourceId: input.share.id,
      createdByUserId: input.actorUserId,
      occurredAt: input.ledgerOccurredAt,
    },
  });

  const obligation = await tx.debtObligation.create({
    data: {
      householdId: input.householdId,
      ledgerTransactionId: ledgerTransaction.id,
      sourceShareId: input.share.id,
      debtorUserId: input.share.debtorUserId,
      creditorUserId: input.share.creditorUserId,
      originalAmount: input.share.shareOriginalAmount,
      originalCurrency: input.share.shareCurrency,
      settlementAmount: input.share.shareSettlementAmount,
      settlementCurrency: input.share.settlementCurrency,
      remainingAmount: input.share.shareSettlementAmount,
      dueDate: input.share.proposal.dueDate,
    },
  });
  let repaymentEventId: string | null = null;

  if (input.share.proposal.dueDate) {
    const repaymentEvent = await tx.calendarEvent.create({
      data: {
        householdId: input.householdId,
        type: CalendarEventType.REPAYMENT_DUE,
        title: `Repayment due: ${input.share.proposal.title}`,
        description: `${obligation.settlementCurrency} ${obligation.remainingAmount.toString()} due for approved share.`,
        startAt: input.share.proposal.dueDate,
        allDay: true,
        timezone: input.timezone,
        createdByUserId: input.actorUserId,
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
    where: { id: input.share.id },
    data: {
      status: ShareStatus.MATURED_TO_LEDGER,
      ledgerObligationId: obligation.id,
    },
  });

  await tx.auditEvent.create({
    data: {
      householdId: input.householdId,
      actorUserId: input.actorUserId,
      action: "expense_share.matured_to_ledger",
      entityType: "DebtObligation",
      entityId: obligation.id,
      after: {
        proposalId: input.share.proposalId,
        shareId: input.share.id,
        ledgerTransactionId: ledgerTransaction.id,
        debtorUserId: input.share.debtorUserId,
        creditorUserId: input.share.creditorUserId,
        settlementAmount: obligation.settlementAmount.toString(),
        settlementCurrency: obligation.settlementCurrency,
        repaymentEventId,
      },
    },
  });
}

async function resolveHouseholdFxRateLock(input: {
  baseCurrency: string;
  quoteCurrency: string;
  date: Date;
  manualRate?: Decimal.Value | null;
  policy: FxPolicy;
}) {
  if (input.baseCurrency === input.quoteCurrency) {
    return resolveFxRateLock(input);
  }

  if (input.policy === FxPolicy.MANUAL_RATE_WITH_APPROVAL && !input.manualRate) {
    throw new ApiError(
      400,
      "FX_MANUAL_RATE_REQUIRED",
      "This household requires a manual FX rate for cross-currency proposals.",
    );
  }

  if (
    input.policy === FxPolicy.ORIGINAL_CURRENCY_DEBT ||
    input.policy === FxPolicy.FX_DIFFERENCE_ADJUSTMENT
  ) {
    throw new ApiError(
      409,
      "FX_POLICY_NOT_SUPPORTED",
      "This household FX policy is not supported for proposal creation yet.",
      { fxPolicy: input.policy },
    );
  }

  return resolveFxRateLock(input);
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

async function assertTagsBelongToHousehold(tagIds: string[], householdId: string) {
  if (tagIds.length === 0) {
    return [];
  }

  const uniqueTagIds = uniqueValues(tagIds);

  if (uniqueTagIds.length !== tagIds.length) {
    throw new ApiError(400, "DUPLICATE_TAG", "Each tag can be selected only once.");
  }

  const tags = await prisma.expenseTag.findMany({
    where: {
      id: {
        in: uniqueTagIds,
      },
      householdId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  if (tags.length !== uniqueTagIds.length) {
    throw new ApiError(400, "INVALID_TAG", "Every tag must be active in this household.");
  }

  return uniqueTagIds;
}

function categoryKeyBase(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return base || "category";
}

async function nextCategorySortOrder(tx: Prisma.TransactionClient, householdId: string) {
  const lastCategory = await tx.expenseCategory.findFirst({
    where: { householdId },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: { sortOrder: true },
  });

  return (lastCategory?.sortOrder ?? -1) + 1;
}

async function nextTagSortOrder(tx: Prisma.TransactionClient, householdId: string) {
  const lastTag = await tx.expenseTag.findFirst({
    where: { householdId },
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: { sortOrder: true },
  });

  return (lastTag?.sortOrder ?? -1) + 1;
}

async function uniqueCategoryKey(
  tx: Prisma.TransactionClient,
  householdId: string,
  nameEn: string,
) {
  const base = categoryKeyBase(nameEn);
  let candidate = base;
  let suffix = 2;

  while (
    await tx.expenseCategory.findUnique({
      where: {
        householdId_key: {
          householdId,
          key: candidate,
        },
      },
      select: { id: true },
    })
  ) {
    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, 64 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  return candidate;
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

export async function listExpenseTagsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.expenseTag.findMany({
    where: {
      householdId,
      isActive: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createExpenseCategoryForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  await requireHouseholdSettingsManager(userId, householdId);
  const parsed = expenseCategoryInputSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense category input is invalid.", parsed.error.flatten());
  }

  const result = await prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.create({
      data: {
        householdId,
        key: await uniqueCategoryKey(tx, householdId, parsed.data.nameEn),
        nameEn: parsed.data.nameEn,
        nameZhCn: parsed.data.nameZhCn,
        icon: parsed.data.icon,
        colorToken: parsed.data.colorToken,
        sortOrder: parsed.data.sortOrder ?? (await nextCategorySortOrder(tx, householdId)),
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_category.created",
        entityType: "ExpenseCategory",
        entityId: category.id,
        after: {
          key: category.key,
          nameEn: category.nameEn,
          nameZhCn: category.nameZhCn,
          icon: category.icon,
          colorToken: category.colorToken,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        },
      },
    });

    return category;
  });

  return result;
}

export async function updateExpenseCategoryForHousehold(
  userId: string,
  householdId: string,
  categoryId: string,
  input: unknown,
) {
  await requireHouseholdSettingsManager(userId, householdId);
  const parsed = expenseCategoryInputSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense category input is invalid.", parsed.error.flatten());
  }

  const previous = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, householdId, isActive: true },
  });

  if (!previous) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.update({
      where: { id: categoryId },
      data: {
        nameEn: parsed.data.nameEn,
        nameZhCn: parsed.data.nameZhCn,
        icon: parsed.data.icon,
        colorToken: parsed.data.colorToken,
        sortOrder: parsed.data.sortOrder ?? previous.sortOrder,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_category.updated",
        entityType: "ExpenseCategory",
        entityId: category.id,
        before: {
          key: previous.key,
          nameEn: previous.nameEn,
          nameZhCn: previous.nameZhCn,
          icon: previous.icon,
          colorToken: previous.colorToken,
          sortOrder: previous.sortOrder,
          isActive: previous.isActive,
        },
        after: {
          key: category.key,
          nameEn: category.nameEn,
          nameZhCn: category.nameZhCn,
          icon: category.icon,
          colorToken: category.colorToken,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        },
      },
    });

    return category;
  });

  return result;
}

export async function archiveExpenseCategoryForHousehold(
  userId: string,
  householdId: string,
  categoryId: string,
) {
  await requireHouseholdSettingsManager(userId, householdId);
  const previous = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, householdId, isActive: true },
  });

  if (!previous) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const category = await tx.expenseCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_category.archived",
        entityType: "ExpenseCategory",
        entityId: category.id,
        before: {
          key: previous.key,
          nameEn: previous.nameEn,
          nameZhCn: previous.nameZhCn,
          sortOrder: previous.sortOrder,
          isActive: previous.isActive,
        },
        after: {
          key: category.key,
          nameEn: category.nameEn,
          nameZhCn: category.nameZhCn,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        },
      },
    });

    return category;
  });

  return result;
}

export async function createExpenseTagForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  await requireHouseholdSettingsManager(userId, householdId);
  const parsed = expenseTagInputSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense tag input is invalid.", parsed.error.flatten());
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const tag = await tx.expenseTag.create({
        data: {
          householdId,
          name: parsed.data.name,
          colorToken: parsed.data.colorToken,
          sortOrder: parsed.data.sortOrder ?? (await nextTagSortOrder(tx, householdId)),
        },
      });

      await tx.auditEvent.create({
        data: {
          householdId,
          actorUserId: userId,
          action: "expense_tag.created",
          entityType: "ExpenseTag",
          entityId: tag.id,
          after: {
            name: tag.name,
            colorToken: tag.colorToken,
            sortOrder: tag.sortOrder,
            isActive: tag.isActive,
          },
        },
      });

      return tag;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "TAG_NAME_EXISTS", "A tag with this name already exists.");
    }

    throw error;
  }
}

export async function updateExpenseTagForHousehold(
  userId: string,
  householdId: string,
  tagId: string,
  input: unknown,
) {
  await requireHouseholdSettingsManager(userId, householdId);
  const parsed = expenseTagInputSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Expense tag input is invalid.", parsed.error.flatten());
  }

  const previous = await prisma.expenseTag.findFirst({
    where: { id: tagId, householdId, isActive: true },
  });

  if (!previous) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const tag = await tx.expenseTag.update({
        where: { id: tagId },
        data: {
          name: parsed.data.name,
          colorToken: parsed.data.colorToken,
          sortOrder: parsed.data.sortOrder ?? previous.sortOrder,
        },
      });

      await tx.auditEvent.create({
        data: {
          householdId,
          actorUserId: userId,
          action: "expense_tag.updated",
          entityType: "ExpenseTag",
          entityId: tag.id,
          before: {
            name: previous.name,
            colorToken: previous.colorToken,
            sortOrder: previous.sortOrder,
            isActive: previous.isActive,
          },
          after: {
            name: tag.name,
            colorToken: tag.colorToken,
            sortOrder: tag.sortOrder,
            isActive: tag.isActive,
          },
        },
      });

      return tag;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(409, "TAG_NAME_EXISTS", "A tag with this name already exists.");
    }

    throw error;
  }
}

export async function archiveExpenseTagForHousehold(
  userId: string,
  householdId: string,
  tagId: string,
) {
  await requireHouseholdSettingsManager(userId, householdId);
  const previous = await prisma.expenseTag.findFirst({
    where: { id: tagId, householdId, isActive: true },
  });

  if (!previous) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  return prisma.$transaction(async (tx) => {
    const tag = await tx.expenseTag.update({
      where: { id: tagId },
      data: { isActive: false },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "expense_tag.archived",
        entityType: "ExpenseTag",
        entityId: tag.id,
        before: {
          name: previous.name,
          colorToken: previous.colorToken,
          sortOrder: previous.sortOrder,
          isActive: previous.isActive,
        },
        after: {
          name: tag.name,
          colorToken: tag.colorToken,
          sortOrder: tag.sortOrder,
          isActive: tag.isActive,
        },
      },
    });

    return tag;
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

  if (parsed.data.memberUserId) {
    await assertExpenseFilterMemberBelongsToHousehold(parsed.data.memberUserId, householdId);
  }

  const cursorProposal = await resolveExpenseProposalCursor(
    householdId,
    parsed.data,
    parsed.data.cursor,
  );
  const proposals = await prisma.expenseProposal.findMany({
    where: buildExpenseProposalWhere(householdId, parsed.data, cursorProposal),
    include: {
      household: {
        select: {
          approvalPolicy: true,
        },
      },
      category: true,
      tagLinks: {
        include: {
          tag: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      payers: true,
      shares: true,
      proposalFiles: {
        include: {
          file: true,
        },
      },
    },
    orderBy: expenseProposalOrderBy,
    take: parsed.data.limit + 1,
  });

  return paginateRows(proposals, parsed.data.limit);
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

  const tagIds = await assertTagsBelongToHousehold(data.tagIds ?? [], householdId);
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
  const fxLock = await resolveHouseholdFxRateLock({
    baseCurrency: originalCurrency,
    quoteCurrency: settlementCurrency,
    date: expenseDate,
    manualRate: data.fxRate,
    policy: household.fxPolicy,
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
    tagIds,
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
      ...(prepared.tagIds.length > 0
        ? {
            tagLinks: {
              create: prepared.tagIds.map((tagId) => ({
                tagId,
              })),
            },
          }
        : {}),
    },
    include: {
      category: true,
      tagLinks: {
        include: {
          tag: true,
        },
      },
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
        tagIds: prepared.tagIds,
        fileIds: prepared.fileIds,
        revisionNumber: prepared.revisionNumber ?? 1,
        supersedesProposalId: prepared.supersedesProposalId ?? null,
        sourceTaskId: prepared.sourceTaskId ?? null,
        sourceCalendarEventId: prepared.sourceCalendarEventId ?? null,
      },
    },
  });

  const notificationIds = await createExpenseProposalAssignedNotifications(tx, {
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

  const detailedProposal = await tx.expenseProposal.findUniqueOrThrow({
    where: {
      id: proposal.id,
    },
    include: expenseProposalDetailInclude,
  });

  return {
    proposal: detailedProposal,
    notificationIds,
  };
}

async function dispatchProposalPushNotifications<T>({
  notificationIds,
  proposal,
}: {
  notificationIds: string[];
  proposal: T;
}) {
  try {
    await dispatchWebPushForNotifications(notificationIds);
  } catch {
    // Browser push is a progressive enhancement; proposal creation remains authoritative.
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

  const prepared = await prepareExpenseProposalCreate(
    userId,
    householdId,
    creatorMembership,
    parsed.data,
  );

  const result = await prisma.$transaction((tx) => createExpenseProposalRecord(tx, prepared));

  return dispatchProposalPushNotifications(result);
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
    const result = await prisma.$transaction(async (tx) => {
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

      const recordResult = await createExpenseProposalRecord(tx, prepared);
      const proposal = recordResult.proposal;
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

      return recordResult;
    });

    return dispatchProposalPushNotifications(result);
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

  const result = await prisma.$transaction(async (tx) => {
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

    const recordResult = await createExpenseProposalRecord(tx, prepared);
    const proposal = recordResult.proposal;
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

    return recordResult;
  });

  return dispatchProposalPushNotifications(result);
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

  const result = await prisma.$transaction(async (tx) => {
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
            household: {
              select: {
                approvalPolicy: true,
              },
            },
            payers: true,
            shares: true,
          },
        },
      },
    });

    if (!share) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
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

    const approvalPolicy = approvalPolicyForProposal(share.proposal);
    const userIsPrimaryPayer = isPrimaryPayer(share.proposal, userId);

    if (approvalPolicy === "PAYER_ONLY") {
      if (!userIsPrimaryPayer) {
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Only the primary payer can approve shares under the payer-only policy.",
        );
      }
    } else if (share.debtorUserId !== userId) {
      throw new ApiError(403, "FORBIDDEN", "Users can only approve their own shares.");
    }

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
            approvalPolicy,
            status: ShareStatus.APPROVED,
          },
        },
      });

      await tx.expenseShare.update({
        where: { id: share.id },
        data: {
          status: ShareStatus.APPROVED,
        },
      });
    }

    const refreshedShares = await tx.expenseShare.findMany({
      where: { proposalId: share.proposalId },
      include: {
        proposal: {
          select: {
            dueDate: true,
            title: true,
          },
        },
      },
    });
    const canMatureAllParticipantShares =
      approvalPolicy !== "ALL_PARTICIPANTS" ||
      refreshedShares.every(
        (refreshedShare) =>
          refreshedShare.status === ShareStatus.APPROVED ||
          refreshedShare.status === ShareStatus.MATURED_TO_LEDGER,
      );

    if (!canMatureAllParticipantShares) {
      return tx.expenseProposal.update({
        where: { id: share.proposalId },
        data: {
          status: proposalStatusFromShares(refreshedShares),
        },
        include: {
          ...expenseProposalDetailInclude,
        },
      });
    }

    assertFxLockReady(share.proposal);
    const ledgerOccurredAt = new Date();
    await assertLedgerPeriodOpen(tx, householdId, ledgerOccurredAt);

    const sharesToMature =
      approvalPolicy === "ALL_PARTICIPANTS"
        ? refreshedShares.filter((refreshedShare) => refreshedShare.status === ShareStatus.APPROVED)
        : refreshedShares.filter((refreshedShare) => refreshedShare.id === share.id);

    for (const shareToMature of sharesToMature) {
      await matureApprovedShare(tx, {
        actorUserId: userId,
        householdId,
        ledgerOccurredAt,
        share: shareToMature,
        timezone: membership.household.timezone,
      });
    }

    const finalShares = await tx.expenseShare.findMany({
      where: { proposalId: share.proposalId },
      select: { status: true },
    });

    return tx.expenseProposal.update({
      where: { id: share.proposalId },
      data: {
        status: proposalStatusFromShares(finalShares),
      },
      include: {
        ...expenseProposalDetailInclude,
      },
    });
  });

  return result;
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
      tagLinks: true,
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
    tagIds: parsed.data.tagIds ?? existingProposal.tagLinks.map((link) => link.tagId),
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

  const result = await prisma.$transaction(async (tx) => {
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

    const recordResult = await createExpenseProposalRecord(tx, prepared);
    const revision = recordResult.proposal;

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

    return recordResult;
  });

  return dispatchProposalPushNotifications(result);
}

export type ExpenseProposalWithRelations = Awaited<
  ReturnType<typeof listExpenseProposalsForHousehold>
>["items"][number];

export type ExpenseProposalDetail = Awaited<ReturnType<typeof getExpenseProposalForUser>>;
export type ExpenseCategorySummary = Awaited<
  ReturnType<typeof listExpenseCategoriesForHousehold>
>[number];
export type ExpenseTagSummary = Awaited<ReturnType<typeof listExpenseTagsForHousehold>>[number];
