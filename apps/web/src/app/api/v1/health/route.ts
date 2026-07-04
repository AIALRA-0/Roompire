import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "unhealthy";

export async function GET() {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok" satisfies HealthStatus,
      checks: {
        database: "ok",
      },
      timestamp,
      durationMs: Date.now() - startedAt,
    });
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy" satisfies HealthStatus,
        checks: {
          database: "error",
        },
        timestamp,
        durationMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
