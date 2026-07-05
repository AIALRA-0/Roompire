import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { listHouseholdsForUser } from "@/server/households/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const memberships = await listHouseholdsForUser(user.id);
    const activeMembership = memberships[0] ?? null;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        preferredLocale: user.preferredLocale,
      },
      household: activeMembership
        ? {
            id: activeMembership.household.id,
            name: activeMembership.household.name,
            role: activeMembership.role,
            timezone: activeMembership.household.timezone,
            settlementCurrency: activeMembership.household.settlementCurrency,
            fxPolicy: activeMembership.household.fxPolicy,
            clearingPolicy: activeMembership.household.clearingPolicy,
          }
        : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
