import Decimal from "decimal.js";
import {
  DebtStatus,
  ExpenseProposalStatus,
  SettlementStatus,
  ShareStatus,
  type ExpenseProposal,
  type ExpensePayer,
  type ExpenseShare,
  type HouseholdMembership,
  type Task,
  type User,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership } from "@/server/permissions/rbac";

export type AmountTotal = {
  currency: string;
  amount: string;
};

type MembershipWithUser = HouseholdMembership & {
  user: User;
};

type ProposalForStats = ExpenseProposal & {
  category: {
    id: string;
    key: string;
    nameEn: string;
    nameZhCn: string;
  } | null;
  payers: ExpensePayer[];
  shares: ExpenseShare[];
};

function decimalToCompactString(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

function addCurrencyTotal(totals: Map<string, Decimal>, currency: string, value: Decimal.Value) {
  totals.set(currency, (totals.get(currency) ?? new Decimal(0)).plus(value));
}

function serializeCurrencyTotals(totals: Map<string, Decimal>): AmountTotal[] {
  return [...totals.entries()]
    .map(([currency, amount]) => ({
      currency,
      amount: decimalToCompactString(amount),
    }))
    .filter((total) => !new Decimal(total.amount).isZero())
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function proposalCountMap(proposals: ProposalForStats[]) {
  const counts = Object.fromEntries(
    Object.values(ExpenseProposalStatus).map((status) => [status, 0]),
  ) as Record<ExpenseProposalStatus, number>;

  for (const proposal of proposals) {
    counts[proposal.status] += 1;
  }

  return counts;
}

function taskCountMap(tasks: Task[]) {
  return {
    open: tasks.filter((task) => task.status === "OPEN").length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length,
  };
}

export async function getStatsSummaryForHousehold(userId: string, householdId: string) {
  const membership = await requireActiveMembership(userId, householdId);
  const [proposals, obligations, settlements, tasks, auditEventCount, receiptFileCount] =
    await Promise.all([
      prisma.expenseProposal.findMany({
        where: { householdId },
        include: {
          category: true,
          payers: true,
          shares: true,
        },
      }),
      prisma.debtObligation.findMany({
        where: { householdId },
      }),
      prisma.settlement.findMany({
        where: { householdId },
      }),
      prisma.task.findMany({
        where: { householdId },
      }),
      prisma.auditEvent.count({
        where: { householdId },
      }),
      prisma.proposalFile.count({
        where: {
          proposal: {
            householdId,
          },
        },
      }),
    ]);
  const proposalTotals = new Map<string, Decimal>();
  const openObligationTotals = new Map<string, Decimal>();
  const confirmedSettlementTotals = new Map<string, Decimal>();

  for (const proposal of proposals) {
    if (proposal.status !== ExpenseProposalStatus.CANCELLED) {
      addCurrencyTotal(proposalTotals, proposal.settlementCurrency, proposal.settlementAmount);
    }
  }

  for (const obligation of obligations) {
    if (obligation.status === DebtStatus.OPEN) {
      addCurrencyTotal(
        openObligationTotals,
        obligation.settlementCurrency,
        obligation.remainingAmount,
      );
    }
  }

  for (const settlement of settlements) {
    if (settlement.status === SettlementStatus.CONFIRMED) {
      addCurrencyTotal(confirmedSettlementTotals, settlement.currency, settlement.amount);
    }
  }

  return {
    householdId,
    settlementCurrency: membership.household.settlementCurrency,
    proposalCounts: proposalCountMap(proposals),
    proposalSettlementTotals: serializeCurrencyTotals(proposalTotals),
    openObligationTotals: serializeCurrencyTotals(openObligationTotals),
    confirmedSettlementTotals: serializeCurrencyTotals(confirmedSettlementTotals),
    taskCounts: taskCountMap(tasks),
    auditEventCount,
    receiptFileCount,
  };
}

export async function listCategoryStatsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);
  const proposals = await prisma.expenseProposal.findMany({
    where: { householdId },
    include: {
      category: true,
      payers: true,
      shares: true,
    },
  });
  const categoryRows = new Map<
    string,
    {
      categoryId: string | null;
      categoryKey: string;
      nameEn: string;
      nameZhCn: string;
      proposalCount: number;
      proposalTotals: Map<string, Decimal>;
      maturedShareTotals: Map<string, Decimal>;
    }
  >();

  for (const proposal of proposals) {
    if (proposal.status === ExpenseProposalStatus.CANCELLED) {
      continue;
    }

    const key = proposal.category?.id ?? "uncategorized";
    const row = categoryRows.get(key) ?? {
      categoryId: proposal.category?.id ?? null,
      categoryKey: proposal.category?.key ?? "uncategorized",
      nameEn: proposal.category?.nameEn ?? "Uncategorized",
      nameZhCn: proposal.category?.nameZhCn ?? "未分类",
      proposalCount: 0,
      proposalTotals: new Map<string, Decimal>(),
      maturedShareTotals: new Map<string, Decimal>(),
    };

    row.proposalCount += 1;
    addCurrencyTotal(row.proposalTotals, proposal.settlementCurrency, proposal.settlementAmount);

    for (const share of proposal.shares) {
      if (share.status === ShareStatus.MATURED_TO_LEDGER) {
        addCurrencyTotal(
          row.maturedShareTotals,
          share.settlementCurrency,
          share.shareSettlementAmount,
        );
      }
    }

    categoryRows.set(key, row);
  }

  return [...categoryRows.values()]
    .map((row) => ({
      categoryId: row.categoryId,
      categoryKey: row.categoryKey,
      nameEn: row.nameEn,
      nameZhCn: row.nameZhCn,
      proposalCount: row.proposalCount,
      proposalTotals: serializeCurrencyTotals(row.proposalTotals),
      maturedShareTotals: serializeCurrencyTotals(row.maturedShareTotals),
    }))
    .sort((left, right) => {
      const totalSort = right.proposalCount - left.proposalCount;

      return totalSort !== 0 ? totalSort : left.nameEn.localeCompare(right.nameEn);
    });
}

