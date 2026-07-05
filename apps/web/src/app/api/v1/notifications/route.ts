import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { listNotificationsForUser } from "@/server/notifications/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const result = await listNotificationsForUser(user.id);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
