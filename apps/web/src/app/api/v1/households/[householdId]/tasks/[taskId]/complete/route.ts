import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeTask } from "@/server/calendar/serializers";
import { completeTaskForHousehold } from "@/server/calendar/service";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; taskId: string }>;
};

async function readOptionalJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, taskId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "task completion",
    );
    const body = await readOptionalJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/tasks/${taskId}/complete`,
      requestBody: body,
      handler: async () => {
        const task = await completeTaskForHousehold(user.id, householdId, taskId, body);

        return {
          status: 200,
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
