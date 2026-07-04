import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeFile } from "@/server/files/service";
import { storeFileUploadForHousehold } from "@/server/files/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ householdId: string; fileId: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, fileId } = await context.params;
    const file = await storeFileUploadForHousehold(user.id, householdId, fileId, request);

    return NextResponse.json({
      file: serializeFile(file),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
