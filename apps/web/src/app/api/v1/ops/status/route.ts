import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { readOpsStatusForUser } from "@/server/ops/status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const status = await readOpsStatusForUser(user);

    return NextResponse.json({ status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
