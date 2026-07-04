import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";
import { serializeSettlement } from "@/server/settlements/serializers";
import { rejectSettlementForHousehold } from "@/server/settlements/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; settlementId: string }>;
};

async function readJsonBodyOrEmpty(request: NextRequest) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw validationError("Settlement rejection input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, settlementId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "settlement rejection",
    );
    const body = await readJsonBodyOrEmpty(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/settlements/${settlementId}/reject`,
      requestBody: body,
      handler: async () => {
        const settlement = await rejectSettlementForHousehold(user.id, householdId, settlementId);

        return {
          status: 200,
          body: {
            settlement: serializeSettlement(settlement),
          },
        };
      },
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
