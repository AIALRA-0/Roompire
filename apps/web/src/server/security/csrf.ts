const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type HeaderReader = {
  get(name: string): string | null;
};

export type CsrfDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "CSRF_ORIGIN_MISMATCH";
      reason: string;
    };

export type CsrfProtectionInput = {
  method: string;
  requestUrl: string | URL;
  headers: HeaderReader;
  appUrl?: string;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value || value === "null") {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function requestOrigin(input: CsrfProtectionInput) {
  try {
    return new URL(input.requestUrl).origin;
  } catch {
    return null;
  }
}

function forwardedOrigin(input: CsrfProtectionInput) {
  const host =
    firstHeaderValue(input.headers.get("x-forwarded-host")) ??
    firstHeaderValue(input.headers.get("host"));

  if (!host) {
    return null;
  }

  const forwardedProto = firstHeaderValue(input.headers.get("x-forwarded-proto"));
  let protocol = forwardedProto ?? null;

  if (!protocol) {
    try {
      protocol = new URL(input.requestUrl).protocol.replace(/:$/, "");
    } catch {
      protocol = "https";
    }
  }

  return normalizeOrigin(`${protocol}://${host}`);
}

export function allowedCsrfOrigins(input: CsrfProtectionInput) {
  return new Set(
    [requestOrigin(input), forwardedOrigin(input), normalizeOrigin(input.appUrl)]
      .filter((origin): origin is string => Boolean(origin))
      .map((origin) => origin.toLowerCase()),
  );
}

function originMatches(origin: string | null, allowedOrigins: Set<string>) {
  return Boolean(origin && allowedOrigins.has(origin.toLowerCase()));
}

function refererOrigin(headers: HeaderReader) {
  const referer = headers.get("referer");

  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function checkCsrfProtection(input: CsrfProtectionInput): CsrfDecision {
  if (!unsafeMethods.has(input.method.toUpperCase())) {
    return { allowed: true };
  }

  const allowedOrigins = allowedCsrfOrigins(input);
  const secFetchSite = input.headers.get("sec-fetch-site")?.trim().toLowerCase();

  if (secFetchSite === "cross-site") {
    return {
      allowed: false,
      code: "CSRF_ORIGIN_MISMATCH",
      reason: "sec-fetch-site=cross-site",
    };
  }

  const originHeader = input.headers.get("origin");

  if (originHeader !== null) {
    const origin = normalizeOrigin(originHeader);

    return originMatches(origin, allowedOrigins)
      ? { allowed: true }
      : {
          allowed: false,
          code: "CSRF_ORIGIN_MISMATCH",
          reason: "origin mismatch",
        };
  }

  const referer = refererOrigin(input.headers);

  if (referer !== null) {
    return originMatches(referer, allowedOrigins)
      ? { allowed: true }
      : {
          allowed: false,
          code: "CSRF_ORIGIN_MISMATCH",
          reason: "referer mismatch",
        };
  }

  return { allowed: true };
}
