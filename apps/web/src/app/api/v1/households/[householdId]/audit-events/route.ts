import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { serializeAuditEvent } from "@/server/audit/serializers";
import { listAuditEventsForHousehold } from "@/server/audit/service";
import { requireApiUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const events = await listAuditEventsForHousehold(user.id, householdId);

    return NextResponse.json({
      events: events.map(serializeAuditEvent),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
