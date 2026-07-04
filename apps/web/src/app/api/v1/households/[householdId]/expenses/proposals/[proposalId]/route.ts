import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { getExpenseProposalForUser } from "@/server/expenses/service";
import { serializeExpenseProposal } from "@/server/expenses/serializers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; proposalId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, proposalId } = await context.params;
    const proposal = await getExpenseProposalForUser(user.id, householdId, proposalId);

    return NextResponse.json({
      proposal: serializeExpenseProposal(proposal),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
