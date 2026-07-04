import { NextResponse, type NextRequest } from "next/server";
import { ApiError, apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  createExpenseProposalForHousehold,
  listExpenseProposalsForHousehold,
} from "@/server/expenses/service";
import { serializeExpenseProposal } from "@/server/expenses/serializers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const proposals = await listExpenseProposalsForHousehold(user.id, householdId, { status });

    return NextResponse.json({
      proposals: proposals.map(serializeExpenseProposal),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    if (!idempotencyKey) {
      throw new ApiError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required for proposal creation.",
      );
    }

    const body: unknown = await request.json();
    const proposal = await createExpenseProposalForHousehold(user.id, householdId, body);

    return NextResponse.json(
      {
        proposal: serializeExpenseProposal(proposal),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
