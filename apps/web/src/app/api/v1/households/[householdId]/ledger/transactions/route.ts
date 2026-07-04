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
    const transactions = await listLedgerTransactionsForHousehold(user.id, householdId);

    return NextResponse.json({
      transactions: transactions.map(serializeLedgerTransaction),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
