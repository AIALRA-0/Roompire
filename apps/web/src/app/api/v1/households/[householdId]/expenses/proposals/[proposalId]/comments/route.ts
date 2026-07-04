import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { createExpenseProposalCommentForHousehold } from "@/server/expenses/service";
import { serializeExpenseProposal } from "@/server/expenses/serializers";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; proposalId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Expense proposal comment input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, proposalId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "proposal comment creation",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/expenses/proposals/${proposalId}/comments`,
      requestBody: body,
      handler: async () => {
        const proposal = await createExpenseProposalCommentForHousehold(
          user.id,
          householdId,
          proposalId,
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
