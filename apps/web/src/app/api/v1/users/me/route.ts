import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import { getUserSettings, updateCurrentUser } from "@/server/users/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const settings = await getUserSettings(user.id);

    return NextResponse.json({ user: settings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body: unknown = await request.json();
    const settings = await updateCurrentUser(user.id, body);

    return NextResponse.json({ user: settings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
