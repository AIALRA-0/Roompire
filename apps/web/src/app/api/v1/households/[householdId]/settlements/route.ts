import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { requireIdempotencyKey, runIdempotentMutation } from "@/server/idempotency/service";
import { serializeSettlement } from "@/server/settlements/serializers";
import {
  createSettlementForHousehold,
  listSettlementsForHousehold,
} from "@/server/settlements/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Settlement input is invalid.");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const result = await listSettlementsForHousehold(user.id, householdId, {
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
    });

    return NextResponse.json({
      settlements: result.items.map(serializeSettlement),
      page: result.page,
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
      "settlement submission",
    );
    const body = await readJsonBody(request);
    const response = await runIdempotentMutation({
      key: idempotencyKey,
      userId: user.id,
      householdId,
      method: "POST",
      routeKey: `/households/${householdId}/settlements`,
      requestBody: body,
      handler: async () => {
        const settlement = await createSettlementForHousehold(user.id, householdId, body);

        return {
          status: 201,
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
