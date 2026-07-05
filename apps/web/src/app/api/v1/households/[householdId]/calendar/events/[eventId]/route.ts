import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeCalendarEvent } from "@/server/calendar/serializers";
import {
  deleteCalendarEventForHousehold,
  updateCalendarEventForHousehold,
} from "@/server/calendar/service";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; eventId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Calendar event input is invalid.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, eventId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "calendar event update",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "PATCH",
      routeKey: `/households/${householdId}/calendar/events/${eventId}`,
      requestBody: body,
      handler: async () => {
        const event = await updateCalendarEventForHousehold(user.id, householdId, eventId, body);

        return {
          status: 200,
          body: {
            event: serializeCalendarEvent(event),
          },
        };
      },
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, eventId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "calendar event deletion",
    );
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "DELETE",
      routeKey: `/households/${householdId}/calendar/events/${eventId}`,
      requestBody: {},
      handler: async () => ({
        status: 200,
        body: await deleteCalendarEventForHousehold(user.id, householdId, eventId),
      }),
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
