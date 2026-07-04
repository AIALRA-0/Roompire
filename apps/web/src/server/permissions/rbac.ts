import type { HouseholdMembership, Role } from "@prisma/client";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";

const memberRoles = new Set<Role>(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
const memberManagerRoles = new Set<Role>(["OWNER", "ADMIN"]);

export function canViewHousehold(role: Role) {
  return memberRoles.has(role);
}

export function canManageMembers(role: Role) {
  return memberManagerRoles.has(role);
}

export function canUpdateHouseholdSettings(role: Role) {
  return memberManagerRoles.has(role);
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

export type ActiveMembership = Awaited<ReturnType<typeof requireActiveMembership>>;
export type HouseholdMembershipWithUser = HouseholdMembership & {
  user: {
    id: string;
    email: string;
    displayName: string;
    preferredLocale: string;
  };
};
