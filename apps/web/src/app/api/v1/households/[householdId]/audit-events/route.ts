import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { serializeAuditEvent, serializeAuditHashChain } from "@/server/audit/serializers";
import {
  listAuditEventsForHousehold,
  verifyAuditHashChainForHousehold,
} from "@/server/audit/service";
import { requireApiUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const [result, chain] = await Promise.all([
      listAuditEventsForHousehold(
        user.id,
        householdId,
        Object.fromEntries(request.nextUrl.searchParams),
      ),
      verifyAuditHashChainForHousehold(user.id, householdId),
    ]);

    return NextResponse.json({
      events: result.items.map(serializeAuditEvent),
      chain: serializeAuditHashChain(chain),
      page: result.page,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
