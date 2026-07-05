import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeLedgerTransaction } from "@/server/ledger/serializers";
import { listLedgerTransactionsForHousehold } from "@/server/ledger/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const result = await listLedgerTransactionsForHousehold(user.id, householdId, {
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });

    return NextResponse.json({
      transactions: result.items.map(serializeLedgerTransaction),
      page: result.page,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
