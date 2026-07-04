import Decimal from "decimal.js";
import { DebtStatus, LedgerTransactionType } from "@prisma/client";
import { z } from "zod";
import { ApiError, validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership, requireLedgerCorrector } from "@/server/permissions/rbac";

export type BalanceEdge = {
  debtorUserId: string;
  creditorUserId: string;
  amount: string;
  currency: string;
  obligationCount: number;
};

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((value) => new Decimal(value).isPositive(), "Amount must be greater than zero.");

const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/));

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reverseLedgerObligationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  occurredAt: dateOnlySchema,
});

export const createLedgerAdjustmentSchema = z.object({
  debtorUserId: z.string().uuid(),
  creditorUserId: z.string().uuid(),
  amount: decimalStringSchema,
  currency: currencySchema,
  occurredAt: dateOnlySchema,
  dueDate: dateOnlySchema.optional().or(z.literal("")),
  reason: z.string().trim().min(3).max(500),
});

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalToFixed6(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

export async function listLedgerObligationsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.debtObligation.findMany({
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

export async function listLedgerTransactionsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.ledgerTransaction.findMany({
    where: {
      householdId,
    },
    include: {
      obligations: true,
      settlements: true,
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
}

export async function listBalanceEdgesForHousehold(userId: string, householdId: string) {
  const obligations = await listLedgerObligationsForHousehold(userId, householdId);
  const edgesByKey = new Map<
    string,
    {
      firstUserId: string;
      secondUserId: string;
      currency: string;
      signedAmount: Decimal;
      obligationCount: number;
    }
  >();

  for (const obligation of obligations) {
    if (obligation.status !== "OPEN") {
      continue;
    }

    const amount = new Decimal(obligation.remainingAmount.toString());

    if (amount.isZero()) {
      continue;
    }

    const orderedUserIds = [obligation.debtorUserId, obligation.creditorUserId].sort();
    const firstUserId = orderedUserIds[0]!;
    const secondUserId = orderedUserIds[1]!;
    const key = `${obligation.settlementCurrency}:${firstUserId}:${secondUserId}`;
    const existing = edgesByKey.get(key) ?? {
      firstUserId,
      secondUserId,
      currency: obligation.settlementCurrency,
      signedAmount: new Decimal(0),
      obligationCount: 0,
    };
    const signedAmount =
      obligation.debtorUserId === firstUserId
        ? existing.signedAmount.plus(amount)
        : existing.signedAmount.minus(amount);

    edgesByKey.set(key, {
      ...existing,
      signedAmount,
      obligationCount: existing.obligationCount + 1,
    });
  }

  return [...edgesByKey.values()]
    .filter((edge) => !edge.signedAmount.isZero())
    .map((edge) => ({
      debtorUserId: edge.signedAmount.isPositive() ? edge.firstUserId : edge.secondUserId,
      creditorUserId: edge.signedAmount.isPositive() ? edge.secondUserId : edge.firstUserId,
      amount: edge.signedAmount.abs().toString(),
      currency: edge.currency,
      obligationCount: edge.obligationCount,
    }))
    .sort((left, right) => {
      const currencySort = left.currency.localeCompare(right.currency);

      if (currencySort !== 0) {
        return currencySort;
      }

      return new Decimal(right.amount).cmp(left.amount);
    });
}

export async function reverseLedgerObligationForHousehold(
  userId: string,
  householdId: string,
  obligationId: string,
  input: unknown,
) {
  await requireLedgerCorrector(userId, householdId);

  const parsed = reverseLedgerObligationSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Ledger reversal input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const occurredAt = dateOnlyToUtc(data.occurredAt);

  return prisma.$transaction(async (tx) => {
    const obligation = await tx.debtObligation.findFirst({
      where: {
        id: obligationId,
        householdId,
      },
      include: {
        transaction: true,
        allocations: true,
      },
    });

    if (!obligation) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (obligation.status !== DebtStatus.OPEN) {
      throw new ApiError(
        409,
        "OBLIGATION_NOT_REVERSIBLE",
        "Only open obligations can be reversed.",
      );
    }

    if (obligation.allocations.length > 0) {
      throw new ApiError(
        409,
        "OBLIGATION_HAS_ALLOCATIONS",
        "Obligations with confirmed settlement allocations require an adjustment.",
      );
    }

    const reversalTransaction = await tx.ledgerTransaction.create({
      data: {
        householdId,
        type: LedgerTransactionType.REVERSAL,
        description: `Reversal: ${data.reason}`,
        sourceType: "DebtObligation",
        sourceId: obligation.id,
        createdByUserId: userId,
        occurredAt,
        reversesTransactionId: obligation.ledgerTransactionId,
      },
      include: {
        obligations: true,
        settlements: true,
      },
    });

    await tx.debtObligation.update({
      where: {
        id: obligation.id,
      },
      data: {
        remainingAmount: decimalToFixed6(0),
        status: DebtStatus.REVERSED,
        settledAt: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "ledger_obligation.reversed",
        entityType: "DebtObligation",
        entityId: obligation.id,
        after: {
          ledgerTransactionId: reversalTransaction.id,
          reversesTransactionId: obligation.ledgerTransactionId,
          reason: data.reason,
          previousRemainingAmount: obligation.remainingAmount.toString(),
          status: DebtStatus.REVERSED,
        },
      },
    });

    return reversalTransaction;
  });
}

export async function createLedgerAdjustmentForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  await requireLedgerCorrector(userId, householdId);

  const parsed = createLedgerAdjustmentSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Ledger adjustment input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const amount = new Decimal(data.amount);
  const occurredAt = dateOnlyToUtc(data.occurredAt);
  const dueDate = data.dueDate ? dateOnlyToUtc(data.dueDate) : null;

  if (data.debtorUserId === data.creditorUserId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Debtor and creditor must be different.");
  }

  return prisma.$transaction(async (tx) => {
    const debtorMembership = await tx.householdMembership.findFirst({
      where: {
        householdId,
        userId: data.debtorUserId,
        status: "ACTIVE",
      },
    });
    const creditorMembership = await tx.householdMembership.findFirst({
      where: {
        householdId,
        userId: data.creditorUserId,
        status: "ACTIVE",
      },
    });

    if (!debtorMembership || !creditorMembership) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (debtorMembership.role === "VIEWER" || creditorMembership.role === "VIEWER") {
      throw new ApiError(403, "FORBIDDEN", "Viewers cannot be adjustment debtors or creditors.");
    }

    const ledgerTransaction = await tx.ledgerTransaction.create({
      data: {
        householdId,
        type: LedgerTransactionType.ADJUSTMENT,
        description: `Adjustment: ${data.reason}`,
        sourceType: "ManualAdjustment",
        createdByUserId: userId,
        occurredAt,
      },
    });

    const obligation = await tx.debtObligation.create({
      data: {
        householdId,
        ledgerTransactionId: ledgerTransaction.id,
        debtorUserId: data.debtorUserId,
        creditorUserId: data.creditorUserId,
        originalAmount: decimalToFixed6(amount),
        originalCurrency: data.currency,
        settlementAmount: decimalToFixed6(amount),
        settlementCurrency: data.currency,
        remainingAmount: decimalToFixed6(amount),
        dueDate,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "ledger_adjustment.created",
        entityType: "LedgerTransaction",
        entityId: ledgerTransaction.id,
        after: {
          debtObligationId: obligation.id,
          debtorUserId: data.debtorUserId,
          creditorUserId: data.creditorUserId,
          amount: decimalToFixed6(amount),
          currency: data.currency,
          reason: data.reason,
        },
      },
    });

    return tx.ledgerTransaction.findUniqueOrThrow({
      where: {
        id: ledgerTransaction.id,
      },
      include: {
        obligations: true,
        settlements: true,
      },
    });
  });
}

export type LedgerObligationWithRelations = Awaited<
  ReturnType<typeof listLedgerObligationsForHousehold>
>[number];

export type LedgerTransactionWithRelations = Awaited<
  ReturnType<typeof listLedgerTransactionsForHousehold>
>[number];
