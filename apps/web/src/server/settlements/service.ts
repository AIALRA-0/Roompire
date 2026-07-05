import Decimal from "decimal.js";
import {
  ClearingPolicy,
  DebtStatus,
  LedgerTransactionType,
  Role,
  SettlementStatus,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { assertFilesReadyForAttachment } from "@/server/files/service";
import { computeSettlementSuggestions } from "@/server/ledger/service";
import { requireActiveMembership } from "@/server/permissions/rbac";

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((value) => new Decimal(value).isPositive(), "Amount must be greater than zero.");

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/));

const optionalMetadataSchema = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(maxLength).optional(),
  );

export const createSettlementSchema = z
  .object({
    debtObligationId: z.string().uuid().optional(),
    payeeUserId: z.string().uuid().optional(),
    currency: currencySchema.optional(),
    amount: decimalStringSchema,
    settlementDate: dateOnlySchema,
    method: z.string().trim().min(1).max(60).default("manual"),
    paymentReference: optionalMetadataSchema(160),
    note: optionalMetadataSchema(500),
    fileIds: z.array(z.string().uuid()).max(5).default([]),
  })
  .superRefine((value, context) => {
    const recordsSingleObligation = Boolean(value.debtObligationId);
    const recordsSuggestedTransfer = Boolean(value.payeeUserId || value.currency);

    if (recordsSingleObligation === recordsSuggestedTransfer) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either debtObligationId or payeeUserId with currency, but not both.",
        path: ["debtObligationId"],
      });
    }

    if (recordsSuggestedTransfer && !value.payeeUserId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "payeeUserId is required for suggested transfer settlements.",
        path: ["payeeUserId"],
      });
    }

    if (recordsSuggestedTransfer && !value.currency) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "currency is required for suggested transfer settlements.",
        path: ["currency"],
      });
    }
  });

type AllocationCandidate = {
  id: string;
  debtorUserId: string;
  creditorUserId: string;
  settlementCurrency: string;
  remainingAmount: Decimal.Value;
  status: DebtStatus;
};

