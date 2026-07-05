import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { resolveExportSigningSecret } from "@/server/exports/service";
import { resolveFileStorageConfig } from "@/server/files/storage-config";
import { resolveConfiguredFxProvider } from "@/server/fx/rates";
import { resolveWebPushConfig } from "@/server/notifications/push";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "unhealthy";

export async function GET() {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const checks = {
    database: "ok",
    exports: "ok",
    fx: "ok",
    storage: "ok",
    webPush: "disabled",
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

  try {
    resolveExportSigningSecret();
  } catch {
    checks.exports = "error";
  }

  try {
    resolveConfiguredFxProvider();
  } catch {
    checks.fx = "error";
  }

  try {
    checks.webPush = resolveWebPushConfig() ? "ok" : "disabled";
  } catch {
    checks.webPush = "error";
  }

  const status: HealthStatus =
    checks.database === "ok" &&
    checks.storage === "ok" &&
    checks.fx === "ok" &&
    checks.exports === "ok" &&
    checks.webPush !== "error"
      ? "ok"
      : "unhealthy";

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
