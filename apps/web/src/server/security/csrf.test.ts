import { describe, expect, it } from "vitest";
import { allowedCsrfOrigins, checkCsrfProtection } from "@/server/security/csrf";

function headers(input: Record<string, string> = {}) {
  return new Headers(input);
}

describe("CSRF origin guard", () => {
  it("allows safe methods without origin checks", () => {
    expect(
      checkCsrfProtection({
        headers: headers({ origin: "https://evil.example" }),
        method: "GET",
        requestUrl: "https://roompire.example/api/v1/session",
      }),
    ).toEqual({ allowed: true });
  });

  it("allows non-browser unsafe API clients when browser origin headers are absent", () => {
    expect(
      checkCsrfProtection({
        headers: headers(),
        method: "POST",
        requestUrl: "https://roompire.example/api/v1/households",
      }),
    ).toEqual({ allowed: true });
  });

  it("allows unsafe same-origin browser mutations", () => {
    expect(
      checkCsrfProtection({
        headers: headers({
          origin: "https://roompire.example",
          "sec-fetch-site": "same-origin",
        }),
        method: "PATCH",
        requestUrl: "https://roompire.example/api/v1/session",
      }),
    ).toEqual({ allowed: true });
  });

  it("allows the configured app origin when the request URL is internal", () => {
    expect(
      checkCsrfProtection({
        appUrl: "https://roompire.aialra.online",
        headers: headers({
          origin: "https://roompire.aialra.online",
        }),
        method: "POST",
        requestUrl: "http://127.0.0.1:3000/api/v1/households",
      }),
    ).toEqual({ allowed: true });
  });

  it("derives allowed origins from forwarded host headers", () => {
    expect(
      allowedCsrfOrigins({
        headers: headers({
          "x-forwarded-host": "roompire.aialra.online",
          "x-forwarded-proto": "https",
        }),
        method: "POST",
        requestUrl: "http://127.0.0.1:3000/api/v1/households",
      }),
    ).toContain("https://roompire.aialra.online");
  });

  it("blocks cross-site fetch metadata before route handlers run", () => {
    const decision = checkCsrfProtection({
      headers: headers({
        "sec-fetch-site": "cross-site",
      }),
      method: "POST",
      requestUrl: "https://roompire.example/api/v1/session",
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "CSRF_ORIGIN_MISMATCH",
    });
  });

  it("blocks unsafe requests with a cross-origin Origin header", () => {
    const decision = checkCsrfProtection({
      headers: headers({
        origin: "https://evil.example",
      }),
      method: "DELETE",
      requestUrl: "https://roompire.example/api/v1/households/id/members/id",
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "CSRF_ORIGIN_MISMATCH",
    });
  });

  it("blocks unsafe requests with an opaque Origin header", () => {
    const decision = checkCsrfProtection({
      headers: headers({
        origin: "null",
      }),
      method: "POST",
      requestUrl: "https://roompire.example/api/v1/households",
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "CSRF_ORIGIN_MISMATCH",
    });
  });

  it("blocks unsafe requests with a cross-origin Referer header", () => {
    const decision = checkCsrfProtection({
      headers: headers({
        referer: "https://evil.example/form",
      }),
      method: "POST",
      requestUrl: "https://roompire.example/api/v1/households",
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: "CSRF_ORIGIN_MISMATCH",
    });
  });
});
