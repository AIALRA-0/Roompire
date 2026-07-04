import type { HouseholdMembership, Role } from "@prisma/client";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";

const memberRoles = new Set<Role>(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
const memberManagerRoles = new Set<Role>(["OWNER", "ADMIN"]);
const expenseCreatorRoles = new Set<Role>(["OWNER", "ADMIN", "MEMBER"]);
const householdWorkItemCreatorRoles = new Set<Role>(["OWNER", "ADMIN", "MEMBER"]);
const ledgerCorrectorRoles = new Set<Role>(["OWNER", "ADMIN"]);

export function canViewHousehold(role: Role) {
  return memberRoles.has(role);
}

export function canManageMembers(role: Role) {
  return memberManagerRoles.has(role);
}

export function canUpdateHouseholdSettings(role: Role) {
  return memberManagerRoles.has(role);
}

export function canCreateExpenseProposal(role: Role) {
  return expenseCreatorRoles.has(role);
}

export function canCreateHouseholdWorkItem(role: Role) {
  return householdWorkItemCreatorRoles.has(role);
}

export function canCorrectLedger(role: Role) {
  return ledgerCorrectorRoles.has(role);
}

export async function getActiveMembership(userId: string, householdId: string) {
  return prisma.householdMembership.findFirst({
    where: {
      householdId,
      userId,
      status: "ACTIVE",
    },
    include: {
      household: true,
      user: true,
    },
  });
}

export async function requireActiveMembership(userId: string, householdId: string) {
  const membership = await getActiveMembership(userId, householdId);

  if (!membership || !canViewHousehold(membership.role)) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  return membership;
}

export async function requireMemberManager(userId: string, householdId: string) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!canManageMembers(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Only household owners and admins can manage members.", {
      role: membership.role,
    });
  }

  return membership;
}

export async function requireHouseholdSettingsManager(userId: string, householdId: string) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!canUpdateHouseholdSettings(membership.role)) {
    throw new ApiError(403, "FORBIDDEN", "Only household owners and admins can update settings.", {
      role: membership.role,
    });
  }

  return membership;
}

export async function requireExpenseProposalCreator(userId: string, householdId: string) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!canCreateExpenseProposal(membership.role)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only household owners, admins, and members can create expense proposals.",
      {
        role: membership.role,
      },
    );
  }

  return membership;
}

export async function requireHouseholdWorkItemCreator(userId: string, householdId: string) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!canCreateHouseholdWorkItem(membership.role)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only household owners, admins, and members can manage calendar work.",
      {
        role: membership.role,
      },
    );
  }

  return membership;
}

export async function requireLedgerCorrector(userId: string, householdId: string) {
  const membership = await requireActiveMembership(userId, householdId);

  if (!canCorrectLedger(membership.role)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only household owners and admins can correct ledger entries.",
      {
        role: membership.role,
      },
    );
  }

  return membership;
}

export type ActiveMembership = Awaited<ReturnType<typeof requireActiveMembership>>;
export type HouseholdMembershipWithUser = HouseholdMembership & {
  user: {
    id: string;
    email: string;
    displayName: string;
    preferredLocale: string;
  };
};
