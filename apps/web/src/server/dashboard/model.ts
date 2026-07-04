import { ExpenseProposalStatus } from "@prisma/client";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  listExpenseCategoriesForHousehold,
  listExpenseProposalsForHousehold,
} from "@/server/expenses/service";
import { listHouseholdsForUser } from "@/server/households/service";
import {
  canCorrectLedger,
  canCreateExpenseProposal,
  canCreateHouseholdWorkItem,
  canManageMembers,
} from "@/server/permissions/rbac";

export async function getDashboardModel() {
  const user = await requirePageUser();
  const householdMemberships = await listHouseholdsForUser(user.id);
  const activeMembership = householdMemberships[0] ?? null;
  const activeHousehold = activeMembership?.household ?? null;

  if (!activeHousehold || !activeMembership) {
    return {
      user,
      householdMemberships,
      activeHousehold: null,
      activeMembership: null,
      members: [],
      categories: [],
      expenseProposals: [],
      debtObligations: [],
      pendingProposalCount: 0,
      maturedObligationCount: 0,
      upcomingTaskCount: 0,
      auditItems: [],
      canInviteMembers: false,
      canManageMembers: false,
      canCreateExpenseProposals: false,
      canCreateWorkItems: false,
      canCorrectLedger: false,
    };
  }

  const [
    members,
    categories,
    expenseProposals,
    debtObligations,
    pendingProposalCount,
    maturedObligationCount,
    upcomingTaskCount,
    auditItems,
  ] = await Promise.all([
    prisma.householdMembership.findMany({
      where: {
        householdId: activeHousehold.id,
        status: "ACTIVE",
      },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    listExpenseCategoriesForHousehold(user.id, activeHousehold.id),
    listExpenseProposalsForHousehold(user.id, activeHousehold.id),
    prisma.debtObligation.findMany({
      where: {
        householdId: activeHousehold.id,
        status: "OPEN",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    }),
    prisma.expenseProposal.count({
      where: {
        householdId: activeHousehold.id,
        status: {
          in: [
            ExpenseProposalStatus.SUBMITTED,
            ExpenseProposalStatus.PARTIALLY_APPROVED,
            ExpenseProposalStatus.DISPUTED,
          ],
        },
      },
    }),
    prisma.debtObligation.count({
      where: {
        householdId: activeHousehold.id,
      },
    }),
    prisma.task.count({
      where: {
        householdId: activeHousehold.id,
        status: "OPEN",
      },
    }),
    prisma.auditEvent.findMany({
      where: {
        householdId: activeHousehold.id,
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 4,
    }),
  ]);

  return {
    user,
    householdMemberships,
    activeHousehold,
    activeMembership,
    members,
    categories,
    expenseProposals,
    debtObligations,
    pendingProposalCount,
    maturedObligationCount,
    upcomingTaskCount,
    auditItems,
    canInviteMembers: canManageMembers(activeMembership.role),
    canManageMembers: canManageMembers(activeMembership.role),
    canCreateExpenseProposals: canCreateExpenseProposal(activeMembership.role),
    canCreateWorkItems: canCreateHouseholdWorkItem(activeMembership.role),
    canCorrectLedger: canCorrectLedger(activeMembership.role),
  };
}
