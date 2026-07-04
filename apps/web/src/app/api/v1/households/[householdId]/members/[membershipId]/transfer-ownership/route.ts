import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { transferHouseholdOwnership } from "@/server/households/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string; membershipId: string }>;
};

function serializeMembership(
  membership: Awaited<ReturnType<typeof transferHouseholdOwnership>>["nextOwner"],
) {
  return {
    id: membership.id,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    displayName: membership.displayNameOverride ?? membership.user.displayName,
    email: membership.user.email,
  };
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(_request);
    const { householdId, membershipId } = await context.params;
    const result = await transferHouseholdOwnership(user.id, householdId, membershipId);

    return NextResponse.json({
      previousOwner: serializeMembership(result.previousOwner),
      nextOwner: serializeMembership(result.nextOwner),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
