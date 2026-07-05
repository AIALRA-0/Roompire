import Decimal from "decimal.js";
import {
  DebtStatus,
  ExpenseProposalStatus,
  SettlementStatus,
  ShareStatus,
  type Prisma,
  type ExpenseProposal,
  type ExpensePayer,
  type ExpenseShare,
  type HouseholdMembership,
  type Task,
  type User,
} from "@prisma/client";
import { z } from "zod";
import { validationError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership } from "@/server/permissions/rbac";

export type AmountTotal = {
  currency: string;
  amount: string;
};

export type StatsWindow = {
  from: string | null;
  to: string | null;
};

export type ProposalTrendPoint = {
  date: string;
  proposalCount: number;
  proposalTotals: AmountTotal[];
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

function isRealDateOnly(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1000
  ) {
    return false;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDateOnly, "Date must be a real calendar date.");

const optionalDateOnlySchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value === "" || value === null ? undefined : value;
}, dateOnlySchema.optional());

export const statsQuerySchema = z
  .object({
    from: optionalDateOnlySchema,
    to: optionalDateOnlySchema,
  })
  .superRefine((data, context) => {
    if (data.from && data.to && data.from > data.to) {
      context.addIssue({
        code: "custom",
        message: "from must be before or equal to to.",
        path: ["from"],
      });
    }
  });

type ParsedStatsQuery = {
  fromDate?: Date;
  toExclusiveDate?: Date;
  window: StatsWindow;
};

function decimalToCompactString(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toString();
}

function dateOnlyToUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeQueryInput(query: unknown) {
  if (query instanceof URLSearchParams) {
    return Object.fromEntries(query);
  }

  return query ?? {};
}

function parseStatsQuery(query: unknown): ParsedStatsQuery {
  const parsed = statsQuerySchema.safeParse(normalizeQueryInput(query));

  if (!parsed.success) {
    throw validationError("Statistics query is invalid.", parsed.error.flatten());
  }

  return {
    fromDate: parsed.data.from ? dateOnlyToUtc(parsed.data.from) : undefined,
    toExclusiveDate: parsed.data.to ? addUtcDays(dateOnlyToUtc(parsed.data.to), 1) : undefined,
    window: {
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
    },
  };
}

function dateRangeFilter(query: ParsedStatsQuery): Prisma.DateTimeFilter | undefined {
  if (!query.fromDate && !query.toExclusiveDate) {
    return undefined;
  }

  return {
    gte: query.fromDate,
    lt: query.toExclusiveDate,
  };
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

function proposalTrend(proposals: ProposalForStats[]): ProposalTrendPoint[] {
  const rows = new Map<
    string,
    {
      date: string;
      proposalCount: number;
      proposalTotals: Map<string, Decimal>;
    }
  >();

  for (const proposal of proposals) {
    if (proposal.status === ExpenseProposalStatus.CANCELLED) {
      continue;
    }

    const key = dateKey(proposal.expenseDate);
    const row = rows.get(key) ?? {
      date: key,
      proposalCount: 0,
      proposalTotals: new Map<string, Decimal>(),
    };

    row.proposalCount += 1;
    addCurrencyTotal(row.proposalTotals, proposal.settlementCurrency, proposal.settlementAmount);
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({
      date: row.date,
      proposalCount: row.proposalCount,
      proposalTotals: serializeCurrencyTotals(row.proposalTotals),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function taskCountMap(tasks: Task[]) {
  return {
    open: tasks.filter((task) => task.status === "OPEN").length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length,
  };
}

export async function getStatsSummaryForHousehold(
  userId: string,
  householdId: string,
  query: unknown = {},
) {
  const membership = await requireActiveMembership(userId, householdId);
  const parsedQuery = parseStatsQuery(query);
  const range = dateRangeFilter(parsedQuery);
  const proposalWhere: Prisma.ExpenseProposalWhereInput = {
    householdId,
    ...(range ? { expenseDate: range } : {}),
  };
  const obligationWhere: Prisma.DebtObligationWhereInput = {
    householdId,
    ...(range ? { createdAt: range } : {}),
  };
  const settlementWhere: Prisma.SettlementWhereInput = {
    householdId,
    ...(range ? { settlementDate: range } : {}),
  };
  const taskWhere: Prisma.TaskWhereInput = {
    householdId,
    ...(range
      ? {
          OR: [
            {
              dueAt: {
                ...range,
                not: null,
              },
            },
            {
              dueAt: null,
              createdAt: range,
            },
          ],
        }
      : {}),
  };
  const auditWhere: Prisma.AuditEventWhereInput = {
    householdId,
    ...(range ? { occurredAt: range } : {}),
  };
  const proposalFileWhere: Prisma.ProposalFileWhereInput = {
    proposal: {
      householdId,
    },
    ...(range ? { createdAt: range } : {}),
  };
  const settlementFileWhere: Prisma.SettlementFileWhereInput = {
    settlement: {
      householdId,
    },
    ...(range ? { createdAt: range } : {}),
  };
  const [
    proposals,
    obligations,
    settlements,
    tasks,
    auditEventCount,
    proposalFileCount,
    settlementFileCount,
  ] = await Promise.all([
    prisma.expenseProposal.findMany({
      where: proposalWhere,
      include: {
        category: true,
        payers: true,
        shares: true,
      },
    }),
    prisma.debtObligation.findMany({
      where: obligationWhere,
    }),
    prisma.settlement.findMany({
      where: settlementWhere,
    }),
    prisma.task.findMany({
      where: taskWhere,
    }),
    prisma.auditEvent.count({
      where: auditWhere,
    }),
    prisma.proposalFile.count({
      where: proposalFileWhere,
    }),
    prisma.settlementFile.count({
      where: settlementFileWhere,
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
    window: parsedQuery.window,
    settlementCurrency: membership.household.settlementCurrency,
    proposalCounts: proposalCountMap(proposals),
    proposalSettlementTotals: serializeCurrencyTotals(proposalTotals),
    openObligationTotals: serializeCurrencyTotals(openObligationTotals),
    confirmedSettlementTotals: serializeCurrencyTotals(confirmedSettlementTotals),
    taskCounts: taskCountMap(tasks),
    proposalTrend: proposalTrend(proposals),
    auditEventCount,
    receiptFileCount: proposalFileCount + settlementFileCount,
  };
}

export async function listCategoryStatsForHousehold(
  userId: string,
  householdId: string,
  query: unknown = {},
) {
  await requireActiveMembership(userId, householdId);
  const range = dateRangeFilter(parseStatsQuery(query));
  const proposals = await prisma.expenseProposal.findMany({
    where: {
      householdId,
      ...(range ? { expenseDate: range } : {}),
    },
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

export async function listMemberStatsForHousehold(
  userId: string,
  householdId: string,
  query: unknown = {},
) {
  await requireActiveMembership(userId, householdId);
  const range = dateRangeFilter(parseStatsQuery(query));
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
      where: {
        householdId,
        ...(range ? { expenseDate: range } : {}),
      },
      include: {
        category: true,
        payers: true,
        shares: true,
      },
    }),
    prisma.debtObligation.findMany({
      where: {
        householdId,
        ...(range ? { createdAt: range } : {}),
      },
    }),
    prisma.settlement.findMany({
      where: {
        householdId,
        ...(range ? { settlementDate: range } : {}),
      },
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
