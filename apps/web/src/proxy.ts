import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);
const siteGateRealm = "Roompire";

function siteGateCredentials() {
  const username = process.env.ROOMPIRE_SITE_GATE_USERNAME?.trim();
  const password = process.env.ROOMPIRE_SITE_GATE_PASSWORD;

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

function unauthorizedSiteGateResponse() {
  return new NextResponse("Authentication required.", {
    headers: {
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
    return unauthorizedSiteGateResponse();
  }

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return unauthorizedSiteGateResponse();
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (username === credentials.username && password === credentials.password) {
      return null;
    }
  } catch {
    return unauthorizedSiteGateResponse();
  }

  return unauthorizedSiteGateResponse();
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
