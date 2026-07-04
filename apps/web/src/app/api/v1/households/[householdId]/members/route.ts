import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { listMembersForHousehold } from "@/server/households/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const members = await listMembersForHousehold(user.id, householdId);

    return NextResponse.json({
      members: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        displayName: member.displayNameOverride ?? member.user.displayName,
        email: member.user.email,
        preferredLocale: member.user.preferredLocale,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
