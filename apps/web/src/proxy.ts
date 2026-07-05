import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);
const siteGateRealm = "Roompire";
const siteGateRateLimitWindowMs = 5 * 60 * 1000;
const siteGateRateLimitAttempts = 20;

type SiteGateRateLimitEntry = {
  count: number;
  resetAtMs: number;
};

const globalForSiteGateRateLimit = globalThis as typeof globalThis & {
  __roompireSiteGateFailures?: Map<string, SiteGateRateLimitEntry>;
};

function siteGateFailureStore() {
  if (!globalForSiteGateRateLimit.__roompireSiteGateFailures) {
    globalForSiteGateRateLimit.__roompireSiteGateFailures = new Map();
  }

  return globalForSiteGateRateLimit.__roompireSiteGateFailures;
}

function siteGateCredentials() {
  const username = process.env.ROOMPIRE_SITE_GATE_USERNAME?.trim();
  const password = process.env.ROOMPIRE_SITE_GATE_PASSWORD;

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

function siteGateSubject(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function siteGateRateLimitHeaders(input: {
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds?: number;
}) {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(input.limit),
    "RateLimit-Remaining": String(input.remaining),
    "RateLimit-Reset": String(Math.ceil(input.resetAtMs / 1000)),
  };

  if (input.retryAfterSeconds) {
    headers["Retry-After"] = String(input.retryAfterSeconds);
  }

  return headers;
}

function recordSiteGateFailure(request: NextRequest) {
  const now = Date.now();
  const key = siteGateSubject(request);
  const store = siteGateFailureStore();
  const current = store.get(key);
  const resetAtMs =
    current && current.resetAtMs > now ? current.resetAtMs : now + siteGateRateLimitWindowMs;
  const count = current && current.resetAtMs > now ? current.count + 1 : 1;

  store.set(key, {
    count,
    resetAtMs,
  });

  const retryAfterSeconds = Math.max(Math.ceil((resetAtMs - now) / 1000), 1);

  return {
    blocked: count > siteGateRateLimitAttempts,
    remaining: Math.max(siteGateRateLimitAttempts - count, 0),
    resetAtMs,
    retryAfterSeconds,
  };
}

function unauthorizedSiteGateResponse(request: NextRequest) {
  const rateLimit = recordSiteGateFailure(request);

  if (rateLimit.blocked) {
    return new NextResponse("Too many authentication attempts.", {
      headers: siteGateRateLimitHeaders({
        limit: siteGateRateLimitAttempts,
        remaining: 0,
        resetAtMs: rateLimit.resetAtMs,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }),
      status: 429,
    });
  }

  return new NextResponse("Authentication required.", {
    headers: {
      ...siteGateRateLimitHeaders({
        limit: siteGateRateLimitAttempts,
        remaining: rateLimit.remaining,
        resetAtMs: rateLimit.resetAtMs,
      }),
      "WWW-Authenticate": `Basic realm="${siteGateRealm}", charset="UTF-8"`,
    },
    status: 401,
  });
}

function authorizeSiteGate(request: NextRequest) {
  const credentials = siteGateCredentials();

  if (!credentials) {
    return null;
  }

  const authorization = request.headers.get("authorization");
  const [scheme, encoded] = authorization?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "basic" || !encoded) {
    return unauthorizedSiteGateResponse(request);
  }

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return unauthorizedSiteGateResponse(request);
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (username === credentials.username && password === credentials.password) {
      return null;
    }
  } catch {
    return unauthorizedSiteGateResponse(request);
  }

  return unauthorizedSiteGateResponse(request);
}

export default function proxy(request: NextRequest) {
  const siteGateResponse = authorizeSiteGate(request);

  if (siteGateResponse) {
    return siteGateResponse;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(en-US|zh-CN)/:path*", "/api/v1/:path*"],
};
