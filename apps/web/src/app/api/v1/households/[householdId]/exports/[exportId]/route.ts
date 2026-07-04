import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { createHouseholdExportDownload } from "@/server/exports/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ householdId: string; exportId: string }>;
};

function attachmentFilename(value: string) {
  return value.replace(/[^\w.\-]+/g, "-");
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, exportId } = await context.params;
    const download = await createHouseholdExportDownload(user.id, householdId, exportId);

    return new NextResponse(download.body, {
      headers: {
        "Content-Disposition": `attachment; filename="${attachmentFilename(download.filename)}"`,
        "Content-Type": download.contentType,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
