import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { updateNotificationForUser } from "@/server/notifications/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { notificationId } = await context.params;
    const body: unknown = await request.json();
    const notification = await updateNotificationForUser(user.id, notificationId, body);

    return NextResponse.json({ notification });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
