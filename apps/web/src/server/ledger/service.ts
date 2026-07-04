import Decimal from "decimal.js";
import { requireActiveMembership } from "@/server/permissions/rbac";
import { prisma } from "@/server/db/prisma";

export type BalanceEdge = {
  debtorUserId: string;
  creditorUserId: string;
  amount: string;
  currency: string;
  obligationCount: number;
};

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

export type LedgerObligationWithRelations = Awaited<
  ReturnType<typeof listLedgerObligationsForHousehold>
>[number];

export type LedgerTransactionWithRelations = Awaited<
  ReturnType<typeof listLedgerTransactionsForHousehold>
>[number];
