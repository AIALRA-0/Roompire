import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, validationError } from "@/server/api/errors";
import { ensureUserForDevSession, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { enforceRateLimit, rateLimitSubjectFromRequest } from "@/server/rate-limit/service";

export const dynamic = "force-dynamic";

const devSessionSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(80).optional(),
});

async function readJsonBody(request: NextRequest) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw validationError("Developer session input is invalid.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    const parsed = devSessionSchema.safeParse(body);

    if (!parsed.success) {
      throw validationError("Developer session input is invalid.", parsed.error.flatten());
    }

    await enforceRateLimit({
      scope: "devSession",
      subject: `${rateLimitSubjectFromRequest(request)}:${parsed.data.email}`,
    });

    const user = await ensureUserForDevSession(parsed.data.email, parsed.data.displayName);
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        preferredLocale: user.preferredLocale,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, user.email, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
