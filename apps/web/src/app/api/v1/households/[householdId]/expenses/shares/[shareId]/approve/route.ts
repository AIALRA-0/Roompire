import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { approveExpenseShareForHousehold } from "@/server/expenses/service";
import { serializeExpenseProposal } from "@/server/expenses/serializers";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";
import { enforceRateLimit } from "@/server/rate-limit/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; shareId: string }>;
};

async function readJsonBodyOrEmpty(request: NextRequest) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw validationError("Expense share approval input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, shareId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "share decisions",
    );
    await enforceRateLimit({
      householdId,
      scope: "shareDecision",
      subject: user.id,
    });
    const body = await readJsonBodyOrEmpty(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/expenses/shares/${shareId}/approve`,
      requestBody: body,
      handler: async () => {
        const proposal = await approveExpenseShareForHousehold(user.id, householdId, shareId, body);

        return {
          status: 200,
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
