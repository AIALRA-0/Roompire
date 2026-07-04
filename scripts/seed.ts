import { createHash } from "node:crypto";
import { ExpenseProposalStatus, FxPolicy, PrismaClient, Role, SplitMethod } from "@prisma/client";
import categoriesSeed from "../seed-data/initial_categories.json";
import sampleSeed from "../seed-data/sample_household.json";

type CategorySeed = {
  key: string;
  nameEn: string;
  nameZhCn: string;
  icon?: string;
  colorToken?: string;
};

type UserSeed = {
  displayName: string;
  email: string;
  role: string;
  preferredLocale: string;
};

const prisma = new PrismaClient();

function toRole(value: string): Role {
  if (value in Role) {
    return Role[value as keyof typeof Role];
  }

  throw new Error(`Unsupported seed role: ${value}`);
}

function toFxPolicy(value: string): FxPolicy {
  if (value in FxPolicy) {
    return FxPolicy[value as keyof typeof FxPolicy];
  }

  throw new Error(`Unsupported seed FX policy: ${value}`);
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const householdSeed = sampleSeed.household;
  const userSeeds = sampleSeed.users as UserSeed[];
  const categorySeeds = categoriesSeed as CategorySeed[];
  const ownerSeed = userSeeds.find((user) => user.role === "OWNER");

  if (!ownerSeed) {
    throw new Error("Sample household must include an OWNER");
  }

  const usersByName = new Map<string, { id: string; role: Role }>();

  for (const userSeed of userSeeds) {
    const role = toRole(userSeed.role);
    const user = await prisma.user.upsert({
      where: { email: userSeed.email },
      update: {
        displayName: userSeed.displayName,
        preferredLocale: userSeed.preferredLocale,
      },
      create: {
        email: userSeed.email,
        displayName: userSeed.displayName,
        preferredLocale: userSeed.preferredLocale,
      },
    });

    usersByName.set(userSeed.displayName, { id: user.id, role });
  }

  const owner = usersByName.get(ownerSeed.displayName);

  if (!owner) {
    throw new Error("Owner was not created");
  }

  const household = await prisma.household.upsert({
    where: { slug: "usc-3b2b" },
    update: {
      name: householdSeed.name,
      timezone: householdSeed.timezone,
      settlementCurrency: householdSeed.settlementCurrency,
      fxPolicy: toFxPolicy(householdSeed.fxPolicy),
    },
    create: {
      name: householdSeed.name,
      slug: "usc-3b2b",
      timezone: householdSeed.timezone,
      settlementCurrency: householdSeed.settlementCurrency,
      fxPolicy: toFxPolicy(householdSeed.fxPolicy),
      createdByUserId: owner.id,
    },
  });

  for (const userSeed of userSeeds) {
    const user = usersByName.get(userSeed.displayName);

    if (!user) {
      throw new Error(`Missing seeded user ${userSeed.displayName}`);
    }

    await prisma.householdMembership.upsert({
      where: {
        householdId_userId: {
          householdId: household.id,
          userId: user.id,
        },
      },
      update: {
        role: user.role,
        status: "ACTIVE",
        joinedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
      create: {
        householdId: household.id,
        userId: user.id,
        role: user.role,
        status: "ACTIVE",
        joinedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
  }

  for (const [index, category] of categorySeeds.entries()) {
    await prisma.expenseCategory.upsert({
      where: {
        householdId_key: {
          householdId: household.id,
          key: category.key,
        },
      },
      update: {
        nameEn: category.nameEn,
        nameZhCn: category.nameZhCn,
        icon: category.icon,
        colorToken: category.colorToken,
        sortOrder: index,
      },
      create: {
        householdId: household.id,
        key: category.key,
        nameEn: category.nameEn,
        nameZhCn: category.nameZhCn,
        icon: category.icon,
        colorToken: category.colorToken,
        sortOrder: index,
      },
    });
  }

  await prisma.fxRate.upsert({
    where: {
      provider_baseCurrency_quoteCurrency_rateDate: {
        provider: "seed-static",
        baseCurrency: "USD",
        quoteCurrency: "CNY",
        rateDate: new Date("2026-07-03T00:00:00.000Z"),
      },
    },
    update: {
      rate: "6.781400000000",
      fetchedAt: new Date("2026-07-03T12:00:00.000Z"),
      sourceMeta: {
        seed: true,
        requestedUse: "offline E2E FX cache for 2026-07-04 weekend expense dates",
      },
    },
    create: {
      provider: "seed-static",
      baseCurrency: "USD",
      quoteCurrency: "CNY",
      rateDate: new Date("2026-07-03T00:00:00.000Z"),
      rate: "6.781400000000",
      fetchedAt: new Date("2026-07-03T12:00:00.000Z"),
      sourceMeta: {
        seed: true,
        requestedUse: "offline E2E FX cache for 2026-07-04 weekend expense dates",
      },
    },
  });

  const groceryCategory = await prisma.expenseCategory.findUnique({
    where: {
      householdId_key: {
        householdId: household.id,
        key: "groceries",
      },
    },
  });

  const existingProposal = await prisma.expenseProposal.findFirst({
    where: {
      householdId: household.id,
      title: sampleSeed.exampleExpense.title,
    },
  });

  const alice = usersByName.get("Alice");
  const bob = usersByName.get("Bob");
  const chen = usersByName.get("Chen");

  if (!existingProposal && alice && bob && chen) {
    const proposal = await prisma.expenseProposal.create({
      data: {
        householdId: household.id,
        createdByUserId: alice.id,
        title: sampleSeed.exampleExpense.title,
        categoryId: groceryCategory?.id,
        expenseDate: new Date("2026-07-01T00:00:00.000Z"),
        dueDate: new Date("2026-07-08T00:00:00.000Z"),
        originalAmount: "120.000000",
        originalCurrency: "USD",
        settlementCurrency: "CNY",
        settlementAmount: "864.000000",
        splitMethod: SplitMethod.EQUAL,
        fxPolicy: FxPolicy.LOCK_AT_EXPENSE_DATE,
        fxRate: "7.200000000000",
        fxRateDate: new Date("2026-07-01T00:00:00.000Z"),
        fxProvider: "seed-static",
        fxLockedAt: new Date("2026-07-01T12:00:00.000Z"),
        status: ExpenseProposalStatus.SUBMITTED,
        payers: {
          create: [
            {
              userId: alice.id,
              amountOriginal: "120.000000",
              amountSettlement: "864.000000",
              isPrimary: true,
            },
          ],
        },
        shares: {
          create: [
            {
              debtorUserId: bob.id,
              creditorUserId: alice.id,
              shareOriginalAmount: "40.000000",
              shareSettlementAmount: "288.000000",
              shareCurrency: "USD",
              settlementCurrency: "CNY",
            },
            {
              debtorUserId: chen.id,
              creditorUserId: alice.id,
              shareOriginalAmount: "40.000000",
              shareSettlementAmount: "288.000000",
              shareCurrency: "USD",
              settlementCurrency: "CNY",
            },
          ],
        },
        comments: {
          create: [
            {
              authorUserId: alice.id,
              body: "Seed proposal for browser and ledger invariant development.",
            },
          ],
        },
      },
    });

    await prisma.auditEvent.create({
      data: {
        householdId: household.id,
        actorUserId: alice.id,
        action: "expense_proposal.seeded",
        entityType: "ExpenseProposal",
        entityId: proposal.id,
        after: {
          status: proposal.status,
          fxPolicy: proposal.fxPolicy,
        },
        metadata: {
          seed: true,
        },
      },
    });
  }

  await prisma.householdInvite.upsert({
    where: { tokenHash: hashToken("roompire-demo-invite") },
    update: {
      role: Role.MEMBER,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    },
    create: {
      householdId: household.id,
      tokenHash: hashToken("roompire-demo-invite"),
      role: Role.MEMBER,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      createdByUserId: owner.id,
    },
  });

  console.log(`Seeded Roompire household ${household.name}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
