import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  ACTIVE_HOUSEHOLD_COOKIE_NAME,
  activeHouseholdCookieOptions,
} from "@/server/households/active-household";
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
        defaultLocale: membership.household.defaultLocale,
        fxPolicy: membership.household.fxPolicy,
        approvalPolicy: membership.household.approvalPolicy,
        clearingPolicy: membership.household.clearingPolicy,
        operationalRetentionDays: membership.household.operationalRetentionDays,
        attachmentRetentionDays: membership.household.attachmentRetentionDays,
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

    const response = NextResponse.json(
      {
        household: {
          id: household.id,
          name: household.name,
          timezone: household.timezone,
          settlementCurrency: household.settlementCurrency,
          defaultLocale: household.defaultLocale,
          fxPolicy: household.fxPolicy,
          approvalPolicy: household.approvalPolicy,
          clearingPolicy: household.clearingPolicy,
          operationalRetentionDays: household.operationalRetentionDays,
          attachmentRetentionDays: household.attachmentRetentionDays,
          role: membership.role,
        },
      },
      { status: 201 },
    );

    response.cookies.set(
      ACTIVE_HOUSEHOLD_COOKIE_NAME,
      household.id,
      activeHouseholdCookieOptions(),
    );

    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
