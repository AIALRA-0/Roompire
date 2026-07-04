import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { acceptInviteForUser } from "@/server/households/service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body: unknown = await request.json();
    const { membership } = await acceptInviteForUser(user.id, body);

    return NextResponse.json({
      membership: {
        id: membership.id,
        householdId: membership.householdId,
        role: membership.role,
        status: membership.status,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
