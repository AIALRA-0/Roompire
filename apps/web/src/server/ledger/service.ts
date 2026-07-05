import Decimal from "decimal.js";
import {
  ClearingPolicy,
  DebtStatus,
  LedgerPeriodStatus,
  LedgerTransactionType,
  type Prisma,
} from "@prisma/client";
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

export type SettlementSuggestion = {
  debtorUserId: string;
  creditorUserId: string;
  amount: string;
  currency: string;
  debtorOpenObligationCount: number;
  creditorOpenObligationCount: number;
  directOpenObligationCount: number;
  directRemainingAmount: string;
  actionability: "DIRECTLY_SETTLEABLE" | "CLEARING_SETTLEABLE" | "GUIDANCE_ONLY";
};

type SettlementSuggestionObligationInput = {
  debtorUserId: string;
  creditorUserId: string;
  remainingAmount: Decimal.Value;
  settlementCurrency: string;
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
const periodMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

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

export const closeLedgerPeriodSchema = z.object({
  periodMonth: periodMonthSchema,
  note: z
    .preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().max(500).optional(),
    )
    .optional(),
});

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function periodMonthToUtc(value: string) {
  const [year, month] = value.split("-").map(Number);

  return new Date(Date.UTC(year!, month! - 1, 1));
}

export function dateToLedgerPeriodMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function ledgerPeriodMonthToKey(value: Date) {
  return value.toISOString().slice(0, 7);
}

export async function assertLedgerPeriodOpen(
  tx: Prisma.TransactionClient,
  householdId: string,
  occurredAt: Date,
) {
  const periodMonth = dateToLedgerPeriodMonth(occurredAt);
  const closedPeriod = await tx.ledgerPeriodClose.findUnique({
    where: {
      householdId_periodMonth: {
        householdId,
        periodMonth,
      },
    },
  });

  if (closedPeriod?.status === LedgerPeriodStatus.CLOSED) {
    throw new ApiError(409, "LEDGER_PERIOD_CLOSED", "Ledger period is closed.", {
      periodMonth: ledgerPeriodMonthToKey(periodMonth),
      periodCloseId: closedPeriod.id,
    });
  }
}

