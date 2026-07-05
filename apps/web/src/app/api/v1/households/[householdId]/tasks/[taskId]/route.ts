import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeTask } from "@/server/calendar/serializers";
import { deleteTaskForHousehold, updateTaskForHousehold } from "@/server/calendar/service";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; taskId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Task input is invalid.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, taskId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "task update",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "PATCH",
      routeKey: `/households/${householdId}/tasks/${taskId}`,
      requestBody: body,
      handler: async () => {
        const task = await updateTaskForHousehold(user.id, householdId, taskId, body);

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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, taskId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "task deletion",
    );
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "DELETE",
      routeKey: `/households/${householdId}/tasks/${taskId}`,
      requestBody: {},
      handler: async () => ({
        status: 200,
        body: await deleteTaskForHousehold(user.id, householdId, taskId),
      }),
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
