import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { requireApiUser } from "@/server/auth/session";
import {
  deletePushSubscriptionForUser,
  getPushSubscriptionSettingsForUser,
  savePushSubscriptionForUser,
} from "@/server/notifications/push";

export const dynamic = "force-dynamic";

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Push subscription input is invalid.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const settings = await getPushSubscriptionSettingsForUser(user.id);

    return NextResponse.json(settings);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await readJsonBody(request);
    const subscription = await savePushSubscriptionForUser(
      user.id,
      body,
      request.headers.get("user-agent"),
    );

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = await readJsonBody(request);
    const result = await deletePushSubscriptionForUser(user.id, body);

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