const settlementInclude = {
  transaction: true,
  allocations: true,
  settlementFiles: {
    include: {
      file: true,
    },
    orderBy: [{ createdAt: "asc" as const }, { fileId: "asc" as const }],
  },
};

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalToFixed6(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

function assertCanSettle(role: Role) {
  return role === Role.OWNER || role === Role.ADMIN || role === Role.MEMBER;
}

async function requireSettleablePayee(
  tx: Prisma.TransactionClient,
  householdId: string,
  payeeUserId: string,
) {
  const membership = await tx.householdMembership.findFirst({
    where: {
      householdId,
      userId: payeeUserId,
      status: "ACTIVE",
    },
  });

  if (!membership) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  if (!assertCanSettle(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot receive settlements.");
  }

  return membership;
}

function remainingDecimal(obligation: AllocationCandidate) {
  return new Decimal(obligation.remainingAmount.toString());
}

function totalRemaining(obligations: AllocationCandidate[]) {
  return obligations.reduce(
    (total, obligation) => total.plus(remainingDecimal(obligation)),
    new Decimal(0),
  );
}

async function listOpenTransferObligations(
  tx: Prisma.TransactionClient,
  householdId: string,
  payerUserId: string,
  payeeUserId: string,
  currency: string,
) {
  return tx.debtObligation.findMany({
    where: {
      householdId,
      debtorUserId: payerUserId,
      creditorUserId: payeeUserId,
      settlementCurrency: currency,
      status: DebtStatus.OPEN,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function listOpenClearingPayerObligations(
  tx: Prisma.TransactionClient,
  householdId: string,
  payerUserId: string,
  payeeUserId: string,
  currency: string,
) {
  return tx.debtObligation.findMany({
    where: {
      householdId,
      debtorUserId: payerUserId,
      settlementCurrency: currency,
      status: DebtStatus.OPEN,
      NOT: {
        creditorUserId: payeeUserId,
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function listOpenClearingPayeeObligations(
  tx: Prisma.TransactionClient,
  householdId: string,
  payerUserId: string,
  payeeUserId: string,
  currency: string,
) {
  return tx.debtObligation.findMany({
    where: {
      householdId,
      creditorUserId: payeeUserId,
      settlementCurrency: currency,
      status: DebtStatus.OPEN,
      NOT: {
        debtorUserId: payerUserId,
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function findClearingSuggestion(
  tx: Prisma.TransactionClient,
  householdId: string,
  payerUserId: string,
  payeeUserId: string,
  currency: string,
) {
  const [household, obligations] = await Promise.all([
    tx.household.findUnique({
      where: { id: householdId },
      select: { clearingPolicy: true },
    }),
    tx.debtObligation.findMany({
      where: {
        householdId,
        settlementCurrency: currency,
        status: DebtStatus.OPEN,
      },
      select: {
        debtorUserId: true,
        creditorUserId: true,
        remainingAmount: true,
        settlementCurrency: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  if (household?.clearingPolicy !== ClearingPolicy.HOUSEHOLD_NETTING) {
    return null;
  }

  return (
    computeSettlementSuggestions(obligations, {
      clearingPolicy: household.clearingPolicy,
    }).find(
      (suggestion) =>
        suggestion.debtorUserId === payerUserId &&
        suggestion.creditorUserId === payeeUserId &&
        suggestion.currency === currency &&
        suggestion.actionability === "CLEARING_SETTLEABLE",
    ) ?? null
  );
}

function buildAllocationPlan(amount: Decimal, obligations: AllocationCandidate[]) {
  let unappliedAmount = amount;
  const allocations: Array<{
    obligation: AllocationCandidate;
    amountApplied: Decimal;
    nextRemaining: Decimal;
  }> = [];

  for (const obligation of obligations) {
    if (unappliedAmount.lte(0)) {
      break;
    }

    const remaining = remainingDecimal(obligation);

    if (remaining.lte(0)) {
      continue;
    }

    const amountApplied = Decimal.min(unappliedAmount, remaining);

    allocations.push({
      obligation,
      amountApplied,
      nextRemaining: remaining.minus(amountApplied),
    });
    unappliedAmount = unappliedAmount.minus(amountApplied);
  }

  if (unappliedAmount.gt(0)) {
    throw new ApiError(409, "SETTLEMENT_OVERPAYS", "Settlement exceeds remaining obligation.");
  }

  return allocations;
}

export async function listSettlementsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.settlement.findMany({
    where: {
      householdId,
    },
    include: settlementInclude,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 50,
  });
}

async function attachSettlementFiles(
  tx: Prisma.TransactionClient,
  input: {
    householdId: string;
    settlementId: string;
    userId: string;
    fileIds: string[];
  },
) {
  if (input.fileIds.length === 0) {
    return;
  }

  await tx.settlementFile.createMany({
    data: input.fileIds.map((fileId) => ({
      settlementId: input.settlementId,
      fileId,
      purpose: "evidence",
      createdByUserId: input.userId,
    })),
    skipDuplicates: true,
  });

  await tx.auditEvent.create({
    data: {
      householdId: input.householdId,
      actorUserId: input.userId,
      action: "settlement.file_attached",
      entityType: "SettlementFile",
      entityId: input.settlementId,
      after: {
        settlementId: input.settlementId,
        fileIds: input.fileIds,
        purpose: "evidence",
      },
    },
  });
}

async function getSettlementWithRelations(tx: Prisma.TransactionClient, settlementId: string) {
  return tx.settlement.findUniqueOrThrow({
    where: {
      id: settlementId,
    },
    include: settlementInclude,
  });
}

export async function createSettlementForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!assertCanSettle(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot record settlements.");
  }

  const parsed = createSettlementSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Settlement input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const amount = new Decimal(data.amount);
  const settlementDate = dateOnlyToUtc(data.settlementDate);

  await assertFilesReadyForAttachment({
    userId,
    householdId,
    fileIds: data.fileIds,
  });

  return prisma.$transaction(async (tx) => {
    if (data.debtObligationId) {
      const obligation = await tx.debtObligation.findFirst({
        where: {
          id: data.debtObligationId,
          householdId,
        },
      });

      if (!obligation) {
        throw new ApiError(404, "NOT_FOUND", "Resource not found.");
      }

      if (obligation.debtorUserId !== userId) {
        throw new ApiError(403, "FORBIDDEN", "Only the debtor can submit this settlement.");
      }

      if (obligation.status !== DebtStatus.OPEN) {
        throw new ApiError(409, "OBLIGATION_NOT_OPEN", "Only open obligations can be settled.");
      }

      if (amount.gt(new Decimal(obligation.remainingAmount.toString()))) {
        throw new ApiError(409, "SETTLEMENT_OVERPAYS", "Settlement exceeds remaining obligation.");
      }

      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          householdId,
          type: LedgerTransactionType.SETTLEMENT_RECORDED,
          description: `Settlement submitted for ${obligation.settlementCurrency} ${decimalToFixed6(
            amount,
          )}`,
          sourceType: "DebtObligation",
          sourceId: obligation.id,
          createdByUserId: userId,
          occurredAt: settlementDate,
        },
      });

      const settlement = await tx.settlement.create({
        data: {
          householdId,
          ledgerTransactionId: ledgerTransaction.id,
          payerUserId: obligation.debtorUserId,
          payeeUserId: obligation.creditorUserId,
          amount: decimalToFixed6(amount),
          currency: obligation.settlementCurrency,
          settlementDate,
          method: data.method,
          paymentReference: data.paymentReference,
          status: SettlementStatus.SUBMITTED,
          note: data.note,
          createdByUserId: userId,
        },
      });

      await attachSettlementFiles(tx, {
        householdId,
        settlementId: settlement.id,
        userId,
        fileIds: data.fileIds,
      });

      await tx.auditEvent.create({
        data: {
          householdId,
          actorUserId: userId,
          action: "settlement.submitted",
          entityType: "Settlement",
          entityId: settlement.id,
          after: {
            debtObligationId: obligation.id,
            allocationPolicy: "SOURCE_OBLIGATION",
            payerUserId: obligation.debtorUserId,
            payeeUserId: obligation.creditorUserId,
            amount: settlement.amount.toString(),
            currency: settlement.currency,
            method: settlement.method,
            paymentReference: settlement.paymentReference,
            note: settlement.note,
            fileIds: data.fileIds,
            status: settlement.status,
          },
        },
      });

      return getSettlementWithRelations(tx, settlement.id);
    }

    if (!data.payeeUserId || !data.currency) {
      throw validationError("Settlement input is invalid.");
    }

    if (data.payeeUserId === userId) {
      throw new ApiError(400, "VALIDATION_ERROR", "Payer and payee must be different.");
    }

    await requireSettleablePayee(tx, householdId, data.payeeUserId);

    const obligations = await listOpenTransferObligations(
      tx,
      householdId,
      userId,
      data.payeeUserId,
      data.currency,
    );
    const directRemaining = totalRemaining(obligations);
    let sourceType = "SettlementSuggestion";
    let allocationPolicy = "OLDEST_OPEN_OBLIGATIONS";
    let candidateDebtObligationIds = obligations.map((obligation) => obligation.id);

    if (obligations.length === 0 || directRemaining.isZero() || amount.gt(directRemaining)) {
      const clearingSuggestion = await findClearingSuggestion(
        tx,
        householdId,
        userId,
        data.payeeUserId,
        data.currency,
      );

      if (!clearingSuggestion || amount.gt(new Decimal(clearingSuggestion.amount))) {
        throw new ApiError(
          409,
          obligations.length > 0 ? "SETTLEMENT_OVERPAYS" : "NO_SETTLEABLE_OBLIGATIONS",
          obligations.length > 0
            ? "Settlement exceeds remaining obligation."
            : "No open obligations match this settlement transfer.",
        );
      }

      sourceType = "SettlementClearing";
      allocationPolicy = "HOUSEHOLD_NETTING";
      const [payerObligations, payeeObligations] = await Promise.all([
        listOpenClearingPayerObligations(tx, householdId, userId, data.payeeUserId, data.currency),
        listOpenClearingPayeeObligations(tx, householdId, userId, data.payeeUserId, data.currency),
      ]);
      candidateDebtObligationIds = [
        ...payerObligations.map((obligation) => obligation.id),
        ...payeeObligations.map((obligation) => obligation.id),
      ];
    }

    const ledgerTransaction = await tx.ledgerTransaction.create({
      data: {
        householdId,
        type: LedgerTransactionType.SETTLEMENT_RECORDED,
        description: `Settlement submitted for ${data.currency} ${decimalToFixed6(amount)}`,
        sourceType,
        createdByUserId: userId,
        occurredAt: settlementDate,
      },
    });

    const settlement = await tx.settlement.create({
      data: {
        householdId,
        ledgerTransactionId: ledgerTransaction.id,
        payerUserId: userId,
        payeeUserId: data.payeeUserId,
        amount: decimalToFixed6(amount),
        currency: data.currency,
        settlementDate,
        method: data.method,
        paymentReference: data.paymentReference,
        status: SettlementStatus.SUBMITTED,
        note: data.note,
        createdByUserId: userId,
      },
    });

    await attachSettlementFiles(tx, {
      householdId,
      settlementId: settlement.id,
      userId,
      fileIds: data.fileIds,
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "settlement.submitted",
        entityType: "Settlement",
        entityId: settlement.id,
        after: {
          allocationPolicy,
          candidateDebtObligationIds,
          payerUserId: settlement.payerUserId,
          payeeUserId: settlement.payeeUserId,
          amount: settlement.amount.toString(),
          currency: settlement.currency,
          method: settlement.method,
          paymentReference: settlement.paymentReference,
          note: settlement.note,
          fileIds: data.fileIds,
          status: settlement.status,
        },
      },
    });

    return getSettlementWithRelations(tx, settlement.id);
  });
}

export async function confirmSettlementForHousehold(
  userId: string,
  householdId: string,
  settlementId: string,
) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!assertCanSettle(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot confirm settlements.");
  }

  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.findFirst({
      where: {
        id: settlementId,
        householdId,
      },
      include: settlementInclude,
    });

    if (!settlement) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (settlement.payeeUserId !== userId) {
      throw new ApiError(403, "FORBIDDEN", "Only the creditor can confirm this settlement.");
    }

    if (settlement.status === SettlementStatus.CONFIRMED) {
      return settlement;
    }

    if (settlement.status !== SettlementStatus.SUBMITTED) {
      throw new ApiError(409, "SETTLEMENT_NOT_CONFIRMABLE", "Settlement cannot be confirmed.");
    }

    const amount = new Decimal(settlement.amount.toString());
    let allocationPolicy = "OLDEST_OPEN_OBLIGATIONS";
    let obligations: AllocationCandidate[];
    let allocationPlan: ReturnType<typeof buildAllocationPlan> | null = null;

    if (settlement.transaction.sourceType === "DebtObligation" && settlement.transaction.sourceId) {
      const obligation = await tx.debtObligation.findFirst({
        where: {
          id: settlement.transaction.sourceId,
          householdId,
        },
      });

      if (
        !obligation ||
        obligation.status !== DebtStatus.OPEN ||
        obligation.debtorUserId !== settlement.payerUserId ||
        obligation.creditorUserId !== settlement.payeeUserId ||
        obligation.settlementCurrency !== settlement.currency
      ) {
        throw new ApiError(409, "OBLIGATION_NOT_OPEN", "Only open obligations can be settled.");
      }

      allocationPolicy = "SOURCE_OBLIGATION";
      obligations = [obligation];
    } else if (settlement.transaction.sourceType === "SettlementSuggestion") {
      obligations = await listOpenTransferObligations(
        tx,
        householdId,
        settlement.payerUserId,
        settlement.payeeUserId,
        settlement.currency,
      );

      if (obligations.length === 0 || totalRemaining(obligations).isZero()) {
        throw new ApiError(
          409,
          "NO_SETTLEABLE_OBLIGATIONS",
          "No open obligations match this settlement transfer.",
        );
      }
    } else if (settlement.transaction.sourceType === "SettlementClearing") {
      const clearingSuggestion = await findClearingSuggestion(
        tx,
        householdId,
        settlement.payerUserId,
        settlement.payeeUserId,
        settlement.currency,
      );

      if (!clearingSuggestion || amount.gt(new Decimal(clearingSuggestion.amount))) {
        throw new ApiError(
          409,
          "NO_SETTLEABLE_OBLIGATIONS",
          "No open obligations match this settlement transfer.",
        );
      }

      const [payerObligations, payeeObligations] = await Promise.all([
        listOpenClearingPayerObligations(
          tx,
          householdId,
          settlement.payerUserId,
          settlement.payeeUserId,
          settlement.currency,
        ),
        listOpenClearingPayeeObligations(
          tx,
          householdId,
          settlement.payerUserId,
          settlement.payeeUserId,
          settlement.currency,
        ),
      ]);

      allocationPolicy = "HOUSEHOLD_NETTING";
      allocationPlan = [
        ...buildAllocationPlan(amount, payerObligations),
        ...buildAllocationPlan(amount, payeeObligations),
      ];
      obligations = [];
    } else {
      throw new ApiError(409, "SETTLEMENT_SOURCE_MISSING", "Settlement source is missing.");
    }

    allocationPlan = allocationPlan ?? buildAllocationPlan(amount, obligations);

    for (const allocation of allocationPlan) {
      await tx.settlementAllocation.create({
        data: {
          settlementId: settlement.id,
          debtObligationId: allocation.obligation.id,
          amountApplied: decimalToFixed6(allocation.amountApplied),
        },
      });

      await tx.debtObligation.update({
        where: {
          id: allocation.obligation.id,
        },
        data: {
          remainingAmount: decimalToFixed6(allocation.nextRemaining),
          status: allocation.nextRemaining.isZero() ? DebtStatus.SETTLED : DebtStatus.OPEN,
          settledAt: allocation.nextRemaining.isZero() ? new Date() : null,
        },
      });
    }

    const confirmedSettlement = await tx.settlement.update({
      where: {
        id: settlement.id,
      },
      data: {
        status: SettlementStatus.CONFIRMED,
      },
      include: {
        transaction: true,
        allocations: true,
        settlementFiles: {
          include: {
            file: true,
          },
          orderBy: [{ createdAt: "asc" }, { fileId: "asc" }],
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "settlement.confirmed",
        entityType: "Settlement",
        entityId: settlement.id,
        after: {
          allocationPolicy,
          allocationCount: allocationPlan.length,
          allocations: allocationPlan.map((allocation) => ({
            debtObligationId: allocation.obligation.id,
            amountApplied: decimalToFixed6(allocation.amountApplied),
            remainingAmount: decimalToFixed6(allocation.nextRemaining),
          })),
          amountApplied: decimalToFixed6(amount),
          status: confirmedSettlement.status,
        },
      },
    });

    return confirmedSettlement;
  });
}

export async function rejectSettlementForHousehold(
  userId: string,
  householdId: string,
  settlementId: string,
) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!assertCanSettle(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Viewers cannot reject settlements.");
  }

  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.findFirst({
      where: {
        id: settlementId,
        householdId,
      },
      include: settlementInclude,
    });

    if (!settlement) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (settlement.payeeUserId !== userId) {
      throw new ApiError(403, "FORBIDDEN", "Only the creditor can reject this settlement.");
    }

    if (settlement.status === SettlementStatus.REJECTED) {
      return settlement;
    }

    if (settlement.status !== SettlementStatus.SUBMITTED) {
      throw new ApiError(409, "SETTLEMENT_NOT_REJECTABLE", "Settlement cannot be rejected.");
    }

    const rejectedSettlement = await tx.settlement.update({
      where: {
        id: settlement.id,
      },
      data: {
        status: SettlementStatus.REJECTED,
      },
      include: {
        transaction: true,
        allocations: true,
        settlementFiles: {
          include: {
            file: true,
          },
          orderBy: [{ createdAt: "asc" }, { fileId: "asc" }],
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "settlement.rejected",
        entityType: "Settlement",
        entityId: settlement.id,
        after: {
          status: rejectedSettlement.status,
        },
      },
    });

    return rejectedSettlement;
  });
}

export type SettlementWithRelations = Awaited<
  ReturnType<typeof listSettlementsForHousehold>
>[number];
