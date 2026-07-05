import { ExpenseProposalStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { listAuditEventsForHousehold } from "@/server/audit/service";
import { requirePageUser } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  ACTIVE_HOUSEHOLD_COOKIE_NAME,
  selectActiveHouseholdMembership,
} from "@/server/households/active-household";
import {
  listExpenseCategoriesForHousehold,
  listExpenseProposalsForHousehold,
} from "@/server/expenses/service";
import { listHouseholdsForUser } from "@/server/households/service";
import { listNotificationsForUser } from "@/server/notifications/service";
import {
  canCorrectLedger,
  canCreateExpenseProposal,
  canCreateHouseholdWorkItem,
  canManageMembers,
} from "@/server/permissions/rbac";
import { getUserSettings } from "@/server/users/service";

export async function getDashboardModel() {
  const user = await requirePageUser();
  const [householdMemberships, userSettings, notificationResult, cookieStore] = await Promise.all([
    listHouseholdsForUser(user.id),
    getUserSettings(user.id),
    listNotificationsForUser(user.id),
    cookies(),
  ]);
  const activeHouseholdId = cookieStore.get(ACTIVE_HOUSEHOLD_COOKIE_NAME)?.value;
  const activeMembership = selectActiveHouseholdMembership(householdMemberships, activeHouseholdId);
  const activeHousehold = activeMembership?.household ?? null;

  if (!activeHousehold || !activeMembership) {
    return {
      user,
      userSettings,
      notifications: notificationResult.notifications,
      unreadNotificationCount: notificationResult.unreadCount,
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
    listAuditEventsForHousehold(user.id, activeHousehold.id),
  ]);

  return {
    user,
    userSettings,
    notifications: notificationResult.notifications,
    unreadNotificationCount: notificationResult.unreadCount,
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
    auditItems: auditItems.slice(0, 4),
    canInviteMembers: canManageMembers(activeMembership.role),
    canManageMembers: canManageMembers(activeMembership.role),
    canCreateExpenseProposals: canCreateExpenseProposal(activeMembership.role),
    canCreateWorkItems: canCreateHouseholdWorkItem(activeMembership.role),
    canCorrectLedger: canCorrectLedger(activeMembership.role),
  };
}
