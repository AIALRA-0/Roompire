import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";
import { serializeLedgerTransaction } from "@/server/ledger/serializers";
import { createLedgerAdjustmentForHousehold } from "@/server/ledger/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Ledger adjustment input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "ledger adjustment",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/ledger/adjustments`,
      requestBody: body,
      handler: async () => {
        const transaction = await createLedgerAdjustmentForHousehold(user.id, householdId, body);

        return {
          status: 201,
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
