import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeTask } from "@/server/calendar/serializers";
import { createTaskForHousehold, listTasksForHousehold } from "@/server/calendar/service";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Task input is invalid.");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const result = await listTasksForHousehold(user.id, householdId, {
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      priority: request.nextUrl.searchParams.get("priority") ?? undefined,
      categoryId: request.nextUrl.searchParams.get("categoryId") ?? undefined,
      assignedUserId: request.nextUrl.searchParams.get("assignedUserId") ?? undefined,
    });

    return NextResponse.json({
      tasks: result.items.map(serializeTask),
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
      "task creation",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/tasks`,
      requestBody: body,
      handler: async () => {
        const task = await createTaskForHousehold(user.id, householdId, body);

        return {
          status: 201,
          body: {
            task: serializeTask(task),
          },
        };
      },
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
