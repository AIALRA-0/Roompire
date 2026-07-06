import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  ACTIVE_HOUSEHOLD_COOKIE_NAME,
  activeHouseholdCookieOptions,
  selectActiveHouseholdMembership,
} from "@/server/households/active-household";
import { listHouseholdsForUser } from "@/server/households/service";
import { getUserSettings } from "@/server/users/service";

export const dynamic = "force-dynamic";

const updateSessionSchema = z.object({
  activeHouseholdId: z.string().uuid(),
});

function serializeSessionHousehold(
  membership: Awaited<ReturnType<typeof listHouseholdsForUser>>[number] | null,
) {
  return membership
    ? {
        id: membership.household.id,
        name: membership.household.name,
        role: membership.role,
        timezone: membership.household.timezone,
        settlementCurrency: membership.household.settlementCurrency,
        defaultLocale: membership.household.defaultLocale,
        fxPolicy: membership.household.fxPolicy,
        approvalPolicy: membership.household.approvalPolicy,
        clearingPolicy: membership.household.clearingPolicy,
        operationalRetentionDays: membership.household.operationalRetentionDays,
        attachmentRetentionDays: membership.household.attachmentRetentionDays,
      }
    : null;
}

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Session input is invalid.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const [memberships, userSettings] = await Promise.all([
      listHouseholdsForUser(user.id),
      getUserSettings(user.id),
    ]);
    const activeMembership = selectActiveHouseholdMembership(
      memberships,
      request.cookies.get(ACTIVE_HOUSEHOLD_COOKIE_NAME)?.value,
    );

    return NextResponse.json({
      user: userSettings,
      household: serializeSessionHousehold(activeMembership),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await readJsonBody(request);
    const parsed = updateSessionSchema.safeParse(body);

    if (!parsed.success) {
      throw validationError("Session input is invalid.", parsed.error.flatten());
    }

    const [memberships, userSettings] = await Promise.all([
      listHouseholdsForUser(user.id),
      getUserSettings(user.id),
    ]);
    const activeMembership = memberships.find(
      (membership) => membership.householdId === parsed.data.activeHouseholdId,
    );

    if (!activeMembership) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found.");
    }

    const response = NextResponse.json({
      user: userSettings,
      household: serializeSessionHousehold(activeMembership),
    });

    response.cookies.set(
      ACTIVE_HOUSEHOLD_COOKIE_NAME,
      activeMembership.householdId,
      activeHouseholdCookieOptions(),
    );

    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
