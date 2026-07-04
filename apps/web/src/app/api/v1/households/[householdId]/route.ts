import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { updateHouseholdForUser } from "@/server/households/service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { householdId } = await context.params;
    const body: unknown = await request.json();
    const household = await updateHouseholdForUser(user.id, householdId, body);

    return NextResponse.json({
      household: {
        id: household.id,
        name: household.name,
        timezone: household.timezone,
        settlementCurrency: household.settlementCurrency,
        defaultLocale: household.defaultLocale,
        fxPolicy: household.fxPolicy,
        approvalPolicy: household.approvalPolicy,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
