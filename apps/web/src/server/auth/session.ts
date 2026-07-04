import type { User } from "@prisma/client";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";
import { resolveSiteGateSessionEmailFromAuthorization } from "./site-gate";

export const SESSION_COOKIE_NAME = "roompire_session";
const defaultDevEmail = "alice@example.test";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "Roommate";
  const words = localPart.split(/[._-]+/).filter(Boolean);
  const displayName = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

  return displayName || "Roommate";
}

export function isDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ROOMPIRE_ENABLE_DEV_AUTH === "true";
}

export async function ensureUserForDevSession(email: string, displayName?: string) {
  if (!isDevAuthEnabled()) {
    throw new ApiError(403, "DEV_AUTH_DISABLED", "Developer session switching is disabled.");
  }

  const normalizedEmail = normalizeEmail(email);

  return prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      displayName: displayName?.trim() || displayNameFromEmail(normalizedEmail),
    },
    create: {
      email: normalizedEmail,
      displayName: displayName?.trim() || displayNameFromEmail(normalizedEmail),
      preferredLocale: "en-US",
    },
  });
}

type SessionIdentity = {
  email: string;
  autoCreateUser: boolean;
};

async function findOrCreateSessionUser(identity: SessionIdentity | null) {
  if (!identity) {
    return null;
  }

  if (identity.autoCreateUser) {
    return prisma.user.upsert({
      where: { email: identity.email },
      update: {},
      create: {
        email: identity.email,
        displayName: displayNameFromEmail(identity.email),
        preferredLocale: "en-US",
      },
    });
  }

  return prisma.user.findUnique({
    where: { email: identity.email },
  });
}

function devSessionIdentityFromRequest(request: NextRequest): SessionIdentity {
  const headerEmail = request.headers.get("x-roompire-dev-user-email");

  if (headerEmail) {
    return { email: normalizeEmail(headerEmail), autoCreateUser: false };
  }

  const cookieEmail = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (cookieEmail) {
    return { email: normalizeEmail(cookieEmail), autoCreateUser: false };
  }

  return {
    email: normalizeEmail(process.env.ROOMPIRE_DEV_SESSION_EMAIL ?? defaultDevEmail),
    autoCreateUser: false,
  };
}

function sessionIdentityFromRequest(request: NextRequest): SessionIdentity | null {
  if (isDevAuthEnabled()) {
    return devSessionIdentityFromRequest(request);
  }

  const siteGateEmail = resolveSiteGateSessionEmailFromAuthorization(
    request.headers.get("authorization"),
  );

  return siteGateEmail ? { email: normalizeEmail(siteGateEmail), autoCreateUser: true } : null;
}

export async function getApiUser(request: NextRequest): Promise<User | null> {
  return findOrCreateSessionUser(sessionIdentityFromRequest(request));
}

export async function requireApiUser(request: NextRequest): Promise<User> {
  const user = await getApiUser(request);

  if (!user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
  }

  return user;
}

export async function getPageUser(): Promise<User | null> {
  if (isDevAuthEnabled()) {
    const cookieStore = await cookies();
    const cookieEmail = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const email = normalizeEmail(
      cookieEmail ?? process.env.ROOMPIRE_DEV_SESSION_EMAIL ?? defaultDevEmail,
    );

    return prisma.user.findUnique({
      where: { email },
    });
  }

  const requestHeaders = await headers();
  const siteGateEmail = resolveSiteGateSessionEmailFromAuthorization(
    requestHeaders.get("authorization"),
  );

  return findOrCreateSessionUser(
    siteGateEmail ? { email: normalizeEmail(siteGateEmail), autoCreateUser: true } : null,
  );
}

export async function requirePageUser(): Promise<User> {
  const user = await getPageUser();

  if (!user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");
  }

  return user;
}
