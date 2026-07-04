import { createHash, randomBytes } from "node:crypto";
import { FxPolicy, Role, type Prisma } from "@prisma/client";
import { z } from "zod";
import categoriesSeed from "../../../../../seed-data/initial_categories.json";
import { ApiError, validationError } from "@/server/api/errors";
import { normalizeEmail } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  canTransferOwnership,
  requireActiveMembership,
  requireHouseholdSettingsManager,
  requireMemberManager,
} from "@/server/permissions/rbac";

const categorySeeds = categoriesSeed as Array<{
  key: string;
  nameEn: string;
  nameZhCn: string;
  icon?: string;
  colorToken?: string;
}>;

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(2).max(80).default("America/Los_Angeles"),
  settlementCurrency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .default("CNY"),
  defaultLocale: z.enum(["en-US", "zh-CN"]).default("en-US"),
});

export const updateHouseholdSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(2).max(80),
  settlementCurrency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/),
  defaultLocale: z.enum(["en-US", "zh-CN"]),
  fxPolicy: z.enum([
    "LOCK_AT_EXPENSE_DATE",
    "ORIGINAL_CURRENCY_DEBT",
    "MANUAL_RATE_WITH_APPROVAL",
    "FX_DIFFERENCE_ADJUSTMENT",
  ]),
  approvalPolicy: z.enum(["PAYER_AND_EACH_DEBTOR", "ALL_PARTICIPANTS", "PAYER_ONLY"]),
});

export const createInviteSchema = z.object({
  email: z.string().trim().email().optional(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(20),
});

export const updateMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

function slugBase(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return base || "household";
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newInviteToken() {
  return `rp_${randomBytes(18).toString("base64url")}`;
}

function inviteExpiryDate(now = new Date()) {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

async function createDefaultCategories(tx: Prisma.TransactionClient, householdId: string) {
  await Promise.all(
    categorySeeds.map((category, index) =>
      tx.expenseCategory.create({
        data: {
          householdId,
          key: category.key,
          nameEn: category.nameEn,
          nameZhCn: category.nameZhCn,
          icon: category.icon,
          colorToken: category.colorToken,
          sortOrder: index,
        },
      }),
    ),
  );
}

export async function listHouseholdsForUser(userId: string) {
  return prisma.householdMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      household: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

export async function createHouseholdForUser(userId: string, input: unknown) {
  const parsed = createHouseholdSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Household input is invalid.", parsed.error.flatten());
  }

  const data = parsed.data;
  const slug = `${slugBase(data.name)}-${randomBytes(3).toString("hex")}`;

  return prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        name: data.name,
        slug,
        timezone: data.timezone,
        settlementCurrency: data.settlementCurrency,
        defaultLocale: data.defaultLocale,
        fxPolicy: FxPolicy.LOCK_AT_EXPENSE_DATE,
        createdByUserId: userId,
      },
    });

    const membership = await tx.householdMembership.create({
      data: {
        householdId: household.id,
        userId,
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    await createDefaultCategories(tx, household.id);

    await tx.auditEvent.create({
      data: {
        householdId: household.id,
        actorUserId: userId,
        action: "household.created",
        entityType: "Household",
        entityId: household.id,
        after: {
          name: household.name,
          timezone: household.timezone,
          settlementCurrency: household.settlementCurrency,
        },
      },
    });

    return { household, membership };
  });
}

export async function updateHouseholdForUser(userId: string, householdId: string, input: unknown) {
  await requireHouseholdSettingsManager(userId, householdId);
  const parsed = updateHouseholdSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Household settings input is invalid.", parsed.error.flatten());
  }

  const previous = await prisma.household.findUnique({
    where: { id: householdId },
  });

  if (!previous) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const household = await tx.household.update({
      where: { id: householdId },
      data: {
        name: data.name,
        timezone: data.timezone,
        settlementCurrency: data.settlementCurrency,
        defaultLocale: data.defaultLocale,
        fxPolicy: data.fxPolicy,
        approvalPolicy: data.approvalPolicy,
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "household.settings_updated",
        entityType: "Household",
        entityId: householdId,
        before: {
          name: previous.name,
          timezone: previous.timezone,
          settlementCurrency: previous.settlementCurrency,
          defaultLocale: previous.defaultLocale,
          fxPolicy: previous.fxPolicy,
          approvalPolicy: previous.approvalPolicy,
        },
        after: {
          name: household.name,
          timezone: household.timezone,
          settlementCurrency: household.settlementCurrency,
          defaultLocale: household.defaultLocale,
          fxPolicy: household.fxPolicy,
          approvalPolicy: household.approvalPolicy,
        },
      },
    });

    return household;
  });
}

