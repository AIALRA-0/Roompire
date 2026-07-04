import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { createHouseholdForUser, listHouseholdsForUser } from "@/server/households/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const memberships = await listHouseholdsForUser(user.id);

    return NextResponse.json({
      households: memberships.map((membership) => ({
        id: membership.household.id,
        name: membership.household.name,
        timezone: membership.household.timezone,
        settlementCurrency: membership.household.settlementCurrency,
        fxPolicy: membership.household.fxPolicy,
        role: membership.role,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body: unknown = await request.json();
    const { household, membership } = await createHouseholdForUser(user.id, body);

    return NextResponse.json(
      {
        household: {
          id: household.id,
          name: household.name,
          timezone: household.timezone,
          settlementCurrency: household.settlementCurrency,
          fxPolicy: household.fxPolicy,
          role: membership.role,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
