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
    const obligations = await listLedgerObligationsForHousehold(user.id, householdId);

    return NextResponse.json({
      obligations: obligations.map(serializeLedgerObligation),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
