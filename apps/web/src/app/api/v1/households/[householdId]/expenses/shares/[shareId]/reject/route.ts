import { NextResponse, type NextRequest } from "next/server";
import { ApiError, apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { rejectExpenseShareForHousehold } from "@/server/expenses/service";
import { serializeExpenseProposal } from "@/server/expenses/serializers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; shareId: string }>;
};

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Expense share rejection input is invalid.");
  }
}

function requireIdempotencyKey(request: NextRequest) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  if (!idempotencyKey) {
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key header is required for share decisions.",
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, shareId } = await context.params;
    requireIdempotencyKey(request);

    const body = await readJsonBody(request);
    const proposal = await rejectExpenseShareForHousehold(user.id, householdId, shareId, body);

    return NextResponse.json({
      proposal: serializeExpenseProposal(proposal),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