function ensureMemberRow(
  memberRows: Map<string, MemberStatsAccumulator>,
  membership: MembershipWithUser,
) {
  const existing = memberRows.get(membership.userId);

  if (existing) {
    return existing;
  }

  const next = {
    userId: membership.userId,
    displayName: membership.displayNameOverride ?? membership.user.displayName,
    email: membership.user.email,
    role: membership.role,
    createdProposalCount: 0,
    createdProposalTotals: new Map<string, Decimal>(),
    paidProposalTotals: new Map<string, Decimal>(),
    owedObligationTotals: new Map<string, Decimal>(),
    receivableObligationTotals: new Map<string, Decimal>(),
    remainingOwedTotals: new Map<string, Decimal>(),
    remainingReceivableTotals: new Map<string, Decimal>(),
    confirmedSettlementPaidTotals: new Map<string, Decimal>(),
    confirmedSettlementReceivedTotals: new Map<string, Decimal>(),
  };

  memberRows.set(membership.userId, next);

  return next;
}

type MemberStatsAccumulator = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  createdProposalCount: number;
  createdProposalTotals: Map<string, Decimal>;
  paidProposalTotals: Map<string, Decimal>;
  owedObligationTotals: Map<string, Decimal>;
  receivableObligationTotals: Map<string, Decimal>;
  remainingOwedTotals: Map<string, Decimal>;
  remainingReceivableTotals: Map<string, Decimal>;
  confirmedSettlementPaidTotals: Map<string, Decimal>;
  confirmedSettlementReceivedTotals: Map<string, Decimal>;
};

