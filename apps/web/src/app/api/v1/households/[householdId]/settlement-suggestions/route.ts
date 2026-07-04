import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { serializeSettlementSuggestion } from "@/server/ledger/serializers";
import { listSettlementSuggestionsForHousehold } from "@/server/ledger/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const suggestions = await listSettlementSuggestionsForHousehold(user.id, householdId);

    return NextResponse.json({
      suggestions: suggestions.map(serializeSettlementSuggestion),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
