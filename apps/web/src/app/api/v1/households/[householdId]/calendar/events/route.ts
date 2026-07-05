import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeCalendarEvent } from "@/server/calendar/serializers";
import {
  createCalendarEventForHousehold,
  listCalendarEventsForHousehold,
} from "@/server/calendar/service";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Calendar event input is invalid.");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const result = await listCalendarEventsForHousehold(user.id, householdId, {
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      start: request.nextUrl.searchParams.get("start") ?? undefined,
      end: request.nextUrl.searchParams.get("end") ?? undefined,
      type: request.nextUrl.searchParams.get("type") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      categoryId: request.nextUrl.searchParams.get("categoryId") ?? undefined,
      memberUserId: request.nextUrl.searchParams.get("memberUserId") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });

    return NextResponse.json({
      events: result.items.map(serializeCalendarEvent),
      page: result.page,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "calendar event creation",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/calendar/events`,
      requestBody: body,
      handler: async () => {
        const event = await createCalendarEventForHousehold(user.id, householdId, body);

        return {
          status: 201,
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
