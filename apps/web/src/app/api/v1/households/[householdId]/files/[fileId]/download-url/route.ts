import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { createDownloadUrlForFile, serializeFile } from "@/server/files/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ householdId: string; fileId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, fileId } = await context.params;
    const { file, downloadUrl, expiresAt } = await createDownloadUrlForFile(
      user.id,
      householdId,
      fileId,
    );

    return NextResponse.json({
      file: serializeFile(file),
      downloadUrl,
      expiresAt,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
