import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { resolveFileStorageConfig } from "@/server/files/storage-config";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "unhealthy";

export async function GET() {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const checks = {
    database: "ok",
    storage: "ok",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    checks.database = "error";
  }

  try {
    resolveFileStorageConfig();
  } catch {
    checks.storage = "error";
  }

  const status: HealthStatus =
    checks.database === "ok" && checks.storage === "ok" ? "ok" : "unhealthy";

  return NextResponse.json(
    {
      status,
      checks,
      timestamp,
      durationMs: Date.now() - startedAt,
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
