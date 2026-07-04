import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { createHouseholdExportForUser } from "@/server/exports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

async function readJson(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Export input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const body = await readJson(request);
    const householdExport = await createHouseholdExportForUser(user.id, householdId, body);

    return NextResponse.json({ export: householdExport }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