export async function listMembersForHousehold(userId: string, householdId: string) {
  await requireActiveMembership(userId, householdId);

  return prisma.householdMembership.findMany({
    where: {
      householdId,
      status: "ACTIVE",
    },
    include: {
      user: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

async function assertCanMutateTargetMember(input: {
  actorUserId: string;
  actorRole: Role;
  householdId: string;
  targetMembershipId: string;
  nextRole?: Role;
  operation: "update" | "remove";
}) {
  const target = await prisma.householdMembership.findFirst({
    where: {
      id: input.targetMembershipId,
      householdId: input.householdId,
      status: "ACTIVE",
    },
    include: { user: true },
  });

  if (!target) {
    throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  }

  if (target.userId === input.actorUserId) {
    throw new ApiError(
      400,
      "SELF_MEMBER_MUTATION_FORBIDDEN",
      "You cannot change your own role or remove yourself.",
    );
  }

  if (input.actorRole === Role.ADMIN) {
    if (target.role === Role.OWNER || target.role === Role.ADMIN || input.nextRole === Role.ADMIN) {
      throw new ApiError(403, "FORBIDDEN", "Admins can manage regular members and viewers only.", {
        actorRole: input.actorRole,
        targetRole: target.role,
        nextRole: input.nextRole,
      });
    }
  }

  if (target.role === Role.OWNER) {
    const ownerCount = await prisma.householdMembership.count({
      where: {
        householdId: input.householdId,
        status: "ACTIVE",
        role: Role.OWNER,
      },
    });

    if (ownerCount <= 1 && (input.operation === "remove" || input.nextRole !== Role.OWNER)) {
      throw new ApiError(400, "LAST_OWNER_FORBIDDEN", "A household must keep at least one owner.");
    }
  }

  return target;
}

export async function updateMemberRoleForHousehold(
  userId: string,
  householdId: string,
  membershipId: string,
  input: unknown,
) {
  const actor = await requireMemberManager(userId, householdId);
  const parsed = updateMemberSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Member role input is invalid.", parsed.error.flatten());
  }

  const nextRole = parsed.data.role as Role;
  const target = await assertCanMutateTargetMember({
    actorUserId: userId,
    actorRole: actor.role,
    householdId,
    targetMembershipId: membershipId,
    nextRole,
    operation: "update",
  });

  return prisma.$transaction(async (tx) => {
    const membership = await tx.householdMembership.update({
      where: { id: membershipId },
      data: { role: nextRole },
      include: { user: true },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "household_member.role_updated",
        entityType: "HouseholdMembership",
        entityId: membership.id,
        before: {
          role: target.role,
          userId: target.userId,
        },
        after: {
          role: membership.role,
          userId: membership.userId,
        },
      },
    });

    return membership;
  });
}

export async function removeMemberFromHousehold(
  userId: string,
  householdId: string,
  membershipId: string,
) {
  const actor = await requireMemberManager(userId, householdId);
  const target = await assertCanMutateTargetMember({
    actorUserId: userId,
    actorRole: actor.role,
    householdId,
    targetMembershipId: membershipId,
    operation: "remove",
  });

  return prisma.$transaction(async (tx) => {
    const membership = await tx.householdMembership.update({
      where: { id: membershipId },
      data: {
        status: "REMOVED",
      },
      include: { user: true },
    });

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "household_member.removed",
        entityType: "HouseholdMembership",
        entityId: membership.id,
        before: {
          role: target.role,
          status: target.status,
          userId: target.userId,
        },
        after: {
          role: membership.role,
          status: membership.status,
          userId: membership.userId,
        },
      },
    });

    return membership;
  });
}

