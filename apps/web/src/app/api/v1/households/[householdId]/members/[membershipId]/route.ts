import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  removeMemberFromHousehold,
  updateMemberRoleForHousehold,
} from "@/server/households/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; membershipId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, membershipId } = await context.params;
    const body: unknown = await request.json();
    const membership = await updateMemberRoleForHousehold(user.id, householdId, membershipId, body);

    return NextResponse.json({
      membership: {
        id: membership.id,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        displayName: membership.displayNameOverride ?? membership.user.displayName,
        email: membership.user.email,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId, membershipId } = await context.params;
    const membership = await removeMemberFromHousehold(user.id, householdId, membershipId);

    return NextResponse.json({
      membership: {
        id: membership.id,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        displayName: membership.displayNameOverride ?? membership.user.displayName,
        email: membership.user.email,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
