import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeExpenseProposal } from "@/server/expenses/serializers";
import { createExpenseProposalFromCalendarEventForHousehold } from "@/server/expenses/service";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; eventId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Calendar event expense proposal input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, eventId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "calendar event expense proposal creation",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/calendar/events/${eventId}/create-expense-proposal`,
      requestBody: body,
      handler: async () => {
        const proposal = await createExpenseProposalFromCalendarEventForHousehold(
          user.id,
          householdId,
          eventId,
          body,
        );

        return {
          status: 201,
          body: {
            proposal: serializeExpenseProposal(proposal),
          },
        };
      },
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
