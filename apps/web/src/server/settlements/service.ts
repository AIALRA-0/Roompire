import Decimal from "decimal.js";
import { DebtStatus, LedgerTransactionType, Role, SettlementStatus } from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership } from "@/server/permissions/rbac";

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((value) => new Decimal(value).isPositive(), "Amount must be greater than zero.");

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createSettlementSchema = z.object({
  debtObligationId: z.string().uuid(),
  amount: decimalStringSchema,
  settlementDate: dateOnlySchema,
  method: z.string().trim().min(1).max(60).default("manual"),
  note: z.string().trim().max(500).optional(),
});

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalToFixed6(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

function assertCanSettle(role: Role) {
  return role === Role.OWNER || role === Role.ADMIN || role === Role.MEMBER;
}

export async function listSettlementsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.settlement.findMany({
    where: {
      householdId,
    },
    include: {
      transaction: true,
      allocations: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 50,
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

  return prisma.$transaction(async (tx) => {
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
        status: SettlementStatus.SUBMITTED,
        note: data.note,
        createdByUserId: userId,
      },
      include: {
        transaction: true,
        allocations: true,
      },
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
          payerUserId: obligation.debtorUserId,
          payeeUserId: obligation.creditorUserId,
          amount: settlement.amount.toString(),
          currency: settlement.currency,
          status: settlement.status,
        },
      },
    });

    return settlement;
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
      include: {
        transaction: true,
        allocations: true,
      },
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

    if (
      settlement.transaction.sourceType !== "DebtObligation" ||
      !settlement.transaction.sourceId
    ) {
      throw new ApiError(409, "SETTLEMENT_SOURCE_MISSING", "Settlement source is missing.");
    }

    const obligation = await tx.debtObligation.findFirst({
      where: {
        id: settlement.transaction.sourceId,
        householdId,
      },
    });

    if (!obligation || obligation.status !== DebtStatus.OPEN) {
      throw new ApiError(409, "OBLIGATION_NOT_OPEN", "Only open obligations can be settled.");
    }

    const amount = new Decimal(settlement.amount.toString());
    const remaining = new Decimal(obligation.remainingAmount.toString());

    if (amount.gt(remaining)) {
      throw new ApiError(409, "SETTLEMENT_OVERPAYS", "Settlement exceeds remaining obligation.");
    }

    const nextRemaining = remaining.minus(amount);

    await tx.settlementAllocation.create({
      data: {
        settlementId: settlement.id,
        debtObligationId: obligation.id,
        amountApplied: decimalToFixed6(amount),
      },
    });

    await tx.debtObligation.update({
      where: {
        id: obligation.id,
      },
      data: {
        remainingAmount: decimalToFixed6(nextRemaining),
        status: nextRemaining.isZero() ? DebtStatus.SETTLED : DebtStatus.OPEN,
        settledAt: nextRemaining.isZero() ? new Date() : null,
      },
    });

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
          debtObligationId: obligation.id,
          amountApplied: decimalToFixed6(amount),
          remainingAmount: decimalToFixed6(nextRemaining),
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
      include: {
        transaction: true,
        allocations: true,
      },
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
