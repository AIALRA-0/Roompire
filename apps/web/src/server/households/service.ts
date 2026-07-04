import { createHash, randomBytes } from "node:crypto";
import { FxPolicy, type Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import categoriesSeed from "../../../../../seed-data/initial_categories.json";
import { ApiError, validationError } from "@/server/api/errors";
import { normalizeEmail } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { requireActiveMembership, requireMemberManager } from "@/server/permissions/rbac";

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

export const createInviteSchema = z.object({
  email: z.string().trim().email().optional(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(20),
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
