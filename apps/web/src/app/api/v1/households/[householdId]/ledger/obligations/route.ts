import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeLedgerObligation } from "@/server/ledger/serializers";
import { listLedgerObligationsForHousehold } from "@/server/ledger/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const result = await listLedgerObligationsForHousehold(user.id, householdId, {
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
    });

    return NextResponse.json({
      obligations: result.items.map(serializeLedgerObligation),
      page: result.page,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