export async function listMemberStatsForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);
  const [memberships, proposals, obligations, settlements] = await Promise.all([
    prisma.householdMembership.findMany({
      where: {
        householdId,
        status: "ACTIVE",
      },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.expenseProposal.findMany({
      where: { householdId },
      include: {
        category: true,
        payers: true,
        shares: true,
      },
    }),
    prisma.debtObligation.findMany({
      where: { householdId },
    }),
    prisma.settlement.findMany({
      where: { householdId },
    }),
  ]);
  const rows = new Map<string, MemberStatsAccumulator>();
  const membershipsByUserId = new Map(
    memberships.map((membership) => [membership.userId, membership]),
  );

  for (const membership of memberships) {
    ensureMemberRow(rows, membership);
  }

  for (const proposal of proposals) {
    if (proposal.status === ExpenseProposalStatus.CANCELLED) {
      continue;
    }

    const creatorMembership = membershipsByUserId.get(proposal.createdByUserId);

    if (creatorMembership) {
      const row = ensureMemberRow(rows, creatorMembership);

      row.createdProposalCount += 1;
      addCurrencyTotal(
        row.createdProposalTotals,
        proposal.settlementCurrency,
        proposal.settlementAmount,
      );
    }

    for (const payer of proposal.payers) {
      const payerMembership = membershipsByUserId.get(payer.userId);

      if (payerMembership) {
        addCurrencyTotal(
          ensureMemberRow(rows, payerMembership).paidProposalTotals,
          proposal.settlementCurrency,
          payer.amountSettlement,
        );
      }
    }
  }

  for (const obligation of obligations) {
    const debtorMembership = membershipsByUserId.get(obligation.debtorUserId);
    const creditorMembership = membershipsByUserId.get(obligation.creditorUserId);

    if (debtorMembership) {
      const debtorRow = ensureMemberRow(rows, debtorMembership);

      addCurrencyTotal(
        debtorRow.owedObligationTotals,
        obligation.settlementCurrency,
        obligation.settlementAmount,
      );

      if (obligation.status === DebtStatus.OPEN) {
        addCurrencyTotal(
          debtorRow.remainingOwedTotals,
          obligation.settlementCurrency,
          obligation.remainingAmount,
        );
      }
    }

    if (creditorMembership) {
      const creditorRow = ensureMemberRow(rows, creditorMembership);

      addCurrencyTotal(
        creditorRow.receivableObligationTotals,
        obligation.settlementCurrency,
        obligation.settlementAmount,
      );

      if (obligation.status === DebtStatus.OPEN) {
        addCurrencyTotal(
          creditorRow.remainingReceivableTotals,
          obligation.settlementCurrency,
          obligation.remainingAmount,
        );
      }
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== SettlementStatus.CONFIRMED) {
      continue;
    }

    const payerMembership = membershipsByUserId.get(settlement.payerUserId);
    const payeeMembership = membershipsByUserId.get(settlement.payeeUserId);

    if (payerMembership) {
      addCurrencyTotal(
        ensureMemberRow(rows, payerMembership).confirmedSettlementPaidTotals,
        settlement.currency,
        settlement.amount,
      );
    }

    if (payeeMembership) {
      addCurrencyTotal(
        ensureMemberRow(rows, payeeMembership).confirmedSettlementReceivedTotals,
        settlement.currency,
        settlement.amount,
      );
    }
  }

  return [...rows.values()].map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    email: row.email,
    role: row.role,
    createdProposalCount: row.createdProposalCount,
    createdProposalTotals: serializeCurrencyTotals(row.createdProposalTotals),
    paidProposalTotals: serializeCurrencyTotals(row.paidProposalTotals),
    owedObligationTotals: serializeCurrencyTotals(row.owedObligationTotals),
    receivableObligationTotals: serializeCurrencyTotals(row.receivableObligationTotals),
    remainingOwedTotals: serializeCurrencyTotals(row.remainingOwedTotals),
    remainingReceivableTotals: serializeCurrencyTotals(row.remainingReceivableTotals),
    confirmedSettlementPaidTotals: serializeCurrencyTotals(row.confirmedSettlementPaidTotals),
    confirmedSettlementReceivedTotals: serializeCurrencyTotals(
      row.confirmedSettlementReceivedTotals,
    ),
  }));
}