function decimalToFixed6(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

function decimalToCompactString(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
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

export async function listLedgerPeriodClosesForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.ledgerPeriodClose.findMany({
    where: {
      householdId,
    },
    orderBy: [{ periodMonth: "desc" }, { updatedAt: "desc" }],
    take: 24,
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

export function computeSettlementSuggestions(
  obligations: SettlementSuggestionObligationInput[],
  options: { clearingPolicy?: ClearingPolicy } = {},
): SettlementSuggestion[] {
  const clearingPolicy = options.clearingPolicy ?? ClearingPolicy.DIRECT_ONLY;
  const directObligationStats = new Map<
    string,
    {
      count: number;
      remainingAmount: Decimal;
    }
  >();
  const currencyBuckets = new Map<
    string,
    Map<
      string,
      {
        userId: string;
        netAmount: Decimal;
        debtorOpenObligationCount: number;
        creditorOpenObligationCount: number;
      }
    >
  >();

  for (const obligation of obligations) {
    const amount = new Decimal(obligation.remainingAmount);

    if (amount.isZero()) {
      continue;
    }

    const directKey = `${obligation.settlementCurrency}:${obligation.debtorUserId}:${obligation.creditorUserId}`;
    const directStats = directObligationStats.get(directKey) ?? {
      count: 0,
      remainingAmount: new Decimal(0),
    };

    directObligationStats.set(directKey, {
      count: directStats.count + 1,
      remainingAmount: directStats.remainingAmount.plus(amount),
    });

    const bucket = currencyBuckets.get(obligation.settlementCurrency) ?? new Map();
    const debtor = bucket.get(obligation.debtorUserId) ?? {
      userId: obligation.debtorUserId,
      netAmount: new Decimal(0),
      debtorOpenObligationCount: 0,
      creditorOpenObligationCount: 0,
    };
    const creditor = bucket.get(obligation.creditorUserId) ?? {
      userId: obligation.creditorUserId,
      netAmount: new Decimal(0),
      debtorOpenObligationCount: 0,
      creditorOpenObligationCount: 0,
    };

    bucket.set(obligation.debtorUserId, {
      ...debtor,
      netAmount: debtor.netAmount.minus(amount),
      debtorOpenObligationCount: debtor.debtorOpenObligationCount + 1,
    });
    bucket.set(obligation.creditorUserId, {
      ...creditor,
      netAmount: creditor.netAmount.plus(amount),
      creditorOpenObligationCount: creditor.creditorOpenObligationCount + 1,
    });
    currencyBuckets.set(obligation.settlementCurrency, bucket);
  }

  const suggestions: SettlementSuggestion[] = [];

  for (const [currency, participants] of [...currencyBuckets.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const debtors = [...participants.values()]
      .filter((participant) => participant.netAmount.isNegative())
      .map((participant) => ({
        ...participant,
        amount: participant.netAmount.abs(),
      }))
      .sort((left, right) => {
        const amountSort = right.amount.cmp(left.amount);

        return amountSort !== 0 ? amountSort : left.userId.localeCompare(right.userId);
      });
    const creditors = [...participants.values()]
      .filter((participant) => participant.netAmount.isPositive())
      .map((participant) => ({
        ...participant,
        amount: participant.netAmount,
      }))
      .sort((left, right) => {
        const amountSort = right.amount.cmp(left.amount);

        return amountSort !== 0 ? amountSort : left.userId.localeCompare(right.userId);
      });
    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex]!;
      const creditor = creditors[creditorIndex]!;
      const amount = Decimal.min(debtor.amount, creditor.amount);

      if (!amount.isZero()) {
        const directKey = `${currency}:${debtor.userId}:${creditor.userId}`;
        const directStats = directObligationStats.get(directKey) ?? {
          count: 0,
          remainingAmount: new Decimal(0),
        };

        suggestions.push({
          debtorUserId: debtor.userId,
          creditorUserId: creditor.userId,
          amount: decimalToCompactString(amount),
          currency,
          debtorOpenObligationCount: debtor.debtorOpenObligationCount,
          creditorOpenObligationCount: creditor.creditorOpenObligationCount,
          directOpenObligationCount: directStats.count,
          directRemainingAmount: decimalToCompactString(directStats.remainingAmount),
          actionability: directStats.remainingAmount.gte(amount)
            ? "DIRECTLY_SETTLEABLE"
            : clearingPolicy === ClearingPolicy.HOUSEHOLD_NETTING && directStats.count === 0
              ? "CLEARING_SETTLEABLE"
              : "GUIDANCE_ONLY",
        });
      }

      debtor.amount = debtor.amount.minus(amount);
      creditor.amount = creditor.amount.minus(amount);

      if (debtor.amount.isZero()) {
        debtorIndex += 1;
      }

      if (creditor.amount.isZero()) {
        creditorIndex += 1;
      }
    }
  }

  return suggestions;
}

export async function listSettlementSuggestionsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  const [household, obligations] = await Promise.all([
    prisma.household.findUnique({
      where: { id: householdId },
      select: { clearingPolicy: true },
    }),
    prisma.debtObligation.findMany({
      where: {
        householdId,
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

  return computeSettlementSuggestions(obligations, {
    clearingPolicy: household?.clearingPolicy ?? ClearingPolicy.DIRECT_ONLY,
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

    await assertLedgerPeriodOpen(tx, householdId, obligation.transaction.occurredAt);
    await assertLedgerPeriodOpen(tx, householdId, occurredAt);

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
    await assertLedgerPeriodOpen(tx, householdId, occurredAt);

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

export async function closeLedgerPeriodForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  await requireLedgerCorrector(userId, householdId);

  const parsed = closeLedgerPeriodSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Ledger period close input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const periodMonth = periodMonthToUtc(data.periodMonth);

  return prisma.$transaction(async (tx) => {
    const existingPeriod = await tx.ledgerPeriodClose.findUnique({
      where: {
        householdId_periodMonth: {
          householdId,
          periodMonth,
        },
      },
    });

    if (existingPeriod?.status === LedgerPeriodStatus.CLOSED) {
      return existingPeriod;
    }

    const periodClose = existingPeriod
      ? await tx.ledgerPeriodClose.update({
          where: {
            id: existingPeriod.id,
          },
          data: {
            status: LedgerPeriodStatus.CLOSED,
            note: data.note,
            closedByUserId: userId,
            closedAt: new Date(),
            reopenedByUserId: null,
            reopenedAt: null,
          },
        })
      : await tx.ledgerPeriodClose.create({
          data: {
            householdId,
            periodMonth,
            status: LedgerPeriodStatus.CLOSED,
            note: data.note,
            closedByUserId: userId,
          },
        });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "ledger_period.closed",
        entityType: "LedgerPeriodClose",
        entityId: periodClose.id,
        after: {
          periodMonth: ledgerPeriodMonthToKey(periodMonth),
          status: periodClose.status,
          note: periodClose.note,
        },
      },
    });

    return periodClose;
  });
}

export async function reopenLedgerPeriodForHousehold(
  userId: string,
  householdId: string,
  periodCloseId: string,
) {
  await requireLedgerCorrector(userId, householdId);

  return prisma.$transaction(async (tx) => {
    const existingPeriod = await tx.ledgerPeriodClose.findFirst({
      where: {
        id: periodCloseId,
        householdId,
      },
    });

    if (!existingPeriod) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (existingPeriod.status === LedgerPeriodStatus.REOPENED) {
      return existingPeriod;
    }

    const periodClose = await tx.ledgerPeriodClose.update({
      where: {
        id: existingPeriod.id,
      },
      data: {
        status: LedgerPeriodStatus.REOPENED,
        reopenedByUserId: userId,
        reopenedAt: new Date(),
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "ledger_period.reopened",
        entityType: "LedgerPeriodClose",
        entityId: periodClose.id,
        before: {
          status: existingPeriod.status,
        },
        after: {
          periodMonth: ledgerPeriodMonthToKey(periodClose.periodMonth),
          status: periodClose.status,
          reopenedAt: periodClose.reopenedAt?.toISOString() ?? null,
        },
      },
    });

    return periodClose;
  });
}

export type LedgerObligationWithRelations = Awaited<
  ReturnType<typeof listLedgerObligationsForHousehold>
>[number];

export type LedgerTransactionWithRelations = Awaited<
  ReturnType<typeof listLedgerTransactionsForHousehold>
>[number];

export type LedgerPeriodCloseRecord = Awaited<
  ReturnType<typeof listLedgerPeriodClosesForHousehold>
>[number];
