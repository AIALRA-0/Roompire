import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { createFileUploadIntentForHousehold, serializeFile } from "@/server/files/service";
import { enforceRateLimit } from "@/server/rate-limit/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("File upload input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    await enforceRateLimit({
      householdId,
      scope: "filePresign",
      subject: user.id,
    });
    const body = await readJsonBody(request);
    const file = await createFileUploadIntentForHousehold(user.id, householdId, body);

    return NextResponse.json(
      {
        file: serializeFile(file),
        upload: {
          fileId: file.id,
          method: "PUT",
          uploadUrl: `/api/v1/households/${householdId}/files/${file.id}/upload`,
          headers: {
            "Content-Type": file.mimeType,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
