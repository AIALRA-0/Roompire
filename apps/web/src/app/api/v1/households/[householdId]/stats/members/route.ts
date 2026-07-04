import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { listMemberStatsForHousehold } from "@/server/stats/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const members = await listMemberStatsForHousehold(
      user.id,
      householdId,
      Object.fromEntries(request.nextUrl.searchParams),
    );

    return NextResponse.json({ members });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
