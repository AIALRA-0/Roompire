import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { readFileForSignedDownload } from "@/server/files/local-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ householdId: string; fileId: string }>;
};

function attachmentFilename(value: string) {
  return value.replace(/[\r\n"]/g, "") || "download";
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { householdId, fileId } = await context.params;
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const { file, bytes } = await readFileForSignedDownload({
      householdId,
      fileId,
      token,
    });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${attachmentFilename(file.originalFilename)}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
