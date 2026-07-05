import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";
import { serializeLedgerPeriodClose } from "@/server/ledger/serializers";
import { reopenLedgerPeriodForHousehold } from "@/server/ledger/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; periodCloseId: string }>;
};

async function readJsonBodyOrEmpty(request: NextRequest) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw validationError("Ledger period reopen input is invalid.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, periodCloseId } = await context.params;
    const idempotencyKey = requireIdempotencyKey(
      request.headers.get("idempotency-key"),
      "ledger period reopen",
    );
    const body = await readJsonBodyOrEmpty(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/ledger/period-closes/${periodCloseId}/reopen`,
      requestBody: body,
      handler: async () => {
        const periodClose = await reopenLedgerPeriodForHousehold(
          user.id,
          householdId,
          periodCloseId,
        );

        return {
          status: 200,
          body: {
            periodClose: serializeLedgerPeriodClose(periodClose),
          },
        };
      },
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
