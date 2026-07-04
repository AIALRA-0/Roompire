import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";
import { serializeLedgerTransaction } from "@/server/ledger/serializers";
import { reverseLedgerObligationForHousehold } from "@/server/ledger/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; obligationId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Ledger reversal input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, obligationId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "ledger reversal",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/ledger/obligations/${obligationId}/reverse`,
      requestBody: body,
      handler: async () => {
        const transaction = await reverseLedgerObligationForHousehold(
          user.id,
          householdId,
          obligationId,
          body,
        );

        return {
          status: 200,
          body: {
            transaction: serializeLedgerTransaction(transaction),
          },
        };
      },
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