export async function transferHouseholdOwnership(
  userId: string,
  householdId: string,
  membershipId: string,
) {
  const actor = await requireMemberManager(userId, householdId);

  if (!canTransferOwnership(actor.role)) {
    throw new ApiError(403, "FORBIDDEN", "Only household owners can transfer ownership.", {
      role: actor.role,
    });
  }

  if (actor.id === membershipId) {
    throw new ApiError(
      400,
      "SELF_OWNER_TRANSFER_FORBIDDEN",
      "Choose another active member as the next owner.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.householdMembership.findFirst({
      where: {
        id: membershipId,
        householdId,
        status: "ACTIVE",
      },
      include: { user: true },
    });

    if (!target) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    if (target.role === Role.OWNER) {
      throw new ApiError(400, "TARGET_ALREADY_OWNER", "This member is already a household owner.");
    }

    const [previousOwner, nextOwner] = await Promise.all([
      tx.householdMembership.update({
        where: { id: actor.id },
        data: { role: Role.ADMIN },
        include: { user: true },
      }),
      tx.householdMembership.update({
        where: { id: target.id },
        data: { role: Role.OWNER },
        include: { user: true },
      }),
    ]);

    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId: userId,
        action: "household_owner.transferred",
        entityType: "HouseholdMembership",
        entityId: nextOwner.id,
        before: {
          previousOwnerMembershipId: actor.id,
          previousOwnerUserId: actor.userId,
          previousOwnerRole: actor.role,
          nextOwnerMembershipId: target.id,
          nextOwnerUserId: target.userId,
          nextOwnerRole: target.role,
        },
        after: {
          previousOwnerMembershipId: previousOwner.id,
          previousOwnerUserId: previousOwner.userId,
          previousOwnerRole: previousOwner.role,
          nextOwnerMembershipId: nextOwner.id,
          nextOwnerUserId: nextOwner.userId,
          nextOwnerRole: nextOwner.role,
        },
      },
    });

    return { previousOwner, nextOwner };
  });
}

export async function createInviteForHousehold(
  userId: string,
  householdId: string,
  input: unknown,
) {
  const membership = await requireMemberManager(userId, householdId);
  const parsed = createInviteSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Invite input is invalid.", parsed.error.flatten());
  }

  const token = newInviteToken();
  const tokenHash = hashInviteToken(token);
  const email = parsed.data.email ? normalizeEmail(parsed.data.email) : undefined;

  const invite = await prisma.householdInvite.create({
    data: {
      householdId: membership.householdId,
      email,
      tokenHash,
      role: parsed.data.role,
      expiresAt: inviteExpiryDate(),
      createdByUserId: userId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      householdId,
      actorUserId: userId,
      action: "household_invite.created",
      entityType: "HouseholdInvite",
      entityId: invite.id,
      after: {
        email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
      },
    },
  });

  return { invite, token };
}

export async function getInvitePreviewForUser(userId: string, token: string) {
  const tokenHash = hashInviteToken(token);
  const invite = await prisma.householdInvite.findUnique({
    where: { tokenHash },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
    return {
      invite: null,
      existingMembership: null,
    };
  }

  const household = await prisma.household.findUnique({
    where: { id: invite.householdId },
  });

  if (!household) {
    return {
      invite: null,
      existingMembership: null,
    };
  }

  const existingMembership = await prisma.householdMembership.findFirst({
    where: {
      householdId: invite.householdId,
      userId,
      status: "ACTIVE",
    },
  });

  return {
    invite: {
      ...invite,
      household,
    },
    existingMembership,
  };
}

export async function acceptInviteForUser(userId: string, input: unknown) {
  const parsed = acceptInviteSchema.safeParse(input);

  if (!parsed.success) {
    throw validationError("Invite token is invalid.", parsed.error.flatten());
  }

  const tokenHash = hashInviteToken(parsed.data.token);
  const invite = await prisma.householdInvite.findUnique({
    where: { tokenHash },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError(404, "INVITE_NOT_FOUND", "Invite code is invalid or expired.");
  }

  return prisma.$transaction(async (tx) => {
    const membership = await tx.householdMembership.upsert({
      where: {
        householdId_userId: {
          householdId: invite.householdId,
          userId,
        },
      },
      update: {
        role: invite.role as Role,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
      create: {
        householdId: invite.householdId,
        userId,
        role: invite.role,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    await tx.householdInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
      },
    });

    await tx.auditEvent.create({
      data: {
        householdId: invite.householdId,
        actorUserId: userId,
        action: "household_invite.accepted",
        entityType: "HouseholdMembership",
        entityId: membership.id,
        after: {
          role: membership.role,
          inviteId: invite.id,
        },
      },
    });

    return { membership };
  });
}
