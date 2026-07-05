import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";
import { serializeLedgerPeriodClose } from "@/server/ledger/serializers";
import {
  closeLedgerPeriodForHousehold,
  listLedgerPeriodClosesForHousehold,
} from "@/server/ledger/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Ledger period close input is invalid.");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const periodCloses = await listLedgerPeriodClosesForHousehold(user.id, householdId);

    return NextResponse.json({
      periodCloses: periodCloses.map(serializeLedgerPeriodClose),
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
      "ledger period close",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/ledger/period-closes`,
      requestBody: body,
      handler: async () => {
        const periodClose = await closeLedgerPeriodForHousehold(user.id, householdId, body);

        return {
          status: 201,
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
