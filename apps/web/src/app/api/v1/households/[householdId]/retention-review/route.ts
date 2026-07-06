import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { getRetentionReviewForHousehold } from "@/server/households/retention";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const review = await getRetentionReviewForHousehold(user.id, householdId);

    return NextResponse.json({ retentionReview: review });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
