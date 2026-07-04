import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
  process.env.DATABASE_URL = "postgresql://roompire:roompire@localhost:5432/roompire_dev";
}

const globalForPrisma = globalThis as unknown as {
  roompirePrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.roompirePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.roompirePrisma = prisma;
}
